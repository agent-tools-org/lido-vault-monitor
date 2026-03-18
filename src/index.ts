import { loadConfig } from "./config";
import { MonitorAgent } from "./agent/monitor-agent";

async function main(): Promise<void> {
  const config = loadConfig();
  const agent = new MonitorAgent(config);

  // Graceful shutdown on SIGINT / SIGTERM
  const shutdown = (): void => {
    agent.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await agent.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
