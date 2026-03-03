/* eslint-disable no-console */
import { strict as assert } from 'assert';
import { rm, stat } from 'fs/promises';
import { join } from 'path';
import { MetricsService } from '../src/monitoring/metrics.service';
import { UploadsService } from '../src/uploads/uploads.service';

type ConfigMap = Record<string, string>;

class MockConfigService {
  constructor(private readonly values: ConfigMap) {}

  get<T = string>(key: string, defaultValue?: T): T {
    const value = this.values[key];
    if (value === undefined) {
      return defaultValue as T;
    }
    return value as T;
  }
}

async function testUploadsLocalDriver() {
  const testUploadDir = `uploads-unit-${Date.now()}`;
  const config = new MockConfigService({
    UPLOAD_DRIVER: 'local',
    UPLOAD_DIR: testUploadDir,
    UPLOAD_MAX_FILE_MB: '5',
    UPLOAD_CLEANUP_DAYS: '30',
  });

  const uploads = new UploadsService(config as never);
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgwJ/lU2xVQAAAABJRU5ErkJggg==',
    'base64',
  );

  const result = await uploads.saveImage(
    {
      originalname: 'unit.png',
      mimetype: 'image/png',
      size: pngBuffer.length,
      buffer: pngBuffer,
    },
    { protocol: 'http', host: 'localhost:4000' },
  );

  assert.equal(result.driver, 'local');
  assert.equal(result.imageUrl.startsWith('/uploads/'), true);

  const storedPath = join(process.cwd(), testUploadDir, result.fileName);
  const fileStat = await stat(storedPath);
  assert.equal(fileStat.isFile(), true);

  await rm(join(process.cwd(), testUploadDir), { recursive: true, force: true });
  console.log('[unit] uploads local driver: ok');
}

function testMetricsService() {
  const config = new MockConfigService({
    METRICS_ENABLED: 'true',
    ALERT_ERROR_RATE_THRESHOLD: '0.3',
    METRICS_API_KEY: 'secret-key',
  });
  const metrics = new MetricsService(config as never);

  metrics.recordRequest({
    method: 'GET',
    path: '/health',
    statusCode: 200,
    durationMs: 10,
  });
  metrics.recordRequest({
    method: 'POST',
    path: '/auth/login',
    statusCode: 500,
    durationMs: 45,
  });

  const summary = metrics.getSummary() as {
    enabled: boolean;
    totals: { requests: number; serverErrors: number };
  };
  assert.equal(summary.enabled, true);
  assert.equal(summary.totals.requests, 2);
  assert.equal(summary.totals.serverErrors, 1);
  assert.equal(metrics.validateApiKey('secret-key'), true);
  assert.equal(metrics.validateApiKey('wrong'), false);

  const prometheus = metrics.getPrometheusText();
  assert.equal(prometheus.includes('holat_requests_total 2'), true);
  console.log('[unit] metrics service: ok');
}

async function main() {
  await testUploadsLocalDriver();
  testMetricsService();
  console.log('[unit] all checks passed');
}

main().catch((error) => {
  console.error(`[unit] failed: ${(error as Error).message}`);
  process.exit(1);
});
