/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ADR Pipeline: ADRs_Directory → UMLS CUI → SNOMED CT Enrichment
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Chain: Brand → SCD → SCDF → SCDF_IN → IR_External_Map (SIDER) → ADR
 *
 * This script:
 * 1. Parses ADRs_Directory.xlsx (162K records with STITCH CID, UMLS CUI, frequency)
 * 2. Parses UMLS MRCONSO.RRF to crosswalk UMLS CUI → SNOMED CT code + preferred term
 * 3. Drops and recreates pharma.adr with enriched schema
 * 4. Bulk inserts all records with SNOMED CT codes
 *
 * Usage: npx tsx scripts/seed_adr_snomed.ts
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as readline from 'readline';
import XLSX from 'xlsx';
import { pool } from '../server/db.js';

const XLSX_PATH = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\Local Master Directory\\ADRs_Directory.xlsx';

const MRCONSO_PATH = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\umls-2025AB-metathesaurus-full\\2025AB\\META\\MRCONSO.RRF';

// ──────────────────────────────────────────────────────────────────────────────
// STEP 1: Parse ADRs_Directory.xlsx
// ──────────────────────────────────────────────────────────────────────────────

interface RawADR {
  adr_id: string;
  stitch_cid: string;
  umls_cui: string;
  side_effect_name: string;
  frequency: string;
}

function parseADRExcel(): RawADR[] {
  console.log('\n[STEP 1] Parsing ADRs_Directory.xlsx...');
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws) as any[];

  const records: RawADR[] = rows.map(r => ({
    adr_id: r['ADR ID'] || '',
    stitch_cid: r['STITCH compound ID (flat)'] || '',
    umls_cui: r['UMLS CUI for the MedDRA term'] || '',
    side_effect_name: r['Side-effect name (MedDRA term text)'] || '',
    frequency: r['Frequency as written in the label'] || '',
  })).filter(r => r.stitch_cid && r.umls_cui);

  console.log(`   ✓ Loaded ${records.length.toLocaleString()} ADR records`);

  // Collect unique CUIs
  const uniqueCUIs = new Set(records.map(r => r.umls_cui));
  console.log(`   ✓ ${uniqueCUIs.size.toLocaleString()} unique UMLS CUIs`);

  // Frequency distribution
  const freqDist: Record<string, number> = {};
  records.forEach(r => { freqDist[r.frequency] = (freqDist[r.frequency] || 0) + 1; });
  console.log('   ✓ Frequency distribution:', freqDist);

  return records;
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 2: Parse MRCONSO.RRF → CUI → SNOMED CT code + preferred term
// ──────────────────────────────────────────────────────────────────────────────

interface SnomedMapping {
  snomed_code: string;
  snomed_term: string;
  tty: string;  // PT=Preferred, SY=Synonym, etc.
}

