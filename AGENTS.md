# Project Agent Instructions

This repository contains PowerAppWeb, the mobile-first responsive web client (installable PWA) of BmApp, for Brokers on iOS and Android smartphones. UI in Spanish.

## Read First

- `README.md` — setup on a new machine, commands, repo map.

- `CONTEXT.md` — domain language.
- `docs/build-brief.md` — product goals and MVP.
- `docs/domain-model.md` — core entities, relationships, and states.
- `docs/risks-and-open-questions.md` — current risks and unresolved questions.

Read optional docs only when relevant:

- `docs/technical-discovery.md` — stack, integrations, auth, deployment.
- `DESIGN.md` — any UI work.
- Sibling repos (read-only reference): `../BmApp` (Android behavior/calculations, source of parity), `../BmBackend` (API), `../BmWeb` (Next.js + Firebase pattern).

## Startup Workflow

Before writing code:

1. Confirm the working directory with `pwd`.
2. Read `PROGRESS.md` for current verified state and next step.
3. Read `feature_list.json` and pick the first unfinished feature in list order whose `depends_on` features are all `accepted`.
4. Run `./init.sh`.
5. If baseline verification fails, fix the baseline before adding new feature work.

## Working Rules

- Work on one feature at a time.
- Do not mark a feature complete just because code was added.
- Keep changes inside the selected feature scope unless a blocker requires a narrow supporting fix.
- Do not silently change verification rules during implementation.
- Behavior and numbers must match BmApp; when in doubt, read the Android source.
- Develop against BmBackend QA. Backend changes go to the BmBackend `qa` branch only; never deploy to PROD.
- Local QA stack (backend on `http://localhost:9081`): always use the `../BmInfra/bm-local-qa` launcher, never raw `docker compose` (project name is `bminfra`).
  - No BmBackend changes: just check `../BmInfra/bm-local-qa ready`. Do not rebuild.
  - BmBackend code changed: `../BmInfra/bm-local-qa rebuild-backend` (rebuilds only `backend-qa`, ends with a readiness check). Run it with a 10-minute shell timeout and do not pipe it through `tail`/`head`.
  - Stack not running: `../BmInfra/bm-local-qa up` (10-minute timeout).
- E2E (Playwright) always goes through `npm run test:e2e` / `npm run test:e2e:quick` (`scripts/e2e.sh`), never raw `npx playwright test`. The script holds a machine-wide lock, reads credentials from the keychain, auto-reuses `.next-e2e` when `src/` and config are unchanged, and serves its own production server on port 9004, stopping any leftover server there before and after:
  - Only one E2E run at a time. If it exits with "another E2E run is active", wait for it to finish; do not kill it and do not start a second one.
  - While implementing: run only the spec(s) you touch on one browser: `npm run test:e2e:quick -- e2e/<spec>.spec.ts`.
  - Android only during development: `npm run test:e2e` and `test:e2e:quick` run only `android-chromium`. Do not run `iphone-webkit` (`npm run test:e2e:all`) unless the user asks; iOS is checked by the user after the development phase.
  - At the end of implementation: run the full Android suite once (`npm run test:e2e`) and record the exact result in `feature_list.json` and `PROGRESS.md`.
  - During `feature-validator`: run inline in the current session (never spawn a subagent). If `feature_list.json` / `PROGRESS.md` already records a passing full `npm run test:e2e` for the current commit/diff, rerun only the feature's focused E2E spec (`npm run test:e2e -- e2e/<spec>.spec.ts`) rather than the entire suite again.
  - Run with a 15-minute shell timeout and NEVER pipe `init.sh`, `test:e2e`, or builds through `grep`, `sed`, `tail`, `head`, or `>/dev/null` (piping buffers output and hides live progress for minutes).
  - Never start `npm run dev` from an agent shell (it outlives the shell and gets orphaned). Port 9003 is the user's manual dev/phone server.
- Fast shell & search rules (corporate Endpoint Security scans every file read/write):
  - Never run `grep -r` or `find .` in bash to search the repo — always use the built-in `grep` / `glob` tools so `node_modules/`, `.next/`, and `.next-e2e/` are skipped.
  - Always pass `--max-time 5` to `curl` commands so a slow or stopped local server cannot hang a shell tool call until the 2-minute timeout.
- Never commit secrets (Firebase service accounts, keystores, tokens).
- Update durable repo artifacts instead of relying on chat summaries.
- Git: `main` on https://github.com/VictorGeoSoftware/PowerAppWeb. Commit only when asked; never commit `.env.local`, credentials or service accounts.

## Required Artifacts

- `feature_list.json`: source of truth for feature state.
- `PROGRESS.md`: current verified state and lightweight session log.
- `init.sh`: standard startup and verification path.

## Definition Of Done

A feature is done only when all are true:

- target behavior is implemented,
- required verification actually ran (including a mobile viewport check for UI, and `npm run test:e2e` for UI/auth/routing features — set `E2E_EMAIL`/`E2E_PASSWORD` in the shell for the signed-in paths; never commit them),
- evidence is recorded in `feature_list.json` or `PROGRESS.md`,
- repository remains restartable from the standard startup path,
- relevant docs are updated if product behavior, domain rules, API, or verification changed.

## End Of Session

1. Update `PROGRESS.md`.
2. Update `feature_list.json`.
3. Record unresolved risks or blockers.
4. Leave the repo clean enough for the next session to run `./init.sh` immediately.
