import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/entities/user.entity';
import { PublicUser } from '../users/types/public-user.type';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterCitizenDto } from './dto/register-citizen.dto';
import { RegisterGovDto } from './dto/register-gov.dto';
import { JwtUser } from './interfaces/jwt-user.interface';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  user: PublicUser;
};

type AuthRequestMeta = {
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
};

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: string;
  private readonly maxLoginAttempts: number;
  private readonly loginLockMinutes: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_SECRET', 'replace_with_strong_secret');
    this.refreshExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '30d',
    );
    this.maxLoginAttempts = Number(
      this.configService.get<string>('AUTH_MAX_LOGIN_ATTEMPTS', '5'),
    );
    this.loginLockMinutes = Number(
      this.configService.get<string>('AUTH_LOGIN_LOCK_MINUTES', '15'),
    );
  }

  async registerCitizen(
    dto: RegisterCitizenDto,
    meta?: AuthRequestMeta,
  ): Promise<AuthResponse> {
    await this.ensureEmailIsFree(dto.email);
    await this.ensurePinflIsFree(dto.pinfl);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.createCitizen({
      fullName: dto.fullName,
      email: dto.email,
      passwordHash,
      pinfl: dto.pinfl,
      phone: dto.phone,
      region: dto.region,
    });

    await this.auditService.create({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.register.citizen',
      outcome: 'success',
      requestIp: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      requestMethod: meta?.method ?? null,
      requestPath: meta?.path ?? null,
      details: {
        role: user.role,
      },
    });

    return this.buildAuthResponse(user);
  }

  async registerGov(
    dto: RegisterGovDto,
    meta?: AuthRequestMeta,
  ): Promise<AuthResponse> {
    await this.ensureEmailIsFree(dto.email);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.createGov({
      fullName: dto.fullName,
      email: dto.email,
      passwordHash,
      position: dto.position,
      ministryKey: dto.ministryKey,
      ministryName: dto.ministryName,
      region: dto.region,
    });

    await this.auditService.create({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.register.gov',
      outcome: 'success',
      requestIp: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      requestMethod: meta?.method ?? null,
      requestPath: meta?.path ?? null,
      details: {
        role: user.role,
        ministryKey: user.ministryKey,
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto, meta?: AuthRequestMeta): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await this.auditService.create({
        actorEmail: dto.email.trim().toLowerCase(),
        action: 'auth.login',
        outcome: 'failure',
        requestIp: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        requestMethod: meta?.method ?? null,
        requestPath: meta?.path ?? null,
        details: { reason: 'user_not_found' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.loginLockedUntil && user.loginLockedUntil.getTime() > Date.now()) {
      await this.auditService.create({
        actorId: user.id,
        actorEmail: user.email,
        action: 'auth.login',
        outcome: 'failure',
        requestIp: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        requestMethod: meta?.method ?? null,
        requestPath: meta?.path ?? null,
        details: {
          reason: 'login_locked',
          loginLockedUntil: user.loginLockedUntil.toISOString(),
        },
      });
      throw new UnauthorizedException('Account is temporarily locked');
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValidPassword) {
      const failed = await this.usersService.registerFailedLoginAttempt(
        user.id,
        this.maxLoginAttempts,
        this.loginLockMinutes,
      );

      await this.auditService.create({
        actorId: user.id,
        actorEmail: user.email,
        action: 'auth.login',
        outcome: 'failure',
        requestIp: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        requestMethod: meta?.method ?? null,
        requestPath: meta?.path ?? null,
        details: {
          reason: 'invalid_password',
          locked: failed.locked,
          remainingAttempts: failed.remainingAttempts,
          lockedUntil: failed.lockedUntil?.toISOString() ?? null,
        },
      });

      if (failed.locked) {
        throw new UnauthorizedException(
          `Account is locked for ${this.loginLockMinutes} minutes`,
        );
      }

      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersService.resetLoginAttempts(user.id, meta?.ip ?? null);

    await this.auditService.create({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.login',
      outcome: 'success',
      requestIp: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      requestMethod: meta?.method ?? null,
      requestPath: meta?.path ?? null,
    });

    return this.buildAuthResponse(user);
  }

  async refresh(
    dto: RefreshTokenDto,
    meta?: AuthRequestMeta,
  ): Promise<AuthResponse> {
    let payload: JwtUser;
    try {
      payload = await this.jwtService.verifyAsync<JwtUser>(dto.refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      await this.auditService.create({
        action: 'auth.refresh',
        outcome: 'failure',
        requestIp: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        requestMethod: meta?.method ?? null,
        requestPath: meta?.path ?? null,
        details: { reason: 'invalid_refresh_token_signature' },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.refreshTokenHash || !user.refreshTokenExpiresAt) {
      await this.auditService.create({
        actorId: payload.sub,
        actorEmail: payload.email,
        action: 'auth.refresh',
        outcome: 'failure',
        requestIp: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        requestMethod: meta?.method ?? null,
        requestPath: meta?.path ?? null,
        details: { reason: 'refresh_session_inactive' },
      });
      throw new UnauthorizedException('Refresh session is not active');
    }

    if (user.refreshTokenExpiresAt.getTime() <= Date.now()) {
      await this.usersService.clearRefreshSession(user.id);
      await this.auditService.create({
        actorId: user.id,
        actorEmail: user.email,
        action: 'auth.refresh',
        outcome: 'failure',
        requestIp: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        requestMethod: meta?.method ?? null,
        requestPath: meta?.path ?? null,
        details: { reason: 'refresh_token_expired' },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    const isValidRefreshToken = await bcrypt.compare(
      dto.refreshToken,
      user.refreshTokenHash,
    );
    if (!isValidRefreshToken) {
      await this.auditService.create({
        actorId: user.id,
        actorEmail: user.email,
        action: 'auth.refresh',
        outcome: 'failure',
        requestIp: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        requestMethod: meta?.method ?? null,
        requestPath: meta?.path ?? null,
        details: { reason: 'refresh_token_hash_mismatch' },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.auditService.create({
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.refresh',
      outcome: 'success',
      requestIp: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      requestMethod: meta?.method ?? null,
      requestPath: meta?.path ?? null,
    });

    return this.buildAuthResponse(user);
  }

  async logout(userId: string, meta?: AuthRequestMeta): Promise<{ success: true }> {
    const user = await this.usersService.findById(userId);
    await this.usersService.clearRefreshSession(userId);

    await this.auditService.create({
      actorId: userId,
      actorEmail: user?.email ?? null,
      action: 'auth.logout',
      outcome: 'success',
      requestIp: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
      requestMethod: meta?.method ?? null,
      requestPath: meta?.path ?? null,
    });

    return { success: true };
  }

  private async ensureEmailIsFree(email: string): Promise<void> {
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }
  }

  private async ensurePinflIsFree(pinfl: string): Promise<void> {
    const existingUser = await this.usersService.findByPinfl(pinfl);
    if (existingUser) {
      throw new ConflictException('PINFL is already registered');
    }
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const payload: JwtUser = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const refreshTokenExpiresAt = this.extractRefreshTokenExpiry(refreshToken);
    await this.usersService.setRefreshSession(
      user.id,
      refreshTokenHash,
      refreshTokenExpiresAt,
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      user: this.usersService.toPublicUser(user),
    };
  }

  private extractRefreshTokenExpiry(refreshToken: string): Date {
    const decoded = this.jwtService.decode(refreshToken) as
      | { exp?: number }
      | null;
    if (!decoded?.exp) {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    return new Date(decoded.exp * 1000);
  }
}
