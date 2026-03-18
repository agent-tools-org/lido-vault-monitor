import {
  type Address,
  type PublicClient,
  formatUnits,
} from "viem";
import { type VaultConfig } from "../vaults/config";

// ── Snapshot types ───────────────────────────────────────────────────────────

export interface VaultSnapshot {
  vaultKey: string;
  timestamp: number;
  /** Total value locked in asset terms (e.g. ETH for stETH vault) */
  tvl: bigint;
  /** Price of 1 share in asset units (1e18 fixed point) */
  sharePrice: bigint;
}

export interface PositionSnapshot {
  vaultKey: string;
  depositor: Address;
  timestamp: number;
  /** Share balance of the depositor */
  shares: bigint;
  /** Position value in asset terms */
  assetValue: bigint;
}

// ── In-memory history store ──────────────────────────────────────────────────

export class SnapshotStore {
  private vaultHistory: Map<string, VaultSnapshot[]> = new Map();
  private positionHistory: Map<string, PositionSnapshot[]> = new Map();
  /** max snapshots per key */
  private maxSnapshots: number;

  constructor(maxSnapshots = 288) {
    // 288 = 24h at 5-min intervals
    this.maxSnapshots = maxSnapshots;
  }

  pushVault(snap: VaultSnapshot): void {
    const arr = this.vaultHistory.get(snap.vaultKey) ?? [];
    arr.push(snap);
    if (arr.length > this.maxSnapshots) arr.shift();
    this.vaultHistory.set(snap.vaultKey, arr);
  }

  pushPosition(snap: PositionSnapshot): void {
    const key = `${snap.vaultKey}:${snap.depositor}`;
    const arr = this.positionHistory.get(key) ?? [];
    arr.push(snap);
    if (arr.length > this.maxSnapshots) arr.shift();
    this.positionHistory.set(key, arr);
  }

  latestVault(vaultKey: string): VaultSnapshot | undefined {
    const arr = this.vaultHistory.get(vaultKey);
    return arr?.[arr.length - 1];
  }

  previousVault(vaultKey: string): VaultSnapshot | undefined {
    const arr = this.vaultHistory.get(vaultKey);
    if (!arr || arr.length < 2) return undefined;
    return arr[arr.length - 2];
  }

  latestPosition(vaultKey: string, depositor: Address): PositionSnapshot | undefined {
    const arr = this.positionHistory.get(`${vaultKey}:${depositor}`);
    return arr?.[arr.length - 1];
  }

  previousPosition(vaultKey: string, depositor: Address): PositionSnapshot | undefined {
    const arr = this.positionHistory.get(`${vaultKey}:${depositor}`);
    if (!arr || arr.length < 2) return undefined;
    return arr[arr.length - 2];
  }

  /**
   * Return the vault snapshot closest to `ageSec` seconds ago.
   * Used for APY calculation over a window.
   */
  vaultSnapshotAgo(vaultKey: string, ageSec: number): VaultSnapshot | undefined {
    const arr = this.vaultHistory.get(vaultKey);
    if (!arr || arr.length === 0) return undefined;
    const target = Date.now() - ageSec * 1000;
    let best = arr[0];
    for (const snap of arr) {
      if (Math.abs(snap.timestamp - target) < Math.abs(best.timestamp - target)) {
        best = snap;
      }
    }
    return best;
  }
}

// ── Position tracker ─────────────────────────────────────────────────────────

const ONE = 10n ** 18n;

export class PositionTracker {
  constructor(
    private client: PublicClient,
    private store: SnapshotStore,
  ) {}

  /**
   * Fetch a fresh vault-level snapshot (TVL + share price).
   */
  async snapshotVault(vault: VaultConfig): Promise<VaultSnapshot> {
    const now = Date.now();
    let tvl: bigint;
    let sharePrice: bigint;

    if (vault.type === "steth") {
      // stETH: TVL = getTotalPooledEther, sharePrice = pooledEth / shares (per 1e18 shares)
      const [totalPooled, totalShares] = await Promise.all([
        this.client.readContract({
          address: vault.address,
          abi: vault.abi,
          functionName: "getTotalPooledEther",
        }) as Promise<bigint>,
        this.client.readContract({
          address: vault.address,
          abi: vault.abi,
          functionName: "getTotalShares",
        }) as Promise<bigint>,
      ]);
      tvl = totalPooled;
      sharePrice = totalShares > 0n ? (totalPooled * ONE) / totalShares : ONE;
    } else if (vault.type === "wsteth") {
      // wstETH: sharePrice = stEthPerToken, TVL = totalSupply * sharePrice / 1e18
      const [stEthPerToken, totalSupply] = await Promise.all([
        this.client.readContract({
          address: vault.address,
          abi: vault.abi,
          functionName: "stEthPerToken",
        }) as Promise<bigint>,
        this.client.readContract({
          address: vault.address,
          abi: vault.abi,
          functionName: "totalSupply",
        }) as Promise<bigint>,
      ]);
      sharePrice = stEthPerToken;
      tvl = (totalSupply * stEthPerToken) / ONE;
    } else {
      // ERC-4626 standard
      const [totalAssets, convertResult] = await Promise.all([
        this.client.readContract({
          address: vault.address,
          abi: vault.abi,
          functionName: "totalAssets",
        }) as Promise<bigint>,
        this.client.readContract({
          address: vault.address,
          abi: vault.abi,
          functionName: "convertToAssets",
          args: [ONE],
        }) as Promise<bigint>,
      ]);
      tvl = totalAssets;
      sharePrice = convertResult;
    }

    const snap: VaultSnapshot = {
      vaultKey: vault.symbol,
      timestamp: now,
      tvl,
      sharePrice,
    };
    this.store.pushVault(snap);
    return snap;
  }

  /**
   * Fetch a depositor's position in a vault.
   */
  async snapshotPosition(
    vault: VaultConfig,
    depositor: Address,
    vaultSnap: VaultSnapshot,
  ): Promise<PositionSnapshot> {
    let shares: bigint;

    if (vault.type === "steth") {
      shares = (await this.client.readContract({
        address: vault.address,
        abi: vault.abi,
        functionName: "sharesOf",
        args: [depositor],
      })) as bigint;
    } else {
      shares = (await this.client.readContract({
        address: vault.address,
        abi: vault.abi,
        functionName: "balanceOf",
        args: [depositor],
      })) as bigint;
    }

    const assetValue = (shares * vaultSnap.sharePrice) / ONE;

    const snap: PositionSnapshot = {
      vaultKey: vault.symbol,
      depositor,
      timestamp: Date.now(),
      shares,
      assetValue,
    };
    this.store.pushPosition(snap);
    return snap;
  }

  /**
   * Compute annualised yield (APY) based on share price change over a window.
   * Returns percentage (e.g. 3.5 means 3.5%).
   */
  computeApy(vaultKey: string, windowSec: number = 86400): number | null {
    const latest = this.store.latestVault(vaultKey);
    const older = this.store.vaultSnapshotAgo(vaultKey, windowSec);
    if (!latest || !older || latest.timestamp === older.timestamp) return null;

    const elapsed = (latest.timestamp - older.timestamp) / 1000; // seconds
    if (elapsed < 60) return null; // too short

    const priceNow = Number(formatUnits(latest.sharePrice, 18));
    const priceThen = Number(formatUnits(older.sharePrice, 18));
    if (priceThen === 0) return null;

    const rate = priceNow / priceThen - 1;
    const annualised = rate * (365.25 * 86400) / elapsed;
    return annualised * 100; // percentage
  }
}
