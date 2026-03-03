import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ClaimVote } from '../claims/entities/claim-vote.entity';
import { Claim } from '../claims/entities/claim.entity';
import { IssueVote } from '../issues/entities/issue-vote.entity';
import { Issue } from '../issues/entities/issue.entity';
import { User } from '../users/entities/user.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { InitSchema1700000000000 } from './migrations/1700000000000-InitSchema';
import { AddRefreshTokenColumns1700000001000 } from './migrations/1700000001000-AddRefreshTokenColumns';
import { AddIssueImageAndUserPreferences1700000002000 } from './migrations/1700000002000-AddIssueImageAndUserPreferences';
import { AddSecurityAuditAndIndexes1700000003000 } from './migrations/1700000003000-AddSecurityAuditAndIndexes';

const toBool = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }
  return value.toLowerCase() === 'true';
};

const databaseUrl = process.env.DATABASE_URL;
const useSsl = toBool(process.env.DB_SSL, Boolean(databaseUrl));
const rejectUnauthorized = toBool(
  process.env.DB_SSL_REJECT_UNAUTHORIZED,
  false,
);

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  host: databaseUrl ? undefined : process.env.DB_HOST ?? 'localhost',
  port: databaseUrl ? undefined : Number(process.env.DB_PORT ?? 5432),
  username: databaseUrl ? undefined : process.env.DB_USERNAME ?? 'postgres',
  password: databaseUrl ? undefined : process.env.DB_PASSWORD ?? 'postgres',
  database: databaseUrl ? undefined : process.env.DB_NAME ?? 'holat_backend',
  ssl: useSsl ? { rejectUnauthorized } : false,
  logging: toBool(process.env.DB_LOGGING, false),
  synchronize: false,
  entities: [User, Issue, IssueVote, Claim, ClaimVote, AuditLog],
  migrations: [
    InitSchema1700000000000,
    AddRefreshTokenColumns1700000001000,
    AddIssueImageAndUserPreferences1700000002000,
    AddSecurityAuditAndIndexes1700000003000,
  ],
});
