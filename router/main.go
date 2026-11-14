package router

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

func SetRouter(router *gin.Engine, assets WebAssets) {
	SetApiRouter(router)
	// OIDC provider endpoints live at the root by protocol convention.
	router.GET("/.well-known/openid-configuration", middleware.RouteTag("oidc"), controller.OIDCDiscovery)
	router.GET("/oidc/jwks", middleware.RouteTag("oidc"), controller.OIDCJWKS)
	router.GET("/oidc/authorize", middleware.RouteTag("oidc"), controller.OIDCAuthorizeBootstrap)
	router.POST("/oidc/token", middleware.RouteTag("oidc"), controller.OIDCToken)
	router.GET("/oidc/userinfo", middleware.RouteTag("oidc"), controller.OIDCUserInfo)
	SetDashboardRouter(router)
	SetRelayRouter(router)
	SetTaskPluginProtocolRouter(router)
	SetVideoRouter(router)
	SetTaskRouter(router)
	pluginDispatcher := SetPluginRouter(router)
	frontendBaseUrl := os.Getenv("FRONTEND_BASE_URL")
	if common.IsMasterNode && frontendBaseUrl != "" {
		frontendBaseUrl = ""
		common.SysLog(common.LogText("FRONTEND_BASE_URL is ignored on master node"))
	}
	if os.Getenv("USE_NGINX") == "true" {
		// zhaoyj add: frontend is served by an external nginx, only expose the API routes
		common.SysLog("USE_NGINX is enabled, skipping embedded frontend")
		router.NoRoute(
			pluginDispatcher,
			middleware.RouteTag("web"),
			func(c *gin.Context) {
				if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
					controller.RelayNotFound(c)
					return
				}
				c.JSON(http.StatusNotFound, gin.H{"message": "Resource Not Found"})
			},
		)
	} else if frontendBaseUrl == "" {
		SetWebRouter(router, assets, pluginDispatcher)
	} else {
		frontendBaseUrl = strings.TrimSuffix(frontendBaseUrl, "/")
		router.NoRoute(
			pluginDispatcher,
			middleware.RouteTag("web"),
			middleware.AccessTokenAudit(),
			func(c *gin.Context) {
				c.Redirect(http.StatusMovedPermanently, fmt.Sprintf("%s%s", frontendBaseUrl, c.Request.RequestURI))
			},
		)
	}
}
