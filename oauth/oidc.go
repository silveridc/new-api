package oauth

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

func init() {
	Register("oidc", &OIDCProvider{})
}

// OIDCProvider implements OAuth for OIDC
type OIDCProvider struct{}

type oidcOAuthResponse struct {
	AccessToken      string `json:"access_token"`
	IDToken          string `json:"id_token"`
	RefreshToken     string `json:"refresh_token"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int    `json:"expires_in"`
	Scope            string `json:"scope"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type oidcUser struct {
	OpenID            string `json:"sub"`
	Email             string `json:"email"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
	Picture           string `json:"picture"`
}

func (p *OIDCProvider) GetName() string {
	return system_setting.GetOIDCSettings().GetEffectiveDisplayName()
}

func (p *OIDCProvider) IsEnabled() bool {
	return system_setting.GetOIDCSettings().Enabled
}

// oidcBodyPreview 限制写进日志的响应长度：IdP 出错时可能返回整页 HTML。
func oidcBodyPreview(body []byte) string {
	const limit = 512
	if len(body) <= limit {
		return string(body)
	}
	return string(body[:limit]) + "..."
}

// oidcRedirectURI 必须与浏览器构造授权 URL 时用的回调地址逐字一致：授权端点由
// 前端按当前 origin 拼接，换令牌由这里拼接，任何差异（例如 ServerAddress 末尾多
// 一个斜杠）都会被 IdP 以 redirect_uri mismatch 拒绝。
func oidcRedirectURI() string {
	return strings.TrimRight(system_setting.ServerAddress, "/") + "/oauth/oidc"
}

// oidcConfigurationError 点名缺哪一项配置。只填 well_known 时后端并不会解析它，
// 端点仍是空的，这种情况必须给出可定位的提示。
func oidcConfigurationError() error {
	settings := system_setting.GetOIDCSettings()
	for _, item := range []struct {
		field string
		value string
	}{
		{"oidc.client_id", settings.ClientId},
		{"oidc.client_secret", settings.ClientSecret},
		{"oidc.token_endpoint", settings.TokenEndpoint},
		{"oidc.user_info_endpoint", settings.UserInfoEndpoint},
	} {
		if strings.TrimSpace(item.value) == "" {
			return NewOAuthError(common.NewMessage(msgProviderConfigMissing, map[string]any{
				"provider": "OIDC",
				"field":    item.field,
			}))
		}
	}
	redirect, err := url.Parse(oidcRedirectURI())
	if err != nil || redirect.Host == "" || (redirect.Scheme != "https" && redirect.Scheme != "http") {
		return NewOAuthError(common.NewMessage(msgServerAddressInvalid, map[string]any{"provider": "OIDC"}))
	}
	return nil
}

func (p *OIDCProvider) ExchangeToken(ctx context.Context, code string, c *gin.Context) (*OAuthToken, error) {
	if code == "" {
		return nil, NewOAuthError(common.NewMessage(msgInvalidCode))
	}
	if err := oidcConfigurationError(); err != nil {
		return nil, err
	}

	settings := system_setting.GetOIDCSettings()
	redirectUri := oidcRedirectURI()
	values := url.Values{}
	values.Set("client_id", settings.ClientId)
	values.Set("client_secret", settings.ClientSecret)
	values.Set("code", code)
	values.Set("grant_type", "authorization_code")
	values.Set("redirect_uri", redirectUri)

	logger.LogDebug(ctx, "[OAuth-OIDC] ExchangeToken: token_endpoint=%s, redirect_uri=%s", settings.TokenEndpoint, redirectUri)

	req, err := http.NewRequestWithContext(ctx, "POST", settings.TokenEndpoint, strings.NewReader(values.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	client := http.Client{
		Timeout: 5 * time.Second,
	}
	res, err := client.Do(req)
	if err != nil {
		logger.LogError(ctx, common.LogText("[OAuth-OIDC] ExchangeToken error: %s", err.Error()))
		return nil, NewOAuthErrorWithRaw(common.NewMessage(msgConnectFailed, map[string]any{"provider": "OIDC"}), err.Error())
	}
	defer res.Body.Close()

	logger.LogDebug(ctx, "[OAuth-OIDC] ExchangeToken response status: %d", res.StatusCode)

	body, err := io.ReadAll(res.Body)
	if err != nil {
		logger.LogError(ctx, common.LogText("[OAuth-OIDC] ExchangeToken read body error: %s", err.Error()))
		return nil, NewOAuthErrorWithRaw(common.NewMessage(msgConnectFailed, map[string]any{"provider": "OIDC"}), err.Error())
	}

	var oidcResponse oidcOAuthResponse
	if err := common.Unmarshal(body, &oidcResponse); err != nil {
		logger.LogError(ctx, common.LogText("[OAuth-OIDC] ExchangeToken decode error: %s, body=%s", err.Error(), oidcBodyPreview(body)))
		return nil, NewOAuthError(common.NewMessage(msgTokenFailed, map[string]any{"provider": "OIDC"}))
	}

	// IdP 的 error/error_description 是唯一能说清失败原因的信息，吞掉它就只剩"请检查设置"。
	if oidcResponse.Error != "" {
		logger.LogError(ctx, common.LogText("[OAuth-OIDC] ExchangeToken OAuth error: status=%d, error=%s, description=%s, redirect_uri=%s",
			res.StatusCode, oidcResponse.Error, oidcResponse.ErrorDescription, redirectUri))
		return nil, NewOAuthErrorWithRaw(common.NewMessage(msgTokenFailed, map[string]any{"provider": "OIDC"}),
			strings.TrimSpace(oidcResponse.Error+" "+oidcResponse.ErrorDescription))
	}

	if res.StatusCode != http.StatusOK || oidcResponse.AccessToken == "" {
		logger.LogError(ctx, common.LogText("[OAuth-OIDC] ExchangeToken failed: status=%d, empty access token, redirect_uri=%s, body=%s",
			res.StatusCode, redirectUri, oidcBodyPreview(body)))
		return nil, NewOAuthError(common.NewMessage(msgTokenFailed, map[string]any{"provider": "OIDC"}))
	}

	logger.LogDebug(ctx, "[OAuth-OIDC] ExchangeToken success: scope=%s", oidcResponse.Scope)

	return &OAuthToken{
		AccessToken:  oidcResponse.AccessToken,
		TokenType:    oidcResponse.TokenType,
		RefreshToken: oidcResponse.RefreshToken,
		ExpiresIn:    oidcResponse.ExpiresIn,
		Scope:        oidcResponse.Scope,
		IDToken:      oidcResponse.IDToken,
	}, nil
}

func (p *OIDCProvider) GetUserInfo(ctx context.Context, token *OAuthToken) (*OAuthUser, error) {
	settings := system_setting.GetOIDCSettings()

	logger.LogDebug(ctx, "[OAuth-OIDC] GetUserInfo: userinfo_endpoint=%s", settings.UserInfoEndpoint)

	req, err := http.NewRequestWithContext(ctx, "GET", settings.UserInfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)

	client := http.Client{
		Timeout: 5 * time.Second,
	}
	res, err := client.Do(req)
	if err != nil {
		logger.LogError(ctx, common.LogText("[OAuth-OIDC] GetUserInfo error: %s", err.Error()))
		return nil, NewOAuthErrorWithRaw(common.NewMessage(msgConnectFailed, map[string]any{"provider": "OIDC"}), err.Error())
	}
	defer res.Body.Close()

	logger.LogDebug(ctx, "[OAuth-OIDC] GetUserInfo response status: %d", res.StatusCode)

	body, err := io.ReadAll(res.Body)
	if err != nil {
		logger.LogError(ctx, common.LogText("[OAuth-OIDC] GetUserInfo read body error: %s", err.Error()))
		return nil, NewOAuthErrorWithRaw(common.NewMessage(msgConnectFailed, map[string]any{"provider": "OIDC"}), err.Error())
	}

	if res.StatusCode != http.StatusOK {
		logger.LogError(ctx, common.LogText("[OAuth-OIDC] GetUserInfo failed: status=%d, body=%s", res.StatusCode, oidcBodyPreview(body)))
		return nil, NewOAuthError(common.NewMessage(msgGetUserFailed))
	}

	var oidcUser oidcUser
	if err := common.Unmarshal(body, &oidcUser); err != nil {
		logger.LogError(ctx, common.LogText("[OAuth-OIDC] GetUserInfo decode error: %s, body=%s", err.Error(), oidcBodyPreview(body)))
		return nil, NewOAuthError(common.NewMessage(msgGetUserFailed))
	}

	// sub 与 email 都参与建号与绑定，IdP 少给一个就只能报缺哪个，否则无法区分是 scope 没给全还是映射错了。
	if oidcUser.OpenID == "" || oidcUser.Email == "" {
		missing := make([]string, 0, 2)
		if oidcUser.OpenID == "" {
			missing = append(missing, "sub")
		}
		if oidcUser.Email == "" {
			missing = append(missing, "email")
		}
		logger.LogError(ctx, common.LogText("[OAuth-OIDC] GetUserInfo failed: userinfo missing %v, granted scopes=%q", missing, token.Scope))
		return nil, NewOAuthError(common.NewMessage(msgUserInfoEmpty, map[string]any{"provider": "OIDC"}))
	}

	logger.LogDebug(ctx, "[OAuth-OIDC] GetUserInfo success: sub=%s, username=%s, name=%s, email=%s", oidcUser.OpenID, oidcUser.PreferredUsername, oidcUser.Name, oidcUser.Email)

	return &OAuthUser{
		ProviderUserID: oidcUser.OpenID,
		Username:       oidcUser.PreferredUsername,
		DisplayName:    oidcUser.Name,
		Email:          oidcUser.Email,
	}, nil
}

func (p *OIDCProvider) IsUserIDTaken(providerUserID string) bool {
	return model.IsOidcIdAlreadyTaken(providerUserID)
}

func (p *OIDCProvider) FillUserByProviderID(user *model.User, providerUserID string) error {
	user.OidcId = providerUserID
	return user.FillUserByOidcId()
}

func (p *OIDCProvider) SetProviderUserID(user *model.User, providerUserID string) {
	user.OidcId = providerUserID
}

func (p *OIDCProvider) GetProviderPrefix() string {
	return "oidc_"
}

// ProviderUserIDColumn returns the users-table column storing this provider's user ID.
func (p *OIDCProvider) ProviderUserIDColumn() string {
	return "oidc_id"
}
