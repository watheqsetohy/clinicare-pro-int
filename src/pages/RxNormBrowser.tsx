import { useState, useEffect, useRef } from "react";
import { fetchWithAuth } from '../lib/authSession';
import {
  Search, Pill, ChevronRight, ChevronDown, Filter, Activity,
  AlertCircle, Database, BarChart2, Tag, Link2, FlaskConical,
  ArrowRight, CheckCircle2, Info, BookOpen, List, Heart, Shield, Package, FileText, Dna, Menu
} from "lucide-react";
import { cn } from "@/src/lib/utils";

// ─── TTY Metadata ─────────────────────────────────────────────────────────
const TTY_META: Record<string, { label: string; color: string; bg: string; description: string }> = {
  IN:   { label: "Ingredient",        color: "text-blue-700",   bg: "bg-blue-100",   description: "Active ingredient / molecule" },
  PIN:  { label: "Precise Ingredient", color: "text-indigo-700", bg: "bg-indigo-100", description: "Precise ingredient (salt form)" },
  MIN:  { label: "Multi-Ingredient",  color: "text-violet-700", bg: "bg-violet-100", description: "Combination of multiple ingredients" },
  BN:   { label: "Brand Name",        color: "text-amber-700",  bg: "bg-amber-100",  description: "Proprietary / Trade name" },
  SCD:  { label: "Clinical Drug",     color: "text-emerald-700",bg: "bg-emerald-100",description: "Ingredient + Strength + Dose Form (canonical)" },
  SBD:  { label: "Branded Drug",      color: "text-orange-700", bg: "bg-orange-100", description: "Brand + Strength + Dose Form" },
  SCDC: { label: "Drug Component",    color: "text-teal-700",   bg: "bg-teal-100",   description: "Ingredient + Strength component" },
  SCDF: { label: "Drug Form",         color: "text-cyan-700",   bg: "bg-cyan-100",   description: "Ingredient + Dose Form" },
  SBDC: { label: "Branded Component", color: "text-rose-700",   bg: "bg-rose-100",   description: "Brand + Strength component" },
  SBDF: { label: "Branded Form",      color: "text-pink-700",   bg: "bg-pink-100",   description: "Brand + Dose Form" },
  GPCK: { label: "Generic Pack",      color: "text-slate-700",  bg: "bg-slate-100",  description: "Multi-drug generic pack" },
  BPCK: { label: "Branded Pack",      color: "text-slate-700",  bg: "bg-slate-200",  description: "Multi-drug branded pack" },
  DF:   { label: "Dose Form",         color: "text-sky-700",    bg: "bg-sky-100",    description: "Dose form descriptor" },
  DFG:  { label: "Dose Form Group",   color: "text-sky-600",    bg: "bg-sky-50",     description: "Dose form group" },
};

const TTY_ORDER = ['IN', 'PIN', 'MIN', 'BN', 'SCD', 'SBD', 'SCDC', 'SCDF', 'SBDC', 'SBDF', 'GPCK', 'BPCK', 'DF', 'DFG'];

const RELA_LABEL: Record<string, string> = {
  has_ingredient:         "Has Ingredient",
  ingredient_of:          "Ingredient Of",
  tradename_of:           "Tradename Of",
  has_tradename:          "Has Tradename",
  has_dose_form:          "Has Dose Form",
  dose_form_of:           "Dose Form Of",
  has_form:               "Has Form",
  form_of:                "Form Of",
  has_quantified_form:    "Has Quantified Form",
  quantified_form_of:     "Quantified Form Of",
  consists_of:            "Consists Of",
  contained_in:           "Contained In",
  isa:                    "Is A",
  inverse_isa:            "Has Child",
};

interface RxResult {
  rxcui: string;
  name: string;
  tty: string;
}

interface RxConcept {
  rxcui: string;
  names: { rxaui: string; name: string; tty: string }[];
  relations: { relatedRxcui: string; rel: string; rela: string | null; relatedName: string; relatedTty: string }[];
  attributes: { atn: string; atv: string }[];
}

interface DbStatus {
  total: number;
  ingredients: number;
  brands: number;
  clinical_drugs: number;
  branded_drugs: number;
  error?: string;
}

