import { CONFIG_PATH, DEFAULT_PORT } from './constants.js';
import { readJson, writeJson } from './storage.js';
import { generateApiKey, nowMs } from './utils.js';

export async function loadConfig() {
  let config = await readJson(CONFIG_PATH, null);
  if (!config) {
    config = {
      host: '127.0.0.1',
      port: DEFAULT_PORT,
      apiKey: generateApiKey(),
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    await writeJson(CONFIG_PATH, config);
  }

  // 允许临时用环境变量覆盖，便于测试多个实例。
  if (process.env.CODEX_GATEWAY_PORT) {
    config.port = Number(process.env.CODEX_GATEWAY_PORT);
  }
  if (process.env.CODEX_GATEWAY_HOST) {
    config.host = process.env.CODEX_GATEWAY_HOST;
  }
  return config;
}

export async function rotateApiKey() {
  const config = await loadConfig();
  config.apiKey = generateApiKey();
  config.updatedAt = nowMs();
  await writeJson(CONFIG_PATH, config);
  return config.apiKey;
}
