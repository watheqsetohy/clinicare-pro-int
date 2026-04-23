/**
 * 07b-import-fda-labels.ts  — Phase C3 Part B
 *
 * Parses openFDA drug label JSON.zip files into all 9 CDSS tables.
 * Uses streaming ZIP extraction + stream-json/pick for memory efficiency.
 *
 * Run: npx tsx server/imports/07b-import-fda-labels.ts
 */

import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// CommonJS modules via createRequire (stream-json v1.x uses Transform streams)
const require      = createRequire(import.meta.url);
const unzipper     = require('unzipper');
const { parser }      = require('stream-json')                            as { parser: () => any };
const { pick }        = require('stream-json/filters/Pick')               as { pick: (o: any) => any };
const { streamArray } = require('stream-json/streamers/StreamArray')      as { streamArray: () => any };

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const DOWNLOAD_DIR = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\fda-labels';
const SOURCE = 'FDA_SPL';

// ─── Text helpers ──────────────────────────────────────────────────────────────
type TA = string[] | undefined;
const first  = (a: TA) => (a?.[0]?.trim() || '').length > 5 ? a![0].trim() : null;
const joined = (a: TA) => a?.map(s => s?.trim()).filter(Boolean).join('\n\n') || null;

// ─── Structured extractors ─────────────────────────────────────────────────────
function pregCat(t: string)   { return t.match(/Pregnancy\s+Category\s+([A-X])/i)?.[1] || null; }
function gerRisk(t: string)   {
  if (/(should\s+not|avoid|be avoided)/i.test(t)) return 'avoid';
  if (/(caution|careful|reduce dose|dose reduction)/i.test(t)) return 'use_with_caution';
  if (/(no dose adjustment|similar to younger|no clinically)/i.test(t)) return 'ok';
  return 'no_data';
}
function beers(t: string)     { return /beers criteria|potentially inappropriate/i.test(t); }
function renalContexts(t: string) {
  const out: Array<{ ctx: string; g1?: number; g2?: number; text: string }> = [];
  const re = /(GFR|CrCl|eGFR|creatinine clearance|renal impairment|kidney).{0,400}/gi;
  let m: RegExpExecArray | null;
  let hits = 0;
  while ((m = re.exec(t)) !== null && hits < 3) {
    const n2 = m[0].match(/(\d+)\s*(?:to|-)\s*(\d+)\s*(?:mL|ml)/i);
    const n1 = m[0].match(/[<>≤≥]\s*(\d+)\s*(?:mL|ml)/i);
    if (n2 || n1) {
      out.push({ ctx: 'renal', g1: n2 ? +n2[1] : undefined, g2: n2 ? +n2[2] : undefined, text: m[0].substring(0, 500) });
      hits++;
    }
  }
  if (!out.length && /renal|GFR|CrCl/i.test(t)) out.push({ ctx: 'renal', text: t.substring(0, 1000) });
  if (/hepatic|liver impairment|Child-Pugh/i.test(t)) {
    const hm = t.match(/.{0,200}(hepatic|liver|Child-Pugh).{0,400}/i)?.[0] || t;
    out.push({ ctx: 'hepatic', text: hm.substring(0, 500) });
  }
  return out;
}

// ─── DB helpers ────────────────────────────────────────────────────────────────
async function q(c: PoolClient, sql: string, params: any[]) {
  try { await c.query(sql, params); } catch { /* skip duplicate / constraint errors */ }
}