async function parseMRCONSOForSnomed(targetCUIs: Set<string>): Promise<Map<string, SnomedMapping>> {
  console.log(`\n[STEP 2] Parsing MRCONSO.RRF (2.2GB) for ${targetCUIs.size.toLocaleString()} CUIs → SNOMED CT...`);
  const cuiToSnomed = new Map<string, SnomedMapping>();

  const rl = readline.createInterface({
    input: fs.createReadStream(MRCONSO_PATH, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let matchCount = 0;

  for await (const line of rl) {
    lineCount++;
    if (lineCount % 5_000_000 === 0) process.stdout.write(`\r   ...${(lineCount / 1_000_000).toFixed(0)}M lines`);

    // MRCONSO format: CUI|LAT|TS|LUI|STT|SUI|ISPREF|AUI|SAUI|SCUI|SDUI|SAB|TTY|CODE|STR|SRL|SUPPRESS|CVF|
    const parts = line.split('|');
    const cui = parts[0];
    const lat = parts[1];
    const sab = parts[11];
    const tty = parts[12];
    const code = parts[13];
    const term = parts[14];

    // Only English SNOMED CT US entries for our target CUIs
    if (lat === 'ENG' && sab === 'SNOMEDCT_US' && targetCUIs.has(cui)) {
      matchCount++;

      const existing = cuiToSnomed.get(cui);
      // Priority: PT (Preferred Term) > FN (Full Name) > SY (Synonym) > everything else
      if (!existing || tty === 'PT' || (tty === 'FN' && existing.tty !== 'PT')) {
        cuiToSnomed.set(cui, {
          snomed_code: code,
          snomed_term: tty === 'FN' ? term.replace(/\s*\([^)]*\)\s*$/, '') : term,
          tty,
        });
      }
    }
  }

  console.log(`\n   ✓ Scanned ${lineCount.toLocaleString()} lines`);
  console.log(`   ✓ Found ${matchCount.toLocaleString()} SNOMED matches`);
  console.log(`   ✓ Mapped ${cuiToSnomed.size.toLocaleString()} / ${targetCUIs.size.toLocaleString()} CUIs to SNOMED CT`);
  console.log(`   ✓ Coverage: ${((cuiToSnomed.size / targetCUIs.size) * 100).toFixed(1)}%`);

  return cuiToSnomed;
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 3: Recreate pharma.adr table with enriched schema and insert
// ──────────────────────────────────────────────────────────────────────────────

async function seedDatabase(records: RawADR[], cuiToSnomed: Map<string, SnomedMapping>) {
  console.log('\n[STEP 3] Writing to database...');

  // 3a: Drop and recreate the ADR table with enriched schema
  await pool.query(`DROP TABLE IF EXISTS pharma.adr CASCADE;`);
  await pool.query(`
    CREATE TABLE pharma.adr (
      adr_id TEXT PRIMARY KEY,
      stitch_cid TEXT NOT NULL,
      umls_cui TEXT NOT NULL,
      side_effect_name TEXT NOT NULL,
      frequency_label TEXT,
      snomed_code TEXT,
      snomed_term TEXT,
      UNIQUE(stitch_cid, umls_cui)
    );
  `);
  console.log('   ✓ Recreated pharma.adr table with enriched schema');

  // 3b: Enrich records with SNOMED data
  let snomedMatched = 0;
  const enriched = records.map(r => {
    const snomed = cuiToSnomed.get(r.umls_cui);
    if (snomed) snomedMatched++;
    return {
      ...r,
      snomed_code: snomed?.snomed_code || null,
      snomed_term: snomed?.snomed_term || null,
    };
  });
  console.log(`   ✓ ${snomedMatched.toLocaleString()} / ${records.length.toLocaleString()} records have SNOMED CT codes`);

  // 3c: Batch insert
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < enriched.length; i += BATCH) {
    const batch = enriched.slice(i, i + BATCH);
    const values = batch.map((_, idx) => {
      const b = idx * 7;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`;
    }).join(',');
    const params = batch.flatMap(r => [
      r.adr_id, r.stitch_cid, r.umls_cui, r.side_effect_name,
      r.frequency, r.snomed_code, r.snomed_term,
    ]);

    await pool.query(`
      INSERT INTO pharma.adr (adr_id, stitch_cid, umls_cui, side_effect_name, frequency_label, snomed_code, snomed_term)
      VALUES ${values}
      ON CONFLICT (stitch_cid, umls_cui) DO UPDATE SET
        side_effect_name = EXCLUDED.side_effect_name,
        frequency_label = EXCLUDED.frequency_label,
        snomed_code = EXCLUDED.snomed_code,
        snomed_term = EXCLUDED.snomed_term
    `, params);

    inserted += batch.length;
    if ((i / BATCH) % 20 === 0) {
      process.stdout.write(`\r   Inserting... ${inserted.toLocaleString()} / ${enriched.length.toLocaleString()}`);
    }
  }

  // 3d: Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_adr_stitch ON pharma.adr(stitch_cid);
    CREATE INDEX IF NOT EXISTS idx_adr_umls ON pharma.adr(umls_cui);
    CREATE INDEX IF NOT EXISTS idx_adr_snomed ON pharma.adr(snomed_code);
    CREATE INDEX IF NOT EXISTS idx_adr_freq ON pharma.adr(frequency_label);
  `);

  console.log(`\n   ✓ Inserted ${inserted.toLocaleString()} ADR records`);
  console.log('   ✓ Created indexes');

  // 3e: Quick verification
  const count = await pool.query('SELECT COUNT(*) FROM pharma.adr');
  const snomedCount = await pool.query("SELECT COUNT(*) FROM pharma.adr WHERE snomed_code IS NOT NULL");
  const freqCount = await pool.query("SELECT COUNT(DISTINCT frequency_label) FROM pharma.adr");
  console.log(`   ✓ Verified: ${count.rows[0].count} total, ${snomedCount.rows[0].count} with SNOMED, ${freqCount.rows[0].count} frequency categories`);
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log(' ADR Pipeline: ADRs_Directory → UMLS CUI → SNOMED CT');
  console.log('══════════════════════════════════════════════════════════════');
  const t0 = Date.now();

  // Step 1: Parse Excel
  const records = parseADRExcel();
  const uniqueCUIs = new Set(records.map(r => r.umls_cui));

  // Step 2: Crosswalk CUI → SNOMED CT
  const cuiToSnomed = await parseMRCONSOForSnomed(uniqueCUIs);

  // Step 3: Seed database
  await seedDatabase(records, cuiToSnomed);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(` ✅ COMPLETE in ${elapsed}s`);
  console.log(`══════════════════════════════════════════════════════════════`);

  await pool.end();
  process.exit(0);
}

main();
