import { describe, it, expect, beforeEach } from "vitest";
import { parseUnits } from "viem";
import { EventDetector, type Alert, type DetectorThresholds } from "../src/monitor/event-detector";
import {
  SnapshotStore,
  PositionTracker,
  type VaultSnapshot,
  type PositionSnapshot,
} from "../src/monitor/position-tracker";
import { type VaultConfig } from "../src/vaults/config";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ONE = 10n ** 18n;

const mockVault: VaultConfig = {
  name: "Mock Vault",
  symbol: "mockVault",
  address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  type: "steth",
  decimals: 18,
  assetSymbol: "ETH",
  abi: [],
};

function makeVaultSnap(overrides: Partial<VaultSnapshot> = {}): VaultSnapshot {
  return {
    vaultKey: mockVault.symbol,
    timestamp: Date.now(),
    tvl: parseUnits("1000000", 18),
    sharePrice: ONE,
    ...overrides,
  };
}

function makePositionSnap(overrides: Partial<PositionSnapshot> = {}): PositionSnapshot {
  return {
    vaultKey: mockVault.symbol,
    depositor: "0x1111111111111111111111111111111111111111",
    timestamp: Date.now(),
    shares: parseUnits("100", 18),
    assetValue: parseUnits("100", 18),
    ...overrides,
  };
}

/**
 * Build a store + tracker + detector with seeded history for APY calculation.
 * Pushes two vault snapshots separated by `windowMs` with the given share prices.
 */
