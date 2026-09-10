# Contributing

Bug reports and narrowly scoped compatibility fixes are welcome.

## Before opening an issue

Run:

```powershell
.\Repair-ChatGPT.cmd --check
node .\Repair-ChatGPT-Windows.mjs --version
```

Include:

- Windows version and CPU architecture;
- formal app version;
- helper version;
- exact reproduction steps;
- whether Beta was running;
- a redacted log excerpt, if needed.

Remove Windows usernames, home-directory paths, organization names, tokens, cookies, and other private information before posting.

## Pull requests

Keep changes small and specific to this repair flow. Do not add network access, telemetry, automatic elevation, unrelated cleanup, or destructive fallback behavior.

Before submitting:

```powershell
npm run check:syntax
npm test
```

Do not commit OpenAI executables, DLLs, an extracted `app.asar`, copied CUA files, private logs, or other proprietary application artifacts.
