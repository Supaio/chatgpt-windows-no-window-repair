#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const toolVersion = "0.1.0";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.join(scriptDirectory, "Repair-ChatGPT-Windows.log");
const buffer = Buffer.allocUnsafe(1024 * 1024);

const exactArguments = new Set([
  "--check",
  "--no-launch",
  "--self-test",
  "--help",
  "-h",
  "/?",
  "--version",
]);
const optionPrefixes = ["--install-root=", "--cli-path="];

function parseArguments(rawArguments) {
  const flags = new Set(rawArguments.map((value) => value.toLowerCase()));
  const optionValue = (name) => {
    const prefix = `${name.toLowerCase()}=`;
    const argument = rawArguments.find((value) =>
      value.toLowerCase().startsWith(prefix),
    );
    return argument ? argument.slice(prefix.length) : null;
  };
  const unknownArguments = rawArguments.filter((argument) => {
    const lower = argument.toLowerCase();
    return (
      !exactArguments.has(lower) &&
      !optionPrefixes.some((prefix) => lower.startsWith(prefix))
    );
  });

  return {
    checkOnly: flags.has("--check"),
    noLaunch: flags.has("--no-launch"),
    selfTest: flags.has("--self-test"),
    helpRequested:
      flags.has("--help") || flags.has("-h") || flags.has("/?"),
    versionRequested: flags.has("--version"),
    suppliedInstallRoot: optionValue("--install-root"),
    suppliedCliPath: optionValue("--cli-path"),
    unknownArguments,
  };
}

function validateArguments(options) {
  if (options.unknownArguments.length > 0) {
    return `Unknown argument(s): ${options.unknownArguments.join(", ")}. Use --help.`;
  }
  if (options.checkOnly && options.selfTest) {
    return "--check and --self-test cannot be used together.";
  }
  return null;
}

const parsedArguments = parseArguments(process.argv.slice(2));
const {
  checkOnly,
  noLaunch,
  selfTest,
  helpRequested,
  versionRequested,
  suppliedInstallRoot,
  suppliedCliPath,
} = parsedArguments;

const helpText = `ChatGPT/Codex Windows Repair Helper ${toolVersion}

Usage:
  Repair-ChatGPT.cmd                 Repair and relaunch the formal app
  Repair-ChatGPT.cmd --check         Read-only environment check
  Repair-ChatGPT.cmd --no-launch     Repair without relaunching the app
  node Repair-ChatGPT-Windows.mjs --self-test

Options:
  --check             Inspect only; do not stop or repair the app
  --no-launch         Do not relaunch the app after a repair
  --self-test         Test hashing and copying with temporary fixtures
  --help, -h, /?      Show this help
  --version           Show the helper version

Development options:
  --install-root=PATH Override the AppX installation root
  --cli-path=PATH     Override CODEX_CLI_PATH for inspection
`;

function printHelp() {
  console.log(helpText);
}

function timestamp() {
  return new Date().toISOString().replace("T", " ").replace("Z", " UTC");
}

function log(message = "") {
  const text = `[${timestamp()}] ${message}`;
  console.log(text);
  try {
    fs.appendFileSync(logPath, `${text}${os.EOL}`, "utf8");
  } catch {
    // Console output is still available if the log directory is read-only.
  }
}

function fail(message) {
  throw new Error(message);
}

function findPowerShell() {
  for (const executable of ["pwsh.exe", "powershell.exe"]) {
    const result = spawnSync("where.exe", [executable], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0) {
      const first = result.stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find(Boolean);
      if (first) return first;
    }
  }

  const candidates = [
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, "PowerShell", "7", "pwsh.exe")
      : null,
    process.env.SystemRoot
      ? path.join(
          process.env.SystemRoot,
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        )
      : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  fail("PowerShell was not found; Windows app information cannot be read.");
}

let powershell;

function getPowerShell() {
  powershell ||= findPowerShell();
  return powershell;
}

function runPowerShell(command, extraEnvironment = {}, allowFailure = false) {
  const result = spawnSync(
    getPowerShell(),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, ...extraEnvironment },
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );

  if (!allowFailure && result.status !== 0) {
    const detail = (
      result.error?.message ||
      result.stderr ||
      result.stdout ||
      "unknown error"
    ).trim();
    fail(`PowerShell operation failed: ${detail}`);
  }
  return result;
}

