# Graph Report - isolated  (2026-09-11)

## Corpus Check
- 131 files · ~28,580 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 863 nodes · 1232 edges · 84 communities (62 shown, 14 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 156 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Tokens And ESLint Gate
- DB Package Manifest
- Identity Better Auth
- PLAN And Push Contract
- Shared Event Catalogue
- Identity Facade Auth
- Turbo Task Graph
- Thin Host App
- DB Migrate Seed Verify
- Engagement Members Schema
- TSConfig Compiler Options
- API Authorize Middleware
- Validate Script Surface
- Host API Wiring
- Mobile Auth Flows
- Event Publisher API
- Review Account Seed
- Identity Hono Host
- Identity Shared Schemas
- Module Talk Two Ways
- Enforcement ADR Tooling
- Proposals Offer Events
- BBC Path Aliases
- DB Layer Design
- Platform Schema Tables
- Journal Poller
- Flags And Event Schema
- Telemetry Logger Metrics
- Platform Facade API
- CRM Mirror Sync
- Members Profile Module
- Identity Notifications Events
- Personalization Ranker
- DB Seed CRM Schema
- createPlatform Tests
- Platform Jobs Registry
- Authz Policy Docs
- Per-Module Postgres Schemas
- New Module Scaffold
- SKIP LOCKED Dispatch
- Host Runtime Dependencies
- BBC DB Design Guide
- Transactional Outbox
- DB Drizzle Relations
- EventRegistry
- Engagement Respond
- Permission Role Model
- Module Killswitch Flags
- Campaigns Module Contract
- Host Module Registry
- Auth Better Auth Schema
- Proposals Offers Schema
- Shared Domain Errors
- Offer Response Fanout
- CI Validate Workflow
- Notifications Schema
- Platform Module Wiring
- Authz Principal Module
- CLAUDE Validate Quick
- Member Registered Reconcile
- Module Check Fitness
- Host Package Scripts
- buildApp Registry
- Auth Error Messages
- Platform Principal Module
- Notifications Mark Read
- Engagement Module Boot
- Identity Email Sender
- Proposals Offers Repo
- Mobile Sign-In Screen
- Authz Implementation ADR
- Test Global Setup
- useSession Hook
- BBC DB Package
- Platform Module Contract
- BBC Platform README

## God Nodes (most connected - your core abstractions)
1. `Modules Talk Two Ways Only` - 32 edges
2. `scripts` - 20 edges
3. `core/identity Module Contract` - 16 edges
4. `compilerOptions` - 15 edges
5. `identity-production Archive` - 15 edges
6. `EventRegistry` - 14 edges
7. `paths` - 14 edges
8. `core/notifications Module Contract` - 14 edges
9. `intelligence/personalization Module Contract` - 14 edges
10. `AGENTS Ten Rules` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Transactional Outbox` --semantically_similar_to--> `Atomic Event plus Deliveries`  [INFERRED] [semantically similar]
  packages-db-production/packages/db/DB_LAYER_DESIGN.md → platform-production/platform-prod/packages/modules/platform/MODULE.md
- `Actor Comes From Principal` --semantically_similar_to--> `no-member-id-in-request-schemas Lint`  [INFERRED] [semantically similar]
  enforcement-production/enforcement-prod/AGENTS.md → authz-production/authz-prod/packages/shared/src/authz/README.md
- `At-Least-Once Plus Idempotent` --semantically_similar_to--> `At-Least-Once Delivery`  [INFERRED] [semantically similar]
  enforcement-production/enforcement-prod/AGENTS.md → platform-production/platform-prod/packages/modules/platform/MODULE.md
- `identity Facade API` --semantically_similar_to--> `Identity Facade and Hono Middleware`  [INFERRED] [semantically similar]
  enforcement-production/enforcement-prod/packages/modules/core/identity/MODULE.md → identity-production/identity-prod/README.md
- `REQUIRED_SECTIONS` --conceptually_related_to--> `core/identity Module Contract`  [INFERRED]
  enforcement-production/enforcement-prod/scripts/check-modules.ts → enforcement-production/enforcement-prod/packages/modules/core/identity/MODULE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Two-layer authorization enforcement** — authz_production_authz_prod_packages_shared_src_authz_readme_principals, authz_production_authz_prod_packages_shared_src_authz_readme_authorize, authz_production_authz_prod_packages_shared_src_authz_readme_ownership_sql_where, authz_production_authz_prod_packages_shared_src_authz_readme_killswitch, authz_production_authz_prod_packages_shared_src_authz_readme_no_member_id_in_request_schemas [EXTRACTED 1.00]
- **buildApp six-step boot** — host_production_host_prod_apps_api_readme_buildapp, host_production_host_prod_apps_api_readme_env, host_production_host_prod_apps_api_readme_db, host_production_host_prod_apps_api_readme_platform, host_production_host_prod_apps_api_readme_modules, host_production_host_prod_apps_api_readme_middleware, host_production_host_prod_apps_api_readme_routes, host_production_host_prod_apps_api_readme_poller [EXTRACTED 1.00]
- **Three-tool architectural constitution** — enforcement_production_enforcement_prod_docs_adr_adr_impl_009_enforcement_three_tools, enforcement_production_enforcement_prod_dependency_cruiser, enforcement_production_enforcement_prod_eslint_config, enforcement_production_enforcement_prod_eslint_rules_index, enforcement_production_enforcement_prod_docs_adr_adr_impl_009_enforcement_validate_merge_gate [EXTRACTED 1.00]
- **in-memory test host doubles** — host_production_host_prod_apps_api_test_helpers_test_app, host_production_host_prod_apps_api_readme_capturing_email_sender, host_production_host_prod_apps_api_readme_mock_crm, host_production_host_prod_apps_api_readme_recording_push_adapter [EXTRACTED 1.00]
- **Offer response fan-out** — enforcement_production_enforcement_prod_packages_modules_domain_proposals_module_offer_published, enforcement_production_enforcement_prod_packages_modules_domain_engagement_module_offer_responded, enforcement_production_enforcement_prod_packages_modules_core_notifications_module_consumes_offer_responded, enforcement_production_enforcement_prod_packages_modules_integration_crm_module_consumes_offer_responded [EXTRACTED 1.00]
- **throwaway in-RAM postgres-test** — host_production_host_prod_infra_compose_test_postgres_test, host_production_host_prod_infra_compose_test_tmpfs, host_production_host_prod_infra_compose_test_bbc_test [EXTRACTED 1.00]
- **Cheapest-first validate merge gate** — enforcement_production_enforcement_prod_docs_adr_adr_impl_009_enforcement_validate_merge_gate, enforcement_production_enforcement_prod_github_workflows_validate_validate_job_steps, enforcement_production_enforcement_prod_package_scripts_validate, enforcement_production_enforcement_prod_package_scripts_validate_quick, enforcement_production_enforcement_prod_agents_done_means_validate_green, enforcement_production_enforcement_prod_github_pull_request_template_definition_of_done [EXTRACTED 1.00]
- **Single-active poller via SKIP LOCKED** — packages_db_production_packages_db_db_layer_design_skip_locked, packages_db_production_packages_db_db_layer_design_advisory_lock, packages_db_production_packages_db_readme_forupdateskiplocked, packages_db_production_packages_db_readme_tryadvisoryxactlock, platform_production_platform_prod_packages_modules_platform_readme_poller [INFERRED 0.85]
- **Transactional outbox write path** — packages_db_production_packages_db_readme_withtx, packages_db_production_packages_db_readme_executor, packages_db_production_packages_db_readme_events_publish, platform_production_platform_prod_packages_modules_platform_module_transactional_outbox, platform_production_platform_prod_packages_modules_platform_module_domain_events, platform_production_platform_prod_packages_modules_platform_readme_events_publish [INFERRED 0.85]
- **Identity facade surface** — enforcement_production_enforcement_prod_packages_modules_core_identity_module_facade, enforcement_production_enforcement_prod_packages_modules_core_identity_module_handler_better_auth, identity_production_identity_prod_readme_requiremember, identity_production_identity_prod_readme_identity_facade [EXTRACTED 1.00]
- **Member register delete reconcile loop** — enforcement_production_enforcement_prod_packages_modules_core_identity_module_member_registered, enforcement_production_enforcement_prod_packages_modules_core_identity_module_member_deleted, identity_production_identity_prod_packages_modules_core_identity_module_post_hook_outside_tx, identity_production_identity_prod_packages_modules_core_identity_module_reconcile_missing_profiles [EXTRACTED 1.00]
- **Better Auth generate and mount** — host_production_host_prod_apps_api_readme_better_auth, identity_production_identity_prod_readme_better_auth_cli, identity_production_identity_prod_readme_pgschema_auth, identity_production_identity_prod_readme_createauth, identity_production_identity_prod_readme_hono_host [EXTRACTED 1.00]

## Communities (84 total, 14 thin omitted)

### Community 0 - "Tokens And ESLint Gate"
Cohesion: 0.05
Nodes (45): devDependencies, dependency-cruiser, eslint, eslint-plugin-boundaries, eslint-plugin-import, gitleaks, husky, lint-staged (+37 more)

### Community 1 - "DB Package Manifest"
Cohesion: 0.04
Nodes (44): dependencies, drizzle-orm, postgres, zod, devDependencies, drizzle-kit, exports, ./helpers (+36 more)

### Community 2 - "Identity Better Auth"
Cohesion: 0.08
Nodes (34): Better Auth Access Control, identity Facade API, Better Auth Handler, HIBP Password Refusal, member.email_verified, member.password_changed, core/identity Module Contract, EmailSender Port (+26 more)

### Community 3 - "PLAN And Push Contract"
Cohesion: 0.08
Nodes (34): Pull Request Template, PLAN.md Lines Ticked, PR Rollback Plan, PushSender Port, APNs And FCM Adapters, Five Push Failure Reasons, No Expo Push Service, integration/push Module Contract (+26 more)

### Community 4 - "Shared Event Catalogue"
Cohesion: 0.12
Nodes (17): CrmActivityCreatedV1, CrmMirrorSyncedV1, EVENT_CATALOGUE, EventType, MemberDeletedV1, MemberEmailVerifiedV1, MemberLinkedToCrmV1, MemberPasswordChangedV1 (+9 more)

### Community 5 - "Identity Facade Auth"
Cohesion: 0.11
Nodes (16): AuthVars, createIdentityFacade(), IdentityFacade, Member, ac, Role, roles, statement (+8 more)

### Community 6 - "Turbo Task Graph"
Cohesion: 0.08
Nodes (23): dependsOn, outputs, cache, persistent, globalDependencies, $schema, tasks, build (+15 more)

### Community 7 - "Thin Host App"
Cohesion: 0.14
Nodes (18): bun test, capturing email sender, infra/compose.test.yml, Demo 2, mock CRM, recording push adapter, testAuth, capturingEmail() (+10 more)

### Community 8 - "DB Migrate Seed Verify"
Cohesion: 0.12
Nodes (13): db, db, tables, db, OWNED_SCHEMAS, problems, createDb(), Db (+5 more)

### Community 9 - "Engagement Members Schema"
Cohesion: 0.13
Nodes (18): engagement, offerResponses, responseKind, createdAt(), id(), nowSql, NOTE: $onUpdate only fires through Drizzle; migration 0001 also installs a, tz() (+10 more)

### Community 10 - "TSConfig Compiler Options"
Cohesion: 0.12
Nodes (15): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noImplicitOverride, noUncheckedIndexedAccess (+7 more)

### Community 11 - "API Authorize Middleware"
Cohesion: 0.29
Nodes (11): authorize(), Flags, registerRoute(), routeRegistry, err(), MESSAGES, Opts, PrincipalVars (+3 more)

### Community 12 - "Validate Script Surface"
Cohesion: 0.15
Nodes (15): Validate Job Cheapest-First, scripts, db:verify, dev, e2e, format, format:fix, lint (+7 more)

### Community 13 - "Host API Wiring"
Cohesion: 0.19
Nodes (11): AppType, BuildOptions, installBaseMiddleware(), errorContract(), Logger, Metrics, appConfig(), KILLABLE (+3 more)

### Community 14 - "Mobile Auth Flows"
Cohesion: 0.22
Nodes (9): authClient, deleteAccount(), fail(), join(), resendCode(), resetPassword(), Result, signIn() (+1 more)

### Community 15 - "Event Publisher API"
Cohesion: 0.30
Nodes (8): Platform, createPublisher(), Publisher, PublishInput, EventDefinition, Handler, HandlerContext, tombstoneMember()

### Community 16 - "Review Account Seed"
Cohesion: 0.17
Nodes (11): name, private, type, version, auth, db, env, @bbc/db (+3 more)

### Community 17 - "Identity Hono Host"
Cohesion: 0.17
Nodes (10): app, AppType, auth, db, env, events, identity, logger (+2 more)

### Community 18 - "Identity Shared Schemas"
Cohesion: 0.15
Nodes (9): Email, Otp, Password, ServerEnv, MemberDeletedV1, MemberEmailVerifiedV1, MemberPasswordChangedV1, MemberRegisteredV1 (+1 more)

### Community 19 - "Module Talk Two Ways"
Cohesion: 0.18
Nodes (11): bun run arch:check, Await Every Side Effect, Env Only Through loadEnv, New Things Have A Shape, No Cross-Module JOINs, AGENTS Ten Rules, Truth Lives In One Place, arch:check (+3 more)

### Community 20 - "Enforcement ADR Tooling"
Cohesion: 0.26
Nodes (11): Do Not Touch Without An ADR, Done Means bun run validate Green, layer(), CODEOWNERS Protects Contracts And Platform, ADR-IMPL-009 Boundaries Enforced By Tooling, Unencoded Rules Do Not Exist, Three Enforcement Tools, Tokens Generated From DESIGN.md (+3 more)

### Community 21 - "Proposals Offer Events"
Cohesion: 0.18
Nodes (11): Proposals.ingest Port, Proposals.getVisible Port, expire-offers Job, proposals Facade API, offers.idempotency_key UNIQUE, S2S ingest Guarded By proposals:ingest, offer.expired, offer.withdrawn (+3 more)

### Community 22 - "BBC Path Aliases"
Cohesion: 0.18
Nodes (11): engagement Facade API, email Facade API, push Facade API, paths, @bbc/db, @bbc/email, @bbc/engagement, @bbc/platform (+3 more)

### Community 23 - "DB Layer Design"
Cohesion: 0.18
Nodes (11): Canonical Idempotent Seed Fixture, Intra-schema defineRelations, Drizzle Guide, drizzle-orm 1.x Relational Queries v2, Explicit Column Names, Database UUID v4 Identifiers, Opaque IDs Across Modules, RQB v2 Relations Parts per Module (+3 more)

### Community 24 - "Platform Schema Tables"
Cohesion: 0.20
Nodes (9): bumpCounter(), domainEvents, eventCursors, eventDlq, eventInbox, flags, platform, rateLimits (+1 more)

### Community 25 - "Journal Poller"
Cohesion: 0.27
Nodes (10): BACKOFF_MS, createPoller(), drainOnce(), loop(), processOne(), PollerDeps, PollerOptions, sleep() (+2 more)

### Community 26 - "Flags And Event Schema"
Cohesion: 0.20
Nodes (9): Flags, FlagValue, deliveryStatus, domainEvents, eventDeliveries, externalInbox, flags, platform (+1 more)

### Community 27 - "Telemetry Logger Metrics"
Cohesion: 0.27
Nodes (7): createLogger(), Logger, maskEmail(), REDACT, createMetrics(), Labels, Metrics

### Community 28 - "Platform Facade API"
Cohesion: 0.22
Nodes (10): Delete Equals Zero Rows, Platform Alerts, platform.event_dlq, Platform Facade API, Platform-Owned Jobs, tombstoneMember, createPlatform, EVENT_CATALOGUE (+2 more)

### Community 29 - "CRM Mirror Sync"
Cohesion: 0.20
Nodes (10): CrmLookup.findByEmail Port, crm.activity_created, CRMConnector Port, Activity Exactly Once By external_id, crm Facade API, Mirror Freshness 24h/72h, integration/crm Module Contract, reconcile-activities Job (+2 more)

### Community 30 - "Members Profile Module"
Cohesion: 0.20
Nodes (10): members Facade API, linked IFF crm_client_id Present, member.linked_to_crm, member.profile_updated, core/members Module Contract, purge-deleted Job, reconcile-profiles Job, members.* Schema (+2 more)

### Community 31 - "Identity Notifications Events"
Cohesion: 0.20
Nodes (10): Consumes offer.published, notifications Facade API, Push Payload Contains No PII, notification.delivered, notification.failed, core/notifications Module Contract, Quiet Hours With Member Timezone, Transactional Bypasses Consent (+2 more)

### Community 32 - "Personalization Ranker"
Cohesion: 0.20
Nodes (10): offer.viewed, personalization.candidate_suggested, Consumes offer.viewed, contextLines BFF 300ms Budget, personalization Facade API, nightly-features Job, No Model On Request Path, intelligence/personalization Module Contract (+2 more)

### Community 33 - "DB Seed CRM Schema"
Cohesion: 0.22
Nodes (8): db, crm, mirror, RouteHistory, syncRuns, syncStatus, profile, offers

### Community 34 - "createPlatform Tests"
Cohesion: 0.22
Nodes (6): createPlatform(), createFlags(), db, db, Payload, platformWith()

### Community 35 - "Platform Jobs Registry"
Cohesion: 0.22
Nodes (6): jobRuns, createJobs(), JobContext, JobHandler, Jobs, JobSpec

### Community 36 - "Authz Policy Docs"
Cohesion: 0.28
Nodes (7): actorMemberId Async Principal, no-member-id-in-request-schemas Lint, Ownership in SQL WHERE, Authorization Principals, Actor Comes From Principal, memberId In Body Ignored, Consumer ctx.principal

### Community 37 - "Per-Module Postgres Schemas"
Cohesion: 0.22
Nodes (9): Invariants Live In Postgres, notifications.* Schema, campaigns.* Schema, Second Identical Tap Is No-op, domain/engagement Module Contract, engagement.* Schema, proposals.* Schema, crm.* Schema (+1 more)

### Community 38 - "New Module Scaffold"
Cohesion: 0.22
Nodes (7): Modules Scaffolded With Failing Contract Test, files, LAYERS, [name, flag, layer], pascal, root, schemaName

### Community 39 - "SKIP LOCKED Dispatch"
Cohesion: 0.28
Nodes (9): dispatch Job SKIP LOCKED, pg_try_advisory_xact_lock, Expand/Contract Migrations, FLOWS_DEEP_DIVE, FOR UPDATE SKIP LOCKED, 0001_extras.sql, platform.cross_schema_fks View, forUpdateSkipLocked (+1 more)

### Community 40 - "Host Runtime Dependencies"
Cohesion: 0.22
Nodes (9): dependencies, @bbc/db, @bbc/email, @bbc/identity, @bbc/platform, @bbc/shared, hono, jose (+1 more)

### Community 41 - "BBC DB Design Guide"
Cohesion: 0.28
Nodes (9): ADR-ARCH-001 Schema per Module, ATS Hero Schema Lessons, bumpCounter, DB Design Guide, db:verify Fitness Functions, BBC Club Drizzle Layer Design, bumpCounter Helper, Live DB Fitness Functions (+1 more)

### Community 42 - "Transactional Outbox"
Cohesion: 0.33
Nodes (9): Connection Pool Sizing, Executor, Transactional Outbox, withTx Use-Case Transactions, createDb, events.publish inside Transaction, Executor Type, withTx (+1 more)

### Community 43 - "DB Drizzle Relations"
Cohesion: 0.47
Nodes (4): relations, notificationsRelations(), personalizationRelations(), proposalsRelations()

### Community 45 - "Engagement Respond"
Cohesion: 0.29
Nodes (5): NOTE: no memberId in the input schema. A lint rule (no-member-id-in-request-…, RespondDeps, RespondInput, RespondResult, responsesRepo

### Community 46 - "Permission Role Model"
Cohesion: 0.25
Nodes (5): Permission, Resource, Role, rolePermissions, statement

### Community 47 - "Module Killswitch Flags"
Cohesion: 0.29
Nodes (8): authorize(permission) Route Layer, Module Killswitch, resource:action Permissions, routeRegistry, toAccessControlRoles, Killswitch Makes rank Refuse, platform.flags, consumer.<name>.paused Flag

### Community 48 - "Campaigns Module Contract"
Cohesion: 0.36
Nodes (8): Modules Talk Two Ways Only, Consumes crm.mirror.synced, campaign.dispatched, campaign.scheduled, campaigns Facade API, domain/campaigns Module Contract, Segment Evaluation In SQL, crm.mirror.synced

### Community 49 - "Host Module Registry"
Cohesion: 0.29
Nodes (6): modules(), Layer, LAYER_ORDER, ModuleDescriptor, ModuleInit, ModuleOutput

### Community 50 - "Auth Better Auth Schema"
Cohesion: 0.25
Nodes (7): account, auth, jwks, rateLimit, session, user, verification

### Community 51 - "Proposals Offers Schema"
Cohesion: 0.25
Nodes (7): cabinClass, FlightFacts, offerSource, offerStatus, offerTargeting, offerTargets, proposals

### Community 52 - "Shared Domain Errors"
Cohesion: 0.25
Nodes (6): apiError, DEFAULT_MESSAGES, DomainError, ERROR_CODES, ErrorCode, HTTP_STATUS

### Community 53 - "Offer Response Fanout"
Cohesion: 0.33
Nodes (7): At-Least-Once Plus Idempotent, member.deleted, Consumes member.deleted, Consumes offer.responded, offer.responded, Consumes personalization.candidate_accepted, Consumes offer.responded Interested

### Community 54 - "CI Validate Workflow"
Cohesion: 0.29
Nodes (7): Module Graph Regenerated On Main, Pre-commit Prettier Plus Gitleaks, Architecture Graph On Main, CI Gitleaks Detect, GitHub Validate Workflow, CI Postgres 16 Service, arch:graph

### Community 55 - "Notifications Schema"
Cohesion: 0.29
Nodes (6): devicePlatform, deviceTokens, notificationCategoryN, notifications, notificationsTable, notificationStatus

### Community 56 - "Platform Module Wiring"
Cohesion: 0.33
Nodes (7): platform.domain_events, platform.event_deliveries, Per-aggregate_id Ordering, platform.* Schema, Atomic Event plus Deliveries, events.registerConsumer, registerModules

### Community 58 - "CLAUDE Validate Quick"
Cohesion: 0.40
Nodes (5): CLAUDE.md Pointers, Report DESIGN.md Conflicts, validate:quick On Pre-push, design:lint, validate:quick

### Community 59 - "Member Registered Reconcile"
Cohesion: 0.50
Nodes (5): member.registered, Consumes member.registered, Post-hook Outside Better Auth Transaction, members.reconcileMissingProfiles, on-member-registered Profile CRM Reconcile

### Community 60 - "Module Check Fitness"
Cohesion: 0.40
Nodes (3): modules, problems, REQUIRED_SECTIONS

### Community 61 - "Host Package Scripts"
Cohesion: 0.40
Nodes (5): scripts, dev, start, test, typecheck

### Community 63 - "Auth Error Messages"
Cohesion: 0.40
Nodes (3): AUTH_MESSAGES, CONSTANT_OTP_SENT, CONSTANT_RESET_SENT

### Community 66 - "Engagement Module Boot"
Cohesion: 0.67
Nodes (3): engagementModule(), facade(), Ports

## Knowledge Gaps
- **317 isolated node(s):** `AppType`, `BuildOptions`, `Logger`, `Metrics`, `Layer` (+312 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 401 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Modules Talk Two Ways Only` connect `Campaigns Module Contract` to `Personalization Ranker`, `Identity Better Auth`, `Module Talk Two Ways`, `Offer Response Fanout`, `BBC Path Aliases`, `Proposals Offer Events`, `Platform Module Wiring`, `Member Registered Reconcile`, `CRM Mirror Sync`, `Members Profile Module`, `Identity Notifications Events`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `buildApp()` connect `PLAN And Push Contract` to `BBC Path Aliases`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `modules` connect `PLAN And Push Contract` to `Host Module Registry`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `Modules Talk Two Ways Only` (e.g. with `Atomic Event plus Deliveries` and `identity Facade API`) actually correct?**
  _`Modules Talk Two Ways Only` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `core/identity Module Contract` (e.g. with `Stage 1 Identity` and `REQUIRED_SECTIONS`) actually correct?**
  _`core/identity Module Contract` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AppType`, `BuildOptions`, `Logger` to the rest of the system?**
  _317 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tokens And ESLint Gate` be split into smaller, more focused modules?**
  _Cohesion score 0.04995374653098982 - nodes in this community are weakly interconnected._