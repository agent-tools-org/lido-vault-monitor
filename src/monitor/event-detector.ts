import { type Address, formatUnits } from "viem";
import {
  type VaultSnapshot,
  type PositionSnapshot,
  type SnapshotStore,
  type PositionTracker,
} from "./position-tracker";
import { type VaultConfig } from "../vaults/config";

// ── Alert types ──────────────────────────────────────────────────────────────

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertKind =
  | "apy_shift"
  | "tvl_change"
  | "position_value_change"
  | "rebalance"
  | "new_position";

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  vaultKey: string;
  depositor?: Address;
  timestamp: number;
  data: Record<string, unknown>;
  message: string;
}

// ── Thresholds ───────────────────────────────────────────────────────────────

export interface DetectorThresholds {
  /** APY shift in percentage points (e.g. 0.5 = 0.5pp) */
  apyShift: number;
  /** TVL change in percent (e.g. 10 = 10%) */
  tvlChange: number;
}

// ── Detector ─────────────────────────────────────────────────────────────────

let alertSeq = 0;
function nextAlertId(): string {
  return `alert-${Date.now()}-${++alertSeq}`;
}

export class EventDetector {
  constructor(
    private store: SnapshotStore,
    private tracker: PositionTracker,
    private thresholds: DetectorThresholds,
  ) {}

