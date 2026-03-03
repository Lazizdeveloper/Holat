import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsListQueryDto } from './dto/analytics-list-query.dto';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('regions')
  getRegions(@Query() query: AnalyticsListQueryDto) {
    return this.analyticsService.getRegions(query);
  }

  @Get('ministries')
  getMinistries(@Query() query: AnalyticsListQueryDto) {
    return this.analyticsService.getMinistries(query);
  }

  @Get('overview')
  getOverview() {
    return this.analyticsService.getOverview();
  }
}