export function RxNormBrowser({
  onSelect,
  isModal = false
}: {
  onSelect?: (drug: { rxcui: string; name: string; tty: string }) => void;
  isModal?: boolean;
} = {}) {
  const [query, setQuery]             = useState("");
  const [results, setResults]         = useState<RxResult[]>([]);
  const [ttyCount, setTtyCount]       = useState<Record<string, number>>({});
  const [loading, setLoading]         = useState(false);
  const [activeTTY, setActiveTTY]     = useState<string[]>([]);
  const [showFilter, setShowFilter]   = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [selectedRxcui, setSelectedRxcui]   = useState<string | null>(null);
  const [concept, setConcept]               = useState<RxConcept | null>(null);
  const [conceptLoading, setConceptLoading] = useState(false);
  const [monograph, setMonograph]           = useState<any>(null);
  const [monographLoading, setMonographLoading] = useState(false);
  const [activeTab, setActiveTab]           = useState<'overview' | 'relations' | 'attributes' | 'cdss' | 'monograph'>('overview');
  const [jumpListOpen, setJumpListOpen]     = useState(false);
  const [monographSearchOpen, setMonographSearchOpen] = useState(false);
  const [monographSearchQuery, setMonographSearchQuery] = useState("");

  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);

  // Load DB status on mount
  useEffect(() => {
    fetchWithAuth('/api/rxnorm/status')
      .then(r => r.json())
      .then(setDbStatus)
      .catch(() => setDbStatus({ total: 0, ingredients: 0, brands: 0, clinical_drugs: 0, branded_drugs: 0, error: 'not_imported' }));
  }, []);

  // Close filter dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length < 2) { setResults([]); setTtyCount({}); return; }
      setLoading(true);
      const ttyParam = activeTTY.length > 0 ? `&tty=${activeTTY.join(',')}` : '';
      fetchWithAuth(`/api/rxnorm/search?q=${encodeURIComponent(query)}${ttyParam}&limit=80`)
        .then(r => r.json())
        .then(data => {
          setResults(data.results || []);
          setTtyCount(data.ttyCount || {});
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [query, activeTTY]);

  // Load concept detail
  useEffect(() => {
    if (!selectedRxcui) { 
      setConcept(null); 
      setMonograph(null);
      return; 
    }
    setConceptLoading(true);
    fetchWithAuth(`/api/rxnorm/concept/${selectedRxcui}`)
      .then(r => r.json())
      .then(data => { setConcept(data); setActiveTab('overview'); })
      .catch(console.error)
      .finally(() => setConceptLoading(false));
      
    setMonographLoading(true);
    fetchWithAuth(`/api/rxnorm/monograph/${selectedRxcui}`)
      .then(r => r.json())
      .then(data => setMonograph(data))
      .catch(console.error)
      .finally(() => setMonographLoading(false));
  }, [selectedRxcui]);

  const toggleTTY = (tty: string) =>
    setActiveTTY(prev => prev.includes(tty) ? prev.filter(t => t !== tty) : [...prev, tty]);

  const filteredResults = activeTTY.length > 0
    ? results.filter(r => activeTTY.includes(r.tty))
    : results;

  const getTTYBadge = (tty: string) => {
    const meta = TTY_META[tty] || { label: tty, color: 'text-slate-700', bg: 'bg-slate-100' };
    return (
      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide", meta.bg, meta.color)}>
        {meta.label}
      </span>
    );
  };

  const isNotImported = dbStatus?.error === 'not_imported' || (dbStatus && Number(dbStatus.total) === 0);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {!isModal && (
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0 shadow-sm z-10 justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Pill className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-base leading-tight">RxNorm Browser</h1>
              <p className="text-[11px] text-slate-400 leading-none">NLM Drug Terminology</p>
            </div>
          </div>

          {/* DB Status Badge */}
          {dbStatus && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border",
              isNotImported
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-emerald-50 border-emerald-200 text-emerald-700"
            )}>
              {isNotImported ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {isNotImported
                ? "RxNorm DB not imported"
                : `${Number(dbStatus.total).toLocaleString()} concepts loaded`
              }
            </div>
          )}
        </header>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Search Panel */}
        <div className="w-[420px] bg-white border-r border-slate-200 flex flex-col shrink-0">

          {/* Stats bar */}
          {dbStatus && !isNotImported && (
            <div className="grid grid-cols-4 gap-0 border-b border-slate-100">
              {[
                { label: "Ingredients", value: dbStatus.ingredients, icon: FlaskConical, color: "text-blue-600" },
                { label: "Brands", value: dbStatus.brands, icon: Tag, color: "text-amber-600" },
                { label: "Clin. Drugs", value: dbStatus.clinical_drugs, icon: Pill, color: "text-emerald-600" },
                { label: "Brand Drugs", value: dbStatus.branded_drugs, icon: BarChart2, color: "text-orange-600" },
              ].map(stat => (
                <div key={stat.label} className="flex flex-col items-center justify-center py-2 px-1 border-r last:border-0 border-slate-100">
                  <stat.icon className={cn("w-3.5 h-3.5 mb-0.5", stat.color)} />
                  <span className="text-[11px] font-bold text-slate-700">{Number(stat.value).toLocaleString()}</span>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wide">{stat.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Not Imported Warning */}
          {isNotImported && (
            <div className="m-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">RxNorm Database Not Imported</p>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    1. Download <strong>RxNorm Full Monthly Release</strong> from NLM<br />
                    2. Unzip → place RRF files in <code className="bg-amber-100 px-1 rounded">RxNorm/rrf/</code><br />
                    3. Run: <code className="bg-amber-100 px-1 rounded">npx tsx server/import-rxnorm-pg.ts</code>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b-2 border-emerald-500 px-1 pb-1">Search</span>
              <div ref={filterRef} className="relative">
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all",
                    activeTTY.length > 0
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-300 text-slate-600 bg-white hover:bg-slate-50"
                  )}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filter by Type {activeTTY.length > 0 && `(${activeTTY.length})`}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>
                {showFilter && (
                  <div 
                    className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Term Types (TTY)</div>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {TTY_ORDER.filter(t => ttyCount[t] !== undefined || activeTTY.includes(t)).map(tty => {
                        const meta = TTY_META[tty] || { label: tty, color: 'text-slate-700', bg: 'bg-slate-100', description: '' };
                        return (
                          <label key={tty} className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={activeTTY.includes(tty)}
                                onChange={() => toggleTTY(tty)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className={cn("text-[11px] font-bold px-1.5 py-0.5 rounded", meta.bg, meta.color)}>{tty}</span>
                              <span className="text-xs text-slate-600">{meta.label}</span>
                            </div>
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">
                              {ttyCount[tty] || 0}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Type drug name, ingredient, brand..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex justify-between items-center text-[11px] text-slate-400 px-0.5">
              <span>{query.length >= 2 ? `${filteredResults.length} results` : 'Type 2+ characters to search'}</span>
              {loading && <Activity className="w-3.5 h-3.5 text-emerald-500 animate-spin" />}
            </div>
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto">
            {filteredResults.map((result, idx) => {
              const meta = TTY_META[result.tty] || { label: result.tty, color: 'text-slate-600', bg: 'bg-slate-100' };
              const isSelected = selectedRxcui === result.rxcui;
              return (
                <div
                  key={`${result.rxcui}-${result.tty}-${idx}`}
                  onClick={() => setSelectedRxcui(result.rxcui)}
                  className={cn(
                    "flex items-start gap-3 p-3 border-b border-slate-100 cursor-pointer transition-colors relative",
                    isSelected ? "bg-emerald-50/60" : "hover:bg-slate-50"
                  )}
                >
                  {isSelected && <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500" />}
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black mt-0.5 border", meta.bg, meta.color, "border-current/20")}>
                    {result.tty}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 leading-snug truncate" title={result.name}>
                      {result.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400 font-mono">RXCUI: {result.rxcui}</span>
                      <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded", meta.bg, meta.color)}>
                        {meta.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {query.length >= 2 && filteredResults.length === 0 && !loading && (
              <div className="flex flex-col items-center py-12 text-slate-400">
                <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No matches found</p>
                <p className="text-xs mt-1">Try a different search term or TTY filter</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Concept Detail Panel */}
        <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden">
          {conceptLoading ? (
            <div className="h-full flex items-center justify-center">
              <Activity className="w-10 h-10 text-emerald-500 animate-spin opacity-50" />
            </div>
          ) : concept ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Concept Header */}
              <div className="bg-gradient-to-r from-emerald-700 to-teal-700 p-6 shrink-0 relative overflow-hidden">
                <div className="absolute top-0 right-0 opacity-10 translate-x-4 -translate-y-2">
                  <Pill className="w-32 h-32" />
                </div>
                <div className="relative z-10">
                  {/* Primary name (SCD > IN > BN > first) */}
                  {(() => {
                    const primary = concept.names.find(n => n.tty === 'SCD')
                      || concept.names.find(n => n.tty === 'IN')
                      || concept.names.find(n => n.tty === 'BN')
                      || concept.names[0];
                    const ttyBadge = primary ? (TTY_META[primary.tty] || { label: primary.tty, color: 'text-white', bg: 'bg-white/20' }) : null;
                    return (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          {ttyBadge && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white">
                              {ttyBadge.label}
                            </span>
                          )}
                        </div>
                        <h2 className="text-xl font-bold text-white leading-snug mb-1">
                          {primary?.name || `RXCUI: ${concept.rxcui}`}
                        </h2>
                        <p className="text-emerald-200 text-sm font-mono">RXCUI: {concept.rxcui}</p>

                        {onSelect && (
                          <button
                            onClick={() => primary && onSelect({ rxcui: concept.rxcui, name: primary.name, tty: primary.tty })}
                            className="mt-4 flex items-center gap-2 bg-white text-emerald-700 font-semibold px-4 py-2 rounded-lg text-sm shadow-sm hover:bg-emerald-50 transition-colors"
                          >
                            <Pill className="w-4 h-4" /> Select This Drug
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex justify-between border-b border-slate-200 bg-white px-6">
                <div className="flex gap-6">
                  {[
                    { id: 'overview', label: 'Names & Forms' },
                    { id: 'relations', label: 'Relationships' },
                    { id: 'attributes', label: 'Attributes' },
                    { id: 'cdss', label: 'CDSS' },
                    { id: 'monograph', label: 'Clinical Monograph' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={cn(
                        "flex items-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors",
                        activeTab === tab.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {tab.label}
                      {tab.id === 'relations' && concept.relations.length > 0 && (
                        <span className="ml-1 bg-slate-100 text-slate-600 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                          {concept.relations.length}
                        </span>
                      )}
                      {tab.id === 'monograph' && monograph?.fdaSections?.length > 0 && (
                        <span className="ml-1 w-2 h-2 rounded-full bg-blue-500"></span>
                      )}
                      {tab.id === 'cdss' && monograph && (monograph.indications?.length > 0 || monograph.contraindications?.length > 0 || monograph.medrtDDI?.length > 0 || monograph.pgxInteractions?.length > 0) && (
                        <span className="ml-1 w-2 h-2 rounded-full bg-emerald-500"></span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Jump List & Search Toggle (only when monograph is active and has sections) */}
                {activeTab === 'monograph' && monograph?.fdaSections?.length > 0 && (
                  <div className="relative flex items-center gap-1">
                    
                    {/* Search Button */}
                    <button
                      onClick={() => { setMonographSearchOpen(!monographSearchOpen); setJumpListOpen(false); }}
                      className={cn(
                        "p-2 rounded-md transition-colors hover:bg-slate-100",
                        monographSearchOpen ? "bg-slate-100 text-blue-700" : "text-slate-500"
                      )}
                      title="Search in Monograph"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                    
                    {/* Jump List Toggle Button */}
                    <button
                      onClick={() => { setJumpListOpen(!jumpListOpen); setMonographSearchOpen(false); }}
                      className={cn(
                        "p-2 rounded-md transition-colors hover:bg-slate-100",
                        jumpListOpen ? "bg-slate-100 text-emerald-700" : "text-slate-500"
                      )}
                      title="Toggle Jump List"
                    >
                      <Menu className="w-5 h-5" />
                    </button>

                    {/* Search Dropdown */}
                    {monographSearchOpen && (
                      <div className="absolute top-full right-0 mt-1 w-96 bg-white rounded-lg shadow-xl border border-slate-200 z-50 max-h-[70vh] flex flex-col overflow-hidden">
                        <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                          <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search in FDA monograph..."
                              value={monographSearchQuery}
                              onChange={(e) => setMonographSearchQuery(e.target.value)}
                              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
                            />
                          </div>
                        </div>
                        <div className="overflow-y-auto p-2">
                          {monographSearchQuery.trim().length < 3 ? (
                            <div className="p-4 text-center text-xs text-slate-400">Type at least 3 characters to search...</div>
                          ) : (() => {
                            const q = monographSearchQuery.trim().toLowerCase();
                            const results = monograph.fdaSections.map((sec: any) => {
                              const rawText = (sec.html || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ');
                              const lowerText = rawText.toLowerCase();
                              const idx = lowerText.indexOf(q);
                              if (idx !== -1 || sec.title.toLowerCase().includes(q)) {
                                let snippet = '';
                                if (idx !== -1) {
                                  const start = Math.max(0, idx - 40);
                                  const end = Math.min(rawText.length, idx + q.length + 40);
                                  snippet = rawText.substring(start, end);
                                  if (start > 0) snippet = '...' + snippet;
                                  if (end < rawText.length) snippet = snippet + '...';
                                }
                                return { sec, snippet, idx };
                              }
                              return null;
                            }).filter(Boolean);

                            if (results.length === 0) {
                              return <div className="p-4 text-center text-xs text-slate-400">No matches found.</div>;
                            }

                            return results.map(({ sec, snippet, idx }: any, i: number) => {
                              const isBoxed = sec.sectionNumber === '0';
                              return (
                                <button key={i}
                                  onClick={() => {
                                    setMonographSearchOpen(false);
                                    // small delay to let UI close then scroll
                                    setTimeout(() => {
                                      const el = document.getElementById(`fda-sec-${sec.sectionNumber}`);
                                      if (el) {
                                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        // expand if it's a details element
                                        if (el.tagName === 'DETAILS') el.setAttribute('open', 'true');
                                      }
                                    }, 50);
                                  }}
                                  className="w-full text-left p-3 mb-1 rounded-md hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100 block"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={cn("text-[10px] font-mono font-bold", isBoxed ? "text-red-500" : "text-blue-600")}>
                                      {isBoxed ? '⚠ §0' : `§${sec.sectionNumber}`}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-800 line-clamp-1">{sec.title}</span>
                                  </div>
                                  {snippet ? (
                                    <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                                      {/* Highlight the match if we want, or just show text */}
                                      {snippet.split(new RegExp(`(${monographSearchQuery.trim()})`, 'gi')).map((part: string, k: number) => 
                                        part.toLowerCase() === monographSearchQuery.trim().toLowerCase() 
                                          ? <span key={k} className="bg-yellow-200 text-yellow-900 font-semibold px-0.5 rounded">{part}</span> 
                                          : <span key={k}>{part}</span>
                                      )}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] text-slate-400 italic">Matched in title</p>
                                  )}
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Jump List Dropdown */}
                    {jumpListOpen && (
                      <div className="absolute top-full right-0 mt-1 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 max-h-[70vh] flex flex-col overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Monograph Contents</span>
                        </div>
                        <div className="overflow-y-auto p-2">
                          {monograph.fdaSections.map((sec: any) => {
                            const isBoxed = sec.sectionNumber === '0';
                            
                            // Check if it's a sub-section (has a dot) to indent it
                            const depth = (sec.sectionNumber.match(/\./g) || []).length;
                            const isSub = depth > 0;
                            
                            return (
                              <button key={sec.sectionNumber}
                                onClick={() => {
                                  setJumpListOpen(false);
                                  document.getElementById(`fda-sec-${sec.sectionNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}
                                className={cn(
                                  'w-full text-left px-3 py-2 rounded-md text-xs font-semibold hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100 flex items-start gap-2',
                                  isBoxed ? 'text-red-600 bg-red-50/50' : 'text-slate-700',
                                  isSub ? (depth === 1 ? 'ml-4 w-[calc(100%-1rem)] text-slate-600 text-[11px]' : 'ml-8 w-[calc(100%-2rem)] text-slate-500 text-[10px]') : ''
                                )}
                              >
                                <span className={cn(
                                  "shrink-0 font-mono font-bold mt-0.5",
                                  isBoxed ? "text-red-500" : "text-blue-600"
                                )}>
                                  {isBoxed ? '⚠ §0' : `§${sec.sectionNumber}`}
                                </span>
                                <span className="leading-snug flex-1">
                                  {sec.title}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-6">

                {/* Overview: All names grouped by TTY */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    {TTY_ORDER.filter(tty => concept.names.some(n => n.tty === tty)).map(tty => {
                      const meta = TTY_META[tty] || { label: tty, color: 'text-slate-700', bg: 'bg-slate-100', description: '' };
                      const names = concept.names.filter(n => n.tty === tty);
                      return (
                        <div key={tty} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className={cn("px-4 py-2.5 border-b border-slate-100 flex items-center justify-between", meta.bg)}>
                            <div className="flex items-center gap-2">
                              <span className={cn("text-[11px] font-black uppercase tracking-wider", meta.color)}>{tty}</span>
                              <span className={cn("text-xs font-semibold", meta.color)}>{meta.label}</span>
                            </div>
                            <span className="text-[10px] text-slate-500">{meta.description}</span>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {names.map(n => (
                              <div key={n.rxaui} className="px-4 py-2.5 flex items-center justify-between group hover:bg-slate-50/50 transition-colors">
                                <span className="text-sm text-slate-800 font-medium">{n.name}</span>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {onSelect && (
                                    <button
                                      onClick={() => onSelect({ rxcui: concept.rxcui, name: n.name, tty: n.tty })}
                                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md"
                                    >
                                      <ArrowRight className="w-3 h-3" /> Select
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Relations */}
                {activeTab === 'relations' && (
                  <div className="space-y-2">
                    {concept.relations.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <Link2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No relationships found</p>
                      </div>
                    ) : (
                      concept.relations.map((rel, i) => {
                        const relMeta = rel.relatedTty ? (TTY_META[rel.relatedTty] || { label: rel.relatedTty, color: 'text-slate-600', bg: 'bg-slate-100' }) : null;
                        return (
                          <div
                            key={i}
                            onClick={() => setSelectedRxcui(rel.relatedRxcui)}
                            className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-4 cursor-pointer hover:border-emerald-300 hover:shadow-sm transition-all group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {relMeta && (
                                <span className={cn("text-[10px] font-black uppercase px-1.5 py-0.5 rounded shrink-0", relMeta.bg, relMeta.color)}>
                                  {rel.relatedTty}
                                </span>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">{rel.relatedName || rel.relatedRxcui}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                                    {rel.rela ? (RELA_LABEL[rel.rela] || rel.rela) : rel.rel}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">RXCUI: {rel.relatedRxcui}</span>
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 shrink-0 transition-colors" />
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Attributes */}
                {activeTab === 'attributes' && (
                  <div className="space-y-2">
                    {concept.attributes.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No attributes found for this concept</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Attribute</th>
                              <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {concept.attributes.map((attr, i) => (
                              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-2.5 font-mono text-[12px] text-blue-700 font-semibold">{attr.atn}</td>
                                <td className="px-4 py-2.5 text-slate-700">{attr.atv}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ CDSS Tab — Clinical Decision Support (ingredient-level) ═══ */}
                {activeTab === 'cdss' && (
                  <div className="space-y-6 pb-8">
                    {monographLoading ? (
                      <div className="flex justify-center py-12"><Activity className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                    ) : !monograph ? (
                      <div className="text-center py-12 text-slate-400">
                        <p className="text-sm font-semibold text-slate-600">No CDSS Data</p>
                        <p className="text-xs mt-1">Select a drug to view clinical decision support data.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* CDSS Header */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white bg-emerald-600 px-2.5 py-1 rounded-md">CDSS</span>
                            <span className="text-[12px] font-bold text-slate-600">Clinical Decision Support</span>
                          </div>
                          <div className="flex-1 border-t border-emerald-200" />
                          <span className="text-[9px] text-slate-400 font-medium">SNOMED · MED-RT · PharmGKB · CPIC</span>
                        </div>

                        {/* ── CDSS Jump List ── */}
                        <div className="bg-white rounded-lg border border-slate-200 p-2 sticky top-0 z-10 shadow-sm">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white bg-emerald-600 px-2 py-1 rounded mr-0.5 shrink-0">CDSS</span>
                            {[
                              { id: 'sec-indications',       label: 'Indications',       color: 'text-emerald-600', show: monograph.indications?.length > 0 },
                              { id: 'sec-contraindications', label: 'Contraindications',  color: 'text-red-600',     show: monograph.contraindications?.length > 0 },
                              { id: 'sec-medrt-ddi',         label: 'Drug Interactions',  color: 'text-amber-600',   show: monograph.medrtDDI?.length > 0 },
                              { id: 'sec-pgx',              label: 'Pharmacogenomics',   color: 'text-teal-700',    show: monograph.pgxInteractions?.length > 0 },
                            ].filter(s => s.show).map(s => (
                              <button key={s.id} onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold hover:bg-emerald-50 transition-colors border border-transparent hover:border-emerald-200', s.color)}>
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* ── Indications (SNOMED CT) ── */}
                        {monograph.indications?.length > 0 && (
                          <details id="sec-indications" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group" open>
                            <summary className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between cursor-pointer select-none">
                              <div className="flex items-center gap-2">
                                <ChevronRight className="w-4 h-4 text-emerald-400 transition-transform group-open:rotate-90" />
                                <h3 className="font-bold text-emerald-900 text-sm">Indications</h3>
                                <span className="text-[9px] font-medium text-emerald-500 bg-emerald-100 px-1.5 py-0.5 rounded">Ingredient-level</span>
                              </div>
                              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100/50 px-2 py-0.5 rounded-full">{monograph.indications.length} SNOMED CT Conditions</span>
                            </summary>
                            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                              {monograph.indications.map((ind: any, i: number) => (
                                <div key={i} className="px-4 py-2.5 hover:bg-slate-50/50 transition-colors flex items-center gap-3">
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
                                    ind.indication_type === 'may_treat' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                                  )}>
                                    {ind.indication_type?.replace('_', ' ')}
                                  </span>
                                  <p className="text-[13px] font-semibold text-slate-800 leading-tight flex-1">{ind.condition_name || ind.snomed_code}</p>
                                  <span className="text-[10px] text-slate-400 font-mono shrink-0">{ind.snomed_code}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {/* ── Contraindications (SNOMED CT) ── */}
                        {monograph.contraindications?.length > 0 && (
                          <details id="sec-contraindications" className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden group" open>
                            <summary className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between cursor-pointer select-none">
                              <div className="flex items-center gap-2">
                                <ChevronRight className="w-4 h-4 text-red-400 transition-transform group-open:rotate-90" />
                                <h3 className="font-bold text-red-900 text-sm">Contraindications</h3>
                              </div>
                              <span className="text-[10px] font-semibold text-red-600 bg-red-100/50 px-2 py-0.5 rounded-full">{monograph.contraindications.length} SNOMED CT Conditions</span>
                            </summary>
                            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                              {monograph.contraindications.map((ci: any, i: number) => (
                                <div key={i} className="px-4 py-2.5 hover:bg-red-50/30 transition-colors flex items-center gap-3">
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
                                    ci.severity === 'absolute' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                                  )}>
                                    {ci.severity}
                                  </span>
                                  <p className="text-[13px] font-semibold text-slate-800 leading-tight flex-1">{ci.condition_name || ci.snomed_code}</p>
                                  <span className="text-[10px] text-slate-400 font-mono shrink-0">{ci.snomed_code}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {/* ── MED-RT Drug-Drug Interactions (ingredient-level) ── */}
                        {monograph.medrtDDI?.length > 0 && (
                          <details id="sec-medrt-ddi" className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden group/ddi" open>
                            <summary className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2 cursor-pointer select-none">
                              <ChevronRight className="w-4 h-4 text-amber-400 transition-transform group-open/ddi:rotate-90" />
                              <h3 className="font-bold text-amber-900 text-sm">Drug-Drug Interactions</h3>
                              <span className="text-[9px] font-medium text-amber-500 bg-amber-100 px-1.5 py-0.5 rounded">MED-RT</span>
                              <span className="text-[10px] font-semibold text-amber-600 bg-amber-100/50 px-2 py-0.5 rounded-full ml-auto">{monograph.medrtDDI.length} contraindicated pairs</span>
                            </summary>
                            <div className="overflow-x-auto">
                              <table className="w-full text-[12px] border-collapse">
                                <thead>
                                  <tr className="bg-amber-50/60">
                                    <th className="px-4 py-2 text-left font-bold text-amber-800 text-[11px] uppercase tracking-wider border-b border-amber-100">Interacting Drug</th>
                                    <th className="px-4 py-2 text-left font-bold text-amber-800 text-[11px] uppercase tracking-wider border-b border-amber-100">Severity</th>
                                    <th className="px-4 py-2 text-left font-bold text-amber-800 text-[11px] uppercase tracking-wider border-b border-amber-100">RXCUI</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {monograph.medrtDDI.map((ddi: any, i: number) => {
                                    const otherName = monograph.inRxcuis?.includes(ddi.drug1_rxcui)
                                      ? ddi.drug2_name : (ddi.drug1_name || ddi.drug2_name);
                                    const otherRxcui = monograph.inRxcuis?.includes(ddi.drug1_rxcui)
                                      ? ddi.drug2_rxcui : ddi.drug1_rxcui;
                                    return (
                                      <tr key={i} className="hover:bg-amber-50/30 transition-colors">
                                        <td className="px-4 py-2 text-slate-800 font-semibold">{otherName}</td>
                                        <td className="px-4 py-2">
                                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                                            {ddi.severity}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-400 font-mono text-[11px]">{otherRxcui}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        )}

                        {/* ── PGx Drug-Gene Interactions ── */}
                        {monograph.pgxInteractions?.length > 0 && (() => {
                          const pgx = monograph.pgxInteractions;
                          const actionColors: Record<string, string> = {
                            avoid:          'border-red-300 bg-red-50',
                            dose_reduction: 'border-orange-300 bg-orange-50',
                            alternative:    'border-yellow-300 bg-yellow-50',
                            monitor:        'border-blue-300 bg-blue-50',
                            informational:  'border-slate-200 bg-slate-50',
                          };
                          const actionBadge: Record<string, string> = {
                            avoid:          'bg-red-100 text-red-800',
                            dose_reduction: 'bg-orange-100 text-orange-800',
                            alternative:    'bg-yellow-100 text-yellow-800',
                            monitor:        'bg-blue-100 text-blue-800',
                            informational:  'bg-slate-100 text-slate-600',
                          };
                          const cpicColor: Record<string, string> = {
                            A: 'bg-emerald-600 text-white',
                            B: 'bg-blue-600 text-white',
                            C: 'bg-amber-500 text-white',
                            D: 'bg-slate-400 text-white',
                          };
                          const cpicA  = pgx.filter((g: any) => g.cpic_level === 'A').length;
                          const fdaBio = pgx.filter((g: any) => g.fda_biomarker).length;
                          return (
                            <details id="sec-pgx" className="bg-white rounded-xl border border-teal-200 shadow-sm overflow-hidden group/pgx" open>
                              <summary className="px-4 py-3 bg-teal-50 border-b border-teal-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-teal-400 transition-transform group-open/pgx:rotate-90" />
                                <h3 className="font-bold text-teal-900 text-sm">Pharmacogenomics — Drug-Gene Interactions</h3>
                                <div className="ml-auto flex items-center gap-1.5">
                                  {cpicA > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">{cpicA} CPIC-A</span>}
                                  {fdaBio > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{fdaBio} FDA Biomarker</span>}
                                  <span className="text-[10px] text-teal-600 font-medium">{pgx.length} genes</span>
                                </div>
                              </summary>
                              <div className="p-4 space-y-3">
                                {pgx.map((geneGroup: any) => {
                                  const action = geneGroup.top_action || 'informational';
                                  return (
                                    <div key={geneGroup.gene_symbol}
                                      className={`rounded-xl border-2 p-3 ${actionColors[action] || actionColors.informational}`}>
                                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className="text-[13px] font-black text-slate-900">{geneGroup.gene_symbol}</span>
                                        {geneGroup.gene_name && geneGroup.gene_name !== geneGroup.gene_symbol && (
                                          <span className="text-[10px] text-slate-500 font-medium truncate max-w-[200px]">{geneGroup.gene_name}</span>
                                        )}
                                        <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
                                          {geneGroup.cpic_level && (
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${cpicColor[geneGroup.cpic_level] || 'bg-slate-300 text-white'}`}>
                                              CPIC {geneGroup.cpic_level}
                                            </span>
                                          )}
                                          {geneGroup.fda_biomarker && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">FDA ✓</span>
                                          )}
                                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${actionBadge[action] || actionBadge.informational}`}>
                                            {action.replace('_', ' ')}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="space-y-1.5">
                                        {geneGroup.entries.filter((e: any) => e.phenotype || e.effect || e.recommendation || e.raw_text).map((e: any, i: number) => (
                                          <div key={i} className="bg-white/70 rounded-lg px-3 py-2 border border-white/80">
                                            <div className="flex flex-wrap gap-1.5 mb-1">
                                              {e.interaction_type && <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400">{e.interaction_type}</span>}
                                              {e.phenotype && (
                                                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100">
                                                  {e.phenotype.replace(/_/g, ' ')}
                                                </span>
                                              )}
                                              {e.evidence_level && <span className="text-[9px] text-slate-400 ml-auto font-mono">Ev: {e.evidence_level}</span>}
                                            </div>
                                            {e.effect && <p className="text-[11px] text-slate-700 leading-snug">{e.effect}</p>}
                                            {e.recommendation && (
                                              <p className="text-[11px] font-semibold text-slate-800 mt-1 leading-snug">
                                                📌 {e.recommendation.substring(0, 300)}
                                              </p>
                                            )}
                                            {!e.effect && !e.recommendation && e.raw_text && (
                                              <p className="text-[11px] text-slate-600 leading-snug">{e.raw_text.substring(0, 250)}</p>
                                            )}
                                          </div>
                                        ))}
                                        {geneGroup.entries.every((e: any) => !e.phenotype && !e.effect && !e.recommendation && !e.raw_text) && (
                                          <div className="text-[11px] text-slate-500 px-2">
                                            Type: {geneGroup.entries[0]?.interaction_type || '—'} · Sources: {[...new Set(geneGroup.entries.map((e: any) => e.source))].join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                <p className="text-[10px] text-slate-400 text-center pt-1">
                                  Sources: PharmGKB · CPIC Guidelines · FDA PGx Biomarker Table
                                </p>
                              </div>
                            </details>
                          );
                        })()}

                        {/* No data message */}
                        {!monograph.indications?.length && !monograph.contraindications?.length && !monograph.medrtDDI?.length && !monograph.pgxInteractions?.length && (
                          <div className="text-center py-12 text-slate-400">
                            <p className="text-sm font-semibold text-slate-600">No CDSS Data Available</p>
                            <p className="text-xs mt-1">No ingredient-level clinical decision support data found for this drug.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* Clinical Monograph — Full FDA DailyMed SPL */}
                {activeTab === 'monograph' && (
                  <div className="space-y-4 pb-8">
                    {monographLoading ? (
                      <div className="flex justify-center py-12"><Activity className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                    ) : !monograph?.fdaSections?.length ? (
                      <div className="text-center py-12 text-slate-400">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm font-semibold text-slate-600">No FDA Monograph Data</p>
                        <p className="text-xs mt-1">No DailyMed SPL data found for this RXCUI.</p>
                      </div>
                    ) : (
                      <>
                        {/* Ingredient Banner */}
                        {monograph.ingredientName && (
                          <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-xl p-4 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Active Ingredient</p>
                              <p className="text-lg font-black mt-0.5">{monograph.ingredientName}</p>
                              {monograph.scdfName && (
                                <p className="text-[11px] text-slate-300 mt-1 font-medium">Dose Form: {monograph.scdfName}</p>
                              )}
                            </div>
                            <div className="text-right text-xs text-slate-400 space-y-0.5">
                              {monograph.fdaSplSetid && (
                                <p className="font-mono text-[10px]">SPL: {monograph.fdaSplSetid.substring(0, 8)}…</p>
                              )}
                              {monograph.inRxcuis?.map((r: string) => (
                                <p key={r} className="font-mono">IN RXCUI: {r}</p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Drug Class / ATC / EPC Badges */}
                        {monograph.drugClass && Object.keys(monograph.drugClass).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 px-1">
                            {(monograph.drugClass.epc || []).map((v: string, i: number) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">🔬 {v}</span>
                            ))}
                            {(monograph.drugClass.moa || []).map((v: string, i: number) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-800 border border-violet-200">⚙️ {v}</span>
                            ))}
                          </div>
                        )}



                        {/* FDA Header */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 px-2.5 py-1 rounded-md">FDA</span>
                            <span className="text-[12px] font-bold text-slate-600">Drug Monograph</span>
                          </div>
                          <div className="flex-1 border-t border-blue-200" />
                          <span className="text-[9px] text-slate-400 font-medium">FDA SPL §0–§17 · DailyMed</span>
                        </div>

                        {/* ═══ Render All FDA Sections ═══ */}
                        {monograph.fdaSections.map((sec: any) => {
                          const isBoxed = sec.sectionNumber === '0';
                          const sectionColors: Record<string, { border: string; bg: string; text: string; chevron: string }> = {
                            '0':  { border: 'border-red-400',    bg: 'bg-red-50',     text: 'text-red-900',     chevron: 'text-red-500' },
                            '1':  { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-900', chevron: 'text-emerald-400' },
                            '2':  { border: 'border-teal-200',   bg: 'bg-teal-50',    text: 'text-teal-900',    chevron: 'text-teal-400' },
                            '3':  { border: 'border-cyan-200',   bg: 'bg-cyan-50',    text: 'text-cyan-900',    chevron: 'text-cyan-400' },
                            '4':  { border: 'border-red-200',    bg: 'bg-red-50',     text: 'text-red-900',     chevron: 'text-red-400' },
                            '5':  { border: 'border-orange-200', bg: 'bg-orange-50',  text: 'text-orange-900',  chevron: 'text-orange-400' },
                            '6':  { border: 'border-rose-200',   bg: 'bg-rose-50',    text: 'text-rose-900',    chevron: 'text-rose-400' },
                            '7':  { border: 'border-amber-200',  bg: 'bg-amber-50',   text: 'text-amber-900',   chevron: 'text-amber-400' },
                            '8':  { border: 'border-purple-200', bg: 'bg-purple-50',  text: 'text-purple-900',  chevron: 'text-purple-400' },
                            '9':  { border: 'border-slate-200',  bg: 'bg-slate-50',   text: 'text-slate-900',   chevron: 'text-slate-400' },
                            '10': { border: 'border-pink-200',   bg: 'bg-pink-50',    text: 'text-pink-900',    chevron: 'text-pink-400' },
                            '11': { border: 'border-indigo-200', bg: 'bg-indigo-50',  text: 'text-indigo-900',  chevron: 'text-indigo-400' },
                            '12': { border: 'border-blue-200',   bg: 'bg-blue-50',    text: 'text-blue-900',    chevron: 'text-blue-400' },
                            '13': { border: 'border-orange-200', bg: 'bg-orange-50',  text: 'text-orange-900',  chevron: 'text-orange-400' },
                            '14': { border: 'border-cyan-200',   bg: 'bg-cyan-50',    text: 'text-cyan-900',    chevron: 'text-cyan-400' },
                            '15': { border: 'border-slate-200',  bg: 'bg-slate-50',   text: 'text-slate-900',   chevron: 'text-slate-400' },
                            '16': { border: 'border-lime-200',   bg: 'bg-lime-50',    text: 'text-lime-900',    chevron: 'text-lime-400' },
                            '17': { border: 'border-teal-200',   bg: 'bg-teal-50',    text: 'text-teal-900',    chevron: 'text-teal-400' },
                          };
                          const colors = sectionColors[sec.sectionNumber] || { border: 'border-slate-200', bg: 'bg-slate-50', text: 'text-slate-900', chevron: 'text-slate-400' };

                          return (
                            <details
                              key={sec.sectionNumber}
                              id={`fda-sec-${sec.sectionNumber}`}
                              className={cn(
                                'bg-white rounded-xl shadow-sm overflow-hidden group/fda',
                                isBoxed ? 'border-2 border-red-400 ring-2 ring-red-100' : `border ${colors.border}`
                              )}
                              open={isBoxed}
                            >
                              <summary className={cn(
                                'px-4 py-3 border-b flex items-center gap-2 cursor-pointer select-none',
                                isBoxed ? 'bg-red-100 border-red-200' : `${colors.bg} ${colors.border}`
                              )}>
                                <ChevronRight className={cn('w-4 h-4 transition-transform group-open/fda:rotate-90', colors.chevron)} />
                                {isBoxed && <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
                                <span className={cn(
                                  'text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0',
                                  isBoxed ? 'bg-red-600 text-white' : 'bg-white/80 text-blue-600 border border-blue-100'
                                )}>
                                  §{sec.sectionNumber}
                                </span>
                                <h3 className={cn('font-bold text-sm flex-1', colors.text)}>
                                  {sec.title}
                                </h3>
                                {sec.children?.length > 0 && (
                                  <span className="text-[10px] text-slate-400 font-medium shrink-0">
                                    {sec.children.length} sub-sections
                                  </span>
                                )}
                              </summary>

                              <div className="divide-y divide-slate-100">
                                {/* Parent section HTML */}
                                {sec.html && (
                                  <div className={cn('p-4 spl-content', isBoxed && 'bg-red-50/30')}>
                                    <div dangerouslySetInnerHTML={{ __html: sec.html }} />
                                  </div>
                                )}

                                {/* Child sub-sections (e.g., §12.1, §12.2, §12.3) */}
                                {sec.children?.map((child: any) => (
                                  <details key={child.sectionNumber} className="group/child" open>
                                    <summary className="px-6 py-2.5 bg-slate-50/50 flex items-center gap-2 cursor-pointer select-none hover:bg-slate-100/50 transition-colors">
                                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 transition-transform group-open/child:rotate-90" />
                                      <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shrink-0">
                                        §{child.sectionNumber}
                                      </span>
                                      <h4 className="font-semibold text-[13px] text-slate-700">{child.title}</h4>
                                    </summary>
                                    {child.html && (
                                      <div className="px-6 py-3 spl-content">
                                        <div dangerouslySetInnerHTML={{ __html: child.html }} />
                                      </div>
                                    )}
                                  </details>
                                ))}
                              </div>
                            </details>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}

              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 max-w-sm mx-auto p-8 text-center">
              <div className="w-20 h-20 bg-white shadow-sm border border-slate-200 rounded-full flex items-center justify-center mb-6">
                <Pill className="w-9 h-9 text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Explore Drug Terminology</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Search for any drug by ingredient, brand name, or clinical drug form. Click any result to explore its RxNorm concept hierarchy and relationships.
              </p>
              {!isNotImported && dbStatus && (
                <div className="mt-6 grid grid-cols-2 gap-3 w-full">
                  {[
                    { label: "Ingredients", value: dbStatus.ingredients, color: "text-blue-600" },
                    { label: "Brands", value: dbStatus.brands, color: "text-amber-600" },
                    { label: "Clinical Drugs", value: dbStatus.clinical_drugs, color: "text-emerald-600" },
                    { label: "Branded Drugs", value: dbStatus.branded_drugs, color: "text-orange-600" },
                  ].map(s => (
                    <div key={s.label} className="bg-white border border-slate-200 rounded-lg p-3 text-center">
                      <p className={cn("text-lg font-black", s.color)}>{Number(s.value).toLocaleString()}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
