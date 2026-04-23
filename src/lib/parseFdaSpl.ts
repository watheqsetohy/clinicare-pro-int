/**
 * parseFdaSpl.ts
 * Parses FDA SPL raw_text into structured sections and tables.
 * No server changes needed — runs entirely on the frontend.
 *
 * FDA SPL structure:
 *   1  INDICATIONS AND USAGE
 *   2  DOSAGE AND ADMINISTRATION
 *     2.1 Individualized Dosing
 *     2.2 Recommended Target INR Ranges …
 *   3  DOSAGE FORMS AND STRENGTHS
 *   ...up to 17  PATIENT COUNSELING INFORMATION
 */

export interface FdaSubSection {
  number: string;      // e.g. "2.1"
  title: string;       // e.g. "Individualized Dosing"
  content: FdaBlock[]; // ordered content blocks
}

export interface FdaSection {
  number: string;
  title: string;
  subsections: FdaSubSection[];
  content: FdaBlock[];  // top-level blocks before first subsection
}

export type FdaBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'table'; title: string; headers: string[]; rows: string[][] }
  | { type: 'list'; items: string[] };

// ── Known fallback titles (used only when extraction fails) ───────────────────
const SECTION_FALLBACK: Record<string, string> = {
  '1':   'Indications & Usage',
  '2':   'Dosage & Administration',
  '3':   'Dosage Forms & Strengths',
  '4':   'Contraindications',
  '5':   'Warnings & Precautions',
  '6':   'Adverse Reactions',
  '7':   'Drug Interactions',
  '8':   'Use in Specific Populations',
  '9':   'Drug Abuse & Dependence',
  '10':  'Overdosage',
  '11':  'Description',
  '12':  'Clinical Pharmacology',
  '13':  'Nonclinical Toxicology',
  '14':  'Clinical Studies',
  '16':  'Storage & Handling',
  '17':  'Patient Counseling Information',
};

// ── Table detection & parsing ─────────────────────────────────────────────────
function detectAndParseTable(text: string): FdaBlock[] {
  const blocks: FdaBlock[] = [];
  const tableRegex = /Table\s+(\d+[A-Za-z]?)\s*[:.]\s*([^\n]+?)(?=\s{2,}|\s(?=[A-Z][a-z]))([\s\S]*?)(?=Table\s+\d|$)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim();
    if (before.length > 20) blocks.push(...splitToParagraphs(before));

    const tableTitle = `Table ${match[1]}: ${match[2].trim()}`;
    const tableBody = match[3].trim();
    const parsed = parseFlatTable(tableBody);
    if (parsed) {
      blocks.push({ type: 'table', title: tableTitle, headers: parsed.headers, rows: parsed.rows });
    } else {
      blocks.push({ type: 'paragraph', text: tableTitle + '\n' + tableBody });
    }
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining.length > 20) blocks.push(...splitToParagraphs(remaining));

  return blocks.length > 0 ? blocks : splitToParagraphs(text);
}

