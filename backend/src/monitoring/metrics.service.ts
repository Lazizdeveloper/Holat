import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type RequestMetric = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};

type WindowSample = {
  timestamp: number;
  statusCode: number;
};

type MetricsSummaryDisabled = {
  enabled: false;
};

type MetricsSummaryEnabled = {
  enabled: true;
  totals: {
    requests: number;
    serverErrors: number;
    clientErrors: number;
    avgDurationMs: number;
  };
  windows: {
    lastMinute: {
      requests: number;
      serverErrors: number;
      clientErrors: number;
      errorRate: number;
    };
    lastFiveMinutes: {
      requests: number;
      serverErrors: number;
      clientErrors: number;
      errorRate: number;
    };
  };
  alerts: {
    errorRateThreshold: number;
    lastAlertAt: string | null;
  };
  routeTop: Array<{ route: string; count: number }>;
  statusBreakdown: Array<{ statusCode: number; count: number }>;
};

type MetricsSummary = MetricsSummaryDisabled | MetricsSummaryEnabled;

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly enabled: boolean;
  private readonly metricsApiKey: string | null;
  private readonly alertErrorRateThreshold: number;
  private readonly samples: WindowSample[] = [];
  private totalRequests = 0;
  private totalServerErrors = 0;
  private totalClientErrors = 0;
  private totalDurationMs = 0;
  private lastAlertAt = 0;
  private readonly routeCounters = new Map<string, number>();
  private readonly statusCounters = new Map<number, number>();

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<string>('METRICS_ENABLED', 'true') === 'true';
    this.metricsApiKey =
      this.configService.get<string>('METRICS_API_KEY', '').trim() || null;
    this.alertErrorRateThreshold = Number(
      this.configService.get<string>('ALERT_ERROR_RATE_THRESHOLD', '0.2'),
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  validateApiKey(providedApiKey?: string | null): boolean {
    if (!this.metricsApiKey) {
      return true;
    }
    return providedApiKey === this.metricsApiKey;
  }

  recordRequest(metric: RequestMetric): void {
    if (!this.enabled) {
      return;
    }

    this.totalRequests += 1;
    this.totalDurationMs += metric.durationMs;
    this.statusCounters.set(
      metric.statusCode,
      (this.statusCounters.get(metric.statusCode) || 0) + 1,
    );

    const routeKey = `${metric.method.toUpperCase()} ${metric.path}`;
    this.routeCounters.set(routeKey, (this.routeCounters.get(routeKey) || 0) + 1);

    if (metric.statusCode >= 500) {
      this.totalServerErrors += 1;
    } else if (metric.statusCode >= 400) {
      this.totalClientErrors += 1;
    }

    this.samples.push({ timestamp: Date.now(), statusCode: metric.statusCode });
    this.cleanupOldSamples();
    this.maybeAlertOnErrorRate();
  }

  getSummary(): MetricsSummary {
    if (!this.enabled) {
      return { enabled: false };
    }

    const lastMinute = this.getWindowStats(60_000);
    const lastFiveMinutes = this.getWindowStats(5 * 60_000);
    const avgDurationMs = this.totalRequests
      ? Math.round((this.totalDurationMs / this.totalRequests) * 100) / 100
      : 0;

    return {
      enabled: true,
      totals: {
        requests: this.totalRequests,
        serverErrors: this.totalServerErrors,
        clientErrors: this.totalClientErrors,
        avgDurationMs,
      },
      windows: {
        lastMinute,
        lastFiveMinutes,
      },
      alerts: {
        errorRateThreshold: this.alertErrorRateThreshold,
        lastAlertAt:
          this.lastAlertAt > 0 ? new Date(this.lastAlertAt).toISOString() : null,
      },
      routeTop: [...this.routeCounters.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 20)
        .map(([route, count]) => ({ route, count })),
      statusBreakdown: [...this.statusCounters.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([statusCode, count]) => ({ statusCode, count })),
    };
  }

  getPrometheusText(): string {
    const summary = this.getSummary();
    if (!summary.enabled) {
      return '# Metrics disabled';
    }

    const lines: string[] = [];
    lines.push('# HELP holat_requests_total Total HTTP requests');
    lines.push('# TYPE holat_requests_total counter');
    lines.push(`holat_requests_total ${summary.totals.requests}`);
    lines.push('');
    lines.push('# HELP holat_http_errors_total Total HTTP errors');
    lines.push('# TYPE holat_http_errors_total counter');
    lines.push(
      `holat_http_errors_total{type="4xx"} ${summary.totals.clientErrors}`,
    );
    lines.push(
      `holat_http_errors_total{type="5xx"} ${summary.totals.serverErrors}`,
    );
    lines.push('');
    lines.push('# HELP holat_request_duration_avg_ms Average request duration in ms');
    lines.push('# TYPE holat_request_duration_avg_ms gauge');
    lines.push(`holat_request_duration_avg_ms ${summary.totals.avgDurationMs}`);
    lines.push('');
    lines.push('# HELP holat_error_rate_last_minute Error rate in the last minute');
    lines.push('# TYPE holat_error_rate_last_minute gauge');
    lines.push(
      `holat_error_rate_last_minute ${summary.windows.lastMinute.errorRate}`,
    );

    return lines.join('\n');
  }

  private cleanupOldSamples(): void {
    const cutoff = Date.now() - 5 * 60_000;
    while (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }
  }

  private getWindowStats(windowMs: number) {
    const cutoff = Date.now() - windowMs;
    const windowSamples = this.samples.filter((sample) => sample.timestamp >= cutoff);
    const requests = windowSamples.length;
    const serverErrors = windowSamples.filter(
      (sample) => sample.statusCode >= 500,
    ).length;
    const clientErrors = windowSamples.filter(
      (sample) => sample.statusCode >= 400 && sample.statusCode < 500,
    ).length;
    const errorRate = requests > 0 ? serverErrors / requests : 0;

    return {
      requests,
      serverErrors,
      clientErrors,
      errorRate: Math.round(errorRate * 10000) / 10000,
    };
  }

  private maybeAlertOnErrorRate(): void {
    const stats = this.getWindowStats(60_000);
    if (stats.requests < 20) {
      return;
    }
    if (stats.errorRate < this.alertErrorRateThreshold) {
      return;
    }

    const now = Date.now();
    const cooldown = 5 * 60_000;
    if (now - this.lastAlertAt < cooldown) {
      return;
    }
    this.lastAlertAt = now;
    this.logger.warn(
      `High error rate detected in last minute: ${(stats.errorRate * 100).toFixed(
        2,
      )}% (threshold ${(this.alertErrorRateThreshold * 100).toFixed(2)}%)`,
    );
  }
}
