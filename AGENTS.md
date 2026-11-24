# AGENTS.md

Guide for anyone (human or AI coding agent) changing this repo. Read this before editing.
For what the product does and how to use it, see [README.md](README.md).

## What this is

A self-hosted web dashboard that fires **Claude Code routines** through their API trigger and tracks
the resulting session, GitHub PR, and CI checks. It has two pieces:

- `server.mjs`: a dependency-free Node HTTP server. It handles auth, the JSON API, routine fires,
  GitHub reads, and file storage.
- `public/index.html`: the whole frontend. One file: HTML, CSS, and vanilla JS with no build step.

## Repo map

```
server.mjs            HTTP server + API (≈290 lines)
public/index.html     UI: markup, styles, script (≈850 lines)
public/vendor/        Vendored browser libs, served at /vendor/*.js (MIT licenses alongside)
  motion-11.18.2.js   Motion (motion.dev), the vanilla-JS version of Framer Motion, used for animations
.env.example          Example env file (only DASHBOARD_PASSWORD is required)
data/                 Runtime state, git-ignored, created on first start
  config.json         Projects + tokens (mode 600). SECRET.
  runs.json           Run history, newest first, capped at 200
docs/                 Setup, architecture, security, troubleshooting, roadmap
AGENTS.md             This file
CLAUDE.md             Points here
```

## Run it

```bash
DEMO=1 DASHBOARD_PASSWORD=demo node server.mjs          # fake fires, safe to click around
DASHBOARD_PASSWORD=... node server.mjs                   # real mode
DATA_DIR=/tmp/ar-test DASHBOARD_PASSWORD=pw PORT=8798 node server.mjs   # isolated test instance
```

Node 18 or newer (it uses global `fetch`). Don't add an `npm install` step: there is no `package.json` on purpose.

## Hard rules (security invariants)

Do not break these. Each one exists for a specific reason.

1. **Tokens never go to the browser.** `publicConfig()` is the only config the client gets. It
   exposes `tokenSet` and `tokenHint` (the last 4 characters) only. Any new secret field must follow the same pattern.
2. **Fire URLs are allow-listed.** `FIRE_URL_RE` only accepts
   `https://api.anthropic.com/v1/claude_code/routines/trig_…/fire`. This stops someone who has the
   dashboard password from pointing a stored token at their own server to steal it. Demo mode
   skips the check on purpose.
3. **Requests that change data must be `application/json`.** This blocks cross-site form posts that would
   ride on the browser's cached Basic-auth credentials (CSRF). Keep the check in `handle()`.
4. **Every request needs auth**, including static files. `authed()` uses a constant-time compare.
5. **Escape everything you render.** The frontend builds HTML with template strings. Pass all
   user, GitHub, and server data through `esc()`. Run prompts and PR titles are untrusted.
6. **Secrets files are mode 600.** `writeJson()` writes atomically (tmp file + rename) with `0o600`.
7. **Never log tokens.** Error messages from fires and GitHub must not echo request headers.

## Server API (all behind Basic auth)

| Method & path | Purpose |
|---|---|
| `GET /` | The UI |
| `GET /manifest.webmanifest`, `GET /icon.svg` | PWA |
| `GET /vendor/<name>.js` | Vendored JS from `public/vendor` (filename allow-list `[\w.-]+\.js`, no paths) |
| `GET /api/config` | Public config (projects without tokens, GitHub token set/hint, demo flag) |
| `PUT /api/config/github` `{token}` | Set or clear the GitHub token (empty string clears it) |
| `POST /api/github/test` | Check the GitHub token and access to each project's repo |
| `POST /api/projects` `{name, fireUrl, token, repo}` | Add a project |
| `PUT /api/projects/:id` | Edit a project. A blank `token` keeps the existing one |
| `DELETE /api/projects/:id` | Delete a project and its token |
| `POST /api/run` `{prompt, projectId}` | Fire the routine and save the run (failures are saved too, with `error`) |
| `GET /api/runs` | Last 100 runs, each with a matched `pr` (`state`, `checks`) |
| `DELETE /api/runs/:id` | Remove a run from history (does not touch Claude or GitHub) |
| `GET /api/prs` | Open PRs across all project repos, with check state |

Full request and response notes: [docs/architecture.md](docs/architecture.md).

