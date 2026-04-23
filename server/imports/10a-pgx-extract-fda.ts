/**
 * 10a — Extract PGx Drug-Gene Interactions from FDA SPL PK text
 * Source: cdss_drug_pk.raw_text (already imported)
 * 
 * Detects: CYP gene substrate/inhibitor/inducer context, metabolizer status,
 * actionable genes (TPMT, DPYD, HLA-B, VKORC1, UGT1A1, NUDT15, etc.)
 */

import { pool } from '../db.js';

const SOURCE = 'FDA_EXTRACTED';

// ── Gene extraction patterns ─────────────────────────────────────────────────
const GENE_PATTERNS: Array<{
  gene: string; geneName: string;
  patterns: RegExp[];
  defaultType: string;
  defaultAction?: string;
}> = [
  { gene: 'CYP2D6',  geneName: 'Cytochrome P450 2D6',
    patterns: [/CYP2D6/g], defaultType: 'substrate' },
  { gene: 'CYP2C19', geneName: 'Cytochrome P450 2C19',
    patterns: [/CYP2C19/g], defaultType: 'substrate' },
  { gene: 'CYP2C9',  geneName: 'Cytochrome P450 2C9',
    patterns: [/CYP2C9\b/g], defaultType: 'substrate' },
  { gene: 'CYP3A4',  geneName: 'Cytochrome P450 3A4',
    patterns: [/CYP3A4/g], defaultType: 'substrate' },
  { gene: 'CYP3A5',  geneName: 'Cytochrome P450 3A5',
    patterns: [/CYP3A5/g], defaultType: 'substrate' },
  { gene: 'CYP1A2',  geneName: 'Cytochrome P450 1A2',
    patterns: [/CYP1A2/g], defaultType: 'substrate' },
  { gene: 'CYP2B6',  geneName: 'Cytochrome P450 2B6',
    patterns: [/CYP2B6/g], defaultType: 'substrate' },
  { gene: 'UGT1A1',  geneName: 'UDP Glucuronosyltransferase Family 1 Member A1',
    patterns: [/UGT1A1/g], defaultType: 'substrate' },
  { gene: 'TPMT',    geneName: 'Thiopurine S-Methyltransferase',
    patterns: [/TPMT/g], defaultType: 'affected_by', defaultAction: 'avoid' },
  { gene: 'DPYD',    geneName: 'Dihydropyrimidine Dehydrogenase',
    patterns: [/DPYD/g], defaultType: 'affected_by', defaultAction: 'avoid' },
  { gene: 'NUDT15',  geneName: 'Nudix Hydrolase 15',
    patterns: [/NUDT15/g], defaultType: 'affected_by', defaultAction: 'dose_reduction' },
  { gene: 'VKORC1',  geneName: 'Vitamin K Epoxide Reductase Complex Subunit 1',
    patterns: [/VKORC1/g], defaultType: 'affected_by', defaultAction: 'monitor' },
  { gene: 'HLA-B',   geneName: 'Human Leukocyte Antigen B',
    patterns: [/HLA-B\b/g], defaultType: 'affected_by', defaultAction: 'avoid' },
  { gene: 'HLA-A',   geneName: 'Human Leukocyte Antigen A',
    patterns: [/HLA-A\b/g], defaultType: 'affected_by', defaultAction: 'avoid' },
  { gene: 'G6PD',    geneName: 'Glucose-6-Phosphate Dehydrogenase',
    patterns: [/G6PD/g], defaultType: 'affected_by', defaultAction: 'avoid' },
  { gene: 'SLCO1B1', geneName: 'Solute Carrier Organic Anion Transporter Family Member 1B1',
    patterns: [/SLCO1B1/g], defaultType: 'transporter', defaultAction: 'monitor' },
  { gene: 'RYR1',    geneName: 'Ryanodine Receptor 1',
    patterns: [/RYR1/g], defaultType: 'affected_by', defaultAction: 'avoid' },
  { gene: 'F5',      geneName: 'Coagulation Factor V (Leiden)',
    patterns: [/factor V leiden|FV Leiden/gi], defaultType: 'affected_by', defaultAction: 'monitor' },
];

// ── Interaction type classifier ───────────────────────────────────────────────
function classifyInteractionType(ctx: string, defaultType: string): string {
  const l = ctx.toLowerCase();
  if (/inhibit(or|s|ed|ion)/.test(l)) return 'inhibitor';
  if (/induc(er|es|ed|tion)/.test(l)) return 'inducer';
  if (/substrat/.test(l)) return 'substrate';
  if (/transport/.test(l)) return 'transporter';
  return defaultType;
}

