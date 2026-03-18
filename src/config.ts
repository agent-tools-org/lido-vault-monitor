import "dotenv/config";
import { type Address } from "viem";

function envOrDefault(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envRequired(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

export interface AppConfig {
  /** Ethereum JSON-RPC endpoint */
  rpcUrl: string;
  /** Depositor addresses to watch */
  depositors: Address[];
  /** Poll interval in milliseconds */
  pollIntervalMs: number;
  /** APY shift threshold in percentage points (e.g. 0.5 = 0.5%) */
  apyShiftThreshold: number;
  /** TVL change threshold in percentage (e.g. 10 = 10%) */
  tvlChangeThreshold: number;
  /** Path to the alert log file */
  alertLogPath: string;
}

export function loadConfig(): AppConfig {
  const rpcUrl = envRequired("ETH_RPC_URL");

  const rawDepositors = envOrDefault("DEPOSITOR_ADDRESSES", "");
  const depositors: Address[] = rawDepositors
    .split(",")
    .map((a) => a.trim())
    .filter((a): a is Address => a.startsWith("0x") && a.length === 42);

  if (depositors.length === 0) {
    console.warn(
      "⚠  No valid DEPOSITOR_ADDRESSES configured — the monitor will track vault-level metrics only.",
    );
  }

  const pollIntervalSec = Number(envOrDefault("POLL_INTERVAL_SECONDS", "300"));
  const pollIntervalMs = (Number.isFinite(pollIntervalSec) ? pollIntervalSec : 300) * 1000;

  const apyShiftThreshold = Number(envOrDefault("APY_SHIFT_THRESHOLD", "0.5"));
  const tvlChangeThreshold = Number(envOrDefault("TVL_CHANGE_THRESHOLD", "10"));

  return {
    rpcUrl,
    depositors,
    pollIntervalMs,
    apyShiftThreshold: Number.isFinite(apyShiftThreshold) ? apyShiftThreshold : 0.5,
    tvlChangeThreshold: Number.isFinite(tvlChangeThreshold) ? tvlChangeThreshold : 10,
    alertLogPath: "logs/alerts.jsonl",
  };
}
