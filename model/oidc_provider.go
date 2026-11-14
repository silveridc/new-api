package model

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// OIDCProviderClient is a relying party allowed to sign users in through this
// instance's OIDC provider endpoints.
type OIDCProviderClient struct {
	Id               int    `json:"id" gorm:"primaryKey"`
	ClientId         string `json:"client_id" gorm:"size:64;uniqueIndex"`
	ClientSecretHash string `json:"-" gorm:"size:128"`
	Name             string `json:"name" gorm:"size:128"`
	RedirectURIs     string `json:"redirect_uris" gorm:"type:text"`
	Scopes           string `json:"scopes" gorm:"size:255;default:'openid profile email'"`
	Public           bool   `json:"public"`
	Enabled          bool   `json:"enabled"`
	CreatedAt        int64  `json:"created_at"`
	UpdatedAt        int64  `json:"updated_at"`
}

func (OIDCProviderClient) TableName() string { return "oidc_provider_clients" }

// OIDCProviderCode is a single-use authorization code. Only its hash is stored.
type OIDCProviderCode struct {
	Id                  int    `json:"id" gorm:"primaryKey"`
	CodeHash            string `json:"-" gorm:"size:64;uniqueIndex"`
	ClientId            string `json:"client_id" gorm:"size:64;index"`
	UserId              int    `json:"user_id" gorm:"index"`
	RedirectURI         string `json:"redirect_uri" gorm:"size:512"`
	Scope               string `json:"scope" gorm:"size:255"`
	Nonce               string `json:"nonce" gorm:"size:255"`
	CodeChallenge       string `json:"code_challenge" gorm:"size:128"`
	CodeChallengeMethod string `json:"code_challenge_method" gorm:"size:16"`
	AuthVersion         int64  `json:"auth_version"`
	ExpiresAt           int64  `json:"expires_at" gorm:"index"`
	Used                bool   `json:"used"`
	CreatedAt           int64  `json:"created_at"`
}

func (OIDCProviderCode) TableName() string { return "oidc_provider_codes" }

type OIDCProviderSigningKey struct {
	Id            int    `json:"id" gorm:"primaryKey"`
	PrivateKeyPEM string `json:"-" gorm:"type:text"`
	CreatedAt     int64  `json:"created_at"`
}

func (OIDCProviderSigningKey) TableName() string { return "oidc_provider_keys" }

func ListOIDCProviderClients() ([]*OIDCProviderClient, error) {
	var clients []*OIDCProviderClient
	err := DB.Order("id ASC").Find(&clients).Error
	return clients, err
}

func GetOIDCProviderClientByClientID(clientId string) (*OIDCProviderClient, error) {
	var client OIDCProviderClient
	err := DB.Where("client_id = ?", clientId).First(&client).Error
	return &client, err
}

func GetOIDCProviderClientById(id int) (*OIDCProviderClient, error) {
	var client OIDCProviderClient
	err := DB.Where("id = ?", id).First(&client).Error
	return &client, err
}

func CreateOIDCProviderClient(client *OIDCProviderClient) error {
	now := time.Now().Unix()
	client.CreatedAt, client.UpdatedAt = now, now
	return DB.Create(client).Error
}

func UpdateOIDCProviderClient(client *OIDCProviderClient) error {
	client.UpdatedAt = time.Now().Unix()
	return DB.Model(&OIDCProviderClient{}).Where("id = ?", client.Id).Updates(map[string]any{
		"name":          client.Name,
		"redirect_uris": client.RedirectURIs,
		"scopes":        client.Scopes,
		"public":        client.Public,
		"enabled":       client.Enabled,
		"updated_at":    client.UpdatedAt,
	}).Error
}

func DeleteOIDCProviderClient(id int) error {
	return DB.Delete(&OIDCProviderClient{}, id).Error
}

func SetOIDCProviderClientSecretHash(id int, hash string) error {
	return DB.Model(&OIDCProviderClient{}).Where("id = ?", id).Updates(map[string]any{
		"client_secret_hash": hash,
		"updated_at":         time.Now().Unix(),
	}).Error
}

func CreateOIDCProviderCode(code *OIDCProviderCode) error {
	if code == nil || code.CodeHash == "" {
		return errors.New("empty authorization code")
	}
	code.CreatedAt = time.Now().Unix()
	// Opportunistic cleanup keeps the table small without another task.
	DB.Where("expires_at < ?", code.CreatedAt-3600).Delete(&OIDCProviderCode{})
	return DB.Create(code).Error
}

// ConsumeOIDCProviderCode atomically marks a code used and returns it. A code
// that is missing, expired or already used returns gorm.ErrRecordNotFound.
func ConsumeOIDCProviderCode(codeHash string) (*OIDCProviderCode, error) {
	now := time.Now().Unix()
	var code OIDCProviderCode
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("code_hash = ? AND used = ? AND expires_at > ?", codeHash, false, now).First(&code).Error; err != nil {
			return err
		}
		result := tx.Model(&OIDCProviderCode{}).Where("id = ? AND used = ?", code.Id, false).Update("used", true)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &code, nil
}

var oidcSigningKeyMu sync.Mutex
var oidcSigningKeyCache *rsa.PrivateKey
var oidcSigningKeyID string

