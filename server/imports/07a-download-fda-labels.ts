/**
 * 07a-download-fda-labels.ts  — Phase C3 Part A
 * 
 * Downloads all FDA drug label bulk files from openFDA.
 * Source: https://api.fda.gov/download.json → results.drug.label
 * 
 * These are gzipped JSON files, each ~128-145 MB compressed.
 * Total: ~13 files, ~1.8 GB compressed → ~10-14 GB uncompressed.
 * 
 * Each JSON record contains:
 *   openfda.rxcui[]            → RxNorm identifiers
 *   openfda.brand_name[]       → brand names
 *   openfda.generic_name[]     → generic names
 *   dosage_and_administration  → dosing text
 *   adverse_reactions          → ADR text
 *   contraindications          → CI text
 *   drug_interactions          → DDI text
 *   pregnancy                  → pregnancy text
 *   nursing_mothers            → lactation text
 *   pediatric_use              → pediatric text
 *   geriatric_use              → geriatric text
 *   clinical_pharmacology      → PK text
 *   warnings / boxed_warning   → safety alerts
 *   indications_and_usage      → indications
 * 
 * Run: npx tsx server/imports/07a-download-fda-labels.ts
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

const DOWNLOAD_DIR = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\fda-labels';
const MANIFEST_URL = 'https://api.fda.gov/download.json';

function get(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      const size = fs.statSync(dest).size;
      if (size > 1_000_000) {
        console.log(`  ⏭  Already downloaded: ${path.basename(dest)} (${(size/1024/1024).toFixed(1)} MB)`);
        return resolve();
      }
    }
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return download(res.headers.location!, dest).then(resolve).catch(reject);
      }
      const total = parseInt(res.headers['content-length'] || '0');
      let received = 0;
      res.on('data', chunk => {
        received += chunk.length;
        file.write(chunk);
        if (total > 0) {
          const pct = ((received / total) * 100).toFixed(1);
          process.stdout.write(`\r  ↓  ${path.basename(dest)}: ${pct}% (${(received/1024/1024).toFixed(1)} / ${(total/1024/1024).toFixed(1)} MB)`);
        }
      });
      res.on('end', () => { file.close(); console.log('  ✅'); resolve(); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Phase C3a: Download FDA Drug Label Bulk Files            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`📂 Download directory: ${DOWNLOAD_DIR}\n`);

  console.log('📡 Fetching openFDA download manifest...');
  const manifest = JSON.parse(await get(MANIFEST_URL));
  const labelFiles: Array<{ file: string; size: number; records: number }> =
    manifest?.results?.drug?.label?.partitions || [];

  if (labelFiles.length === 0) {
    console.error('❌ No label files found in manifest. Check manifest structure.');
    console.log(JSON.stringify(Object.keys(manifest?.results?.drug || {})));
    return;
  }

  console.log(`\n📋 Found ${labelFiles.length} label file partitions:`);
  let totalSize = 0;
  let totalRecords = 0;
  for (const f of labelFiles) {
    const sizeMB = (f.size_compressed_mb || 0);
    totalSize += sizeMB;
    totalRecords += f.records || 0;
    console.log(`  ${path.basename(f.file || f.filename || String(f))} — ${sizeMB.toFixed(1)} MB — ${(f.records || 0).toLocaleString()} records`);
  }
  console.log(`\n  Total: ~${totalSize.toFixed(0)} MB compressed, ${totalRecords.toLocaleString()} records\n`);

  // Download each file
  for (let i = 0; i < labelFiles.length; i++) {
    const entry = labelFiles[i];
    const url  = entry.file || (entry as any).filename || '';
    const name = path.basename(url);
    const dest = path.join(DOWNLOAD_DIR, name);
    console.log(`\n[${i+1}/${labelFiles.length}] ${name}`);
    await download(url, dest);
  }

  console.log('\n🎉 All FDA label files downloaded.');
  console.log(`📂 Location: ${DOWNLOAD_DIR}`);
  console.log('\nNext step: npx tsx server/imports/07b-import-fda-labels.ts');
}

main().catch(console.error);
