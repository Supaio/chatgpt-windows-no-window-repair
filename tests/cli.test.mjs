import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
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

console.log("CLI argument tests passed.");
