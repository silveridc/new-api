package model

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 管理员全局开关 RecordIpLogEnabled 开启时，即使用户自身未开启
// record_ip_log，消费日志也必须记录客户端 IP。
func TestRecordConsumeLogGlobalIpOverride(t *testing.T) {
	previous := common.RecordIpLogEnabled
	t.Cleanup(func() { common.RecordIpLogEnabled = previous })

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	c.Request.RemoteAddr = "203.0.113.9:4444"

	user := &User{Username: "ip-override-user", Password: "x", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "ip-override-aff"}
	require.NoError(t, DB.Create(user).Error)
	t.Cleanup(func() { DB.Unscoped().Delete(user) })

	params := RecordConsumeLogParams{
		ChannelId:      1,
		ModelName:      "gpt-test",
		TokenName:      "tok",
		Quota:          10,
		Content:        "test",
		TokenId:        1,
		UseTimeSeconds: 1,
		Group:          "default",
		Other:          NewLogOther(),
	}

	// 全局关闭且用户未开启：不记录 IP
	common.RecordIpLogEnabled = false
	RecordConsumeLog(c, user.Id, params)
	var off Log
	require.NoError(t, DB.Where("user_id = ?", user.Id).Order("id desc").First(&off).Error)
	assert.Empty(t, off.Ip)

	// 全局开启：无视用户设置，记录 IP
	common.RecordIpLogEnabled = true
	RecordConsumeLog(c, user.Id, params)
	var on Log
	require.NoError(t, DB.Where("user_id = ?", user.Id).Order("id desc").First(&on).Error)
	assert.Equal(t, "203.0.113.9", on.Ip)
}
