import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIssueImageAndUserPreferences1700000002000
  implements MigrationInterface
{
  name = 'AddIssueImageAndUserPreferences1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "issues"
      ADD COLUMN IF NOT EXISTS "image_url" character varying(1024)
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "notification_enabled" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "email_notifications_enabled"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "notification_enabled"
    `);
    await queryRunner.query(`
      ALTER TABLE "issues"
      DROP COLUMN IF EXISTS "image_url"
    `);
  }
}
