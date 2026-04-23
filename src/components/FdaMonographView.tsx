/**
 * FdaMonographView.tsx
 * Renders parsed FDA SPL content as a structured, clinical-grade monograph UI.
 */
import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Table2, AlignLeft, List } from 'lucide-react';
import { parseFdaText, FdaSection, FdaBlock } from '../lib/parseFdaSpl';
import { cn } from '@/src/lib/utils';

// ── Block renderer ─────────────────────────────────────────────────────────────
function BlockRenderer({ block }: { block: FdaBlock; key?: React.Key }) {
  if (block.type === 'paragraph') {
    return (
      <p className="text-[13px] text-slate-700 leading-relaxed">
        {block.text}
      </p>
    );
  }

  if (block.type === 'list') {
    return (
      <ul className="space-y-1.5 pl-1">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-2 text-[13px] text-slate-700 leading-relaxed">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === 'table') {
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
        {block.title && (
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <Table2 className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">{block.title}</span>
          </div>
        )}
        <table className="w-full text-[12px] border-collapse">
          {block.headers.length > 0 && (
            <thead>
              <tr className="bg-teal-50">
                {block.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left font-bold text-teal-800 text-[11px] uppercase tracking-wider border-b border-teal-100 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-slate-700 border-b border-slate-100 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

// ── Sub-section renderer ───────────────────────────────────────────────────────
function SubSectionRenderer({ sub, accent }: { sub: { number: string; title: string; content: FdaBlock[] }; accent: string; key?: React.Key }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors',
          open ? 'border-b border-slate-100' : ''
        )}
      >
        <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded font-mono shrink-0', accent)}>
          §{sub.number}
        </span>
        <span className="text-[12px] font-bold text-slate-700 uppercase tracking-wider flex-1">{sub.title}</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3 bg-white">
          {sub.content.map((b, i) => <BlockRenderer key={i} block={b} />)}
          {sub.content.length === 0 && (
            <p className="text-[12px] text-slate-400 italic">No structured content</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section accent colours ─────────────────────────────────────────────────────
const SECTION_ACCENTS: Record<string, { badge: string; header: string; border: string }> = {
  '1':  { badge: 'bg-emerald-100 text-emerald-700', header: 'bg-emerald-50 border-emerald-100', border: 'border-emerald-200' },
  '2':  { badge: 'bg-teal-100 text-teal-700',       header: 'bg-teal-50 border-teal-100',       border: 'border-teal-200' },
  '3':  { badge: 'bg-cyan-100 text-cyan-700',       header: 'bg-cyan-50 border-cyan-100',       border: 'border-cyan-200' },
  '4':  { badge: 'bg-red-100 text-red-700',         header: 'bg-red-50 border-red-100',         border: 'border-red-200' },
  '5':  { badge: 'bg-orange-100 text-orange-700',   header: 'bg-orange-50 border-orange-100',   border: 'border-orange-200' },
  '6':  { badge: 'bg-rose-100 text-rose-700',       header: 'bg-rose-50 border-rose-100',       border: 'border-rose-200' },
  '7':  { badge: 'bg-amber-100 text-amber-700',     header: 'bg-amber-50 border-amber-100',     border: 'border-amber-200' },
  '8':  { badge: 'bg-purple-100 text-purple-700',   header: 'bg-purple-50 border-purple-100',   border: 'border-purple-200' },
  '9':  { badge: 'bg-fuchsia-100 text-fuchsia-700', header: 'bg-fuchsia-50 border-fuchsia-100', border: 'border-fuchsia-200' },
  '10': { badge: 'bg-pink-100 text-pink-700',       header: 'bg-pink-50 border-pink-100',       border: 'border-pink-200' },
  '11': { badge: 'bg-sky-100 text-sky-700',         header: 'bg-sky-50 border-sky-100',         border: 'border-sky-200' },
  '12': { badge: 'bg-blue-100 text-blue-700',       header: 'bg-blue-50 border-blue-100',       border: 'border-blue-200' },
  '13': { badge: 'bg-orange-100 text-orange-800',   header: 'bg-orange-50/80 border-orange-100', border: 'border-orange-200' },
  '14': { badge: 'bg-indigo-100 text-indigo-700',   header: 'bg-indigo-50 border-indigo-100',   border: 'border-indigo-200' },
  '16': { badge: 'bg-slate-100 text-slate-700',     header: 'bg-slate-50 border-slate-100',     border: 'border-slate-200' },
  '17': { badge: 'bg-violet-100 text-violet-700',   header: 'bg-violet-50 border-violet-100',   border: 'border-violet-200' },
};
const DEFAULT_ACCENT = { badge: 'bg-slate-100 text-slate-600', header: 'bg-slate-50 border-slate-100', border: 'border-slate-200' };

// ── Main component ─────────────────────────────────────────────────────────────
interface FdaMonographViewProps {
  rawText: string;
  label?: string;  // e.g. "FDA_SPL" source label
  accentTop?: string; // optional override top number for accent
}

export function FdaMonographView({ rawText, label, accentTop }: FdaMonographViewProps) {
  const [view, setView] = useState<'structured' | 'raw'>('structured');
  const sections = parseFdaText(rawText);

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setView('structured')}
            className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors',
              view === 'structured' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
          >
            <List className="w-3 h-3" /> Structured
          </button>
          <button
            onClick={() => setView('raw')}
            className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors',
              view === 'raw' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
          >
            <AlignLeft className="w-3 h-3" /> Raw Text
          </button>
        </div>
        {label && <span className="text-[10px] text-slate-400 font-semibold">{label}</span>}
      </div>

      {view === 'raw' ? (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap font-mono">{rawText}</p>
        </div>
      ) : sections.length === 0 ? (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <p className="text-[12px] text-slate-500 italic">Could not parse structured content.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map(sec => {
            const topNum = accentTop || sec.number;
            const accent = SECTION_ACCENTS[topNum] || DEFAULT_ACCENT;
            return (
              <SectionRenderer key={sec.number} section={sec} accent={accent} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Top-level section renderer ─────────────────────────────────────────────────
function SectionRenderer({ section, accent }: { section: FdaSection; accent: typeof DEFAULT_ACCENT; key?: React.Key }) {
  const [open, setOpen] = useState(true);
  const hasContent = section.content.length > 0 || section.subsections.length > 0;

  return (
    <div className={cn('rounded-xl border overflow-hidden', accent.border)}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn('w-full flex items-center gap-2.5 px-4 py-3 text-left border-b transition-colors', accent.header, open ? '' : 'border-b-0')}
      >
        {section.number && (
          <span className={cn('text-[10px] font-black px-2 py-0.5 rounded font-mono shrink-0', accent.badge)}>
            §{section.number}
          </span>
        )}
        <span className="text-[14px] font-bold text-slate-900 flex-1">{section.title}</span>
        {open
          ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {open && hasContent && (
        <div className="p-4 space-y-4 bg-white">
          {/* Top-level blocks */}
          {section.content.map((b, i) => <BlockRenderer key={i} block={b} />)}

          {/* Sub-sections */}
          {section.subsections.length > 0 && (
            <div className="space-y-2">
              {section.subsections.map(sub => (
                <SubSectionRenderer key={sub.number} sub={sub} accent={accent.badge} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
