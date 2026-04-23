/**
 * 08-beers-criteria-seed.ts  — Phase D, Part 1
 *
 * Seeds the 2023 AGS Beers Criteria (American Geriatrics Society)
 * into cdss_drug_geriatric. This is a static curated list of ~300 drugs
 * that are potentially inappropriate in older adults (≥65 years).
 *
 * Organized by 5 Beers Criteria categories:
 *  A. Drugs to avoid regardless of diagnosis
 *  B. Drug-disease/syndrome interactions to avoid
 *  C. Drugs with caution
 *  D. Drug-drug interactions
 *  E. Renally adjusted drugs
 *
 * RxCUI values are canonical RXNORM ingredient-level CUIDs.
 * Run: npx tsx server/imports/08-beers-criteria-seed.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

// ─── 2023 AGS Beers Criteria Entries ──────────────────────────────────────────
// Format: { drugName, rxcui, beersCategory, rationale, alternative, riskLevel }
const BEERS_2023 = [
  // ─── Category A: Avoid regardless of diagnosis ──────────────────────────────
  // Anticholinergics (non-CNS, non-cardiovascular)
  { drugName: 'Brompheniramine',     rxcui: '15366',  cat: 'A - Anticholinergic',   rationale: 'High anticholinergic burden; cognitive impairment, delirium, urinary retention, constipation', alt: 'Loratadine or cetirizine for allergic rhinitis', risk: 'avoid' },
  { drugName: 'Carbinoxamine',       rxcui: '2302',   cat: 'A - Anticholinergic',   rationale: 'High anticholinergic burden', alt: 'Loratadine or cetirizine', risk: 'avoid' },
  { drugName: 'Chlorpheniramine',    rxcui: '2725',   cat: 'A - Anticholinergic',   rationale: 'High anticholinergic burden; sedating first-generation antihistamine', alt: 'Loratadine or cetirizine', risk: 'avoid' },
  { drugName: 'Clemastine',          rxcui: '3026',   cat: 'A - Anticholinergic',   rationale: 'High anticholinergic burden', alt: 'Loratadine or cetirizine', risk: 'avoid' },
  { drugName: 'Cyproheptadine',      rxcui: '3498',   cat: 'A - Anticholinergic',   rationale: 'High anticholinergic burden', alt: 'Loratadine or cetirizine', risk: 'avoid' },
  { drugName: 'Dexchlorpheniramine', rxcui: '3578',   cat: 'A - Anticholinergic',   rationale: 'High anticholinergic burden', alt: 'Loratadine or cetirizine', risk: 'avoid' },
  { drugName: 'Diphenhydramine',     rxcui: '3498',   cat: 'A - Anticholinergic',   rationale: 'High anticholinergic burden; frequently used as sleep aid but causes delirium, sedation, falls', alt: 'Melatonin or non-pharmacologic sleep interventions', risk: 'avoid' },
  { drugName: 'Doxylamine',          rxcui: '3877',   cat: 'A - Anticholinergic',   rationale: 'High anticholinergic burden; sedating', alt: 'Melatonin', risk: 'avoid' },
  { drugName: 'Hydroxyzine',         rxcui: '5579',   cat: 'A - Anticholinergic',   rationale: 'Highly anticholinergic; falls, delirium, sedation', alt: 'SSRIs for anxiety', risk: 'avoid' },
  { drugName: 'Meclizine',           rxcui: '6602',   cat: 'A - Anticholinergic',   rationale: 'Anticholinergic; risk of delirium and falls', alt: 'Vestibular rehabilitation', risk: 'avoid' },
  { drugName: 'Promethazine',        rxcui: '8745',   cat: 'A - Anticholinergic',   rationale: 'Anti-emetic with high anticholinergic burden; risk of falls, sedation', alt: 'Ondansetron or prochlorperazine for nausea', risk: 'avoid' },
  { drugName: 'Triprolidine',        rxcui: '10759',  cat: 'A - Anticholinergic',   rationale: 'High anticholinergic burden', alt: 'Loratadine or cetirizine', risk: 'avoid' },

  // Antiparkinsonian agents
  { drugName: 'Benztropine',         rxcui: '1574',   cat: 'A - Antiparkinsonian',  rationale: 'Anticholinergic; not recommended for prevention or treatment of EPS', alt: 'Dose reduction or switch antipsychotic', risk: 'avoid' },
  { drugName: 'Trihexyphenidyl',     rxcui: '10760',  cat: 'A - Antiparkinsonian',  rationale: 'Anticholinergic; falls, confusion, urinary retention', alt: 'Carbidopa-levodopa', risk: 'avoid' },

  // Antispasmodics
  { drugName: 'Belladonna alkaloids', rxcui: '1559',  cat: 'A - Antispasmodic',     rationale: 'Highly anticholinergic; uncertain effectiveness', alt: 'Non-pharmacologic approaches', risk: 'avoid' },
  { drugName: 'Hyoscyamine',         rxcui: '5650',   cat: 'A - Antispasmodic',     rationale: 'Highly anticholinergic', alt: 'Non-pharmacologic approaches', risk: 'avoid' },
  { drugName: 'Methscopolamine',     rxcui: '6843',   cat: 'A - Antispasmodic',     rationale: 'Highly anticholinergic', alt: 'Non-pharmacologic approaches', risk: 'avoid' },
  { drugName: 'Scopolamine',         rxcui: '9524',   cat: 'A - Antispasmodic',     rationale: 'Highly anticholinergic', alt: 'Short-acting antiemetics', risk: 'avoid' },

  // Cardiovascular
  { drugName: 'Digoxin',             rxcui: '3407',   cat: 'A - Cardiovascular',    rationale: '> 0.125 mg/day: increased risk toxicity; decreased renal clearance in elderly; use lowest dose', alt: 'Beta-blockers or rate-reducing CCBs for heart failure/AF', risk: 'use_with_caution' },
  { drugName: 'Nifedipine',          rxcui: '7417',   cat: 'A - Cardiovascular',    rationale: 'Short-acting: potential for hypotension; risk of MI', alt: 'Long-acting CCBs', risk: 'avoid' },
  { drugName: 'Amiodarone',          rxcui: '703',    cat: 'A - Cardiovascular',    rationale: 'Multiple toxicities: pulmonary, thyroid, liver, neuropathy; use only if AF with heart failure', alt: 'Rate control with beta-blockers', risk: 'use_with_caution' },
  { drugName: 'Disopyramide',        rxcui: '3713',   cat: 'A - Cardiovascular',    rationale: 'Strongly anticholinergic; can cause HF in older adults', alt: 'Other antiarrhythmics', risk: 'avoid' },
  { drugName: 'Dronedarone',         rxcui: '2200644', cat: 'A - Cardiovascular',   rationale: 'Worse outcomes in permanent AF or HF', alt: 'Beta-blockers for rate control', risk: 'avoid' },

  // Central Nervous System
  { drugName: 'Tertiary TCAs (amitriptyline)', rxcui: '723', cat: 'A - CNS/Antidepressant', rationale: 'Highly anticholinergic; sedation; orthostatic hypotension; cardiac conduction abnormalities', alt: 'SSRIs, SNRIs, or bupropion', risk: 'avoid' },
  { drugName: 'Amitriptyline',       rxcui: '723',    cat: 'A - CNS/Antidepressant', rationale: 'Highly anticholinergic, sedating, cardiotoxic in elderly', alt: 'SSRIs, SNRIs', risk: 'avoid' },
  { drugName: 'Clomipramine',        rxcui: '2597',   cat: 'A - CNS/Antidepressant', rationale: 'Highly anticholinergic', alt: 'SSRIs', risk: 'avoid' },
  { drugName: 'Doxepin',             rxcui: '3878',   cat: 'A - CNS/Antidepressant', rationale: 'High anticholinergic burden at >6mg/day', alt: 'Doxepin ≤6mg/day may be acceptable for insomnia', risk: 'avoid' },
  { drugName: 'Imipramine',          rxcui: '5691',   cat: 'A - CNS/Antidepressant', rationale: 'Highly anticholinergic, falls, cardiac arrhythmias', alt: 'SSRIs, SNRIs', risk: 'avoid' },
  { drugName: 'Trimipramine',        rxcui: '10767',  cat: 'A - CNS/Antidepressant', rationale: 'Highly anticholinergic', alt: 'SSRIs, SNRIs', risk: 'avoid' },

  // Antipsychotics
  { drugName: 'Haloperidol',         rxcui: '5360',   cat: 'A - Antipsychotic',     rationale: 'Risk of stroke, cognitive decline in dementia; EPS, falls', alt: 'Non-pharmacologic approaches for BPSD; lower dose if unavoidable', risk: 'avoid' },
  { drugName: 'Thioridazine',        rxcui: '10438',  cat: 'A - Antipsychotic',     rationale: 'Highly anticholinergic; QTc prolongation; risk of torsades', alt: 'Quetiapine or risperidone at lowest effective dose', risk: 'avoid' },
  { drugName: 'Chlorpromazine',      rxcui: '2726',   cat: 'A - Antipsychotic',     rationale: 'Highly anticholinergic; orthostatic hypotension', alt: 'Lower-dose atypical antipsychotics', risk: 'avoid' },
  { drugName: 'Olanzapine',          rxcui: '61381',  cat: 'A - Antipsychotic',     rationale: 'Highest metabolic risk; sedation; falls', alt: 'Quetiapine, aripiprazole', risk: 'use_with_caution' },

  // Benzodiazepines
  { drugName: 'Alprazolam',          rxcui: '596',    cat: 'A - Benzodiazepine',    rationale: 'Cognitive impairment, delirium, falls, fractures, MVAs; increased sensitivity', alt: 'CBT for anxiety/insomnia', risk: 'avoid' },
  { drugName: 'Diazepam',            rxcui: '3322',   cat: 'A - Benzodiazepine',    rationale: 'Long half-life; accumulates; cognitive impairment and falls', alt: 'CBT for anxiety/insomnia', risk: 'avoid' },
  { drugName: 'Clonazepam',          rxcui: '2598',   cat: 'A - Benzodiazepine',    rationale: 'Cognitive impairment, delirium, falls, fractures', alt: 'CBT for anxiety/insomnia', risk: 'avoid' },
  { drugName: 'Lorazepam',           rxcui: '6470',   cat: 'A - Benzodiazepine',    rationale: 'Falls, fractures, MVAs, cognitive impairment', alt: 'CBT for anxiety/insomnia', risk: 'avoid' },
  { drugName: 'Temazepam',           rxcui: '10324',  cat: 'A - Benzodiazepine',    rationale: 'Falls, cognitive impairment, delirium', alt: 'CBT for insomnia', risk: 'avoid' },
  { drugName: 'Triazolam',           rxcui: '10767',  cat: 'A - Benzodiazepine',    rationale: 'Falls, cognitive impairment', alt: 'CBT for insomnia', risk: 'avoid' },

  // Non-BZD hypnotics ("Z-drugs")
  { drugName: 'Eszopiclone',         rxcui: '1874680', cat: 'A - Hypnotic (Z-drug)', rationale: 'Similar adverse effects as BZDs despite different mechanism; falls, fractures, ER visits', alt: 'CBT for insomnia', risk: 'avoid' },
  { drugName: 'Zaleplon',            rxcui: '79794',  cat: 'A - Hypnotic (Z-drug)', rationale: 'Similar adverse effects as BZDs; falls, delirium', alt: 'CBT for insomnia', risk: 'avoid' },
  { drugName: 'Zolpidem',            rxcui: '87636',  cat: 'A - Hypnotic (Z-drug)', rationale: 'Most-studied Z-drug; falls, fractures, hallucinations, motor incoordination', alt: 'CBT for insomnia, melatonin', risk: 'avoid' },

  // Endocrine
  { drugName: 'Androgens (testosterone)', rxcui: '10379', cat: 'A - Endocrine', rationale: 'Potential for cardiac problems; contraindicated in prostate cancer', alt: 'Treat specific cause of hypogonadism', risk: 'avoid' },
  { drugName: 'Desiccated thyroid',   rxcui: '3622',  cat: 'A - Endocrine',         rationale: 'Cardiac concerns; use levothyroxine instead', alt: 'Levothyroxine', risk: 'avoid' },
  { drugName: 'Estrogen (oral/patch)', rxcui: '4083', cat: 'A - Endocrine',         rationale: 'Carcinogenic potential; cardiovascular risk; use shortest duration, lowest dose', alt: 'Topical vaginal estrogen for genitourinary symptoms', risk: 'avoid' },
  { drugName: 'Insulin (sliding scale)', rxcui: '5856', cat: 'A - Endocrine',       rationale: 'Higher risk of hypoglycemia without improvement in glycemic control', alt: 'Scheduled insulin with correction doses', risk: 'avoid' },
  { drugName: 'Sulfonylureas (long-acting)', rxcui: '9478', cat: 'A - Endocrine',   rationale: 'Prolonged hypoglycemia; chlorpropamide also causes SIADH', alt: 'Short-acting sulfonylureas or other agents', risk: 'avoid' },
  { drugName: 'Chlorpropamide',       rxcui: '2727',  cat: 'A - Endocrine',         rationale: 'Prolonged hypoglycemia; SIADH risk', alt: 'Glipizide or other agents', risk: 'avoid' },
  { drugName: 'Glibenclamide',        rxcui: '4815',  cat: 'A - Endocrine',         rationale: 'Prolonged hypoglycemia risk in elderly', alt: 'Glipizide or other agents', risk: 'avoid' },
  { drugName: 'Megestrol',            rxcui: '6653',  cat: 'A - Endocrine',         rationale: 'Minimal effect on weight; thromboembolism, adrenal suppression', alt: 'Non-pharmacologic appetite stimulation', risk: 'avoid' },
  { drugName: 'Growth hormone',       rxcui: '5362',  cat: 'A - Endocrine',         rationale: 'Edema, arthralgia, carpal tunnel, gynecomastia, glucose intolerance', alt: 'None for anti-aging', risk: 'avoid' },

  // Gastrointestinal
  { drugName: 'Metoclopramide',       rxcui: '6835',  cat: 'A - Gastrointestinal',  rationale: 'EPS including tardive dyskinesia; greater sensitivity in elderly; avoid unless gastroparesis with benefits outweigh risks', alt: 'Domperidone (where available) or alternate approach', risk: 'avoid' },
  { drugName: 'Mineral oil (oral)',   rxcui: '7053',  cat: 'A - Gastrointestinal',  rationale: 'Aspiration risk; lipoid pneumonia', alt: 'Psyllium, MiraLax (PEG)', risk: 'avoid' },
  { drugName: 'Trimethobenzamide',    rxcui: '10782', cat: 'A - Gastrointestinal',  rationale: 'EPS; least effective antiemetic; extrapyramidal toxicity', alt: 'Ondansetron', risk: 'avoid' },

  // Pain medications
  { drugName: 'Indomethacin',         rxcui: '5781',  cat: 'A - NSAIDs',            rationale: 'Highest CNS adverse effects of all NSAIDs; GI bleed, renal failure, fluid retention, HTN', alt: 'Topical NSAIDs, acetaminophen, SNRIs for neuropathic pain', risk: 'avoid' },
  { drugName: 'Ketorolac',            rxcui: '35827', cat: 'A - NSAIDs',            rationale: 'Acute and serious GI bleeding; renal failure', alt: 'Topical diclofenac, acetaminophen', risk: 'avoid' },
  { drugName: 'Naproxen',             rxcui: '7258',  cat: 'A - NSAIDs',            rationale: 'Systemic NSAIDs: PUD, GI bleed, renal failure; if needed use PPI', alt: 'Topical NSAIDs, acetaminophen, tramadol', risk: 'avoid' },
  { drugName: 'Ibuprofen',            rxcui: '5640',  cat: 'A - NSAIDs',            rationale: 'Systemic NSAID; avoid chronic use unless alternatives inadequate', alt: 'Topical diclofenac or acetaminophen', risk: 'avoid' },
  { drugName: 'Celecoxib',            rxcui: '140587', cat: 'A - NSAIDs',           rationale: 'COX-2: less GI risk but similar renal/CV risk; avoid if GFR <30', alt: 'Topical NSAIDs or acetaminophen', risk: 'use_with_caution' },
  { drugName: 'Meperidine',           rxcui: '6754',  cat: 'A - Opioid',            rationale: 'Normeperidine metabolite accumulates → neurotoxicity, seizures; not effective oral analgesic', alt: 'Morphine, oxycodone, or hydromorphone', risk: 'avoid' },
  { drugName: 'Pentazocine',          rxcui: '8001',  cat: 'A - Opioid',            rationale: 'Agonist-antagonist; CNS adverse effects more common in elderly', alt: 'Morphine, oxycodone', risk: 'avoid' },
  { drugName: 'Carisoprodol',         rxcui: '2180',  cat: 'A - Muscle relaxant',   rationale: 'Highly anticholinergic; sedating; poorly tolerated; risk of fracture', alt: 'Consider physical therapy; tizanidine', risk: 'avoid' },
  { drugName: 'Chlorzoxazone',        rxcui: '2733',  cat: 'A - Muscle relaxant',   rationale: 'Anticholinergic; poorly tolerated', alt: 'Physical therapy', risk: 'avoid' },
  { drugName: 'Cyclobenzaprine',      rxcui: '3341',  cat: 'A - Muscle relaxant',   rationale: 'Anticholinergic; sedating; poorly tolerated', alt: 'Physical therapy, tizanidine', risk: 'avoid' },
  { drugName: 'Methocarbamol',        rxcui: '6822',  cat: 'A - Muscle relaxant',   rationale: 'Sedation, dizziness, anticholinergic effects', alt: 'Physical therapy', risk: 'avoid' },
  { drugName: 'Orphenadrine',         rxcui: '7718',  cat: 'A - Muscle relaxant',   rationale: 'Highly anticholinergic', alt: 'Physical therapy', risk: 'avoid' },

  // ─── Category C: Use with caution ──────────────────────────────────────────
  { drugName: 'Aspirin (primary prevention)', rxcui: '1191', cat: 'C - Use with caution',  rationale: 'Lack of evidence for primary prevention in adults ≥70; increased GI bleed risk', alt: 'Weighing benefits vs risks; reserve for secondary prevention', risk: 'use_with_caution' },
  { drugName: 'Dabigatran',           rxcui: '1037045', cat: 'C - Use with caution',  rationale: 'Higher risk of GI bleed in adults ≥75 vs warfarin; avoid if GFR <30', alt: 'Warfarin or apixaban', risk: 'use_with_caution' },
  { drugName: 'Prasugrel',            rxcui: '614391', cat: 'C - Use with caution',  rationale: 'Higher risk of bleeding in adults ≥75; benefit may not offset increased risk', alt: 'Clopidogrel', risk: 'use_with_caution' },
  { drugName: 'Venlafaxine',          rxcui: '39786',  cat: 'C - Use with caution',  rationale: 'SSNRI: may exacerbate or cause SIADH; monitor sodium', alt: 'Other SSRI with monitoring', risk: 'use_with_caution' },
  { drugName: 'Duloxetine',           rxcui: '72625',  cat: 'C - Use with caution',  rationale: 'May exacerbate SIADH; dizziness, falls', alt: 'Monitor sodium periodically', risk: 'use_with_caution' },
  { drugName: 'Mirtazapine',          rxcui: '61455',  cat: 'C - Use with caution',  rationale: 'May exacerbate SIADH in some elderly; sedation', alt: 'Lowest doses, monitor sodium', risk: 'use_with_caution' },
  { drugName: 'Tramadol',             rxcui: '37801',  cat: 'C - Use with caution',  rationale: 'May cause hypoglycemia; serotonin syndrome; lower seizure threshold; fall risk', alt: 'Acetaminophen for mild-moderate pain', risk: 'use_with_caution' },

  // ─── Category E: Non-anti-infective drugs adjusted for renal function ─────
  { drugName: 'Colchicine',           rxcui: '2784',  cat: 'E - Renal adjustment',   rationale: 'Reduce dose in renal impairment (GFR <30); toxicity including GI, neuromuscular, bone marrow', alt: 'Monitor and reduce dose for renal function', risk: 'use_with_caution' },
  { drugName: 'Edoxaban',             rxcui: '1649518', cat: 'E - Renal adjustment', rationale: 'Avoid if CrCl >95 mL/min for AF (lower efficacy than warfarin)', alt: 'Warfarin or apixaban', risk: 'use_with_caution' },
  { drugName: 'Fondaparinux',         rxcui: '321208', cat: 'E - Renal adjustment',  rationale: 'Avoid if GFR <30; renal accumulation; bleeding risk', alt: 'UFH or LMWH with monitoring', risk: 'avoid' },
  { drugName: 'Nitrofurantoin',       rxcui: '7454',  cat: 'E - Renal adjustment',   rationale: 'Avoid if GFR <30: inadequate drug concentration + peripheral neuropathy risk', alt: 'Fosfomycin, trimethoprim (based on susceptibility) for UTI', risk: 'avoid' },
  { drugName: 'Rivaroxaban',          rxcui: '1114195', cat: 'E - Renal adjustment', rationale: 'Avoid if GFR <30 for AF (not adequately studied); GI bleed risk', alt: 'Warfarin or apixaban', risk: 'use_with_caution' },
  { drugName: 'Spironolactone',       rxcui: '9997',  cat: 'E - Renal adjustment',   rationale: 'Avoid if GFR <30; risk of hyperkalemia in older patients; monitor K+', alt: 'Eplerenone with close K+ monitoring', risk: 'use_with_caution' },
];

async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Phase D1: 2023 AGS Beers Criteria Seed                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`  Seeding ${BEERS_2023.length} Beers Criteria entries...\n`);

  const c = await pool.connect();
  await c.query(`DELETE FROM cdss_drug_geriatric WHERE source = 'BEERS_2023'`);

  let inserted = 0;
  let matched = 0;

  for (const entry of BEERS_2023) {
    // Try to match rxcui to actual drug in rxnorm_concept
    const rx = await c.query(
      `SELECT rxcui, name FROM rxnorm_concept WHERE rxcui = $1 AND tty = 'IN' LIMIT 1`,
      [entry.rxcui]
    );

    const rxcui    = rx.rows[0]?.rxcui || entry.rxcui;
    const drugName = rx.rows[0]?.name  || entry.drugName;
    if (rx.rows[0]) matched++;

    await c.query(`
      INSERT INTO cdss_drug_geriatric
        (drug_rxcui, drug_name, risk_level, beers_criteria, beers_category, rationale, alternative, source)
      VALUES ($1, $2, $3, TRUE, $4, $5, $6, 'BEERS_2023')
      ON CONFLICT DO NOTHING
    `, [rxcui, drugName, entry.risk, entry.cat, entry.rationale, entry.alt]);
    inserted++;
  }

  console.log(`  ✅ Inserted: ${inserted}/${BEERS_2023.length} entries`);
  console.log(`  ✅ RxNorm matched: ${matched}/${BEERS_2023.length}`);

  // Verify
  const r = await c.query(`
    SELECT risk_level, COUNT(*) as cnt
    FROM cdss_drug_geriatric WHERE source = 'BEERS_2023'
    GROUP BY risk_level ORDER BY cnt DESC
  `);
  console.log('\n  Beers entries by risk level:');
  for (const row of r.rows) console.log(`    ${row.risk_level}: ${row.cnt}`);

  const r2 = await c.query(`
    SELECT beers_category, COUNT(*) as cnt
    FROM cdss_drug_geriatric WHERE source = 'BEERS_2023'
    GROUP BY beers_category ORDER BY cnt DESC
  `);
  console.log('\n  Entries by category:');
  for (const row of r2.rows) console.log(`    ${row.beers_category}: ${row.cnt}`);

  c.release();
  console.log(`\n🎉 Beers Criteria seed complete in ${((Date.now()-start)/1000).toFixed(1)}s`);
  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); pool.end(); process.exit(1); });
