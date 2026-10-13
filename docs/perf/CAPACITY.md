# Capacity model

A Bun process uses **one core**. Ceiling ≈ `1000 / API CPU-ms per request`. Peak mix after a campaign push: 40 % home, 30 % proposals, 20 % search, 8 % request list/detail, 2 % new requests.

## Model (1-vCPU sandbox — not a measurement)

|             | per average request | at 1,000 RPS | provision                                                                                                             |
| ----------- | ------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| API         | ≈ 4.7 ms CPU        | ≈ 4.7 cores  | **7 Bun processes** at 70 %                                                                                           |
| Postgres    | ≈ 1.8 ms CPU        | ≈ 1.8 cores  | **3–4 cores** at 60 %                                                                                                 |
| Connections | 7 × 10 client pools | —            | PgBouncer `default_pool_size` 20 keeps server connections under `max_connections=100`. GlitchTip has its own Postgres |

Target: ~12–16 vCPU for API + Postgres on one host, or API and data on separate hosts. **Staging must not share production cores under load.**

Formula: `replicas ≈ ceil((RPS × cpu_ms_per_request / 1000) / 0.70)`.

## This box: 2 vCPU, 8 GB, staging alongside

`API_REPLICAS=2`, the default in `docker-compose.yml`: one Bun process per core. A third or fourth replica on two cores
adds 512 MB each and no throughput, since Postgres, the worker and staging need the same cores. The 1,000 RPS target
above needs the larger host; what this one carries is measured by the staging k6 run.

Until that run: the mix costs about 4.5 ms of CPU per request, API and Postgres together (measured in process,
2026-10-10), so two cores at 60 % carry about 250 requests a second. The `step` profile of `LOADTEST.md` replaces this
estimate with a measurement through Cloudflare; `load/bench` (nightly) tracks each route's CPU per request against
`baseline.json`.

Replace the model table with measured numbers after the first staging k6 run (`docs/perf/YYYY-MM-DD.md`, how: `LOADTEST.md`). Do not commit `pg_stat_statements` dumps from a laptop or CI — they are not production.
