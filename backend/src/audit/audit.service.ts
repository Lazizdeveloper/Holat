import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

type CreateAuditLogInput = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  outcome: 'success' | 'failure' | 'warning';
  requestIp?: string | null;
  userAgent?: string | null;
  requestPath?: string | null;
  requestMethod?: string | null;
  details?: Record<string, unknown> | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
  ) {}

  async create(input: CreateAuditLogInput): Promise<void> {
    try {
      const log = this.auditLogsRepository.create({
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        outcome: input.outcome,
        requestIp: input.requestIp ?? null,
        userAgent: input.userAgent ?? null,
        requestPath: input.requestPath ?? null,
        requestMethod: input.requestMethod ?? null,
        details: input.details ?? null,
      });

      await this.auditLogsRepository.save(log);
    } catch (error) {
      this.logger.warn(
        `Audit log write failed: ${(error as Error).message || 'unknown error'}`,
      );
    }
  }
}
