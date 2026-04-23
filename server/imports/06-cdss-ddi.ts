/**
 * 06-cdss-ddi.ts  — Phase C2
 *
 * Imports Drug-Drug Interaction (DDI) data into cdss_drug_interaction
 * from MRREL.RRF using MED-RT contraindicated relationships:
 *
 *   has_contraindicated_drug           [MED-RT]  11,415 rows (drug-drug)
 *   has_contraindicated_class          [MED-RT]   1,933 rows (drug-class)
 *   has_contraindicated_mechanism_of_action [MED-RT] 457 rows
 *
 * Also seeds minimal CYP450 pharmacokinetics from NCI:
 *   enzyme_metabolizes_chemical_or_drug [NCI]  650 rows → cdss_drug_pk
 *   site_of_metabolism                  [MED-RT] 43 rows → cdss_drug_pk
 *
 * Run after 05-cdss-adverse.ts
 *   npx tsx server/imports/06-cdss-ddi.ts
 */

import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const META_DIR = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\umls-2025AB-metathesaurus-full\\2025AB\\META';
const MRREL   = path.join(META_DIR, 'MRREL.RRF');
const MRCONSO = path.join(META_DIR, 'MRCONSO.RRF');
const BATCH = 2_000;

// DDI RELA types: CUI1 = drug that has the contraindication, CUI2 = drug/class that is contraindicated WITH
const DDI_RELA = new Map<string, string>([
  ['has_contraindicated_drug',                  'contraindicated'],
  ['has_contraindicated_class',                 'contraindicated'],
  ['has_contraindicated_mechanism_of_action',   'contraindicated'],
  ['has_contraindicated_physiologic_effect',    'contraindicated'],
]);

// PK RELA types: CUI1=enzyme, CUI2=drug (enzyme metabolizes drug)
const PK_RELA = new Set([
  'enzyme_metabolizes_chemical_or_drug', // NCI: CUI1=enzyme, CUI2=drug
  'site_of_metabolism',                  // MED-RT: CUI1=drug, CUI2=metabolic_site
  'has_active_metabolites',              // MED-RT: CUI1=drug, CUI2=metabolite
]);

const DRUG_STY = new Set([
  'Pharmacologic Substance', 'Clinical Drug', 'Antibiotic',
  'Organic Chemical', 'Amino Acid, Peptide, or Protein',
  'Immunologic Factor', 'Hormone', 'Enzyme', 'Vitamin',
]);

async function flushDDI(client: PoolClient, batch: any[][]) {
  if (!batch.length) return;
  await client.query('BEGIN');
  for (const row of batch) {
    await client.query(`
      INSERT INTO cdss_drug_interaction
        (drug1_rxcui, drug2_rxcui, drug1_name, drug2_name, severity, rela, mechanism, source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (drug1_rxcui, drug2_rxcui, source) DO NOTHING
    `, row);
  }
  await client.query('COMMIT');
}

async function flushPK(client: PoolClient, batch: any[][]) {
  if (!batch.length) return;
  await client.query('BEGIN');
  for (const row of batch) {
    await client.query(`
      INSERT INTO cdss_drug_pk (drug_rxcui, drug_name, metabolism_route, source)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (drug_rxcui, source) DO UPDATE SET
        metabolism_route = EXCLUDED.metabolism_route
    `, row);
  }
  await client.query('COMMIT');
}

