package router

import (
	"embed"
	"net/http"
	"path"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
	// NextIndexPage 是挂在 /next/ 下的新版界面入口页，未构建时为 nil。
	NextIndexPage []byte
}

// nextUIPathPrefix 与新版前端构建时的 VITE_UI_BASE 对应，产物位于 web/dist/next。
const nextUIPathPrefix = "/next"

// isNextUIEntry 只匹配入口页本身。目录形式必须绕开 http.FileServer：gin 把
// /next/ 折到 /next，FileServer 又把 /next 指回 /next/，两者互指成重定向死循环。
func isNextUIEntry(urlPath string) bool {
	return urlPath == nextUIPathPrefix || urlPath == nextUIPathPrefix+"/"
}

func isNextUIRequest(urlPath string) bool {
	// 静态资源查找会归一化路径，入口页选择要跟随同一套规则。
	cleaned := path.Clean(urlPath)
	return cleaned == nextUIPathPrefix || strings.HasPrefix(cleaned, nextUIPathPrefix+"/")
}

func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")
	compress := gzip.Gzip(gzip.DefaultCompression)

	router.NoRoute(
		pluginDispatcher,
		middleware.RouteTag("web"),
		func(c *gin.Context) {
			// ServeFrontendFiles sends build files already compressed.
			if isNextUIEntry(c.Request.URL.Path) || !frontendFS.Exists("/", c.Request.URL.Path) {
				compress(c)
			}
		},
		middleware.AccessTokenAudit(),
		middleware.GlobalWebRateLimit(frontendFS),
		middleware.Cache(),
		func(c *gin.Context) {
			if assets.NextIndexPage == nil || !isNextUIEntry(c.Request.URL.Path) {
				return
			}
			c.Abort()
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.NextIndexPage)
		},
		middleware.ServeFrontendFiles(frontendFS),
		func(c *gin.Context) {
			if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
				controller.RelayNotFound(c)
				return
			}
			indexPage := assets.IndexPage
			if assets.NextIndexPage != nil && isNextUIRequest(c.Request.URL.Path) {
				indexPage = assets.NextIndexPage
			}
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", indexPage)
		},
	)
}
