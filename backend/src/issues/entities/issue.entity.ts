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
import { Claim } from '../../claims/entities/claim.entity';
import { IssueCategory } from '../../common/enums/issue-category.enum';
import { IssuePriority } from '../../common/enums/issue-priority.enum';
import { IssueStatus } from '../../common/enums/issue-status.enum';
import { User } from '../../users/entities/user.entity';
import { IssueVote } from './issue-vote.entity';

@Entity({ name: 'issues' })
export class Issue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: IssueCategory,
  })
  category: IssueCategory;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 80 })
  region: string;

  @Column({
    type: 'enum',
    enum: IssuePriority,
    default: IssuePriority.MEDIUM,
  })
  priority: IssuePriority;

  @Column({
    type: 'enum',
    enum: IssueStatus,
    default: IssueStatus.OPEN,
  })
  status: IssueStatus;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ name: 'image_url', type: 'varchar', length: 1024, nullable: true })
  imageUrl: string | null;

  @Column({ name: 'upvote_count', type: 'integer', default: 0 })
  upvoteCount: number;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User, (user) => user.reportedIssues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @OneToMany(() => IssueVote, (vote) => vote.issue)
  votes: IssueVote[];

  @OneToMany(() => Claim, (claim) => claim.issue)
  claims: Claim[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
