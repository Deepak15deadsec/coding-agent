# Architecture

## Components

| Piece | Where | Role |
|---|---|---|
| Browser UI | `public/index.html` | A single-page app. Talks only to this server's `/api/*` |
| Agent Runner server | `server.mjs` | Auth, API, file storage. Calls Anthropic and GitHub on your behalf |
| Claude Code routine | claude.ai (Anthropic cloud) | Saved task. Each fire creates a cloud session that clones the repo, edits, tests, pushes, and opens a PR |
| GitHub | github.com | Holds the repo, PRs, and check runs. Your CI (including self-hosted GPU runners) reports checks here |

The browser never talks to Anthropic or GitHub directly. That keeps every token on the server.

## Request flow: "Run with Claude"

1. The UI sends `POST /api/run {prompt, projectId}`.
2. The server checks the prompt (not empty, ≤ 65,536 chars) and finds the project.
3. The server sends `POST {fireUrl}` with `Authorization: Bearer <routine token>` and the body `{"text": prompt}`.
4. Anthropic returns `claude_code_session_id` and `claude_code_session_url` once the session is
   created. It doesn't wait for the work to finish.
5. The server prepends the run to `data/runs.json` (keeping at most 200). A failed fire is also saved, with `error`.
6. The UI shows a message with the session link and re-renders the run list.

## Status flow: PRs and checks

- `GET /api/runs` loads the last 100 runs, then for each distinct repo fetches the
  **30 most recently updated PRs (state=all)** from GitHub and caches them for 20 seconds per repo.
- A run is matched to a PR when the PR body contains the run's `sessionId`.
- For **open** PRs, check runs on the head commit are combined into one state:
  - any check not completed → `pending`
  - any `failure`, `timed_out`, `cancelled`, or `action_required` → `failure`
  - otherwise `success`; no checks at all → `none`
- PR state is `merged` (if `merged_at` is set), otherwise `open` or `closed`.
- `GET /api/prs` returns the open PRs across all project repos, newest first.
- The UI polls every 30 seconds while visible, and refreshes when the tab or app comes back into focus.

## Data files

`DATA_DIR` (default `./data`) holds two files, both written atomically with mode `0600`:

**`config.json`** (contains secrets)
```json
{
  "githubToken": "github_pat_…",
  "projects": [
    { "id": "uuid", "name": "VariPhi", "fireUrl": "https://api.anthropic.com/v1/claude_code/routines/trig_…/fire",
      "token": "sk-ant-oat01-…", "repo": "owner/repo" }
  ]
}
```
On first start, if the file doesn't exist, it is created from `ROUTINE_FIRE_URL`, `ROUTINE_TOKEN`,
`GITHUB_REPO`, and `GITHUB_TOKEN` when those are set.

**`runs.json`**
```json
[{ "id": "uuid", "projectId": "uuid", "project": "VariPhi", "repo": "owner/repo",
   "prompt": "Fix …", "createdAt": "ISO", "sessionId": "session_…",
   "sessionUrl": "https://claude.ai/code/session_…", "error": "only when the fire failed" }]
```

## HTTP API

Every route requires HTTP Basic auth (any username, password = `DASHBOARD_PASSWORD`). Requests that
change data must send `Content-Type: application/json`, or they get a 415.

| Route | Body | Response |
|---|---|---|
| `GET /api/config` | – | `{demo, github:{set,hint}, projects:[{id,name,fireUrl,repo,tokenSet,tokenHint}]}` |
| `PUT /api/config/github` | `{token}` | public config |
| `POST /api/github/test` | `{}` | `{results:[{repo, ok, error?}]}` or 400 |
| `POST /api/projects` | `{name, fireUrl, token, repo}` | public config, or 400 `{error}` |
| `PUT /api/projects/:id` | same (`token` blank = keep) | public config |
| `DELETE /api/projects/:id` | – | public config |
| `POST /api/run` | `{prompt, projectId}` | the run object, or 4xx/5xx `{error}` |
| `GET /api/runs` | – | `{runs:[run + pr:{number,url,draft,state,checks}]}` |
| `DELETE /api/runs/:id` | – | `{ok:true}` |
| `GET /api/prs` | – | `{prs:[…], configured, errors:[]}` |

Validation (skipped in demo mode): the Fire URL must match
`^https://api.anthropic.com/v1/claude_code/routines/trig_[A-Za-z0-9]+/fire$`, the token must start with
`sk-ant-oat01-`, and the repo must be `owner/name`.

## Error mapping (fire)

| Anthropic status | Shown to the user |
|---|---|
| 401 | "Routine token rejected. Regenerate it … and update it in Settings." |
| 429 | "Rate limited. Retry after Ns." (from `Retry-After`) |
| other | Anthropic's `error.message`, or "Routine fire failed (HTTP n)" |

## Why these choices

- **No dependencies, no build step:** easy to audit (it handles tokens), easy to run anywhere,
  and nothing in the supply chain to keep patched.
- **Server-side proxy:** routine tokens can start sessions that spend your subscription. They must
  never reach a browser.
- **JSON files instead of a database:** it's a single-user tool with small amounts of data. The trade-off is that
  simultaneous writes from two tabs could race (see the roadmap).
- **Polling GitHub instead of webhooks:** works behind NAT or a tunnel without a public webhook endpoint.
