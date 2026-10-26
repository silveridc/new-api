package dto

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelQuotaRollingWindowAccumulatesAndExpires(t *testing.T) {
	start := time.Date(2026, 1, 1, 8, 0, 0, 0, time.UTC)
	limit := &ChannelQuotaLimit{
		Enabled:         true,
		DailyLimit:      10,
		TotalLimit:      100,
		WeeklyLimit:     50,
		DailyResetMode:  ChannelQuotaResetRolling,
		WeeklyResetMode: ChannelQuotaResetRolling,
	}

	limit.Accumulate(start, 4)
	assert.InDelta(t, 4, limit.DailyUsed, 1e-9)
	assert.InDelta(t, 4, limit.WeeklyUsed, 1e-9)
	assert.InDelta(t, 4, limit.TotalUsed, 1e-9)

	// Same window keeps summing.
	limit.Accumulate(start.Add(time.Hour), 3)
	assert.InDelta(t, 7, limit.DailyUsed, 1e-9)

	// A new day starts the daily window while the weekly one continues.
	nextDay := start.Add(24 * time.Hour)
	limit.Accumulate(nextDay, 2)
	assert.InDelta(t, 2, limit.DailyUsed, 1e-9)
	assert.InDelta(t, 9, limit.WeeklyUsed, 1e-9)
	assert.InDelta(t, 9, limit.TotalUsed, 1e-9)
}

func TestChannelQuotaExceededOnlyAfterEnabledDimensionReached(t *testing.T) {
	now := time.Date(2026, 1, 1, 8, 0, 0, 0, time.UTC)
	limit := &ChannelQuotaLimit{
		Enabled:        true,
		DailyLimit:     5,
		DailyResetMode: ChannelQuotaResetRolling,
		DailyUsed:      5,
		DailyStart:     now.Unix(),
	}
	assert.True(t, limit.Exceeded(now))

	// Once the window expired the model is schedulable again.
	assert.False(t, limit.Exceeded(now.Add(24*time.Hour+time.Minute)))

	// A disabled gate never blocks traffic, even with stale usage.
	limit.Enabled = false
	assert.False(t, limit.Exceeded(now))
}

func TestChannelQuotaFixedWindowsFollowTimezone(t *testing.T) {
	shanghai, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)

	// 2026-01-05 10:00 in Shanghai.
	now := time.Date(2026, 1, 5, 10, 0, 0, 0, shanghai)
	limit := &ChannelQuotaLimit{
		Enabled:        true,
		DailyLimit:     10,
		DailyResetMode: ChannelQuotaResetFixed,
		DailyResetHour: 4,
		ResetTimezone:  "Asia/Shanghai",
		DailyUsed:      9,
		DailyStart:     time.Date(2026, 1, 5, 4, 30, 0, 0, shanghai).Unix(),
	}
	assert.False(t, limit.Exceeded(now), "same fixed day still counts previous usage")

	limit.Accumulate(now, 2)
	assert.InDelta(t, 11, limit.DailyUsed, 1e-9)

	// Crossing 04:00 locally expires the window.
	assert.False(t, limit.Exceeded(time.Date(2026, 1, 6, 4, 1, 0, 0, shanghai)))
}

func TestChannelQuotaModelOverrideWins(t *testing.T) {
	now := time.Now()
	settings := &ChannelOtherSettings{
		Quota: &ChannelQuotaLimit{Enabled: true, DailyLimit: 1, DailyResetMode: ChannelQuotaResetRolling, DailyUsed: 5, DailyStart: now.Unix()},
		ModelQuotas: []ChannelModelQuota{{
			Model:             "gpt-4o",
			ChannelQuotaLimit: ChannelQuotaLimit{Enabled: true, DailyLimit: 100, DailyResetMode: ChannelQuotaResetRolling},
		}},
	}
	assert.True(t, settings.ModelQuotaExceeded("gpt-4.1", now), "channel gate applies to other models")
	assert.False(t, settings.ModelQuotaExceeded("gpt-4o", now), "model override replaces the channel gate")
}

func TestChannelQuotaValidationRejectsBadInput(t *testing.T) {
	require.NoError(t, (&ChannelOtherSettings{
		Quota: &ChannelQuotaLimit{Enabled: true, DailyLimit: 1, DailyResetMode: ChannelQuotaResetFixed, DailyResetHour: 23, ResetTimezone: "Asia/Shanghai"},
	}).ValidateChannelQuota())

	assert.Error(t, (&ChannelOtherSettings{
		Quota: &ChannelQuotaLimit{Enabled: true, DailyLimit: -1},
	}).ValidateChannelQuota())
	assert.Error(t, (&ChannelOtherSettings{
		Quota: &ChannelQuotaLimit{Enabled: true, DailyResetMode: "weekly"},
	}).ValidateChannelQuota())
	assert.Error(t, (&ChannelOtherSettings{
		Quota: &ChannelQuotaLimit{Enabled: true, ResetTimezone: "Mars/Olympus"},
	}).ValidateChannelQuota())
	assert.Error(t, (&ChannelOtherSettings{
		ModelQuotas: []ChannelModelQuota{{Model: ""}},
	}).ValidateChannelQuota())
	assert.Error(t, (&ChannelOtherSettings{UpstreamRatio: -2}).ValidateChannelQuota())
}

func TestChannelUpstreamRatioFallsBackToChannelDefault(t *testing.T) {
	settings := &ChannelOtherSettings{
		UpstreamRatio: 0.8,
		ModelUpstreamRatios: []ChannelUpstreamRatio{
			{Model: "gpt-4o", Multiplier: 0.5},
		},
	}
	assert.InDelta(t, 0.5, settings.UpstreamRatioForModel("gpt-4o"), 1e-9)
	assert.InDelta(t, 0.8, settings.UpstreamRatioForModel("gpt-4.1"), 1e-9)
}
