import { describe, expect, it } from "vitest";
// Rebrand contract asserted from source: the Tauri config JSON is imported
// directly, and secrets.rs is pulled in as raw text via Vite's `?raw` loader —
// no Node type dependency needed.
import tauriConf from "../../src-tauri/tauri.conf.json";
import secretsRs from "../../src-tauri/src/secrets.rs?raw";

describe("rebrand: tauri.conf.json", () => {
  it("productName is Ether", () => {
    expect(tauriConf.productName).toBe("Ether");
  });

  it("bundle identifier is com.bryndalski.ether", () => {
    expect(tauriConf.identifier).toBe("com.bryndalski.ether");
  });

  it("window title is Ether", () => {
    expect(tauriConf.app.windows[0].title).toBe("Ether");
  });
});

describe("rebrand: secrets Keychain namespace", () => {
  it("SERVICE points at com.bryndalski.ether", () => {
    expect(secretsRs).toContain('const SERVICE: &str = "com.bryndalski.ether"');
  });
});
