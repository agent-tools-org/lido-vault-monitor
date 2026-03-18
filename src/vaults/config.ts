import { type Abi, type Address } from "viem";

// ── ERC-4626 vault ABI (subset used for monitoring) ──────────────────────────
export const ERC4626_ABI = [
  {
    name: "totalAssets",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "convertToShares",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "asset",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const satisfies Abi;

// ── Lido stETH ABI (rebasing token — acts like a vault under the hood) ───────
export const STETH_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getSharesByPooledEth",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_ethAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getPooledEthByShares",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_sharesAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getTotalPooledEther",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getTotalShares",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "sharesOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const satisfies Abi;

// ── Lido wstETH ABI (wrapped stETH — non-rebasing, ERC-4626-like) ───────────
export const WSTETH_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "stEthPerToken",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "tokensPerStEth",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getStETHByWstETH",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_wstETHAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getWstETHByStETH",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_stETHAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const satisfies Abi;

// ── Vault type definitions ───────────────────────────────────────────────────

export type VaultType = "erc4626" | "steth" | "wsteth";

export interface VaultConfig {
  name: string;
  symbol: string;
  address: Address;
  type: VaultType;
  decimals: number;
  assetSymbol: string;
  abi: Abi;
}

// ── Deployed vault configurations ────────────────────────────────────────────

export const VAULTS: Record<string, VaultConfig> = {
  stETH: {
    name: "Lido Staked Ether",
    symbol: "stETH",
    address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    type: "steth",
    decimals: 18,
    assetSymbol: "ETH",
    abi: STETH_ABI,
  },
  wstETH: {
    name: "Wrapped Staked Ether",
    symbol: "wstETH",
    address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    type: "wsteth",
    decimals: 18,
    assetSymbol: "stETH",
    abi: WSTETH_ABI,
  },
};

/**
 * Add a custom ERC-4626 vault at runtime (e.g. EarnETH / EarnUSD once
 * their addresses become publicly available).
 */
export function registerERC4626Vault(
  key: string,
  opts: { name: string; symbol: string; address: Address; decimals?: number; assetSymbol?: string },
): void {
  VAULTS[key] = {
    name: opts.name,
    symbol: opts.symbol,
    address: opts.address,
    type: "erc4626",
    decimals: opts.decimals ?? 18,
    assetSymbol: opts.assetSymbol ?? "ETH",
    abi: ERC4626_ABI,
  };
}
