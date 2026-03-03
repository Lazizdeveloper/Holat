# Deployment Runbook

## 1. Pre-Deploy Checklist

1. Set production env vars (`.env` or secret manager)
2. Ensure `DB_SYNC=false`
3. Ensure `CORS_ORIGINS` has explicit domains (no `*`)
4. Set strong `JWT_SECRET` and `JWT_REFRESH_SECRET`
5. Configure upload driver:
   - local: `UPLOAD_DRIVER=local`
   - S3/MinIO: `UPLOAD_DRIVER=s3` + `S3_*` vars
6. Configure monitoring:
   - `METRICS_ENABLED=true`
   - optional `METRICS_API_KEY`
   - optional `SENTRY_ENABLED=true`

## 2. Rollout Steps

1. Build image:
   - `docker build -t holat-backend:latest .`
2. Run migrations on target DB:
   - `npm run migration:run`
3. Start new application version
4. Validate:
   - `/api/health`
   - `/api/health/ready`
   - `/api/metrics`
5. Shift traffic to new version

## 3. Rollback

1. Shift traffic back to previous version
2. If schema rollback is required:
   - `npm run migration:revert`
3. Restore DB from backup if needed

## 4. Backup/Restore

PowerShell scripts:
- `scripts/backup-db.ps1`
- `scripts/restore-db.ps1`

Example:

```powershell
.\scripts\backup-db.ps1 -ConnectionString "postgresql://user:pass@host:5432/db" -OutputPath ".\backups\holat-2026-03-02.dump"
.\scripts\restore-db.ps1 -ConnectionString "postgresql://user:pass@host:5432/db" -InputPath ".\backups\holat-2026-03-02.dump"
```

## 5. Post-Deploy Monitoring

1. Watch `5xx` error rate in `/api/metrics`
2. Review structured logs for auth lockouts and upload failures
3. Verify audit logs are being written (`audit_logs` table)
