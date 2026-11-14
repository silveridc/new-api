package system_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

type OIDCSettings struct {
	Enabled bool `json:"enabled"`
	// RegisterEnabled 控制是否允许通过 OIDC 自动注册新账号；
	// 缺省 true 保持历史行为，已绑定账号的登录不受影响。
	RegisterEnabled       bool   `json:"register_enabled"`
	DisplayName           string `json:"display_name"`
	ClientId              string `json:"client_id"`
	ClientSecret          string `json:"client_secret"`
	WellKnown             string `json:"well_known"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserInfoEndpoint      string `json:"user_info_endpoint"`
}

// 默认配置
var defaultOIDCSettings = OIDCSettings{RegisterEnabled: true}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("oidc", &defaultOIDCSettings)
}

func GetOIDCSettings() *OIDCSettings {
	return &defaultOIDCSettings
}

// GetEffectiveDisplayName returns the admin-configured display name, or the
// literal "OIDC" when none has been set. Centralizing this fallback keeps the
// default in one place for both the OAuth provider name and the public
// status payload.
func (s *OIDCSettings) GetEffectiveDisplayName() string {
	if trimmed := strings.TrimSpace(s.DisplayName); trimmed != "" {
		return trimmed
	}
	return "OIDC"
}