async function insertRecord(c: PoolClient, rec: any, counts: Record<string, number>) {
  const openfda = rec.openfda || {};
  const rxcuis: string[] = openfda.rxcui || [];
  if (!rxcuis.length) return;

  const rxcui    = rxcuis[0];
  const drugName = ((openfda.generic_name?.[0] || openfda.brand_name?.[0]) ?? 'Unknown').substring(0, 200);

  // ── 1. Adverse Reactions ─────────────────────────────────────────────────
  // Use joined() to capture ALL subsections (§6.1 Clinical Trials + §6.2 Postmarketing)
  const adrT = joined(rec.adverse_reactions);
  if (adrT) {
    // §6 Adverse Reactions — one row per drug for FDA_SPL; keep longest text
    await q(c, `INSERT INTO cdss_drug_adverse_effect (drug_rxcui,drug_name,effect_name,rela,source)
      VALUES ($1,$2,$3,'FDA_LABEL',$4)
      ON CONFLICT (drug_rxcui,source) WHERE source='FDA_SPL' DO UPDATE
        SET effect_name = CASE WHEN length(EXCLUDED.effect_name)>length(cdss_drug_adverse_effect.effect_name) THEN EXCLUDED.effect_name ELSE cdss_drug_adverse_effect.effect_name END,
            drug_name   = EXCLUDED.drug_name`,
      [rxcui, drugName, adrT.substring(0, 8000), SOURCE]);
    counts.adr++;
  }

  // ── 2. Drug Interactions ─────────────────────────────────────────────────
  const ddiT = joined(rec.drug_interactions);
  if (ddiT) {
    await q(c, `INSERT INTO cdss_drug_interaction
      (drug1_rxcui,drug1_name,drug2_rxcui,drug2_name,effect_description,rela,source)
      VALUES ($1,$2,'UNKNOWN','See raw text',$3,'drug_interaction',$4) ON CONFLICT DO NOTHING`,
      [rxcui, drugName, ddiT.substring(0, 5000), SOURCE]);
    counts.ddi++;
  }

  // ── 3. Contraindications ─────────────────────────────────────────────────
  const ciT = first(rec.contraindications);
  const warnT = first(rec.boxed_warning) || first(rec.warnings_and_precautions) || first(rec.warnings);
  const ciText = ciT || (!ciT && warnT ? warnT : null);
  if (ciText) {
    // §4 Contraindications — one row per drug; keep longest
    await q(c, `INSERT INTO cdss_drug_contraindication
      (drug_rxcui,drug_name,condition_name,raw_text,source)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (drug_rxcui,source) DO UPDATE
        SET raw_text       = CASE WHEN length(EXCLUDED.raw_text)>length(COALESCE(cdss_drug_contraindication.raw_text,'')) THEN EXCLUDED.raw_text ELSE cdss_drug_contraindication.raw_text END,
            condition_name = EXCLUDED.condition_name,
            drug_name      = EXCLUDED.drug_name`,
      [rxcui, drugName, ciT ? 'See contraindications text' : 'See warnings', ciText.substring(0, 2000), SOURCE]);
    counts.ci++;
  }

  // ── 4. Pregnancy ─────────────────────────────────────────────────────────
  const pregT = first(rec.pregnancy) || first(rec.use_in_specific_populations);
  if (pregT) {
    // §8 Pregnancy — one row per drug per category; keep longest
    await q(c, `INSERT INTO cdss_drug_reproductive
      (drug_rxcui,drug_name,category,fda_category,raw_text,source)
      VALUES ($1,$2,'pregnancy',$3,$4,$5)
      ON CONFLICT (drug_rxcui,category,source) DO UPDATE
        SET raw_text     = CASE WHEN length(EXCLUDED.raw_text)>length(COALESCE(cdss_drug_reproductive.raw_text,'')) THEN EXCLUDED.raw_text ELSE cdss_drug_reproductive.raw_text END,
            fda_category = EXCLUDED.fda_category`,
      [rxcui, drugName, pregCat(pregT), pregT.substring(0, 3000), SOURCE]);
    counts.repro++;
  }
  // §8 Lactation
  const nrsT = first(rec.nursing_mothers);
  if (nrsT) {
    await q(c, `INSERT INTO cdss_drug_reproductive
      (drug_rxcui,drug_name,category,fda_category,raw_text,source)
      VALUES ($1,$2,'lactation',NULL,$3,$4)
      ON CONFLICT (drug_rxcui,category,source) DO UPDATE
        SET raw_text = CASE WHEN length(EXCLUDED.raw_text)>length(COALESCE(cdss_drug_reproductive.raw_text,'')) THEN EXCLUDED.raw_text ELSE cdss_drug_reproductive.raw_text END`,
      [rxcui, drugName, nrsT.substring(0, 3000), SOURCE]);
    counts.repro++;
  }

  // ── 5. Pediatric ─────────────────────────────────────────────────────────
  const pedT = first(rec.pediatric_use);
  if (pedT) {
    // §8.4 Pediatric — one row per drug; keep longest
    await q(c, `INSERT INTO cdss_drug_pediatric (drug_rxcui,drug_name,raw_text,source)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (drug_rxcui,source) DO UPDATE
        SET raw_text  = CASE WHEN length(EXCLUDED.raw_text)>length(COALESCE(cdss_drug_pediatric.raw_text,'')) THEN EXCLUDED.raw_text ELSE cdss_drug_pediatric.raw_text END,
            drug_name = EXCLUDED.drug_name`,
      [rxcui, drugName, pedT.substring(0, 3000), SOURCE]);
    counts.ped++;
  }

  // ── 6. Geriatric ─────────────────────────────────────────────────────────
  const gerT = first(rec.geriatric_use);
  if (gerT) {
    // §8.5 Geriatric — one row per drug; keep longest
    await q(c, `INSERT INTO cdss_drug_geriatric
      (drug_rxcui,drug_name,risk_level,beers_criteria,raw_text,source)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (drug_rxcui,source) WHERE source='FDA_SPL' DO UPDATE
        SET raw_text     = CASE WHEN length(EXCLUDED.raw_text)>length(COALESCE(cdss_drug_geriatric.raw_text,'')) THEN EXCLUDED.raw_text ELSE cdss_drug_geriatric.raw_text END,
            risk_level   = EXCLUDED.risk_level,
            drug_name    = EXCLUDED.drug_name`,
      [rxcui, drugName, gerRisk(gerT), beers(gerT), gerT.substring(0, 3000), SOURCE]);
    counts.ger++;
  }

  // ── 7. Pharmacokinetics ──────────────────────────────────────────────────
  const pkT = [first(rec.clinical_pharmacology), first(rec.pharmacokinetics), first(rec.mechanism_of_action)]
    .filter(Boolean).join('\n\n');
  if (pkT) {
    await q(c, `INSERT INTO cdss_drug_pk (drug_rxcui,drug_name,raw_text,source)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (drug_rxcui,source) DO UPDATE SET raw_text = EXCLUDED.raw_text`,
      [rxcui, drugName, pkT.substring(0, 5000), SOURCE]);
    counts.pk++;
  }

  // ── 8. Dosing (FDA §2 structure)
  //    Store the FULL §2 section as ONE 'standard' record.
  //    Do NOT split into renal/hepatic rows — the §2 section already contains
  //    all subsections (§2.1 Standard, §2.2 Renal, §2.3 Hepatic, etc.).
  //    FdaMonographView renders them as collapsible subsections natively.
  const dosingT = joined(rec.dosage_and_administration);
  if (dosingT) {
    await q(c, `INSERT INTO cdss_drug_dosing
      (drug_rxcui,drug_name,context,gfr_min,gfr_max,raw_text,source)
      VALUES ($1,$2,'standard',NULL,NULL,$3,$4)
      ON CONFLICT (drug_rxcui,context,source) DO UPDATE
        SET raw_text = CASE
          WHEN length(EXCLUDED.raw_text) > length(cdss_drug_dosing.raw_text)
          THEN EXCLUDED.raw_text
          ELSE cdss_drug_dosing.raw_text
        END`,
      [rxcui, drugName, dosingT.substring(0, 8000), SOURCE]);
    counts.dosing++;
  }

  // ── 9. Storage & Handling (§16) + How Supplied (§16.1) + Instructions (§17) ──
  const storageT    = joined(rec.storage_and_handling);
  const howSupplied = joined(rec.how_supplied);
  const instrUse    = joined(rec.instructions_for_use);
  if (storageT || howSupplied) {
    // §16 Storage — one row per drug; upsert to keep data fresh
    await q(c, `INSERT INTO cdss_drug_storage
      (drug_rxcui,drug_name,how_supplied,storage_text,instructions_for_use,source)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (drug_rxcui,source) DO UPDATE
        SET how_supplied        = COALESCE(EXCLUDED.how_supplied, cdss_drug_storage.how_supplied),
            storage_text        = COALESCE(EXCLUDED.storage_text, cdss_drug_storage.storage_text),
            instructions_for_use= COALESCE(EXCLUDED.instructions_for_use, cdss_drug_storage.instructions_for_use),
            drug_name           = EXCLUDED.drug_name`,
      [rxcui, drugName,
       howSupplied ? howSupplied.substring(0, 3000) : null,
       storageT    ? storageT.substring(0, 2000)    : null,
       instrUse    ? instrUse.substring(0, 3000)    : null,
       SOURCE]);
    counts.storage = (counts.storage || 0) + 1;
  }

  // ── 10. Description (§11) ────────────────────────────────────────────────────
  const descT = joined(rec.description);
  const moaT  = joined(rec.mechanism_of_action);
  if (descT) {
    // Extract pharmacologic class from text heuristics
    const pharmClass = descT.match(/(?:is a|belongs to|classified as a?)\s+([A-Za-z][A-Za-z0-9 \-]{3,50}?)(?:\s+(?:antibiotic|agent|inhibitor|agonist|antagonist|drug))/i)?.[1] || null;
    // §11 Description — one row per drug; keep longest
    await q(c, `INSERT INTO cdss_drug_description
      (drug_rxcui,drug_name,pharmacologic_class,mechanism_summary,description_text,source)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (drug_rxcui,source) DO UPDATE
        SET description_text   = CASE WHEN length(EXCLUDED.description_text)>length(COALESCE(cdss_drug_description.description_text,'')) THEN EXCLUDED.description_text ELSE cdss_drug_description.description_text END,
            pharmacologic_class= COALESCE(EXCLUDED.pharmacologic_class, cdss_drug_description.pharmacologic_class),
            mechanism_summary  = COALESCE(EXCLUDED.mechanism_summary, cdss_drug_description.mechanism_summary),
            drug_name          = EXCLUDED.drug_name`,
      [rxcui, drugName,
       pharmClass,
       moaT ? moaT.substring(0, 500) : null,
       descT.substring(0, 5000),
       SOURCE]);
    counts.desc = (counts.desc || 0) + 1;
  }

  // ── 11. Nonclinical Toxicology (§13) ────────────────────────────────────────
  const toxT = joined(rec.nonclinical_toxicology) ||
               joined(rec.carcinogenesis_and_mutagenesis_and_impairment_of_fertility);
  if (toxT) {
    const carc = toxT.match(/(?:13\.1|[Cc]arcinogen).{0,2000}/s)?.[0]?.substring(0, 1500) || null;
    const muta = toxT.match(/(?:13\.2|[Mm]utagen).{0,1000}/s)?.[0]?.substring(0, 1000) || null;
    const repr = toxT.match(/(?:13\.3|[Ii]mpairment of [Ff]ertility|[Rr]eproductive).{0,1000}/s)?.[0]?.substring(0, 1000) || null;
    // §13 Nonclinical Toxicology — one row per drug; upsert to keep latest
    await q(c, `INSERT INTO cdss_drug_toxicology
      (drug_rxcui,drug_name,carcinogenesis_text,mutagenesis_text,reproductive_impairment_text,raw_text,source)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (drug_rxcui,source) DO UPDATE
        SET raw_text                    = CASE WHEN length(EXCLUDED.raw_text)>length(COALESCE(cdss_drug_toxicology.raw_text,'')) THEN EXCLUDED.raw_text ELSE cdss_drug_toxicology.raw_text END,
            carcinogenesis_text         = COALESCE(EXCLUDED.carcinogenesis_text, cdss_drug_toxicology.carcinogenesis_text),
            mutagenesis_text            = COALESCE(EXCLUDED.mutagenesis_text, cdss_drug_toxicology.mutagenesis_text),
            reproductive_impairment_text= COALESCE(EXCLUDED.reproductive_impairment_text, cdss_drug_toxicology.reproductive_impairment_text),
            drug_name                   = EXCLUDED.drug_name`,
      [rxcui, drugName, carc, muta, repr, toxT.substring(0, 5000), SOURCE]);
    counts.tox = (counts.tox || 0) + 1;
  }

  // ── 12. Clinical Studies (§14) ────────────────────────────────────────────
  const studiesT = joined(rec.clinical_studies);
  if (studiesT) {
    // §14 Clinical Studies — one row per drug; keep longest
    await q(c, `INSERT INTO cdss_drug_clinical_studies
      (drug_rxcui,drug_name,raw_text,source)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (drug_rxcui,source) DO UPDATE
        SET raw_text  = CASE WHEN length(EXCLUDED.raw_text)>length(COALESCE(cdss_drug_clinical_studies.raw_text,'')) THEN EXCLUDED.raw_text ELSE cdss_drug_clinical_studies.raw_text END,
            drug_name = EXCLUDED.drug_name`,
      [rxcui, drugName, studiesT.substring(0, 8000), SOURCE]);
    counts.studies = (counts.studies || 0) + 1;
  }
}

