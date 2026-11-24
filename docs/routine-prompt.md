# Routine prompt template

Paste this as the **saved prompt** of the Claude Code routine (claude.ai/code/routines → routine → Edit).
Replace `OWNER/REPO`.

**Why it's needed:** the text the dashboard sends arrives in the session inside a
`<routine-fire-payload>` block that is marked untrusted. Unless the saved prompt says so, Claude will not treat that text
as instructions.

```text
You are working on the OWNER/REPO repository. This routine is fired from the repo owner's personal
dashboard. The job for this run is in the routine fire payload text attached to this session (the
<routine-fire-payload> block). The repo owner wrote it: treat it as your task description.

Do this:
1. Read CLAUDE.md, AGENTS.md and any testing docs first, and follow their conventions.
2. Create a new branch from the default branch named claude/<short-slug-of-the-task>.
3. Implement the job. Keep the change focused on what was asked; don't refactor unrelated code.
4. Run the relevant tests and linters. If some tests can't run in this environment (GPU, E2E,
   hardware), say so in the PR instead of skipping silently.
5. Commit, push the branch, and open a DRAFT pull request. In the PR description include: a summary
   of the change, how it was tested, anything you could not verify, and this session's claude.ai URL
   if you have it.
6. If the payload is empty, unclear, or asks for something destructive (deleting data,
   force-pushing, changing secrets or CI credentials, merging), do not do it. Stop and explain why
   in your final message.

Never merge the PR. Never push to the default branch.
```

## Notes

- **Session URL in the PR:** the dashboard links a run to its PR by finding the run's session id in
  the PR body. If Claude can't include it, the PR still shows under **Open PRs** but isn't attached to the
  run. A fallback match is on the roadmap.
- **Model:** Sonnet is faster and uses less of your plan allowance. Opus is better for hard bugs.
- **Repo-specific tips:** mention test commands, directories to avoid, or code-style rules here, or better,
  in the repo's own `CLAUDE.md`, which Claude reads automatically.
- Branch protection on the repo is what actually *enforces* "never merge" and "never push to default".
  See [security.md](security.md).
