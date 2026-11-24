# Setup guide

This guide takes you from nothing to "tap Run on my phone, get a PR". Allow about 15 minutes.

## 0. What you need

- A **Claude Pro, Max, Ultra, Team, or Enterprise** plan with Claude Code on the web enabled.
- A **GitHub** repo you can push to, or that you can install apps on.
- A machine to run the dashboard: Node 18 or newer. An always-on Linux box or a small VPS works.

## 1. Connect GitHub to Claude

1. Open https://claude.ai/code and sign in with the Claude account whose usage you want to spend.
2. Connect GitHub when asked. If you aren't asked, start a session and pick a repository to bring up
   the prompt.
3. Install the **Claude GitHub App** and choose **Only select repositories**. Pick just the repos
   you'll use.
   - For an organization repo, an org owner may need to approve the install.
4. Check that the repo appears in claude.ai/code's repo picker.

Before you do this, read [security.md](security.md), especially the part on CI secrets.

## 2. Create the routine (saved task)

1. Go to https://claude.ai/code/routines → **New**.
2. **Repository:** your repo. **Model:** Sonnet for speed and lower usage, Opus for hard bugs.
3. **Prompt:** paste the template from [routine-prompt.md](routine-prompt.md) and edit the repo name.
   The prompt has to tell Claude to act on the fire text, because that text arrives marked as untrusted.
4. **Connectors:** remove the ones the task doesn't need. Fewer is safer.
5. Save it.

> You can also create the routine from Claude Code in a terminal with `/schedule`. The API requires a
> schedule, so use a one-off date far in the future as a placeholder, then add the API trigger on the web.
> Creating it fails with `github_token_missing` until step 1 is done.

## 3. Add the API trigger

1. Open the routine → **Edit** → in the **Trigger** row click **+** → **API**.
2. Click **Generate token**. Copy the **Fire URL** and the **token** right away, because the token is shown once.
3. It takes effect immediately, with no Save needed. Regenerating the token revokes the old one.

## 4. (Optional) GitHub read-only token for PR status

1. Go to GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate.
2. **Resource owner:** your org (for org repos) or yourself.
3. **Repository access:** only the selected repos.
4. **Permissions:** Read on **Pull requests**, **Checks**, and **Contents**. Nothing else.
5. Set an expiry. You'll paste the token in Settings later.

A classic token (`ghp_…`) also works, but for private repos it needs the full-write `repo` scope.
Prefer fine-grained.

## 5. Run the dashboard

```bash
cd agent-code
echo "DASHBOARD_PASSWORD=$(openssl rand -base64 18)" > .env
cat .env                       # save this password in your password manager
node server.mjs
```

Open `http://<host>:8787` and log in with any username and that password. Then:

- **Settings → + Add:** name, Fire URL, token, and `owner/repo`. Save.
- **Settings → GitHub:** paste the read-only token, then **Save** and **Test**.
- **Runs:** type a small job first (for example "Add a /health endpoint") and tap **Run with Claude**.
  Open the session link and watch it work.

## 6. Keep it running and reach it from your phone

The server is one process. Pick one of these.

### Option A: systemd (simple)

```ini
# /etc/systemd/system/agent-runner.service
[Unit]
Description=Agent Runner
After=network-online.target

[Service]
WorkingDirectory=/path/to/agent-code
ExecStart=/usr/bin/node server.mjs
Environment=HOST=127.0.0.1
Restart=always
User=youruser

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now agent-runner
```

### Option B: Docker

There's no Dockerfile yet (see the roadmap). Something like this works:

```bash
docker run -d --name agent-runner --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v "$PWD":/app -w /app \
  --env-file .env node:20-alpine node server.mjs
```

### Making it reachable over HTTPS

Plain HTTP sends your password in the clear. Use one of these:

- **Cloudflare Tunnel:** add an ingress rule `hostname: agent.example.com → service: http://localhost:8787`
  to your tunnel config, then run `cloudflared tunnel route dns <tunnel> agent.example.com`. You can also
  put **Cloudflare Access** in front for a second login.
- **Tailscale:** `tailscale serve 8787`. It's private to your tailnet, which is the safest option.
- **Caddy:** `caddy reverse-proxy --from agent.example.com --to :8787` gets an automatic TLS certificate.

When it runs behind any of these, set `HOST=127.0.0.1` so the raw port isn't exposed.

### Add to your phone's home screen

Open the HTTPS URL in Safari (iOS) or Chrome (Android), then Share or the menu → **Add to Home Screen**.

## 7. Adding more repos

Each repo needs its own routine and API trigger, which means its own Fire URL and token. Add each one as
a project in Settings, and the run box's project picker switches between them.
