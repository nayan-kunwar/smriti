# Local Development Runbook

Step-by-step guide to run **Smriti** (AI Memory Service) on your machine.

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | >= 20 |
| pnpm | 11.7.0 (see `packageManager` in root `package.json`) |
| Docker Desktop | Running (for Postgres, Redis, Kafka, observability stack) |
| Git Bash or WSL | Recommended on Windows for `source .env` |

Verify:

```bash
node --version
pnpm --version
docker --version
docker compose version
```

## 1. First-time setup

From the repo root:

```bash
pnpm install
cp .env.example .env
```

The default `.env` is configured for local Docker services. Key values:

| Variable | Local default |
| --- | --- |
| `POSTGRES_URL` | `postgres://smriti:smriti@localhost:55432/smriti` |
| `REDIS_URL` | `redis://localhost:6379` |
| `KAFKA_BROKERS` | `localhost:9092` |
| `EMBEDDING_PROVIDER` | `mock` (no API key needed) |
| `HTTP_PORT` | `3000` |

> **Note:** Postgres uses host port **55432** (not 5432) to avoid conflicts with a local Postgres install.

## 2. Start infrastructure

```bash
pnpm infra:up
```

Wait until containers are healthy:

```bash
docker compose -f infra/docker/docker-compose.yml ps
```

Expected services:

| Service | Host port | Purpose |
| --- | --- | --- |
| Postgres (pgvector) | 55432 | Primary datastore + vectors |
| Redis | 6379 | Working memory + context cache |
| Kafka | 9092 | Event bus for workers |
| Prometheus | 9090 | Metrics |
| Grafana | 3001 | Dashboards (admin/admin) |
| OTel Collector | 4317, 4318 | Traces/metrics export |

Give Kafka ~10 seconds after `infra:up` before starting workers.

## 3. Run database migrations

Load env and migrate:

```bash
# Git Bash / WSL / macOS / Linux
set -a && source .env && set +a && pnpm db:migrate
```

```powershell
# PowerShell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2] }
}
pnpm db:migrate
```

You should see:

```text
[migrate] applied migration: 0001_init.sql
[migrate] done (1 applied)
```

## 4. Create a test user

Create a dev user via the API (no manual SQL required):

```bash
curl -X POST http://localhost:3000/users \
  -H "content-type: application/json" \
  -d '{"name":"Local Dev","id":"22222222-2222-2222-2222-222222222222"}'
```

Or omit `id` to let the server generate one:

```bash
curl -X POST http://localhost:3000/users \
  -H "content-type: application/json" \
  -d '{"name":"Local Dev"}'
```

Use the returned `user.id` in API requests as `x-user-id`.

## 5. Start application services

Open **separate terminals** (or use the convenience scripts below). Always load `.env` first in each terminal.

### API (required)

```bash
set -a && source .env && set +a && pnpm dev:api
```

### Workers (required for embeddings, scoring, summaries)

```bash
set -a && source .env && set +a && pnpm dev:workers
```

Or start individually:

```bash
pnpm dev:embedding-worker
pnpm dev:importance-worker
pnpm dev:summarizer-worker
pnpm dev:consolidation-worker
pnpm dev:profile-worker
pnpm dev:scheduler
```

### Startup order

1. `pnpm infra:up`
2. Wait for Kafka (~10s)
3. `pnpm db:migrate` (first time only)
4. Seed user (first time only)
5. `pnpm dev:api`
6. `pnpm dev:workers`

## 6. Verify the stack

### Health checks

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

Expected:

```json
{"status":"ok"}
{"status":"ok","dependencies":{"postgres":true,"redis":true}}
```

### Metrics

```bash
curl http://localhost:3000/metrics
```

### Grafana

