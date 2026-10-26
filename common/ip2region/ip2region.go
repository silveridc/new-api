/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

package ip2region

import (
	_ "embed"
	"net"
	"strings"
	"sync"

	"github.com/lionsoul2014/ip2region/binding/golang/xdb"
)

//go:embed ip2region_v4.xdb
var ip2regionV4Data []byte

var (
	searcherOnce sync.Once
	searcher     *xdb.Searcher
	searcherErr  error
)

// Lookup returns the region of an IP address as "国家 省 市", or "" when the
// address is not a public IP or the database has no record. The database is
// loaded once and searched from memory, so callers may use it on hot paths.
func Lookup(ip string) string {
	parsed := net.ParseIP(strings.TrimSpace(ip))
	if parsed == nil || !isPublicIP(parsed) {
		return ""
	}
	searcherOnce.Do(func() {
		searcher, searcherErr = xdb.NewWithBuffer(xdb.IPv4, ip2regionV4Data)
	})
	if searcherErr != nil || searcher == nil {
		return ""
	}
	region, err := searcher.Search(parsed.String())
	if err != nil {
		return ""
	}
	return formatRegion(region)
}

// isPublicIP filters loopback, private, link-local and other non-routable
// addresses: their region is meaningless and the database stores nothing useful.
func isPublicIP(ip net.IP) bool {
	return ip.To4() != nil &&
		!ip.IsLoopback() &&
		!ip.IsPrivate() &&
		!ip.IsLinkLocalUnicast() &&
		!ip.IsLinkLocalMulticast() &&
		!ip.IsUnspecified() &&
		!ip.IsMulticast()
}

// formatRegion turns ip2region's pipe-separated record into a readable label.
// The record shape is "国家|区域|省份|城市|ISP"; empty segments and the
// "0" placeholder are dropped.
func formatRegion(record string) string {
	parts := strings.Split(record, "|")
	if len(parts) < 4 {
		return ""
	}
	labels := make([]string, 0, 4)
	for _, part := range parts[:4] {
		part = strings.TrimSpace(part)
		if part == "" || part == "0" {
			continue
		}
		if len(labels) > 0 && labels[len(labels)-1] == part {
			continue
		}
		labels = append(labels, part)
	}
	return strings.Join(labels, " ")
}
