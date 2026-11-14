package controller

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

const oidcProviderCodeTTL = 5 * time.Minute
const oidcProviderTokenTTL = time.Hour

func oidcIssuer(c *gin.Context) string {
	scheme := "http"
	if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	host := c.Request.Host
	if forwarded := c.GetHeader("X-Forwarded-Host"); forwarded != "" {
		host = forwarded
	}
	return scheme + "://" + strings.TrimSuffix(host, "/")
}

func oidcJSONError(c *gin.Context, status int, code, description string) {
	c.JSON(status, gin.H{"error": code, "error_description": description})
}

func oidcRedirectError(c *gin.Context, redirectURI, state, code, description string) {
	target, err := url.Parse(redirectURI)
	if err != nil {
		oidcJSONError(c, http.StatusBadRequest, code, description)
		return
	}
	query := target.Query()
	query.Set("error", code)
	query.Set("error_description", description)
	if state != "" {
		query.Set("state", state)
	}
	target.RawQuery = query.Encode()
	c.Redirect(http.StatusFound, target.String())
}

func decodeOIDCRedirectURIs(client *model.OIDCProviderClient) []string {
	var uris []string
	if client == nil || common.UnmarshalJsonStr(client.RedirectURIs, &uris) != nil {
		return nil
	}
	return uris
}

// OIDCDiscovery publishes the provider metadata for /.well-known/openid-configuration.
func OIDCDiscovery(c *gin.Context) {
	issuer := oidcIssuer(c)
	c.JSON(http.StatusOK, gin.H{
		"issuer":                                issuer,
		"authorization_endpoint":                issuer + "/oidc/authorize",
		"token_endpoint":                        issuer + "/oidc/token",
		"userinfo_endpoint":                     issuer + "/oidc/userinfo",
		"jwks_uri":                              issuer + "/oidc/jwks",
		"scopes_supported":                      []string{"openid", "profile", "email"},
		"response_types_supported":              []string{"code"},
		"grant_types_supported":                 []string{"authorization_code"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_basic", "client_secret_post", "none"},
		"code_challenge_methods_supported":      []string{"S256"},
		"claims_supported":                      []string{"sub", "iss", "aud", "exp", "iat", "nonce", "preferred_username", "name", "email", "email_verified"},
	})
}

func OIDCJWKS(c *gin.Context) {
	jwk, err := model.OIDCJWK()
	if err != nil {
		oidcJSONError(c, http.StatusInternalServerError, "server_error", "signing key unavailable")
		return
	}
	c.Header("Cache-Control", "public, max-age=3600")
	c.JSON(http.StatusOK, gin.H{"keys": []any{jwk}})
}

// oidcAuthorize validates an authorization request and issues a one-time code.
// It returns the redirect back to the relying party.
func oidcAuthorize(c *gin.Context) (string, *oidcAuthorizeFailure) {
	query := c.Request.URL.Query()
	clientId := strings.TrimSpace(query.Get("client_id"))
	redirectURI := strings.TrimSpace(query.Get("redirect_uri"))
	state := query.Get("state")
	client, err := model.GetOIDCProviderClientByClientID(clientId)
	if err != nil || !client.Enabled {
		return "", &oidcAuthorizeFailure{status: http.StatusBadRequest, code: "invalid_client", description: "unknown or disabled client"}
	}
	if !slicesContains(decodeOIDCRedirectURIs(client), redirectURI) {
		return "", &oidcAuthorizeFailure{status: http.StatusBadRequest, code: "invalid_request", description: "redirect_uri is not registered"}
	}
	fail := func(code, description string) (string, *oidcAuthorizeFailure) {
		return "", &oidcAuthorizeFailure{status: http.StatusBadRequest, code: code, description: description, redirectURI: redirectURI, state: state}
	}
	if query.Get("response_type") != "code" {
		return fail("unsupported_response_type", "only code is supported")
	}
	scope, err := model.NormalizeOIDCScopes(query.Get("scope"))
	if err != nil {
		return fail("invalid_scope", err.Error())
	}
	allowedScopes := strings.Fields(client.Scopes)
	for _, requested := range strings.Fields(scope) {
		if !slicesContains(allowedScopes, requested) {
			return fail("invalid_scope", "scope not allowed for this client")
		}
	}
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		return "", &oidcAuthorizeFailure{status: http.StatusUnauthorized, code: "login_required", description: "sign in to continue", redirectURI: redirectURI, state: state}
	}
	if _, _, err := service.ValidateLoginSession(identity); err != nil {
		return "", &oidcAuthorizeFailure{status: http.StatusUnauthorized, code: "login_required", description: "sign in to continue", redirectURI: redirectURI, state: state}
	}
	codeChallenge := strings.TrimSpace(query.Get("code_challenge"))
	challengeMethod := strings.TrimSpace(query.Get("code_challenge_method"))
	if codeChallenge != "" && challengeMethod != "S256" {
		return fail("invalid_request", "only S256 PKCE is supported")
	}
	if client.Public && codeChallenge == "" {
		return fail("invalid_request", "public clients must use PKCE")
	}
	rawCode, err := randomURLToken(32)
	if err != nil {
		return fail("server_error", "could not create a code")
	}
	code := &model.OIDCProviderCode{
		CodeHash:            sha256Hex(rawCode),
		ClientId:            client.ClientId,
		UserId:              identity.UserID,
		RedirectURI:         redirectURI,
		Scope:               scope,
		Nonce:               query.Get("nonce"),
		CodeChallenge:       codeChallenge,
		CodeChallengeMethod: challengeMethod,
		AuthVersion:         identity.UserAuthVersion,
		ExpiresAt:           time.Now().Add(oidcProviderCodeTTL).Unix(),
	}
	if err := model.CreateOIDCProviderCode(code); err != nil {
		return fail("server_error", "could not store the code")
	}
	target, err := url.Parse(redirectURI)
	if err != nil {
		return "", &oidcAuthorizeFailure{status: http.StatusBadRequest, code: "invalid_request", description: "invalid redirect_uri"}
	}
	params := target.Query()
	params.Set("code", rawCode)
	if state != "" {
		params.Set("state", state)
	}
	target.RawQuery = params.Encode()
	return target.String(), nil
}

