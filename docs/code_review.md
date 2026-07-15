# Code Review Report

Date: 2026-07-13

Scope: full repository — `backend/`, `frontend/`, deployment files (`Dockerfile`, `railway.toml`, `vercel.json`), `scripts/`, root docs, and the `cursor_kanban/` tree. This supersedes the 2026-07-08 review below in history; that review's findings were re-verified during this pass (see "Previously Reported Issues" section).

## Validation Summary

- Backend tests: `backend\.venv\Scripts\pytest.exe` — **67 passed**.
- Frontend unit tests: `npm run test:unit` — **59 passed** (4 files).
- Docker/container smoke test was not run in this pass (no Docker access in this environment); Dockerfile was reviewed statically only.

## Top-Priority Finding

### 1. Critical: Core agent/dev docs describe a different, outdated product

Evidence:

- Root [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md) describe a generic "Project Management MVP" Kanban app: single hardcoded login (`user`/`password`), one board per user, fixed renameable columns, no travel domain concepts.
- [backend/AGENTS.md](../backend/AGENTS.md) and [frontend/AGENTS.md](../frontend/AGENTS.md) say "Does not implement board persistence or AI chat yet" and describe "five columns" and hardcoded MVP credentials `user`/`password`.
- The actual, working application is a **family vacation planner**: 8 named/bcrypt-hashed users sharing one trip board ([backend/app/db.py](../backend/app/db.py) `SEED_USERS`), dynamic day-of-trip columns, an Ideas Inbox, quick-add with AI URL enrichment, trip readiness/budget concepts, and a fully wired AI chat with proposed-changes review. This matches [README.md](../README.md), [docs/PLAN.md](../docs/PLAN.md), [docs/PRODUCT_ROADMAP.md](../docs/PRODUCT_ROADMAP.md), and [docs/todos.md](../docs/todos.md), which are all accurate and current.

Why this matters:

- `AGENTS.md` and `CLAUDE.md` are the first files an AI coding agent (Copilot, Claude Code) reads for project context. Right now they actively mislead an agent into thinking there's a single hardcoded user, no persistence, no AI chat, and a generic Kanban product — the opposite of what exists. This risks wasted work, wrong assumptions, and regressions from agents "fixing" things that already work differently than documented.
- A new human contributor reading `AGENTS.md`/`CLAUDE.md` first would be equally misled; `README.md` and `docs/` tell the true story but are not the first thing referenced by tooling that specifically looks for `AGENTS.md`/`CLAUDE.md`.

Recommended action:

- Rewrite root `AGENTS.md` and `CLAUDE.md` (and `backend/AGENTS.md`, `frontend/AGENTS.md`) to match the current vacation-planner product, or have them point to `README.md` / `docs/PLAN.md` as the source of truth and keep only durable, rarely-changing facts (stack, commands, test entrypoints) in the agent files.
- Add a lightweight process rule (e.g., a line in `AGENTS.md` itself) that product-shape changes must update `AGENTS.md`/`CLAUDE.md` in the same change, since these two drifted silently over multiple pivots.

## Findings

### 2. Medium: Rate limiting can be bypassed via a spoofed `X-Forwarded-For` header

Evidence:

- `get_client_identifier` in [backend/app/api.py](../backend/app/api.py) trusts the first value of the client-supplied `X-Forwarded-For` header with no check that the request actually came through a trusted proxy.
- Login and AI rate limiting (`enforce_rate_limit`) key on this identifier for unauthenticated requests (login) and fall back to it for AI routes.

Why this matters:

- Anyone can set an arbitrary `X-Forwarded-For` value per request to get a fresh rate-limit bucket every time, defeating the login brute-force and AI-abuse protections entirely when the app is reachable directly (not exclusively behind a proxy that strips/overwrites this header).
- Railway/Vercel deployments typically do set trustworthy forwarding headers at the edge, but the backend has no explicit trust boundary — it will honor the header identically whether it came from the platform's edge or straight from the client.

Recommended action:

