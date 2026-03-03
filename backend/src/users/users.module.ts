import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaimVote } from '../claims/entities/claim-vote.entity';
import { IssuesModule } from '../issues/issues.module';
import { IssueVote } from '../issues/entities/issue-vote.entity';
import { Issue } from '../issues/entities/issue.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Issue, IssueVote, ClaimVote]),
    IssuesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
