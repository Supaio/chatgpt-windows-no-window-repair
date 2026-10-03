import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyFormalStartMenuShortcut,
  formalAppShellTarget,
  helpText,
  parseArguments,
  toolVersion,
  validateArguments,
} from "../Repair-ChatGPT-Windows.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageInfo = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
);

assert.equal(toolVersion, packageInfo.version);
assert.match(helpText, /Read-only environment check/u);
assert.match(helpText, /--self-test/u);

const check = parseArguments(["--CHECK", "--no-launch"]);
assert.equal(check.checkOnly, true);
assert.equal(check.noLaunch, true);
assert.equal(validateArguments(check), null);

const overrides = parseArguments([
  "--install-root=C:\\Example Root\\OpenAI.Codex_1.2.3.4_x64__example",
  "--cli-path=C:\\Tools\\codex.exe",
]);
assert.equal(
  overrides.suppliedInstallRoot,
  "C:\\Example Root\\OpenAI.Codex_1.2.3.4_x64__example",
);
assert.equal(overrides.suppliedCliPath, "C:\\Tools\\codex.exe");

const unknown = parseArguments(["--definitely-unknown"]);
assert.match(validateArguments(unknown), /Unknown argument/u);

const incompatible = parseArguments(["--check", "--self-test"]);
assert.match(validateArguments(incompatible), /cannot be used together/u);

const currentInstallRoot =
  "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.930.3930.0_x64__2p2nqsd0c76g0";
const oldFormalTarget =
  "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.928.3736.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe";
const shortcutDefaults = {
  appUserModelId: "com.openai.codex",
  currentInstallRoot,
  targetExists: false,
  targetPath: oldFormalTarget,
};

assert.equal(
  formalAppShellTarget({
    PackageFamilyName: "OpenAI.Codex_2p2nqsd0c76g0",
  }),
  "shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App",
);
assert.equal(
  classifyFormalStartMenuShortcut(shortcutDefaults),
  "stale-formal",
);
assert.equal(
  classifyFormalStartMenuShortcut({
    ...shortcutDefaults,
    targetExists: true,
  }),
  "installed-formal",
);
assert.equal(
  classifyFormalStartMenuShortcut({
    ...shortcutDefaults,
    targetPath: `${currentInstallRoot}\\app\\ChatGPT.exe`,
  }),
  "current-formal",
);
assert.equal(
  classifyFormalStartMenuShortcut({
    ...shortcutDefaults,
    targetPath:
      "C:\\Program Files\\WindowsApps\\OpenAI.CodexBeta_26.727.4816.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe",
  }),
  "unrecognized",
);
assert.equal(
  classifyFormalStartMenuShortcut({
    ...shortcutDefaults,
    appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
  }),
  "unrecognized",
);

console.log("CLI argument tests passed.");
