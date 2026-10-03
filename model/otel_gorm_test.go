package model

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"gorm.io/gorm"
)

type otelTracingRow struct {
	ID   uint `gorm:"primarykey"`
	Name string
}

func newTracedOTelDB(t *testing.T) (*gorm.DB, *tracetest.SpanRecorder) {
	t.Helper()

	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	prev := otel.GetTracerProvider()
	otel.SetTracerProvider(tp)
	t.Cleanup(func() { otel.SetTracerProvider(prev) })

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&otelTracingRow{}))
	registerOTelGormTracing(db)
	return db, recorder
}

func findGormSpan(spans []sdktrace.ReadOnlySpan) sdktrace.ReadOnlySpan {
	for _, s := range spans {
		if len(s.Name()) >= 3 && s.Name()[:3] == "db." {
			return s
		}
	}
	return nil
}

// 在请求 span 下执行查询时，SQL 应作为子 span 记录，且查询结果不受影响。
func TestOTelGormTracing_NestsSpanUnderParent(t *testing.T) {
	db, recorder := newTracedOTelDB(t)

	tracer := otel.Tracer("test")
	ctx, parent := tracer.Start(context.Background(), "request")

	require.NoError(t, db.WithContext(ctx).Create(&otelTracingRow{Name: "alice"}).Error)
	var got otelTracingRow
	require.NoError(t, db.WithContext(ctx).First(&got).Error)
	parent.End()

	assert.Equal(t, "alice", got.Name, "query result must be unaffected by tracing")

	span := findGormSpan(recorder.Ended())
	require.NotNil(t, span, "a db.* child span should be recorded")
	assert.Equal(t, parent.SpanContext().TraceID(), span.SpanContext().TraceID(),
		"db span must share the parent's trace")

	var hasSQL, hasSystem bool
	for _, attr := range span.Attributes() {
		switch attr.Key {
		case "db.statement":
			hasSQL = attr.Value.AsString() != ""
		case "db.system":
			hasSystem = attr.Value.AsString() == "sqlite"
		}
	}
	assert.True(t, hasSQL, "span should carry the parameterized SQL")
	assert.True(t, hasSystem, "span should record db.system=sqlite")
}

// 没有活动父 span 时不得为单条 SQL 新建独立 trace（否则每条查询都上报，噪音且烧配额）。
func TestOTelGormTracing_NoParentEmitsNothing(t *testing.T) {
	db, recorder := newTracedOTelDB(t)

	require.NoError(t, db.Create(&otelTracingRow{Name: "bob"}).Error)
	var got otelTracingRow
	require.NoError(t, db.First(&got).Error)

	assert.Equal(t, "bob", got.Name)
	assert.Nil(t, findGormSpan(recorder.Ended()),
		"queries without an active parent span must not create standalone traces")
}
