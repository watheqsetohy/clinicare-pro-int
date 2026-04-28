/**
 * Fix section titles: replace XML-extracted titles with canonical LOINC_MAP titles
 * This fixes issues like:
 *   §9.2 showing "1.1 Skin and Skin Structure Infections" instead of "Abuse"
 *   §12.2 showing "13 NONCLINICAL TOXICOLOGY" instead of "Pharmacodynamics"
 *   §13 showing "13.1 Carcinogenesis..." instead of "Nonclinical Toxicology"
 */
import { pool } from '../server/db.js';

const LOINC_TITLES: Record<string, string> = {
  '34066-1': '0 BOXED WARNING',
  '34067-9': '1 INDICATIONS AND USAGE',
  '34068-7': '2 DOSAGE AND ADMINISTRATION',
  '43678-2': '3 DOSAGE FORMS AND STRENGTHS',
  '34070-3': '4 CONTRAINDICATIONS',
  '43685-7': '5 WARNINGS AND PRECAUTIONS',
  '34071-1': '5 WARNINGS AND PRECAUTIONS',
  '34084-4': '6 ADVERSE REACTIONS',
  '34073-7': '7 DRUG INTERACTIONS',
  '43684-0': '8 USE IN SPECIFIC POPULATIONS',
  '42228-7': '8.1 Pregnancy',
  '77290-8': '8.2 Lactation',
  '78228-7': '8.3 Females and Males of Reproductive Potential',
  '34081-0': '8.4 Pediatric Use',
  '34082-8': '8.5 Geriatric Use',
  '67544-2': '8.6 Renal Impairment',
  '67545-9': '8.7 Hepatic Impairment',
  '42227-9': '9 DRUG ABUSE AND DEPENDENCE',
  '42228-1': '9.1 Controlled Substance',
  '42229-5': '9.2 Abuse',
  '42230-3': '9.3 Dependence',
  '34088-5': '10 OVERDOSAGE',
  '34089-3': '11 DESCRIPTION',
  '34090-1': '12 CLINICAL PHARMACOLOGY',
  '43679-0': '12.1 Mechanism of Action',
  '43680-8': '12.2 Pharmacodynamics',
  '43681-6': '12.3 Pharmacokinetics',
  '34083-6': '13 NONCLINICAL TOXICOLOGY',
  '34092-7': '14 CLINICAL STUDIES',
  '34093-5': '15 REFERENCES',
  '34069-5': '16 HOW SUPPLIED/STORAGE AND HANDLING',
  '34076-0': '17 PATIENT COUNSELING INFORMATION',
};

async function main() {
  console.log('Fixing section titles using canonical LOINC names...\n');

  let totalUpdated = 0;

  for (const [loincCode, canonicalTitle] of Object.entries(LOINC_TITLES)) {
    const result = await pool.query(`
      UPDATE pharma.spl_section
      SET section_title = $1
      WHERE loinc_code = $2 AND section_title != $1
    `, [canonicalTitle, loincCode]);

    if (result.rowCount && result.rowCount > 0) {
      console.log(`  ✅ ${loincCode} → "${canonicalTitle}" — ${result.rowCount} rows updated`);
      totalUpdated += result.rowCount;
    }
  }

  console.log(`\n✅ Done! Updated ${totalUpdated} section titles.`);

  // Verify ciprofloxacin
  const verify = await pool.query(`
    SELECT section_number, section_title, parent_loinc
    FROM pharma.spl_section
    WHERE setid = '2fc39084-df93-4b13-e063-6394a90a38a8'
    ORDER BY sort_order
  `);
  console.log('\nCiprofloxacin sections after fix:');
  for (const s of verify.rows) {
    const indent = s.parent_loinc ? '    ↳ ' : '';
    console.log(`${indent}§${s.section_number.padEnd(5)} ${s.section_title}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
