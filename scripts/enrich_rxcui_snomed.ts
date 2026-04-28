/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RXCUI + SNOMED CT Enrichment Pipeline
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * STEP 1: Parse RxNorm RXNCONSO.RRF → extract DrugBank ID → RXCUI mapping
 * STEP 2: Parse SNOMED CT Relationship file → extract causative_agent links
 * STEP 3: Parse SNOMED CT Description file → get human-readable names
 * STEP 4: Cross-map RXNCONSO SNOMED entries to bridge RXCUI → SNOMED substance
 * STEP 5: Write enrichment SQL and insert into production database
 *
 * Usage:  npx tsx scripts/enrich_rxcui_snomed.ts
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as readline from 'readline';
import { pool } from '../server/db.js';

// ──────────────────────────────────────────────────────────────────────────────
// FILE PATHS
// ──────────────────────────────────────────────────────────────────────────────

const RXNCONSO_PATH = 'D:\\Healthcare Solutions\\Databases\\UMLS\\RxNorm_full_06022025\\rrf\\RXNCONSO.RRF';

const SNOMED_REL_PATH = 'D:\\Healthcare Solutions\\Databases\\UMLS\\SnomedCT\\SnomedCT_InternationalRF2_PRODUCTION_20260201T120000Z\\Snapshot\\Terminology\\sct2_Relationship_Snapshot_INT_20260201.txt';

const SNOMED_DESC_PATH = 'D:\\Healthcare Solutions\\Databases\\UMLS\\SnomedCT\\SnomedCT_InternationalRF2_PRODUCTION_20260201T120000Z\\Snapshot\\Terminology\\sct2_Description_Snapshot-en_INT_20260201.txt';

// SNOMED CT attribute type for "Causative agent"
const CAUSATIVE_AGENT_TYPE_ID = '246075003';

// ──────────────────────────────────────────────────────────────────────────────
// STEP 1: Parse RXNCONSO → DrugBank ID → RXCUI mapping
// ──────────────────────────────────────────────────────────────────────────────

