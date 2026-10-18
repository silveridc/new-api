package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupUserSettingTestDB(t *testing.T) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	originalMainDatabaseType := common.MainDatabaseType()
	originalLogDatabaseType := common.LogDatabaseType()
	originalRedisEnabled := common.RedisEnabled
	t.Cleanup(func() {
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		common.RedisEnabled = originalRedisEnabled
	})
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	originalDB, originalLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() {
		model.DB, model.LOG_DB = originalDB, originalLogDB
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	require.NoError(t, db.AutoMigrate(&model.User{}))
}

// preferences 只包含设置页通知表单不负责、但必须活过保存的字段。
func settingTestUser(t *testing.T, setting dto.UserSetting) int {
	t.Helper()

	user := &model.User{
		Username: "setting-user",
		Password: "test-password",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
	}
	user.SetSetting(setting)
	require.NoError(t, model.DB.Create(user).Error)
	return user.Id
}

func callUpdateUserSetting(t *testing.T, userId int, body string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/user/setting", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("id", userId)
	UpdateUserSetting(c)
	return recorder
}

func reloadUserSetting(t *testing.T, userId int) dto.UserSetting {
	t.Helper()

	user, err := model.GetUserById(userId, true)
	require.NoError(t, err)
	return user.GetSetting()
}

func TestUpdateUserSettingKeepsUnmanagedPreferences(t *testing.T) {
	setupUserSettingTestDB(t)

	userId := settingTestUser(t, dto.UserSetting{
		NotifyType:                       dto.NotifyTypeWebhook,
		QuotaWarningThreshold:            100,
		WebhookUrl:                       "https://example.com/hook",
		WebhookSecret:                    "hook-secret",
		Language:                         "en",
		SidebarModules:                   `{"admin":["models","vendors"]}`,
		BillingPreference:                "subscription",
		UiVariant:                        "next",
		UpstreamModelUpdateNotifyEnabled: true,
	})

	recorder := callUpdateUserSetting(t, userId, `{"notify_type":"email","quota_warning_threshold":20,`+
		`"notification_email":"ops@example.com","accept_unset_model_ratio_model":true,"record_ip_log":true}`)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Contains(t, recorder.Body.String(), `"success":true`)

	saved := reloadUserSetting(t, userId)
	// 设置页不管这些字段，整体覆盖会把它们清零
	assert.Equal(t, "en", saved.Language)
	assert.Equal(t, `{"admin":["models","vendors"]}`, saved.SidebarModules)
	assert.Equal(t, "subscription", saved.BillingPreference)
	assert.Equal(t, "next", saved.UiVariant)
	// 请求未带该字段时沿用已存值（非管理员无权修改）
	assert.True(t, saved.UpstreamModelUpdateNotifyEnabled)
	// 本接口负责的字段按请求更新
	assert.Equal(t, dto.NotifyTypeEmail, saved.NotifyType)
	assert.Equal(t, float64(20), saved.QuotaWarningThreshold)
	assert.Equal(t, "ops@example.com", saved.NotificationEmail)
	assert.True(t, saved.AcceptUnsetRatioModel)
	assert.True(t, saved.RecordIpLog)
	// 切换预警类型仍然要清掉旧渠道参数
	assert.Empty(t, saved.WebhookUrl)
	assert.Empty(t, saved.WebhookSecret)
}

func TestUpdateUserSettingSwitchesToGotifyChannel(t *testing.T) {
	setupUserSettingTestDB(t)

	userId := settingTestUser(t, dto.UserSetting{
		NotifyType:            dto.NotifyTypeBark,
		QuotaWarningThreshold: 50,
		BarkUrl:               "https://bark.example.com/push",
		NotificationEmail:     "old@example.com",
		GotifyPriority:        7,
		Language:              "zh",
	})

	recorder := callUpdateUserSetting(t, userId, `{"notify_type":"gotify","quota_warning_threshold":30,`+
		`"gotify_url":"https://gotify.example.com","gotify_token":"app-token","gotify_priority":99}`)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Contains(t, recorder.Body.String(), `"success":true`)

	saved := reloadUserSetting(t, userId)
	assert.Equal(t, "zh", saved.Language)
	assert.Equal(t, dto.NotifyTypeGotify, saved.NotifyType)
	assert.Equal(t, float64(30), saved.QuotaWarningThreshold)
	assert.Equal(t, "https://gotify.example.com", saved.GotifyUrl)
	assert.Equal(t, "app-token", saved.GotifyToken)
	// 越界优先级回落到默认值 5
	assert.Equal(t, 5, saved.GotifyPriority)
	assert.Empty(t, saved.BarkUrl)
	assert.Empty(t, saved.NotificationEmail)
}

func TestUpdateUserSettingRejectsInvalidTypeWithoutTouchingDB(t *testing.T) {
	setupUserSettingTestDB(t)

	userId := settingTestUser(t, dto.UserSetting{
		NotifyType:            dto.NotifyTypeEmail,
		QuotaWarningThreshold: 40,
		NotificationEmail:     "keep@example.com",
		Language:              "fr",
	})

	recorder := callUpdateUserSetting(t, userId, `{"notify_type":"sms","quota_warning_threshold":10}`)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":false`)

	saved := reloadUserSetting(t, userId)
	assert.Equal(t, dto.NotifyTypeEmail, saved.NotifyType)
	assert.Equal(t, "keep@example.com", saved.NotificationEmail)
	assert.Equal(t, "fr", saved.Language)
}
