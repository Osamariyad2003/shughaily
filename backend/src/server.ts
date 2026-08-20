import app from './app';
import { config } from './config';
import { pool } from './config/database';
import { startAgentScheduler } from './jobs/agentScheduler';
import { ensureSearchAgentTables } from './services/searchAgent.service';
import { startUsageWorker } from './jobs/usageLogger';
import { startSearchAgentRunWorker } from './jobs/searchAgentRunQueue';

async function main(): Promise<void> {
  // Verify database connectivity
  try {
    const client = await pool.connect();
    console.log('PostgreSQL connected successfully');
    client.release();
    await ensureSearchAgentTables();
    console.log('Search agent tables ready');
    await startAgentScheduler();
    console.log('Agent scheduler initialized');
    startUsageWorker();
    console.log('Usage logging worker started');
    startSearchAgentRunWorker();
    console.log('Search agent run worker started');
  } catch (err) {
    console.error('Failed to connect to PostgreSQL:', err);
    console.warn('Server will start but database operations will fail until connection is available.');
  }

  app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║   الشغيلي  -  Al-Shughaily Backend          ║
║   Environment : ${config.nodeEnv.padEnd(28)}║
║   Port        : ${String(config.port).padEnd(28)}║
║   API base    : /api/v1${' '.repeat(22)}║
╚══════════════════════════════════════════════╝
    `);
  });
}

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  pool.end().then(() => {
    console.log('Database pool closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
