package middleware

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func abortWithOpenAiMessage(c *gin.Context, statusCode int, message string, code ...types.ErrorCode) {
	codeStr := ""
	if len(code) > 0 {
		codeStr = string(code[0])
	}
	userId := c.GetInt("id")
	_, preparedPluginRoute := c.Get(pluginruntime.ContextKeyRouteRequest)
	if !preparedPluginRoute || !RespondTaskPluginError(c, &dto.TaskError{
		Code:       codeStr,
		Message:    message,
		StatusCode: statusCode,
	}) {
		c.JSON(statusCode, gin.H{
			"error": gin.H{
				"message": common.MessageWithRequestId(message, c.GetString(common.RequestIdKey)),
				"type":    "new_api_error",
				"code":    codeStr,
			},
		})
	}
	// 记录 PreRelay 拒绝：鉴权/分发/限流/任务插件等中间件在到达上游渠道前
	// 就拒绝的请求，过去只写服务端日志，用户与管理员在「错误日志」页看不到。
	recordPreRelayRejection(c, statusCode, message, codeStr)
	c.Abort()
	logger.LogError(c.Request.Context(), common.LogText("user %d | %s", userId, message))
}

// recordPreRelayRejection 把一次中间件拒绝落成 relay 错误日志。仅在
// ERROR_LOG_ENABLED 打开、请求属于 relay 路由、且尚未记录过错误日志时写入；
// message 已是面向调用方的最终文案，原样落库（不再二次翻译）。
func recordPreRelayRejection(c *gin.Context, statusCode int, message string, codeStr string) {
	if !constant.ErrorLogEnabled {
		return
	}
	err := types.NewErrorWithStatusCode(
		common.NewMessage(message),
		types.ErrorCode(codeStr),
		statusCode,
		types.ErrOptionWithSkipRetry(),
	)
	service.RecordRelayRejection(c, statusCode, err)
}

// invalidRequestStatus is the status of a request whose body could not be
// read or parsed: 413 when the body exceeds MAX_REQUEST_BODY_MB, else 400.
func invalidRequestStatus(err error) int {
	if common.IsRequestBodyTooLargeError(err) {
		return http.StatusRequestEntityTooLarge
	}
	return http.StatusBadRequest
}

func abortWithMidjourneyMessage(c *gin.Context, statusCode int, code int, description string) {
	c.JSON(statusCode, gin.H{
		"description": description,
		"type":        "new_api_error",
		"code":        code,
	})
	c.Abort()
	logger.LogError(c.Request.Context(), description)
}
