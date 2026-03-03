import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { SentryService } from './sentry.service';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, SentryService],
  exports: [MetricsService, SentryService],
})
export class MonitoringModule {}
