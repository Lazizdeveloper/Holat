import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { ClaimsService } from './claims.service';
import { CreateClaimByIssueDto } from './dto/create-claim-by-issue.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { ListClaimsQueryDto } from './dto/list-claims-query.dto';
import { VoteClaimDto } from './dto/vote-claim.dto';

@ApiTags('claims')
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Get()
  list(@Query() query: ListClaimsQueryDto) {
    return this.claimsService.list(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GOV, UserRole.ADMIN)
  @ApiBearerAuth()
  @Post()
  create(@Body() dto: CreateClaimDto, @CurrentUser() user: JwtUser) {
    return this.claimsService.create(dto, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.GOV, UserRole.ADMIN)
  @ApiBearerAuth()
  @Post('issues/:issueId')
  createForIssue(
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
    @Body() dto: CreateClaimByIssueDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.claimsService.createForIssue(issueId, dto, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN, UserRole.ADMIN)
  @ApiBearerAuth()
  @Post(':id/vote')
  vote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VoteClaimDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.claimsService.vote(id, user.sub, dto.type);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN, UserRole.ADMIN)
  @ApiBearerAuth()
  @Post('issues/:issueId/vote')
  voteForIssue(
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
    @Body() dto: VoteClaimDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.claimsService.voteForIssue(issueId, user.sub, dto.type);
  }
}