Open [http://localhost:3001](http://localhost:3001) (login: `admin` / `admin`).

## 7. Smoke test the API

All requests require header `x-user-id` (UUID). Use the seeded user id.

### Create a memory

```bash
curl -X POST http://localhost:3000/memories \
  -H "Content-Type: application/json" \
  -H "x-user-id: 22222222-2222-2222-2222-222222222222" \
  -d '{
    "type": "semantic",
    "content": "I am a backend engineer learning Kafka"
  }'
```

Returns `202` with a memory object in `pending` status. Workers will embed and score it asynchronously.

### List memories

```bash
curl "http://localhost:3000/users/22222222-2222-2222-2222-222222222222/memories" \
  -H "x-user-id: 22222222-2222-2222-2222-222222222222"
```

### Retrieve context (after embedding worker processes the memory)

Wait a few seconds, then:

```bash
curl -X POST http://localhost:3000/memories/context \
  -H "Content-Type: application/json" \
  -H "x-user-id: 22222222-2222-2222-2222-222222222222" \
  -d '{
    "query": "What is the user learning?",
    "limit": 5
  }'
```

### Delete a memory

```bash
curl -X DELETE http://localhost:3000/memories/<memory-id> \
  -H "x-user-id: 22222222-2222-2222-2222-222222222222"
```

## 8. Development commands

| Command | Description |
| --- | --- |
| `pnpm dev:api` | Start API with hot reload |
| `pnpm dev:workers` | Start all workers + scheduler |
| `pnpm infra:up` | Start Docker infrastructure |
| `pnpm infra:down` | Stop Docker infrastructure |
| `pnpm db:migrate` | Apply pending SQL migrations |
| `pnpm typecheck` | Typecheck all projects |
| `pnpm lint` | Lint all projects |
| `pnpm test` | Run unit tests |
| `pnpm build` | Build all apps |

## 9. Stop and reset

### Stop app processes

Press `Ctrl+C` in each terminal running `dev:*`.

### Stop infrastructure

```bash
pnpm infra:down
```

### Full reset (wipe DB + Redis + Kafka data)

```bash
docker compose -f infra/docker/docker-compose.yml down -v
pnpm infra:up
set -a && source .env && set +a && pnpm db:migrate
# Re-seed user (step 4)
```

## Troubleshooting

### Postgres auth failed / connection refused

- Confirm you use port **55432** in `POSTGRES_URL`, not 5432.
- Check nothing else is bound to 55432: `docker ps` should show `smriti-postgres-1`.
- If you had an old volume with different credentials, reset volumes (see above).

### Kafka workers fail with `ECONNREFUSED`

- Kafka may still be starting. Wait 10–15s after `infra:up`, then restart workers.
- Verify: `docker ps` shows `smriti-kafka-1` running (not `Exited`).

### Workers fail with `UNKNOWN_TOPIC_OR_PARTITION`

- Kafka auto-creates topics, but workers can race on first subscribe.
- Restart workers once Kafka is fully up, or publish one event from the API first.

### API returns FK error on `POST /memories`

- Seed the user (step 4) before creating memories.

### `pnpm install` warns about ignored build scripts

- Safe for local dev. Optionally run `pnpm approve-builds` and approve `esbuild`, `nx`.

### Port already in use

| Port | Service | Fix |
| --- | --- | --- |
| 3000 | API | Change `HTTP_PORT` in `.env` |
| 55432 | Postgres | Change compose port mapping |
| 6379 | Redis | Stop local Redis or change compose port |
| 9092 | Kafka | Stop other Kafka/Redpanda containers |

## Architecture quick reference

```text
Client
  → API (sync: create, list, delete, retrieve context)
  → Kafka (async: embed, score, summarize, consolidate, profile)
  → Workers consume events and write back to Postgres/Redis
```

Retrieval (`POST /memories/context`) is **synchronous** and never goes through Kafka.

See also:

- [ai-memory-service-architecture.md](architecture/ai-memory-service-architecture.md)
- [database-design.md](architecture/database-design.md)
- [event-driven-design.md](architecture/event-driven-design.md)
- [retrieval-pipeline-design.md](architecture/retrieval-pipeline-design.md)
