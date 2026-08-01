/**
 * Polls the test Postgres on :5433 until it accepts connections, or exits 1.
 * Used by `npm run db:test` so migrate does not race the container boot.
 */
import net from 'node:net';

const host = process.env.POSTGRES_TEST_HOST || '127.0.0.1';
const port = Number(process.env.POSTGRES_TEST_PORT || 5433);
const deadline = Date.now() + 60_000;

function tryConnect() {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  process.stdout.write(`Waiting for postgres-test at ${host}:${port}…`);
  while (Date.now() < deadline) {
    if (await tryConnect()) {
      process.stdout.write(' ready.\n');
      return;
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error('\nTimed out. Is Docker running? Try: npm run db:test:up');
  process.exit(1);
}

main();
