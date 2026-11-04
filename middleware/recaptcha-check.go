package middleware

import (
	"net/http"
	"net/url"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// reCAPTCHA v2 的校验端点；测试可替换为本地桩服务。
var recaptchaSiteVerifyURL = "https://www.google.com/recaptcha/api/siteverify"

var recaptchaVerifyClient = &http.Client{Timeout: 10 * time.Second}

type recaptchaCheckResponse struct {
	Success bool `json:"success"`
}

func RecaptchaCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !common.RecaptchaCheckEnabled {
			c.Next()
			return
		}
		response := c.Query("recaptcha")
		if response == "" {
			common.ApiErrorT(c, "reCAPTCHA token is empty")
			c.Abort()
			return
		}
		rawRes, err := recaptchaVerifyClient.PostForm(recaptchaSiteVerifyURL, url.Values{
			"secret":   {common.RecaptchaSecretKey},
			"response": {response},
			"remoteip": {c.ClientIP()},
		})
		if err != nil {
			common.SysLog(err.Error())
			common.ApiErrorT(c, "reCAPTCHA verification failed, please refresh and try again!")
			c.Abort()
			return
		}
		defer rawRes.Body.Close()
		var res recaptchaCheckResponse
		if err = common.DecodeJson(rawRes.Body, &res); err != nil {
			common.SysLog(err.Error())
			common.ApiErrorT(c, "reCAPTCHA verification failed, please refresh and try again!")
			c.Abort()
			return
		}
		if !res.Success {
			common.ApiErrorT(c, "reCAPTCHA verification failed, please refresh and try again!")
			c.Abort()
			return
		}
		c.Next()
	}
}