- Only trust `X-Forwarded-For`/`X-Real-IP` when the app is configured to sit behind a known proxy (e.g., gate on an env flag such as `PM_TRUST_PROXY_HEADERS`), otherwise use `request.client.host`.
- If Railway is the only deployment target, confirm what it guarantees about stripping client-supplied forwarding headers, and document that assumption next to `get_client_identifier`.

### 3. Low/Medium: Login has a username-enumeration timing side-channel

Evidence:

- In `login()` ([backend/app/api.py](../backend/app/api.py)), `bcrypt.checkpw` (deliberately slow) is only invoked when `user_row` exists and has a `hashed_password`. For a nonexistent username, the function returns immediately without hashing.

Why this matters:

- Response times differ measurably between "unknown username" and "known username, wrong password," letting an attacker enumerate the 8 seeded family usernames. Low real-world impact given usernames are first names already visible in the README, but worth closing since bcrypt cost makes the gap large.

Recommended action:

- Always run a dummy `bcrypt.checkpw` against a fixed hash when the user is not found, so both branches take comparable time.

### 4. Low: In-process rate-limit store grows without bound

Evidence:

- `app.state.rate_limit_store` in [backend/app/main.py](../backend/app/main.py) is a plain `dict` populated by `enforce_rate_limit` in [backend/app/api.py](../backend/app/api.py). Old timestamps inside a bucket are filtered on read, but bucket keys (one per client identifier/username) are never removed from the dict.

Why this matters:

- In a long-running production process (Railway keeps the container alive), the number of distinct `bucket:key` entries grows forever as new IPs/usernames show up, which is a slow memory leak. Low severity given the MVP's small expected user base (8 family members), but worth a note before wider traffic.

Recommended action:

- Periodically prune empty/stale buckets (e.g., lazily delete a key when its filtered list is empty), or switch to a small TTL cache.

### 5. Low: Dead/misleading settings fields for auth

Evidence:

- `AppSettings.auth_username` / `auth_password` and `PM_AUTH_USERNAME` / `PM_AUTH_PASSWORD` env vars in [backend/app/settings.py](../backend/app/settings.py) are loaded and tested, but `login()` in [backend/app/api.py](../backend/app/api.py) never reads them — it authenticates purely against the `users` table via `get_user_for_auth` + `bcrypt.checkpw`.

Why this matters:

- These settings are vestiges of the original single-user MVP model and no longer affect behavior. They're actively misleading (also still described as "the" auth mechanism in `CLAUDE.md`), and someone could reasonably set `PM_AUTH_PASSWORD` in production expecting it to change a login credential when it does nothing.

Recommended action:

- Remove `auth_username`/`auth_password` from `AppSettings` and the corresponding env vars/tests, or repurpose them if a single-admin fallback login is actually wanted.

### 6. Low: Repository hygiene — stale duplicate tree and stray root file

Evidence:

- `cursor_kanban/` is a full duplicate snapshot of `backend/`, `frontend/`, `docs/`, and `scripts/` (confirmed archived/documented in [README.md](../README.md), which is good), but it still doubles the size of any repo-wide search/grep and can go stale silently (it already contains the same doc-drift `AGENTS.md`/`CLAUDE.md` issue as the active tree).
- A stray root-level [package-lock.json](../package-lock.json) exists with `"name": "cursor_kanban"` and no packages — leftover from the duplicate tree, with no corresponding root `package.json`.

Recommended action:

- If `cursor_kanban/` no longer needs to be referenced, remove it (git history preserves it) rather than keeping it long-term; archives that "should not receive fixes" tend to be copy-pasted from by accident anyway.
- Delete the stray root `package-lock.json`.

### 7. Low: Ambiguous/overlapping deployment configuration

Evidence:

- [railway.toml](../railway.toml) configures a Dockerfile-based deploy of the whole app (frontend baked into the image, served by FastAPI) on Railway.
- [vercel.json](../vercel.json) independently declares `experimentalServices` for both a `frontend` service and a `backend` service (`entrypoint: app/main.py`) under the same Vercel project.
- [README.md](../README.md) states the target is "Vercel frontend + Railway backend," a third combination different from what either config file fully describes on its own.

