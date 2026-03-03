import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClaimsModule } from './claims/claims.module';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { IssuesModule } from './issues/issues.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: Number(configService.get<string>('THROTTLE_TTL', '60000')),
          limit: Number(configService.get<string>('THROTTLE_LIMIT', '120')),
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        const useSsl =
          configService.get<string>(
            'DB_SSL',
            databaseUrl ? 'true' : 'false',
          ) === 'true';
        const rejectUnauthorized =
          configService.get<string>(
            'DB_SSL_REJECT_UNAUTHORIZED',
            'false',
          ) === 'true';

        return {
          type: 'postgres',
          url: databaseUrl,
          host: databaseUrl
            ? undefined
            : configService.get<string>('DB_HOST', 'localhost'),
          port: databaseUrl
            ? undefined
            : Number(configService.get<string>('DB_PORT', '5432')),
          username: databaseUrl
            ? undefined
            : configService.get<string>('DB_USERNAME', 'postgres'),
          password: databaseUrl
            ? undefined
            : configService.get<string>('DB_PASSWORD', 'postgres'),
          database: databaseUrl
            ? undefined
            : configService.get<string>('DB_NAME', 'holat_backend'),
          ssl: useSsl ? { rejectUnauthorized } : false,
          synchronize: configService.get<string>('DB_SYNC', 'false') === 'true',
          migrationsRun:
            configService.get<string>('DB_MIGRATIONS_RUN', 'true') === 'true',
          migrations: [join(__dirname, 'database/migrations/*{.ts,.js}')],
          logging: configService.get<string>('DB_LOGGING', 'false') === 'true',
          autoLoadEntities: true,
        };
      },
    }),
    AnalyticsModule,
    AuditModule,
    AuthModule,
    UsersModule,
    IssuesModule,
    ClaimsModule,
    MonitoringModule,
    UploadsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
