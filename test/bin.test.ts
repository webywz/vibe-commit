import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("CLI bin", () => {
  it("runs when argv[1] is a symlink to dist/cli.js (npm .bin / npx)", () => {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });

    const cli = join(root, "dist", "cli.js");
    const dir = join(tmpdir(), `vibe-commit-bin-symlink-${process.pid}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const link = join(dir, "vibe-commit");
    try {
      symlinkSync(cli, link);
      const out = execFileSync(process.execPath, [link, "-v"], {
        encoding: "utf8",
      });
      assert.match(out.trim(), /vibe-commit\s+0.1.8/);
      assert.notEqual(out.trim(), "");

      const help = execFileSync(process.execPath, [link, "--help"], {
        encoding: "utf8",
      });
      assert.match(help, /vibe-commit/);
      assert.ok(help.trim().length > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
