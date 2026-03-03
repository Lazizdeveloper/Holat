import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Claim } from '../claims/entities/claim.entity';
import { ClaimVote } from '../claims/entities/claim-vote.entity';
import { ClaimVoteType } from '../common/enums/claim-vote-type.enum';
import { IssuePriority } from '../common/enums/issue-priority.enum';
import { IssueStatus } from '../common/enums/issue-status.enum';
import { PaginatedResponse } from '../common/types/paginated-response.type';
import { CreateIssueDto } from './dto/create-issue.dto';
import {
  IssueSortBy,
  ListIssuesQueryDto,
  SortOrder,
} from './dto/list-issues-query.dto';
import { Issue } from './entities/issue.entity';
import { IssueVote } from './entities/issue-vote.entity';

type IssueWithDerived = Issue & {
  latestClaim: Claim | null;
  conflict: boolean;
  ageSeconds?: number;
};

type FeedUserContext = {
  mine: boolean;
  voted: boolean;
  mv: ClaimVoteType | null;
};

export type IssueFeedItem = {
  id: string;
  cat: Issue['category'];
  title: string;
  desc: string;
  lat: number | null;
  lng: number | null;
  status: IssueStatus;
  priority: IssuePriority;
  region: string;
  votes: number;
  time: string;
  image: string | null;
  mine: boolean;
  voted: boolean;
  mv: ClaimVoteType | null;
  gc: {
    t: string;
    org: string;
    date: string;
  } | null;
  con: number;
  dis: number;
};

export type PaginatedResult<T> = PaginatedResponse<T, IssueSortBy>;

type IssueQueryResult<T> = T[] | PaginatedResult<T>;

type FetchIssuesOptions = {
  userId?: string;
  forceReporterId?: string;
  forcePagination?: boolean;
};

