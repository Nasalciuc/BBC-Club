# Stratul Drizzle al BBC Club — designul, pe scurt

**Sursele aplicate:** ghidul de DB design (§5–§10, §15 checklist), ghidul Drizzle (§6, §7, §11, §15 „ce s-a schimbat", §16 bug-uri), schema ATS Hero (lecțiile: XOR real, id intern, enum în DB, contor atomic, expirare, cascadă), ADR-ARCH-001 (schemă per modul, fără FK cross-modul), `FLOWS_DEEP_DIVE` (SKIP LOCKED, advisory lock, batch-uri).

| Decizie         | Alegere                                                                                       | De ce                                                                                |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Versiune        | drizzle-orm **1.x** (RQB v2)                                                                  | evităm migrarea relations v1→v2 după 9 module; `through` pentru M:N nativ            |
| Nume de coloane | explicite în fiecare tabel                                                                    | fără `casing` magic — API-ul s-a schimbat între 0.x și 1.0; explicitul nu se schimbă |
| ID-uri          | `uuid` v4 din DB                                                                              | PG 16 pe VPS; v7 la PG 18; ordinea temporală din `created_at` indexat                |
| Relații         | `defineRelations` compus din **părți per modul**, doar intra-schemă                           | o relație cross-schemă e un JOIN cross-modul cu alt nume; test automat               |
| Tranzacții      | use case-ul deschide `withTx`, repository-urile primesc `Executor`                            | evenimentele se scriu în aceeași tranzacție (outbox)                                 |
| Cozi            | `FOR UPDATE SKIP LOCKED` + `pg_try_advisory_xact_lock`                                        | un singur poller/dispatcher activ, fără dublări                                      |
| Contoare        | `bumpCounter` (upsert atomic, cap opțional)                                                   | testat cu 25 de incremente concurente                                                |
| Migrații        | drizzle-kit `generate` → review → `migrate` sub advisory lock, `exit(1)`, extras SQL după DDL | expand/contract la deploy; trigger + partiționare nu sunt exprimabile în Drizzle     |
| Fitness         | `db:verify` pe DB-ul viu, 8 verificări                                                        | regulile ghidurilor devin CI, nu review                                              |
| Seed            | fixture canonic, idempotent, refuză producția                                                 | lecția din ghidul Drizzle (TRUNCATE fără gardă)                                      |
| Pool            | app 10, scripturi 1, `statement_timeout` 15 s                                                 | Bun = un proces; nimic din request path nu rulează > 15 s                            |
| Better Auth     | `auth.*` generat, mutat în `pgSchema("auth")`, deținut de identity                            | id-ul intern e `auth.user.id` (al nostru), nu al unui furnizor                       |

**Ce rămâne de verificat la instalare (ziua 6):** adaptorul Drizzle al Better Auth pe drizzle-orm 1.x; `drizzle-zod` — calea de import în 1.x; `schemaFilter` în drizzle-kit 1.x pentru `pgSchema` multiple.
