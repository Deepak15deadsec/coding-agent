# Roadmap

_Last updated: 2026-11-24_

## Current status

**Done**
- [x] Server proxies routine fires; tokens stay on the server
- [x] Projects and GitHub token managed in a Settings UI (instead of `.env`)
- [x] Run history with Session → PR → Checks progress, plus Run again, Copy, and Remove
- [x] Open PRs view with CI state; PR merged and closed states
- [x] Responsive UI: phone (bottom tabs) and desktop (sidebar, PR column, stats)
- [x] Project filter, search, hourly fire counter, keyboard shortcuts, installable app (PWA)
- [x] Demo mode
- [x] Motion animations (vendored Motion 11.18.2): skeletons, progress bar, list enter/exit, tab indicator, count-ups
- [x] Validated: mock fire endpoint; Anthropic's real endpoint returns 401 for a fake token (so the request
      format reaches auth); input validation; CSRF guard; tokens never in responses

**Not done yet (blocking real use)**
- [ ] **Connect GitHub on claude.ai** for the account you'll use. The first attempt failed with `github_token_missing`,
      and the owner plans to use a different Claude account.
- [ ] **Create the routine** for `VariPhiGen/VMS-onprem` (approved config: Opus 5.5, no connectors, prompt from
      [routine-prompt.md](routine-prompt.md)), then add the API trigger and paste the Fire URL and token into Settings.
- [ ] **Deploy:** run under Docker or systemd so it survives reboots, and add an HTTPS hostname (for example a Cloudflare Tunnel
      route such as `agent.<domain>`, or Tailscale). It currently runs only as a dev process in demo mode.
- [ ] Set a real `DASHBOARD_PASSWORD`, remove the demo projects and runs (`rm data/*.json`), and `chmod 700 data`.
- [ ] Set up repo safety: branch protection, CODEOWNERS for `.github/`, CI secrets behind Environments ([security.md](security.md)).

## Improvements, by priority

### P1: reliability and correctness
- **Fallback PR matching.** When no PR body contains the session id, match by repo + branch prefix
  `claude/` + earliest PR created after the run, with no other run already claiming it.
- **Dockerfile + compose** (with an optional `cloudflared` sidecar) and a systemd unit in the repo.
- **Fetch timeouts** (AbortController) on Anthropic and GitHub calls, so a slow request doesn't hang the UI.
- **Serialized writes** to `runs.json` and `config.json` (an in-process queue), to avoid races between two tabs.
- **Duplicate-tap guard:** ignore the same prompt to the same project within ~10 seconds (the API has no idempotency key).

### P2: security
- Limit login attempts per IP (back off after failures).
- Session-cookie login with a logout button, instead of Basic auth only.
- Encrypt tokens at rest (key from env, or the OS keyring).
- Optional Cloudflare Access / OIDC header check so only your identity can reach the app.
- Show token age and remind you to rotate.

### P3: features
- **Notifications** when a PR opens, checks fail, or a PR merges (Web Push, ntfy, or Telegram).
- **Trigger GPU E2E** from the dashboard: a button that sends `workflow_dispatch` to the E2E workflow on the
  PR branch (needs a separate token with `actions:write`).
- **Prompt templates and quick actions** per project ("Fix failing CI on PR #", "Add tests for …").
- **Attachments:** paste logs or stack traces as separate sections of the fire text (stays under 65,536 chars).
- **Voice input** on mobile (Web Speech API) to dictate jobs.
- **PR actions:** comment on a PR, mark it ready for review, or close it from the dashboard (needs write scope; keep optional).
- **Session status:** show running/finished if Anthropic exposes a public session-status API.
  Today only the fire response is public.
- **Codex provider:** a second provider using the ChatGPT plan through Codex app-server on the host, with a
  provider picker in the run box.
- **Multiple users:** per-user logins, an audit log of who fired what.
- **Usage view:** runs per day and project over time.

### P4: developer experience
- Automated tests: `node --test` for the API (with a mock fire server) and a Playwright smoke test
  at 390px and 1440px.
- Split `index.html` into modules only if it grows past ~1,000 lines. Keep the no-build approach.
- CI workflow: syntax check, tests, screenshot artifacts.
