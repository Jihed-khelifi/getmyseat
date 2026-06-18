import { createApp } from "./app.js";
import { config } from "./config.js";
import { buildContainer } from "./container.js";
import { logger } from "./utils/logger.js";

const container = buildContainer();
const app = createApp(container.userService);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "Backend listening");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down");
  server.close();
  await container.shutdown();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