function getFormalPackage() {
  if (suppliedInstallRoot) {
    const installLocation = path.resolve(suppliedInstallRoot);
    const folderName = path.basename(installLocation);
    const match = folderName.match(
      /^OpenAI\.Codex_([^_]+)_(?:x64|arm64)__([a-z0-9]+)$/iu,
    );
    if (!match || !fs.existsSync(installLocation)) {
      fail(`The supplied formal-app installation root is invalid: ${installLocation}`);
    }
    return {
      Name: "OpenAI.Codex",
      Version: match[1],
      InstallLocation: installLocation,
      PackageFamilyName: `OpenAI.Codex_${match[2]}`,
    };
  }

  const command = [
    "$package = Get-AppxPackage -Name 'OpenAI.Codex' |",
    "  Sort-Object Version -Descending | Select-Object -First 1",
    "if ($null -eq $package) { exit 3 }",
    "$package | Select-Object Name,Version,InstallLocation,PackageFamilyName |",
    "  ConvertTo-Json -Compress",
  ].join(os.EOL);
  const result = runPowerShell(command);
  const output = result.stdout.trim();
  const jsonStart = output.indexOf("{");
  if (jsonStart < 0) fail("The formal ChatGPT/Codex app package was not found.");

  const packageInfo = JSON.parse(output.slice(jsonStart));
  if (packageInfo.Name !== "OpenAI.Codex") {
    fail("The detected package is not the formal OpenAI.Codex app; stopping.");
  }
  if (!packageInfo.InstallLocation || !fs.existsSync(packageInfo.InstallLocation)) {
    fail("The formal app installation directory does not exist.");
  }
  return packageInfo;
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function assertInside(parent, candidate, label) {
  if (!isInside(parent, candidate)) {
    fail(`${label} is outside the expected parent; stopping: ${candidate}`);
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  try {
    while (true) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(descriptor);
  }

  return hash.digest("hex");
}

function sourcePath(root, relativeName) {
  return path.join(root, ...relativeName.split("/"));
}

function analyzeBundle(root, relativeNames) {
  const aggregate = crypto.createHash("sha256");
  const entries = relativeNames.map((relativeName) => {
    const filePath = sourcePath(root, relativeName);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) fail(`A required file is missing: ${filePath}`);
    const digest = sha256File(filePath);
    aggregate.update(relativeName, "utf8");
    aggregate.update(Buffer.from([0]));
    aggregate.update(digest, "utf8");
    aggregate.update(Buffer.from([0]));
    return { relativeName, filePath, size: stat.size, digest };
  });
  return { id: aggregate.digest("hex").slice(0, 16), entries };
}

function scanTree(root) {
  const directories = [];
  const files = [];
  const pending = [{ absolute: root, relative: "" }];
  let bytes = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    for (const item of fs.readdirSync(current.absolute, { withFileTypes: true })) {
      const absolute = path.join(current.absolute, item.name);
      const relative = current.relative
        ? path.join(current.relative, item.name)
        : item.name;
      if (item.isDirectory()) {
        directories.push(relative);
        pending.push({ absolute, relative });
      } else if (item.isFile()) {
        const size = fs.statSync(absolute).size;
        files.push({ absolute, relative, size });
        bytes += size;
      } else {
        fail(`The runtime contains an unsupported file type: ${absolute}`);
      }
    }
  }

  files.sort((left, right) => left.relative.localeCompare(right.relative));
  directories.sort((left, right) => left.localeCompare(right));
  return { directories, files, bytes };
}

function bundleEntriesMatch(bundle, destinationRoot) {
  try {
    return bundle.entries.every((entry) => {
      const destination = sourcePath(destinationRoot, entry.relativeName);
      const stat = fs.statSync(destination);
      return stat.isFile() && stat.size === entry.size && sha256File(destination) === entry.digest;
    });
  } catch {
    return false;
  }
}

function runtimeMatches(bundle, sourceTree, destinationRoot) {
  if (!bundleEntriesMatch(bundle, destinationRoot)) return false;
  if (!fs.existsSync(path.join(destinationRoot, "bin", "node_modules"))) return false;

  try {
    return sourceTree.files.every((sourceFile) => {
      const destination = path.join(destinationRoot, sourceFile.relative);
      const stat = fs.statSync(destination);
      return stat.isFile() && stat.size === sourceFile.size;
    });
  } catch {
    return false;
  }
}

