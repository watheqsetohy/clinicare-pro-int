/**
 * import-snomed-pg.ts
 *
 * Imports SNOMED CT RF2 Snapshot data into the existing PostgreSQL
 * `clinicarepro_app` database.  Run with:
 *
 *   npx tsx server/import-snomed-pg.ts
 *
 * Re-run whenever a new SNOMED release is placed in the SnomedCT/ folder —
 * the script drops and recreates the three SNOMED tables each time.
 */

import { Pool } from 'pg';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const BATCH_SIZE = 50_000;

// ─── Schema ──────────────────────────────────────────────────────────────────

async function createSchema() {
  const client = await pool.connect();
  try {
    console.log('\n🗑️  Dropping existing SNOMED tables (if any)...');
    await client.query(`
      DROP TABLE IF EXISTS snomed_relationship CASCADE;
      DROP TABLE IF EXISTS snomed_description CASCADE;
      DROP TABLE IF EXISTS snomed_concept CASCADE;
    `);

    console.log('📦 Creating SNOMED tables...');

    // Enable pg_trgm for fuzzy search fallback
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    await client.query(`
      CREATE TABLE snomed_concept (
        id TEXT PRIMARY KEY,
        active SMALLINT NOT NULL DEFAULT 1
      );

      CREATE TABLE snomed_description (
        id TEXT PRIMARY KEY,
        concept_id TEXT NOT NULL,
        term TEXT NOT NULL,
        type_id TEXT NOT NULL,
        active SMALLINT NOT NULL DEFAULT 1,
        tsv TSVECTOR
      );

      CREATE TABLE snomed_relationship (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        destination_id TEXT NOT NULL,
        type_id TEXT NOT NULL,
        active SMALLINT NOT NULL DEFAULT 1
      );
    `);

    console.log('✅ Tables created.');
  } finally {
    client.release();
  }
}

// ─── Generic RF2 Importer ────────────────────────────────────────────────────

async function importTable(
  filePath: string,
  tableName: string,
  columns: string[],
  mapRow: (row: Record<string, string>) => any[] | null,
) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return 0;
  }

  console.log(`\n📂 Importing ${tableName} from ${path.basename(filePath)}...`);

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const insertSQL = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers: string[] = [];
  let isFirstLine = true;
  let count = 0;
  let batch: any[][] = [];

  const flushBatch = async (rows: any[][]) => {
    if (rows.length === 0) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        await client.query(insertSQL, row);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };

  for await (const line of rl) {
    const parts = line.split('\t');
    if (isFirstLine) {
      headers = parts.map(h => h.trim());
      isFirstLine = false;
      continue;
    }

    const rowObj: Record<string, string> = {};
    headers.forEach((h, i) => { rowObj[h] = parts[i]; });

    // Skip inactive rows
    if (rowObj['active'] !== '1') continue;

    try {
      const mapped = mapRow(rowObj);
      if (!mapped) continue;
      batch.push(mapped);
      count++;

      if (batch.length >= BATCH_SIZE) {
        await flushBatch(batch);
        batch = [];
        process.stdout.write(`\r   Inserted ${count.toLocaleString()} rows...`);
      }
    } catch {
      // mapping failed, skip
    }
  }

  if (batch.length > 0) {
    await flushBatch(batch);
    process.stdout.write(`\r   Inserted ${count.toLocaleString()} rows...`);
  }

  console.log(`\n   ✅ ${tableName}: ${count.toLocaleString()} rows imported.`);
  return count;
}

// ─── Build Indexes & tsvector ────────────────────────────────────────────────

async function buildIndexes() {
  console.log('\n🔧 Building indexes...');
  const client = await pool.connect();
  try {
    // Populate tsvector column
    console.log('   Populating tsvector column on snomed_description...');
    await client.query(`
      UPDATE snomed_description SET tsv = to_tsvector('english', term);
    `);

    // GIN index for full-text search
    console.log('   Creating GIN index on tsvector...');
    await client.query(`
      CREATE INDEX idx_snomed_desc_tsv ON snomed_description USING GIN (tsv);
    `);

    // pg_trgm index for fuzzy/prefix search fallback
    console.log('   Creating trigram index on term...');
    await client.query(`
      CREATE INDEX idx_snomed_desc_trgm ON snomed_description USING GIN (term gin_trgm_ops);
    `);

    // B-tree indexes for concept lookups
    console.log('   Creating B-tree indexes...');
    await client.query(`
      CREATE INDEX idx_snomed_desc_concept ON snomed_description (concept_id);
      CREATE INDEX idx_snomed_rel_source ON snomed_relationship (source_id);
      CREATE INDEX idx_snomed_rel_dest ON snomed_relationship (destination_id);
    `);

    console.log('   ✅ All indexes built.');
  } finally {
    client.release();
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   SNOMED CT → PostgreSQL Import                     ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const baseDir = path.join(
    __dirname, '..', 'SnomedCT',
    'SnomedCT_InternationalRF2_PRODUCTION_20260201T120000Z',
    'Snapshot', 'Terminology'
  );

  if (!fs.existsSync(baseDir)) {
    console.error(`\n❌ SNOMED RF2 directory not found: ${baseDir}`);
    process.exit(1);
  }

  await createSchema();

  // 1. Concepts
  const conceptFile = path.join(baseDir, 'sct2_Concept_Snapshot_INT_20260201.txt');
  await importTable(conceptFile, 'snomed_concept', ['id', 'active'], (row) => [
    row['id'], parseInt(row['active'], 10),
  ]);

  // 2. Descriptions
  const descFile = path.join(baseDir, 'sct2_Description_Snapshot-en_INT_20260201.txt');
  await importTable(descFile, 'snomed_description', ['id', 'concept_id', 'term', 'type_id', 'active'], (row) => [
    row['id'], row['conceptId'], row['term'], row['typeId'], parseInt(row['active'], 10),
  ]);

  // 3. Relationships
  const relFile = path.join(baseDir, 'sct2_Relationship_Snapshot_INT_20260201.txt');
  await importTable(relFile, 'snomed_relationship', ['id', 'source_id', 'destination_id', 'type_id', 'active'], (row) => [
    row['id'], row['sourceId'], row['destinationId'], row['typeId'], parseInt(row['active'], 10),
  ]);

  // 4. Indexes & FTS
  await buildIndexes();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🎉 SNOMED CT import complete in ${elapsed}s`);
  console.log('   Tables: snomed_concept, snomed_description, snomed_relationship');

  await pool.end();
}

main().catch((err) => {
  console.error('\n❌ Import failed:', err);
  pool.end();
  process.exit(1);
});
