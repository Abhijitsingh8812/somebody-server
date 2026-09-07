import { buildApp } from './app';
import { config } from './config';

const startServer = async () => {
  const app = buildApp();

  try {
    await app.listen({
      port: config.port,
      host: config.host,
    });

    console.log(`SomeBody API Server running on http://${config.host}:${config.port}`);
    console.log(`Health check available at http://${config.host}:${config.port}/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful Shutdown handling
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  }
};

startServer();
