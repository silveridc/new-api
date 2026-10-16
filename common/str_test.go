package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeUiVariant(t *testing.T) {
	for _, tc := range []struct{ input, want string }{
		{input: "classic", want: "classic"},
		{input: "next", want: "next"},
		{input: " NEXT ", want: "next"},
		{input: "Classic", want: "classic"},
		{input: "", want: ""},
		{input: "dashboard", want: ""},
	} {
		assert.Equal(t, tc.want, NormalizeUiVariant(tc.input), tc.input)
	}
}

func TestResolveUiVariant(t *testing.T) {
	previousDefault, previousAvailable := DefaultUiVariant, NextUIAvailable
	t.Cleanup(func() {
		DefaultUiVariant, NextUIAvailable = previousDefault, previousAvailable
	})

	// 新版产物不在二进制里，任何偏好都只能落在 classic
	DefaultUiVariant, NextUIAvailable = "next", false
	assert.Equal(t, "classic", ResolveUiVariant("next"))
	assert.Equal(t, "classic", ResolveUiVariant(""))

	DefaultUiVariant, NextUIAvailable = "next", true
	assert.Equal(t, "classic", ResolveUiVariant("classic"), "用户偏好优先于系统默认")
	assert.Equal(t, "next", ResolveUiVariant(""), "未设置时跟随系统默认")
	assert.Equal(t, "next", ResolveUiVariant("dashboard"), "非法取值退回系统默认")

	DefaultUiVariant, NextUIAvailable = "dashboard", true
	assert.Equal(t, "classic", ResolveUiVariant(""), "系统默认非法时兜底 classic")
	assert.Equal(t, "next", ResolveUiVariant("next"))
}
