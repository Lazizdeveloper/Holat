import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ClaimVoteType } from '../../common/enums/claim-vote-type.enum';
import { User } from '../../users/entities/user.entity';
import { Claim } from './claim.entity';

@Entity({ name: 'claim_votes' })
@Unique('UQ_claim_votes_claim_user', ['claimId', 'userId'])
export class ClaimVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'claim_id', type: 'uuid' })
  claimId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ClaimVoteType,
  })
  type: ClaimVoteType;

  @ManyToOne(() => Claim, (claim) => claim.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'claim_id' })
  claim: Claim;

  @ManyToOne(() => User, (user) => user.claimVotes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
