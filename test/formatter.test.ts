import { describe, it, expect } from "vitest";
import {
  formatConsole,
  formatJsonLine,
  formatWebhook,
  formatAlert,
} from "../src/alerts/formatter";
import type { Alert } from "../src/monitor/event-detector";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseTimestamp = new Date("2025-01-15T12:00:00Z").getTime();

const apyAlert: Alert = {
  id: "alert-1",
  kind: "apy_shift",
  severity: "warning",
  vaultKey: "wstETH",
  timestamp: baseTimestamp,
  data: {
    previousApy: 3.5,
    currentApy: 4.2,
    deltaApy: 0.7,
  },
  message: "APY shifted from 3.5% to 4.2% (+0.7pp)",
};

const tvlAlert: Alert = {
  id: "alert-2",
  kind: "tvl_change",
  severity: "critical",
  vaultKey: "stETH",
  timestamp: baseTimestamp,
  data: {
    changePercent: 35,
    direction: "outflow",
    previousTvl: "1000000.0",
    currentTvl: "650000.0",
  },
  message: "TVL outflow: 35% change",
};

const positionAlert: Alert = {
  id: "alert-3",
  kind: "position_value_change",
  severity: "info",
  vaultKey: "wstETH",
  depositor: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  timestamp: baseTimestamp,
  data: {
    currentValue: "5.23",
    delta: "0.02",
    previousValue: "5.21",
    changePercent: 0.38,
  },
  message: "Position value: 5.23 stETH (+0.02 stETH)",
};

const rebalanceAlert: Alert = {
  id: "alert-4",
  kind: "rebalance",
  severity: "info",
  vaultKey: "stETH",
  timestamp: baseTimestamp,
  data: {
    sharePriceChangePct: 0.05,
    direction: "up",
  },
  message: "Possible rebalance detected",
};

const newPositionAlert: Alert = {
  id: "alert-5",
  kind: "new_position",
  severity: "info",
  vaultKey: "wstETH",
  depositor: "0x1111111111111111111111111111111111111111",
  timestamp: baseTimestamp,
  data: {
    shares: "10.0",
    assetValue: "10.5",
  },
  message: "New position detected: 10.5 stETH",
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("formatConsole", () => {
  it("formats an APY shift alert with severity emoji and label", () => {
    const out = formatConsole(apyAlert);
    expect(out).toContain("⚠️");
    expect(out).toContain("[WARN]");
    expect(out).toContain("wstETH");
    expect(out).toContain("APY has increased from 3.5% to 4.2%");
    expect(out).toContain("0.7 percentage-point shift");
  });

  it("formats a critical TVL alert", () => {
    const out = formatConsole(tvlAlert);
    expect(out).toContain("🚨");
    expect(out).toContain("[CRIT]");
    expect(out).toContain("stETH");
    expect(out).toContain("35%");
    expect(out).toContain("flowed out of");
  });

  it("includes depositor tag when present", () => {
    const out = formatConsole(positionAlert);
    expect(out).toContain("[0xae7a…fE84]");
    expect(out).toContain("wstETH");
    expect(out).toContain("position is now worth");
  });

  it("does not include depositor tag when absent", () => {
    const out = formatConsole(apyAlert);
    // No depositor → no bracket tag besides the severity label
    expect(out).not.toMatch(/\[0x/);
  });

  it("includes ISO timestamp", () => {
    const out = formatConsole(apyAlert);
    expect(out).toContain("2025-01-15T12:00:00.000Z");
  });

  it("formats a rebalance alert with human-readable message", () => {
    const out = formatConsole(rebalanceAlert);
    expect(out).toContain("ℹ️");
    expect(out).toContain("[INFO]");
    expect(out).toContain("rebalanced");
    expect(out).toContain("share price moved up by 0.05%");
  });

  it("formats a new position alert", () => {
    const out = formatConsole(newPositionAlert);
    expect(out).toContain("Tracking started");
    expect(out).toContain("10.5000");
  });
});

describe("formatJsonLine", () => {
  it("returns valid JSON", () => {
    const line = formatJsonLine(apyAlert);
    expect(() => JSON.parse(line)).not.toThrow();
  });

  it("includes all alert fields plus humanMessage", () => {
    const parsed = JSON.parse(formatJsonLine(apyAlert));
    expect(parsed.id).toBe("alert-1");
    expect(parsed.kind).toBe("apy_shift");
    expect(parsed.severity).toBe("warning");
    expect(parsed.vaultKey).toBe("wstETH");
    expect(parsed.timestamp).toBe(baseTimestamp);
    expect(parsed.data).toEqual(apyAlert.data);
    expect(parsed.humanMessage).toContain("APY has increased");
  });

  it("includes depositor when present", () => {
    const parsed = JSON.parse(formatJsonLine(positionAlert));
    expect(parsed.depositor).toBe("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84");
  });
});

describe("formatWebhook", () => {
  it("returns an object with expected shape", () => {
    const payload = formatWebhook(apyAlert);
    expect(payload).toHaveProperty("id", "alert-1");
    expect(payload).toHaveProperty("severity", "warning");
    expect(payload).toHaveProperty("vault", "wstETH");
    expect(payload).toHaveProperty("depositor", null);
    expect(payload).toHaveProperty("kind", "apy_shift");
    expect(payload).toHaveProperty("summary");
    expect(payload).toHaveProperty("data");
    expect((payload as any).summary).toContain("APY has increased");
  });

  it("converts timestamp to ISO string", () => {
    const payload = formatWebhook(apyAlert) as any;
    expect(payload.timestamp).toBe("2025-01-15T12:00:00.000Z");
  });

  it("includes depositor when present", () => {
    const payload = formatWebhook(positionAlert) as any;
    expect(payload.depositor).toBe("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84");
  });
});

describe("formatAlert", () => {
  it("delegates to console formatter", () => {
    const out = formatAlert(apyAlert, "console");
    expect(out).toContain("[WARN]");
    expect(out).toContain("APY has increased");
  });

  it("delegates to json formatter", () => {
    const out = formatAlert(apyAlert, "json");
    const parsed = JSON.parse(out);
    expect(parsed.kind).toBe("apy_shift");
  });

  it("delegates to webhook formatter (returns JSON string)", () => {
    const out = formatAlert(apyAlert, "webhook");
    const parsed = JSON.parse(out);
    expect(parsed.vault).toBe("wstETH");
    expect(parsed.summary).toContain("APY has increased");
  });
});
