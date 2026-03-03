import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from './interfaces/jwt-user.interface';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterCitizenDto } from './dto/register-citizen.dto';
import { RegisterGovDto } from './dto/register-gov.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

type RequestLike = {
  ip?: string;
  method?: string;
  path?: string;
  headers?: {
    'user-agent'?: string;
  };
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/citizen')
  registerCitizen(@Body() dto: RegisterCitizenDto, @Req() request: RequestLike) {
    return this.authService.registerCitizen(dto, {
      ip: request.ip,
      method: request.method,
      path: request.path,
      userAgent: request.headers?.['user-agent'],
    });
  }

  @Post('register/gov')
  registerGov(@Body() dto: RegisterGovDto, @Req() request: RequestLike) {
    return this.authService.registerGov(dto, {
      ip: request.ip,
      method: request.method,
      path: request.path,
      userAgent: request.headers?.['user-agent'],
    });
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: RequestLike) {
    return this.authService.login(dto, {
      ip: request.ip,
      method: request.method,
      path: request.path,
      userAgent: request.headers?.['user-agent'],
    });
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @Req() request: RequestLike) {
    return this.authService.refresh(dto, {
      ip: request.ip,
      method: request.method,
      path: request.path,
      userAgent: request.headers?.['user-agent'],
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  logout(@CurrentUser() user: JwtUser, @Req() request: RequestLike) {
    return this.authService.logout(user.sub, {
      ip: request.ip,
      method: request.method,
      path: request.path,
      userAgent: request.headers?.['user-agent'],
    });
  }
}
