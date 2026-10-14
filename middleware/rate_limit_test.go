package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func useRateLimitMiniRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()

	previousRedisEnabled := common.RedisEnabled
	previousRedisClient := common.RDB
	redisServer := miniredis.RunT(t)
	redisClient := redis.NewClient(&redis.Options{Addr: redisServer.Addr()})
	require.NoError(t, redisClient.Ping(context.Background()).Err())

	common.RedisEnabled = true
	common.RDB = redisClient
	t.Cleanup(func() {
		_ = redisClient.Close()
		common.RedisEnabled = previousRedisEnabled
		common.RDB = previousRedisClient
	})

	return redisServer, redisClient
}

func performRateLimitRequest(router http.Handler, path string, remoteAddr string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.RemoteAddr = remoteAddr
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestRedisIPRateLimiterThresholdTTLAndNamespace(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisServer, _ := useRateLimitMiniRedis(t)

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies(nil))
	router.GET("/limited", rateLimitFactory(2, 37, "TEST"), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	remoteAddr := "192.0.2.10:12345"
	legacyKey := "rateLimit:TEST192.0.2.10"
	_, err := redisServer.Push(legacyKey, "legacy-list-entry")
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/limited", remoteAddr).Code)
	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/limited", remoteAddr).Code)
	limitedResponse := performRateLimitRequest(router, "/limited", remoteAddr)
	assert.Equal(t, http.StatusTooManyRequests, limitedResponse.Code)
	assert.Equal(t, "37", limitedResponse.Header().Get("Retry-After"))

	key := redisIPRateLimitKey("TEST", "192.0.2.10")
	count, err := redisServer.Get(key)
	require.NoError(t, err)
	assert.Equal(t, "3", count)
	assert.Equal(t, 37*time.Second, redisServer.TTL(key))
	assert.True(t, redisServer.Exists(legacyKey), "the v2 counter must not touch an old list key")
}

func TestRedisUserRateLimiterUsesSharedFixedWindow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisServer, _ := useRateLimitMiniRedis(t)

	router := gin.New()
	router.GET(
		"/limited",
		func(c *gin.Context) { c.Set("id", 42) },
		userRateLimitFactory(1, 23, "USER"),
		func(c *gin.Context) { c.Status(http.StatusNoContent) },
	)

	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/limited", "192.0.2.20:12345").Code)
	assert.Equal(t, http.StatusTooManyRequests, performRateLimitRequest(router, "/limited", "198.51.100.20:12345").Code)

	key := redisUserRateLimitKey("USER", 42)
	assert.True(t, redisServer.Exists(key))
	assert.Equal(t, 23*time.Second, redisServer.TTL(key))
}