// GetOIDCProviderSigningKey returns the persisted RS256 key, generating it on
// first use. The key survives restarts so already-issued tokens stay valid.
func GetOIDCProviderSigningKey() (*rsa.PrivateKey, string, error) {
	oidcSigningKeyMu.Lock()
	defer oidcSigningKeyMu.Unlock()
	if oidcSigningKeyCache != nil {
		return oidcSigningKeyCache, oidcSigningKeyID, nil
	}
	var stored OIDCProviderSigningKey
	err := DB.Order("id ASC").First(&stored).Error
	if err == nil && stored.PrivateKeyPEM != "" {
		block, _ := pem.Decode([]byte(stored.PrivateKeyPEM))
		if block == nil {
			return nil, "", errors.New("invalid OIDC signing key")
		}
		key, parseErr := x509.ParsePKCS1PrivateKey(block.Bytes)
		if parseErr != nil {
			return nil, "", parseErr
		}
		oidcSigningKeyCache = key
		oidcSigningKeyID = oidcKeyID(&key.PublicKey)
		return oidcSigningKeyCache, oidcSigningKeyID, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, "", err
	}
	key, generateErr := rsa.GenerateKey(rand.Reader, 2048)
	if generateErr != nil {
		return nil, "", generateErr
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	record := &OIDCProviderSigningKey{Id: 1, PrivateKeyPEM: string(pemBytes), CreatedAt: time.Now().Unix()}
	if createErr := DB.Create(record).Error; createErr != nil {
		// Another node won the first-use race; use the persisted key instead so
		// every node signs and verifies with the same key.
		var existing OIDCProviderSigningKey
		if reloadErr := DB.First(&existing, 1).Error; reloadErr != nil {
			return nil, "", createErr
		}
		block, _ := pem.Decode([]byte(existing.PrivateKeyPEM))
		if block == nil {
			return nil, "", errors.New("invalid OIDC signing key")
		}
		existingKey, parseErr := x509.ParsePKCS1PrivateKey(block.Bytes)
		if parseErr != nil {
			return nil, "", parseErr
		}
		oidcSigningKeyCache = existingKey
		oidcSigningKeyID = oidcKeyID(&existingKey.PublicKey)
		return oidcSigningKeyCache, oidcSigningKeyID, nil
	}
	oidcSigningKeyCache = key
	oidcSigningKeyID = oidcKeyID(&key.PublicKey)
	return oidcSigningKeyCache, oidcSigningKeyID, nil
}

func oidcKeyID(publicKey *rsa.PublicKey) string {
	der, err := x509.MarshalPKIXPublicKey(publicKey)
	if err != nil {
		return common.GetRandomString(16)
	}
	sum := sha256.Sum256(der)
	return hex.EncodeToString(sum[:8])
}

// OIDCJWK returns the public part of the signing key as a JWK.
func OIDCJWK() (map[string]any, error) {
	key, kid, err := GetOIDCProviderSigningKey()
	if err != nil {
		return nil, err
	}
	e := make([]byte, 0, 4)
	exponent := key.PublicKey.E
	for exponent > 0 {
		e = append([]byte{byte(exponent & 0xff)}, e...)
		exponent >>= 8
	}
	return map[string]any{
		"kty": "RSA",
		"use": "sig",
		"alg": "RS256",
		"kid": kid,
		"n":   base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes()),
		"e":   base64.RawURLEncoding.EncodeToString(e),
	}, nil
}

// NormalizeOIDCRedirectURIs validates and canonicalizes the JSON array stored on
// a client row. Returned values are absolute http(s) URLs without fragments.
func NormalizeOIDCRedirectURIs(uris []string) ([]string, error) {
	if len(uris) == 0 || len(uris) > 10 {
		return nil, fmt.Errorf("between 1 and 10 redirect URIs are required")
	}
	normalized := make([]string, 0, len(uris))
	seen := make(map[string]bool, len(uris))
	for _, raw := range uris {
		uri := strings.TrimSpace(raw)
		if uri == "" || len(uri) > 512 || !(strings.HasPrefix(uri, "https://") || strings.HasPrefix(uri, "http://")) {
			return nil, fmt.Errorf("invalid redirect URI: %s", raw)
		}
		if strings.Contains(uri, "#") || seen[uri] {
			return nil, fmt.Errorf("invalid redirect URI: %s", raw)
		}
		seen[uri] = true
		normalized = append(normalized, uri)
	}
	return normalized, nil
}

func NormalizeOIDCScopes(value string) (string, error) {
	allowed := map[string]bool{"openid": true, "profile": true, "email": true}
	seen := make(map[string]bool)
	scopes := make([]string, 0, 3)
	for _, raw := range strings.Fields(value) {
		scope := strings.ToLower(strings.TrimSpace(raw))
		if !allowed[scope] {
			return "", fmt.Errorf("unsupported scope: %s", raw)
		}
		if !seen[scope] {
			seen[scope] = true
			scopes = append(scopes, scope)
		}
	}
	if !seen["openid"] {
		scopes = append([]string{"openid"}, scopes...)
	}
	return strings.Join(scopes, " "), nil
}
