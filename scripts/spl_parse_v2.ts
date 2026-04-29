/**
 * SPL Parser v2 — Full hierarchical re-parse
 * Captures ALL sections including subsections (§1.1–§1.12, §2.1–§2.4, §5.1–§5.19, etc.)
 * 
 * The key change: instead of relying on LOINC codes (which are duplicated),
 * we walk the XML tree using <title> elements to identify section numbers.
 */
import { pool } from '../server/db.js';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

// Top-level LOINC → section number (for identifying §0-§17 parent sections)
const LOINC_TO_NUM: Record<string, string> = {
  '34066-1': '0', '34067-9': '1', '34068-7': '2', '43678-2': '3',
  '34070-3': '4', '43685-7': '5', '34071-1': '5', '34084-4': '6',
  '34073-7': '7', '43684-0': '8', '42228-7': '8.1', '77290-8': '8.2',
  '78228-7': '8.3', '34081-0': '8.4', '34082-8': '8.5', '67544-2': '8.6',
  '67545-9': '8.7', '42227-9': '9', '42228-1': '9.1', '42230-3': '9.3',
  '34088-5': '10', '34089-3': '11', '34090-1': '12', '43679-0': '12.1',
  '43680-8': '12.2', '43681-6': '12.3', '43682-4': '12.4',
  '34083-6': '13', '34091-9': '13.1', '34092-7': '14',
  '34093-5': '15', '34069-5': '16', '34076-0': '17',
};

const CANONICAL_TITLES: Record<string, string> = {
  '0': 'BOXED WARNING', '1': 'INDICATIONS AND USAGE',
  '2': 'DOSAGE AND ADMINISTRATION', '3': 'DOSAGE FORMS AND STRENGTHS',
  '4': 'CONTRAINDICATIONS', '5': 'WARNINGS AND PRECAUTIONS',
  '6': 'ADVERSE REACTIONS', '7': 'DRUG INTERACTIONS',
  '8': 'USE IN SPECIFIC POPULATIONS', '8.1': 'Pregnancy',
  '8.2': 'Lactation', '8.3': 'Females and Males of Reproductive Potential',
  '8.4': 'Pediatric Use', '8.5': 'Geriatric Use',
  '8.6': 'Renal Impairment', '8.7': 'Hepatic Impairment',
  '9': 'DRUG ABUSE AND DEPENDENCE', '9.1': 'Controlled Substance',
  '9.2': 'Abuse', '9.3': 'Dependence',
  '10': 'OVERDOSAGE', '11': 'DESCRIPTION',
  '12': 'CLINICAL PHARMACOLOGY', '12.1': 'Mechanism of Action',
  '12.2': 'Pharmacodynamics', '12.3': 'Pharmacokinetics',
  '12.4': 'Microbiology',
  '13': 'NONCLINICAL TOXICOLOGY', '13.1': 'Carcinogenesis, Mutagenesis, Impairment of Fertility',
  '13.2': 'Animal Toxicology and/or Pharmacology',
  '14': 'CLINICAL STUDIES', '15': 'REFERENCES',
  '16': 'HOW SUPPLIED/STORAGE AND HANDLING',
  '17': 'PATIENT COUNSELING INFORMATION',
};

