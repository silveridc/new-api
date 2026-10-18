package common

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

type PageInfo struct {
	Page     int `json:"page"`      // page num 页码
	PageSize int `json:"page_size"` // page size 页大小

	Total int `json:"total"` // 总条数，后设置
	Items any `json:"items"` // 数据，后设置
}

// InvalidPageQuery 报告查询串里是否显式给了负数的页码或页大小。
// GetPageQuery 会把这类值归一成正数兜底，承诺“负数分页直接拒收”的接口只能
// 单独问它，不能再看归一后的 PageInfo。
func InvalidPageQuery(c *gin.Context) bool {
	for _, key := range []string{"p", "page_size", "ps", "size"} {
		raw := c.Query(key)
		if raw == "" {
			continue
		}
		if value, err := strconv.Atoi(raw); err == nil && value < 0 {
			return true
		}
	}
	return false
}

func (p *PageInfo) GetStartIdx() int {
	return (p.Page - 1) * p.PageSize
}

func (p *PageInfo) GetEndIdx() int {
	return p.Page * p.PageSize
}

func (p *PageInfo) GetPageSize() int {
	return p.PageSize
}

func (p *PageInfo) GetPage() int {
	return p.Page
}

func (p *PageInfo) SetTotal(total int) {
	p.Total = total
}

func (p *PageInfo) SetItems(items any) {
	p.Items = items
}

func GetPageQuery(c *gin.Context) *PageInfo {
	pageInfo := &PageInfo{}
	// 手动获取并处理每个参数
	if page, err := strconv.Atoi(c.Query("p")); err == nil {
		pageInfo.Page = page
	}
	if pageSize, err := strconv.Atoi(c.Query("page_size")); err == nil {
		pageInfo.PageSize = pageSize
	}
	if pageInfo.Page < 1 {
		// 兼容
		page, _ := strconv.Atoi(c.Query("p"))
		if page != 0 {
			pageInfo.Page = page
		} else {
			pageInfo.Page = 1
		}
	}

	if pageInfo.PageSize == 0 {
		// 兼容
		pageSize, _ := strconv.Atoi(c.Query("ps"))
		if pageSize != 0 {
			pageInfo.PageSize = pageSize
		}
		if pageInfo.PageSize == 0 {
			pageSize, _ = strconv.Atoi(c.Query("size")) // token page
			if pageSize != 0 {
				pageInfo.PageSize = pageSize
			}
		}
		if pageInfo.PageSize == 0 {
			pageInfo.PageSize = ItemsPerPage
		}
	}

	if pageInfo.PageSize > 100 {
		pageInfo.PageSize = 100
	}

	// 下限兜底：兼容分支只校验了 0，负数会算出反向的 offset 和 limit，
	// 直接传给 GORM 在 MySQL/Postgres 上会报错。
	if pageInfo.Page < 1 {
		pageInfo.Page = 1
	}
	if pageInfo.PageSize < 1 {
		pageInfo.PageSize = ItemsPerPage
	}

	return pageInfo
}
