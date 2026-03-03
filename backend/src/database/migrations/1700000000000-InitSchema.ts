import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'users_role_enum') THEN
          CREATE TYPE "users_role_enum" AS ENUM ('citizen', 'gov', 'admin');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issues_category_enum') THEN
          CREATE TYPE "issues_category_enum" AS ENUM (
            'road',
            'school',
            'hospital',
            'water',
            'electricity',
            'gas',
            'park'
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issues_priority_enum') THEN
          CREATE TYPE "issues_priority_enum" AS ENUM ('low', 'medium', 'high', 'critical');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issues_status_enum') THEN
          CREATE TYPE "issues_status_enum" AS ENUM ('open', 'in_progress', 'resolved');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_votes_type_enum') THEN
          CREATE TYPE "claim_votes_type_enum" AS ENUM ('confirm', 'dispute');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "full_name" character varying(140) NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'citizen',
        "email" character varying(160) NOT NULL,
        "password_hash" character varying(200) NOT NULL,
        "phone" character varying(20),
        "pinfl" character varying(14),
        "region" character varying(80),
        "ministry_key" character varying(50),
        "ministry_name" character varying(120),
        "position" character varying(120),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_pinfl" UNIQUE ("pinfl")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "issues" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "category" "issues_category_enum" NOT NULL,
        "title" character varying(120) NOT NULL,
        "description" text,
        "region" character varying(80) NOT NULL,
        "priority" "issues_priority_enum" NOT NULL DEFAULT 'medium',
        "status" "issues_status_enum" NOT NULL DEFAULT 'open',
        "latitude" double precision,
        "longitude" double precision,
        "upvote_count" integer NOT NULL DEFAULT 0,
        "reporter_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issues_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_issues_reporter_id_users_id" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_status" ON "issues" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_region" ON "issues" ("region")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_issues_category" ON "issues" ("category")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "issue_votes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "issue_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issue_votes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_issue_votes_issue_user" UNIQUE ("issue_id", "user_id"),
        CONSTRAINT "FK_issue_votes_issue_id_issues_id" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_issue_votes_user_id_users_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "claims" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "issue_id" uuid NOT NULL,
        "created_by_id" uuid NOT NULL,
        "organization" character varying(160) NOT NULL,
        "statement" text NOT NULL,
        "claim_date" date NOT NULL,
        "confirm_count" integer NOT NULL DEFAULT 0,
        "dispute_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_claims_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_claims_issue_id_issues_id" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_claims_created_by_id_users_id" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_claims_issue_id" ON "claims" ("issue_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "claim_votes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "claim_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" "claim_votes_type_enum" NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_claim_votes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_claim_votes_claim_user" UNIQUE ("claim_id", "user_id"),
        CONSTRAINT "FK_claim_votes_claim_id_claims_id" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_claim_votes_user_id_users_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "claim_votes"');
    await queryRunner.query('DROP TABLE IF EXISTS "claims"');
    await queryRunner.query('DROP TABLE IF EXISTS "issue_votes"');
    await queryRunner.query('DROP INDEX IF EXISTS "public"."IDX_issues_category"');
    await queryRunner.query('DROP INDEX IF EXISTS "public"."IDX_issues_region"');
    await queryRunner.query('DROP INDEX IF EXISTS "public"."IDX_issues_status"');
    await queryRunner.query('DROP TABLE IF EXISTS "issues"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');

    await queryRunner.query('DROP TYPE IF EXISTS "claim_votes_type_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "issues_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "issues_priority_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "issues_category_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "users_role_enum"');
  }
}
