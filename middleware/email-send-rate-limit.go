/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

package middleware

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

// 邮件发送限流：为「无鉴权即可触发后端发信」的接口提供三层防护。
//
// 背景：/api/verification 与 /api/reset_password 不需要登录，任何人对任意
// 第三方邮箱都能触发本站发信。原有的 CriticalRateLimit 是全站共享的 IP 预算，
// EmailVerificationRateLimit 只按 IP 计数：攻击者换 IP 或换邮箱即可持续对陌生
// 邮箱发信，造成邮件轰炸、钓鱼投递与发件域信誉损耗。
//
// 三层（任一超限即 429，Redis 开启时用原子固定窗口，否则用内存实现）：
//  1. 来源 IP 预算：限制单 IP 的发信频率；
//  2. 目标邮箱冷却：同一收件人在窗口内只放行极少次数，换 IP 无法绕过这一层
//     对单个受害者的保护；两个发信接口共用同一收件人预算，避免切换入口绕过；
//  3. 全站总量熔断：限制整体发信速率，约束分布式 IP 的放大能力。
//
// 邮箱以 SHA-256 摘要作为限流键，避免把明文地址写进 Redis 键。
const EmailSendRateLimitMark = "ES"

func emailSendTargetKey(email string) string {
	normalized := strings.ToLower(strings.TrimSpace(email))
	if normalized == "" {
		return ""
	}
	digest := sha256.Sum256([]byte(normalized))
	return fmt.Sprintf("%x", digest[:16])
}

// emailSendRateLimitRejection 统一 429 响应，带上 Retry-After 让客户端退避。
func emailSendRateLimitRejection(c *gin.Context, waitSeconds int64) {
	if waitSeconds > 0 {
		c.Header("Retry-After", strconv.FormatInt(waitSeconds, 10))
	}
	common.ApiErrorStatus(c, http.StatusTooManyRequests, common.NewMessage(
		"Too many email requests. Please wait {{seconds}} seconds and try again.",
		map[string]any{"seconds": max(waitSeconds, 1)},
	))
	c.Abort()
}

// takeEmailSendBudget 消耗一次额度。返回 false 表示超限，并给出建议等待秒数。
// 两个后端使用同一份维度命名：Redis 走与其它限流一致的命名空间，内存实现走
// mark 前缀，因此同一个维度在两种后端下的计数互不干扰、也不会与其它限流器撞键。
func takeEmailSendBudget(c *gin.Context, dimension string, limit int, duration int64) (bool, int64) {
	if limit <= 0 || duration <= 0 {
		return true, 0
	}
	if common.RedisEnabled {
		allowed, _, ttlSeconds, err := redisFixedWindowTake(
			c.Request.Context(),
			redisRateLimitNamespace+":email:"+EmailSendRateLimitMark+":"+dimension,
			limit,
			duration,
		)
		if err == nil {
			if allowed {
				return true, 0
			}
			if ttlSeconds <= 0 {
				ttlSeconds = duration
			}
			return false, ttlSeconds
		}
		// Redis 不可用时退回内存限流，保持防护不因后端故障而完全失效。
	}
	if inMemoryRateLimiter.Request(EmailSendRateLimitMark+":"+dimension, limit, duration) {
		return true, 0
	}
	return false, duration
}

// EmailSendRateLimit 对无鉴权发信接口做 IP / 目标邮箱 / 全站三层限流。
// emailQuery 是收件人参数名，缺失或为空时跳过目标邮箱维度（由 handler 自行
// 校验参数并返回 400），其余两层仍然生效。
func EmailSendRateLimit(emailQuery string) gin.HandlerFunc {
	// Keep the fallback ready before requests arrive so a concurrent Redis
	// outage cannot race the in-memory limiter's first initialization.
	inMemoryRateLimiter.Init(common.RateLimitKeyExpirationDuration)
	return func(c *gin.Context) {
		if !common.EmailSendRateLimitEnable {
			c.Next()
			return
		}

		type dimension struct {
			name     string
			limit    int
			duration int64
		}
		dimensions := []dimension{
			{"ip:" + c.ClientIP(), common.EmailSendIPRateLimitNum, common.EmailSendIPRateLimitDuration},
			{"global", common.EmailSendGlobalRateLimitNum, common.EmailSendGlobalRateLimitDuration},
		}
		// 目标邮箱维度：限流键用摘要，避免明文地址进入 Redis。
		if digest := emailSendTargetKey(c.Query(emailQuery)); digest != "" {
			dimensions = append(dimensions, dimension{
				"to:" + digest,
				common.EmailSendTargetRateLimitNum,
				common.EmailSendTargetRateLimitDuration,
			})
		}

		// 被拒的请求同样消耗已通过的维度，攻击者无法靠触发拒绝来白刷预算。
		for _, item := range dimensions {
			allowed, waitSeconds := takeEmailSendBudget(c, item.name, item.limit, item.duration)
			if !allowed {
				emailSendRateLimitRejection(c, waitSeconds)
				return
			}
		}

		c.Next()
	}
}