  /**
   * Detect all meaningful events for a vault + optional depositor.
   * Returns an array of alerts (may be empty).
   */
  detect(
    vault: VaultConfig,
    vaultSnap: VaultSnapshot,
    positionSnap?: PositionSnapshot,
  ): Alert[] {
    const alerts: Alert[] = [];
    const now = Date.now();

    // ── 1. APY shift ─────────────────────────────────────────────────────
    const currentApy = this.tracker.computeApy(vault.symbol);
    const prevVault = this.store.previousVault(vault.symbol);
    if (currentApy !== null && prevVault) {
      const prevApy = this.computeApyAt(vault.symbol, prevVault);
      if (prevApy !== null) {
        const delta = currentApy - prevApy;
        if (Math.abs(delta) >= this.thresholds.apyShift) {
          const severity: AlertSeverity =
            Math.abs(delta) >= this.thresholds.apyShift * 3 ? "critical" : "warning";
          alerts.push({
            id: nextAlertId(),
            kind: "apy_shift",
            severity,
            vaultKey: vault.symbol,
            timestamp: now,
            data: {
              previousApy: round(prevApy, 2),
              currentApy: round(currentApy, 2),
              deltaApy: round(delta, 2),
            },
            message: `APY shifted from ${round(prevApy, 2)}% to ${round(currentApy, 2)}% (${delta > 0 ? "+" : ""}${round(delta, 2)}pp)`,
          });
        }
      }
    }

    // ── 2. TVL change ────────────────────────────────────────────────────
    if (prevVault && prevVault.tvl > 0n) {
      const tvlDelta = vaultSnap.tvl - prevVault.tvl;
      const pctChange =
        (Number(formatUnits(tvlDelta < 0n ? -tvlDelta : tvlDelta, 18)) /
          Number(formatUnits(prevVault.tvl, 18))) *
        100;

      if (pctChange >= this.thresholds.tvlChange) {
        const direction = tvlDelta > 0n ? "inflow" : "outflow";
        const severity: AlertSeverity = pctChange >= this.thresholds.tvlChange * 3 ? "critical" : "warning";
        alerts.push({
          id: nextAlertId(),
          kind: "tvl_change",
          severity,
          vaultKey: vault.symbol,
          timestamp: now,
          data: {
            previousTvl: formatUnits(prevVault.tvl, vault.decimals),
            currentTvl: formatUnits(vaultSnap.tvl, vault.decimals),
            changePercent: round(pctChange, 2),
            direction,
          },
          message: `TVL ${direction}: ${round(pctChange, 2)}% change (${formatBigNumber(prevVault.tvl, vault.decimals)} → ${formatBigNumber(vaultSnap.tvl, vault.decimals)} ${vault.assetSymbol})`,
        });
      }
    }

    // ── 3. Rebalance detection (share price change without TVL change) ──
    if (prevVault && prevVault.tvl > 0n) {
      const priceChange = Number(vaultSnap.sharePrice - prevVault.sharePrice);
      const pricePct = (Math.abs(priceChange) / Number(prevVault.sharePrice)) * 100;
      const tvlPct =
        (Math.abs(Number(vaultSnap.tvl - prevVault.tvl)) / Number(prevVault.tvl)) * 100;

      // Share price moved noticeably (>0.01%) but TVL barely changed (<1%) → rebalance
      if (pricePct > 0.01 && tvlPct < 1) {
        alerts.push({
          id: nextAlertId(),
          kind: "rebalance",
          severity: "info",
          vaultKey: vault.symbol,
          timestamp: now,
          data: {
            sharePriceChangePct: round(pricePct, 4),
            direction: priceChange > 0 ? "up" : "down",
          },
          message: `Possible rebalance detected: share price ${priceChange > 0 ? "increased" : "decreased"} by ${round(pricePct, 4)}% with minimal TVL movement`,
        });
      }
    }

    // ── 4. Position value change ─────────────────────────────────────────
    if (positionSnap) {
      const prevPos = this.store.previousPosition(
        vault.symbol,
        positionSnap.depositor,
      );

      if (!prevPos) {
        // New position detected
        if (positionSnap.shares > 0n) {
          alerts.push({
            id: nextAlertId(),
            kind: "new_position",
            severity: "info",
            vaultKey: vault.symbol,
            depositor: positionSnap.depositor,
            timestamp: now,
            data: {
              shares: formatUnits(positionSnap.shares, vault.decimals),
              assetValue: formatUnits(positionSnap.assetValue, vault.decimals),
            },
            message: `New position detected: ${formatBigNumber(positionSnap.assetValue, vault.decimals)} ${vault.assetSymbol}`,
          });
        }
      } else if (prevPos.shares > 0n) {
        const valueDelta = positionSnap.assetValue - prevPos.assetValue;
        const pct =
          (Math.abs(Number(formatUnits(valueDelta, vault.decimals))) /
            Number(formatUnits(prevPos.assetValue, vault.decimals))) *
          100;

        if (pct >= 0.01) {
          // meaningful change
          alerts.push({
            id: nextAlertId(),
            kind: "position_value_change",
            severity: pct >= 5 ? "warning" : "info",
            vaultKey: vault.symbol,
            depositor: positionSnap.depositor,
            timestamp: now,
            data: {
              previousValue: formatUnits(prevPos.assetValue, vault.decimals),
              currentValue: formatUnits(positionSnap.assetValue, vault.decimals),
              delta: formatUnits(valueDelta, vault.decimals),
              changePercent: round(pct, 4),
            },
            message: `Position value: ${formatBigNumber(positionSnap.assetValue, vault.decimals)} ${vault.assetSymbol} (${valueDelta >= 0n ? "+" : ""}${formatBigNumber(valueDelta, vault.decimals)} ${vault.assetSymbol})`,
          });
        }
      }
    }

    return alerts;
  }

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * Re-compute APY as of a previous vault snapshot (approximation).
   */
  private computeApyAt(vaultKey: string, snap: VaultSnapshot): number | null {
    const older = this.store.vaultSnapshotAgo(
      vaultKey,
      (Date.now() - snap.timestamp) / 1000 + 86400,
    );
    if (!older || older.timestamp === snap.timestamp) return null;

    const elapsed = (snap.timestamp - older.timestamp) / 1000;
    if (elapsed < 60) return null;

    const priceNow = Number(formatUnits(snap.sharePrice, 18));
    const priceThen = Number(formatUnits(older.sharePrice, 18));
    if (priceThen === 0) return null;

    const rate = priceNow / priceThen - 1;
    return (rate * (365.25 * 86400)) / elapsed * 100;
  }
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function formatBigNumber(value: bigint, decimals: number): string {
  const str = formatUnits(value < 0n ? -value : value, decimals);
  const num = Number(str);
  const prefix = value < 0n ? "-" : "";
  if (Math.abs(num) >= 1_000_000) {
    return `${prefix}${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${prefix}${(num / 1_000).toFixed(2)}K`;
  }
  return `${prefix}${num.toFixed(4)}`;
}
