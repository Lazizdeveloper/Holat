# API Contract (Frontend <> Backend)

## Pagination Contract

All paginated responses follow this shape:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "limit": 20,
  "totalPages": 0,
  "hasNextPage": false,
  "hasPrevPage": false,
  "sortBy": "createdAt",
  "sortOrder": "desc"
}
```

Query params:
- `page`: integer >= 1
- `limit`: integer >= 1 (max 100)
- `sortBy`: endpoint-specific field
- `sortOrder`: `asc` or `desc`
- endpoint-specific filters (e.g. `status`, `category`, `region`, `search`)

## Endpoints Using Pagination

- `GET /api/issues`
- `GET /api/issues/feed`
- `GET /api/users/me/issues`
- `GET /api/analytics/regions`
- `GET /api/analytics/ministries`

## Feed Flags Contract (`/api/issues/feed`)

Each item includes:
- `mine`: boolean
- `voted`: boolean
- `mv`: `confirm | dispute | null`
- `image`: `string | null`

Notes:
- `mine`, `voted`, `mv` depend on authenticated user context.
- If request has no JWT, these return default values (`false`, `false`, `null`).

## Profile Contract

- `GET /api/users/me/stats`:
  - `reports`, `votes`, `verifications`
  - `openReports`, `inProgressReports`, `resolvedReports`
- `GET /api/users/me/preferences`
- `PATCH /api/users/me/preferences`
  - accepted aliases: `notifOn/emailOn`
  - canonical keys: `notificationEnabled/emailNotificationsEnabled`

## Upload Contract

- `POST /api/uploads` (`multipart/form-data`, field name: `file`)

Response:

```json
{
  "fileName": "issues/2026/03/02/....png",
  "imageUrl": "/uploads/issues/2026/03/02/....png",
  "url": "https://cdn.example.com/uploads/issues/2026/03/02/....png",
  "mimeType": "image/png",
  "size": 12345,
  "driver": "local"
}
```

`imageUrl` is the value that should be stored in issue payload (`POST /api/issues` -> `imageUrl`).