function buildDetector(
  thresholds: DetectorThresholds,
  seedSnapshots?: { prev?: Partial<VaultSnapshot>; current?: Partial<VaultSnapshot> },
) {
  const store = new SnapshotStore();
  // We create a fake PositionTracker whose client is never called (offline).
  const tracker = new PositionTracker(null as any, store);
  const detector = new EventDetector(store, tracker, thresholds);

  if (seedSnapshots) {
    const now = Date.now();
    const windowMs = 86_400_000; // 1 day

    const prevSnap = makeVaultSnap({
      timestamp: now - windowMs,
      ...seedSnapshots.prev,
    });
    store.pushVault(prevSnap);

    const currentSnap = makeVaultSnap({
      timestamp: now,
      ...seedSnapshots.current,
    });
    store.pushVault(currentSnap);
  }

  return { store, tracker, detector };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("EventDetector", () => {
  describe("APY shift detection", () => {
    it("generates a warning alert when APY shifts above threshold", () => {
      // Previous share price = 1.0 ETH, current share price = 1.001 ETH
      // over 1 day → APY ~36.5%
      // Then shift: previous APY to current APY differs significantly.
      // We need 3 snapshots for the detector to compare "previous APY" vs "current APY":
      // snap0 (oldest), snap1 (previous), snap2 (current)
      const store = new SnapshotStore();
      const tracker = new PositionTracker(null as any, store);
      const detector = new EventDetector(store, tracker, {
        apyShift: 0.5,
        tvlChange: 10,
      });

      const now = Date.now();
      const dayMs = 86_400_000;

      // snap0: 2 days ago, sharePrice = 1.0
      store.pushVault(makeVaultSnap({
        timestamp: now - 2 * dayMs,
        sharePrice: ONE,
      }));

      // snap1: 1 day ago, sharePrice = 1.0001 (small growth)
      store.pushVault(makeVaultSnap({
        timestamp: now - dayMs,
        sharePrice: ONE + parseUnits("0.0001", 18),
      }));

      // snap2: now, sharePrice = 1.001 (larger growth from snap1)
      const currentSnap = makeVaultSnap({
        timestamp: now,
        sharePrice: ONE + parseUnits("0.001", 18),
      });
      store.pushVault(currentSnap);

      const alerts = detector.detect(mockVault, currentSnap);
      const apyAlerts = alerts.filter((a) => a.kind === "apy_shift");

      expect(apyAlerts.length).toBeGreaterThanOrEqual(1);
      expect(apyAlerts[0].severity).toMatch(/warning|critical/);
      expect(apyAlerts[0].message).toContain("APY shifted");
      expect(apyAlerts[0].data).toHaveProperty("previousApy");
      expect(apyAlerts[0].data).toHaveProperty("currentApy");
      expect(apyAlerts[0].data).toHaveProperty("deltaApy");
    });

    it("does not alert when APY shift is below threshold", () => {
      const store = new SnapshotStore();
      const tracker = new PositionTracker(null as any, store);
      const detector = new EventDetector(store, tracker, {
        apyShift: 100, // very high threshold
        tvlChange: 100,
      });

      const now = Date.now();
      const dayMs = 86_400_000;

      store.pushVault(makeVaultSnap({ timestamp: now - 2 * dayMs, sharePrice: ONE }));
      store.pushVault(makeVaultSnap({
        timestamp: now - dayMs,
        sharePrice: ONE + parseUnits("0.0001", 18),
      }));
      const currentSnap = makeVaultSnap({
        timestamp: now,
        sharePrice: ONE + parseUnits("0.0002", 18),
      });
      store.pushVault(currentSnap);

      const alerts = detector.detect(mockVault, currentSnap);
      const apyAlerts = alerts.filter((a) => a.kind === "apy_shift");
      expect(apyAlerts).toHaveLength(0);
    });
  });

  describe("TVL change detection", () => {
    it("generates a warning alert on large TVL inflow", () => {
      const prevTvl = parseUnits("1000000", 18);
      const currentTvl = parseUnits("1150000", 18); // +15%

      const { store, detector } = buildDetector(
        { apyShift: 100, tvlChange: 10 },
        { prev: { tvl: prevTvl }, current: { tvl: currentTvl } },
      );

      const currentSnap = store.latestVault(mockVault.symbol)!;
      const alerts = detector.detect(mockVault, currentSnap);
      const tvlAlerts = alerts.filter((a) => a.kind === "tvl_change");

      expect(tvlAlerts).toHaveLength(1);
      expect(tvlAlerts[0].severity).toBe("warning");
      expect(tvlAlerts[0].message).toContain("inflow");
      expect(tvlAlerts[0].data.direction).toBe("inflow");
    });

    it("generates a warning alert on large TVL outflow", () => {
      const prevTvl = parseUnits("1000000", 18);
      const currentTvl = parseUnits("800000", 18); // -20%

      const { store, detector } = buildDetector(
        { apyShift: 100, tvlChange: 10 },
        { prev: { tvl: prevTvl }, current: { tvl: currentTvl } },
      );

      const currentSnap = store.latestVault(mockVault.symbol)!;
      const alerts = detector.detect(mockVault, currentSnap);
      const tvlAlerts = alerts.filter((a) => a.kind === "tvl_change");

      expect(tvlAlerts).toHaveLength(1);
      expect(tvlAlerts[0].severity).toBe("warning");
      expect(tvlAlerts[0].message).toContain("outflow");
      expect(tvlAlerts[0].data.direction).toBe("outflow");
    });

    it("generates a critical alert when TVL change exceeds 3x threshold", () => {
      const prevTvl = parseUnits("1000000", 18);
      const currentTvl = parseUnits("600000", 18); // -40%, threshold=10 → 3x=30

      const { store, detector } = buildDetector(
        { apyShift: 100, tvlChange: 10 },
        { prev: { tvl: prevTvl }, current: { tvl: currentTvl } },
      );

      const currentSnap = store.latestVault(mockVault.symbol)!;
      const alerts = detector.detect(mockVault, currentSnap);
      const tvlAlerts = alerts.filter((a) => a.kind === "tvl_change");

      expect(tvlAlerts).toHaveLength(1);
      expect(tvlAlerts[0].severity).toBe("critical");
    });

    it("does not alert when TVL change is below threshold", () => {
      const prevTvl = parseUnits("1000000", 18);
      const currentTvl = parseUnits("1050000", 18); // +5% < 10%

      const { store, detector } = buildDetector(
        { apyShift: 100, tvlChange: 10 },
        { prev: { tvl: prevTvl }, current: { tvl: currentTvl } },
      );

      const currentSnap = store.latestVault(mockVault.symbol)!;
      const alerts = detector.detect(mockVault, currentSnap);
      const tvlAlerts = alerts.filter((a) => a.kind === "tvl_change");

      expect(tvlAlerts).toHaveLength(0);
    });
  });

  describe("rebalance detection", () => {
    it("detects a rebalance when share price moves but TVL is stable", () => {
      const tvl = parseUnits("1000000", 18);
      const prevSharePrice = ONE;
      const currentSharePrice = ONE + parseUnits("0.001", 18); // 0.1% change

      const { store, detector } = buildDetector(
        { apyShift: 100, tvlChange: 100 },
        {
          prev: { tvl, sharePrice: prevSharePrice },
          current: { tvl, sharePrice: currentSharePrice },
        },
      );

      const currentSnap = store.latestVault(mockVault.symbol)!;
      const alerts = detector.detect(mockVault, currentSnap);
      const rebalanceAlerts = alerts.filter((a) => a.kind === "rebalance");

      expect(rebalanceAlerts).toHaveLength(1);
      expect(rebalanceAlerts[0].severity).toBe("info");
      expect(rebalanceAlerts[0].message).toContain("rebalance");
    });
  });

  describe("position tracking", () => {
    it("detects a new position", () => {
      const { store, detector } = buildDetector(
        { apyShift: 100, tvlChange: 100 },
      );

      const vaultSnap = makeVaultSnap();
      store.pushVault(vaultSnap);

      const posSnap = makePositionSnap({
        shares: parseUnits("50", 18),
        assetValue: parseUnits("50", 18),
      });

      const alerts = detector.detect(mockVault, vaultSnap, posSnap);
      const newPosAlerts = alerts.filter((a) => a.kind === "new_position");

      expect(newPosAlerts).toHaveLength(1);
      expect(newPosAlerts[0].severity).toBe("info");
      expect(newPosAlerts[0].message).toContain("New position detected");
      expect(newPosAlerts[0].depositor).toBe(posSnap.depositor);
    });

    it("detects a position value change", () => {
      const store = new SnapshotStore();
      const tracker = new PositionTracker(null as any, store);
      const detector = new EventDetector(store, tracker, {
        apyShift: 100,
        tvlChange: 100,
      });

      const depositor = "0x1111111111111111111111111111111111111111" as const;

      // Previous position
      store.pushPosition({
        vaultKey: mockVault.symbol,
        depositor,
        timestamp: Date.now() - 60_000,
        shares: parseUnits("100", 18),
        assetValue: parseUnits("100", 18),
      });

      // Current position (value increased by 5%)
      const posSnap: PositionSnapshot = {
        vaultKey: mockVault.symbol,
        depositor,
        timestamp: Date.now(),
        shares: parseUnits("100", 18),
        assetValue: parseUnits("105", 18),
      };
      store.pushPosition(posSnap);

      const vaultSnap = makeVaultSnap();
      store.pushVault(vaultSnap);

      const alerts = detector.detect(mockVault, vaultSnap, posSnap);
      const valueAlerts = alerts.filter((a) => a.kind === "position_value_change");

      expect(valueAlerts).toHaveLength(1);
      expect(valueAlerts[0].severity).toBe("warning"); // 5% >= 5%
      expect(valueAlerts[0].message).toContain("Position value");
    });
  });

  describe("alert structure", () => {
    it("alerts have required fields", () => {
      const { store, detector } = buildDetector(
        { apyShift: 100, tvlChange: 10 },
        {
          prev: { tvl: parseUnits("1000000", 18) },
          current: { tvl: parseUnits("1200000", 18) },
        },
      );

      const currentSnap = store.latestVault(mockVault.symbol)!;
      const alerts = detector.detect(mockVault, currentSnap);

      expect(alerts.length).toBeGreaterThan(0);
      for (const alert of alerts) {
        expect(alert).toHaveProperty("id");
        expect(alert).toHaveProperty("kind");
        expect(alert).toHaveProperty("severity");
        expect(alert).toHaveProperty("vaultKey");
        expect(alert).toHaveProperty("timestamp");
        expect(alert).toHaveProperty("data");
        expect(alert).toHaveProperty("message");
        expect(alert.id).toMatch(/^alert-/);
        expect(typeof alert.timestamp).toBe("number");
      }
    });
  });
});
