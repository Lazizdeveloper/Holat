import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaimVote } from '../claims/entities/claim-vote.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { IssueStatus } from '../common/enums/issue-status.enum';
import { ListIssuesQueryDto } from '../issues/dto/list-issues-query.dto';
import { IssueVote } from '../issues/entities/issue-vote.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssuesService, PaginatedResult, IssueFeedItem } from '../issues/issues.service';
import { User } from './entities/user.entity';
import { PublicUser } from './types/public-user.type';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

type CreateCitizenInput = {
  fullName: string;
  email: string;
  passwordHash: string;
  pinfl: string;
  phone?: string;
  region: string;
};

type CreateGovInput = {
  fullName: string;
  email: string;
  passwordHash: string;
  position?: string;
  ministryKey: string;
  ministryName: string;
  region?: string;
};

export type UserStatsResponse = {
  reports: number;
  votes: number;
  verifications: number;
  openReports: number;
  inProgressReports: number;
  resolvedReports: number;
};

export type UserPreferencesResponse = {
  notificationEnabled: boolean;
  emailNotificationsEnabled: boolean;
  notifOn: boolean;
  emailOn: boolean;
};

export type LoginAttemptResult = {
  locked: boolean;
  lockedUntil: Date | null;
  remainingAttempts: number;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Issue)
    private readonly issuesRepository: Repository<Issue>,
    @InjectRepository(IssueVote)
    private readonly issueVotesRepository: Repository<IssueVote>,
    @InjectRepository(ClaimVote)
    private readonly claimVotesRepository: Repository<ClaimVote>,
    private readonly issuesService: IssuesService,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async findByPinfl(pinfl: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { pinfl } });
  }

  async setRefreshSession(
    userId: string,
    refreshTokenHash: string,
    refreshTokenExpiresAt: Date,
  ): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { refreshTokenHash, refreshTokenExpiresAt },
    );
  }

  async clearRefreshSession(userId: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { refreshTokenHash: null, refreshTokenExpiresAt: null },
    );
  }

  async registerFailedLoginAttempt(
    userId: string,
    maxAttempts: number,
    lockMinutes: number,
  ): Promise<LoginAttemptResult> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const nextFailedAttempts = user.failedLoginAttempts + 1;
    const reachedLimit = nextFailedAttempts >= maxAttempts;
    const lockedUntil = reachedLimit
      ? new Date(Date.now() + lockMinutes * 60 * 1000)
      : null;

    await this.usersRepository.update(
      { id: user.id },
      {
        failedLoginAttempts: reachedLimit ? 0 : nextFailedAttempts,
        loginLockedUntil: lockedUntil,
      },
    );

    return {
      locked: reachedLimit,
      lockedUntil,
      remainingAttempts: reachedLimit
        ? 0
        : Math.max(maxAttempts - nextFailedAttempts, 0),
    };
  }

  async resetLoginAttempts(userId: string, loginIp?: string | null): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      {
        failedLoginAttempts: 0,
        loginLockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: loginIp ?? null,
      },
    );
  }

  async createCitizen(input: CreateCitizenInput): Promise<User> {
    const user = this.usersRepository.create({
      role: UserRole.CITIZEN,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      pinfl: input.pinfl,
      phone: input.phone?.trim() || null,
      region: input.region.trim(),
      ministryKey: null,
      ministryName: null,
      position: null,
      notificationEnabled: true,
      emailNotificationsEnabled: false,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
      lastLoginAt: null,
      lastLoginIp: null,
    });
    return this.usersRepository.save(user);
  }

  async createGov(input: CreateGovInput): Promise<User> {
    const user = this.usersRepository.create({
      role: UserRole.GOV,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      pinfl: null,
      phone: null,
      region: input.region?.trim() || null,
      ministryKey: input.ministryKey.trim(),
      ministryName: input.ministryName.trim(),
      position: input.position?.trim() || null,
      notificationEnabled: true,
      emailNotificationsEnabled: false,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
      lastLoginAt: null,
      lastLoginIp: null,
    });
    return this.usersRepository.save(user);
  }

  async findPublicById(id: string): Promise<PublicUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toPublicUser(user);
  }

  async getMeStats(userId: string): Promise<UserStatsResponse> {
    const [reportStats, votes, verifications] = await Promise.all([
      this.issuesRepository
        .createQueryBuilder('issue')
        .select('COUNT(*)', 'total')
        .addSelect(
          `SUM(CASE WHEN issue.status = :openStatus THEN 1 ELSE 0 END)`,
          'openReports',
        )
        .addSelect(
          `SUM(CASE WHEN issue.status = :inProgressStatus THEN 1 ELSE 0 END)`,
          'inProgressReports',
        )
        .addSelect(
          `SUM(CASE WHEN issue.status = :resolvedStatus THEN 1 ELSE 0 END)`,
          'resolvedReports',
        )
        .where('issue.reporterId = :userId', { userId })
        .setParameters({
          openStatus: IssueStatus.OPEN,
          inProgressStatus: IssueStatus.IN_PROGRESS,
          resolvedStatus: IssueStatus.RESOLVED,
        })
        .getRawOne<{
          total: string;
          openReports: string;
          inProgressReports: string;
          resolvedReports: string;
        }>(),
      this.issueVotesRepository.count({ where: { userId } }),
      this.claimVotesRepository.count({ where: { userId } }),
    ]);

    return {
      reports: Number(reportStats?.total ?? 0),
      votes,
      verifications,
      openReports: Number(reportStats?.openReports ?? 0),
      inProgressReports: Number(reportStats?.inProgressReports ?? 0),
      resolvedReports: Number(reportStats?.resolvedReports ?? 0),
    };
  }

  async getMeIssues(
    userId: string,
    query: ListIssuesQueryDto,
  ): Promise<PaginatedResult<IssueFeedItem>> {
    return this.issuesService.listFeedByReporter(userId, query);
  }

  async getMePreferences(userId: string): Promise<UserPreferencesResponse> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toPreferencesResponse(user);
  }

  async updateMePreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponse> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const notificationEnabled =
      dto.notificationEnabled ?? dto.notifOn ?? user.notificationEnabled;
    const emailNotificationsEnabled =
      dto.emailNotificationsEnabled ??
      dto.emailOn ??
      user.emailNotificationsEnabled;

    user.notificationEnabled = notificationEnabled;
    user.emailNotificationsEnabled = emailNotificationsEnabled;
    const updatedUser = await this.usersRepository.save(user);

    return this.toPreferencesResponse(updatedUser);
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      pinfl: user.pinfl,
      region: user.region,
      ministryKey: user.ministryKey,
      ministryName: user.ministryName,
      position: user.position,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toPreferencesResponse(user: User): UserPreferencesResponse {
    return {
      notificationEnabled: user.notificationEnabled,
      emailNotificationsEnabled: user.emailNotificationsEnabled,
      notifOn: user.notificationEnabled,
      emailOn: user.emailNotificationsEnabled,
    };
  }
}
