import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { compileSolidity, compileVaultAlertLog, CompileResult } from "../src/compile";

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts");
const ARTIFACT_FILE = path.join(ARTIFACTS_DIR, "VaultAlertLog.json");

describe("compile", () => {
  // Clean up artifacts produced during tests
  afterAll(() => {
    if (fs.existsSync(ARTIFACT_FILE)) {
      fs.unlinkSync(ARTIFACT_FILE);
    }
    if (fs.existsSync(ARTIFACTS_DIR)) {
      try { fs.rmdirSync(ARTIFACTS_DIR); } catch { /* dir may not be empty */ }
    }
  });

  it("compileSolidity compiles valid source and returns abi + bytecode", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "contracts", "VaultAlertLog.sol"),
      "utf-8",
    );
    const result: CompileResult = compileSolidity(source, "VaultAlertLog");

    expect(result.abi).toBeDefined();
    expect(Array.isArray(result.abi)).toBe(true);
    expect(result.abi.length).toBeGreaterThan(0);
    expect(result.bytecode).toBeDefined();
    expect(result.bytecode.startsWith("0x")).toBe(true);
    expect(result.bytecode.length).toBeGreaterThan(2);
  });

  it("compileSolidity throws on invalid Solidity source", () => {
    const badSource = "this is not valid solidity";
    expect(() => compileSolidity(badSource, "Nope")).toThrow();
  });

  it("compileVaultAlertLog writes artifact file with correct shape", () => {
    const result = compileVaultAlertLog(ROOT);

    expect(fs.existsSync(ARTIFACT_FILE)).toBe(true);

    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_FILE, "utf-8"));
    expect(artifact).toHaveProperty("abi");
    expect(artifact).toHaveProperty("bytecode");
    expect(artifact.abi).toEqual(result.abi);
    expect(artifact.bytecode).toBe(result.bytecode);
  });

  it("ABI contains expected function signatures", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "contracts", "VaultAlertLog.sol"),
      "utf-8",
    );
    const result = compileSolidity(source, "VaultAlertLog");
    const fnNames = result.abi
      .filter((e: any) => e.type === "function")
      .map((e: any) => e.name);

    expect(fnNames).toContain("logAlert");
    expect(fnNames).toContain("getAlertCount");
    expect(fnNames).toContain("getAlert");
    expect(fnNames).toContain("getCriticalAlertCount");
    expect(fnNames).toContain("addReporter");
    expect(fnNames).toContain("owner");
    expect(fnNames).toContain("reporters");
  });

  it("ABI contains AlertLogged event", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "contracts", "VaultAlertLog.sol"),
      "utf-8",
    );
    const result = compileSolidity(source, "VaultAlertLog");
    const events = result.abi
      .filter((e: any) => e.type === "event")
      .map((e: any) => e.name);

    expect(events).toContain("AlertLogged");
  });
});