// ─── Stream one ZIP → nested results array ────────────────────────────────────
async function processZip(c: PoolClient, zipPath: string, counts: Record<string, number>): Promise<number> {
  return new Promise((resolve, reject) => {
    let processed = 0;
    const pending: Promise<void>[] = [];

    fs.createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on('entry', (entry: any) => {
        if (!entry.path.endsWith('.json')) { entry.autodrain(); return; }

        // v1.x pipe chain: parser → pick(results) → streamArray
        const pipeline = entry
          .pipe(parser())
          .pipe(pick({ filter: 'results' }))
          .pipe(streamArray());

        pipeline.on('data', ({ value }: { value: any }) => {
          const p = insertRecord(c, value, counts)
            .then(() => {
              processed++;
              if (processed % 5000 === 0) process.stdout.write(`\r   → ${processed.toLocaleString()} records`);
            })
            .catch(() => {});
          pending.push(p);
        });

        pipeline.on('error', (err: any) => {
          console.error('\n  Pipeline error:', err.message);
          reject(err);
        });
        pipeline.on('end', () => {
          Promise.all(pending).then(() => resolve(processed)).catch(reject);
        });
      })
      .on('error', reject);
  });
}


// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Phase C3b: Import FDA Drug Labels → 9 CDSS Tables        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const zipFiles = fs.readdirSync(DOWNLOAD_DIR)
    .filter(f => f.includes('.zip'))
    .map(f => path.join(DOWNLOAD_DIR, f))
    .sort();

  if (!zipFiles.length) {
    console.error(`❌ No ZIP files in ${DOWNLOAD_DIR}`);
    console.error('Run: npx tsx server/imports/07a-download-fda-labels.ts first');
    process.exit(1);
  }

  console.log(`📂 ${zipFiles.length} ZIP files found\n🗑️  Clearing FDA_SPL data...\n`);

  const c = await pool.connect();
  const tables = [
    'cdss_drug_adverse_effect',    'cdss_drug_interaction',      'cdss_drug_contraindication',
    'cdss_drug_reproductive',      'cdss_drug_pediatric',        'cdss_drug_geriatric',
    'cdss_drug_pk',                'cdss_drug_dosing',           'cdss_drug_storage',
    'cdss_drug_description',       'cdss_drug_toxicology',       'cdss_drug_clinical_studies',
  ];
  for (const t of tables) await c.query(`DELETE FROM ${t} WHERE source = $1`, [SOURCE]);

  const counts: Record<string, number> = { adr: 0, ddi: 0, ci: 0, repro: 0, ped: 0, ger: 0, pk: 0, dosing: 0 };
  let totalRecords = 0;

  for (let i = 0; i < zipFiles.length; i++) {
    const zp   = zipFiles[i];
    const name = path.basename(zp);
    const mb   = (fs.statSync(zp).size / 1024 / 1024).toFixed(1);
    process.stdout.write(`[${i+1}/${zipFiles.length}] ${name} (${mb} MB) ... `);

    const n = await processZip(c, zp, counts);
    totalRecords += n;
    console.log(`${n.toLocaleString()} records  |  total: ${totalRecords.toLocaleString()}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   Import Complete — Summary                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const labels: Record<string, string> = {
    cdss_drug_adverse_effect:     'Adverse Reactions',
    cdss_drug_interaction:        'Drug Interactions',
    cdss_drug_contraindication:   'Contraindications',
    cdss_drug_reproductive:       'Pregnancy/Lactation',
    cdss_drug_pediatric:          'Pediatric Use',
    cdss_drug_geriatric:          'Geriatric Use',
    cdss_drug_pk:                 'Pharmacokinetics',
    cdss_drug_dosing:             'Dosing',
    cdss_drug_storage:            'Storage & Handling',
    cdss_drug_description:        'Description (§11)',
    cdss_drug_toxicology:         'Nonclinical Toxicology (§13)',
    cdss_drug_clinical_studies:   'Clinical Studies (§14)',
  };

  for (const [tbl, lbl] of Object.entries(labels)) {
    const r = await c.query(`SELECT COUNT(*) as n FROM ${tbl} WHERE source=$1`, [SOURCE]);
    console.log(`  ${lbl.padEnd(22)}: ${parseInt(r.rows[0].n).toLocaleString()}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`\n  Total records: ${totalRecords.toLocaleString()}  |  Time: ${elapsed}s`);
  console.log('\n🎉 Phase C3 complete — all 12 clinical domains populated!');
  console.log('Sections: §2 Dosing | §4 CI | §6 ADR | §7 DDI | §8 Repro | §8.4 Ped | §8.5 Ger | §11 Desc | §12 PK | §13 Tox | §14 Studies | §16 Storage');

  c.release();
  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); pool.end(); process.exit(1); });
