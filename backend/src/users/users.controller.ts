import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtUser } from '../auth/interfaces/jwt-user.interface';
import { ListIssuesQueryDto } from '../issues/dto/list-issues-query.dto';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { PublicUser } from './types/public-user.type';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  async getMe(@CurrentUser() user: JwtUser): Promise<PublicUser> {
    return this.usersService.findPublicById(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me/stats')
  getMyStats(@CurrentUser() user: JwtUser) {
    return this.usersService.getMeStats(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me/issues')
  getMyIssues(@CurrentUser() user: JwtUser, @Query() query: ListIssuesQueryDto) {
    return this.usersService.getMeIssues(user.sub, query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me/preferences')
  getMyPreferences(@CurrentUser() user: JwtUser) {
    return this.usersService.getMePreferences(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('me/preferences')
  patchMyPreferences(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    return this.usersService.updateMePreferences(user.sub, dto);
  }
}
