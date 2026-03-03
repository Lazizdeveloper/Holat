import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from '../issues/entities/issue.entity';
import { ClaimVote } from './entities/claim-vote.entity';
import { Claim } from './entities/claim.entity';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [TypeOrmModule.forFeature([Claim, ClaimVote, Issue])],
  controllers: [ClaimsController],
  providers: [ClaimsService],
  exports: [ClaimsService, TypeOrmModule],
})
export class ClaimsModule {}
