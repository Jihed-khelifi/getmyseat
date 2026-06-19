import { createApp } from "./app.js";
import { config } from "./config.js";
import { buildContainer } from "./container.js";
import { logger } from "./utils/logger.js";

const container = buildContainer();
const app = createApp(container);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "Backend listening");
});

// Plan 09: attach the WebSocket broadcaster to the running HTTP server.
container.broadcaster.attach(server);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down");
  server.close();
  await container.shutdown();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