function parseFlatTable(text: string): { headers: string[]; rows: string[][] } | null {
  if (!text || text.length < 10) return null;
  const dosingPattern = /^(Infection|Type|Disease|Indication)\s+(Dose|Dosage)\s+(Frequency|Interval)\s+(Duration|Days)/i;
  const pkPattern = /^(Dose\s*\(mg\)|Parameter)\s+([\w\s]+(?:\([\w/•·]+\))?)\s+([\w\s]+(?:\([\w/•·]+\))?)/i;

  const lines = text.split(/\s{3,}|\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  const header = lines[0];
  if (dosingPattern.test(header)) {
    const headers = header.split(/\s{2,}/).map(h => h.trim()).filter(Boolean);
    if (headers.length >= 3) {
      const rows = lines.slice(1).map(l => l.split(/\s{2,}/).map(c => c.trim()).filter(Boolean)).filter(r => r.length >= 2);
      return { headers, rows };
    }
  }
  if (pkPattern.test(header)) {
    const headers = header.split(/\s{2,}/).map(h => h.trim()).filter(Boolean);
    const rows = lines.slice(1).map(l => l.split(/\s{2,}|\t/).map(c => c.trim()).filter(Boolean)).filter(r => r.length >= 2);
    if (rows.length > 0) return { headers, rows };
  }
  return null;
}

// ── Paragraph splitter ─────────────────────────────────────────────────────────
function splitToParagraphs(text: string): FdaBlock[] {
  const cleaned = text.trim();
  if (!cleaned) return [];

  // Bullet lists
  if (/[•·]\s/.test(cleaned)) {
    const items = cleaned.split(/[•·]\s+/).map(s => s.trim()).filter(s => s.length > 5);
    if (items.length > 1) {
      const pre = items.shift()!;
      const blocks: FdaBlock[] = [];
      if (pre.length > 10) blocks.push({ type: 'paragraph', text: pre });
      blocks.push({ type: 'list', items });
      return blocks;
    }
  }

  // For very long paragraphs, try splitting on sentence boundaries
  if (cleaned.length > 400) {
    // Split on period + space + capital letter (start of new sentence)
    const sentences = cleaned.split(/(?<=\.)\s+(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 15);
    if (sentences.length > 2) {
      return sentences.map(s => ({ type: 'paragraph' as const, text: s }));
    }
  }

  return [{ type: 'paragraph', text: cleaned }];
}

// ── Utility: title-case a string ──────────────────────────────────────────────
function titleCase(s: string): string {
  const lower = new Set(['and', 'or', 'the', 'of', 'in', 'for', 'to', 'with', 'a', 'an', 'at', 'by', 'on']);
  return s.split(' ').map((w, i) => {
    const lw = w.toLowerCase();
    if (i > 0 && lower.has(lw)) return lw;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

// ── Main parser ────────────────────────────────────────────────────────────────
export function parseFdaText(rawText: string): FdaSection[] {
  if (!rawText || rawText.length < 30) return [];

  const text = rawText;

  // ── Find all section/subsection headers ──────────────────────────────────
  // Pattern: number (like "2" or "2.1" or "12.3") followed by space and
  // an uppercase word. We capture the number and then extract the title
  // up to the next sentence or next section number.
  //
  // This regex is deliberately broader than the old one: it looks for
  //   (\d{1,2}(?:\.\d{1,2})?)\s+  — the section number
  //   ([A-Z][A-Za-z &,/\-()':]+)  — the title text (greedy, uppercase start)
  // We then trim the title at the first lowercase-word that clearly starts
  // body text (e.g. "The", "For", "Adjust", "An" etc.)

  interface HeaderMatch {
    num: string;
    title: string;
    pos: number;   // character position in text where body starts
  }

  const headers: HeaderMatch[] = [];
  // Use a regex that finds "N.N Title" or "N TITLE" patterns
  const re = /(?:^|\s)(\d{1,2}(?:\.\d{1,2})?)\s+([A-Z][A-Za-z &,/\-()':]+)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const num = m[1];
    const rawTitle = m[2].trim();

    // Skip if number is too high (FDA only goes to 17) or if it looks like
    // a dosage reference like "100 mg" or year like "2023"
    const topNum = parseInt(num.split('.')[0], 10);
    if (topNum > 17 || topNum < 1) continue;

    // Title should be at least 3 chars and not just a number
    if (rawTitle.length < 3) continue;

    // Skip if this looks like inline text references like "( 2.1 , 2.2 )"
    // These have parentheses or commas right before the number
    const charsBefore = text.substring(Math.max(0, m.index - 3), m.index + 1);
    if (/\(\s*$/.test(charsBefore) || /,\s*$/.test(charsBefore)) continue;

    // Clean up the title: stop at common body-text starts
    let cleanTitle = rawTitle
      .replace(/\s+(The|A|An|In|For|Each|If|It|Use|Do|This|See|Obtain|Adjust|Review|Consult|After|Patients)\b.*$/i, '')
      .replace(/\s+$/, '');

    // If the cleaned title is too short, use the raw title capped at ~60 chars
    if (cleanTitle.length < 3) {
      cleanTitle = rawTitle.substring(0, 60).replace(/\s+\w*$/, '');
    }

    const bodyStart = m.index + m[0].length;

    headers.push({
      num,
      title: titleCase(cleanTitle),
      pos: bodyStart,
    });
  }

  // Deduplicate: if the same number appears multiple times, keep the first
  const seen = new Set<string>();
  const uniqueHeaders = headers.filter(h => {
    if (seen.has(h.num)) return false;
    seen.add(h.num);
    return true;
  });

  if (uniqueHeaders.length === 0) {
    // No sections detected — return single block
    return [{
      number: '',
      title: 'Clinical Content',
      subsections: [],
      content: detectAndParseTable(text),
    }];
  }

  // ── Extract body text for each header ────────────────────────────────────
  interface Segment {
    num: string;
    title: string;
    body: string;
  }

  const segments: Segment[] = [];
  for (let i = 0; i < uniqueHeaders.length; i++) {
    const h = uniqueHeaders[i];
    const nextPos = i + 1 < uniqueHeaders.length ? uniqueHeaders[i + 1].pos - (uniqueHeaders[i + 1].title.length + uniqueHeaders[i + 1].num.length + 2) : text.length;
    const body = text.slice(h.pos, Math.max(h.pos, nextPos)).trim();
    segments.push({ num: h.num, title: h.title, body });
  }

  // ── Group into top-level sections with subsections ──────────────────────
  const topSections = new Map<string, FdaSection>();

  for (const seg of segments) {
    const isSubsection = seg.num.includes('.');
    const topNum = seg.num.split('.')[0];

    // Determine the title - use extracted title, fallback to lookup
    const title = seg.title || SECTION_FALLBACK[seg.num] || `Section ${seg.num}`;

    // Parse body text into structured blocks
    const content = seg.body.length > 10 ? detectAndParseTable(seg.body) : [];

    if (isSubsection) {
      // Ensure parent section exists
      if (!topSections.has(topNum)) {
        topSections.set(topNum, {
          number: topNum,
          title: SECTION_FALLBACK[topNum] || `Section ${topNum}`,
          subsections: [],
          content: [],
        });
      }
      topSections.get(topNum)!.subsections.push({ number: seg.num, title, content });
    } else {
      // Top-level section
      if (!topSections.has(topNum)) {
        topSections.set(topNum, { number: topNum, title, subsections: [], content });
      } else {
        // Already created by a subsection — update title and prepend content
        const existing = topSections.get(topNum)!;
        existing.title = title;
        existing.content = [...content, ...existing.content];
      }
    }
  }

  return Array.from(topSections.values());
}
