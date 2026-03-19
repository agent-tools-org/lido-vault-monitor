# Lido Vault Position Monitor

> **Hackathon submission** — *Vault Position Monitor + Alert Agent* track, sponsored by Lido.

An autonomous agent that watches Lido Earn vault positions (stETH, wstETH, and any ERC-4626 vault) and tells depositors when something worth knowing has changed — in plain language. Tracks APY shifts, TVL movements, rebalance events, and position value changes with configurable thresholds.

## Features

- **Position tracking** — monitors depositor share balances and asset values across Lido vaults (stETH, wstETH, and any ERC-4626 vault).
- **APY monitoring** — computes annualised yield from share-price changes and alerts when it shifts by more than a configurable threshold.
- **TVL alerts** — detects large inflows/outflows (default: >10% change).
- **Rebalance detection** — notices when share price changes without corresponding TVL movement.
- **Plain-language alerts** — human-readable messages like *"Your wstETH position is now worth 5.23 stETH (+0.02 since last check)."*
- **Structured logging** — every alert is appended to `logs/alerts.jsonl` for downstream consumption.
- **ERC-4626 compatible** — works with any ERC-4626 vault; register Lido Earn vaults (EarnETH/EarnUSD) at runtime.
- **Extensible** — register any ERC-4626 vault at runtime (e.g. EarnETH/EarnUSD when their addresses are published).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Monitor Agent (polling loop)              │
│                                                             │
│   ┌──────────────┐    ┌────────────────┐    ┌───────────┐  │
│   │  Position     │───▶│  Event          │───▶│ Formatter │  │
│   │  Tracker      │    │  Detector       │    │           │  │
│   │ (on-chain     │    │ (snapshot diff, │    │ (plain    │  │
│   │  reads, APY   │    │  APY/TVL shift  │    │  language, │  │
│   │  calculation) │    │  detection)     │    │  JSON,     │  │
│   └──────┬───────┘    └────────────────┘    │  webhook)  │  │
│          │                                   └─────┬─────┘  │
│          ▼                                         ▼        │
│   Ethereum RPC                              Alert Output    │
│   (stETH, wstETH,                          (console +      │
│    ERC-4626 vaults)                     logs/alerts.jsonl)  │
└─────────────────────────────────────────────────────────────┘
```

```
src/
├── index.ts                     # Entry point — starts the agent
├── config.ts                    # Loads env vars into typed config
├── vaults/
│   └── config.ts                # Vault addresses, ABIs, type definitions
├── monitor/
│   ├── position-tracker.ts      # On-chain reads, snapshot storage, APY calc
│   └── event-detector.ts        # Compares snapshots → generates alerts
├── alerts/
│   └── formatter.ts             # Plain-language + JSON + webhook formatters
└── agent/
    └── monitor-agent.ts         # Main polling loop, orchestration, log output
```

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum set ETH_RPC_URL
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `ETH_RPC_URL` | *(required)* | Ethereum JSON-RPC endpoint |
| `DEPOSITOR_ADDRESSES` | *(empty)* | Comma-separated addresses to monitor |
| `POLL_INTERVAL_SECONDS` | `300` | Seconds between poll cycles |
| `APY_SHIFT_THRESHOLD` | `0.5` | APY change (in pp) that triggers an alert |
| `TVL_CHANGE_THRESHOLD` | `10` | TVL change (%) that triggers an alert |

## Usage

```bash
# Build and run the monitor agent
npm run build
npm start

# Development mode (auto-reload)
npm run dev

# Run the live on-chain demo (no .env required)
npm run demo

# Run tests
npm test
```

## Live Demo Output

Run `npm run demo` to read real-time Lido protocol data from Ethereum mainnet. The script queries wstETH and stETH contracts and saves results to `proof/demo.json`:

```json
{
  "timestamp": "2026-03-19T00:58:51.500Z",
  "blockNumber": 24688099,
  "wstETH": {
    "contract": "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    "stEthPerToken": "1.22965476780354332",
    "totalSupply": "3387167.555353438379685322",
    "backingStETH": "4165046.733789827736245797"
  },
  "stETH": {
    "contract": "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    "totalSupply": "9251369.25766061639101002",
    "totalPooledEther": "9251369.25766061639101002"
  }
}
```

## Monitored Vaults

| Vault | Address | Type |
|---|---|---|
| stETH | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` | Rebasing |
| wstETH | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` | Wrapped |

To add EarnETH / EarnUSD (or any ERC-4626 vault), call `registerERC4626Vault()` from `src/vaults/config.ts`.

## Alert Severity Levels

| Level | When |
|---|---|
| `info` | Position value changed, rebalance detected, new position |
| `warning` | APY shifted above threshold, TVL changed above threshold |
| `critical` | APY shifted 3×+ threshold, TVL changed 3×+ threshold |

## Tech Stack

- **TypeScript** — strict mode
- **viem** — type-safe Ethereum client
- **dotenv** — environment configuration
- **Node.js ≥ 18**

## License

MIT
