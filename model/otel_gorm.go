package model

import (
	"errors"

	"github.com/QuantumNous/new-api/pkg/tracing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	oteltrace "go.opentelemetry.io/otel/trace"
	"gorm.io/gorm"
)

// zhaoyj add: OpenTelemetry SQL 埋点。
// 为每个 GORM 操作创建一个 client span，挂在当前请求 span 下，从而在 trace 里看到每次请求的 SQL 拆解。
// 只有当调用方通过 DB.WithContext(c.Request.Context()) 把携带活动 span 的上下文传进来时才建 span；
// 否则直接跳过，绝不会为单条 SQL 新建独立 trace。未启用追踪时全局 provider 为 no-op，运行期零开销。
const otelGormSpanKey = "otel:span"

func registerOTelGormTracing(db *gorm.DB) {
	cb := db.Callback()
	cb.Create().Before("gorm:create").Register("otel:before_create", otelGormBefore("create"))
	cb.Create().After("gorm:create").Register("otel:after_create", otelGormAfter)
	cb.Query().Before("gorm:query").Register("otel:before_query", otelGormBefore("query"))
	cb.Query().After("gorm:query").Register("otel:after_query", otelGormAfter)
	cb.Row().Before("gorm:row").Register("otel:before_row", otelGormBefore("row"))
	cb.Row().After("gorm:row").Register("otel:after_row", otelGormAfter)
	cb.Raw().Before("gorm:raw").Register("otel:before_raw", otelGormBefore("raw"))
	cb.Raw().After("gorm:raw").Register("otel:after_raw", otelGormAfter)
	cb.Update().Before("gorm:update").Register("otel:before_update", otelGormBefore("update"))
	cb.Update().After("gorm:update").Register("otel:after_update", otelGormAfter)
	cb.Delete().Before("gorm:delete").Register("otel:before_delete", otelGormBefore("delete"))
	cb.Delete().After("gorm:delete").Register("otel:after_delete", otelGormAfter)
}

func otelGormBefore(operation string) func(*gorm.DB) {
	tracer := otel.Tracer(tracing.TracerName)
	return func(db *gorm.DB) {
		if db.Statement == nil || db.Statement.Context == nil {
			return
		}
		ctx := db.Statement.Context
		// 仅在上下文已有活动 span（请求追踪）时创建子 span。若无父级，就跳过，
		// 避免每条 SQL 都成为独立 trace，既是噪音也烧配额。
		if !oteltrace.SpanFromContext(ctx).SpanContext().IsValid() {
			return
		}
		_, span := tracer.Start(ctx, "db."+operation, oteltrace.WithSpanKind(oteltrace.SpanKindClient))
		db.InstanceSet(otelGormSpanKey, span)
	}
}

func otelGormAfter(db *gorm.DB) {
	if db.Statement == nil {
		return
	}
	v, ok := db.InstanceGet(otelGormSpanKey)
	if !ok {
		return
	}
	span, ok := v.(oteltrace.Span)
	if !ok || span == nil {
		return
	}
	// Statement.SQL 是带占位符（?/$n）的参数化语句，实际取值在 Statement.Vars 里，不会泄露数据。
	span.SetAttributes(attribute.String("db.statement", db.Statement.SQL.String()))
	if db.Dialector != nil {
		span.SetAttributes(attribute.String("db.system", db.Dialector.Name()))
	}
	if db.Statement.Table != "" {
		span.SetAttributes(attribute.String("db.sql.table", db.Statement.Table))
	}
	span.SetAttributes(attribute.Int64("db.rows_affected", db.Statement.RowsAffected))
	if err := db.Statement.Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		// 复用日志层的脱敏逻辑：驱动错误可能内联数据值，收敛为错误码后再记录。
		sanitized := sanitizeDBError(err)
		span.RecordError(sanitized)
		span.SetStatus(codes.Error, sanitized.Error())
	}
	span.End()
}
