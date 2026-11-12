// Ejecuta una sincronización desde la terminal: npm run sync [-- --prueba]
import * as db from './db.js';
import { runSync } from './sync.js';

await db.migrate();
const dryRun = process.argv.includes('--prueba') ? true : undefined;
const res = await runSync('manual', dryRun === undefined ? {} : { dryRun });
console.log(JSON.stringify(res, null, 2));
await db.pool.end();
process.exit(res.error ? 1 : 0);