## Routine fire contract (research preview)

```
POST {fireUrl}
Authorization: Bearer sk-ant-oat01-…
anthropic-version: 2026-10-21
anthropic-beta: experimental-cc-routine-2026-04-01
Content-Type: application/json
{"text": "<job, ≤ 65,536 chars>"}
→ 200 {"type":"routine_fire","claude_code_session_id":"session_…","claude_code_session_url":"https://claude.ai/code/session_…"}
```

Errors: 400 (bad version / text too long / routine paused), 401 (bad token), 403, 404, 429
(`Retry-After`), 500, 503. The `text` reaches Claude wrapped as **untrusted** input, so the routine's saved
prompt must explicitly opt in to acting on it (see [docs/routine-prompt.md](docs/routine-prompt.md)).
Sources: code.claude.com/docs/en/routines and platform.claude.com/docs/en/api/claude-code/routines-fire.

## Frontend conventions

- **Animation:** Motion (`window.Motion`, vendored, no CDN). Always go through the `anim()` helper.
  It does nothing when Motion failed to load or the user has `prefers-reduced-motion` set, so the
  app must work without it. List rows need a stable `data-key` so `enterRows()` animates only *new* rows
  (polling re-renders every 30 seconds and must not re-animate everything). Use `collapse()` before
  removing a row, `countTo()` for numbers, `progress(true|false)` around network work, and
  `setRunBtn(state)` for the run button.
- Plain DOM + template strings. `$()` = `getElementById`, `esc()` = HTML-escape, `api()` = fetch
  JSON (throws an Error carrying the server's `error`).
- The active view is driven by `body[data-tab]` (`runs` | `prs` | `settings`) through CSS, not the
  `hidden` attribute. Use `go(name)` to switch.
- Layout breakpoints: **≤600px** compact phone, **<960px** mobile layout with bottom tab bar,
  **≥960px** desktop (left sidebar, Runs page shows the PR column), **960–1359px** 2×2 stats.
- Colors are CSS custom properties on `:root`, redefined under `prefers-color-scheme: dark`. Don't
  hard-code colors. Fonts go through `var(--font)`. **Gotcha:** `font: 16px inherit` is
  *invalid* CSS and silently falls back to the browser default. Use `font: 16px var(--font)`.
- Icons are inline SVG `<symbol>`s at the top of `<body>`. Use them with `icon("name")`.
- `localStorage` is only for conveniences (last selected project). Wrap every access in try/catch.
- Keep tap targets at least 36–44px, and test at 390px wide.

## Testing and verifying changes

There's no automated test suite yet (see the roadmap). Before you finish a change:

1. `node --check server.mjs`
2. Syntax-check the page script:
   `node -e "const s=require('fs').readFileSync('public/index.html','utf8');new Function(s.slice(s.lastIndexOf('<script>')+8,s.lastIndexOf('</script>')))"`
3. Exercise the API against an isolated instance (`DATA_DIR=/tmp/...`), using `curl -u x:pw -H 'content-type: application/json'`.
   Check: invalid fire URL → 400, non-JSON POST → 415, the token never appears in any response.
4. Check the UI at **390×844** and **1440×900** in both color schemes. Headless Chromium with
   Playwright works well. Treat any page or console errors as failures.
5. If you changed the fire path, test against a local mock server that returns the documented response.

## Gotchas

- `pkill -f "node server.mjs"` also kills the shell running it, because the pattern matches its own
  command line. Kill by PID instead.
- A running server keeps the old code. Restart it after editing `server.mjs` (the HTML is read
  fresh on every request).
- `data/` holds real secrets. Never commit it, paste it, or print `config.json`.
- Run matching to a PR currently needs the **session id to appear in the PR body**. If Claude leaves it out,
  the run shows "Waiting for PR" even though the PR appears in the Open PRs list. See the roadmap.

## Making changes

- Keep zero dependencies unless there's a strong reason. If you add one, add a `package.json` and
  update the README quick start.
- New setting? Store it in `config.json` through the API, show it in Settings, and expose only
  non-secret fields in `publicConfig()`.
- New external call? Validate the target, set a timeout, and give errors messages a user can act on.
- Update **README.md** (features and config) and **docs/roadmap.md** (move items to Done) in the
  same change.