func TestRedisEmailVerificationRateLimiterPreservesResponseAndTTL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisServer, _ := useRateLimitMiniRedis(t)

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies(nil))
	router.GET("/verify", EmailVerificationRateLimit(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	remoteAddr := "192.0.2.30:12345"
	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/verify", remoteAddr).Code)
	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/verify", remoteAddr).Code)
	response := performRateLimitRequest(router, "/verify", remoteAddr)
	assert.Equal(t, http.StatusTooManyRequests, response.Code)
	assert.JSONEq(t, `{"success":false,"message":"Please wait 30 seconds before requesting another verification code.","message_key":"Please wait {{seconds}} seconds before requesting another verification code.","message_params":{"seconds":30}}`, response.Body.String())

	key := redisIPRateLimitKey(EmailVerificationRateLimitMark, "192.0.2.30")
	assert.True(t, redisServer.Exists(key))
	assert.Equal(t, time.Duration(EmailVerificationDuration)*time.Second, redisServer.TTL(key))
}

func TestRedisFixedWindowIsAtomicUnderConcurrency(t *testing.T) {
	redisServer, _ := useRateLimitMiniRedis(t)
	const (
		requestCount = 20
		maximumCount = 7
		duration     = int64(41)
	)
	key := redisIPRateLimitKey("CONCURRENT", "192.0.2.40")

	var allowedCount atomic.Int64
	errorsFound := make(chan error, requestCount)
	var waitGroup sync.WaitGroup
	waitGroup.Add(requestCount)
	for range requestCount {
		go func() {
			defer waitGroup.Done()
			allowed, _, _, err := redisFixedWindowTake(context.Background(), key, maximumCount, duration)
			if err != nil {
				errorsFound <- err
				return
			}
			if allowed {
				allowedCount.Add(1)
			}
		}()
	}
	waitGroup.Wait()
	close(errorsFound)
	for err := range errorsFound {
		require.NoError(t, err)
	}

	assert.Equal(t, int64(maximumCount), allowedCount.Load())
	count, err := redisServer.Get(key)
	require.NoError(t, err)
	assert.Equal(t, "20", count)
	assert.Equal(t, time.Duration(duration)*time.Second, redisServer.TTL(key))
}

func TestRedisFixedWindowResetsAtBoundary(t *testing.T) {
	redisServer, _ := useRateLimitMiniRedis(t)
	const duration = int64(10)
	key := redisIPRateLimitKey("BOUNDARY", "192.0.2.50")

	for range 2 {
		allowed, _, _, err := redisFixedWindowTake(context.Background(), key, 2, duration)
		require.NoError(t, err)
		assert.True(t, allowed)
	}
	allowed, _, _, err := redisFixedWindowTake(context.Background(), key, 2, duration)
	require.NoError(t, err)
	assert.False(t, allowed)

	// This reset is intentional fixed-window behavior. A client can consume one
	// full allowance immediately before and another immediately after a boundary.
	redisServer.FastForward(time.Duration(duration) * time.Second)
	for range 2 {
		allowed, _, _, err = redisFixedWindowTake(context.Background(), key, 2, duration)
		require.NoError(t, err)
		assert.True(t, allowed)
	}
}

func TestRedisFixedWindowRepairsCounterWithoutTTL(t *testing.T) {
	redisServer, _ := useRateLimitMiniRedis(t)
	const duration = int64(29)
	key := redisIPRateLimitKey("MISSING-TTL", "192.0.2.51")
	redisServer.Set(key, "5")

	allowed, count, ttl, err := redisFixedWindowTake(context.Background(), key, 3, duration)
	require.NoError(t, err)
	assert.False(t, allowed)
	assert.Equal(t, int64(6), count)
	assert.Equal(t, duration, ttl)
	assert.Equal(t, time.Duration(duration)*time.Second, redisServer.TTL(key))

	redisServer.FastForward(time.Duration(duration) * time.Second)
	assert.False(t, redisServer.Exists(key), "a recovered counter must not remain permanently rate-limited")
}

func TestRedisFailurePolicies(t *testing.T) {
	gin.SetMode(gin.TestMode)
	_, redisClient := useRateLimitMiniRedis(t)
	require.NoError(t, redisClient.Close())

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies(nil))
	router.GET("/ip", rateLimitFactory(1, 30, "FAIL-IP"), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	router.GET(
		"/user",
		func(c *gin.Context) { c.Set("id", 7) },
		userRateLimitFactory(1, 30, "FAIL-USER"),
		func(c *gin.Context) { c.Status(http.StatusNoContent) },
	)
	router.GET("/email", EmailVerificationRateLimit(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	ipResponse := performRateLimitRequest(router, "/ip", "192.0.2.60:12345")
	assert.Equal(t, http.StatusInternalServerError, ipResponse.Code)
	assert.Empty(t, ipResponse.Body.String())
	userResponse := performRateLimitRequest(router, "/user", "192.0.2.61:12345")
	assert.Equal(t, http.StatusInternalServerError, userResponse.Code)
	assert.Empty(t, userResponse.Body.String())
	assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/email", "192.0.2.62:12345").Code)
}

func TestGlobalWebRateLimitCountsFrontendFilesInStaticBucket(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousWebEnable, previousWebNum, previousWebDuration := common.GlobalWebRateLimitEnable, common.GlobalWebRateLimitNum, common.GlobalWebRateLimitDuration
	previousStaticEnable, previousStaticNum, previousStaticDuration := common.GlobalStaticRateLimitEnable, common.GlobalStaticRateLimitNum, common.GlobalStaticRateLimitDuration
	t.Cleanup(func() {
		common.GlobalWebRateLimitEnable, common.GlobalWebRateLimitNum, common.GlobalWebRateLimitDuration = previousWebEnable, previousWebNum, previousWebDuration
		common.GlobalStaticRateLimitEnable, common.GlobalStaticRateLimitNum, common.GlobalStaticRateLimitDuration = previousStaticEnable, previousStaticNum, previousStaticDuration
	})
	common.GlobalWebRateLimitEnable, common.GlobalWebRateLimitNum, common.GlobalWebRateLimitDuration = true, 2, 41
	common.GlobalStaticRateLimitNum, common.GlobalStaticRateLimitDuration = 2, 43

	frontendDir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(frontendDir, "static", "js"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(frontendDir, "static", "js", "app.js"), []byte("app"), 0o644))
	frontendFS := static.LocalFile(frontendDir, false)

	const clientIP = "192.0.2.70"
	const remoteAddr = clientIP + ":12345"

	t.Run("static limiter disabled by default", func(t *testing.T) {
		redisServer, _ := useRateLimitMiniRedis(t)
		common.GlobalStaticRateLimitEnable = false
		router := gin.New()
		require.NoError(t, router.SetTrustedProxies(nil))
		router.NoRoute(GlobalWebRateLimit(frontendFS), func(c *gin.Context) { c.Status(http.StatusNoContent) })

		for range 5 {
			assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/static/js/app.js", remoteAddr).Code)
		}
		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/channels", remoteAddr).Code)
		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/static/js/missing.js", remoteAddr).Code)
		pageResponse := performRateLimitRequest(router, "/channels", remoteAddr)
		assert.Equal(t, http.StatusTooManyRequests, pageResponse.Code)
		assert.Equal(t, "41", pageResponse.Header().Get("Retry-After"))

		webCount, err := redisServer.Get(redisIPRateLimitKey("GW", clientIP))
		require.NoError(t, err)
		assert.Equal(t, "3", webCount)
		assert.False(t, redisServer.Exists(redisIPRateLimitKey("GS", clientIP)))
	})

	t.Run("static limiter enabled uses its own bucket", func(t *testing.T) {
		redisServer, _ := useRateLimitMiniRedis(t)
		common.GlobalStaticRateLimitEnable = true
		router := gin.New()
		require.NoError(t, router.SetTrustedProxies(nil))
		router.NoRoute(GlobalWebRateLimit(frontendFS), func(c *gin.Context) { c.Status(http.StatusNoContent) })

		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/static/js/app.js", remoteAddr).Code)
		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/static/js/app.js", remoteAddr).Code)
		staticResponse := performRateLimitRequest(router, "/static/js/app.js", remoteAddr)
		assert.Equal(t, http.StatusTooManyRequests, staticResponse.Code)
		assert.Equal(t, "43", staticResponse.Header().Get("Retry-After"))
		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/channels", remoteAddr).Code)

		staticCount, err := redisServer.Get(redisIPRateLimitKey("GS", clientIP))
		require.NoError(t, err)
		assert.Equal(t, "3", staticCount)
		webCount, err := redisServer.Get(redisIPRateLimitKey("GW", clientIP))
		require.NoError(t, err)
		assert.Equal(t, "1", webCount)
	})
}

// 无鉴权发信接口的三层限流：IP、目标邮箱、全站总量。核心回归点是「换 IP
// 仍打不动同一个收件人」——修复前只有按 IP 的预算，换 IP 即可继续轰炸。
func TestEmailSendRateLimitBlocksTargetAcrossIPs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previous := struct {
		enabled bool
		ipNum   int
		ipDur   int64
		toNum   int
		toDur   int64
		allNum  int
		allDur  int64
	}{
		common.EmailSendRateLimitEnable,
		common.EmailSendIPRateLimitNum, common.EmailSendIPRateLimitDuration,
		common.EmailSendTargetRateLimitNum, common.EmailSendTargetRateLimitDuration,
		common.EmailSendGlobalRateLimitNum, common.EmailSendGlobalRateLimitDuration,
	}
	t.Cleanup(func() {
		common.EmailSendRateLimitEnable = previous.enabled
		common.EmailSendIPRateLimitNum, common.EmailSendIPRateLimitDuration = previous.ipNum, previous.ipDur
		common.EmailSendTargetRateLimitNum, common.EmailSendTargetRateLimitDuration = previous.toNum, previous.toDur
		common.EmailSendGlobalRateLimitNum, common.EmailSendGlobalRateLimitDuration = previous.allNum, previous.allDur
	})
	common.EmailSendRateLimitEnable = true
	common.EmailSendIPRateLimitNum, common.EmailSendIPRateLimitDuration = 100, 600
	common.EmailSendTargetRateLimitNum, common.EmailSendTargetRateLimitDuration = 2, 60
	common.EmailSendGlobalRateLimitNum, common.EmailSendGlobalRateLimitDuration = 100, 600

	t.Run("same recipient is blocked from a new IP", func(t *testing.T) {
		redisServer, _ := useRateLimitMiniRedis(t)
		router := gin.New()
		require.NoError(t, router.SetTrustedProxies(nil))
		router.GET("/verification", EmailSendRateLimit("email"), func(c *gin.Context) {
			c.Status(http.StatusNoContent)
		})

		victim := "/verification?email=Victim%40Example.com"
		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, victim, "192.0.2.80:12345").Code)
		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, victim, "192.0.2.81:12345").Code)

		blocked := performRateLimitRequest(router, victim, "192.0.2.82:12345")
		assert.Equal(t, http.StatusTooManyRequests, blocked.Code)
		assert.Equal(t, "60", blocked.Header().Get("Retry-After"))
		assert.Contains(t, blocked.Body.String(), "Too many email requests.")

		// 大小写与空白归一化到同一个收件人预算
		assert.Equal(t, http.StatusTooManyRequests,
			performRateLimitRequest(router, "/verification?email=%20victim@example.com%20", "192.0.2.83:12345").Code)

		// 换一个收件人不受影响，说明拒绝来自收件人维度而不是 IP 维度
		assert.Equal(t, http.StatusNoContent,
			performRateLimitRequest(router, "/verification?email=other%40example.com", "192.0.2.82:12345").Code)

		// 明文地址不得出现在限流键里：收件人维度只留 32 位十六进制摘要
		var recipientKeys []string
		for _, key := range redisServer.Keys() {
			assert.NotContains(t, key, "victim")
			assert.NotContains(t, key, "example.com")
			assert.Contains(t, key, redisRateLimitNamespace+":email:"+EmailSendRateLimitMark+":")
			if suffix, found := strings.CutPrefix(key, redisRateLimitNamespace+":email:"+EmailSendRateLimitMark+":to:"); found {
				assert.Len(t, suffix, 32)
				assert.Regexp(t, "^[0-9a-f]{32}$", suffix)
				recipientKeys = append(recipientKeys, key)
			}
		}
		assert.Len(t, recipientKeys, 2, "两个不同的收件人各占一个限流键")
	})

	t.Run("missing recipient still enforces IP and global budgets", func(t *testing.T) {
		useRateLimitMiniRedis(t)
		common.EmailSendIPRateLimitNum, common.EmailSendIPRateLimitDuration = 2, 300
		t.Cleanup(func() {
			common.EmailSendIPRateLimitNum, common.EmailSendIPRateLimitDuration = 100, 600
		})
		router := gin.New()
		require.NoError(t, router.SetTrustedProxies(nil))
		router.GET("/reset_password", EmailSendRateLimit("email"), func(c *gin.Context) {
			c.Status(http.StatusNoContent)
		})

		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/reset_password", "192.0.2.90:12345").Code)
		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/reset_password", "192.0.2.90:12345").Code)
		assert.Equal(t, http.StatusTooManyRequests, performRateLimitRequest(router, "/reset_password", "192.0.2.90:12345").Code)
		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/reset_password", "192.0.2.91:12345").Code)
	})

	t.Run("global budget stops distributed senders", func(t *testing.T) {
		useRateLimitMiniRedis(t)
		common.EmailSendGlobalRateLimitNum, common.EmailSendGlobalRateLimitDuration = 3, 600
		common.EmailSendIPRateLimitNum, common.EmailSendIPRateLimitDuration = 100, 600
		common.EmailSendTargetRateLimitNum, common.EmailSendTargetRateLimitDuration = 100, 600
		t.Cleanup(func() {
			common.EmailSendGlobalRateLimitNum, common.EmailSendGlobalRateLimitDuration = 100, 600
			common.EmailSendTargetRateLimitNum, common.EmailSendTargetRateLimitDuration = 2, 60
		})
		router := gin.New()
		require.NoError(t, router.SetTrustedProxies(nil))
		router.GET("/verification", EmailSendRateLimit("email"), func(c *gin.Context) {
			c.Status(http.StatusNoContent)
		})

		for i := range 3 {
			path := "/verification?email=user" + strconv.Itoa(i) + "%40example.com"
			assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, path, "198.51.100."+strconv.Itoa(i)+":12345").Code)
		}
		assert.Equal(t, http.StatusTooManyRequests,
			performRateLimitRequest(router, "/verification?email=user9%40example.com", "203.0.113.9:12345").Code)
	})

	t.Run("disabled switch lets requests through", func(t *testing.T) {
		useRateLimitMiniRedis(t)
		common.EmailSendRateLimitEnable = false
		t.Cleanup(func() { common.EmailSendRateLimitEnable = true })
		router := gin.New()
		require.NoError(t, router.SetTrustedProxies(nil))
		router.GET("/verification", EmailSendRateLimit("email"), func(c *gin.Context) {
			c.Status(http.StatusNoContent)
		})

		for range 5 {
			assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, "/verification?email=a%40example.com", "192.0.2.95:12345").Code)
		}
	})

	t.Run("memory fallback keeps the same three dimensions", func(t *testing.T) {
		previousRedisEnabled, previousRedisClient := common.RedisEnabled, common.RDB
		common.RedisEnabled, common.RDB = false, nil
		t.Cleanup(func() { common.RedisEnabled, common.RDB = previousRedisEnabled, previousRedisClient })

		router := gin.New()
		require.NoError(t, router.SetTrustedProxies(nil))
		router.GET("/verification", EmailSendRateLimit("email"), func(c *gin.Context) {
			c.Status(http.StatusNoContent)
		})

		victim := "/verification?email=memory%40example.com"
		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, victim, "192.0.2.100:12345").Code)
		assert.Equal(t, http.StatusNoContent, performRateLimitRequest(router, victim, "192.0.2.101:12345").Code)
		blocked := performRateLimitRequest(router, victim, "192.0.2.102:12345")
		assert.Equal(t, http.StatusTooManyRequests, blocked.Code)
		assert.Equal(t, "60", blocked.Header().Get("Retry-After"))
	})
}
