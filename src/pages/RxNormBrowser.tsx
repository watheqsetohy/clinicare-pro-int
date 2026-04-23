import { useState, useEffect, useRef } from "react";
import { fetchWithAuth } from '../lib/authSession';
import {
  Search, Pill, ChevronRight, ChevronDown, Filter, Activity,
  AlertCircle, Database, BarChart2, Tag, Link2, FlaskConical,
  ArrowRight, CheckCircle2, Info, BookOpen, List, Heart, Shield, Package, FileText, Dna
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { FdaMonographView } from '../components/FdaMonographView';

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
  const [activeTab, setActiveTab]           = useState<'overview' | 'relations' | 'attributes' | 'monograph'>('overview');

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
              <div className="flex gap-6 border-b border-slate-200 bg-white px-6">
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
                    {(tab.id === 'monograph' || tab.id === 'cdss') && monograph && (monograph.adverse?.length > 0 || monograph.dosing?.length > 0 || monograph.pk?.length > 0 || monograph.indications?.length > 0 || monograph.contraindications?.length > 0) && (
                      <span className="ml-1 w-2 h-2 rounded-full bg-emerald-500"></span>
                    )}
                  </button>
                ))}
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

                {/* Clinical Monograph */}
                {activeTab === 'monograph' && (
                  <div className="space-y-6 pb-8">
                    {monographLoading ? (
                      <div className="flex justify-center py-12"><Activity className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                    ) : !monograph || (!monograph.adverse?.length && !monograph.dosing?.length && !monograph.pk?.length && !monograph.reproductive?.length && !monograph.geriatric?.length && !monograph.indications?.length && !monograph.contraindications?.length) ? (
                      <div className="text-center py-12 text-slate-400">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm font-semibold text-slate-600">No Clinical Monograph Data</p>
                        <p className="text-xs mt-1">This specific RXCUI does not have mapped CDSS monograph data in the database.</p>
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
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                                🔬 {v}
                              </span>
                            ))}
                            {(monograph.drugClass.moa || []).map((v: string, i: number) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-800 border border-violet-200">
                                ⚙️ {v}
                              </span>
                            ))}
                            {(monograph.drugClass.atc || []).map((v: string, i: number) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 font-mono">
                                ATC: {v}
                              </span>
                            ))}
                            {(monograph.drugClass.ndfrt_kind || []).map((v: string, i: number) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                🏷️ {v}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* ── Categorised Jump List ── */}
                        <div className="bg-white rounded-lg border border-slate-200 p-2 sticky top-0 z-10 shadow-sm space-y-1">
                          {/* CDSS Row */}
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white bg-emerald-600 px-2 py-1 rounded mr-0.5 shrink-0">CDSS</span>
                            {[
                              { id: 'sec-indications',      label: 'Indications',       color: 'text-emerald-600', show: monograph.indications?.length > 0 },
                              { id: 'sec-contraindications', label: 'Contraindications', color: 'text-red-600',     show: monograph.contraindications?.length > 0 },
                              { id: 'sec-interactions',      label: 'Drug Interactions', color: 'text-amber-600',   show: monograph.interactions?.length > 0 },
                              { id: 'sec-pgx',              label: 'Pharmacogenomics',  color: 'text-teal-700',    show: monograph.pgxInteractions?.length > 0 },
                            ].filter(s => s.show).map(s => (
                              <button key={s.id} onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold hover:bg-emerald-50 transition-colors border border-transparent hover:border-emerald-200', s.color)}>
                                {s.label}
                              </button>
                            ))}
                          </div>
                          {/* FDA Monograph Row */}
                          <div className="flex items-center gap-1 flex-wrap border-t border-slate-100 pt-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white bg-blue-600 px-2 py-1 rounded mr-0.5 shrink-0">FDA</span>
                            {[
                              { id: 'sec-indications',      label: '§1 Indications', color: 'text-emerald-600', show: monograph.indications?.length > 0 },
                              { id: 'sec-dosing',           label: '§2 Dosing',      color: 'text-teal-600',    show: monograph.dosing?.length > 0 },
                              { id: 'sec-ci-text',          label: '§4 CI',          color: 'text-red-500',     show: monograph.contraindicationText?.length > 0 },
                              { id: 'sec-adverse',          label: '§6 ADR',         color: 'text-rose-600',    show: monograph.adverse?.length > 0 },
                              { id: 'sec-reproductive',     label: '§8 Pregnancy',   color: 'text-purple-600',  show: monograph.reproductive?.length > 0 },
                              { id: 'sec-pediatric',        label: '§8.4 Peds',      color: 'text-sky-600',     show: monograph.pediatric?.length > 0 },
                              { id: 'sec-geriatric',        label: '§8.5 Geri',      color: 'text-slate-600',   show: monograph.geriatric?.length > 0 },
                              { id: 'sec-description',      label: '§11 Desc',       color: 'text-indigo-600',  show: monograph.description?.length > 0 },
                              { id: 'sec-pk',               label: '§12 PK',         color: 'text-blue-600',    show: monograph.pk?.length > 0 },
                              { id: 'sec-toxicology',       label: '§13 Tox',        color: 'text-orange-700',  show: monograph.toxicology?.length > 0 },
                              { id: 'sec-clinical-studies', label: '§14 Studies',    color: 'text-cyan-700',    show: monograph.clinicalStudies?.length > 0 },
                              { id: 'sec-storage',          label: '§16 Storage',    color: 'text-lime-700',    show: monograph.storage?.length > 0 },
                            ].filter(s => s.show).map(s => (
                              <button key={s.id} onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200', s.color)}>
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* ═══ CDSS Group Header ═══ */}
                        <div className="flex items-center gap-3 pt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white bg-emerald-600 px-2.5 py-1 rounded-md">CDSS</span>
                            <span className="text-[12px] font-bold text-slate-600">Clinical Decision Support</span>
                          </div>
                          <div className="flex-1 border-t border-emerald-200" />
                          <span className="text-[9px] text-slate-400 font-medium">SNOMED · RxNorm · MED-RT</span>
                        </div>

                        {/* ── Indications (SNOMED CT) ── */}
                        {monograph.indications?.length > 0 && (
                          <details id="sec-indications" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group" open>
                            <summary className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between cursor-pointer select-none">
                              <div className="flex items-center gap-2">
                                <ChevronRight className="w-4 h-4 text-emerald-400 transition-transform group-open:rotate-90" />
                                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
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
                                <Shield className="w-4 h-4 text-red-700" />
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

                        {/* ── §7 Drug Interactions ── */}
                        {monograph.interactions?.length > 0 && (() => {
                          const severityMeta: Record<string, { badge: string; row: string; label: string }> = {
                            contraindicated: { badge: 'bg-red-100 text-red-700 border-red-200',    row: 'border-red-100 bg-red-50/30',    label: 'Contraindicated' },
                            major:           { badge: 'bg-orange-100 text-orange-700 border-orange-200', row: 'border-orange-100 bg-orange-50/20', label: 'Major' },
                            moderate:        { badge: 'bg-amber-100 text-amber-700 border-amber-200', row: 'border-amber-100 bg-amber-50/20',  label: 'Moderate' },
                            minor:           { badge: 'bg-green-100 text-green-700 border-green-200', row: 'border-slate-100',                label: 'Minor' },
                          };
                          const sevOrder = ['contraindicated','major','moderate','minor','unknown'];
                          const grouped: Record<string, any[]> = {};
                          monograph.interactions.forEach((ix: any) => {
                            const s = (ix.severity || 'unknown').toLowerCase();
                            (grouped[s] = grouped[s] || []).push(ix);
                          });
                          return (
                            <details id="sec-interactions" className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden group/ix" open>
                              <summary className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-amber-400 transition-transform group-open/ix:rotate-90" />
                                <AlertCircle className="w-4 h-4 text-amber-700" />
                                <h3 className="font-bold text-amber-900 text-sm">§7 Drug Interactions</h3>
                                <span className="text-[10px] font-semibold text-amber-600 bg-amber-100/50 px-2 py-0.5 rounded-full ml-1">{monograph.interactions.length} interactions</span>
                              </summary>
                              <div className="divide-y divide-slate-100">
                                {sevOrder.filter(s => grouped[s]).map(sev => {
                                  const meta = severityMeta[sev] || { badge: 'bg-slate-100 text-slate-600 border-slate-200', row: 'border-slate-100', label: sev };
                                  const items = grouped[sev];
                                  return (
                                    <details key={sev} className="group/sev" open={sev === 'contraindicated' || sev === 'major'}>
                                      <summary className={cn('px-4 py-2.5 flex items-center gap-2 cursor-pointer select-none hover:bg-slate-50/50', sev === 'contraindicated' ? 'bg-red-50/40' : sev === 'major' ? 'bg-orange-50/30' : '')}>
                                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 transition-transform group-open/sev:rotate-90 shrink-0" />
                                        <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border', meta.badge)}>{meta.label}</span>
                                        <span className="text-[11px] text-slate-500 font-semibold">{items.length} drug{items.length > 1 ? 's' : ''}</span>
                                      </summary>
                                      <div className="px-4 pb-3 space-y-2">
                                        {items.map((ix: any, i: number) => {
                                          // The 'other' drug — could be drug1 or drug2
                                          const otherName = monograph.inRxcuis?.includes(ix.drug1_rxcui) || monograph.indications?.find((_: any) => ix.drug1_rxcui === ix.drug1_rxcui)
                                            ? ix.drug2_name : ix.drug1_name;
                                          const displayName = otherName || (ix.drug1_name !== ix.drug2_name ? ix.drug2_name : ix.drug1_name);
                                          return (
                                            <div key={i} className={cn('rounded-lg border p-3 space-y-1.5', meta.row)}>
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[13px] font-bold text-slate-800">{displayName || `${ix.drug1_name} ↔ ${ix.drug2_name}`}</span>
                                                {ix.rela && <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{ix.rela}</span>}
                                                {ix.source && <span className="text-[9px] text-slate-400 ml-auto">{ix.source}</span>}
                                              </div>
                                              {ix.mechanism && (
                                                <div className="flex gap-1.5">
                                                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-0.5 shrink-0 w-20">Mechanism</span>
                                                  <p className="text-[12px] text-slate-600 leading-relaxed">{ix.mechanism}</p>
                                                </div>
                                              )}
                                              {ix.effect_description && (
                                                <div className="flex gap-1.5">
                                                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-0.5 shrink-0 w-20">Effect</span>
                                                  <p className="text-[12px] text-slate-600 leading-relaxed">{ix.effect_description}</p>
                                                </div>
                                              )}
                                              {ix.management && (
                                                <div className="flex gap-1.5 p-2 bg-white/70 rounded border border-slate-100">
                                                  <span className="text-[9px] font-black uppercase tracking-wider text-teal-500 mt-0.5 shrink-0 w-20">Management</span>
                                                  <p className="text-[12px] text-teal-800 leading-relaxed font-medium">{ix.management}</p>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </details>
                                  );
                                })}
                              </div>
                            </details>
                          );
                        })()}

                        {/* ═══ FDA Monograph Group Header ═══ */}
                        <div className="flex items-center gap-3 pt-3 mt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 px-2.5 py-1 rounded-md">FDA</span>
                            <span className="text-[12px] font-bold text-slate-600">Drug Monograph</span>
                          </div>
                          <div className="flex-1 border-t border-blue-200" />
                          <span className="text-[9px] text-slate-400 font-medium">FDA SPL §1–§17</span>
                        </div>

                        {/* ── Dosing & Administration — single FDA §2 section ── */}
                        {monograph.dosing?.length > 0 && (() => {
                          // Single best record (DB now stores one standard row per drug)
                          const best = (monograph.dosing as any[]).reduce((a: any, b: any) =>
                            (b.raw_text?.length || 0) > (a.raw_text?.length || 0) ? b : a
                          );
                          return (
                            <details id="sec-dosing" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group" open>
                              <summary className="px-4 py-3 bg-teal-50 border-b border-teal-100 flex items-center justify-between cursor-pointer select-none">
                                <div className="flex items-center gap-2">
                                  <ChevronRight className="w-4 h-4 text-teal-400 transition-transform group-open:rotate-90" />
                                  <Activity className="w-4 h-4 text-teal-700" />
                                  <h3 className="font-bold text-teal-900 text-sm">Dosing & Administration</h3>
                                </div>
                                <span className="text-[10px] text-teal-500 font-mono bg-teal-100/50 px-2 py-0.5 rounded">FDA §2</span>
                              </summary>
                              <div className="p-4 space-y-3">
                                {/* Structured dose fields if present */}
                                {(best.max_dose || best.dose_adjustment || best.monitoring) && (
                                  <div className="flex items-center gap-2 flex-wrap bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                                    {best.max_dose && <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider border border-rose-200 bg-rose-50 px-1.5 py-0.5 rounded">Max: {best.max_dose}</span>}
                                    {best.dose_adjustment && <span className="text-[11px] text-slate-700"><strong className="text-slate-500 text-[10px] mr-1">ADJ:</strong>{best.dose_adjustment}</span>}
                                    {best.monitoring && <span className="text-[11px] text-slate-700"><strong className="text-slate-500 text-[10px] mr-1">MON:</strong>{best.monitoring}</span>}
                                  </div>
                                )}
                                {/* FDA §2 full section — FdaMonographView renders §2.1/§2.2 Renal/§2.3 Hepatic as subsections */}
                                {best.raw_text ? (
                                  <FdaMonographView rawText={best.raw_text} label={best.source} accentTop="2" />
                                ) : (
                                  <p className="text-[12px] text-slate-400 italic">No dosing text available.</p>
                                )}
                              </div>
                            </details>
                          );
                        })()}


                        {/* Clinical Pharmacology */}
                        {monograph.pk?.length > 0 && (() => {
                          const p = monograph.pk[0];
                          const hasStructured = p.half_life || p.bioavailability || p.metabolism_route || p.excretion_route;
                          return (
                            <details id="sec-pk" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group/pk" open>
                              <summary className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-blue-400 transition-transform group-open/pk:rotate-90" />
                                <FlaskConical className="w-4 h-4 text-blue-700" />
                                <h3 className="font-bold text-blue-900 text-sm">Clinical Pharmacology</h3>
                              </summary>
                              <div className="p-4 space-y-3">
                                {hasStructured && (
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                      { label: 'Half-Life', value: p.half_life },
                                      { label: 'Bioavailability', value: p.bioavailability ? p.bioavailability + '%' : null },
                                      { label: 'Metabolism', value: p.metabolism_route },
                                      { label: 'Excretion', value: p.excretion_route },
                                    ].filter(item => item.value).map((item, idx) => (
                                      <div key={idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                        <span className="font-bold text-slate-400 block text-[9px] uppercase tracking-wider mb-0.5">{item.label}</span>
                                        <span className="font-semibold text-slate-700 text-[13px]">{item.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {p.metabolizing_enzymes?.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">Enzymes:</span>
                                    <div className="flex gap-1 flex-wrap">
                                      {p.metabolizing_enzymes.map((e: string, idx: number) => (
                                        <span key={idx} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-100">{e}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {p.raw_text && (
                                  <FdaMonographView rawText={p.raw_text} accentTop="12" />
                                )}
                              </div>
                            </details>
                          );
                        })()}

                        {/* Adverse Effects — single consolidated entry */}
                        {monograph.adverse?.length > 0 && (() => {
                          const a = monograph.adverse[0];
                          return (
                            <details id="sec-adverse" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group/adr" open>
                              <summary className="px-4 py-3 bg-rose-50 border-b border-rose-100 flex items-center justify-between cursor-pointer select-none">
                                <div className="flex items-center gap-2">
                                  <ChevronRight className="w-4 h-4 text-rose-400 transition-transform group-open/adr:rotate-90" />
                                  <AlertCircle className="w-4 h-4 text-rose-700" />
                                  <h3 className="font-bold text-rose-900 text-sm">Adverse Reactions</h3>
                                </div>
                                <span className="text-[10px] font-semibold text-rose-600 bg-rose-100/50 px-2 py-0.5 rounded-full">FDA Label</span>
                              </summary>
                              <div className="px-4 pb-4">
                                <FdaMonographView rawText={a.effect_name} label={a.source} accentTop="6" />
                              </div>
                            </details>
                          );
                        })()}

                        {/* Pregnancy & Lactation — 1 entry per category from server */}
                        {monograph.reproductive?.length > 0 && (() => {
                          const catMeta: Record<string, { label: string; icon: string; color: string }> = {
                            pregnancy: { label: 'Pregnancy', icon: '🤰', color: 'text-purple-700' },
                            lactation: { label: 'Lactation', icon: '🍼', color: 'text-pink-700' },
                            fertility: { label: 'Fertility', icon: '🧬', color: 'text-indigo-700' },
                          };
                          return (
                            <details id="sec-reproductive" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group/repro" open>
                              <summary className="px-4 py-3 bg-purple-50 border-b border-purple-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-purple-400 transition-transform group-open/repro:rotate-90" />
                                <Heart className="w-4 h-4 text-purple-700" />
                                <h3 className="font-bold text-purple-900 text-sm">Pregnancy & Lactation</h3>
                              </summary>
                              <div className="divide-y divide-slate-100">
                                {monograph.reproductive.map((r: any, i: number) => {
                                  const cat = (r.category || 'other').toLowerCase();
                                  const meta = catMeta[cat] || { label: cat.charAt(0).toUpperCase() + cat.slice(1), icon: '📋', color: 'text-slate-700' };
                                  return (
                                    <details key={i} className="group" open>
                                      <summary className="px-4 py-3 cursor-pointer select-none hover:bg-purple-50/30 transition-colors flex items-center gap-3 bg-purple-50/20">
                                        <ChevronRight className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-90 shrink-0" />
                                        <span className="text-base">{meta.icon}</span>
                                        <span className={cn("text-[14px] font-bold", meta.color)}>{meta.label}</span>
                                        {r.fda_category && (
                                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-black border border-purple-200">
                                            FDA: {r.fda_category}
                                          </span>
                                        )}
                                      </summary>
                                      <div className="px-4 pb-4">
                                        {r.recommendation && (
                                          <p className="text-[13px] text-slate-700 font-medium mb-2">{r.recommendation}</p>
                                        )}
                                        {r.raw_text && (
                                          <FdaMonographView rawText={r.raw_text} accentTop="8" />
                                        )}
                                      </div>
                                    </details>
                                  );
                                })}
                              </div>
                            </details>
                          );
                        })()}
                        {/* ── Contraindication FDA Text (§4) — shown below SNOMED list ── */}
                        {monograph.contraindicationText?.length > 0 && (() => {
                          const c = monograph.contraindicationText[0];
                          return (
                            <details id="sec-ci-text" className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden group/ci">
                              <summary className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-red-400 transition-transform group-open/ci:rotate-90" />
                                <Shield className="w-4 h-4 text-red-600" />
                                <h3 className="font-bold text-red-900 text-sm">§4 Contraindications — FDA Label</h3>
                                <span className="text-[9px] ml-auto text-red-400 font-mono">{c.source}</span>
                              </summary>
                              <div className="p-4">
                                <FdaMonographView rawText={c.raw_text} accentTop="4" />
                              </div>
                            </details>
                          );
                        })()}

                        {/* ── §8.4 Pediatric Use ── */}
                        {monograph.pediatric?.length > 0 && (() => {
                          const p = monograph.pediatric[0];
                          return (
                            <details id="sec-pediatric" className="bg-white rounded-xl border border-sky-200 shadow-sm overflow-hidden group/ped">
                              <summary className="px-4 py-3 bg-sky-50 border-b border-sky-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-sky-400 transition-transform group-open/ped:rotate-90" />
                                <Info className="w-4 h-4 text-sky-700" />
                                <h3 className="font-bold text-sky-900 text-sm">§8.4 Pediatric Use</h3>
                                {p.approved === false && (
                                  <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold border border-red-200 ml-1">Not Approved</span>
                                )}
                                {p.contraindicated && (
                                  <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold border border-red-200 ml-1">Contraindicated</span>
                                )}
                                {p.age_group && (
                                  <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-semibold border border-sky-200 ml-1">{p.age_group}</span>
                                )}
                              </summary>
                              <div className="p-4 space-y-3">
                                {p.dose_note && (
                                  <div className="flex items-start gap-2 p-3 bg-sky-50 rounded-lg border border-sky-100">
                                    <Info className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                                    <p className="text-[13px] text-sky-900 font-medium leading-relaxed">{p.dose_note}</p>
                                  </div>
                                )}
                                {p.raw_text && <FdaMonographView rawText={p.raw_text} accentTop="8" />}
                              </div>
                            </details>
                          );
                        })()}

                        {/* ── §8.5 Geriatric Use ── */}
                        {monograph.geriatric?.length > 0 && (() => {
                          const g = monograph.geriatric[0];
                          const riskColors: Record<string, string> = {
                            avoid:             'bg-red-100 text-red-700 border-red-200',
                            use_with_caution:  'bg-amber-100 text-amber-700 border-amber-200',
                            generally_safe:    'bg-emerald-100 text-emerald-700 border-emerald-200',
                          };
                          const riskColor = riskColors[g.risk_level] || 'bg-slate-100 text-slate-600 border-slate-200';
                          return (
                            <details id="sec-geriatric" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group/ger">
                              <summary className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-slate-400 transition-transform group-open/ger:rotate-90" />
                                <BookOpen className="w-4 h-4 text-slate-600" />
                                <h3 className="font-bold text-slate-800 text-sm">§8.5 Geriatric Use</h3>
                                {g.risk_level && (
                                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold border ml-1', riskColor)}>
                                    {g.risk_level.replace(/_/g, ' ')}
                                  </span>
                                )}
                                {g.beers_criteria && (
                                  <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold border border-orange-200 ml-1">Beers Criteria</span>
                                )}
                              </summary>
                              <div className="p-4 space-y-3">
                                {(g.beers_criteria || g.stopp_criteria || g.rationale || g.alternative) && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {g.beers_category && (
                                      <div className="p-2.5 bg-orange-50 rounded-lg border border-orange-100">
                                        <span className="text-[9px] uppercase tracking-wider font-bold text-orange-500 block mb-0.5">Beers Category</span>
                                        <span className="text-[12px] text-orange-900 font-semibold">{g.beers_category}</span>
                                      </div>
                                    )}
                                    {g.rationale && (
                                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                                        <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 block mb-0.5">Rationale</span>
                                        <span className="text-[12px] text-slate-700">{g.rationale}</span>
                                      </div>
                                    )}
                                    {g.alternative && (
                                      <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100 md:col-span-2">
                                        <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-500 block mb-0.5">Recommended Alternative</span>
                                        <span className="text-[12px] text-emerald-800 font-medium">{g.alternative}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {g.raw_text && <FdaMonographView rawText={g.raw_text} accentTop="8" />}
                              </div>
                            </details>
                          );
                        })()}
                      </>
                    )}

                        {/* ── §16 Storage & Handling + §16.1 How Supplied ── */}
                        {monograph.storage?.length > 0 && (() => {
                          const s = monograph.storage[0];
                          return (
                            <details id="sec-storage" className="bg-white rounded-xl border border-lime-200 shadow-sm overflow-hidden group/stor" open>
                              <summary className="px-4 py-3 bg-lime-50 border-b border-lime-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-lime-400 transition-transform group-open/stor:rotate-90" />
                                <Package className="w-4 h-4 text-lime-700" />
                                <h3 className="font-bold text-lime-900 text-sm">§16 Storage, Supply &amp; Handling</h3>
                                <span className="text-[10px] text-lime-600 ml-auto font-medium">{s.source}</span>
                              </summary>
                              <div className="p-4 space-y-3">
                                {/* How Supplied */}
                                {s.how_supplied && (
                                  <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">§16.1 How Supplied</span>
                                    <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
                                      <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap">{s.how_supplied}</p>
                                    </div>
                                  </div>
                                )}
                                {/* Storage & Handling */}
                                {s.storage_text && (
                                  <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">§16.2 Storage &amp; Handling</span>
                                    <div className="bg-lime-50/60 rounded-lg border border-lime-100 p-3">
                                      <p className="text-[12px] text-lime-900 leading-relaxed whitespace-pre-wrap">{s.storage_text}</p>
                                    </div>
                                  </div>
                                )}
                                {/* Instructions for Use */}
                                {s.instructions_for_use && (
                                  <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">§17 Instructions for Use / Patient Counseling</span>
                                    <div className="bg-teal-50/50 rounded-lg border border-teal-100 p-3">
                                      <p className="text-[12px] text-teal-900 leading-relaxed whitespace-pre-wrap">{s.instructions_for_use}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </details>
                          );
                        })()}

                        {/* ── §11 Description ── */}
                        {monograph.description?.length > 0 && (() => {
                          const d = monograph.description[0];
                          return (
                            <details id="sec-description" className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden group/desc">
                              <summary className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-indigo-400 transition-transform group-open/desc:rotate-90" />
                                <FileText className="w-4 h-4 text-indigo-700" />
                                <h3 className="font-bold text-indigo-900 text-sm">§11 Description</h3>
                                <span className="text-[10px] text-indigo-600 ml-auto font-medium">{d.source}</span>
                              </summary>
                              <div className="p-4 space-y-3">
                                {d.pharmacologic_class && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pharmacologic Class</span>
                                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[11px] font-semibold rounded-full border border-indigo-200">{d.pharmacologic_class}</span>
                                  </div>
                                )}
                                {d.mechanism_summary && (
                                  <div className="bg-violet-50 rounded-lg border border-violet-100 p-3">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-violet-400 block mb-1">Mechanism of Action</span>
                                    <p className="text-[12px] text-violet-900 leading-relaxed">{d.mechanism_summary}</p>
                                  </div>
                                )}
                                {d.description_text && (
                                  <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Full Description</span>
                                    <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap">{d.description_text}</p>
                                  </div>
                                )}
                              </div>
                            </details>
                          );
                        })()}

                        {/* ── §13 Nonclinical Toxicology ── */}
                        {monograph.toxicology?.length > 0 && (() => {
                          const t = monograph.toxicology[0];
                          return (
                            <details id="sec-toxicology" className="bg-white rounded-xl border border-orange-200 shadow-sm overflow-hidden group/tox">
                              <summary className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-orange-400 transition-transform group-open/tox:rotate-90" />
                                <AlertCircle className="w-4 h-4 text-orange-700" />
                                <h3 className="font-bold text-orange-900 text-sm">§13 Nonclinical Toxicology</h3>
                                <span className="text-[10px] text-orange-600 ml-auto font-medium">{t.source}</span>
                              </summary>
                              <div className="p-4 space-y-3">
                                {t.carcinogenesis_text && (
                                  <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">§13.1 Carcinogenesis</span>
                                    <div className="bg-orange-50/60 rounded-lg border border-orange-100 p-3">
                                      <p className="text-[12px] text-slate-800 leading-relaxed whitespace-pre-wrap">{t.carcinogenesis_text}</p>
                                    </div>
                                  </div>
                                )}
                                {t.mutagenesis_text && (
                                  <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">§13.2 Mutagenesis</span>
                                    <div className="bg-yellow-50/60 rounded-lg border border-yellow-100 p-3">
                                      <p className="text-[12px] text-slate-800 leading-relaxed whitespace-pre-wrap">{t.mutagenesis_text}</p>
                                    </div>
                                  </div>
                                )}
                                {t.reproductive_impairment_text && (
                                  <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">§13.3 Reproductive Impairment</span>
                                    <div className="bg-red-50/60 rounded-lg border border-red-100 p-3">
                                      <p className="text-[12px] text-slate-800 leading-relaxed whitespace-pre-wrap">{t.reproductive_impairment_text}</p>
                                    </div>
                                  </div>
                                )}
                                {!t.carcinogenesis_text && !t.mutagenesis_text && t.raw_text && (
                                  <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap">{t.raw_text}</p>
                                )}
                              </div>
                            </details>
                          );
                        })()}

                        {/* ── §14 Clinical Studies ── */}
                        {monograph.clinicalStudies?.length > 0 && (() => {
                          const cs = monograph.clinicalStudies[0];
                          return (
                            <details id="sec-clinical-studies" className="bg-white rounded-xl border border-cyan-200 shadow-sm overflow-hidden group/cs">
                              <summary className="px-4 py-3 bg-cyan-50 border-b border-cyan-100 flex items-center gap-2 cursor-pointer select-none">
                                <ChevronRight className="w-4 h-4 text-cyan-400 transition-transform group-open/cs:rotate-90" />
                                <BarChart2 className="w-4 h-4 text-cyan-700" />
                                <h3 className="font-bold text-cyan-900 text-sm">§14 Clinical Studies</h3>
                                <span className="text-[10px] text-cyan-600 ml-auto font-medium">{cs.source}</span>
                              </summary>
                              <div className="p-4">
                                <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap">{cs.raw_text}</p>
                              </div>
                            </details>
                          );
                        })()}

                        {/* ── 🧬 PGx Drug-Gene Interactions ── */}
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
                                <Dna className="w-4 h-4 text-teal-700" />
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
                                              {e.interaction_type && (
                                                <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400">{e.interaction_type}</span>
                                              )}
                                              {e.phenotype && (
                                                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100">
                                                  {e.phenotype.replace(/_/g, ' ')}
                                                </span>
                                              )}
                                              {e.evidence_level && (
                                                <span className="text-[9px] text-slate-400 ml-auto font-mono">Ev: {e.evidence_level}</span>
                                              )}
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
                                  Sources: FDA SPL §12 · PharmGKB · CPIC Guidelines · FDA PGx Biomarker Table
                                </p>
                              </div>
                            </details>
                          );
                        })()}

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
