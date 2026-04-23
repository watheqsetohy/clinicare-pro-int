/**
 * 10c — Import CPIC Gene-Drug Guideline Pairs (corrected for actual API format)
 * API field: drugid = "RxNorm:XXXXX"
 */

import { pool } from '../db.js';

const SOURCE = 'CPIC';

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`);
  return resp.json();
}

function cpicActionToClinicAction(level: string): string {
  if (level === 'A') return 'monitor';
  if (level === 'B') return 'monitor';
  return 'informational';
}

function phenotypeToKey(phenotype: string): string {
  const p = (phenotype || '').toLowerCase();
  if (/ultra.?rapid/.test(p)) return 'ultrarapid_metabolizer';
  if (/poor/.test(p)) return 'poor_metabolizer';
  if (/intermediate/.test(p)) return 'intermediate_metabolizer';
  if (/normal|extensive/.test(p)) return 'normal_metabolizer';
  if (/carrier/.test(p)) return 'carrier';
  if (/deficient/.test(p)) return 'poor_metabolizer';
  if (/indeterminate/.test(p)) return 'indeterminate';
  return p.replace(/\s+/g, '_').substring(0, 50);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Phase 10c: Import CPIC Gene-Drug Guideline Pairs           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  await pool.query(`DELETE FROM cdss_drug_gene_interaction WHERE source = $1`, [SOURCE]);
  console.log('🗑️  Cleared existing CPIC data\n');

  // ── 1. Fetch all pairs ──────────────────────────────────────────────────────
  console.log('🌐 Fetching CPIC gene-drug pairs...');
  const pairs: any[] = await fetchJson('https://api.cpicpgx.org/v1/pair?select=*&limit=2000');
  console.log(`  Got ${pairs.length} pairs`);
  // Filter to active pairs only
  const activePairs = pairs.filter(p => !p.removed);
  console.log(`  Active pairs: ${activePairs.length}`);

  // ── 2. Fetch recommendations ────────────────────────────────────────────────
  console.log('🌐 Fetching CPIC recommendations...');
  const recs: any[] = await fetchJson('https://api.cpicpgx.org/v1/recommendation?select=*&limit=5000');
  console.log(`  Got ${recs.length} recommendations`);

  // ── 3. Build pairid → recommendation lookup ────────────────────────────────
  const recsByPair = new Map<number, any[]>();
  for (const rec of recs) {
    const pid = rec.pairid;
    if (!pid) continue;
    if (!recsByPair.has(pid)) recsByPair.set(pid, []);
    recsByPair.get(pid)!.push(rec);
  }

  // ── 4. Insert ─────────────────────────────────────────────────────────────
  let inserted = 0;
  const levelASummary: string[] = [];

  for (const pair of activePairs) {
    const geneSymbol = pair.genesymbol;
    const drugId     = pair.drugid as string; // e.g. "RxNorm:5640"
    const cpicLevel  = pair.cpiclevel;

    if (!geneSymbol || !drugId || !cpicLevel) continue;

    // Extract RxNorm RXCUI
    const rxcuiMatch = drugId.match(/RxNorm:(\d+)/i);
    if (!rxcuiMatch) continue;
    const rxcui = rxcuiMatch[1];

    // Get drug name from DB
    const nameRow = await pool.query(
      `SELECT name FROM rxnorm_concept WHERE rxcui = $1 LIMIT 1`, [rxcui]
    );
    const drugName = nameRow.rows[0]?.name || drugId;

    const clinicalAction = cpicActionToClinicAction(cpicLevel);
    if (cpicLevel === 'A') levelASummary.push(`${geneSymbol} ↔ ${drugName}`);

    const pairRecs = recsByPair.get(pair.pairid) || [];

    if (pairRecs.length > 0) {
      for (const rec of pairRecs) {
        const phenotypes   = rec.phenotypes;
        const recText      = rec.drugrecommendation || '';
        const implications = rec.implications;

        // Extract phenotype strings
        const phenotypeStrs: string[] = [];
        if (phenotypes && typeof phenotypes === 'object') {
          for (const [gene, pheno] of Object.entries(phenotypes)) {
            if (typeof pheno === 'string') phenotypeStrs.push(pheno);
            else if (Array.isArray(pheno)) phenotypeStrs.push(...pheno.map(String));
          }
        }

        // Extract effect from implications
        let effect: string | null = null;
        if (implications && typeof implications === 'object') {
          effect = Object.values(implications).join('; ').substring(0, 300);
        }

        // Action from recommendation text
        let recAction = clinicalAction;
        const recLower = recText.toLowerCase();
        if (/avoid|do not use|contraindicated/.test(recLower)) recAction = 'avoid';
        else if (/reduce dose|decrease dose|lower dose/.test(recLower)) recAction = 'dose_reduction';
        else if (/alternative|consider another/.test(recLower)) recAction = 'alternative';

        const phenotypeKey = phenotypeStrs.length ? phenotypeToKey(phenotypeStrs[0]) : null;

        try {
          await pool.query(`
            INSERT INTO cdss_drug_gene_interaction
              (drug_rxcui, drug_name, gene_symbol, interaction_type,
               phenotype, effect, recommendation, cpic_level,
               clinical_action, evidence_level, source)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          `, [rxcui, drugName, geneSymbol, 'affected_by',
              phenotypeKey, effect, recText.substring(0, 1000), cpicLevel,
              recAction, cpicLevel === 'A' ? '1A' : cpicLevel === 'B' ? '1B' : '2A',
              SOURCE]);
          inserted++;
        } catch {}
      }
    } else {
      // No recommendations — insert summary row
      try {
        await pool.query(`
          INSERT INTO cdss_drug_gene_interaction
            (drug_rxcui, drug_name, gene_symbol, interaction_type,
             cpic_level, clinical_action, evidence_level, source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [rxcui, drugName, geneSymbol, 'affected_by', cpicLevel,
            clinicalAction, cpicLevel === 'A' ? '1A' : cpicLevel === 'B' ? '1B' : '2A',
            SOURCE]);
        inserted++;
      } catch {}
    }
  }

  // ── 5. Mark FDA biomarker flags ─────────────────────────────────────────────
  const fdaPairs = [
    ['warfarin','CYP2C9'],['warfarin','VKORC1'],['clopidogrel','CYP2C19'],
    ['codeine','CYP2D6'],['abacavir','HLA-B'],['carbamazepine','HLA-B'],
    ['azathioprine','TPMT'],['mercaptopurine','TPMT'],['capecitabine','DPYD'],
    ['fluorouracil','DPYD'],['irinotecan','UGT1A1'],['atomoxetine','CYP2D6'],
    ['tramadol','CYP2D6'],['tamoxifen','CYP2D6'],['simvastatin','SLCO1B1'],
    ['tacrolimus','CYP3A5'],['voriconazole','CYP2C19'],['allopurinol','HLA-B'],
  ];
  for (const [drug, gene] of fdaPairs)
    await pool.query(
      `UPDATE cdss_drug_gene_interaction SET fda_biomarker = true WHERE LOWER(drug_name) ILIKE $1 AND gene_symbol = $2`,
      [`%${drug}%`, gene]
    );

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = await pool.query(`
    SELECT cpic_level, COUNT(*) as n, COUNT(DISTINCT drug_rxcui) as drugs
    FROM cdss_drug_gene_interaction WHERE source = $1
    GROUP BY cpic_level ORDER BY cpic_level NULLS LAST
  `, [SOURCE]);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CPIC Import Complete                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  total.rows.forEach((r: any) =>
    console.log(`  Level ${r.cpic_level || '?'}: ${r.n} records | ${r.drugs} drugs`)
  );
  console.log(`\n  Total inserted: ${inserted.toLocaleString()}`);
  if (levelASummary.length) {
    console.log('\n  CPIC Level A (highest evidence):');
    levelASummary.slice(0, 20).forEach(s => console.log(`    ✅ ${s}`));
  }

  await pool.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
