import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudMain, parseCloudOptions, validateBinding } from './rum-cloud.mjs';

const manifestPath = new URL('../config/rum.cloud.json', import.meta.url);
// Automation adds only fail-closed activation/credential guards and run logging.
// Retention SQL, identity checks, cascades and export epochs remain in rum:cloud.
export async function retentionMain(argv) {
  let stage = 'activation';
  let target;
  const log = (event, extra = {}) => console.log(JSON.stringify({
    event: `rum-retention.${event}`, at: new Date().toISOString(), ...target, ...extra,
  }));
  try {
    if (process.env.RUM_RETENTION_ENABLED !== 'true') throw new Error('Activation required.');
    stage = 'target';
    const { options } = parseCloudOptions(['cleanup', ...argv]);
    validateBinding(JSON.parse(await readFile(manifestPath, 'utf8')), options);
    target = { account: options.account, database: options.database, environment: options.environment };
    stage = 'credentials';
    if (!process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CLOUDFLARE_ACCOUNT_ID !== options.account) {
      throw new Error('Explicit token and matching credential account required.');
    }
    // No OAuth/global-key fallback for unattended execution.
    if (process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_EMAIL) throw new Error('Ambiguous credentials.');
    stage = 'cleanup';
    log('started');
    await cloudMain(['cleanup', ...argv]);
    log('succeeded');
  } catch {
    // Raw errors/SQL/request data and tokens never enter automation logs.
    log('failed', { stage });
    throw new Error(`RUM retention failed at ${stage}; inspect the run status. Deletion may have partially completed.`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await retentionMain(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
