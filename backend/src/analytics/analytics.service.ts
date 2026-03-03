import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Claim } from '../claims/entities/claim.entity';
import { IssueCategory } from '../common/enums/issue-category.enum';
import { PaginatedResponse } from '../common/types/paginated-response.type';
import { Issue } from '../issues/entities/issue.entity';
import {
  AnalyticsListQueryDto,
  AnalyticsSortOrder,
} from './dto/analytics-list-query.dto';

type PaginatedAnalyticsResult<T> = PaginatedResponse<T, string> & {
  sortOrder: AnalyticsSortOrder;
};

type RegionStats = {
  region: string;
  totalIssues: number;
  openIssues: number;
  inProgressIssues: number;
  resolvedIssues: number;
  totalVotes: number;
  issuesWithClaim: number;
  conflictIssues: number;
  resolutionRate: number;
  conflictRate: number;
  avgVotesPerIssue: number;
};

type MinistryStats = {
  key: string;
  name: string;
  categories: IssueCategory[];
  totalIssues: number;
  openIssues: number;
  inProgressIssues: number;
  resolvedIssues: number;
  totalVotes: number;
  issuesWithClaim: number;
  conflictIssues: number;
  resolutionRate: number;
  conflictRate: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Issue)
    private readonly issuesRepository: Repository<Issue>,
    @InjectRepository(Claim)
    private readonly claimsRepository: Repository<Claim>,
  ) {}

  async getRegions(
    query: AnalyticsListQueryDto,
  ): Promise<PaginatedAnalyticsResult<RegionStats>> {
    const allRegions = await this.getRegionStats();
    const search = query.search?.trim().toLowerCase();
    const filtered = search
      ? allRegions.filter((item) => item.region.toLowerCase().includes(search))
      : allRegions;

    return this.paginateAndSort(
      filtered,
      query,
      query.sortBy ?? 'totalIssues',
      (item, sortBy) => this.getComparableValue(item, sortBy),
    );
  }

  async getMinistries(
    query: AnalyticsListQueryDto,
  ): Promise<PaginatedAnalyticsResult<MinistryStats>> {
    const allMinistries = await this.getMinistryStats();
    const search = query.search?.trim().toLowerCase();
    const filtered = search
      ? allMinistries.filter(
          (item) =>
            item.name.toLowerCase().includes(search) ||
            item.key.toLowerCase().includes(search),
        )
      : allMinistries;

    return this.paginateAndSort(
      filtered,
      query,
      query.sortBy ?? 'totalIssues',
      (item, sortBy) => this.getComparableValue(item, sortBy),
    );
  }

  async getOverview() {
    const [issueSummary, totalClaims, totalVerifications, regions, ministries] =
      await Promise.all([
        this.getIssueSummary(),
        this.claimsRepository.count(),
        this.claimsRepository.manager
          .createQueryBuilder()
          .select('COUNT(*)', 'total')
          .from('claim_votes', 'claim_vote')
          .getRawOne<{ total: string }>(),
        this.getRegionStats(),
        this.getMinistryStats(),
      ]);

    const resolutionRate = issueSummary.totalIssues
      ? this.round((issueSummary.resolvedIssues / issueSummary.totalIssues) * 100)
      : 0;
    const claimCoverageRate = issueSummary.totalIssues
      ? this.round((issueSummary.issuesWithClaim / issueSummary.totalIssues) * 100)
      : 0;
    const conflictRate = issueSummary.issuesWithClaim
      ? this.round((issueSummary.conflictIssues / issueSummary.issuesWithClaim) * 100)
      : 0;

    const topRegions = [...regions]
      .sort((a, b) => b.totalIssues - a.totalIssues)
      .slice(0, 5);
    const topMinistries = [...ministries]
      .sort((a, b) => b.totalIssues - a.totalIssues)
      .slice(0, 5);

    return {
      totals: {
        issues: issueSummary.totalIssues,
        openIssues: issueSummary.openIssues,
        inProgressIssues: issueSummary.inProgressIssues,
        resolvedIssues: issueSummary.resolvedIssues,
        issueVotes: issueSummary.totalVotes,
        claims: totalClaims,
        verifications: Number(totalVerifications?.total ?? 0),
        regions: regions.length,
        ministries: ministries.length,
      },
      rates: {
        resolutionRate,
        claimCoverageRate,
        conflictRate,
      },
      topRegions,
      topMinistries,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getRegionStats(): Promise<RegionStats[]> {
    const rows = await this.issuesRepository.query(`
      SELECT
        issue.region AS "region",
        COUNT(issue.id)::int AS "totalIssues",
        SUM(CASE WHEN issue.status = 'open' THEN 1 ELSE 0 END)::int AS "openIssues",
        SUM(CASE WHEN issue.status = 'in_progress' THEN 1 ELSE 0 END)::int AS "inProgressIssues",
        SUM(CASE WHEN issue.status = 'resolved' THEN 1 ELSE 0 END)::int AS "resolvedIssues",
        COALESCE(SUM(issue.upvote_count), 0)::int AS "totalVotes",
        SUM(CASE WHEN latest_claim.id IS NOT NULL THEN 1 ELSE 0 END)::int AS "issuesWithClaim",
        SUM(CASE WHEN latest_claim.dispute_count > latest_claim.confirm_count THEN 1 ELSE 0 END)::int AS "conflictIssues"
      FROM issues issue
      LEFT JOIN (
        SELECT DISTINCT ON (claim.issue_id)
          claim.id,
          claim.issue_id,
          claim.confirm_count,
          claim.dispute_count
        FROM claims claim
        ORDER BY claim.issue_id, claim.created_at DESC
      ) latest_claim ON latest_claim.issue_id = issue.id
      GROUP BY issue.region
    `);

    return rows.map((row: Record<string, unknown>) => {
      const totalIssues = this.toNumber(row.totalIssues);
      const resolvedIssues = this.toNumber(row.resolvedIssues);
      const issuesWithClaim = this.toNumber(row.issuesWithClaim);
      const conflictIssues = this.toNumber(row.conflictIssues);
      const totalVotes = this.toNumber(row.totalVotes);

      return {
        region: String(row.region ?? ''),
        totalIssues,
        openIssues: this.toNumber(row.openIssues),
        inProgressIssues: this.toNumber(row.inProgressIssues),
        resolvedIssues,
        totalVotes,
        issuesWithClaim,
        conflictIssues,
        resolutionRate: totalIssues
          ? this.round((resolvedIssues / totalIssues) * 100)
          : 0,
        conflictRate: issuesWithClaim
          ? this.round((conflictIssues / issuesWithClaim) * 100)
          : 0,
        avgVotesPerIssue: totalIssues ? this.round(totalVotes / totalIssues) : 0,
      };
    });
  }

  private async getMinistryStats(): Promise<MinistryStats[]> {
    const ministries = await this.issuesRepository.query(`
      SELECT DISTINCT
        user_entity.ministry_key AS "key",
        user_entity.ministry_name AS "name"
      FROM users user_entity
      WHERE
        user_entity.ministry_key IS NOT NULL
        AND user_entity.ministry_name IS NOT NULL
      ORDER BY user_entity.ministry_name ASC
    `);

    const rows = await this.issuesRepository.query(`
      WITH latest_claim AS (
        SELECT DISTINCT ON (claim.issue_id)
          claim.issue_id,
          claim.confirm_count,
          claim.dispute_count,
          user_entity.ministry_key AS key,
          user_entity.ministry_name AS name
        FROM claims claim
        INNER JOIN users user_entity ON user_entity.id = claim.created_by_id
        WHERE
          user_entity.ministry_key IS NOT NULL
          AND user_entity.ministry_name IS NOT NULL
        ORDER BY claim.issue_id, claim.created_at DESC
      )
      SELECT
        latest_claim.key AS "key",
        latest_claim.name AS "name",
        COUNT(issue.id)::int AS "totalIssues",
        SUM(CASE WHEN issue.status = 'open' THEN 1 ELSE 0 END)::int AS "openIssues",
        SUM(CASE WHEN issue.status = 'in_progress' THEN 1 ELSE 0 END)::int AS "inProgressIssues",
        SUM(CASE WHEN issue.status = 'resolved' THEN 1 ELSE 0 END)::int AS "resolvedIssues",
        COALESCE(SUM(issue.upvote_count), 0)::int AS "totalVotes",
        COUNT(issue.id)::int AS "issuesWithClaim",
        SUM(CASE WHEN latest_claim.dispute_count > latest_claim.confirm_count THEN 1 ELSE 0 END)::int AS "conflictIssues",
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT issue.category), NULL) AS "categories"
      FROM latest_claim
      INNER JOIN issues issue ON issue.id = latest_claim.issue_id
      GROUP BY latest_claim.key, latest_claim.name
    `);

    const statsByMinistryKey = new Map<string, MinistryStats>();
    for (const row of rows) {
      const totalIssues = this.toNumber(row.totalIssues);
      const issuesWithClaim = this.toNumber(row.issuesWithClaim);
      const conflictIssues = this.toNumber(row.conflictIssues);

      statsByMinistryKey.set(String(row.key), {
        key: String(row.key),
        name: String(row.name),
        categories: this.parseCategoryArray(row.categories),
        totalIssues,
        openIssues: this.toNumber(row.openIssues),
        inProgressIssues: this.toNumber(row.inProgressIssues),
        resolvedIssues: this.toNumber(row.resolvedIssues),
        totalVotes: this.toNumber(row.totalVotes),
        issuesWithClaim,
        conflictIssues,
        resolutionRate: totalIssues
          ? this.round((this.toNumber(row.resolvedIssues) / totalIssues) * 100)
          : 0,
        conflictRate: issuesWithClaim
          ? this.round((conflictIssues / issuesWithClaim) * 100)
          : 0,
      });
    }

    const result: MinistryStats[] = [];
    for (const ministry of ministries) {
      const key = String(ministry.key);
      const withStats = statsByMinistryKey.get(key);
      if (withStats) {
        result.push(withStats);
        continue;
      }

      result.push({
        key,
        name: String(ministry.name),
        categories: [],
        totalIssues: 0,
        openIssues: 0,
        inProgressIssues: 0,
        resolvedIssues: 0,
        totalVotes: 0,
        issuesWithClaim: 0,
        conflictIssues: 0,
        resolutionRate: 0,
        conflictRate: 0,
      });
    }

    return result;
  }

  private async getIssueSummary() {
    const raw = await this.issuesRepository.query(`
      SELECT
        COUNT(issue.id)::int AS "totalIssues",
        SUM(CASE WHEN issue.status = 'open' THEN 1 ELSE 0 END)::int AS "openIssues",
        SUM(CASE WHEN issue.status = 'in_progress' THEN 1 ELSE 0 END)::int AS "inProgressIssues",
        SUM(CASE WHEN issue.status = 'resolved' THEN 1 ELSE 0 END)::int AS "resolvedIssues",
        COALESCE(SUM(issue.upvote_count), 0)::int AS "totalVotes",
        SUM(CASE WHEN latest_claim.id IS NOT NULL THEN 1 ELSE 0 END)::int AS "issuesWithClaim",
        SUM(CASE WHEN latest_claim.dispute_count > latest_claim.confirm_count THEN 1 ELSE 0 END)::int AS "conflictIssues"
      FROM issues issue
      LEFT JOIN (
        SELECT DISTINCT ON (claim.issue_id)
          claim.id,
          claim.issue_id,
          claim.confirm_count,
          claim.dispute_count
        FROM claims claim
        ORDER BY claim.issue_id, claim.created_at DESC
      ) latest_claim ON latest_claim.issue_id = issue.id
    `);

    const summary = raw[0] || {};
    return {
      totalIssues: this.toNumber(summary.totalIssues),
      openIssues: this.toNumber(summary.openIssues),
      inProgressIssues: this.toNumber(summary.inProgressIssues),
      resolvedIssues: this.toNumber(summary.resolvedIssues),
      totalVotes: this.toNumber(summary.totalVotes),
      issuesWithClaim: this.toNumber(summary.issuesWithClaim),
      conflictIssues: this.toNumber(summary.conflictIssues),
    };
  }

  private paginateAndSort<T>(
    items: T[],
    query: AnalyticsListQueryDto,
    defaultSortBy: string,
    valueGetter: (item: T, sortBy: string) => string | number,
  ): PaginatedAnalyticsResult<T> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const sortBy = query.sortBy ?? defaultSortBy;
    const sortOrder = query.sortOrder ?? 'desc';

    const sorted = [...items].sort((left, right) => {
      const leftValue = valueGetter(left, sortBy);
      const rightValue = valueGetter(right, sortBy);

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return sortOrder === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      }

      const comparison = String(leftValue).localeCompare(String(rightValue), 'uz', {
        sensitivity: 'base',
      });
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const total = sorted.length;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    const start = (page - 1) * limit;
    const paged = sorted.slice(start, start + limit);

    return {
      items: paged,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: totalPages > 0 && page < totalPages,
      hasPrevPage: page > 1,
      sortBy,
      sortOrder,
    };
  }

  private getComparableValue<T extends Record<string, unknown>>(
    item: T,
    sortBy: string,
  ): string | number {
    const value = item[sortBy];
    if (typeof value === 'number' || typeof value === 'string') {
      return value;
    }
    return '';
  }

  private parseCategoryArray(value: unknown): IssueCategory[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is IssueCategory =>
        Object.values(IssueCategory).includes(item as IssueCategory),
      );
    }

    if (typeof value !== 'string' || value.length < 2) {
      return [];
    }

    const withoutBraces = value.replace(/^\{/, '').replace(/\}$/, '');
    if (!withoutBraces.trim()) {
      return [];
    }

    return withoutBraces
      .split(',')
      .map((item) => item.trim())
      .filter((item): item is IssueCategory =>
        Object.values(IssueCategory).includes(item as IssueCategory),
      );
  }

  private toNumber(value: unknown): number {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