// ── Metabolizer phenotype extractor ──────────────────────────────────────────
function extractPhenotype(ctx: string): string | null {
  const l = ctx.toLowerCase();
  if (/ultra.?rapid metabolizer/.test(l)) return 'ultrarapid_metabolizer';
  if (/poor metabolizer/.test(l))         return 'poor_metabolizer';
  if (/intermediate metabolizer/.test(l)) return 'intermediate_metabolizer';
  if (/extensive metabolizer/.test(l))    return 'extensive_metabolizer';
  if (/normal metabolizer/.test(l))       return 'normal_metabolizer';
  if (/carrier/.test(l))                  return 'carrier';
  return null;
}

// ── Clinical action classifier ────────────────────────────────────────────────
function classifyAction(ctx: string, defaultAction?: string): string {
  const l = ctx.toLowerCase();
  if (/avoid|contraindicated|do not use/.test(l)) return 'avoid';
  if (/reduce dose|dose reduction|lower dose|decrease dose/.test(l)) return 'dose_reduction';
  if (/alternative|different drug|use another/.test(l)) return 'alternative';
  if (/monitor|closely observe|test|screen/.test(l)) return 'monitor';
  return defaultAction || 'informational';
}

// ── Extract 400-char context window around a match ───────────────────────────
function extractContext(text: string, index: number, window = 400): string {
  const start = Math.max(0, index - window / 2);
  const end   = Math.min(text.length, index + window / 2);
  return text.substring(start, end).replace(/\s+/g, ' ').trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Phase 10a: Extract PGx from FDA PK Text                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Create table if not exists (in case schema hasn't been applied yet)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cdss_drug_gene_interaction (
      id BIGSERIAL PRIMARY KEY, drug_rxcui TEXT NOT NULL, drug_name TEXT,
      gene_symbol TEXT NOT NULL, gene_name TEXT, interaction_type TEXT,
      phenotype TEXT, effect TEXT, recommendation TEXT, cpic_level TEXT,
      fda_biomarker BOOLEAN DEFAULT FALSE, clinical_action TEXT,
      evidence_level TEXT, pharmgkb_id TEXT, raw_text TEXT,
      source TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pgx_drug_rxcui ON cdss_drug_gene_interaction (drug_rxcui);
    CREATE INDEX IF NOT EXISTS idx_pgx_gene       ON cdss_drug_gene_interaction (gene_symbol);
  `);

  // Clear existing FDA_EXTRACTED data
  await pool.query(`DELETE FROM cdss_drug_gene_interaction WHERE source = $1`, [SOURCE]);
  console.log('🗑️  Cleared existing FDA_EXTRACTED PGx data\n');

  // Fetch all PK records
  const pkRows = await pool.query(`
    SELECT drug_rxcui, drug_name, raw_text FROM cdss_drug_pk
    WHERE raw_text IS NOT NULL AND length(raw_text) > 50
  `);
  console.log(`📋 Processing ${pkRows.rows.length.toLocaleString()} PK records...\n`);

  let total = 0;
  const batchSize = 100;
  let batch: any[] = [];

  const flush = async () => {
    if (!batch.length) return;
    for (const r of batch) {
      await pool.query(`
        INSERT INTO cdss_drug_gene_interaction
          (drug_rxcui, drug_name, gene_symbol, gene_name, interaction_type,
           phenotype, clinical_action, evidence_level, raw_text, source)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, r);
    }
    total += batch.length;
    batch = [];
  };

  for (const row of pkRows.rows) {
    const text = row.raw_text as string;
    const rxcui = row.drug_rxcui as string;
    const name  = row.drug_name as string;

    // Deduplicate gene mentions per drug
    const seenGenes = new Set<string>();

    for (const gp of GENE_PATTERNS) {
      for (const pattern of gp.patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const key = `${rxcui}:${gp.gene}`;
          if (seenGenes.has(key)) break;
          seenGenes.add(key);

          const ctx = extractContext(text, match.index);
          const intType  = classifyInteractionType(ctx, gp.defaultType);
          const phenotype = extractPhenotype(ctx);
          const action   = classifyAction(ctx, gp.defaultAction);

          batch.push([rxcui, name, gp.gene, gp.geneName, intType, phenotype, action, '3', ctx.substring(0, 1000), SOURCE]);
          if (batch.length >= batchSize) await flush();
          break;
        }
      }
    }
  }
  await flush();

  console.log(`\n✅ Extracted ${total.toLocaleString()} PGx drug-gene records from FDA PK text`);

  // Summary by gene
  const summary = await pool.query(`
    SELECT gene_symbol, COUNT(*) as n, COUNT(DISTINCT drug_rxcui) as drugs
    FROM cdss_drug_gene_interaction WHERE source = $1
    GROUP BY gene_symbol ORDER BY drugs DESC
  `, [SOURCE]);
  console.log('\n  Gene          Records  Drugs');
  summary.rows.forEach((r:any) =>
    console.log(`  ${r.gene_symbol.padEnd(14)} ${r.n.toString().padStart(7)}  ${r.drugs}`)
  );

  await pool.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