async function parseRxnConsoForDrugBank(): Promise<Map<string, string>> {
  console.log('\n[STEP 1] Parsing RXNCONSO.RRF for DrugBank → RXCUI mapping...');
  const drugbankToRxcui = new Map<string, string>();

  const rl = readline.createInterface({
    input: fs.createReadStream(RXNCONSO_PATH, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    // RXNCONSO format: RXCUI|LAT|TS|LUI|STT|SUI|ISPREF|RXAUI|SAUI|SCUI|SDUI|SAB|TTY|CODE|STR|SRL|SUPPRESS|CVF|
    const parts = line.split('|');
    const rxcui = parts[0];
    const sab = parts[11];   // Source abbreviation
    const tty = parts[12];   // Term type
    const code = parts[13];  // Source code (DrugBank ID)

    // We want DrugBank IN (Ingredient) entries only
    if (sab === 'DRUGBANK' && tty === 'IN') {
      drugbankToRxcui.set(code, rxcui);
    }
  }

  console.log(`   ✓ Scanned ${lineCount.toLocaleString()} lines`);
  console.log(`   ✓ Found ${drugbankToRxcui.size.toLocaleString()} unique DrugBank → RXCUI (IN) mappings`);
  return drugbankToRxcui;
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 1b: Parse RXNCONSO → RXCUI → SNOMED CT substance mapping
// ──────────────────────────────────────────────────────────────────────────────

async function parseRxnConsoForSnomed(): Promise<Map<string, string[]>> {
  console.log('\n[STEP 1b] Parsing RXNCONSO.RRF for RXCUI → SNOMED CT substance mapping...');
  const rxcuiToSnomed = new Map<string, string[]>();

  const rl = readline.createInterface({
    input: fs.createReadStream(RXNCONSO_PATH, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    const parts = line.split('|');
    const rxcui = parts[0];
    const sab = parts[11];
    const code = parts[13];

    if (sab === 'SNOMEDCT_US') {
      if (!rxcuiToSnomed.has(rxcui)) rxcuiToSnomed.set(rxcui, []);
      const arr = rxcuiToSnomed.get(rxcui)!;
      if (!arr.includes(code)) arr.push(code);
    }
  }

  console.log(`   ✓ Found ${rxcuiToSnomed.size.toLocaleString()} RXCUI → SNOMED CT mappings`);
  return rxcuiToSnomed;
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 2: Parse SNOMED CT relationships → causative_agent links
// Returns: Map<substanceSCTID, Array<{clinicalFindingSCTID}>>
// Meaning: "substance X causes adverse effect Y"
// ──────────────────────────────────────────────────────────────────────────────

interface CausativeLink {
  clinicalFindingId: string;  // sourceId = the adverse effect
  substanceId: string;        // destinationId = the causative substance
}

async function parseSnomedCausativeAgent(): Promise<Map<string, string[]>> {
  console.log('\n[STEP 2] Parsing SNOMED CT relationships for causative_agent links...');
  const substanceToEffects = new Map<string, string[]>();

  const rl = readline.createInterface({
    input: fs.createReadStream(SNOMED_REL_PATH, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let matchCount = 0;
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    lineCount++;
    // Format: id\teffectiveTime\tactive\tmoduleId\tsourceId\tdestinationId\trelationshipGroup\ttypeId\tcharacteristicTypeId\tmodifierId
    const parts = line.split('\t');
    const active = parts[2];
    const sourceId = parts[4];       // Clinical finding (the ADE)
    const destinationId = parts[5];  // Substance (the causative agent)
    const typeId = parts[7];         // Relationship type

    if (active === '1' && typeId === CAUSATIVE_AGENT_TYPE_ID) {
      matchCount++;
      if (!substanceToEffects.has(destinationId)) substanceToEffects.set(destinationId, []);
      substanceToEffects.get(destinationId)!.push(sourceId);
    }
  }

  console.log(`   ✓ Scanned ${lineCount.toLocaleString()} relationships`);
  console.log(`   ✓ Found ${matchCount.toLocaleString()} active causative_agent links`);
  console.log(`   ✓ Covering ${substanceToEffects.size.toLocaleString()} unique substances`);
  return substanceToEffects;
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 3: Parse SNOMED CT descriptions → get human-readable names
// ──────────────────────────────────────────────────────────────────────────────

async function parseSnomedDescriptions(conceptIds: Set<string>): Promise<Map<string, string>> {
  console.log(`\n[STEP 3] Parsing SNOMED CT descriptions for ${conceptIds.size.toLocaleString()} concepts...`);
  const descriptions = new Map<string, string>();

  const rl = readline.createInterface({
    input: fs.createReadStream(SNOMED_DESC_PATH, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  // Prefer FSN (Fully Specified Name) typeId = 900000000000003001
  // Synonym typeId = 900000000000013009
  const FSN_TYPE = '900000000000003001';
  const SYN_TYPE = '900000000000013009';

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    // Format: id\teffectiveTime\tactive\tmoduleId\tconceptId\tlanguageCode\ttypeId\tterm\tcaseSignificanceId
    const parts = line.split('\t');
    const active = parts[2];
    const conceptId = parts[4];
    const typeId = parts[6];
    const term = parts[7];

    if (active === '1' && conceptIds.has(conceptId)) {
      // Prefer Synonym (shorter, cleaner) over FSN
      if (typeId === SYN_TYPE && !descriptions.has(conceptId)) {
        descriptions.set(conceptId, term);
      } else if (typeId === FSN_TYPE && !descriptions.has(conceptId)) {
        // Remove the semantic tag e.g., "(disorder)" from FSN
        descriptions.set(conceptId, term.replace(/\s*\([^)]*\)\s*$/, ''));
      }
    }
  }

  console.log(`   ✓ Resolved ${descriptions.size.toLocaleString()} concept names`);
  return descriptions;
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 4: Build the complete enrichment data
// ──────────────────────────────────────────────────────────────────────────────

interface EnrichedADE {
  drugbank_id: string;
  rxcui_in: string;
  snomed_substance_id: string;
  snomed_ade_id: string;
  ade_name: string;
  substance_name: string;
}

async function buildEnrichmentData() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(' RXCUI + SNOMED CT ADE Enrichment Pipeline');
  console.log('══════════════════════════════════════════════════════════════');

  // Step 1: DrugBank → RXCUI
  const drugbankToRxcui = await parseRxnConsoForDrugBank();

  // Step 1b: RXCUI → SNOMED substance
  const rxcuiToSnomed = await parseRxnConsoForSnomed();

  // Step 2: SNOMED causative_agent relationships
  const substanceToEffects = await parseSnomedCausativeAgent();

  // ── Build the bridge ──
  // For each DrugBank ID we have:
  //   DrugBank ID → RXCUI (IN) → SNOMED substance(s) → ADE clinical findings
  console.log('\n[STEP 4] Building cross-mapped enrichment data...');

  const enrichedRecords: EnrichedADE[] = [];
  const allConceptIds = new Set<string>();
  let matchedDrugBanks = 0;
  let noSnomedMapping = 0;
  let noADEMapping = 0;

  for (const [dbId, rxcui] of drugbankToRxcui) {
    const snomedIds = rxcuiToSnomed.get(rxcui);
    if (!snomedIds || snomedIds.length === 0) {
      noSnomedMapping++;
      continue;
    }

    let foundADE = false;
    for (const snomedSubstanceId of snomedIds) {
      const effects = substanceToEffects.get(snomedSubstanceId);
      if (!effects || effects.length === 0) continue;

      foundADE = true;
      allConceptIds.add(snomedSubstanceId);
      for (const adeId of effects) {
        allConceptIds.add(adeId);
        enrichedRecords.push({
          drugbank_id: dbId,
          rxcui_in: rxcui,
          snomed_substance_id: snomedSubstanceId,
          snomed_ade_id: adeId,
          ade_name: '',        // will be filled in step 3
          substance_name: '',  // will be filled in step 3
        });
      }
    }

    if (foundADE) matchedDrugBanks++;
    else noADEMapping++;
  }

  console.log(`   ✓ DrugBank IDs with RXCUI: ${drugbankToRxcui.size.toLocaleString()}`);
  console.log(`   ✓ DrugBank IDs with SNOMED substance link: ${(drugbankToRxcui.size - noSnomedMapping).toLocaleString()}`);
  console.log(`   ✓ DrugBank IDs with at least one ADE: ${matchedDrugBanks.toLocaleString()}`);
  console.log(`   ✓ Total enriched ADE records: ${enrichedRecords.length.toLocaleString()}`);

  // Step 3: Get human-readable names
  const descriptions = await parseSnomedDescriptions(allConceptIds);

  for (const rec of enrichedRecords) {
    rec.ade_name = descriptions.get(rec.snomed_ade_id) || 'Unknown';
    rec.substance_name = descriptions.get(rec.snomed_substance_id) || 'Unknown';
  }

  return { drugbankToRxcui, enrichedRecords };
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 5: Write to database
// ──────────────────────────────────────────────────────────────────────────────

async function writeToDatabase(drugbankToRxcui: Map<string, string>, enrichedRecords: EnrichedADE[]) {
  console.log('\n[STEP 5] Writing to database...');

  // 5a: Add rxcui_in column to ir_external_map (if not exists)
  await pool.query(`
    ALTER TABLE pharma.ir_external_map
    ADD COLUMN IF NOT EXISTS rxcui_in VARCHAR(20);
  `);
  console.log('   ✓ Added rxcui_in column to ir_external_map');

  // 5b: Update ir_external_map with RXCUI for DrugBank entries
  let updated = 0;
  const BATCH = 200;
  const dbEntries = Array.from(drugbankToRxcui.entries());

  for (let i = 0; i < dbEntries.length; i += BATCH) {
    const batch = dbEntries.slice(i, i + BATCH);
    const cases = batch.map(([dbId, rxcui]) =>
      `WHEN external_id = '${dbId}' THEN '${rxcui}'`
    ).join(' ');
    const ids = batch.map(([dbId]) => `'${dbId}'`).join(',');

    const result = await pool.query(`
      UPDATE pharma.ir_external_map
      SET rxcui_in = CASE ${cases} END
      WHERE source ILIKE 'drugbank' AND external_id IN (${ids})
    `);
    updated += result.rowCount || 0;

    if ((i / BATCH) % 10 === 0) {
      process.stdout.write(`\r   Updating RXCUI... ${i + batch.length}/${dbEntries.length}`);
    }
  }
  console.log(`\n   ✓ Updated ${updated.toLocaleString()} ir_external_map rows with rxcui_in`);

  // 5c: Create the SNOMED ADE table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pharma.snomed_ade (
      id SERIAL PRIMARY KEY,
      drugbank_id VARCHAR(20) NOT NULL,
      rxcui_in VARCHAR(20),
      snomed_substance_id VARCHAR(20) NOT NULL,
      snomed_ade_id VARCHAR(20) NOT NULL,
      ade_name TEXT NOT NULL,
      substance_name TEXT,
      UNIQUE(drugbank_id, snomed_ade_id)
    );
  `);
  await pool.query('TRUNCATE pharma.snomed_ade RESTART IDENTITY CASCADE;');
  console.log('   ✓ Created pharma.snomed_ade table');

  // 5d: Batch insert enriched ADEs
  const ADE_BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < enrichedRecords.length; i += ADE_BATCH) {
    const batch = enrichedRecords.slice(i, i + ADE_BATCH);
    const values = batch.map((r, idx) => {
      const base = idx * 6;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    }).join(',');
    const params = batch.flatMap(r => [r.drugbank_id, r.rxcui_in, r.snomed_substance_id, r.snomed_ade_id, r.ade_name, r.substance_name]);

    await pool.query(`
      INSERT INTO pharma.snomed_ade (drugbank_id, rxcui_in, snomed_substance_id, snomed_ade_id, ade_name, substance_name)
      VALUES ${values}
      ON CONFLICT (drugbank_id, snomed_ade_id) DO NOTHING
    `, params);
    inserted += batch.length;

    if ((i / ADE_BATCH) % 20 === 0) {
      process.stdout.write(`\r   Inserting ADEs... ${inserted.toLocaleString()}/${enrichedRecords.length.toLocaleString()}`);
    }
  }
  console.log(`\n   ✓ Inserted ${inserted.toLocaleString()} SNOMED ADE records`);

  // 5e: Create index
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_snomed_ade_drugbank ON pharma.snomed_ade(drugbank_id);
    CREATE INDEX IF NOT EXISTS idx_snomed_ade_rxcui ON pharma.snomed_ade(rxcui_in);
    CREATE INDEX IF NOT EXISTS idx_snomed_ade_snomed ON pharma.snomed_ade(snomed_ade_id);
  `);
  console.log('   ✓ Created indexes on pharma.snomed_ade');
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  try {
    const { drugbankToRxcui, enrichedRecords } = await buildEnrichmentData();

    // Summary before DB write
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log(' ENRICHMENT SUMMARY');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(` Total DrugBank → RXCUI pairs: ${drugbankToRxcui.size.toLocaleString()}`);
    console.log(` Total SNOMED ADEs discovered: ${enrichedRecords.length.toLocaleString()}`);

    // Show a few sample records
    console.log('\n Sample records:');
    enrichedRecords.slice(0, 5).forEach(r => {
      console.log(`   ${r.drugbank_id} (RXCUI: ${r.rxcui_in}) → ${r.ade_name} (SNOMED: ${r.snomed_ade_id})`);
    });

    // Write to DB
    await writeToDatabase(drugbankToRxcui, enrichedRecords);

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log(' ✅ PIPELINE COMPLETE');
    console.log('══════════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('Pipeline failed:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
