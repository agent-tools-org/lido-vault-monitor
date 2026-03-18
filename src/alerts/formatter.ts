import { type Alert, type AlertSeverity } from "../monitor/event-detector";

// ── Output formats ───────────────────────────────────────────────────────────

export type OutputFormat = "console" | "json" | "webhook";

// ── Severity styling ─────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  info: "ℹ️ ",
  warning: "⚠️ ",
  critical: "🚨",
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  info: "INFO",
  warning: "WARN",
  critical: "CRIT",
};

// ── Plain-language templates ─────────────────────────────────────────────────

function humanMessage(alert: Alert): string {
  const vault = alert.vaultKey;

  switch (alert.kind) {
    case "apy_shift": {
      const { previousApy, currentApy, deltaApy } = alert.data as {
        previousApy: number;
        currentApy: number;
        deltaApy: number;
      };
      const direction = deltaApy > 0 ? "increased" : "decreased";
      return (
        `Your ${vault} vault's APY has ${direction} from ${previousApy}% to ${currentApy}%.` +
        ` That's a ${Math.abs(deltaApy)} percentage-point shift — worth keeping an eye on.`
      );
    }

    case "tvl_change": {
      const { changePercent, direction, previousTvl, currentTvl } = alert.data as {
        changePercent: number;
        direction: string;
        previousTvl: string;
        currentTvl: string;
      };
      const verb = direction === "inflow" ? "flowed into" : "flowed out of";
      return (
        `A significant ${changePercent}% TVL change was detected in the ${vault} vault.` +
        ` Capital ${verb} the vault (${Number(previousTvl).toFixed(2)} → ${Number(currentTvl).toFixed(2)}).`
      );
    }

    case "position_value_change": {
      const { currentValue, delta } = alert.data as {
        currentValue: string;
        delta: string;
      };
      const d = Number(delta);
      const sign = d >= 0 ? "+" : "";
      return `Your ${vault} position is now worth ${Number(currentValue).toFixed(4)} (${sign}${d.toFixed(4)} since last check).`;
    }

    case "rebalance": {
      const { sharePriceChangePct, direction } = alert.data as {
        sharePriceChangePct: number;
        direction: string;
      };
      return (
        `The ${vault} vault appears to have rebalanced — share price moved ${direction} by ${sharePriceChangePct}%` +
        ` with minimal change in total deposits.`
      );
    }

    case "new_position": {
      const { assetValue } = alert.data as { assetValue: string };
      return `Tracking started for your ${vault} position (current value: ${Number(assetValue).toFixed(4)}).`;
    }

    default:
      return alert.message;
  }
}

// ── Formatters ───────────────────────────────────────────────────────────────

/**
 * Format an alert for console display.
 */
export function formatConsole(alert: Alert): string {
  const emoji = SEVERITY_EMOJI[alert.severity];
  const label = SEVERITY_LABEL[alert.severity];
  const time = new Date(alert.timestamp).toISOString();
  const human = humanMessage(alert);
  const depositorTag = alert.depositor
    ? ` [${alert.depositor.slice(0, 6)}…${alert.depositor.slice(-4)}]`
    : "";

  return `${emoji} [${label}] ${time} | ${alert.vaultKey}${depositorTag}\n   ${human}`;
}

/**
 * Format an alert as a JSON-lines string (for the log file).
 */
export function formatJsonLine(alert: Alert): string {
  return JSON.stringify({
    ...alert,
    humanMessage: humanMessage(alert),
  });
}

/**
 * Format an alert as a webhook-ready payload.
 */
export function formatWebhook(alert: Alert): object {
  return {
    id: alert.id,
    severity: alert.severity,
    vault: alert.vaultKey,
    depositor: alert.depositor ?? null,
    timestamp: new Date(alert.timestamp).toISOString(),
    kind: alert.kind,
    summary: humanMessage(alert),
    data: alert.data,
  };
}

/**
 * Unified formatter — pick the right output based on format.
 */
export function formatAlert(alert: Alert, format: OutputFormat): string {
  switch (format) {
    case "console":
      return formatConsole(alert);
    case "json":
      return formatJsonLine(alert);
    case "webhook":
      return JSON.stringify(formatWebhook(alert));
  }
}
