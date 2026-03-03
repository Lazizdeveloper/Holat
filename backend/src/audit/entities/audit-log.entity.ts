import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'audit_logs' })
@Index('IDX_audit_logs_created_at', ['createdAt'])
@Index('IDX_audit_logs_action_created_at', ['action', 'createdAt'])
@Index('IDX_audit_logs_actor_id_created_at', ['actorId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_email', type: 'varchar', length: 160, nullable: true })
  actorEmail: string | null;

  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ type: 'varchar', length: 20 })
  outcome: string;

  @Column({ name: 'request_ip', type: 'varchar', length: 64, nullable: true })
  requestIp: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;

  @Column({ name: 'request_path', type: 'varchar', length: 300, nullable: true })
  requestPath: string | null;

  @Column({ name: 'request_method', type: 'varchar', length: 12, nullable: true })
  requestMethod: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
