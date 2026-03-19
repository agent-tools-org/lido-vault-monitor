/**
 * Live on-chain demo — reads real Lido protocol data from Ethereum mainnet.
 *
 * Usage:  npx tsx scripts/demo.ts
 */

import { createPublicClient, http, formatEther } from "viem";
import { mainnet } from "viem/chains";
import { WSTETH_ABI, STETH_ABI, VAULTS } from "../src/vaults/config";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = "https://eth.llamarpc.com";

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Lido Vault Position Monitor — Live On-Chain Demo");
  console.log("═══════════════════════════════════════════════════\n");

  const client = createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL),
  });

  const blockNumber = await client.getBlockNumber();
  console.log(`📦 Block number: ${blockNumber}\n`);

  // ── wstETH reads ─────────────────────────────────────────────────────────
  const wstETHAddress = VAULTS.wstETH.address;

  const [stEthPerToken, wstETHTotalSupply] = await Promise.all([
    client.readContract({
      address: wstETHAddress,
      abi: WSTETH_ABI,
      functionName: "stEthPerToken",
    }),
    client.readContract({
      address: wstETHAddress,
      abi: WSTETH_ABI,
      functionName: "totalSupply",
    }),
  ]);

  console.log("── wstETH ──────────────────────────────────────────");
  console.log(`  Contract:        ${wstETHAddress}`);
  console.log(`  stEthPerToken:   ${formatEther(stEthPerToken)} stETH`);
  console.log(`  Total Supply:    ${formatEther(wstETHTotalSupply)} wstETH`);
  console.log();

  // ── stETH reads ──────────────────────────────────────────────────────────
  const stETHAddress = VAULTS.stETH.address;

  const [stETHTotalSupply, totalPooledEther] = await Promise.all([
    client.readContract({
      address: stETHAddress,
      abi: STETH_ABI,
      functionName: "totalSupply",
    }),
    client.readContract({
      address: stETHAddress,
      abi: STETH_ABI,
      functionName: "getTotalPooledEther",
    }),
  ]);

  console.log("── stETH ───────────────────────────────────────────");
  console.log(`  Contract:            ${stETHAddress}`);
  console.log(`  Total Supply:        ${formatEther(stETHTotalSupply)} stETH`);
  console.log(`  Total Pooled Ether:  ${formatEther(totalPooledEther)} ETH`);
  console.log();

  // ── Summary ──────────────────────────────────────────────────────────────
  const wstETHBackingETH =
    (wstETHTotalSupply * stEthPerToken) / BigInt(10 ** 18);

  console.log("── Summary ─────────────────────────────────────────");
  console.log(
    `  wstETH backing (stETH equivalent): ${formatEther(wstETHBackingETH)} stETH`,
  );
  console.log(
    `  Total staked via Lido:             ${formatEther(totalPooledEther)} ETH`,
  );
  console.log();

  // ── Save proof ───────────────────────────────────────────────────────────
  const result = {
    timestamp: new Date().toISOString(),
    blockNumber: Number(blockNumber),
    wstETH: {
      contract: wstETHAddress,
      stEthPerToken: formatEther(stEthPerToken),
      totalSupply: formatEther(wstETHTotalSupply),
      backingStETH: formatEther(wstETHBackingETH),
    },
    stETH: {
      contract: stETHAddress,
      totalSupply: formatEther(stETHTotalSupply),
      totalPooledEther: formatEther(totalPooledEther),
    },
  };

  const proofDir = path.resolve(__dirname, "..", "proof");
  if (!fs.existsSync(proofDir)) {
    fs.mkdirSync(proofDir, { recursive: true });
  }
  const proofPath = path.join(proofDir, "demo.json");
  fs.writeFileSync(proofPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`✅ Results saved to ${path.relative(process.cwd(), proofPath)}`);
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