function extractTextHtml(textBlock: string): string {
  if (!textBlock) return '';
  let html = textBlock
    .replace(/<paragraph([^>]*)>/g, '<p$1>')
    .replace(/<\/paragraph>/g, '</p>')
    .replace(/<content\s+styleCode="bold italics"[^>]*>/gi, '<strong><em>')
    .replace(/<content\s+styleCode="italics bold"[^>]*>/gi, '<strong><em>')
    .replace(/<content\s+styleCode="bold"[^>]*>/gi, '<strong>')
    .replace(/<content\s+styleCode="italics"[^>]*>/gi, '<em>')
    .replace(/<content\s+styleCode="underline"[^>]*>/gi, '<u>')
    .replace(/<content[^>]*>/gi, '<span>')
    .replace(/<\/content>/gi, '</span>')
    .replace(/<list([^>]*)>/g, '<ul$1>')
    .replace(/<\/list>/g, '</ul>')
    .replace(/<item([^>]*)>/g, '<li$1>')
    .replace(/<\/item>/g, '</li>')
    .replace(/<caption[^>]*>[\s\S]*?<\/caption>/gi, '')
    .replace(/<renderMultiMedia[^>]*\/>/gi, '')
    .replace(/<renderMultiMedia[^>]*>[\s\S]*?<\/renderMultiMedia>/gi, '')
    .replace(/<linkHtml[^>]*>([\s\S]*?)<\/linkHtml>/gi, '$1')
    .replace(/<br\s*\/>/g, '<br>')
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCharCode(parseInt(n)); } catch { return _; }
    });
  html = html.replace(/^<text[^>]*>/, '').replace(/<\/text>$/, '');
  return html.trim();
}

interface SplSection {
  setid: string;
  loinc_code: string;
  section_number: string;
  section_title: string;
  section_html: string;
  parent_loinc: string | null;
  sort_order: number;
}

function parseSplXmlV2(xmlContent: string, setid: string): SplSection[] {
  const sections: SplSection[] = [];
  let globalSort = 0;

  // Strategy: Find each <section> that has a LOINC code OR a numbered <title>
  // Walk through all <component><section> patterns in order

  // Find all section blocks with their positions
  // A section can be identified by <section ID="sN"> or just <section> followed by <code> or <title>
  const sectionPattern = /<section[^>]*>\s*(?:<id[^>]*\/>)?\s*(?:<code\s+code="([^"]*)"[^>]*\/>)?\s*(?:<effectiveTime[^>]*\/>)?\s*<title[^>]*>([\s\S]*?)<\/title>\s*(?:<text>([\s\S]*?)<\/text>)?/gi;
  
  let match;
  const seen = new Set<string>();

  while ((match = sectionPattern.exec(xmlContent)) !== null) {
    const loincCode = match[1] || '';
    const rawTitle = (match[2] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const rawText = match[3] || '';

    // Skip non-clinical sections (package labels, product data, recent changes, etc.)
    if (['48780-1', '43683-2', '34391-3', '51945-4', '42231-1'].includes(loincCode)) continue;
    if (rawTitle.startsWith('PACKAGE LABEL') || rawTitle.startsWith('MEDICATION GUIDE')) continue;
    if (!rawTitle) continue;

    // Determine section number
    let sectionNum = '';
    let cleanTitle = rawTitle;

    // First check LOINC map
    if (loincCode && LOINC_TO_NUM[loincCode]) {
      sectionNum = LOINC_TO_NUM[loincCode];
      cleanTitle = CANONICAL_TITLES[sectionNum] || rawTitle;
    }

    // If not in LOINC map, try to extract number from title
    if (!sectionNum) {
      const numMatch = rawTitle.match(/^(\d+(?:\.\d+)?)\s+(.*)/);
      if (numMatch) {
        sectionNum = numMatch[1];
        cleanTitle = numMatch[2];
      }
    }

    if (!sectionNum) continue; // Can't identify
    if (seen.has(sectionNum)) continue; // Already captured
    seen.add(sectionNum);

    // Use canonical title if available
    if (CANONICAL_TITLES[sectionNum]) {
      cleanTitle = CANONICAL_TITLES[sectionNum];
    }

    // Determine parent
    const dotIdx = sectionNum.indexOf('.');
    const parentNum = dotIdx > -1 ? sectionNum.substring(0, dotIdx) : null;

    // Extract HTML
    const sectionHtml = rawText ? extractTextHtml('<text>' + rawText + '</text>') : '';
    if (!sectionHtml || sectionHtml.length < 3) continue;

    sections.push({
      setid,
      loinc_code: loincCode || '42229-5',
      section_number: sectionNum,
      section_title: cleanTitle,
      section_html: sectionHtml,
      parent_loinc: parentNum,
      sort_order: globalSort++,
    });
  }

  return sections;
}

