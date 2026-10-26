import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoClient, { getDb } from '../src/db/mongodb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function dump() {
  const db = await getDb();
  const colNames = [
    'users',
    'advocates',
    'courtrooms',
    'cases',
    'case_advocates',
    'hearings',
    'hearing_events',
    'judgments',
    'case_status_history',
    'case_sequences',
    'system_settings',
  ];

  const data = {};
  for (const name of colNames) {
    const docs = await db.collection(name).find({}).toArray();
    data[name] = docs;
    console.log(`Exported ${name}: ${docs.length} records`);
  }

  const outPath = path.join(__dirname, '../src/db/seedData.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Saved seedData.json successfully (${fs.statSync(outPath).size} bytes)`);
  await mongoClient.$disconnect();
  process.exit(0);
}

dump().catch((err) => {
  console.error('Error dumping database:', err);
  process.exit(1);
});
