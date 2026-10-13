# Load testing staging with k6

What the box carries is measured on staging, from outside, through Cloudflare, the way members reach it. Grafana Cloud
k6 sends the traffic from Frankfurt; the script is `loadtest/k6/mixed.js`. Production is never a target: the scripts
refuse its database, and `deploy.sh` refuses `LOADTEST=1` there.

## What a run costs

Grafana Cloud bills virtual-user hours: the scenario's `maxVUs` × minutes ÷ 60, at least 1 per test. The free plan has
500 a month, and a test that would go over does not start.

| Profile | Traffic                                                                           | maxVUs (default) | VU hours |
| ------- | --------------------------------------------------------------------------------- | ---------------- | -------- |
| `smoke` | 50 requests a second for a minute                                                 | 200              | about 5  |
| `step`  | 100 more requests a second every 2 minutes, up to `MAX_RPS` (400), 8.5 minutes    | `MAX_RPS / 2`    | about 28 |
| `full`  | the 1,000 a second ramp of `CAPACITY.md`, 16.5 minutes — for the larger host only | 3,000            | 825      |

`step` stops itself at the first threshold that fails (1 % errors, p95 over 800 ms, or 100 dropped iterations): the last
step that held is the answer. `MAX_VUS` covers half a second per request at `MAX_RPS`; slower than that fails anyway.

## Before the first run

- A Grafana Cloud account (the free plan is enough), and k6 1.x where you run it: `k6 cloud login --token <token>`.
- Staging deployed with this repository's `scripts/loadtest-staging.ts`.
- If Cloudflare challenges the test (Bot Fight Mode or a WAF rule on `api-staging`), a WAF skip rule for requests whose
  `X-Load-Test` header equals a secret of your choice; pass the same secret as `LOADTEST_HEADER`. Without such a rule,
  leave it out.

## A run

On the box:

```bash
cd /opt/bbc
DC="docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml -f infra/compose.staging.yml --env-file infra/env/production.env --env-file infra/env/staging.env"
install -d -m 700 /root/loadtest
$DC run --rm --no-deps --user 0:0 -v /root/loadtest:/out api-staging bun scripts/loadtest-staging.ts start 200 /out/sessions.json
```

It makes 200 members `load<n>@load.test` the way a sign-up does (the worker writes their rows, as for anyone), signs each
in with a random password that is never written, and leaves their cookies in `/root/loadtest/sessions.json`, readable by
root only. **At least `MAX_RPS / 2` members:** each member may read 120 times a minute (`ratelimit.read`); fewer members
and the test measures the limiter, answering 429.

Where k6 runs, the cookies next to the script (`loadtest/sessions.json` is ignored by git):

```bash
scp root@<box>:/root/loadtest/sessions.json loadtest/sessions.json
k6 cloud run -e BASE_URL=https://api-staging.buybusinessclass.com -e PROFILE=smoke loadtest/k6/mixed.js
k6 cloud run -e BASE_URL=https://api-staging.buybusinessclass.com -e PROFILE=step -e MAX_RPS=400 loadtest/k6/mixed.js
```

`k6 cloud run` sends Grafana Cloud the script, the files it opens and every `-e` value, and they stay there with the
run: the cookies in `sessions.json`, and `LOADTEST_HEADER`. So `stop` comes straight after the test (the cookies end
with their accounts), and a WAF skip rule, if you made one, is switched off after it or gets a new secret.

The mix is `CAPACITY.md`'s peak after a campaign push: 40 % Home, 30 % proposals, 20 % search, 10 % the request list. No writes:
`WRITES=1` adds 2 % new requests, which on staging go through its CRM adapter, and the submit limits (10 an hour a
member, 60 an IP) answer 429 long before capacity does.

While it runs, on the box: `docker stats --no-stream` (CPU and memory of each container) and `/status` (RUNBOOK § Daily
shape). Production shares the box; a step test is for a quiet hour.

## After

```bash
$DC run --rm --no-deps api-staging bun scripts/loadtest-staging.ts stop
shred -u /root/loadtest/sessions.json        # and the copy next to the script
```

Then switch off the WAF skip rule, if you made one, or give it a new secret: the old one went to Grafana Cloud with the run.

`stop` deletes the accounts the way account deletion does; the worker removes their rows everywhere. The cookies stop
working with them.

Write the result down in `docs/perf/YYYY-MM-DD.md`: the profile, `MAX_RPS`, the last step that held, p95 at that step,
and what ran out first (CPU of the API, of Postgres, or the pool). `CAPACITY.md` takes the number from there.

## Locally

`bun run loadtest:smoke` runs the smoke profile against an API on `127.0.0.1:8000`. Sessions come from
`loadtest/make-sessions.ts` after `db:seed:volume` (a local database only), or from `scripts/loadtest-staging.ts` against
a local database outside production mode.