async function insertSections(sections: SplSection[]) {
  if (sections.length === 0) return;
  const chunkSize = 50;
  for (let i = 0; i < sections.length; i += chunkSize) {
    const chunk = sections.slice(i, i + chunkSize);
    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const s of chunk) {
      placeholders.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6})`);
      values.push(s.setid, s.loinc_code, s.section_number, s.section_title, s.section_html, s.parent_loinc, s.sort_order);
      idx += 7;
    }
    await pool.query(`
      INSERT INTO pharma.spl_section (setid, loinc_code, section_number, section_title, section_html, parent_loinc, sort_order)
      VALUES ${placeholders.join(',')}
    `, values);
  }
}

async function main() {
  const dailyMedDir = 'D:/Healthcare Solutions/MTM Project/MTM/DailyMed/_extracted';
  
  // Clear existing sections
  console.log('Truncating existing sections...');
  await pool.query('TRUNCATE pharma.spl_section RESTART IDENTITY');

  const parts = fs.readdirSync(dailyMedDir).filter(f => fs.statSync(path.join(dailyMedDir, f)).isDirectory());
  let totalSections = 0;
  let totalArchives = 0;
  const startTime = Date.now();

  for (const part of parts) {
    const prescDir = path.join(dailyMedDir, part, 'prescription');
    if (!fs.existsSync(prescDir)) continue;
    
    const innerZips = fs.readdirSync(prescDir).filter(f => f.endsWith('.zip'));
    console.log(`\n📦 ${part}: ${innerZips.length} archives`);

    let partSections = 0;
    let processed = 0;
    let batch: SplSection[] = [];

    for (const innerZipName of innerZips) {
      try {
        const innerPath = path.join(prescDir, innerZipName);
        const innerZip = new AdmZip(innerPath);
        const xmlEntries = innerZip.getEntries().filter(e => e.entryName.endsWith('.xml'));

        for (const xmlEntry of xmlEntries) {
          const xmlContent = xmlEntry.getData().toString('utf8');
          const nameMatch = xmlEntry.entryName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
          const xmlSetid = nameMatch ? nameMatch[1].toLowerCase() : '';
          if (!xmlSetid) continue;

          const sections = parseSplXmlV2(xmlContent, xmlSetid);
          if (sections.length > 0) {
            batch.push(...sections);
            partSections += sections.length;
          }

          if (batch.length >= 500) {
            await insertSections(batch);
            batch = [];
          }
        }
      } catch (err) { /* skip corrupt */ }

      processed++;
      if (processed % 500 === 0) {
        process.stdout.write(`\r  ${part}: ${processed}/${innerZips.length} | ${partSections} sections`);
      }
    }

    if (batch.length > 0) await insertSections(batch);
    totalSections += partSections;
    totalArchives += processed;
    console.log(`\n  ✅ ${part}: ${processed} archives → ${partSections} sections`);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n🎉 Done! ${totalArchives.toLocaleString()} archives → ${totalSections.toLocaleString()} sections in ${elapsed} min`);

  // Stats
  const stats = await pool.query(`
    SELECT section_number, section_title, COUNT(*) as cnt
    FROM pharma.spl_section GROUP BY section_number, section_title
    ORDER BY MIN(sort_order) LIMIT 50
  `);
  console.log('\nSection coverage:');
  console.table(stats.rows);

  const distinct = await pool.query(`SELECT COUNT(DISTINCT setid) as setids FROM pharma.spl_section`);
  console.log(`\nDistinct setids: ${distinct.rows[0].setids}`);

  // Check ciprofloxacin
  const cipro = await pool.query(`
    SELECT section_number, section_title, parent_loinc, LEFT(section_html, 80) as preview
    FROM pharma.spl_section
    WHERE setid = '2fc39084-df93-4b13-e063-6394a90a38a8'
    ORDER BY sort_order
  `);
  console.log('\nCiprofloxacin (tablet):');
  for (const s of cipro.rows) {
    const indent = s.parent_loinc ? '  ↳ ' : '';
    console.log(`${indent}§${s.section_number.padEnd(6)} ${s.section_title.substring(0, 50)}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
