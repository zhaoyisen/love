# Media admin implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans; implement inline. User explicitly approved the design and requested implementation.

**Goal:** Real account-scoped media inspection, durable batch cover repair and reversible record hiding in the approved web UI.

**Architecture:** Same-origin static admin UI backed by session-protected `/internal/admin` endpoints. JPA stores hidden flags, media checks and per-asset task results; scheduled transactional worker reuses ObjectStorage.

**Tech Stack:** Java 21, Spring Boot 3.5.3, existing JPA/Flyway/COS SDK, vanilla browser JS/CSS.

**Spec:** `docs/superpowers/specs/2026-10-20-media-admin-design.md`

## Global constraints

- Existing visibility and media originals preserved. Hidden records blocked for both users across all read paths.
- Reuse internal token hash; credentials never in browser persistent storage, logs or URLs. Session, CSRF and scope checks enforced server-side.
- No dependencies, production writes, deployment or commits in this task. Work in the existing clean `develop` checkout per the user's request; `.git` is read-only.
- New files: `server/.../admin/*`, `server/.../resources/static/admin/*`, `db/migration/V22__media_admin.sql`, integration/UI tests and admin usage documentation.
- Modified files: MomentEntity/Repository/Service, MediaService, RecapService, AppMessageRepository, SyncController, AuthFilter, RateLimitFilter, ObjectStorage implementations and deployment env examples/compose documentation. No deletion.

## Review focus

- 403/network errors must not be recorded as missing objects.
- Account-switched/out-of-order browser responses must not select or mutate the prior account.
- Hidden items must not leak through direct media/detail, paginated history, recap or messages.
- A stale/delete/concurrent task must never resurrect or bypass media safety status.
- Failed or restarted tasks retain results; unchanged/good covers never churn.

## Task 1: Protected API and reversible hiding

Interfaces: admin session, accounts, records, details, versioned batch visibility.
- [x] Write/run failing MockMvc tests for authentication, account scope, hidden reads, restoration and optimistic conflict.
- [x] Add session guard, migration, controller/service and hidden filters to all existing read paths.
- [x] Run integration tests and fix regressions.

## Task 2: Inspection and durable batch repair

Interfaces: `POST /internal/admin/tasks`, `GET /tasks`, `GET /tasks/{id}`, worker `processItem(UUID)`.
- [x] Write/run failing tests for missing vs failure, healthy skip, deleted/safety skip, original missing, retries and persisted task scope.
- [x] Add check/task entities, repositories, worker and ObjectStorage versioned regeneration; audit actions.
- [x] Verify real SDK requests with mocked external COS transport and existing backend suite.

## Task 3: Approved UI and operational handoff

Interfaces: static `/admin/` consuming only Task 1/2 real endpoints, no mock fallback.
- [x] Write/run browser tests for login, account filter, selection, preview, async tasks, hidden restoration and errors.
- [x] Build responsive approved layout and documented runtime configuration.
- [x] Run browser at 320/375/414/768 and desktop, backend/frontend suites, typecheck/validate, diff check and independent review.

## Execution ledger

- Initial inspection: clean develop; no admin UI exists. COS `stat` currently collapses all failures to UPLOAD_NOT_FOUND; must distinguish actual object 404 from provider/permission failure.
- Ruling: implement in-place without Git mutations, user has already requested execution. Shared task history uses database records, no Redis/new queue dependency.
- Task 1 RED: 3 integration tests failed on absent endpoints; GREEN: login/CSRF/scope/visibility and the first task tests passed.
- Task 2 RED: missing task endpoints and original COS permission classification failed; GREEN: 16 targeted tests including live HTTP browser passed before final review.
- Task 3 RED: browser login could not reveal app without admin.js. GREEN: real HTTP browser login/search/detail/hide/restore/check/rebuild/tasks/logout and six viewport widths passed.
- Independent review found actual SDK HEAD 404 code mismatch and untracked superseded/partial derivatives. Regression tests reproduced both. Fix: bounded GET confirmation; persist deterministic planned version paths before provider I/O, include them in media object history, and serialize cleanup with generation using asset row locks.
- Final verification: frontend 130/130; backend 74/74, no skipped tests with ADMIN_BROWSER_TESTS=1; typecheck and project/responsive/production-readiness validation passed. Browser executed real HTTP APIs at 320/375/414/768/1280/1536 px. Follow-up independent review found no remaining Important/Critical issue.
- Packaging: initial offline package lacked maven-jar-plugin; sandbox denied dependency download. Reviewed network escalation downloaded only Maven build artifacts into workspace .m2; `mvn -DskipTests package` then passed. No repository settings or credentials changed.
- No production MySQL/COS calls, migrations, publishing or Git mutations performed. Retained derivative versions intentionally remain until the source deletion lifecycle removes them.
