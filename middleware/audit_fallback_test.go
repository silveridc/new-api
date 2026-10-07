package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// countAuditByCategory 统计指定类别的审计条数。
func countAuditByCategory(t *testing.T, category string) int64 {
	t.Helper()
	var count int64
	require.NoError(t, model.DB.Model(&model.AuditLog{}).Where("category = ?", category).Count(&count).Error)
	return count
}

// 审计兜底覆盖所有已登录用户的写操作（含普通用户），IP 必须记录。
// PAT 请求本身还会产生一条 access_token 类别的记录（上游既有行为），故按类别断言。
func TestUserAuthAuditFallbackRecordsPlainUserWrite(t *testing.T) {
	setupDashboardAuthMiddlewareTest(t)
	user := createMiddlewarePATUser(t, "audit-fallback-user", "opaque.audit.fallback")

	router := gin.New()
	router.PUT("/api/user/self", UserAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	})
	request := httptest.NewRequest(http.MethodPut, "/api/user/self", nil)
	request.Header.Set("Authorization", "Bearer opaque.audit.fallback")
	request.RemoteAddr = "203.0.113.7:12345"
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	var entries []model.AuditLog
	require.NoError(t, model.DB.Where("category = ?", model.AuditCategoryOperation).Find(&entries).Error)
	require.Len(t, entries, 1, "user write should be audited exactly once")
	entry := entries[0]
	assert.Equal(t, user.Id, entry.UserId)
	assert.Equal(t, "user.self_update", entry.Action)
	assert.Equal(t, "203.0.113.7", entry.Ip)
	assert.Equal(t, http.MethodPut, entry.Method)
	assert.True(t, entry.Success)
	assert.Greater(t, entry.CreatedAt, time.Now().Add(-time.Minute).Unix())
}

// 读请求不产生操作审计兜底记录（access_token 类别为上游 PAT 既有行为，不在此断言）。
func TestUserAuthAuditFallbackSkipsReads(t *testing.T) {
	setupDashboardAuthMiddlewareTest(t)
	createMiddlewarePATUser(t, "audit-read-user", "opaque.audit.read")

	router := gin.New()
	router.GET("/api/user/self", UserAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	})
	request := httptest.NewRequest(http.MethodGet, "/api/user/self", nil)
	request.Header.Set("Authorization", "Bearer opaque.audit.read")
	request.RemoteAddr = "203.0.113.7:12345"
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	assert.Zero(t, countAuditByCategory(t, model.AuditCategoryOperation), "reads must not be audited")
	assert.Zero(t, countAuditByCategory(t, model.AuditCategorySecurity), "reads must not be audited")
}
