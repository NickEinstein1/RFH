# RFH Care — Adult Family Home EHR + eMAR

HIPAA-oriented multi-tenant modular monolith (NestJS + PostgreSQL/Prisma + React).

## Sprints

1. Auth/RBAC · Residents · eMAR · Notes · Audit  
2. Care plans/ADL · Credentials · Family links · Postgres RLS  
3. Offline med-pass sync · Incidents · Inspection pack · PHI field encryption (AES-256-GCM)

## Run locally

```bash
brew services start postgresql@16

cd apps/api && cp ../../.env.example .env
# Set PHI_FIELD_KEY to `openssl rand -base64 32`
npx prisma migrate deploy
npx prisma db seed

npm run dev:api   # http://localhost:3000/api
npm run dev:web   # http://localhost:5173
```

### Demo logins (password `Password123!`)

| Email | Role | Facility |
|-------|------|----------|
| owner@sunrise.demo | OWNER | Sunrise Adult Family Home |
| nurse@sunrise.demo | NURSE | Sunrise Adult Family Home |
| care@sunrise.demo | CAREGIVER | Sunrise Adult Family Home |
| family@sunrise.demo | FAMILY_VIEWER | Sunrise Adult Family Home |

### Loving Garden AFH

| Email | Password | Role |
|-------|----------|------|
| lovinggardenafh@gmail.com | LovinggardenAFH_2026 | OWNER (Jane Mburu) |

Facility chart packets: `Loving garden documents/`