type oidcAuthorizeFailure struct {
	status      int
	code        string
	description string
	redirectURI string
	state       string
}

func oidcFailureRedirectURL(failure *oidcAuthorizeFailure) string {
	if failure == nil || failure.redirectURI == "" {
		return ""
	}
	target, err := url.Parse(failure.redirectURI)
	if err != nil {
		return ""
	}
	query := target.Query()
	query.Set("error", failure.code)
	query.Set("error_description", failure.description)
	if failure.state != "" {
		query.Set("state", failure.state)
	}
	target.RawQuery = query.Encode()
	return target.String()
}

// OIDCAuthorizeAPI completes the browser flow started by OIDCAuthorizeBootstrap.
func OIDCAuthorizeAPI(c *gin.Context) {
	target, failure := oidcAuthorize(c)
	if failure != nil {
		data := gin.H{}
		if redirect := oidcFailureRedirectURL(failure); redirect != "" {
			data["redirect"] = redirect
		}
		c.JSON(failure.status, gin.H{"success": false, "message": failure.description, "data": data})
		return
	}
	common.ApiSuccess(c, gin.H{"redirect": target})
}

// The dashboard session cookie is scoped to /api/user/auth and SameSite=Strict,
// so a cross-site navigation cannot read it. This page refreshes the session
// from the same origin, then asks the API for the code redirect.
const oidcAuthorizeBootstrapHTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signing in</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;color:#475569;margin:0}</style>
</head><body><div id="status">Signing in…</div>
<script>
(async function () {
  var status = document.getElementById('status');
  var back = '/login?redirect=' + encodeURIComponent(location.pathname + location.search);
  try {
    var refresh = await fetch('/api/user/auth/refresh', {method: 'POST', credentials: 'same-origin'});
    var bundle = await refresh.json();
    if (!bundle.success || !bundle.data || !bundle.data.access_token) { location.replace(back); return; }
    var response = await fetch('/api/oidc/authorize' + location.search, {headers: {'Authorization': 'Bearer ' + bundle.data.access_token}});
    var result = await response.json();
    if (result.data && result.data.redirect) { location.replace(result.data.redirect); return; }
    status.textContent = result.message || 'Authorization failed';
  } catch (error) { location.replace(back); }
})();
</script></body></html>`

func OIDCAuthorizeBootstrap(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, oidcAuthorizeBootstrapHTML)
}

func OIDCToken(c *gin.Context) {
	if err := c.Request.ParseForm(); err != nil {
		oidcJSONError(c, http.StatusBadRequest, "invalid_request", "malformed form body")
		return
	}
	if c.Request.PostForm.Get("grant_type") != "authorization_code" {
		oidcJSONError(c, http.StatusBadRequest, "unsupported_grant_type", "only authorization_code is supported")
		return
	}
	clientId, clientSecret := c.Request.PostForm.Get("client_id"), c.Request.PostForm.Get("client_secret")
	if basicId, basicSecret, ok := c.Request.BasicAuth(); ok {
		clientId, clientSecret = basicId, basicSecret
	}
	client, err := model.GetOIDCProviderClientByClientID(clientId)
	if err != nil || !client.Enabled {
		oidcJSONError(c, http.StatusUnauthorized, "invalid_client", "unknown or disabled client")
		return
	}
	if !client.Public {
		if subtle.ConstantTimeCompare([]byte(client.ClientSecretHash), []byte(sha256Hex(clientSecret))) != 1 {
			oidcJSONError(c, http.StatusUnauthorized, "invalid_client", "client authentication failed")
			return
		}
	}
	code, err := model.ConsumeOIDCProviderCode(sha256Hex(c.Request.PostForm.Get("code")))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			oidcJSONError(c, http.StatusBadRequest, "invalid_grant", "code is invalid, expired or already used")
			return
		}
		oidcJSONError(c, http.StatusInternalServerError, "server_error", "could not read the code")
		return
	}
	if code.ClientId != client.ClientId || code.RedirectURI != c.Request.PostForm.Get("redirect_uri") {
		oidcJSONError(c, http.StatusBadRequest, "invalid_grant", "code does not match this client or redirect_uri")
		return
	}
	if code.CodeChallenge != "" {
		verifier := c.Request.PostForm.Get("code_verifier")
		if !verifyPKCE(code.CodeChallenge, verifier) {
			oidcJSONError(c, http.StatusBadRequest, "invalid_grant", "PKCE verification failed")
			return
		}
	} else if client.Public {
		oidcJSONError(c, http.StatusBadRequest, "invalid_grant", "public clients must use PKCE")
		return
	}
	state, err := model.GetUserVerificationState(code.UserId)
	if err != nil || state.Status != common.UserStatusEnabled || state.AuthVersion != code.AuthVersion {
		oidcJSONError(c, http.StatusBadRequest, "invalid_grant", "the user session changed after authorization")
		return
	}
	user, err := model.GetUserById(code.UserId, false)
	if err != nil {
		oidcJSONError(c, http.StatusBadRequest, "invalid_grant", "user is unavailable")
		return
	}
	issuer := oidcIssuer(c)
	key, kid, err := model.GetOIDCProviderSigningKey()
	if err != nil {
		oidcJSONError(c, http.StatusInternalServerError, "server_error", "signing key unavailable")
		return
	}
	now := time.Now()
	base := jwt.MapClaims{
		"iss": issuer,
		"sub": strconv.Itoa(user.Id),
		"aud": client.ClientId,
		"iat": now.Unix(),
		"exp": now.Add(oidcProviderTokenTTL).Unix(),
	}
	idClaims := jwt.MapClaims{}
	for claim, value := range base {
		idClaims[claim] = value
	}
	if code.Nonce != "" {
		idClaims["nonce"] = code.Nonce
	}
	for claim, value := range oidcUserClaims(user, code.Scope) {
		idClaims[claim] = value
	}
	idToken, err := signOIDCToken(idClaims, key, kid)
	if err != nil {
		oidcJSONError(c, http.StatusInternalServerError, "server_error", "could not sign the id token")
		return
	}
	accessClaims := jwt.MapClaims{}
	for claim, value := range base {
		accessClaims[claim] = value
	}
	accessClaims["scope"] = code.Scope
	accessClaims["token_use"] = "access"
	accessToken, err := signOIDCToken(accessClaims, key, kid)
	if err != nil {
		oidcJSONError(c, http.StatusInternalServerError, "server_error", "could not sign the access token")
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"access_token": accessToken,
		"token_type":   "Bearer",
		"expires_in":   int(oidcProviderTokenTTL.Seconds()),
		"id_token":     idToken,
		"scope":        code.Scope,
	})
}

func OIDCUserInfo(c *gin.Context) {
	authorization := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(strings.ToLower(authorization), "bearer ") {
		c.Header("WWW-Authenticate", "Bearer")
		oidcJSONError(c, http.StatusUnauthorized, "invalid_token", "missing access token")
		return
	}
	raw := strings.TrimSpace(authorization[len("Bearer "):])
	key, _, err := model.GetOIDCProviderSigningKey()
	if err != nil {
		oidcJSONError(c, http.StatusInternalServerError, "server_error", "signing key unavailable")
		return
	}
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return &key.PublicKey, nil
	}, jwt.WithIssuer(oidcIssuer(c)))
	if err != nil || !token.Valid || claims["token_use"] != "access" {
		c.Header("WWW-Authenticate", "Bearer error=\"invalid_token\"")
		oidcJSONError(c, http.StatusUnauthorized, "invalid_token", "access token is invalid or expired")
		return
	}
	sub, _ := claims["sub"].(string)
	userId, _ := strconv.Atoi(sub)
	user, err := model.GetUserById(userId, false)
	if err != nil || user.Status != common.UserStatusEnabled {
		oidcJSONError(c, http.StatusUnauthorized, "invalid_token", "user is unavailable")
		return
	}
	scope, _ := claims["scope"].(string)
	response := gin.H{"sub": strconv.Itoa(user.Id)}
	for claim, value := range oidcUserClaims(user, scope) {
		response[claim] = value
	}
	c.JSON(http.StatusOK, response)
}

func oidcUserClaims(user *model.User, scope string) map[string]any {
	scopes := strings.Fields(scope)
	claims := map[string]any{}
	if slicesContains(scopes, "profile") {
		claims["preferred_username"] = user.Username
		claims["name"] = user.DisplayName
	}
	if slicesContains(scopes, "email") && user.Email != "" {
		claims["email"] = user.Email
		claims["email_verified"] = false
	}
	return claims
}

func signOIDCToken(claims jwt.MapClaims, key any, kid string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid
	return token.SignedString(key)
}

func verifyPKCE(challenge, verifier string) bool {
	if verifier == "" {
		return false
	}
	sum := sha256.Sum256([]byte(verifier))
	return subtle.ConstantTimeCompare([]byte(challenge), []byte(base64.RawURLEncoding.EncodeToString(sum[:]))) == 1
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func randomURLToken(length int) (string, error) {
	buffer := make([]byte, length)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func slicesContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

// ---- Admin client management ----

type oidcProviderClientResponse struct {
	Id           int      `json:"id"`
	ClientId     string   `json:"client_id"`
	Name         string   `json:"name"`
	RedirectURIs []string `json:"redirect_uris"`
	Scopes       string   `json:"scopes"`
	Public       bool     `json:"public"`
	Enabled      bool     `json:"enabled"`
	CreatedAt    int64    `json:"created_at"`
}

func toOIDCClientResponse(client *model.OIDCProviderClient) oidcProviderClientResponse {
	return oidcProviderClientResponse{
		Id:           client.Id,
		ClientId:     client.ClientId,
		Name:         client.Name,
		RedirectURIs: decodeOIDCRedirectURIs(client),
		Scopes:       client.Scopes,
		Public:       client.Public,
		Enabled:      client.Enabled,
		CreatedAt:    client.CreatedAt,
	}
}

type oidcProviderClientRequest struct {
	Name         string   `json:"name"`
	RedirectURIs []string `json:"redirect_uris"`
	Scopes       string   `json:"scopes"`
	Public       bool     `json:"public"`
	Enabled      *bool    `json:"enabled"`
}

func (request *oidcProviderClientRequest) normalized() (string, string, string, error) {
	name := strings.TrimSpace(request.Name)
	if name == "" || len(name) > 128 {
		return "", "", "", fmt.Errorf("name is required")
	}
	uris, err := model.NormalizeOIDCRedirectURIs(request.RedirectURIs)
	if err != nil {
		return "", "", "", err
	}
	encoded, err := json.Marshal(uris)
	if err != nil {
		return "", "", "", err
	}
	scopes := request.Scopes
	if strings.TrimSpace(scopes) == "" {
		scopes = "openid profile email"
	}
	scopes, err = model.NormalizeOIDCScopes(scopes)
	if err != nil {
		return "", "", "", err
	}
	return name, string(encoded), scopes, nil
}

func ListOIDCProviderClients(c *gin.Context) {
	clients, err := model.ListOIDCProviderClients()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]oidcProviderClientResponse, 0, len(clients))
	for _, client := range clients {
		items = append(items, toOIDCClientResponse(client))
	}
	common.ApiSuccess(c, items)
}

func CreateOIDCProviderClient(c *gin.Context) {
	var request oidcProviderClientRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	name, redirectURIs, scopes, err := request.normalized()
	if err != nil {
		common.ApiErrorT(c, err.Error())
		return
	}
	clientId, err := randomURLToken(18)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	client := &model.OIDCProviderClient{
		ClientId:     "newapi_" + clientId,
		Name:         name,
		RedirectURIs: redirectURIs,
		Scopes:       scopes,
		Public:       request.Public,
		Enabled:      true,
	}
	secret := ""
	if !request.Public {
		secret, err = randomURLToken(32)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		client.ClientSecretHash = sha256Hex(secret)
	}
	if err := model.CreateOIDCProviderClient(client); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "oidc.client_create", map[string]any{"name": name, "client_id": client.ClientId, "public": client.Public})
	data := toOIDCClientResponse(client)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"client": data, "client_secret": secret}})
}

func UpdateOIDCProviderClient(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	client, err := model.GetOIDCProviderClientById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var request oidcProviderClientRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	name, redirectURIs, scopes, err := request.normalized()
	if err != nil {
		common.ApiErrorT(c, err.Error())
		return
	}
	client.Name = name
	client.RedirectURIs = redirectURIs
	client.Scopes = scopes
	client.Public = request.Public
	if request.Enabled != nil {
		client.Enabled = *request.Enabled
	}
	if err := model.UpdateOIDCProviderClient(client); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "oidc.client_update", map[string]any{"name": client.Name, "client_id": client.ClientId})
	common.ApiSuccess(c, toOIDCClientResponse(client))
}

func DeleteOIDCProviderClient(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	client, err := model.GetOIDCProviderClientById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteOIDCProviderClient(id); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "oidc.client_delete", map[string]any{"name": client.Name, "client_id": client.ClientId})
	common.ApiSuccess(c, nil)
}

func ResetOIDCProviderClientSecret(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	client, err := model.GetOIDCProviderClientById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if client.Public {
		common.ApiErrorT(c, "Public clients do not use a secret")
		return
	}
	secret, err := randomURLToken(32)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.SetOIDCProviderClientSecretHash(client.Id, sha256Hex(secret)); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "oidc.client_secret_reset", map[string]any{"name": client.Name, "client_id": client.ClientId})
	common.ApiSuccess(c, gin.H{"client_secret": secret})
}
