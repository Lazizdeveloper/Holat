import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { ClaimVote } from '../claims/entities/claim-vote.entity';
import { Claim } from '../claims/entities/claim.entity';
import { Issue } from './entities/issue.entity';
import { IssueVote } from './entities/issue-vote.entity';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, IssueVote, Claim, ClaimVote]),
    AuditModule,
  ],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService, TypeOrmModule],
})
export class IssuesModule {}
