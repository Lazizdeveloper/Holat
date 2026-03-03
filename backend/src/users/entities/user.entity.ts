import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Claim } from '../../claims/entities/claim.entity';
import { ClaimVote } from '../../claims/entities/claim-vote.entity';
import { UserRole } from '../../common/enums/user-role.enum';
import { Issue } from '../../issues/entities/issue.entity';
import { IssueVote } from '../../issues/entities/issue-vote.entity';

@Entity({ name: 'users' })
@Unique('UQ_users_email', ['email'])
@Unique('UQ_users_pinfl', ['pinfl'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', type: 'varchar', length: 140 })
  fullName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.CITIZEN,
  })
  role: UserRole;

  @Column({ type: 'varchar', length: 160 })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 200 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 14, nullable: true })
  pinfl: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  region: string | null;

  @Column({ name: 'ministry_key', type: 'varchar', length: 50, nullable: true })
  ministryKey: string | null;

  @Column({
    name: 'ministry_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  ministryName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  position: string | null;

  @Column({
    name: 'refresh_token_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  refreshTokenHash: string | null;

  @Column({
    name: 'refresh_token_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  refreshTokenExpiresAt: Date | null;

  @Column({ name: 'notification_enabled', type: 'boolean', default: true })
  notificationEnabled: boolean;

  @Column({
    name: 'email_notifications_enabled',
    type: 'boolean',
    default: false,
  })
  emailNotificationsEnabled: boolean;

  @Column({ name: 'failed_login_attempts', type: 'integer', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'login_locked_until', type: 'timestamptz', nullable: true })
  loginLockedUntil: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'last_login_ip', type: 'varchar', length: 64, nullable: true })
  lastLoginIp: string | null;

  @OneToMany(() => Issue, (issue) => issue.reporter)
  reportedIssues: Issue[];

  @OneToMany(() => Claim, (claim) => claim.createdBy)
  claims: Claim[];

  @OneToMany(() => IssueVote, (vote) => vote.user)
  issueVotes: IssueVote[];

  @OneToMany(() => ClaimVote, (vote) => vote.user)
  claimVotes: ClaimVote[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
