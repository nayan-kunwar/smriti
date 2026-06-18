import { context, trace } from '@opentelemetry/api';

/** W3C traceparent header derived from the active span, if any. */
export function getTraceparent(): string | undefined {
  const span = trace.getSpan(context.active());
  if (!span) return undefined;

  const { traceId, spanId, traceFlags } = span.spanContext();
  if (!traceId || !spanId) return undefined;

  return `00-${traceId}-${spanId}-${traceFlags.toString(16).padStart(2, '0')}`;
}
