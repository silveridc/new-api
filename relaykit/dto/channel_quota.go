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

package dto

import (
	"fmt"
	"math"
	"strings"
	"time"
)

const (
	channelQuotaDailyPeriod  = 24 * time.Hour
	channelQuotaWeeklyPeriod = 7 * 24 * time.Hour
)

// channelQuotaTimezone resolves the configured reset timezone, defaulting to
// UTC when it is empty or unknown so a bad value never breaks scheduling.
func channelQuotaTimezone(name string) *time.Location {
	if strings.TrimSpace(name) == "" {
		return time.UTC
	}
	location, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return location
}

func channelQuotaDailyStart(now time.Time, limit *ChannelQuotaLimit) time.Time {
	if limit.DailyResetMode != ChannelQuotaResetFixed {
		if limit.DailyStart <= 0 {
			return time.Time{}
		}
		return time.Unix(limit.DailyStart, 0)
	}
	location := channelQuotaTimezone(limit.ResetTimezone)
	local := now.In(location)
	hour := limit.DailyResetHour
	if hour < 0 || hour > 23 {
		hour = 0
	}
	reset := time.Date(local.Year(), local.Month(), local.Day(), hour, 0, 0, 0, location)
	if reset.After(local) {
		reset = reset.AddDate(0, 0, -1)
	}
	return reset
}

func channelQuotaWeeklyStart(now time.Time, limit *ChannelQuotaLimit) time.Time {
	if limit.WeeklyResetMode != ChannelQuotaResetFixed {
		if limit.WeeklyStart <= 0 {
			return time.Time{}
		}
		return time.Unix(limit.WeeklyStart, 0)
	}
	location := channelQuotaTimezone(limit.ResetTimezone)
	local := now.In(location)
	day := limit.WeeklyResetDay
	if day < 0 || day > 6 {
		day = 1
	}
	hour := limit.WeeklyResetHour
	if hour < 0 || hour > 23 {
		hour = 0
	}
	reset := time.Date(local.Year(), local.Month(), local.Day(), hour, 0, 0, 0, location)
	for reset.Weekday() != time.Weekday(day) || reset.After(local) {
		reset = reset.AddDate(0, 0, -1)
	}
	return reset
}

// WindowExpired reports whether a rolling window passed its period. A zero
// start means the window never began, so the next accumulation starts it.
func (limit *ChannelQuotaLimit) WindowExpired(now time.Time) (daily bool, weekly bool) {
	if limit == nil {
		return false, false
	}
	if limit.DailyStart <= 0 {
		daily = true
	} else if limit.DailyResetMode == ChannelQuotaResetFixed {
		daily = time.Unix(limit.DailyStart, 0).Before(channelQuotaDailyStart(now, limit))
	} else {
		daily = !now.Before(time.Unix(limit.DailyStart, 0).Add(channelQuotaDailyPeriod))
	}
	if limit.WeeklyStart <= 0 {
		weekly = true
	} else if limit.WeeklyResetMode == ChannelQuotaResetFixed {
		weekly = time.Unix(limit.WeeklyStart, 0).Before(channelQuotaWeeklyStart(now, limit))
	} else {
		weekly = !now.Before(time.Unix(limit.WeeklyStart, 0).Add(channelQuotaWeeklyPeriod))
	}
	return daily, weekly
}

// UsedNow returns the used amount per dimension with expired windows treated as
// zero, matching what the next accumulation will count.
func (limit *ChannelQuotaLimit) UsedNow(now time.Time) (daily, weekly, total float64) {
	if limit == nil {
		return 0, 0, 0
	}
	expiredDaily, expiredWeekly := limit.WindowExpired(now)
	if !expiredDaily {
		daily = limit.DailyUsed
	}
	if !expiredWeekly {
		weekly = limit.WeeklyUsed
	}
	return daily, weekly, limit.TotalUsed
}

// Exceeded reports whether any enabled dimension already reached its limit.
func (limit *ChannelQuotaLimit) Exceeded(now time.Time) bool {
	if limit == nil || !limit.Enabled {
		return false
	}
	daily, weekly, total := limit.UsedNow(now)
	if limit.DailyLimit > 0 && daily >= limit.DailyLimit {
		return true
	}
	if limit.WeeklyLimit > 0 && weekly >= limit.WeeklyLimit {
		return true
	}
	return limit.TotalLimit > 0 && total >= limit.TotalLimit
}

// Accumulate adds the charged amount to every enabled dimension, starting a new
// window when the previous one expired.
func (limit *ChannelQuotaLimit) Accumulate(now time.Time, amount float64) {
	if limit == nil || !limit.Enabled || amount <= 0 || math.IsNaN(amount) || math.IsInf(amount, 0) {
		return
	}
	expiredDaily, expiredWeekly := limit.WindowExpired(now)
	if limit.DailyLimit > 0 {
		if expiredDaily {
			limit.DailyUsed = amount
			limit.DailyStart = now.Unix()
		} else {
			limit.DailyUsed += amount
		}
	}
	if limit.WeeklyLimit > 0 {
		if expiredWeekly {
			limit.WeeklyUsed = amount
			limit.WeeklyStart = now.Unix()
		} else {
			limit.WeeklyUsed += amount
		}
	}
	if limit.TotalLimit > 0 {
		limit.TotalUsed += amount
	}
}

