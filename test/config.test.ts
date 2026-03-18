import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AppConfig } from "../src/config";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads config with required ETH_RPC_URL", async () => {
    process.env.ETH_RPC_URL = "https://rpc.example.com";
    process.env.DEPOSITOR_ADDRESSES = "";

    const { loadConfig } = await import("../src/config");
    const cfg: AppConfig = loadConfig();

    expect(cfg.rpcUrl).toBe("https://rpc.example.com");
    expect(cfg.pollIntervalMs).toBe(300_000);
    expect(cfg.apyShiftThreshold).toBe(0.5);
    expect(cfg.tvlChangeThreshold).toBe(10);
    expect(cfg.alertLogPath).toBe("logs/alerts.jsonl");
  });

  it("throws when ETH_RPC_URL is missing", async () => {
    delete process.env.ETH_RPC_URL;

    const { loadConfig } = await import("../src/config");
    expect(() => loadConfig()).toThrow("Missing required environment variable: ETH_RPC_URL");
  });

  it("parses DEPOSITOR_ADDRESSES into Address[]", async () => {
    process.env.ETH_RPC_URL = "https://rpc.example.com";
    process.env.DEPOSITOR_ADDRESSES =
      "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84, 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

    const { loadConfig } = await import("../src/config");
    const cfg = loadConfig();

    expect(cfg.depositors).toHaveLength(2);
    expect(cfg.depositors[0]).toBe("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84");
    expect(cfg.depositors[1]).toBe("0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0");
  });

  it("filters out invalid addresses", async () => {
    process.env.ETH_RPC_URL = "https://rpc.example.com";
    process.env.DEPOSITOR_ADDRESSES = "not-an-address, 0xshort, 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";

    const { loadConfig } = await import("../src/config");
    const cfg = loadConfig();

    expect(cfg.depositors).toHaveLength(1);
    expect(cfg.depositors[0]).toBe("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84");
  });

  it("uses custom thresholds from env", async () => {
    process.env.ETH_RPC_URL = "https://rpc.example.com";
    process.env.APY_SHIFT_THRESHOLD = "1.5";
    process.env.TVL_CHANGE_THRESHOLD = "25";
    process.env.POLL_INTERVAL_SECONDS = "60";

    const { loadConfig } = await import("../src/config");
    const cfg = loadConfig();

    expect(cfg.apyShiftThreshold).toBe(1.5);
    expect(cfg.tvlChangeThreshold).toBe(25);
    expect(cfg.pollIntervalMs).toBe(60_000);
  });

  it("falls back to defaults for non-numeric thresholds", async () => {
    process.env.ETH_RPC_URL = "https://rpc.example.com";
    process.env.APY_SHIFT_THRESHOLD = "abc";
    process.env.TVL_CHANGE_THRESHOLD = "xyz";
    process.env.POLL_INTERVAL_SECONDS = "not-a-number";

    const { loadConfig } = await import("../src/config");
    const cfg = loadConfig();

    expect(cfg.apyShiftThreshold).toBe(0.5);
    expect(cfg.tvlChangeThreshold).toBe(10);
    expect(cfg.pollIntervalMs).toBe(300_000);
  });

  it("exports AppConfig type and loadConfig function", async () => {
    process.env.ETH_RPC_URL = "https://rpc.example.com";

    const mod = await import("../src/config");
    expect(typeof mod.loadConfig).toBe("function");
  });
});
