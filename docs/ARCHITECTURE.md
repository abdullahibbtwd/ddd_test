# Architecture

One-page overview of the production-like stack. No business domains yet — only the platform shells.

```mermaid
flowchart LR
  Browser["Browser / PWA"]

  subgraph edge["Edge"]
    Caddy["Caddy<br/>TLS + reverse proxy"]
  end

  subgraph app["App containers"]
    Web["web<br/>nginx static"]
    Api["api<br/>NestJS HTTP"]
    Worker["worker<br/>same image, BullMQ"]
  end

  subgraph data["Data / sidecars"]
    PG["Postgres 18"]
    Redis["Redis 8"]
    Garage["Garage S3"]
    Gotenberg["Gotenberg"]
    SMTP["SMTP server"]
  end

  Browser --> Caddy
  Caddy -->|"/api/*"| Api
  Caddy -->|"everything else"| Web
  Api --> PG
  Api --> Redis
  Api --> Garage
  Api --> Gotenberg
  Worker --> PG
  Worker --> Redis
  Worker --> Garage
  Worker --> Gotenberg
  Worker --> SMTP
```

## Process roles

| Process | Image | Command | Role |
|---------|-------|---------|------|
| migrate | `ddcrm-api` | `prisma migrate deploy` | One-shot schema apply |
| api | `ddcrm-api` | `node dist/main.js` | HTTP, enqueue jobs, Bull Board |
| worker | `ddcrm-api` | `node dist/worker.js` | Consume queues (email, pdf, …) |
| web | `ddcrm-web` | nginx | Built SPA + PWA assets |
| caddy | `caddy` | Caddyfile | Only published ports (80/443) |

Dev differs: Vite on `:5173`, API on `:3000`, Mailpit instead of real SMTP, Garage `--single-node --default-bucket`. See [DEPLOYMENT.md](./DEPLOYMENT.md) and the root README.
