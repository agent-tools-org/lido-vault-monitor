import { createPublicClient, http, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

import { type AppConfig } from "../config";
import { VAULTS, type VaultConfig } from "../vaults/config";
import { PositionTracker, SnapshotStore } from "../monitor/position-tracker";
import { EventDetector, type Alert } from "../monitor/event-detector";
import { formatConsole, formatJsonLine } from "../alerts/formatter";

export class MonitorAgent {
  private client;
  private store: SnapshotStore;
  private tracker: PositionTracker;
  private detector: EventDetector;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private pollCount = 0;
  private logStream: fs.WriteStream | null = null;

  constructor(private config: AppConfig) {
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(config.rpcUrl),
    });

    this.store = new SnapshotStore();
    this.tracker = new PositionTracker(this.client, this.store);
    this.detector = new EventDetector(this.store, this.tracker, {
      apyShift: config.apyShiftThreshold,
      tvlChange: config.tvlChangeThreshold,
    });

    // Ensure log directory exists
    const logDir = path.dirname(config.alertLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logStream = fs.createWriteStream(config.alertLogPath, { flags: "a" });
  }

  /**
   * Start the monitoring loop.
   */
  async start(): Promise<void> {
    this.running = true;
    console.log("🔍 Lido Vault Position Monitor starting…");
    console.log(`   Vaults: ${Object.keys(VAULTS).join(", ")}`);
    console.log(`   Depositors: ${this.config.depositors.length > 0 ? this.config.depositors.join(", ") : "(none — vault-level only)"}`);
    console.log(`   Poll interval: ${this.config.pollIntervalMs / 1000}s`);
    console.log(`   APY threshold: ${this.config.apyShiftThreshold}pp | TVL threshold: ${this.config.tvlChangeThreshold}%`);
    console.log("");

    // Initial poll
    await this.poll();

    // Schedule subsequent polls
    this.scheduleNext();
  }

  /**
   * Graceful shutdown.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
    console.log("\n🛑 Monitor stopped.");
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.poll();
      this.scheduleNext();
    }, this.config.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    this.pollCount++;
    const vaults = Object.values(VAULTS);

    for (const vault of vaults) {
      try {
        await this.pollVault(vault);
      } catch (err) {
        console.error(`❌ Error polling ${vault.symbol}:`, (err as Error).message);
      }
    }
  }

  private async pollVault(vault: VaultConfig): Promise<void> {
    // 1. Snapshot vault
    const vaultSnap = await this.tracker.snapshotVault(vault);

    if (this.pollCount === 1) {
      console.log(
        `📊 ${vault.symbol} — TVL: ${formatBig(vaultSnap.tvl, vault.decimals)} ${vault.assetSymbol} | Share price: ${formatBig(vaultSnap.sharePrice, 18)}`,
      );
    }

    // 2. For each depositor, snapshot position + detect events
    const allAlerts: Alert[] = [];

    // Vault-level events (no depositor)
    const vaultAlerts = this.detector.detect(vault, vaultSnap);
    allAlerts.push(...vaultAlerts);

    for (const depositor of this.config.depositors) {
      try {
        const posSnap = await this.tracker.snapshotPosition(vault, depositor, vaultSnap);
        const posAlerts = this.detector.detect(vault, vaultSnap, posSnap);
        allAlerts.push(...posAlerts);

        if (this.pollCount === 1 && posSnap.shares > 0n) {
          console.log(
            `   👤 ${depositor.slice(0, 8)}… — ${formatBig(posSnap.assetValue, vault.decimals)} ${vault.assetSymbol}`,
          );
        }
      } catch (err) {
        console.error(
          `   ❌ Error reading position for ${depositor.slice(0, 8)}… in ${vault.symbol}:`,
          (err as Error).message,
        );
      }
    }

    // 3. Output alerts
    for (const alert of allAlerts) {
      console.log(formatConsole(alert));
      this.writeLog(alert);
    }
  }

  private writeLog(alert: Alert): void {
    if (this.logStream) {
      this.logStream.write(formatJsonLine(alert) + "\n");
    }
  }
}

// ── helper ───────────────────────────────────────────────────────────────────

function formatBig(value: bigint, decimals: number): string {
  const num = Number(formatUnits(value, decimals));
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(4);
}
