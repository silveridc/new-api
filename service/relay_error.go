package service

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

// RelayRouteTagKey 与 middleware.RouteTagKey 同值。这里是字面量而不是引用
// middleware，因为 middleware 已经 import service（relay_error.go 无法反向
// 依赖），重复常量会破坏编译。两处任一处改名时需同步修改。
const RelayRouteTagKey = "route_tag"
const RelayRouteTagValue = "relay"

// DecideRelayRetry is the single retry decision for relay attempts. The reason
// is recorded in the request policy decision events of the log details.
func DecideRelayRetry(c *gin.Context, err *types.NewAPIError, retryTimes int) PolicyDecision {
	if err == nil {
		return PolicyDecision{Action: "stop", Reason: "request_completed", Source: "system"}
	}
	if ShouldSkipRetryAfterChannelAffinityFailure(c) {
		source := RequestPolicy(c).SessionModeSource
		if source == "" {
			source = "session_rule"
		}
		return PolicyDecision{Action: "stop", Reason: "strict_session", Source: source}
	}
	if GetChannelConstraints(c).SuppressesRetry() {
		return PolicyDecision{Action: "stop", Reason: "pinned_channel", Source: "channel_constraint"}
	}
	if types.IsChannelError(err) {
		return PolicyDecision{Action: "retry", Reason: "channel_error", Source: "system"}
	}
	if types.IsSkipRetryError(err) {
		return PolicyDecision{Action: "stop", Reason: "non_retryable_error", Source: "system"}
	}
	if retryTimes <= 0 {
		return PolicyDecision{Action: "stop", Reason: "attempt_budget_exhausted", Source: "global"}
	}
	code := err.StatusCode
	if code >= 200 && code < 300 {
		return PolicyDecision{Action: "stop", Reason: "system_retry_exclusion", Source: "system"}
	}
	if code < 100 || code > 599 {
		return PolicyDecision{Action: "retry", Reason: "unrecognized_status", Source: "system"}
	}
	if operation_setting.IsAlwaysSkipRetryCode(err.GetErrorCode()) || operation_setting.IsAlwaysSkipRetryStatusCode(code) {
		return PolicyDecision{Action: "stop", Reason: "system_retry_exclusion", Source: "system"}
	}
	if operation_setting.ShouldRetryByStatusCode(code) {
		return PolicyDecision{Action: "retry", Reason: "retry_status_matched", Source: "global"}
	}
	return PolicyDecision{Action: "stop", Reason: "status_not_retryable", Source: "global"}
}

func ShouldRetryRelayError(c *gin.Context, openaiErr *types.NewAPIError, retryTimes int) bool {
	return DecideRelayRetry(c, openaiErr, retryTimes).Action == "retry"
}

func ProcessChannelError(c *gin.Context, channelError types.ChannelError, err *types.NewAPIError, relayInfo *relaycommon.RelayInfo) {
	if err == nil {
		return
	}
	logger.LogError(c, common.LogText("channel error (channel #%d, status code: %d): %s", channelError.ChannelId, err.StatusCode, common.LocalLogPreview(err.MaskSensitiveErrorWithStatusCode())))
	if ShouldDisableChannel(err) && channelError.AutoBan {
		reason := err.MaskSensitiveErrorWithStatusCode()
		gopool.Go(func() {
			DisableChannel(channelError, reason)
		})
	}

	if constant.ErrorLogEnabled && types.IsRecordErrorLog(err) {
		userId := c.GetInt("id")
		tokenName := c.GetString("token_name")
		modelName := c.GetString("original_model")
		tokenId := c.GetInt("token_id")
		userGroup := c.GetString("group")
		other := model.NewLogOther()
		if c.Request != nil && c.Request.URL != nil {
			other.SetPublic("request_path", c.Request.URL.Path)
		}
		other.SetPublic("error_type", err.GetErrorType())
		other.SetPublic("error_code", err.GetErrorCode())
		other.SetPublic("status_code", err.StatusCode)
		AppendRelayLogAdminInfo(c, relayInfo, other)
		AppendResponseModelLogInfo(relayInfo, other)
		AppendTaskPluginContextAuditInfo(c, other)
		startTime := common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime)
		if startTime.IsZero() {
			startTime = time.Now()
		}
		useTimeSeconds := int(time.Since(startTime).Seconds())
		model.RecordErrorLog(c, userId, channelError.ChannelId, modelName, tokenName, err.MaskSensitiveErrorWithStatusCode(), tokenId, useTimeSeconds, common.GetContextKeyBool(c, constant.ContextKeyIsStream), userGroup, other)
		// 标记已记录：RecordRelayRejection 的兜底只处理 PreRelay 阶段
		// （未进入渠道尝试）的拒绝，避免同一次失败写两条错误日志。
		common.SetContextKey(c, constant.ContextKeyRelayErrorLogged, true)
	}
}

// RecordRelayRejection 记录 PreRelay 阶段的请求拒绝（鉴权、分发、限流、预扣费
// 等异常在到达上游渠道之前就失败的请求）。这些失败过去只写服务端日志，用户与
// 管理员在「错误日志」页看不到，是「有时请求错误不记录日志」的主要来源。
//
// 与 ProcessChannelError 的分工：后者负责已选定渠道后的上游失败，本条负责此前
// 的本地拒绝；两者都以 ContextKeyRelayErrorLogged 去重，一次失败只落一条。
func RecordRelayRejection(c *gin.Context, statusCode int, err *types.NewAPIError) {
	if c == nil || err == nil {
		return
	}
	if !isRelayRequest(c) || !constant.ErrorLogEnabled || !types.IsRecordErrorLog(err) {
		return
	}
	if common.GetContextKeyBool(c, constant.ContextKeyRelayErrorLogged) {
		return
	}
	// statusCode 由调用方给出真实 HTTP 状态；err 自身多为 NewAPIError 默认的
	// 500，不能代表鉴权/限流等拒绝的真实状态码。
	if statusCode <= 0 {
		statusCode = err.StatusCode
	}
	other := model.NewLogOther()
	if c.Request != nil && c.Request.URL != nil {
		other.SetPublic("request_path", c.Request.URL.Path)
	}
	other.SetPublic("error_type", err.GetErrorType())
	other.SetPublic("error_code", err.GetErrorCode())
	other.SetPublic("status_code", statusCode)
	other.SetPublic("error_stage", "pre_relay")
	AppendRelayLogAdminInfo(c, nil, other)
	model.RecordErrorLog(c, c.GetInt("id"), 0, c.GetString("original_model"), c.GetString("token_name"), err.MaskSensitiveError(), c.GetInt("token_id"), 0, false, c.GetString("group"), other)
	common.SetContextKey(c, constant.ContextKeyRelayErrorLogged, true)
}

// isRelayRequest 判断当前请求是否属于 relay（/v1、/v1beta、/mj 等）路由。
// 仅这些路由的失败才写入 relay 错误日志，避免把管理 API 的失败混进用户日志。
func isRelayRequest(c *gin.Context) bool {
	if c == nil {
		return false
	}
	tag, _ := c.Get(RelayRouteTagKey)
	return tag == RelayRouteTagValue
}
