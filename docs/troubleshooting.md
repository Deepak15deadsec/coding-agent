# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Server exits: `Missing DASHBOARD_PASSWORD` | Not set | Add it to `.env` or pass it in the environment |
| Browser keeps asking for a login | Wrong password | Username can be anything; check `DASHBOARD_PASSWORD` |
| Add project: "Fire URL must look like …" | Pasted the routine page URL instead of the API Fire URL | Copy the **Fire URL** from the routine's API trigger panel |
| Add project: "Token should start with sk-ant-oat01-" | Pasted something else (an API key, a GitHub token) | Generate a token on the routine's API trigger |
| Run: "Routine token rejected…" (401) | Token regenerated or deleted, or the wrong routine | Generate a new token, then Settings → Edit project → paste it |
| Run: "Rate limited. Retry after Ns." (429) | 30 fires/hour per routine or 100/hour per account | Wait. The run box shows `n/30 this hour` |
| Run: 400 "routine is paused" | Routine disabled on claude.ai | Turn it on at claude.ai/code/routines |
| Run: 403 permission error | Plan or org doesn't allow routines or Claude Code on the web | Check your plan and org settings |
| Session starts but Claude does nothing useful | Saved prompt doesn't opt in to the fire text | Use [routine-prompt.md](routine-prompt.md) |
| Creating a routine fails with `github_token_missing` | Claude account not connected to GitHub | Connect GitHub at claude.ai/code first |
| Run stays on "Waiting for PR" but the PR exists | The PR body doesn't contain the session id | Ask for the session URL in the routine prompt. A fallback match is on the roadmap |
| PRs tab: "GitHub 401 (token rejected)" | Token expired or revoked | Make a new fine-grained token and save it in Settings |
| PRs tab: "GitHub 404 (repo not found or no access)" | Wrong `owner/repo`, or the token doesn't include that repo or org | Fix the repo name. For org repos set **Resource owner** to the org; the org may also need to approve the token |
| Checks always show "no checks" | Repo has no CI, or the token lacks **Checks: Read** | Add that permission |
| The server stopped by itself | It was started from a terminal or agent session that ended | Run it under systemd or Docker ([setup-guide.md](setup-guide.md#6-keep-it-running-and-reach-it-from-your-phone)) |
| Code changes don't show up | The server keeps the old `server.mjs` in memory | Restart the process (the HTML is re-read on every request) |
