import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSecurityAuditAndIndexes1700000003000
  implements MigrationInterface
{
  name = 'AddSecurityAuditAndIndexes1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "login_locked_until" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "last_login_ip" character varying(64)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "actor_id" uuid,
        "actor_email" character varying(160),
        "action" character varying(80) NOT NULL,
        "outcome" character varying(20) NOT NULL,
        "request_ip" character varying(64),
        "user_agent" character varying(300),
        "request_path" character varying(300),
        "request_method" character varying(12),
        "details" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at"
      ON "audit_logs" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action_created_at"
      ON "audit_logs" ("action", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_actor_id_created_at"
      ON "audit_logs" ("actor_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_created_at"
      ON "issues" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_reporter_id_created_at"
      ON "issues" ("reporter_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_priority"
      ON "issues" ("priority")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issue_votes_user_id_created_at"
      ON "issue_votes" ("user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_claims_created_at"
      ON "claims" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_claim_votes_user_id_created_at"
      ON "claim_votes" ("user_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_claim_votes_user_id_created_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_claims_created_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_issue_votes_user_id_created_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_issues_priority"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_issues_reporter_id_created_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_issues_created_at"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_audit_logs_actor_id_created_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_audit_logs_action_created_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_audit_logs_created_at"
    `);
    await queryRunner.query('DROP TABLE IF EXISTS "audit_logs"');

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "last_login_ip"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "last_login_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "login_locked_until"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "failed_login_attempts"
    `);
  }
}
