#!/usr/bin/env node
import fssync from 'node:fs';
import { ACCOUNT_PATH, APP_DIR, CONFIG_PATH } from './constants.js';
import { codexHome, importFromCodexAuth } from './account.js';
import { loadConfig, rotateApiKey } from './config.js';
import { createServer } from './gateway.js';
import { readJson } from './storage.js';
import { startWakeupScheduler } from './wakeup.js';
import { startQuotaRefreshScheduler } from './quota.js';
import { startTokenKeeper } from './token-keeper.js';
import { mask } from './utils.js';

async function doctor() {
  const config = await loadConfig();
  let account = await readJson(ACCOUNT_PATH, null);
  let imported = false;
  if (!account) {
    account = await importFromCodexAuth();
    imported = true;
  }

  console.log(JSON.stringify({
    appDir: APP_DIR,
    configPath: CONFIG_PATH,
    accountPath: ACCOUNT_PATH,
    codexHome: codexHome(),
    baseUrl: `http://${config.host}:${config.port}/v1`,
    apiKey: config.apiKey,
    account: {
      email: account.email,
      accountId: account.accountId,
      imported,
    },
  }, null, 2));
}

async function serve() {
  const config = await loadConfig();
  if (!fssync.existsSync(ACCOUNT_PATH)) {
    try {
      await importFromCodexAuth();
    } catch (err) {
      console.warn(`[gateway] 尚未导入 Codex OAuth 账号: ${err.message}`);
    }
  }

  await startWakeupScheduler();
  await startQuotaRefreshScheduler();
  startTokenKeeper();

  const server = createServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`Codex API Gateway listening on http://${config.host}:${config.port}/v1`);
    console.log(`API key: ${mask(config.apiKey)}`);
    console.log(`Admin: http://${config.host}:${config.port}/_admin`);
  });
}

async function main() {
  const cmd = process.argv[2] || 'serve';
  if (cmd === 'doctor') return await doctor();
  if (cmd === 'import') {
    const account = await importFromCodexAuth();
    console.log(`Imported ${account.email}`);
    return;
  }
  if (cmd === 'rotate-key') {
    console.log(await rotateApiKey());
    return;
  }
  return await serve();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