function copyFileBuffered(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const sourceStat = fs.statSync(source);
  const input = fs.openSync(source, "r");
  let output = null;
  try {
    output = fs.openSync(destination, "wx");
    while (true) {
      const bytesRead = fs.readSync(input, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      let offset = 0;
      while (offset < bytesRead) {
        offset += fs.writeSync(output, buffer, offset, bytesRead - offset, null);
      }
    }
    fs.fsyncSync(output);
  } catch (error) {
    try {
      if (output !== null) fs.closeSync(output);
    } catch {}
    output = null;
    try {
      fs.unlinkSync(destination);
    } catch {}
    throw error;
  } finally {
    if (output !== null) fs.closeSync(output);
    fs.closeSync(input);
  }

  if (fs.statSync(destination).size !== sourceStat.size) {
    fail(`The copied file has an unexpected size: ${destination}`);
  }
}

function quarantineExisting(destinationRoot, allowedParent) {
  if (!fs.existsSync(destinationRoot)) return null;
  assertInside(allowedParent, destinationRoot, "Existing runtime directory");
  const suffix = new Date().toISOString().replace(/[-:.TZ]/gu, "");
  let backup = `${destinationRoot}.broken-${suffix}`;
  if (fs.existsSync(backup)) backup = `${backup}-${process.pid}`;
  fs.renameSync(destinationRoot, backup);
  log(`Preserved an incomplete existing directory as: ${backup}`);
  return backup;
}

function materializeRuntime(destinationRoot, bundle, sourceTree) {
  const parent = path.dirname(destinationRoot);
  assertInside(parent, destinationRoot, "CUA destination");
  quarantineExisting(destinationRoot, parent);
  const stage = path.join(parent, `.repair-${bundle.id}-${process.pid}-${Date.now()}`);
  assertInside(parent, stage, "CUA staging directory");
  fs.mkdirSync(stage, { recursive: false });

  for (const relative of sourceTree.directories) {
    fs.mkdirSync(path.join(stage, relative), { recursive: true });
  }

  log(`Copying CUA: ${sourceTree.files.length} files, ${sourceTree.bytes} bytes.`);
  let copied = 0;
  for (const sourceFile of sourceTree.files) {
    copyFileBuffered(sourceFile.absolute, path.join(stage, sourceFile.relative));
    copied += 1;
    if (copied % 250 === 0 || copied === sourceTree.files.length) {
      log(`CUA copy progress: ${copied}/${sourceTree.files.length}`);
    }
  }

  if (!runtimeMatches(bundle, sourceTree, stage)) {
    fail(`CUA verification failed; staging files were kept at: ${stage}`);
  }
  if (fs.existsSync(destinationRoot)) {
    fail(`The CUA destination appeared during repair; refusing to overwrite: ${destinationRoot}`);
  }
  fs.renameSync(stage, destinationRoot);
  log(`CUA runtime is ready: ${destinationRoot}`);
}

function materializeCore(destinationRoot, bundle) {
  const parent = path.dirname(destinationRoot);
  assertInside(parent, destinationRoot, "Codex engine destination");
  quarantineExisting(destinationRoot, parent);
  const stage = path.join(parent, `.repair-${bundle.id}-${process.pid}-${Date.now()}`);
  assertInside(parent, stage, "Codex engine staging directory");
  fs.mkdirSync(stage, { recursive: false });

  log("Copying the Codex engine bundled with the formal desktop app.");
  for (const entry of bundle.entries) {
    copyFileBuffered(entry.filePath, sourcePath(stage, entry.relativeName));
  }
  if (!bundleEntriesMatch(bundle, stage)) {
    fail(`Codex engine verification failed; staging files were kept at: ${stage}`);
  }
  if (fs.existsSync(destinationRoot)) {
    fail(`The Codex engine destination appeared during repair; refusing to overwrite: ${destinationRoot}`);
  }
  fs.renameSync(stage, destinationRoot);
  log(`Codex engine is ready: ${destinationRoot}`);
}

function getConfiguredCliPath() {
  if (suppliedCliPath) return path.resolve(suppliedCliPath);
  if (process.env.CODEX_CLI_PATH?.trim()) return process.env.CODEX_CLI_PATH.trim();
  const result = spawnSync(
    "reg.exe",
    ["query", "HKCU\\Environment", "/v", "CODEX_CLI_PATH"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) return null;
  const match = result.stdout.match(/^\s*CODEX_CLI_PATH\s+REG_\w+\s+(.+)$/imu);
  return match?.[1]?.trim() || null;
}

function setConfiguredCliPath(cliPath) {
  process.env.CODEX_CLI_PATH = cliPath;
  const result = spawnSync("setx.exe", ["CODEX_CLI_PATH", cliPath], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown error").trim();
    fail(`Could not persist CODEX_CLI_PATH: ${detail}`);
  }
  log(`CODEX_CLI_PATH was updated to: ${cliPath}`);
}

function cliMatches(bundle, cliPath) {
  if (!cliPath || path.basename(cliPath).toLowerCase() !== "codex.exe") return false;
  if (cliPath.toLowerCase().includes("\\program files\\windowsapps\\")) return false;
  return bundleEntriesMatch(bundle, path.dirname(cliPath));
}

function cliPathIsUsable(cliPath) {
  if (!cliPath || path.basename(cliPath).toLowerCase() !== "codex.exe") return false;
  if (cliPath.toLowerCase().includes("\\program files\\windowsapps\\")) return false;
  try {
    const stat = fs.statSync(cliPath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function stopFormalApp(installRoot) {
  const command = [
    "$root = $env:CHATGPT_REPAIR_INSTALL_ROOT",
    "$stopped = 0",
    "$formal = @(Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue | Where-Object {",
    "  try { $_.Path -and $_.Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) } catch { $false }",
    "})",
    "foreach ($process in $formal) {",
    "  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue",
    "  $stopped++",
    "}",
    "Start-Sleep -Milliseconds 800",
    "$orphans = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {",
    "  $_.CommandLine -and $_.CommandLine.IndexOf($root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and",
    "  $_.Name -in @('codex.exe','node.exe')",
    "})",
    "foreach ($process in $orphans) {",
    "  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue",
    "  $stopped++",
    "}",
    "Start-Sleep -Milliseconds 500",
    "'STOPPED=' + $stopped",
  ].join(os.EOL);
  const result = runPowerShell(command, {
    CHATGPT_REPAIR_INSTALL_ROOT: installRoot,
  });
  log(`Stopped formal-app processes (${result.stdout.trim() || "STOPPED=0"}); Beta was not touched.`);
}

function formalProcessCount(installRoot) {
  const command = [
    "$root = $env:CHATGPT_REPAIR_INSTALL_ROOT",
    "$count = @(Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue | Where-Object {",
    "  try { $_.Path -and $_.Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) } catch { $false }",
    "}).Count",
    "Write-Output $count",
  ].join(os.EOL);
  const result = runPowerShell(
    command,
    { CHATGPT_REPAIR_INSTALL_ROOT: installRoot },
    true,
  );
  const count = Number.parseInt((result.stdout || "").trim(), 10);
  return Number.isFinite(count) ? count : 0;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function spawnDetached(executable, arguments_, options) {
  return new Promise((resolve) => {
    const child = spawn(executable, arguments_, {
      ...options,
      detached: true,
      stdio: "ignore",
    });
    child.once("error", (error) => resolve({ started: false, error }));
    child.once("spawn", () => {
      child.unref();
      resolve({ started: true, error: null });
    });
  });
}

async function launchFormalApp(packageInfo, cliPath) {
  const appExecutable = path.join(packageInfo.InstallLocation, "app", "ChatGPT.exe");
  if (!fs.existsSync(appExecutable)) fail(`The formal app executable was not found: ${appExecutable}`);

  const environment = { ...process.env, CODEX_CLI_PATH: cliPath };
  const directLaunch = await spawnDetached(appExecutable, [], {
    env: environment,
    windowsHide: false,
  });
  if (!directLaunch.started) {
    log(`Direct launch failed; trying the Windows app entry point: ${directLaunch.error.message}`);
  }

  await sleep(3500);
  if (formalProcessCount(packageInfo.InstallLocation) === 0) {
    const appId = `${packageInfo.PackageFamilyName}!App`;
    const fallbackLaunch = await spawnDetached(
      "explorer.exe",
      [`shell:AppsFolder\\${appId}`],
      { env: environment, windowsHide: false },
    );
    if (!fallbackLaunch.started) {
      fail(`The Windows app entry point failed: ${fallbackLaunch.error.message}`);
    }
  }

  let highestProcessCount = 0;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await sleep(2000);
    const count = formalProcessCount(packageInfo.InstallLocation);
    highestProcessCount = Math.max(highestProcessCount, count);
    if (count >= 4) {
      log(`The formal app started; detected ${count} app processes.`);
      return;
    }
  }
  if (highestProcessCount > 0) {
    log(`The formal app accepted the launch request; detected ${highestProcessCount} app process(es). Confirm that the window appears.`);
    return;
  }
  fail("Repair completed and launch was requested, but no formal-app process appeared. Review the log and retry once.");
}

function runSelfTest() {
  const temporaryParent = os.tmpdir();
  const temporaryRoot = fs.mkdtempSync(
    path.join(temporaryParent, "chatgpt-repair-selftest-"),
  );
  assertInside(temporaryParent, temporaryRoot, "Self-test temporary directory");

  try {
    const cuaSource = path.join(temporaryRoot, "source", "cua_node");
    fs.mkdirSync(path.join(cuaSource, "bin", "node_modules", "example"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(cuaSource, "manifest.json"), '{"test":true}\n');
    fs.writeFileSync(path.join(cuaSource, "bin", "node.exe"), "test-node");
    fs.writeFileSync(path.join(cuaSource, "bin", "node_repl.exe"), "test-repl");
    fs.writeFileSync(
      path.join(cuaSource, "bin", "node_modules", "example", "index.js"),
      "export default 1;\n",
    );

    const runtimeBundle = analyzeBundle(cuaSource, [
      "manifest.json",
      "bin/node.exe",
      "bin/node_repl.exe",
    ]);
    if (runtimeBundle.id !== "173958fd75bf6f01") {
      fail(`Unexpected deterministic CUA fixture ID: ${runtimeBundle.id}`);
    }
    const runtimeTree = scanTree(cuaSource);
    const runtimeParent = path.join(temporaryRoot, "runtime");
    fs.mkdirSync(runtimeParent, { recursive: true });
    const runtimeDestination = path.join(runtimeParent, runtimeBundle.id);
    materializeRuntime(runtimeDestination, runtimeBundle, runtimeTree);
    if (!runtimeMatches(runtimeBundle, runtimeTree, runtimeDestination)) {
      fail("CUA self-test verification failed.");
    }

    const coreSource = path.join(temporaryRoot, "source", "core");
    fs.mkdirSync(coreSource, { recursive: true });
    for (const name of [
      "codex.exe",
      "codex-code-mode-host.exe",
      "codex-windows-sandbox-setup.exe",
      "codex-command-runner.exe",
    ]) {
      fs.writeFileSync(path.join(coreSource, name), `fixture:${name}\n`);
    }
    const coreBundle = analyzeBundle(coreSource, [
      "codex.exe",
      "codex-code-mode-host.exe",
      "codex-windows-sandbox-setup.exe",
      "codex-command-runner.exe",
    ]);
    if (coreBundle.id !== "526f103fccd2651d") {
      fail(`Unexpected deterministic Codex fixture ID: ${coreBundle.id}`);
    }
    const coreParent = path.join(temporaryRoot, "core");
    fs.mkdirSync(coreParent, { recursive: true });
    const coreDestination = path.join(coreParent, coreBundle.id);
    materializeCore(coreDestination, coreBundle);
    if (!bundleEntriesMatch(coreBundle, coreDestination)) {
      fail("Codex engine self-test verification failed.");
    }
    log("Self-test passed: hashing, buffered copy, directory checks, and atomic activation work.");
  } finally {
    assertInside(temporaryParent, temporaryRoot, "Self-test cleanup directory");
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  if (helpRequested) {
    printHelp();
    return;
  }
  if (versionRequested) {
    console.log(toolVersion);
    return;
  }
  const argumentError = validateArguments(parsedArguments);
  if (argumentError) fail(argumentError);

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 18) {
    fail(`Node.js 18 or newer is required; found ${process.versions.node}.`);
  }
  if (process.platform !== "win32" && !selfTest) {
    fail("This repair helper only supports Windows.");
  }

  log("============================================================");
  if (selfTest) {
    log("Starting temporary-fixture self-test.");
    runSelfTest();
    return;
  }
  log(checkOnly ? "Starting read-only check." : "Starting repair of the formal ChatGPT/Codex Windows app.");

  const packageInfo = getFormalPackage();
  const resourcesRoot = path.join(packageInfo.InstallLocation, "app", "resources");
  const cuaSourceRoot = path.join(resourcesRoot, "cua_node");
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const runtimeRoot = path.join(localAppData, "OpenAI", "Codex", "runtimes", "cua_node");
  const coreRoot = path.join(localAppData, "OpenAI", "Codex", "bin");

  if (!fs.existsSync(cuaSourceRoot)) fail(`The formal app does not contain CUA resources: ${cuaSourceRoot}`);
  log(`Formal app version: ${packageInfo.Version}`);

  const runtimeBundle = analyzeBundle(cuaSourceRoot, [
    "manifest.json",
    "bin/node.exe",
    "bin/node_repl.exe",
  ]);
  const runtimeTree = scanTree(cuaSourceRoot);
  const runtimeDestination = path.join(runtimeRoot, runtimeBundle.id);
  const runtimeReady = runtimeMatches(runtimeBundle, runtimeTree, runtimeDestination);
  log(`CUA ID: ${runtimeBundle.id}; status: ${runtimeReady ? "complete" : "repair required"}`);

  const coreBundle = analyzeBundle(resourcesRoot, [
    "codex.exe",
    "codex-code-mode-host.exe",
    "codex-windows-sandbox-setup.exe",
    "codex-command-runner.exe",
  ]);
  const configuredCli = getConfiguredCliPath();
  const configuredCliMatches = cliMatches(coreBundle, configuredCli);
  const configuredCliIsManaged = configuredCli
    ? isInside(coreRoot, configuredCli)
    : false;
  const configuredCliReady =
    cliPathIsUsable(configuredCli) &&
    (!configuredCliIsManaged || configuredCliMatches);
  const coreDestination = path.join(coreRoot, coreBundle.id);
  const packagedCoreReady = bundleEntriesMatch(coreBundle, coreDestination);
  log(`Codex engine ID: ${coreBundle.id}`);
  log(`Configured engine: ${configuredCli || "not configured"}`);
  log(
    `Configured engine status: ${
      configuredCliMatches
        ? "usable and an exact match for the formal app"
        : configuredCliReady
          ? "usable; the existing external engine will be preserved"
          : "unusable; repair required"
    }`,
  );

  if (checkOnly) {
    if (runtimeReady && (configuredCliReady || packagedCoreReady)) {
      log("Check passed: the environment is ready to launch.");
      return;
    }
    process.exitCode = 2;
    log("Check complete: repair is required. Run Repair-ChatGPT.cmd without --check.");
    return;
  }

  log("In 3 seconds, only the formal app will be stopped; Beta will remain open. Press Ctrl+C to cancel.");
  await sleep(3000);
  stopFormalApp(packageInfo.InstallLocation);

  if (!runtimeReady) {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    materializeRuntime(runtimeDestination, runtimeBundle, runtimeTree);
  } else {
    log("The CUA runtime is already complete; no changes needed.");
  }

  let cliPath = configuredCli;
  if (!configuredCliReady) {
    fs.mkdirSync(coreRoot, { recursive: true });
    if (!packagedCoreReady) {
      materializeCore(coreDestination, coreBundle);
    } else {
      log(`Found a matching local Codex engine: ${coreDestination}`);
    }
    cliPath = path.join(coreDestination, "codex.exe");
    setConfiguredCliPath(cliPath);
  } else {
    process.env.CODEX_CLI_PATH = cliPath;
    log(
      configuredCliMatches
        ? "The existing CODEX_CLI_PATH exactly matches the formal app; no change needed."
        : "The existing external CODEX_CLI_PATH is usable; preserving it without copying another engine.",
    );
  }

  if (noLaunch) {
    log("Repair completed; the formal app was not launched because --no-launch was used.");
    return;
  }
  await launchFormalApp(packageInfo, cliPath);
  log("Repair flow completed. If the app window is visible, you can close this console.");
}

const modulePath = path.resolve(fileURLToPath(import.meta.url));
const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isDirectRun =
  process.platform === "win32"
    ? modulePath.toLowerCase() === entryPath.toLowerCase()
    : modulePath === entryPath;

if (isDirectRun) {
  main().catch((error) => {
    log(`Repair failed: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}

export { helpText, parseArguments, toolVersion, validateArguments };
