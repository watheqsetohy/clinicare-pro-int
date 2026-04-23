/**
 * 10b — Import PharmGKB Drug-Gene Relationships + Drug Labels (FAST version)
 * Uses pre-built in-memory caches for all RxNorm lookups.
 */

import { pool } from '../db.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const SOURCE = 'PHARMGKB';
const BASE   = path.resolve('MED-R/pharmgkb');

async function parseTsv(filePath: string): Promise<Array<Record<string, string>>> {
  const rows: Array<Record<string, string>> = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  let headers: string[] = [];
  let first = true;
  for await (const line of rl) {
    if (first) { headers = line.split('\t'); first = false; continue; }
    const vals = line.split('\t');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').trim(); });
    rows.push(obj);
  }
  return rows;
}

function classifyInteractionType(pk: string, pd: string, assoc: string): string {
  const a = assoc.toLowerCase();
  if (/inhibit/.test(a)) return 'inhibitor';
  if (/induc/.test(a))   return 'inducer';
  if (/substrat/.test(a)) return 'substrate';
  if (/transport/.test(a)) return 'transporter';
  if (pk) return 'substrate';
  if (pd) return 'affected_by';
  return 'substrate';
}

function evidenceLevelFromAssoc(ev: string): string {
  if (/CPIC/.test(ev)) return '1B';
  if (/ClinicalAnnotation/.test(ev)) return '2A';
  if (/VariantAnnotation/.test(ev)) return '3';
  return '4';
}

