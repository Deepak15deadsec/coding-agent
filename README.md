# Agent Runner

A small, self-hosted dashboard for **sending coding jobs to Claude from your phone or browser**.

You type a job ("Fix the playback freeze when seeking") and tap **Run with Claude**. The dashboard
fires a **Claude Code routine** (a saved cloud task on claude.ai) through its API trigger. Claude then
runs in Anthropic's cloud, works on your GitHub repo, and opens a draft PR. The dashboard shows the
Claude session link, the PR, and whether CI checks pass.

- Works on phone and desktop (responsive; installable to the home screen).
- Uses your **Claude subscription** (Pro/Max/…), not an API key.
- Your machine doesn't need to stay on for the work itself: Claude runs in the cloud. Only this
  small dashboard server needs to be reachable.
- No npm dependencies and no build step: one Node file, one HTML file, and one bundled JS file (Motion, MIT).

> Status: working prototype. Runs locally and was tested against a mock endpoint and Anthropic's
> real endpoint (auth path). It is **not deployed yet**, and **no real Claude task is connected yet**.
> See [docs/roadmap.md](docs/roadmap.md).

---

## How it works

```
 Phone / browser ──HTTPS──▶ Agent Runner (this repo, your server)
                                │  holds tokens, stores run history
                                │
                                ├──POST /fire──▶ Claude Code routine (claude.ai)
                                │                  └─ cloud session: clones repo, codes,
                                │                     runs tests, pushes branch, opens draft PR
                                │
                                └──GET (read-only)──▶ GitHub API: PRs + check runs
                                                       (your CI, e.g. GPU E2E runner, reports here)
```

More detail: [docs/architecture.md](docs/architecture.md).

---

## Quick start (demo mode, 1 minute)

Needs Node 18 or newer. There is nothing to install.

```bash
DEMO=1 DASHBOARD_PASSWORD=demo node server.mjs
# open http://localhost:8787  (any username, password "demo")
```

Demo mode fakes the Claude call, so you can click around safely. In demo mode,
projects accept any URL and token.

## Real setup (about 15 minutes)

Full step-by-step guide: **[docs/setup-guide.md](docs/setup-guide.md)**. Short version:

1. **claude.ai → connect GitHub.** At https://claude.ai/code, connect GitHub and install the **Claude
   GitHub App** on *only* the repos you want.
2. **Create a routine (saved task)** for the repo at https://claude.ai/code/routines. Use the prompt in
   [docs/routine-prompt.md](docs/routine-prompt.md).
3. **Add an API trigger.** In the routine, go to Edit → Trigger **+** → **API** → **Generate token**. Copy the
   **Fire URL** and **token**. The token is shown only once.
4. **Start the dashboard**:
   ```bash
   echo "DASHBOARD_PASSWORD=<something-long>" > .env
   node server.mjs
   ```
5. **In the dashboard → Settings**, add a project: name, Fire URL, token, and `owner/repo`.
   Optionally add a read-only GitHub token to see PR and check status.
6. **Expose it safely** if you want access from your phone outside your home network. Use a Cloudflare
   Tunnel, Tailscale, or an HTTPS reverse proxy. Never expose plain HTTP to the internet.

## Tokens and credentials

| What | Required | Where it comes from | Where it goes |
|---|---|---|---|
| Dashboard password | Yes | You choose it | `.env` → `DASHBOARD_PASSWORD` |
| Routine **Fire URL** and **token** (`sk-ant-oat01-…`) | Yes, one per project | claude.ai/code/routines → routine → API trigger | Dashboard → Settings → Add project |
| GitHub **fine-grained** token (`github_pat_…`), read-only | Optional | GitHub → Settings → Developer settings → Fine-grained tokens | Dashboard → Settings → GitHub |
| Claude GitHub App (not a token) | Yes, for Claude to push | Installed from claude.ai/code | Nothing to paste |

You do **not** need an Anthropic API key, your Claude password, or a GitHub *write* token.

## Features

- **Run box:** project picker, a text box that grows as you type, `Ctrl/⌘+Enter` to run, and an hourly
  usage counter (each routine allows 30 fires an hour).
- **Run history:** each run shows Session started → PR #n (draft/merged/closed) → checks
  passed/failed/running. Each run has buttons to open the session, run again, copy, or remove it.
- **Filter and search:** filter runs by project and search the job text.
- **Open PRs:** a separate tab on phones and a side column on desktop, with CI status for each PR.
- **Stats (desktop):** runs today, fires this hour, open PRs, failing checks.
- **Settings in the UI:** add, edit, or delete projects and the GitHub token from your phone. The
  "Test" button checks GitHub access to each repo.
- **Secrets stay on the server:** the browser only ever sees the last 4 characters of a token.
- **Installable app (PWA):** manifest and icon included. Use Add to Home Screen for a full-screen app.
- **Keyboard shortcuts (desktop):** `/` new job, `R` refresh, `1` `2` `3` switch tabs, `Esc` leave a
  field.
- **Light and dark** themes follow the system setting.
- **Motion:** skeleton loaders, a top progress bar, staggered list entrances, a flash on new runs,
  animated removal, a sliding tab indicator, count-up stats, spring-animated messages, and a run button
  that goes from loading to "Started ✓". Animations turn off when the device's reduced-motion setting is on.

## Configuration

Environment variables. You can put them in `.env`, which is loaded automatically.

| Variable | Default | Meaning |
|---|---|---|
| `DASHBOARD_PASSWORD` | (required) | Password for the whole dashboard (HTTP Basic auth; any username) |
| `PORT` | `8787` | Listen port |
| `HOST` | `0.0.0.0` | Listen address. Use `127.0.0.1` when you run it behind a tunnel or proxy |
| `DATA_DIR` | `./data` | Where `config.json` and `runs.json` are stored |
| `DEMO` | unset | `1` fakes routine fires (for trying out the UI) |
| `ROUTINE_FIRE_URL`, `ROUTINE_TOKEN`, `GITHUB_REPO`, `GITHUB_TOKEN` | unset | Optional. Used only **once** to fill in the first project and GitHub token if `data/config.json` doesn't exist yet |

After the first start, manage projects and tokens in **Settings**, not in `.env`.

## Limits to know

- **30 fires per hour per routine** (shared with "Run now" on claude.ai) and **100 API fires per hour
  per account**.
- Each run uses your subscription allowance, the same way an interactive Claude Code session does.
- **No duplicate protection:** every tap starts a new session.
- The routine API trigger is a **research preview**, so the request and response format may change.
- The dashboard can't tell when a Claude session *finishes*. It infers progress from the PR and its
  checks.

## Docs

| Doc | For |
|---|---|
| [docs/setup-guide.md](docs/setup-guide.md) | Step-by-step setup: Claude, GitHub, running, deploying |
| [docs/routine-prompt.md](docs/routine-prompt.md) | The saved prompt to paste into the Claude routine |
| [docs/architecture.md](docs/architecture.md) | How it works, HTTP API, data files, PR matching |
| [docs/security.md](docs/security.md) | Threat model and how to connect GitHub safely |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Common errors and fixes |
| [docs/roadmap.md](docs/roadmap.md) | Current status, what's left to do, improvement ideas |
| [AGENTS.md](AGENTS.md) | For developers and AI agents changing this code |
