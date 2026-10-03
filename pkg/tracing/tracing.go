// zhaoyj add: OpenTelemetry 分布式追踪。通过 OTLP/HTTP 把 trace 上报到自建 Sentry。
package tracing

import (
	"context"
	"os"
	"strconv"

	"github.com/QuantumNous/new-api/common"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

const (
	// 默认上报到自建 Sentry 的 OTLP trace 端点；可用 OTEL_TRACES_ENDPOINT 覆盖。
	defaultOTLPEndpoint = "https://sentry.silveridc.cn/api/9/integration/otlp/v1/traces"
	// Sentry OTLP 鉴权用的 public key（与 DSN 公钥同性质，可安全内置）；可用 OTEL_TRACES_SENTRY_KEY 覆盖。
	defaultSentryOTLPKey = "f0b4c0a13c5e212101a29aac545cdba9"
	serviceName          = "new-api"

	// TracerName 是本项目统一的 instrumentation scope 名称，HTTP 中间件与 DB 埋点共用。
	TracerName = "github.com/QuantumNous/new-api"
)

// InitTracing 配置全局 TracerProvider 与传播器，返回的 shutdown 用于在进程退出时 flush。
// 设置 OTEL_TRACING_ENABLED=false 可关闭；关闭时全局 provider 保持默认 no-op，所有埋点零开销。
func InitTracing(ctx context.Context) (func(context.Context) error, error) {
	noop := func(context.Context) error { return nil }

	if os.Getenv("OTEL_TRACING_ENABLED") == "false" {
		common.SysLog("OTEL_TRACING_ENABLED=false, skipping OpenTelemetry tracing")
		return noop, nil
	}

	endpoint := os.Getenv("OTEL_TRACES_ENDPOINT")
	if endpoint == "" {
		endpoint = defaultOTLPEndpoint
	}
	sentryKey := os.Getenv("OTEL_TRACES_SENTRY_KEY")
	if sentryKey == "" {
		sentryKey = defaultSentryOTLPKey
	}

	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(endpoint),
		otlptracehttp.WithHeaders(map[string]string{
			"x-sentry-auth": "sentry sentry_key=" + sentryKey,
		}),
		otlptracehttp.WithCompression(otlptracehttp.GzipCompression),
	)
	if err != nil {
		return noop, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(resource.NewSchemaless(
			attribute.String("service.name", serviceName),
			attribute.String("service.version", common.Version),
		)),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(samplerRatio()))),
	)

	otel.SetTracerProvider(tp)
	// W3C traceparent + baggage，保证与其它 OTel 服务的 trace 能串起来。
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	common.SysLog("OpenTelemetry tracing enabled, exporting traces to " + endpoint)
	return tp.Shutdown, nil
}

// samplerRatio 读取 OTEL_TRACES_SAMPLER_RATIO（0-1），默认全采样；非法值回退 1.0。
func samplerRatio() float64 {
	v := os.Getenv("OTEL_TRACES_SAMPLER_RATIO")
	if v == "" {
		return 1.0
	}
	ratio, err := strconv.ParseFloat(v, 64)
	if err != nil || ratio < 0 || ratio > 1 {
		common.SysError("invalid OTEL_TRACES_SAMPLER_RATIO " + v + ", using default 1.0")
		return 1.0
	}
	return ratio
}