async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Phase C2: cdss_drug_interaction / cdss_drug_pk — MRREL   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Build CUI→RxNorm map ──────────────────────────────────────────────────
  console.log('📂 Pass 1: CUI→RxNorm from MRCONSO...');
  const cuiToRxcui = new Map<string, { rxcui: string; name: string }>();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(MRCONSO, 'utf8') });
    let lines = 0;
    for await (const line of rl) {
      lines++;
      const f = line.split('|');
      if (f[11] !== 'RXNORM') continue;
      if (!['IN','MIN','BN'].includes(f[12])) continue;
      const cui = f[0];
      if (!cuiToRxcui.has(cui)) cuiToRxcui.set(cui, { rxcui: f[13], name: f[14] });
      if (lines % 1_000_000 === 0) process.stdout.write(`\r   Lines: ${lines.toLocaleString()}  CUIs: ${cuiToRxcui.size.toLocaleString()}`);
    }
    console.log(`\n   ✅ Drug CUIs: ${cuiToRxcui.size.toLocaleString()}`);
  }

  // ── Load semantic types ───────────────────────────────────────────────────
  console.log('\n📂 Pass 2: Loading drug semantic types from DB...');
  const c = await pool.connect();
  const drugCuis = new Set<string>();
  {
    const r = await c.query(`SELECT cui FROM umls_semantic_type WHERE sty = ANY($1)`, [Array.from(DRUG_STY)]);
    r.rows.forEach(row => drugCuis.add(row.cui));
    console.log(`   ✅ Drug CUIs (sty filter): ${drugCuis.size.toLocaleString()}`);
  }

  // ── Parse MRREL ──────────────────────────────────────────────────────────
  console.log('\n📂 Pass 3: Parsing MRREL.RRF...');
  await c.query(`DELETE FROM cdss_drug_interaction WHERE source = 'MED-RT'`);
  await c.query(`DELETE FROM cdss_drug_pk WHERE source IN ('NCI','MED-RT')`);

  const rl = readline.createInterface({ input: fs.createReadStream(MRREL, 'utf8') });
  let total = 0, ddiInserted = 0, pkInserted = 0;
  let ddiBatch: any[][] = [];
  let pkBatch: any[][] = [];

  for await (const line of rl) {
    total++;
    const f = line.split('|');
    const cui1 = f[0];
    const cui2 = f[4];
    const rela = f[7];
    const sab  = f[10];
    const suppress = f[14] || 'N';

    if (suppress === 'Y' || suppress === 'E') continue;
    if (!rela) continue;

    // DDI
    if (DDI_RELA.has(rela) && sab === 'MED-RT') {
      if (!drugCuis.has(cui1) || !drugCuis.has(cui2)) continue;
      const d1 = cuiToRxcui.get(cui1);
      const d2 = cuiToRxcui.get(cui2);
      if (!d1 || !d2) continue;

      // Derive mechanism from RELA label
      let mechanism: string | null = null;
      if (rela === 'has_contraindicated_mechanism_of_action') mechanism = 'mechanism_of_action_conflict';
      if (rela === 'has_contraindicated_physiologic_effect')  mechanism = 'pharmacodynamic_conflict';

      ddiBatch.push([d1.rxcui, d2.rxcui, d1.name, d2.name, DDI_RELA.get(rela)!, rela, mechanism, 'MED-RT']);
      ddiInserted++;

      if (ddiBatch.length >= BATCH) {
        await flushDDI(c, ddiBatch);
        ddiBatch = [];
        process.stdout.write(`\r   Lines: ${total.toLocaleString()}  DDI: ${ddiInserted.toLocaleString()}  PK: ${pkInserted.toLocaleString()}`);
      }
    }

    // PK Metabolism (NCI: enzyme CUI1 metabolizes drug CUI2)
    if (rela === 'enzyme_metabolizes_chemical_or_drug' && sab === 'NCI') {
      // CUI1=enzyme, CUI2=drug
      if (!drugCuis.has(cui2)) continue;
      const drug = cuiToRxcui.get(cui2);
      if (!drug) continue;
      const enzyme = cuiToRxcui.get(cui1);
      const enzymeName = enzyme?.name || cui1;
      pkBatch.push([drug.rxcui, drug.name, `Metabolized by: ${enzymeName}`, 'NCI']);
      pkInserted++;

      if (pkBatch.length >= BATCH) {
        await flushPK(c, pkBatch);
        pkBatch = [];
      }
    }

    // PK Metabolism (MED-RT: drug CUI1 has site_of_metabolism CUI2)
    if (rela === 'site_of_metabolism' && sab === 'MED-RT') {
      if (!drugCuis.has(cui1)) continue;
      const drug = cuiToRxcui.get(cui1);
      if (!drug) continue;
      const siteName = cuiToRxcui.get(cui2)?.name || cui2;
      pkBatch.push([drug.rxcui, drug.name, siteName, 'MED-RT']);
      pkInserted++;
    }

    if (total % 10_000_000 === 0) process.stdout.write(`\r   Lines: ${total.toLocaleString()}  DDI: ${ddiInserted.toLocaleString()}  PK: ${pkInserted.toLocaleString()}`);
  }

  if (ddiBatch.length) await flushDDI(c, ddiBatch);
  if (pkBatch.length)  await flushPK(c, pkBatch);

  console.log(`\n\n   ✅ DDI links: ${ddiInserted.toLocaleString()}`);
  console.log(`   ✅ PK entries: ${pkInserted.toLocaleString()}`);

  // ── Verification ──────────────────────────────────────────────────────────
  console.log('\n🔍 Verification:\n');
  const r1 = await c.query(`SELECT severity, COUNT(*) as cnt FROM cdss_drug_interaction GROUP BY severity ORDER BY cnt DESC`);
  console.log('DDI by severity:');
  for (const row of r1.rows) console.log(`  ${row.severity}: ${parseInt(row.cnt).toLocaleString()}`);

  const r2 = await c.query(`SELECT COUNT(*) as cnt FROM cdss_drug_pk`);
  console.log(`\nPK entries: ${parseInt(r2.rows[0].cnt).toLocaleString()}`);

  c.release();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🎉 Phase C2 DDI+PK import complete in ${elapsed}s`);
  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); pool.end(); process.exit(1); });
