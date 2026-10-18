package router

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestIsAssetDirEntryMatchesOnlyTheBuildDirectory(t *testing.T) {
	for _, tc := range []struct {
		path string
		want bool
	}{
		{path: "/assets", want: true},
		{path: "/assets/", want: true},
		{path: "/assets/app.js", want: false},
		{path: "/next", want: false},
		{path: "/", want: false},
		{path: "/assets-extra", want: false},
	} {
		assert.Equal(t, tc.want, isAssetDirEntry(tc.path), tc.path)
	}
}

func TestWebRouterDoesNotRedirectTheAssetDirectory(t *testing.T) {
	gin.SetMode(gin.TestMode)

	outer := gin.New()
	SetWebRouter(outer, WebAssets{IndexPage: []byte("classic")}, func(c *gin.Context) { c.Next() })

	// http.FileServer 会让 /assets 与 /assets/ 互指成重定向死循环，两者都必须是
	// 与缺失资源一致的 404，不能出现 3xx。
	for _, path := range []string{"/assets", "/assets/"} {
		response := performPluginRequest(outer, http.MethodGet, path)
		assert.NotEqual(t, http.StatusMovedPermanently, response.Code, path)
		assert.Equal(t, http.StatusNotFound, response.Code, path)
	}

	// 真实构建文件的缺失形式沿用原有 404。
	missing := performPluginRequest(outer, http.MethodGet, "/assets/app-abc123.js")
	assert.Equal(t, http.StatusNotFound, missing.Code)

	// 界面入口不受影响。
	page := performPluginRequest(outer, http.MethodGet, "/pricing")
	assert.Equal(t, http.StatusOK, page.Code)
	assert.Equal(t, "classic", page.Body.String())
}