// QuotaForModel returns the gate that applies to a model: the per-model
// override when present, otherwise the channel-level gate.
func (s *ChannelOtherSettings) QuotaForModel(model string) *ChannelQuotaLimit {
	if s == nil {
		return nil
	}
	for i := range s.ModelQuotas {
		if s.ModelQuotas[i].Model == model {
			return &s.ModelQuotas[i].ChannelQuotaLimit
		}
	}
	return s.Quota
}

// UpstreamRatioForModel returns the recorded upstream cost multiplier for a
// model, falling back to the channel default.
func (s *ChannelOtherSettings) UpstreamRatioForModel(model string) float64 {
	if s == nil {
		return 0
	}
	for i := range s.ModelUpstreamRatios {
		if s.ModelUpstreamRatios[i].Model == model {
			return s.ModelUpstreamRatios[i].Multiplier
		}
	}
	return s.UpstreamRatio
}

// ModelQuotaExceeded reports whether the model is blocked by its quota gate.
func (s *ChannelOtherSettings) ModelQuotaExceeded(model string, now time.Time) bool {
	return s.QuotaForModel(model).Exceeded(now)
}

// ValidateChannelQuota checks the quota and upstream-ratio configuration at
// save time. Limits and ratios must be finite and non-negative; a reset
// timezone must resolve.
func (s *ChannelOtherSettings) ValidateChannelQuota() error {
	if s == nil {
		return nil
	}
	limits := make([]*ChannelQuotaLimit, 0, len(s.ModelQuotas)+1)
	if s.Quota != nil {
		limits = append(limits, s.Quota)
	}
	for i := range s.ModelQuotas {
		if strings.TrimSpace(s.ModelQuotas[i].Model) == "" {
			return fmt.Errorf("model_quotas[%d]: model is required", i)
		}
		limits = append(limits, &s.ModelQuotas[i].ChannelQuotaLimit)
	}
	for _, limit := range limits {
		if err := limit.validate(); err != nil {
			return err
		}
	}
	if !validRatio(s.UpstreamRatio) {
		return fmt.Errorf("invalid upstream_ratio: %v", s.UpstreamRatio)
	}
	for i := range s.ModelUpstreamRatios {
		entry := &s.ModelUpstreamRatios[i]
		if strings.TrimSpace(entry.Model) == "" {
			return fmt.Errorf("model_upstream_ratios[%d]: model is required", i)
		}
		if !validRatio(entry.Multiplier) {
			return fmt.Errorf("invalid model_upstream_ratios[%d] multiplier: %v", i, entry.Multiplier)
		}
	}
	return nil
}

func (limit *ChannelQuotaLimit) validate() error {
	values := map[string]float64{
		"daily_limit":  limit.DailyLimit,
		"weekly_limit": limit.WeeklyLimit,
		"total_limit":  limit.TotalLimit,
		"daily_used":   limit.DailyUsed,
		"weekly_used":  limit.WeeklyUsed,
		"total_used":   limit.TotalUsed,
	}
	for name, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
			return fmt.Errorf("invalid %s: %v", name, value)
		}
	}
	if limit.DailyResetMode != "" &&
		limit.DailyResetMode != ChannelQuotaResetRolling &&
		limit.DailyResetMode != ChannelQuotaResetFixed {
		return fmt.Errorf("invalid daily_reset_mode: %s", limit.DailyResetMode)
	}
	if limit.WeeklyResetMode != "" &&
		limit.WeeklyResetMode != ChannelQuotaResetRolling &&
		limit.WeeklyResetMode != ChannelQuotaResetFixed {
		return fmt.Errorf("invalid weekly_reset_mode: %s", limit.WeeklyResetMode)
	}
	if limit.DailyResetHour < 0 || limit.DailyResetHour > 23 {
		return fmt.Errorf("invalid daily_reset_hour: %d", limit.DailyResetHour)
	}
	if limit.WeeklyResetHour < 0 || limit.WeeklyResetHour > 23 {
		return fmt.Errorf("invalid weekly_reset_hour: %d", limit.WeeklyResetHour)
	}
	if limit.WeeklyResetDay < 0 || limit.WeeklyResetDay > 6 {
		return fmt.Errorf("invalid weekly_reset_day: %d", limit.WeeklyResetDay)
	}
	if strings.TrimSpace(limit.ResetTimezone) != "" {
		if _, err := time.LoadLocation(limit.ResetTimezone); err != nil {
			return fmt.Errorf("invalid reset_timezone: %s", limit.ResetTimezone)
		}
	}
	return nil
}

func validRatio(value float64) bool {
	return value >= 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}
