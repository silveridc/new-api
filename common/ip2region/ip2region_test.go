package ip2region

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFormatRegionDropsEmptySegmentsAndDuplicates(t *testing.T) {
	assert.Equal(t, "中国 广东省 深圳市", formatRegion("中国|0|广东省|深圳市|电信"))
	assert.Equal(t, "中国", formatRegion("中国|0|0|0|0"))
	assert.Equal(t, "", formatRegion("0|0|0|0|0"))
	assert.Equal(t, "", formatRegion("garbage"))
}

func TestLookupSkipsNonPublicAddresses(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.1.2.3", "192.168.1.1", "::1", "not-an-ip", ""} {
		assert.Empty(t, Lookup(ip), ip)
	}
}

func TestLookupResolvesPublicAddress(t *testing.T) {
	// 223.5.5.5 is Alibaba's public DNS resolver; the record must at least carry
	// country-level information from the embedded database.
	region := Lookup("223.5.5.5")
	assert.NotEmpty(t, region)
	assert.Contains(t, region, "中国")
}
