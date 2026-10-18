package common

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func pageQueryContext(t *testing.T, rawQuery string) *gin.Context {
	t.Helper()
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/api/anything?"+rawQuery, nil)
	return c
}

func pageQueryFrom(t *testing.T, rawQuery string) *PageInfo {
	t.Helper()
	return GetPageQuery(pageQueryContext(t, rawQuery))
}

func TestGetPageQueryDefaults(t *testing.T) {
	pi := pageQueryFrom(t, "")
	assert.Equal(t, 1, pi.Page)
	assert.Equal(t, ItemsPerPage, pi.PageSize)
	assert.Equal(t, 0, pi.GetStartIdx())
}

func TestGetPageQueryExplicitValues(t *testing.T) {
	pi := pageQueryFrom(t, "p=3&page_size=20")
	assert.Equal(t, 3, pi.Page)
	assert.Equal(t, 20, pi.PageSize)
	assert.Equal(t, 40, pi.GetStartIdx())
	assert.Equal(t, 60, pi.GetEndIdx())
}

func TestGetPageQueryLegacyParams(t *testing.T) {
	pi := pageQueryFrom(t, "ps=15")
	assert.Equal(t, 15, pi.PageSize)

	// token page 用的是 size
	pi = pageQueryFrom(t, "size=7")
	assert.Equal(t, 7, pi.PageSize)

	// page_size 优先于 ps、size
	pi = pageQueryFrom(t, "page_size=9&ps=15&size=7")
	assert.Equal(t, 9, pi.PageSize)
}

func TestGetPageQueryInvalidValues(t *testing.T) {
	for _, tc := range []struct {
		name        string
		query       string
		wantPage    int
		wantPerPage int
	}{
		{name: "non numeric", query: "p=abc&page_size=abc", wantPage: 1, wantPerPage: ItemsPerPage},
		{name: "zero", query: "p=0&page_size=0", wantPage: 1, wantPerPage: ItemsPerPage},
		{name: "negative page", query: "p=-3&page_size=2", wantPage: 1, wantPerPage: 2},
		{name: "negative page size", query: "p=2&page_size=-5", wantPage: 2, wantPerPage: ItemsPerPage},
		{name: "both negative", query: "p=-9&page_size=-9", wantPage: 1, wantPerPage: ItemsPerPage},
		{name: "page size cap", query: "p=1&page_size=1000", wantPage: 1, wantPerPage: 100},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pi := pageQueryFrom(t, tc.query)
			assert.Equal(t, tc.wantPage, pi.Page, tc.query)
			assert.Equal(t, tc.wantPerPage, pi.PageSize, tc.query)
		})
	}
}

func TestGetPageQueryNeverProducesNegativeIdx(t *testing.T) {
	for _, query := range []string{"", "p=-3", "page_size=-5", "p=-3&page_size=-5", "ps=-1", "size=-2", "p=-3&ps=-20"} {
		pi := pageQueryFrom(t, query)
		require.GreaterOrEqual(t, pi.Page, 1, query)
		require.GreaterOrEqual(t, pi.PageSize, 1, query)
		assert.GreaterOrEqual(t, pi.GetStartIdx(), 0, query)
		assert.Greater(t, pi.GetEndIdx(), pi.GetStartIdx(), query)
	}
}

// controller/model_meta.go 承诺负数分页直接 400，该判断只能用原始查询串，
// 因为 GetPageQuery 已经把负数归一成正数。
func TestInvalidPageQueryDetectsExplicitNegatives(t *testing.T) {
	for _, tc := range []struct {
		query string
		want  bool
	}{
		{query: "", want: false},
		{query: "p=1&page_size=20", want: false},
		{query: "p=0&page_size=0", want: false},
		{query: "p=abc&page_size=abc", want: false},
		{query: "p=999999999999999999999", want: false},
		{query: "p=-1", want: true},
		{query: "page_size=-1", want: true},
		{query: "ps=-2", want: true},
		{query: "size=-3", want: true},
		{query: "p=2&size=-3", want: true},
	} {
		assert.Equal(t, tc.want, InvalidPageQuery(pageQueryContext(t, tc.query)), tc.query)
	}
}
