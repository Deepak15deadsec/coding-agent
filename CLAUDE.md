# CLAUDE.md

Read [AGENTS.md](AGENTS.md) first. It contains the repo map, the security rules you must not
break, the API, the frontend conventions, and how to verify changes.

Short version:
- Zero dependencies. The server is `server.mjs` and the UI is one file, `public/index.html`.
- Try changes with `DEMO=1 DASHBOARD_PASSWORD=demo node server.mjs`.
- Never send tokens to the browser, never print `data/config.json`, and escape all rendered data with `esc()`.
- Restart the server after editing `server.mjs`. Kill it by PID, not `pkill -f`.
