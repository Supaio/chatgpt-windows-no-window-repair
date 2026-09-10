# Fix ChatGPT Windows App Not Showing a Window

[简体中文](README.md)

**An unofficial, source-available Windows repair helper for a specific ChatGPT/Codex desktop-app failure: background processes start after an update, but no window appears.**

The helper reconstructs incomplete local runtime copies outside `WindowsApps`, preserves a usable external `CODEX_CLI_PATH`, and relaunches only the formal app. It does not bundle or download OpenAI executables.

> [!IMPORTANT]
> **I personally encountered and reproduced this problem on my Windows x64 computer. I tested this script during two real app updates; it ran correctly and successfully restored the ChatGPT window. The latest formal app version tested was `26.903.9818.0`.**
>
> **If it does not fix your machine, please [open a Bug Report issue](../../issues/new?template=bug_report.yml) with redacted check output or logs. I will help investigate the case with you and improve the script where possible.**

> [!WARNING]
> This project relies on internal desktop-app file layout that is not a public compatibility contract. Review the source, use `--check` first, and expect future app updates to require changes here.

## Why background processes can run without a visible window

**Based on direct inspection and repair logs from two real update failures, the immediate cause on my machine was that required runtime files were not completely relocated or initialized in a local directory executable by the current Windows user. The UI startup chain then stalled after the background processes had started.**

The Microsoft Store installation lives under the protected `C:\Program Files\WindowsApps` tree. At startup, ChatGPT/Codex also uses version-specific local runtimes under `%LOCALAPPDATA%\OpenAI\Codex`. In the two failures I encountered:

1. The first involved access to or execution of the bundled Codex CLI. A persistent, valid external `CODEX_CLI_PATH` restored the app.
2. A later update left the CUA Node runtime incomplete. For formal app version `26.903.9818.0`, the script rebuilt and verified a runtime containing 4,052 files and 261,658,315 bytes; the window appeared again after relaunch.

This evidence indicates that the app's background host processes can start before all Codex CLI or CUA Node dependencies are ready. If dependency initialization cannot finish, the result can be processes in Task Manager but no desktop window. This causal diagnosis is based on before-and-after file state, repair logs, and the successful recovery.

The [official OpenAI Windows app documentation](https://learn.chatgpt.com/zh-Hans/docs/windows/windows-app) describes the native Windows app, and the [official troubleshooting guide](https://learn.chatgpt.com/zh-Hans/docs/reference/troubleshooting) notes that the desktop app and CLI can bundle different Codex versions. **OpenAI has not documented the exact failure described here as a universal cause, so the explanation above is this project's evidence-based diagnosis of the tested machines.**

**The same “processes but no window” symptom can have other causes. This helper targets the specific class of failures where runtime relocation or staging is incomplete after an update.**

**Resetting `config.toml` can help with a different class of configuration corruption. It was not the cause in either tested case, so this script does not reset your configuration.**

## Requirements

- Windows with the formal `OpenAI.Codex` AppX package installed
- Node.js 18 or newer available on `PATH`
- No administrator privileges

The full repair flow was validated on x64 formal app versions `26.903.8094.0` and `26.903.9818.0`. ARM64 package discovery is implemented but has not been tested.

## Quick start

1. Download or clone this repository.
2. Run a read-only check:

   ```powershell
   .\Repair-ChatGPT.cmd --check
   ```

3. If repair is required, double-click `Repair-ChatGPT.cmd`, or run:

   ```powershell
   .\Repair-ChatGPT.cmd
   ```

4. Keep the console open until it reports `Operation completed.`

Run it as your normal Windows user. Do not select **Run as administrator**, because a different Windows account could receive the per-user environment-variable change.

Repairing a new app version may copy roughly 250–700 MB and can take several minutes.

## What it does

- Selects the exact formal package name `OpenAI.Codex`; it does not select Beta.
- Calculates the runtime directory ID from the files bundled with the installed app.
- Detects missing or incomplete CUA runtime files before rebuilding the runtime.
- Verifies every copied file size and the SHA-256 of key runtime files.
- Preserves a usable external `CODEX_CLI_PATH`.
- If that path is absent, invalid, or points to an outdated helper-managed engine, copies the current app-bundled Codex engine into `%LOCALAPPDATA%\OpenAI\Codex\bin` and persists the new per-user path.
- Stops only formal-app processes whose executable path belongs to the detected package, then relaunches the formal app.

## What it does not do

- It does not access the network.
- It does not reset `config.toml`.
- It does not modify accounts, projects, plugins, or conversation data.
- It does not stop Beta or write into the Beta installation directory.
- It does not silently delete an incomplete runtime. Such a directory is renamed with a `.broken-*` suffix for recovery and diagnosis.

## Commands

```text
Repair-ChatGPT.cmd                 Repair and relaunch
Repair-ChatGPT.cmd --check         Read-only environment check
Repair-ChatGPT.cmd --no-launch     Repair without relaunching
node Repair-ChatGPT-Windows.mjs --self-test
node Repair-ChatGPT-Windows.mjs --help
node Repair-ChatGPT-Windows.mjs --version
```

`--install-root=PATH` and `--cli-path=PATH` are development overrides used for fixture and package checks.

## Logs and privacy

The helper writes `Repair-ChatGPT-Windows.log` beside the scripts. Logs can contain your Windows username and local file paths. Log files are ignored by Git, but you should still redact personal paths before attaching a log to an issue.

The helper never reads or prints API keys, access tokens, cookies, passwords, or ChatGPT account data.

## Development

No npm dependencies are required.

```powershell
npm run check:syntax
npm test
```

The self-test uses only a newly created operating-system temporary directory and verifies hashing, buffered copying, directory checks, and atomic activation. It does not inspect or modify the installed app.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before reporting or submitting changes. Never commit OpenAI binaries, an extracted `app.asar`, copied CUA files, or private logs.

## License and disclaimer

The original code in this repository is licensed under the [MIT License](LICENSE).

This is an independent community project. It is not affiliated with, endorsed by, or supported by OpenAI. OpenAI, ChatGPT, and Codex are trademarks of their respective owner. This repository contains no OpenAI application binaries or application source code.
