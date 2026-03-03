import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtUser } from '../auth/interfaces/jwt-user.interface';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateIssueDto } from './dto/create-issue.dto';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { UpdateIssueStatusDto } from './dto/update-issue-status.dto';
import { IssuesService } from './issues.service';

@ApiTags('issues')
@Controller('issues')
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Get()
  list(@Query() query: ListIssuesQueryDto) {
    return this.issuesService.list(query);
  }

  @Get('feed')
  @UseGuards(OptionalJwtAuthGuard)
  listFeed(@Query() query: ListIssuesQueryDto, @CurrentUser() user?: JwtUser) {
    return this.issuesService.listFeed(query, user?.sub);
  }

  @Get('feed/:id')
  @UseGuards(OptionalJwtAuthGuard)
  findOneFeed(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.issuesService.findOneFeed(id, user?.sub);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.issuesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN, UserRole.ADMIN)
  @ApiBearerAuth()
  @Post()
  create(@Body() dto: CreateIssueDto, @CurrentUser() user: JwtUser) {
    return this.issuesService.create(dto, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN, UserRole.ADMIN)
  @ApiBearerAuth()
  @Post(':id/upvote')
  upvote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.issuesService.upvote(id, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GOV, UserRole.ADMIN)
  @ApiBearerAuth()
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateIssueStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.issuesService.updateStatus(id, dto.status, user.sub);
  }
}
