package model

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 消费与错误日志必须把客户端 User-Agent 写入 other.user_agent（public 作用域），
// 普通用户查询自身日志时同样可见；未传 Other 时也要能落库。
func TestRecordConsumeAndErrorLogStoreUserAgent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	c.Request.Header.Set("User-Agent", "unit-test-agent/1.0")

	user := &User{Username: "ua-user", Password: "x", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "ua-aff"}
	require.NoError(t, DB.Create(user).Error)
	t.Cleanup(func() { DB.Unscoped().Delete(user) })

	RecordConsumeLog(c, user.Id, RecordConsumeLogParams{
		ChannelId:      1,
		ModelName:      "gpt-test",
		TokenName:      "tok",
		Quota:          1,
		TokenId:        1,
		UseTimeSeconds: 1,
		Group:          "default",
	})
	var consume Log
	require.NoError(t, DB.Where("user_id = ?", user.Id).Order("id desc").First(&consume).Error)
	var consumeOther map[string]any
	require.NoError(t, common.UnmarshalJsonStr(consume.Other, &consumeOther))
	assert.Equal(t, "unit-test-agent/1.0", consumeOther["user_agent"])
	assert.Contains(t, formatLogOtherJSON(consume.Other, logOtherVisibilityUser), "unit-test-agent/1.0")

	RecordErrorLog(c, user.Id, 1, "gpt-test", "tok", "boom", 1, 1, false, "default", nil)
	var errMsg Log
	require.NoError(t, DB.Where("user_id = ? AND type = ?", user.Id, LogTypeError).Order("id desc").First(&errMsg).Error)
	var errOther map[string]any
	require.NoError(t, common.UnmarshalJsonStr(errMsg.Other, &errOther))
	assert.Equal(t, "unit-test-agent/1.0", errOther["user_agent"])
}
