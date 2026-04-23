import fs from 'fs';
import readline from 'readline';

const MRREL = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\umls-2025AB-metathesaurus-full\\2025AB\\META\\MRREL.RRF';

// Scan for ALL clinically useful RELA types with counts by source
async function scanAll() {
  const rl = readline.createInterface({ input: fs.createReadStream(MRREL, 'utf8') });
  const counts = new Map<string, number>();
  let total = 0;
  const WANTED = /interact|ddi|drug_drug|pregnancy|lact|pediat|geriat|dose|renal|hepat|age_restrict|has_effect|causes|cause_of|induces|moa|mechanism|excret|absorb|metaboli|plasma|protein_bind|bioavail|half_life|clearance|physio|manifes|adverse|has_component|ingredient|may_treat|may_prevent|contra/i;

  for await (const line of rl) {
    total++;
    const f = line.split('|');
    const rela = f[7];
    const sab  = f[10];
    if (!rela) continue;
    if (WANTED.test(rela)) {
      const key = `${rela} [${sab}]`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (total % 10_000_000 === 0) process.stdout.write(`\r   Lines: ${total.toLocaleString()}`);
  }

  console.log(`\n\n=== CLINICALLY USEFUL RELA TYPES IN MRREL (${total.toLocaleString()} total rows) ===\n`);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  // Group by domain
  const domains: Record<string, string[][]> = {
    'INDICATION':        [], 'ADVERSE EFFECT':    [], 'CONTRAINDICATION':  [],
    'DRUG INTERACTION':  [], 'PHARMACOKINETICS':  [], 'MECHANISM':         [],
    'OTHER CLINICAL':    []
  };
  
  for (const [k, v] of sorted) {
    const line = [`${v.toLocaleString().padStart(8)}`, k];
    if (/may_treat|may_prevent|indication/.test(k))             domains['INDICATION'].push(line);
    else if (/adverse|effect|induces|manifes|cause_of|physio/.test(k)) domains['ADVERSE EFFECT'].push(line);
    else if (/contra|CI_with/.test(k))                          domains['CONTRAINDICATION'].push(line);
    else if (/interact|ddi/.test(k))                            domains['DRUG INTERACTION'].push(line);
    else if (/absorb|metaboli|excret|plasma|clearance|half_life|bioavail|protein_bind/.test(k)) domains['PHARMACOKINETICS'].push(line);
    else if (/moa|mechanism|has_moa|ingredient|has_component/.test(k)) domains['MECHANISM'].push(line);
    else                                                         domains['OTHER CLINICAL'].push(line);
  }

  for (const [domain, rows] of Object.entries(domains)) {
    if (rows.length === 0) continue;
    console.log(`\n── ${domain} ──`);
    for (const [cnt, key] of rows) console.log(`  ${cnt} | ${key}`);
  }
}

// Also check MRSAT for clinical ATN types (first 3M rows sample)
const MRSAT = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\umls-2025AB-metathesaurus-full\\2025AB\\META\\MRSAT.RRF';

async function sampleMrsatFull() {
  console.log('\n\n=== MRSAT.RRF — Clinical ATN types (3M row sample) ===');
  const rl = readline.createInterface({ input: fs.createReadStream(MRSAT, 'utf8') });
  const atnCounts = new Map<string, { cnt: number, sab: string }>();
  let total = 0;
  const WANTED = /adverse|interac|contraind|pregnan|lact|nurs|pediat|geriat|dose|dosing|renal|hepat|warn|precaution|black.?box|pregnancy|lactation|label|drug_class|moa|mechanism|half.?life|protein|bioavail|absorption|distribution|metabolism|excretion|indication|side.?effect/i;

  for await (const line of rl) {
    total++;
    if (total > 3_000_000) break;
    const f = line.split('|');
    const atn = f[8];
    const sab = f[9];
    if (!atn || !WANTED.test(atn)) continue;
    const existing = atnCounts.get(atn) || { cnt: 0, sab };
    atnCounts.set(atn, { cnt: existing.cnt + 1, sab });
    if (total % 500_000 === 0) process.stdout.write(`\r   MRSAT: ${total.toLocaleString()}`);
  }

  console.log(`\n   Sampled ${total.toLocaleString()} MRSAT rows\n`);
  const sorted = [...atnCounts.entries()].sort((a, b) => b[1].cnt - a[1].cnt);
  for (const [atn, { cnt, sab }] of sorted) {
    console.log(`  ${cnt.toLocaleString().padStart(8)} | ${atn} [${sab}]`);
  }
}

async function main() {
  await scanAll();
  await sampleMrsatFull();
}
main().catch(console.error);
