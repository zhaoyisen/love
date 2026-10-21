# Server-owned production configuration implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep one server-owned `.env`, preserve server Compose edits during Jenkins releases, and document migration.

**Architecture:** `/opt/love-notes/compose.yml` reads `/opt/love-notes/.env` through Compose `env_file`. Repository application YAML remains a placeholder template. Jenkins validates and deploys an immutable Git-tagged image using those existing files, then updates the local `production` image alias only after health succeeds.

**Tech Stack:** POSIX shell, Docker Compose v2.20+, Jenkins, Spring Boot 3.5, Node built-in tests, JUnit.

**Spec:** User-approved chat design: one server `.env`, no mounted application YAML, Jenkins must not overwrite configuration, update deployment instructions.

## Global constraints

- Preserve the existing uncommitted media-admin work in this develop checkout; do not stash, commit, push, or deploy.
- No production secrets in templates, logs, tests, or Git. Do not read `server/.env`.
- Keep project name `love-notes`, service `api`, existing health endpoint and security settings.
- Production deployment fails if server files are missing; no automatic copy or fallback to old Jenkins credentials.
- `.env` owns configuration values; Compose owns container structure. No `release.env` or external application YAML.

## Review focus

- A missing/unreadable server file must stop before container replacement.
- Failed validation/health must not update the successful `production` alias.
- Releases leave `.env` and `compose.yml` byte-for-byte unchanged.
- New application environment variables reach containers without adding Compose mappings.
- Dockerized Jenkins must see the server configuration directory, and manual configuration apply must retain the deployed image.

### Task 1: Environment mapping and server-owned deployment

**Files:** `docker-compose.yml`, `server/.env.example`, application YAML templates, `Jenkinsfile`, `scripts/deploy-production.sh`, `scripts/test-deployment.cjs`, `scripts/validate-production-readiness.js`, configuration/session tests. Remove the hardcoded admin-session timeout so the container's YAML-configured timeout is effective; make the static login hint independent of that value.

- [x] Add failing shell integration checks: preserved config, correct fixed-directory commands, missing files, invalid tag, failed validation/health, success-only alias.
- [x] Add configuration binding checks for non-default values and missing required secrets.
- [x] Replace explicit environment list with required `env_file`; externalize operational tunables and add examples; keep structural defaults.
- [x] Switch Jenkins deployment to server files and quiet validation; remove Secret-file dependency; run deployment tests in CI.
- [x] Run shell/configuration checks and relevant existing validation/backend suite.

### Task 2: Migration and operator documentation

**Files:** Jenkins deployment guide, production handbook, beginner guide, root/server README, admin guide.

- [x] Document first-time setup without overwriting existing config; migration from existing Jenkins secret, backup/permissions, Dockerized Jenkins read-only bind mount, existing project/network continuity.
- [x] Document release, manual apply using production alias and force-recreate, logs/status, immutable rollback, no database downgrade, no rollback past hidden filtering.
- [x] Remove conflicting Secret-file instructions and old workspace-relative production commands.
- [x] Review diff and record verification/remaining server-only checks below.

## Execution record

- Working inline in the existing dirty develop checkout to retain the feature this deployment must ship. Git metadata is read-only; no worktree/commit operation is needed for this bounded configuration change.
- Task 1 RED: deployment script did not exist and Compose lacked env_file; configuration test showed 30-minute access TTL instead of requested 45 minutes and the production cursor secret still had a dev fallback. GREEN: shell checks 9/9, first backend suite 75 passed/1 opt-in browser skipped, validation/typecheck passed.
- Final review by independent agent: two Important findings (dotenv parser errors can echo secrets; sudo operator cannot traverse the root-owned directory). Fixed parser diagnostics with generic failure preserving exit codes; regression failures reproduced for config and health paths, then 9/9 passed. Operator documentation now uses absolute paths and needs no directory traversal by the sudo operator.
- Additional binding audit: admin login manually reset the session timeout to 1200 seconds, defeating the new environment setting. Regression reproduced 1200 vs configured 2400; removed that reset and left the servlet container to apply the bound setting. Login copy no longer claims a fixed duration.
- Real Docker Compose 2.20.3 executable verified against its official SHA256. Offline config parsing passed for new arbitrary variables, edited values, custom ports/memory and single-quoted special-character fixture passwords. Config output doubles dollar signs for reusability; test accounts for that documented source behavior. Real malformed-dotenv diagnostics also suppressed by the actual deployment script. No daemon/container/production access used.
- Final frontend suite: 139/139; project validation (22 pages/29 JSON), typecheck and shell syntax passed. Final `mvn verify`: 77 total, 76 passed, 1 opt-in HTTP-browser test skipped; JAR packaging passed. Session regression is GREEN and non-default session binding is covered.
- Remaining boundary: no production deployment, live Jenkins execution, server-directory migration/permission changes, or real Docker container recreation were performed. Those remain operator steps in the deployment guide. A failing deployment after replacement does not automatically roll the container back; manual recovery is documented.
- 2026-10-21 guided migration: user confirmed server directory exists, API healthy, Jenkins config `/opt/jenkins/compose.yaml`, Jenkins uid/gid 1000 with supplemental group 111, ops GID 988, Python 3.12.3. Added one-time `migrate-production-env.py` so operator can privately copy live API values into the still-unmodified template; dry-run default, explicit apply, fail closed if live required values are missing or target already edited. Atomic replacement keeps original on failure. Seven stdlib tests passed (initial five RED missing helper then GREEN; review Redis/log-default regressions RED then GREEN). Real Compose 2.20.3 parser retained exact synthetic password bytes including both quotes, dollars/braces, backslashes, newline/tab and Unicode, plus live port/resources. Independent reviewer checked helper/tests: absent optional Redis credentials now stay blank; unspecified logging limits or prod profile stop rather than guessing. Existing deployment checks 9/9 and diff check passed. No live inspection or migration executed by the agent.
