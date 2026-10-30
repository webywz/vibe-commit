import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadProjectConfig, resolveLocale, resolveVibe } from "../src/config.ts";

describe("loadProjectConfig", () => {
  it("returns undefined when no config files exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      const config = loadProjectConfig(tmpDir);
      assert.equal(config, undefined);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("loads from .vibe-commit.json", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ locale: "zh", vibe: "terse" }),
      );
      const config = loadProjectConfig(tmpDir);
      assert.deepEqual(config, { locale: "zh", vibe: "terse" });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("loads from package.json vibeCommit field", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, "package.json"),
        JSON.stringify({
          name: "test-package",
          vibeCommit: { locale: "zh", vibe: "playful" },
        }),
      );
      const config = loadProjectConfig(tmpDir);
      assert.deepEqual(config, { locale: "zh", vibe: "playful" });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("prefers .vibe-commit.json over package.json", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ locale: "en", vibe: "terse" }),
      );
      writeFileSync(
        join(tmpDir, "package.json"),
        JSON.stringify({
          name: "test-package",
          vibeCommit: { locale: "zh", vibe: "playful" },
        }),
      );
      const config = loadProjectConfig(tmpDir);
      assert.deepEqual(config, { locale: "en", vibe: "terse" });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ignores invalid locale values", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ locale: "fr", vibe: "pro" }),
      );
      const config = loadProjectConfig(tmpDir);
      assert.deepEqual(config, { vibe: "pro" });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ignores invalid vibe values", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ locale: "zh", vibe: "loud" }),
      );
      const config = loadProjectConfig(tmpDir);
      assert.deepEqual(config, { locale: "zh" });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty config for malformed JSON", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(join(tmpDir, ".vibe-commit.json"), "{invalid json");
      const config = loadProjectConfig(tmpDir);
      assert.equal(config, undefined);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("accepts partial configs", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ locale: "zh" }),
      );
      const config = loadProjectConfig(tmpDir);
      assert.deepEqual(config, { locale: "zh" });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("resolveLocale", () => {
  it("uses env variable when set", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ locale: "zh" }),
      );
      const locale = resolveLocale({ VIBE_COMMIT_LOCALE: "en" }, tmpDir);
      assert.equal(locale, "en");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses project config when env not set", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ locale: "zh" }),
      );
      const locale = resolveLocale({}, tmpDir);
      assert.equal(locale, "zh");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses default when neither env nor project set", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      const locale = resolveLocale({}, tmpDir);
      assert.equal(locale, "en");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ignores invalid env value and falls back to project config", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ locale: "zh" }),
      );
      const locale = resolveLocale({ VIBE_COMMIT_LOCALE: "fr" }, tmpDir);
      assert.equal(locale, "zh");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ignores empty env value and uses project config", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ locale: "zh" }),
      );
      const locale = resolveLocale({ VIBE_COMMIT_LOCALE: "  " }, tmpDir);
      assert.equal(locale, "zh");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("resolveVibe", () => {
  it("uses env variable when set (VIBE_COMMIT_VIBE)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ vibe: "playful" }),
      );
      const vibe = resolveVibe({ VIBE_COMMIT_VIBE: "terse" }, tmpDir);
      assert.equal(vibe, "terse");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses env variable when set (VIBE fallback)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ vibe: "playful" }),
      );
      const vibe = resolveVibe({ VIBE: "terse" }, tmpDir);
      assert.equal(vibe, "terse");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("prefers VIBE_COMMIT_VIBE over VIBE", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      const vibe = resolveVibe({ VIBE: "playful", VIBE_COMMIT_VIBE: "terse" }, tmpDir);
      assert.equal(vibe, "terse");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses project config when env not set", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ vibe: "playful" }),
      );
      const vibe = resolveVibe({}, tmpDir);
      assert.equal(vibe, "playful");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses default when neither env nor project set", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      const vibe = resolveVibe({}, tmpDir);
      assert.equal(vibe, "pro");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ignores invalid env value and falls back to project config", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vibe-commit-test-"));
    try {
      writeFileSync(
        join(tmpDir, ".vibe-commit.json"),
        JSON.stringify({ vibe: "playful" }),
      );
      const vibe = resolveVibe({ VIBE_COMMIT_VIBE: "invalid" }, tmpDir);
      assert.equal(vibe, "playful");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
