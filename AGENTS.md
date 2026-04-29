# Codex project rules

These rules are for any future Codex/agent session working in this repository.

## Safety boundaries

- Treat this repository as source code only.
- Do **not** delete, overwrite, commit, or upload runtime account data under:
  - `%USERPROFILE%\.codex-api-gateway\`
  - `%USERPROFILE%\.codex\`
- Do **not** print or commit full tokens, API keys, `auth.json`, `accounts.json`, `config.json`, `.env`, or exported account JSON.
- Do **not** stop or restart the running Codex API Gateway unless the user explicitly agrees. Restarting can disconnect the current Codex App API session.

## Before making changes

1. Run:

   ```powershell
   git status --short --branch --ignored
   ```

2. Create a local checkpoint before editing:

   ```powershell
   .\scripts\checkpoint.ps1
   ```

   - If the tree is clean, this creates a local backup branch.
   - If the tree has changes, this creates a checkpoint commit after checking for sensitive filenames.

3. Keep ignored local helper files and backup files ignored.

## After making changes

- For JavaScript changes, at minimum run:

  ```powershell
  node --check .\src\admin-ui.js
  ```

  Also check any touched JS entry files when relevant.

- Summarize changed files and whether a service restart is needed.
- If a restart is needed, ask the user before doing it.

## Rollback

If a change is wrong, prefer Git rollback of the project code only:

```powershell
.\scripts\rollback-last.ps1
```

This resets the repository to the latest checkpoint recorded in `.git/codex-last-checkpoint` and does not touch `%USERPROFILE%\.codex-api-gateway\`.

