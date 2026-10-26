import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import dns from 'dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATLAS_URI = 'mongodb+srv://allenabishai16_db_user:HgDfpShHbgHSuRy5@ccm.8dps1iz.mongodb.net/court_cms?retryWrites=true&w=majority';

async function seedAtlas() {
  console.log('Connecting to MongoDB Atlas...');
  const client = new MongoClient(ATLAS_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
  });

  await client.connect();
  console.log('Connected to Atlas successfully!');
  const db = client.db('court_cms');

  const seedPath = path.join(__dirname, '../src/db/seedData.json');
  const data = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  for (const [colName, docs] of Object.entries(data)) {
    if (docs.length === 0) continue;
    const col = db.collection(colName);
    await col.deleteMany({});
    
    // Parse Date strings to Date objects
    const parsedDocs = docs.map(d => {
      const copy = { ...d };
      for (const [k, v] of Object.entries(copy)) {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
          copy[k] = new Date(v);
        }
      }
      return copy;
    });

    await col.insertMany(parsedDocs);
    console.log(`Inserted ${parsedDocs.length} records into ${colName}`);
  }

  // Create essential unique indexes
  await Promise.allSettled([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('advocates').createIndex({ barNumber: 1 }, { unique: true }),
    db.collection('courtrooms').createIndex({ name: 1 }, { unique: true }),
    db.collection('cases').createIndex({ caseNumber: 1 }, { unique: true }),
    db.collection('judgments').createIndex({ caseId: 1 }, { unique: true }),
    db.collection('case_sequences').createIndex({ prefix: 1, year: 1 }, { unique: true }),
    db.collection('system_settings').createIndex({ key: 1 }, { unique: true }),
  ]);

  console.log('--- All collections & indexes successfully initialized in MongoDB Atlas! ---');
  await client.close();
  process.exit(0);
}

seedAtlas().catch(err => {
  console.error('Atlas seeding error:', err);
  process.exit(1);
});
