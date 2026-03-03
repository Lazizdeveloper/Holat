import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('monitoring')
@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  getMetrics(@Headers('x-metrics-api-key') apiKey?: string) {
    this.ensureAuthorized(apiKey);
    return this.metricsService.getSummary();
  }

  @Get('metrics/prometheus')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain; version=0.0.4')
  getPrometheus(@Headers('x-metrics-api-key') apiKey?: string) {
    this.ensureAuthorized(apiKey);
    return this.metricsService.getPrometheusText();
  }

  private ensureAuthorized(apiKey?: string): void {
    if (!this.metricsService.validateApiKey(apiKey)) {
      throw new UnauthorizedException('Invalid metrics API key');
    }
  }
}
