package system_setting

import "github.com/QuantumNous/new-api/setting/config"

type DiscordSettings struct {
	Enabled      bool   `json:"enabled"`
	ClientId     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	// RegisterEnabled 控制是否允许通过 Discord 自动注册新账号；
	// 缺省 true 保持历史行为，已绑定账号的登录不受影响。
	RegisterEnabled bool `json:"register_enabled"`
}

// 默认配置
var defaultDiscordSettings = DiscordSettings{RegisterEnabled: true}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("discord", &defaultDiscordSettings)
}

func GetDiscordSettings() *DiscordSettings {
	return &defaultDiscordSettings
}
