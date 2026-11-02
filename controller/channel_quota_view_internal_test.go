package controller

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewChannelQuotaDimension(t *testing.T) {
	dimension := newChannelQuotaDimension(100, 40)
	require.NotNil(t, dimension.Remaining)
	assert.InDelta(t, 60, *dimension.Remaining, 1e-9)

	overdrawn := newChannelQuotaDimension(100, 120)
	require.NotNil(t, overdrawn.Remaining)
	assert.InDelta(t, 0, *overdrawn.Remaining, 1e-9)

	// A zero limit means the dimension is unlimited, so nothing is left to show.
	unlimited := newChannelQuotaDimension(0, 5)
	assert.Nil(t, unlimited.Remaining)
	assert.InDelta(t, 5, unlimited.Used, 1e-9)
}

func TestNewChannelQuotaScopeReadsLiveWindows(t *testing.T) {
	now := time.Now()
	limit := &dto.ChannelQuotaLimit{
		Enabled:    true,
		DailyLimit: 10,
		DailyUsed:  8,
		DailyStart: now.Add(-25 * time.Hour).Unix(),
		TotalLimit: 100,
		TotalUsed:  90,
	}

	scope := newChannelQuotaScope("gpt-4o", limit)
	assert.Equal(t, "gpt-4o", scope.Model)
	assert.True(t, scope.Enabled)
	// The rolling day already ended, so its usage is not carried over.
	assert.InDelta(t, 0, scope.Daily.Used, 1e-9)
	require.NotNil(t, scope.Daily.Remaining)
	assert.InDelta(t, 10, *scope.Daily.Remaining, 1e-9)
	assert.InDelta(t, 90, scope.Total.Used, 1e-9)
	require.NotNil(t, scope.Total.Remaining)
	assert.InDelta(t, 10, *scope.Total.Remaining, 1e-9)
	assert.InDelta(t, 0, scope.Weekly.Limit, 1e-9)
	assert.Nil(t, scope.Weekly.Remaining)

	limit.DailyStart = now.Add(-time.Hour).Unix()
	currentDay := newChannelQuotaScope("", limit)
	assert.InDelta(t, 8, currentDay.Daily.Used, 1e-9)
	require.NotNil(t, currentDay.Daily.Remaining)
	assert.InDelta(t, 2, *currentDay.Daily.Remaining, 1e-9)
}

func TestNewChannelQuotaScopeWithoutGate(t *testing.T) {
	scope := newChannelQuotaScope("gpt-4o", nil)
	assert.Equal(t, "gpt-4o", scope.Model)
	assert.False(t, scope.Enabled)
	assert.InDelta(t, 0, scope.Daily.Limit, 1e-9)
	assert.Nil(t, scope.Daily.Remaining)
	assert.Nil(t, scope.Weekly.Remaining)
	assert.Nil(t, scope.Total.Remaining)
}