Why this matters:

- Three different deployment stories exist (all-in-one Docker on Railway; split Vercel frontend + Vercel-hosted backend service; Vercel frontend + Railway backend). It's not obvious from the repo alone which is actually live, which risks someone editing the wrong config or missing an environment variable during a real deploy.

Recommended action:

- Pick one deployment topology, delete the unused config, and state the chosen one explicitly in `README.md` with the actual URLs/services involved.

### 8. Low: Residual DNS-rebinding window in quick-add URL fetch

Evidence:

- `_validate_public_http_url` in [backend/app/api.py](../backend/app/api.py) resolves and validates the hostname's IP before each request/redirect hop, which already blocks the common SSRF cases (private/loopback/link-local/metadata IPs) called out in the previous review.
- Between that validation and the actual `httpx` request, a second DNS lookup happens inside `httpx`/the OS resolver — an attacker controlling DNS for the target domain could serve a public IP for the check and a private IP for the real connection (classic TOCTOU/DNS-rebinding).

Why this matters:

- This is a narrow, low-likelihood residual gap given the existing mitigations are already strong (no-redirect-follow-blindly, per-hop revalidation, private-IP blocking). Worth tracking, not urgent.

Recommended action:

- If this needs closing, resolve the hostname once, connect directly to the validated IP (with the `Host` header set appropriately) instead of letting `httpx` re-resolve, or pin resolution via a custom transport.

### 9. Info: Local secrets and DB files are correctly excluded from git

Evidence:

- `.env` (containing a live `OPENROUTER_API_KEY`) and `backend/data/*.db*` are **not tracked by git** (confirmed via `git ls-files`), and `.gitignore`/`.dockerignore` correctly exclude them from both version control and the Docker build context.

No action needed beyond routine hygiene: rotate the key in `.env` if it is ever shared outside this machine (e.g., pasted into a chat/log), since its value has been visible in this session's tool output.

## Previously Reported Issues (2026-07-08 review) — Re-verified

All five issues from the prior review are fixed and re-confirmed working in this pass:

1. **Shared trip ownership bug** — `get_shared_trip_owner_row` in [backend/app/db.py](../backend/app/db.py) is now used consistently by both trip reads and writes (and by board/chat-history lookups), so every family member reads/writes the same shared trip and board.
2. **Shared board last-write-wins** — `update_board_for_username` now requires `expectedBoardVersion` and raises `BoardVersionConflictError` → HTTP 409 on a stale write; [frontend/src/components/AppShell.tsx](../frontend/src/components/AppShell.tsx) sends the version it last loaded.
3. **Quick-add SSRF** — `_validate_public_http_url`, `_is_safe_redirect_target`, and disabled auto-redirects in `_fetch_og_metadata` ([backend/app/api.py](../backend/app/api.py)) now block private/loopback/link-local/metadata targets and re-validate every redirect hop (see finding 8 above for the one remaining narrow gap).
4. **Docker not shipping the frontend** — [Dockerfile](../Dockerfile) is now a two-stage build: `node:20-bookworm-slim` builds the Next.js static export, and the result is copied into the final Python image at `/app/frontend/out`, which `backend/app/main.py` mounts.
5. **Red frontend unit suite** — `npm run test:unit` passes 59/59 tests across 4 files as of this review.

## Priority Actions

1. Rewrite/realign `AGENTS.md`, `CLAUDE.md`, `backend/AGENTS.md`, and `frontend/AGENTS.md` with the actual current product (finding 1) — this is the highest-leverage fix since it affects every future AI-assisted change.
2. Gate trust of `X-Forwarded-For` behind a known-proxy assumption or drop it (finding 2).
3. Equalize login timing for unknown vs. known usernames (finding 3).
4. Remove dead `auth_username`/`auth_password` settings (finding 5) and the stray root `package-lock.json` (finding 6).
5. Decide on and document a single deployment topology (finding 7).