type FetchIssuesResult = {
  issues: Issue[];
  total: number;
  page: number;
  limit: number;
  shouldPaginate: boolean;
  sortBy: IssueSortBy;
  sortOrder: SortOrder;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue)
    private readonly issuesRepository: Repository<Issue>,
    @InjectRepository(IssueVote)
    private readonly issueVotesRepository: Repository<IssueVote>,
    @InjectRepository(Claim)
    private readonly claimsRepository: Repository<Claim>,
    @InjectRepository(ClaimVote)
    private readonly claimVotesRepository: Repository<ClaimVote>,
    private readonly auditService: AuditService,
  ) {}

  async list(query: ListIssuesQueryDto): Promise<IssueQueryResult<IssueWithDerived>> {
    const result = await this.fetchIssues(query);
    const issues = await this.withDerived(result.issues);

    if (!result.shouldPaginate) {
      return issues;
    }

    return this.toPaginated(issues, result);
  }

  async findOne(id: string): Promise<IssueWithDerived> {
    const issue = await this.issuesRepository.findOne({
      where: { id },
    });

    if (!issue) {
      throw new NotFoundException('Issue not found');
    }

    const [issueWithDerived] = await this.withDerived([issue]);
    return issueWithDerived;
  }

  async listFeed(
    query: ListIssuesQueryDto,
    userId?: string,
  ): Promise<IssueQueryResult<IssueFeedItem>> {
    const result = await this.fetchIssues(query, { userId });
    const issues = await this.withDerived(result.issues);
    const [contextByIssueId, ageByIssueId] = await Promise.all([
      this.resolveFeedContext(issues, userId),
      this.resolveIssueAgeSeconds(issues.map((issue) => issue.id)),
    ]);
    const feed = issues.map((issue) =>
      this.toFeedItem(
        issue,
        contextByIssueId.get(issue.id),
        ageByIssueId.get(issue.id),
      ),
    );

    if (!result.shouldPaginate) {
      return feed;
    }

    return this.toPaginated(feed, result);
  }

  async listFeedByReporter(
    reporterId: string,
    query: ListIssuesQueryDto,
  ): Promise<PaginatedResult<IssueFeedItem>> {
    const normalizedQuery: ListIssuesQueryDto = {
      ...query,
      mine: true,
      page: query.page ?? DEFAULT_PAGE,
      limit: query.limit ?? DEFAULT_LIMIT,
    };

    const result = await this.fetchIssues(normalizedQuery, {
      userId: reporterId,
      forceReporterId: reporterId,
      forcePagination: true,
    });
    const issues = await this.withDerived(result.issues);
    const [contextByIssueId, ageByIssueId] = await Promise.all([
      this.resolveFeedContext(issues, reporterId),
      this.resolveIssueAgeSeconds(issues.map((issue) => issue.id)),
    ]);
    const feed = issues.map((issue) =>
      this.toFeedItem(
        issue,
        contextByIssueId.get(issue.id),
        ageByIssueId.get(issue.id),
      ),
    );

    return this.toPaginated(feed, result);
  }

  async findOneFeed(id: string, userId?: string): Promise<IssueFeedItem> {
    const issue = await this.findOne(id);
    const [contextByIssueId, ageByIssueId] = await Promise.all([
      this.resolveFeedContext([issue], userId),
      this.resolveIssueAgeSeconds([issue.id]),
    ]);
    return this.toFeedItem(
      issue,
      contextByIssueId.get(issue.id),
      ageByIssueId.get(issue.id),
    );
  }

  async create(dto: CreateIssueDto, reporterId: string): Promise<IssueWithDerived> {
    const issue = this.issuesRepository.create({
      category: dto.category,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      region: dto.region.trim(),
      priority: dto.priority ?? IssuePriority.MEDIUM,
      status: IssueStatus.OPEN,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      imageUrl: dto.imageUrl?.trim() || null,
      reporterId,
    });

    const savedIssue = await this.issuesRepository.save(issue);

    await this.issueVotesRepository.save(
      this.issueVotesRepository.create({
        issueId: savedIssue.id,
        userId: reporterId,
      }),
    );
    await this.issuesRepository.increment({ id: savedIssue.id }, 'upvoteCount', 1);

    await this.auditService.create({
      actorId: reporterId,
      action: 'issue.create',
      outcome: 'success',
      details: {
        issueId: savedIssue.id,
        category: savedIssue.category,
        status: savedIssue.status,
      },
    });

    return this.findOne(savedIssue.id);
  }

  async upvote(issueId: string, userId: string): Promise<IssueWithDerived> {
    const issue = await this.issuesRepository.findOne({ where: { id: issueId } });
    if (!issue) {
      throw new NotFoundException('Issue not found');
    }

    const existingVote = await this.issueVotesRepository.findOne({
      where: { issueId, userId },
    });
    if (existingVote) {
      throw new ConflictException('You already upvoted this issue');
    }

    await this.issueVotesRepository.save(
      this.issueVotesRepository.create({ issueId, userId }),
    );
    await this.issuesRepository.increment({ id: issueId }, 'upvoteCount', 1);

    await this.auditService.create({
      actorId: userId,
      action: 'issue.upvote',
      outcome: 'success',
      details: { issueId },
    });

    return this.findOne(issueId);
  }

  async updateStatus(
    issueId: string,
    status: IssueStatus,
    actorId?: string,
  ): Promise<IssueWithDerived> {
    const issue = await this.issuesRepository.findOne({ where: { id: issueId } });
    if (!issue) {
      throw new NotFoundException('Issue not found');
    }

    issue.status = status;
    await this.issuesRepository.save(issue);

    await this.auditService.create({
      actorId: actorId ?? null,
      action: 'issue.status.update',
      outcome: 'success',
      details: {
        issueId,
        status,
      },
    });

    return this.findOne(issueId);
  }

  private async fetchIssues(
    query: ListIssuesQueryDto,
    options: FetchIssuesOptions = {},
  ): Promise<FetchIssuesResult> {
    const qb = this.issuesRepository.createQueryBuilder('issue');
    this.applyFilters(qb, query, options);

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    this.applySort(qb, sortBy, sortOrder);

    const shouldPaginate =
      options.forcePagination ||
      query.page !== undefined ||
      query.limit !== undefined;

    if (!shouldPaginate) {
      const issues = await qb.getMany();
      return {
        issues,
        total: issues.length,
        page: DEFAULT_PAGE,
        limit: issues.length || DEFAULT_LIMIT,
        shouldPaginate: false,
        sortBy,
        sortOrder,
      };
    }

    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    qb.skip((page - 1) * limit).take(limit);
    const [issues, total] = await qb.getManyAndCount();

    return {
      issues,
      total,
      page,
      limit,
      shouldPaginate: true,
      sortBy,
      sortOrder,
    };
  }

  private applyFilters(
    qb: SelectQueryBuilder<Issue>,
    query: ListIssuesQueryDto,
    options: FetchIssuesOptions,
  ): void {
    if (query.status) {
      qb.andWhere('issue.status = :status', { status: query.status });
    }

    if (query.category) {
      qb.andWhere('issue.category = :category', { category: query.category });
    }

    if (query.priority) {
      qb.andWhere('issue.priority = :priority', { priority: query.priority });
    }

    if (query.region) {
      qb.andWhere('issue.region = :region', { region: query.region.trim() });
    }

    if (query.search) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(issue.title) LIKE :search OR LOWER(COALESCE(issue.description, '')) LIKE :search OR LOWER(issue.region) LIKE :search)",
        { search },
      );
    }

    if (options.forceReporterId) {
      qb.andWhere('issue.reporterId = :forceReporterId', {
        forceReporterId: options.forceReporterId,
      });
    } else if (query.mine !== undefined) {
      if (!options.userId) {
        if (query.mine) {
          qb.andWhere('1 = 0');
        }
      } else if (query.mine) {
        qb.andWhere('issue.reporterId = :mineUserId', { mineUserId: options.userId });
      } else {
        qb.andWhere('issue.reporterId <> :mineUserId', {
          mineUserId: options.userId,
        });
      }
    }

    if (query.voted !== undefined) {
      if (!options.userId) {
        if (query.voted) {
          qb.andWhere('1 = 0');
        }
      } else {
        const voteExistsQuery = this.issueVotesRepository
          .createQueryBuilder('issue_vote')
          .select('1')
          .where('issue_vote.issueId = issue.id')
          .andWhere('issue_vote.userId = :votedUserId')
          .getQuery();

        qb.andWhere(
          query.voted ? `EXISTS (${voteExistsQuery})` : `NOT EXISTS (${voteExistsQuery})`,
          { votedUserId: options.userId },
        );
      }
    }

    if (query.hasClaim !== undefined) {
      const claimExistsQuery = this.claimsRepository
        .createQueryBuilder('claim_filter')
        .select('1')
        .where('claim_filter.issueId = issue.id')
        .getQuery();

      qb.andWhere(
        query.hasClaim
          ? `EXISTS (${claimExistsQuery})`
          : `NOT EXISTS (${claimExistsQuery})`,
      );
    }
  }

  private applySort(
    qb: SelectQueryBuilder<Issue>,
    sortBy: IssueSortBy,
    sortOrder: SortOrder,
  ): void {
    const sortMap: Record<IssueSortBy, string> = {
      createdAt: 'issue.createdAt',
      updatedAt: 'issue.updatedAt',
      votes: 'issue.upvoteCount',
      priority: 'issue.priority',
      status: 'issue.status',
    };

    qb.orderBy(sortMap[sortBy], sortOrder.toUpperCase() as 'ASC' | 'DESC').addOrderBy(
      'issue.createdAt',
      'DESC',
    );
  }

  private async withDerived(issues: Issue[]): Promise<IssueWithDerived[]> {
    if (issues.length === 0) {
      return [];
    }

    const issueIds = issues.map((issue) => issue.id);
    const latestClaims = await this.claimsRepository
      .createQueryBuilder('claim')
      .distinctOn(['claim.issueId'])
      .where('claim.issueId IN (:...issueIds)', { issueIds })
      .orderBy('claim.issueId', 'ASC')
      .addOrderBy('claim.createdAt', 'DESC')
      .getMany();

    const latestClaimByIssueId = new Map(
      latestClaims.map((claim) => [claim.issueId, claim]),
    );

    return issues.map((issue) => {
      const latestClaim = latestClaimByIssueId.get(issue.id) ?? null;
      const conflict = latestClaim
        ? latestClaim.disputeCount > latestClaim.confirmCount
        : false;

      return {
        ...issue,
        latestClaim,
        conflict,
      };
    });
  }

  private async resolveFeedContext(
    issues: IssueWithDerived[],
    userId?: string,
  ): Promise<Map<string, FeedUserContext>> {
    const contextByIssueId = new Map<string, FeedUserContext>();

    if (!userId || issues.length === 0) {
      for (const issue of issues) {
        contextByIssueId.set(issue.id, {
          mine: false,
          voted: false,
          mv: null,
        });
      }
      return contextByIssueId;
    }

    const issueIds = issues.map((issue) => issue.id);
    const latestClaimIds = issues
      .map((issue) => issue.latestClaim?.id)
      .filter((value): value is string => Boolean(value));

    const [issueVotes, claimVotes] = await Promise.all([
      this.issueVotesRepository.find({
        where: {
          userId,
          issueId: In(issueIds),
        },
      }),
      latestClaimIds.length > 0
        ? this.claimVotesRepository.find({
            where: {
              userId,
              claimId: In(latestClaimIds),
            },
          })
        : Promise.resolve([]),
    ]);

    const votedIssueIds = new Set(issueVotes.map((vote) => vote.issueId));
    const claimVoteByClaimId = new Map(
      claimVotes.map((vote) => [vote.claimId, vote.type]),
    );

    for (const issue of issues) {
      contextByIssueId.set(issue.id, {
        mine: issue.reporterId === userId,
        voted: votedIssueIds.has(issue.id),
        mv: issue.latestClaim
          ? claimVoteByClaimId.get(issue.latestClaim.id) ?? null
          : null,
      });
    }

    return contextByIssueId;
  }

  private async resolveIssueAgeSeconds(
    issueIds: string[],
  ): Promise<Map<string, number>> {
    const ageByIssueId = new Map<string, number>();
    if (issueIds.length === 0) {
      return ageByIssueId;
    }

    const rows = await this.issuesRepository
      .createQueryBuilder('issue')
      .select('issue.id', 'id')
      .addSelect(
        'GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - issue.created_at))))',
        'ageSeconds',
      )
      .where('issue.id IN (:...issueIds)', { issueIds })
      .getRawMany<{ id: string; ageSeconds: string }>();

    for (const row of rows) {
      const ageSeconds = Number(row.ageSeconds);
      ageByIssueId.set(
        row.id,
        Number.isFinite(ageSeconds) && ageSeconds >= 0
          ? Math.floor(ageSeconds)
          : 0,
      );
    }

    return ageByIssueId;
  }

  private toFeedItem(
    issue: IssueWithDerived,
    context?: FeedUserContext,
    ageSeconds?: number,
  ): IssueFeedItem {
    const latestClaim = issue.latestClaim;

    return {
      id: issue.id,
      cat: issue.category,
      title: issue.title,
      desc: issue.description ?? '',
      lat: issue.latitude ?? null,
      lng: issue.longitude ?? null,
      status: issue.status,
      priority: issue.priority,
      region: issue.region,
      votes: issue.upvoteCount,
      time: this.toRelativeTime(issue.createdAt, ageSeconds),
      image: issue.imageUrl ?? null,
      mine: context?.mine ?? false,
      voted: context?.voted ?? false,
      mv: context?.mv ?? null,
      gc: latestClaim
        ? {
            t: latestClaim.statement,
            org: latestClaim.organization,
            date: latestClaim.claimDate,
          }
        : null,
      con: latestClaim?.confirmCount ?? 0,
      dis: latestClaim?.disputeCount ?? 0,
    };
  }

  private toPaginated<T>(
    items: T[],
    result: FetchIssuesResult,
  ): PaginatedResult<T> {
    const totalPages = result.total > 0 ? Math.ceil(result.total / result.limit) : 0;

    return {
      items,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages,
      hasNextPage: totalPages > 0 && result.page < totalPages,
      hasPrevPage: result.page > 1,
      sortBy: result.sortBy,
      sortOrder: result.sortOrder,
    };
  }

  private toRelativeTime(createdAt: Date, ageSeconds?: number): string {
    const resolvedAgeSeconds = this.resolveAgeSeconds(createdAt, ageSeconds);
    const minute = 60;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;

    if (resolvedAgeSeconds < minute) {
      return 'Hozirgina';
    }
    if (resolvedAgeSeconds < hour) {
      return `${Math.floor(resolvedAgeSeconds / minute)} daqiqa avval`;
    }
    if (resolvedAgeSeconds < day) {
      return `${Math.floor(resolvedAgeSeconds / hour)} soat avval`;
    }
    if (resolvedAgeSeconds < week) {
      return `${Math.floor(resolvedAgeSeconds / day)} kun avval`;
    }

    return `${Math.floor(resolvedAgeSeconds / week)} hafta avval`;
  }

  private resolveAgeSeconds(createdAt: Date, ageSeconds?: number): number {
    if (typeof ageSeconds === 'number' && Number.isFinite(ageSeconds)) {
      return Math.max(0, Math.floor(ageSeconds));
    }

    const createdAtMs = new Date(createdAt).getTime();
    if (Number.isNaN(createdAtMs)) {
      return 0;
    }

    return Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
  }
}