function clinicalActionFromAssoc(assoc: string): string {
  const a = assoc.toLowerCase();
  if (/contraindicated|avoid/.test(a)) return 'avoid';
  if (/decrease dose|reduce/.test(a))  return 'dose_reduction';
  if (/alternative/.test(a))           return 'alternative';
  if (/monitor|test/.test(a))          return 'monitor';
  return 'informational';
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Phase 10b: Import PharmGKB Relationships (fast)            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  await pool.query(`DELETE FROM cdss_drug_gene_interaction WHERE source = $1`, [SOURCE]);
  console.log('🗑️  Cleared existing PHARMGKB data\n');

  // ── 0. Build bulk in-memory RxNorm name cache ────────────────────────────────
  console.log('🗄️  Building bulk RxNorm name cache...');
  const nameRxcuiCache = new Map<string, Array<{rxcui: string; name: string}>>();
  const rxRows = await pool.query(`
    SELECT rxcui, LOWER(name) as lname, name FROM rxnorm_concept
    WHERE tty IN ('IN','BN','SCD') AND name IS NOT NULL
  `);
  for (const r of rxRows.rows) {
    const key = r.lname as string;
    if (!nameRxcuiCache.has(key)) nameRxcuiCache.set(key, []);
    nameRxcuiCache.get(key)!.push({ rxcui: r.rxcui, name: r.name });
  }
  console.log(`  ✅ Cached ${nameRxcuiCache.size.toLocaleString()} RxNorm concept names`);

  function lookupRxNorm(drugName: string): Array<{rxcui: string; name: string}> {
    const lc = drugName.toLowerCase().trim();
    if (nameRxcuiCache.has(lc)) return nameRxcuiCache.get(lc)!.slice(0, 3);
    for (const [key, val] of nameRxcuiCache) {
      if (key.startsWith(lc) && key.length < lc.length + 15) return val.slice(0, 2);
    }
    return [];
  }

  // ── 1. Build chemical → RxNorm map ────────────────────────────────────────
  const chemMap = new Map<string, Array<{rxcui: string; name: string}>>();
  const chemicals = await parseTsv(path.join(BASE, 'chemicals/chemicals.tsv'));
  for (const r of chemicals) {
    const pgkbId   = r['PharmGKB Accession Id'];
    const rxnorm   = r['RxNorm Identifiers'];
    const chemName = r['Name'];
    if (!pgkbId) continue;
    if (rxnorm) {
      const rxcuis = rxnorm.split(',').map(x => x.trim()).filter(Boolean);
      chemMap.set(pgkbId, rxcuis.map(rx => ({ rxcui: rx, name: chemName })));
    } else if (chemName) {
      const found = lookupRxNorm(chemName);
      if (found.length) chemMap.set(pgkbId, found);
    }
  }
  console.log(`  ✅ Chemical→RxNorm map: ${chemMap.size.toLocaleString()} entries\n`);

  // ── 2. Parse TSV files ─────────────────────────────────────────────────────
  console.log('📋 Parsing TSV files...');
  const rels       = await parseTsv(path.join(BASE, 'relationships/relationships.tsv'));
  const clinVars   = await parseTsv(path.join(BASE, 'clinicalVariants/clinicalVariants.tsv'));
  const drugLabels = await parseTsv(path.join(BASE, 'drugLabels/drugLabels.tsv'));
  console.log(`  relationships: ${rels.length.toLocaleString()} | clinicalVariants: ${clinVars.length.toLocaleString()} | drugLabels: ${drugLabels.length.toLocaleString()}\n`);

  // ── 3. Collect all records in memory ──────────────────────────────────────
  const records: Array<any[]> = [];

  // Relationships
  for (const r of rels) {
    let geneSymbol: string | null = null;
    let chemId: string | null = null;
    let drugName = '';
    if (r['Entity1_type'] === 'Gene' && r['Entity2_type'] === 'Chemical') {
      geneSymbol = r['Entity1_name']; chemId = r['Entity2_id']; drugName = r['Entity2_name'];
    } else if (r['Entity2_type'] === 'Gene' && r['Entity1_type'] === 'Chemical') {
      geneSymbol = r['Entity2_name']; chemId = r['Entity1_id']; drugName = r['Entity1_name'];
    } else continue;
    if (!geneSymbol || !chemId) continue;
    const rxEntries = chemMap.get(chemId) || lookupRxNorm(drugName);
    if (!rxEntries.length) continue;
    const intType = classifyInteractionType(r['PK'], r['PD'], r['Association']);
    const evLevel = evidenceLevelFromAssoc(r['Evidence']);
    const action  = clinicalActionFromAssoc(r['Association']);
    for (const rx of rxEntries.slice(0, 2))
      records.push([rx.rxcui, rx.name || drugName, geneSymbol, intType, action, evLevel, false, SOURCE]);
  }
  console.log(`🔗 Relationships: ${records.length.toLocaleString()} records`);

  // Clinical variants (fast — all in-memory)
  const startCV = records.length;
  for (const cv of clinVars) {
    const gene  = cv['gene']?.trim();
    const level = cv['level of evidence']?.trim();
    const chems = cv['chemicals']?.split(';').map(x => x.trim()).filter(Boolean) || [];
    if (!gene || !chems.length) continue;
    const action = (level === '1A' || level === '1B') ? 'monitor' : 'informational';
    for (const chemName of chems.slice(0, 8)) {
      for (const rx of lookupRxNorm(chemName).slice(0, 2))
        records.push([rx.rxcui, rx.name, gene, 'affected_by', action, level, false, SOURCE]);
    }
  }
  console.log(`🧬 Clinical variants: ${(records.length - startCV).toLocaleString()} records`);

  // Drug labels
  const startDL = records.length;
  for (const dl of drugLabels) {
    const genes = dl['Genes']?.split(';').map(x => x.trim()).filter(Boolean) || [];
    const chems = dl['Chemicals']?.split(';').map(x => x.trim()).filter(Boolean) || [];
    const hasDosing = dl['Has Dosing Info']?.includes('Dosing');
    const isFdaBiomarker = dl['Biomarker Flag']?.toLowerCase().includes('required') || false;
    const action = hasDosing ? 'dose_reduction' : 'monitor';
    for (const gene of genes)
      for (const chem of chems.slice(0, 5))
        for (const rx of lookupRxNorm(chem).slice(0, 2))
          records.push([rx.rxcui, rx.name, gene.trim(), 'affected_by', action, '2A', isFdaBiomarker, SOURCE]);
  }
  console.log(`🏷️  Drug labels: ${(records.length - startDL).toLocaleString()} records`);
  console.log(`\n📦 Total to insert: ${records.length.toLocaleString()}\n`);

  // ── 4. Bulk insert in batches of 500 ──────────────────────────────────────
  let inserted = 0;
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const values = batch.map((_, j) => {
      const b = j * 8;
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`;
    }).join(',');
    try {
      const r = await pool.query(`
        INSERT INTO cdss_drug_gene_interaction
          (drug_rxcui, drug_name, gene_symbol, interaction_type,
           clinical_action, evidence_level, fda_biomarker, source)
        VALUES ${values}
        ON CONFLICT DO NOTHING
      `, batch.flat());
      inserted += r.rowCount || 0;
    } catch {}
    if (i % 10000 === 0 && i > 0) process.stdout.write(`\r  → ${i.toLocaleString()}/${records.length.toLocaleString()} `);
  }
  console.log(`💾 Inserted: ${inserted.toLocaleString()} records`);

  // ── 5. Mark FDA biomarker flag ─────────────────────────────────────────────
  const fdaPgxPairs = [
    ['warfarin','CYP2C9'], ['warfarin','VKORC1'], ['clopidogrel','CYP2C19'],
    ['codeine','CYP2D6'], ['abacavir','HLA-B'], ['carbamazepine','HLA-B'],
    ['allopurinol','HLA-B'], ['azathioprine','TPMT'], ['mercaptopurine','TPMT'],
    ['capecitabine','DPYD'], ['fluorouracil','DPYD'], ['irinotecan','UGT1A1'],
    ['atomoxetine','CYP2D6'], ['tramadol','CYP2D6'], ['tamoxifen','CYP2D6'],
    ['simvastatin','SLCO1B1'], ['atorvastatin','SLCO1B1'],
    ['tacrolimus','CYP3A5'], ['voriconazole','CYP2C19'],
  ];
  for (const [drug, gene] of fdaPgxPairs)
    await pool.query(`UPDATE cdss_drug_gene_interaction SET fda_biomarker = true WHERE LOWER(drug_name) ILIKE $1 AND gene_symbol = $2`, [`%${drug}%`, gene]);

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = await pool.query(`
    SELECT COUNT(*) as n, COUNT(DISTINCT drug_rxcui) as drugs, COUNT(DISTINCT gene_symbol) as genes
    FROM cdss_drug_gene_interaction WHERE source = $1
  `, [SOURCE]);
  const t = total.rows[0];
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  PharmGKB Import Complete                                    ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`  Records: ${parseInt(t.n).toLocaleString()} | Drugs: ${parseInt(t.drugs).toLocaleString()} | Genes: ${parseInt(t.genes).toLocaleString()}`);

  await pool.end();
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
