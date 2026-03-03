import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaimVoteType } from '../common/enums/claim-vote-type.enum';
import { IssueStatus } from '../common/enums/issue-status.enum';
import { Issue } from '../issues/entities/issue.entity';
import { CreateClaimByIssueDto } from './dto/create-claim-by-issue.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { ListClaimsQueryDto } from './dto/list-claims-query.dto';
import { Claim } from './entities/claim.entity';
import { ClaimVote } from './entities/claim-vote.entity';

@Injectable()
export class ClaimsService {
  constructor(
    @InjectRepository(Claim)
    private readonly claimsRepository: Repository<Claim>,
    @InjectRepository(ClaimVote)
    private readonly claimVotesRepository: Repository<ClaimVote>,
    @InjectRepository(Issue)
    private readonly issuesRepository: Repository<Issue>,
  ) {}

  async list(query: ListClaimsQueryDto): Promise<Claim[]> {
    if (query.issueId) {
      return this.claimsRepository.find({
        where: { issueId: query.issueId },
        relations: { issue: true },
        order: { createdAt: 'DESC' },
      });
    }

    return this.claimsRepository.find({
      relations: { issue: true },
      order: { createdAt: 'DESC' },
    });
  }

  async create(dto: CreateClaimDto, createdById: string): Promise<Claim> {
    return this.createInternal(dto.issueId, dto, createdById);
  }

  async createForIssue(
    issueId: string,
    dto: CreateClaimByIssueDto,
    createdById: string,
  ): Promise<Claim> {
    return this.createInternal(issueId, dto, createdById);
  }

  async voteForIssue(
    issueId: string,
    userId: string,
    type: ClaimVoteType,
  ): Promise<Claim> {
    const latestClaim = await this.findLatestByIssueId(issueId);
    return this.vote(latestClaim.id, userId, type);
  }

  async findLatestByIssueId(issueId: string): Promise<Claim> {
    const latestClaim = await this.claimsRepository.findOne({
      where: { issueId },
      order: { createdAt: 'DESC' },
    });

    if (!latestClaim) {
      throw new NotFoundException('No claims found for this issue');
    }

    return latestClaim;
  }

  private async createInternal(
    issueId: string,
    dto: Pick<CreateClaimDto, 'organization' | 'statement' | 'claimDate' | 'status'>,
    createdById: string,
  ): Promise<Claim> {
    const issue = await this.issuesRepository.findOne({
      where: { id: issueId },
    });
    if (!issue) {
      throw new NotFoundException('Issue not found');
    }

    const claim = this.claimsRepository.create({
      issueId,
      createdById,
      organization: dto.organization.trim(),
      statement: dto.statement.trim(),
      claimDate: dto.claimDate ?? new Date().toISOString().slice(0, 10),
      confirmCount: 0,
      disputeCount: 0,
    });
    const savedClaim = await this.claimsRepository.save(claim);

    if (dto.status) {
      issue.status = dto.status;
      await this.issuesRepository.save(issue);
    } else if (issue.status === IssueStatus.OPEN) {
      issue.status = IssueStatus.IN_PROGRESS;
      await this.issuesRepository.save(issue);
    }

    const claimWithRelations = await this.claimsRepository.findOne({
      where: { id: savedClaim.id },
      relations: { issue: true, votes: true },
    });

    if (!claimWithRelations) {
      throw new NotFoundException('Claim not found after creation');
    }

    return claimWithRelations;
  }

  async vote(
    claimId: string,
    userId: string,
    type: ClaimVoteType,
  ): Promise<Claim> {
    return this.claimsRepository.manager.transaction(async (manager) => {
      const claimsRepo = manager.getRepository(Claim);
      const claimVotesRepo = manager.getRepository(ClaimVote);

      const claim = await claimsRepo.findOne({ where: { id: claimId } });
      if (!claim) {
        throw new NotFoundException('Claim not found');
      }

      const existingVote = await claimVotesRepo.findOne({
        where: { claimId, userId },
      });

      if (!existingVote) {
        const newVote = claimVotesRepo.create({ claimId, userId, type });
        await claimVotesRepo.save(newVote);
        if (type === ClaimVoteType.CONFIRM) {
          claim.confirmCount += 1;
        } else {
          claim.disputeCount += 1;
        }
      } else if (existingVote.type === type) {
        throw new ConflictException('You already voted this claim');
      } else {
        if (existingVote.type === ClaimVoteType.CONFIRM) {
          claim.confirmCount = Math.max(0, claim.confirmCount - 1);
        } else {
          claim.disputeCount = Math.max(0, claim.disputeCount - 1);
        }

        existingVote.type = type;
        await claimVotesRepo.save(existingVote);

        if (type === ClaimVoteType.CONFIRM) {
          claim.confirmCount += 1;
        } else {
          claim.disputeCount += 1;
        }
      }

      await claimsRepo.save(claim);

      const updatedClaim = await claimsRepo.findOne({
        where: { id: claimId },
        relations: { issue: true, votes: true },
      });

      if (!updatedClaim) {
        throw new NotFoundException('Claim not found after vote');
      }

      return updatedClaim;
    });
  }
}
