package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubVerifier 替换 reCAPTCHA 校验端点，记录收到的表单并返回给定响应体。
func stubVerifier(t *testing.T, response string, status int) *url.Values {
	t.Helper()
	previous := recaptchaSiteVerifyURL
	t.Cleanup(func() { recaptchaSiteVerifyURL = previous })

	var received url.Values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		received = r.PostForm
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(response))
	}))
	t.Cleanup(server.Close)
	recaptchaSiteVerifyURL = server.URL + "/siteverify"
	return &received
}

func runRecaptchaRequest(t *testing.T, query string) (int, map[string]any, bool) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	reached := false
	router.GET("/api/verification", RecaptchaCheck(), func(c *gin.Context) {
		reached = true
		c.Status(http.StatusNoContent)
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/verification"+query, nil))

	var body map[string]any
	if recorder.Body.Len() > 0 {
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	}
	return recorder.Code, body, reached
}

func TestRecaptchaCheck(t *testing.T) {
	previousEnabled := common.RecaptchaCheckEnabled
	previousSecret := common.RecaptchaSecretKey
	t.Cleanup(func() {
		common.RecaptchaCheckEnabled = previousEnabled
		common.RecaptchaSecretKey = previousSecret
	})
	common.RecaptchaSecretKey = "secret-key"

	t.Run("未启用时直接放行", func(t *testing.T) {
		common.RecaptchaCheckEnabled = false
		status, _, reached := runRecaptchaRequest(t, "")
		assert.Equal(t, http.StatusNoContent, status)
		assert.True(t, reached)
	})

	t.Run("启用但缺少令牌时拦截", func(t *testing.T) {
		common.RecaptchaCheckEnabled = true
		stubVerifier(t, `{"success": true}`, http.StatusOK)
		status, body, reached := runRecaptchaRequest(t, "")
		assert.Equal(t, http.StatusOK, status)
		assert.False(t, reached)
		assert.Equal(t, false, body["success"])
		assert.Equal(t, "reCAPTCHA token is empty", body["message_key"])
	})

	t.Run("校验通过时放行并转发密钥与来源 IP", func(t *testing.T) {
		common.RecaptchaCheckEnabled = true
		received := stubVerifier(t, `{"success": true, "challenge_ts": "2026-11-04T08:00:00Z", "hostname": "panel.example.com"}`, http.StatusOK)
		status, _, reached := runRecaptchaRequest(t, "?recaptcha=token-ok")
		assert.Equal(t, http.StatusNoContent, status)
		assert.True(t, reached)
		assert.Equal(t, "secret-key", received.Get("secret"))
		assert.Equal(t, "token-ok", received.Get("response"))
		assert.NotEmpty(t, received.Get("remoteip"))
	})

	t.Run("上游判定失败时拦截", func(t *testing.T) {
		common.RecaptchaCheckEnabled = true
		stubVerifier(t, `{"success": false, "error-codes": ["invalid-input-response"]}`, http.StatusOK)
		status, body, reached := runRecaptchaRequest(t, "?recaptcha=token-bad")
		assert.Equal(t, http.StatusOK, status)
		assert.False(t, reached)
		assert.Equal(t, false, body["success"])
		assert.Equal(t, "reCAPTCHA verification failed, please refresh and try again!", body["message_key"])
	})

	t.Run("上游异常响应时拦截且不泄露内部错误", func(t *testing.T) {
		common.RecaptchaCheckEnabled = true
		stubVerifier(t, `not-json`, http.StatusOK)
		status, body, reached := runRecaptchaRequest(t, "?recaptcha=token")
		assert.Equal(t, http.StatusOK, status)
		assert.False(t, reached)
		assert.Equal(t, false, body["success"])
		assert.Equal(t, "reCAPTCHA verification failed, please refresh and try again!", body["message_key"])
		assert.NotContains(t, body["message"], "not-json")
	})
}
