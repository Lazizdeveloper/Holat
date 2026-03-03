import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Issue } from '../../issues/entities/issue.entity';
import { ClaimVote } from './claim-vote.entity';

@Entity({ name: 'claims' })
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'issue_id', type: 'uuid' })
  issueId: string;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @Column({ type: 'varchar', length: 160 })
  organization: string;

  @Column({ type: 'text' })
  statement: string;

  @Column({ name: 'claim_date', type: 'date' })
  claimDate: string;

  @Column({ name: 'confirm_count', type: 'integer', default: 0 })
  confirmCount: number;

  @Column({ name: 'dispute_count', type: 'integer', default: 0 })
  disputeCount: number;

  @ManyToOne(() => Issue, (issue) => issue.claims, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @ManyToOne(() => User, (user) => user.claims, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @OneToMany(() => ClaimVote, (vote) => vote.claim)
  votes: ClaimVote[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
