# Security policy

## Reporting a vulnerability

Please use GitHub private vulnerability reporting after the repository owner enables it. Do not open a public issue for a vulnerability that could cause arbitrary file writes, command execution, unsafe process termination, or exposure of local data.

Include the helper version, Windows architecture, and the smallest safe reproduction. Do not attach unredacted logs: `Repair-ChatGPT-Windows.log` can contain a Windows username and local filesystem paths.

## Security boundaries

The helper is intentionally offline and requires no administrator privileges. It may:

- read files from the installed formal `OpenAI.Codex` AppX package;
- write verified runtime copies below `%LOCALAPPDATA%\OpenAI\Codex`;
- persist the per-user `CODEX_CLI_PATH` environment variable when its current value is unusable;
- stop and relaunch formal-app processes whose executable path belongs to the detected package.

It must not read credentials, browser storage, account data, project contents, or conversation data. It must not download or distribute application binaries.

Only the latest tagged release receives fixes. The desktop application's internal file layout can change without notice, so compatibility with future app versions is not guaranteed.
