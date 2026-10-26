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

package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

// AccumulateChannelQuotaUsage adds the amount a user was charged to the quota
// gate that applies to this model and persists it with the channel. The
// channel is reloaded under its per-channel lock so concurrent settlements
// cannot lose an increment, and the in-memory cache is replaced with the saved
// snapshot so the next routing decision sees the fresh usage.
func AccumulateChannelQuotaUsage(channelId int, model string, amountUSD float64) {
	if channelId <= 0 || model == "" || amountUSD <= 0 {
		return
	}
	lock := GetChannelPollingLock(channelId)
	lock.Lock()
	defer lock.Unlock()

	channel, err := GetChannelById(channelId, true)
	if err != nil {
		common.SysLog(common.LogText("failed to load channel for quota usage: channel_id=%d, error=%v", channelId, err))
		return
	}
	settings := channel.GetOtherSettings()
	limit := settings.QuotaForModel(model)
	if limit == nil || !limit.Enabled {
		return
	}
	limit.Accumulate(time.Now(), amountUSD)
	channel.SetOtherSettings(settings)
	if err := DB.Model(&Channel{}).Where("id = ?", channelId).Update("settings", channel.OtherSettings).Error; err != nil {
		common.SysLog(common.LogText("failed to save channel quota usage: channel_id=%d, error=%v", channelId, err))
		return
	}
	CacheUpdateChannel(channel)
}

// ResetChannelQuotaUsage clears the used amount (and window starts) while
// keeping the configured limits, so the channel starts a fresh period.
func ResetChannelQuotaUsage(channelId int, model string) error {
	lock := GetChannelPollingLock(channelId)
	lock.Lock()
	defer lock.Unlock()

	channel, err := GetChannelById(channelId, true)
	if err != nil {
		return err
	}
	settings := channel.GetOtherSettings()
	if model == "" {
		if settings.Quota != nil {
			clearChannelQuotaUsage(settings.Quota)
		}
		for i := range settings.ModelQuotas {
			clearChannelQuotaUsage(&settings.ModelQuotas[i].ChannelQuotaLimit)
		}
	} else if limit := settings.QuotaForModel(model); limit != nil {
		clearChannelQuotaUsage(limit)
	}
	channel.SetOtherSettings(settings)
	if err := DB.Model(&Channel{}).Where("id = ?", channelId).Update("settings", channel.OtherSettings).Error; err != nil {
		return err
	}
	CacheUpdateChannel(channel)
	return nil
}

func clearChannelQuotaUsage(limit *dto.ChannelQuotaLimit) {
	limit.DailyUsed = 0
	limit.DailyStart = 0
	limit.WeeklyUsed = 0
	limit.WeeklyStart = 0
	limit.TotalUsed = 0
}
