import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type DynamicSentry = {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
};

@Injectable()
export class SentryService implements OnModuleInit {
  private readonly logger = new Logger(SentryService.name);
  private readonly sentryEnabled: boolean;
  private readonly sentryDsn: string | null;
  private readonly tracesSampleRate: number;
  private sentry: DynamicSentry | null = null;

  constructor(private readonly configService: ConfigService) {
    this.sentryEnabled =
      this.configService.get<string>('SENTRY_ENABLED', 'false') === 'true';
    this.sentryDsn =
      this.configService.get<string>('SENTRY_DSN', '').trim() || null;
    this.tracesSampleRate = Number(
      this.configService.get<string>('SENTRY_TRACES_SAMPLE_RATE', '0.1'),
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.sentryEnabled) {
      return;
    }
    if (!this.sentryDsn) {
      this.logger.warn('SENTRY_ENABLED=true but SENTRY_DSN is empty');
      return;
    }

    try {
      const dynamicImporter = new Function(
        'moduleName',
        'return import(moduleName);',
      ) as (moduleName: string) => Promise<unknown>;
      this.sentry = (await dynamicImporter('@sentry/node')) as DynamicSentry;
      this.sentry.init({
        dsn: this.sentryDsn,
        tracesSampleRate: this.tracesSampleRate,
      });
      this.logger.log('Sentry initialized');
    } catch {
      this.logger.warn(
        'Sentry package is not installed. Run npm i @sentry/node to enable.',
      );
    }
  }

  captureException(
    error: unknown,
    context?: Record<string, unknown>,
  ): void {
    if (!this.sentry) {
      return;
    }

    try {
      this.sentry.captureException(error, { extra: context || {} });
    } catch {
      // ignore capture failures
    }
  }
}
