# Security

Agent Runner holds credentials that can **start Claude sessions that push code to your repos**.
Treat it like a deploy tool.

## What each credential can do

| Credential | Stored | If leaked, an attacker can… | Revoke by |
|---|---|---|---|
| Dashboard password | `.env` | Do everything below through the UI | Change `.env`, restart |
| Routine token | `data/config.json` | Start sessions of *that one routine* with any text: Claude pushes branches and opens PRs as the GitHub App, using your plan allowance | Regenerate or delete it on the routine's API trigger page |
| GitHub fine-grained token (read-only) | `data/config.json` | Read PRs, checks, and code of the selected repos | GitHub → Settings → Fine-grained tokens → Revoke |
| Claude GitHub App install | GitHub | (not stored here) | GitHub → Settings → Applications |

A routine token **can't** read your Claude chats, reach other routines, or change account settings.

## Is it safe to connect GitHub to Claude?

Yes, if you set limits. The Claude GitHub App gets **read and write access to contents and pull requests**
on the repos you choose. Recommended setup:

1. **Only select repositories.** Never choose "All repositories".
2. **Protect the default branch:** require a PR with at least 1 approval, block force pushes, and block
   deletions. This turns "Claude never merges" from a request in the prompt into an enforced rule.
3. **Require code-owner review for `.github/`** (a CODEOWNERS file plus the "Require review from Code
   Owners" rule).
4. **Protect CI secrets.** This is the most important point. A branch Claude pushes triggers your workflows, and
   workflows run **with repo secrets**. If someone could send Claude malicious instructions, they could
   change a workflow to leak secrets. To prevent that:
   - Put deploy and E2E secrets in a **GitHub Environment** with required reviewers.
   - Only let self-hosted runners (for example the GPU E2E runner) take jobs from trusted events,
     such as `workflow_dispatch` or labeled PRs.
   - Use `permissions:` with least privilege in every workflow.
5. **Review every PR** before merging. Claude opens drafts by design.

## How the dashboard protects itself

- Tokens stay on the server. The browser gets `tokenHint` (the last 4 characters) only.
- The Fire URL must be an `api.anthropic.com/.../routines/trig_…/fire` address, so a stored token can't
  be redirected to another host.
- Every route needs Basic auth, and the password is compared in constant time.
- Requests that change data must be JSON (CSRF defence for Basic auth).
- All rendered text is HTML-escaped.
- Secret files are written with mode `0600`.

## Known gaps

See [roadmap.md](roadmap.md) for the fixes.

- **No limit on login attempts.** Use a long random password, and put Cloudflare Access or Tailscale in
  front if the dashboard is public.
- **Basic auth has no real logout.** The browser keeps the login until you close it.
- **Tokens are stored as plain text** in `config.json` (protected only by file permissions). Anyone with
  shell access as that user can read them.
- **The `data/` directory** may be created with group read/execute permissions (the files inside are 600).
  Run `chmod 700 data` to tighten it.
- **The routine's prompt guardrails are advisory.** Only branch protection and CI gating actually enforce them.

## Operational checklist

- [ ] HTTPS only (tunnel, Tailscale, or reverse proxy). `HOST=127.0.0.1` when behind one.
- [ ] Long random `DASHBOARD_PASSWORD`, kept in a password manager.
- [ ] `data/` and `.env` are never committed or copied around. Back them up encrypted, if at all.
- [ ] Branch protection plus CODEOWNERS on `.github/` on every connected repo.
- [ ] CI secrets behind GitHub Environments with reviewers.
- [ ] Regenerate routine tokens if you suspect a leak, or when someone leaves.
