# HOLAT Backend (NestJS + PostgreSQL)

Production-oriented NestJS backend for HOLAT platform.

## Stack

- NestJS + TypeORM + PostgreSQL
- JWT auth (access + refresh)
- Swagger (`/api/docs`)
- Uploads: local or S3/MinIO (`UPLOAD_DRIVER`)
- Monitoring: JSON logs, `/api/metrics`, optional Sentry
- Security: Helmet, rate limiting, login lockout, audit logs

## Setup

1. Open terminal in `backend`
   - `cd backend`
2. Install dependencies
   - `npm install`
3. Create env file
   - copy `.env.example` to `.env`
4. Configure DB and security envs
5. Run migrations
   - `npm run migration:run`
6. Start backend
   - `npm run start:dev`

Server:
- API: `http://localhost:4000/api`
- Swagger: `http://localhost:4000/api/docs`
- Health: `http://localhost:4000/api/health`
- Metrics: `http://localhost:4000/api/metrics`

## Scripts

- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration` (server must be running)
- `npm run test`
- `npm run smoke` (server must be running)
- `npm run migration:run`
- `npm run migration:revert`

## Environment Highlights

Core:
- `DATABASE_URL` (recommended)
- `DB_SYNC=false` in production
- `DB_MIGRATIONS_RUN=true`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (min 32 chars)
- `CORS_ORIGINS` (no `*` in production)

Security:
- `AUTH_MAX_LOGIN_ATTEMPTS`
- `AUTH_LOGIN_LOCK_MINUTES`

Uploads:
- `UPLOAD_DRIVER=local|s3`
- `UPLOAD_DIR`, `UPLOAD_MAX_FILE_MB`, `UPLOAD_CLEANUP_DAYS`
- `UPLOAD_PUBLIC_BASE_URL`
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`

Monitoring:
- `METRICS_ENABLED`
- `METRICS_API_KEY` (optional, recommended in production)
- `ALERT_ERROR_RATE_THRESHOLD`
- `SENTRY_ENABLED`, `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`

## Main Endpoints

Auth:
- `POST /api/auth/register/citizen`
- `POST /api/auth/register/gov`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

Users:
- `GET /api/users/me`
- `GET /api/users/me/stats`
- `GET /api/users/me/issues`
- `GET /api/users/me/preferences`
- `PATCH /api/users/me/preferences`

Issues:
- `GET /api/issues`
- `GET /api/issues/feed`
- `GET /api/issues/feed/:id`
- `GET /api/issues/:id`
- `POST /api/issues`
- `POST /api/issues/:id/upvote`
- `PATCH /api/issues/:id/status`

Claims:
- `GET /api/claims`
- `POST /api/claims`
- `POST /api/claims/issues/:issueId`
- `POST /api/claims/:id/vote`
- `POST /api/claims/issues/:issueId/vote`

Uploads:
- `POST /api/uploads` (multipart/form-data, `file`)

Analytics:
- `GET /api/analytics/regions`
- `GET /api/analytics/ministries`
- `GET /api/analytics/overview`

Monitoring:
- `GET /api/metrics`
- `GET /api/metrics/prometheus`

## API Contract

Paginated endpoints use one response shape:
- `items`, `total`, `page`, `limit`, `totalPages`
- `hasNextPage`, `hasPrevPage`
- `sortBy`, `sortOrder`

Detailed contract: `docs/api-contract.md`

## Deployment/Operations

- Docker/compose templates: `Dockerfile`, `docker-compose.prod.yml`
- CI workflow: `.github/workflows/backend-ci.yml`
- Runbook: `docs/deployment-runbook.md`
- Backup/restore scripts: `scripts/backup-db.ps1`, `scripts/restore-db.ps1`
