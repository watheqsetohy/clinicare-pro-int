import React, { useState, useEffect } from 'react';
import { 
  Search, Filter, AlertTriangle, Pill, ShieldAlert, Activity, BookOpen, Layers, 
  CheckCircle2, ChevronRight, X, FlaskConical, Beaker, Thermometer, Shield, 
  Sun, EyeOff, Info, Scale, Box, AlertCircle, RefreshCw, Zap
} from 'lucide-react';
import { cn } from '../lib/utils';

function Badge({ children, variant, className }: any) {
  const variants: any = {
    default: "bg-slate-100 text-slate-800",
    success: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20",
    secondary: "bg-slate-500/15 text-slate-700 border-slate-500/20",
    destructive: "bg-red-500/15 text-red-700 border-red-500/20",
    warning: "bg-amber-500/15 text-amber-700 border-amber-500/20",
    info: "bg-blue-500/15 text-blue-700 border-blue-500/20",
    purple: "bg-purple-500/15 text-purple-700 border-purple-500/20"
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wide transition-colors", 
      variants[variant] || variants.default, className
    )}>
      {children}
    </span>
  );
}

interface SearchResult {
  brand_id: string;
  name_en: string;
  name_ar: string;
  formulary_status: string;
  company: string;
  his_coded: boolean;
  scd_name: string;
  scdf_name: string;
  atc_code: string;
  product_type: string;
  scd_legal_status: string;
  concentration: number;
  conc_unit: string;
}

interface BrandDetail {
  brand_id: string;
  name_en: string;
  name_ar: string;
  formulary_status: string;
  company: string;
  resolved_legal_status: string;
  resolved_light_protection: boolean;
  resolved_hazardous: boolean;
  resolved_cytotoxic: boolean;
  resolved_concern_level: string;
  resolved_renal_adj: boolean;
  crcl_cutoff: number;
  resolved_hepatic_adj: boolean;
  child_pugh_cutoff: string;
  resolved_obesity_adj: boolean;
  bmi_cutoff: number;
  resolved_pregnancy_alarm: boolean;
  pregnancy_note: string;
  resolved_older_adult: boolean;
  lasa: boolean;
  lasa_level: string;
  refrigerated: boolean;
  lower_temp: number;
  upper_temp: number;
  market_shortage: boolean;
  psp: boolean;
  scd_name: string;
  scdf_name: string;
  atc_code: string;
  product_type: string;
  image_id?: string;
  vezeeta_image_url?: string;
  ingredients?: any[];
  volume: string;
  volume_unit: string;
}

export function PharmaBrowser() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BrandDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'info' | 'ingredients' | 'adrs' | 'indications'>('info');
  const [adrs, setAdrs] = useState<any[]>([]);
  const [indications, setIndications] = useState<any[]>([]);

  const [selectedForDdi, setSelectedForDdi] = useState<Set<string>>(new Set());
  const [ddiResult, setDdiResult] = useState<any | null>(null);
  const [ddiLoading, setDdiLoading] = useState(false);

  // Reset offset when query changes
  useEffect(() => {
    setOffset(0);
  }, [q, status]);

  // Search logic
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        if (q) queryParams.set('q', q);
        if (status) queryParams.set('status', status);
        queryParams.set('limit', '50');
        queryParams.set('offset', offset.toString());
        
        const res = await fetch(`/api/pharma/search?${queryParams.toString()}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        
        if (offset === 0) {
          setResults(data.results || []);
        } else {
          setResults(prev => [...prev, ...(data.results || [])]);
        }
        setTotalResults(data.total || 0);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [q, status, offset]);

  // Load brand details
  useEffect(() => {
    if (!selectedBrandId) return;
    async function loadDetail() {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/pharma/brand/${selectedBrandId}`);
        if (!res.ok) throw new Error('Detail fetch failed');
        const data = await res.json();
        setDetail(data);

        const adrRes = await fetch(`/api/pharma/brand/${selectedBrandId}/adrs`);
        if (adrRes.ok) setAdrs((await adrRes.json()).adrs || []);

        const indRes = await fetch(`/api/pharma/brand/${selectedBrandId}/indications`);
        if (indRes.ok) setIndications((await indRes.json()).indications || []);
      } catch (err) {
        console.error(err);
      } finally {
        setDetailLoading(false);
      }
    }
    loadDetail();
  }, [selectedBrandId]);

  // Handle DDI check
  useEffect(() => {
    if (selectedForDdi.size < 2) {
      setDdiResult(null);
      return;
    }
    async function runDdi() {
      setDdiLoading(true);
      try {
        const res = await fetch('/api/pharma/ddi-check-brands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandIds: Array.from(selectedForDdi) })
        });
        if (res.ok) setDdiResult(await res.json());
      } catch (err) {
        console.error(err);
      } finally {
        setDdiLoading(false);
      }
    }
    runDdi();
  }, [selectedForDdi]);

  const toggleDdiSelection = (brandId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedForDdi);
    if (newSet.has(brandId)) {
      newSet.delete(brandId);
    } else {
      if (newSet.size >= 10) return;
      newSet.add(brandId);
    }
    setSelectedForDdi(newSet);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-slate-50 font-sans">
      {/* ── LEFT PANEL ── */}
      <div className="w-[420px] flex-shrink-0 flex flex-col border-r border-slate-200 bg-white/80 backdrop-blur-md z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        
        {/* Search Header */}
        <div className="p-5 border-b border-slate-200 bg-white sticky top-0 z-20">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Beaker className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Pharma Directory</h2>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Clinical Knowledge Base</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="relative group">
              <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
              <input
                type="text"
                placeholder="Search by brand, generic, or ATC..."
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-slate-100/50 border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 focus:bg-white transition-all shadow-inner"
              />
            </div>
            
            <div className="flex gap-2">
              <select 
                value={status}
                onChange={e => { setStatus(e.target.value); setOffset(0); }}
                className="flex-1 bg-slate-100/50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-colors cursor-pointer appearance-none"
              >
                <option value="">All Formularies</option>
                <option value="Formulary">Formulary (F)</option>
                <option value="Non-Formulary">Non-Formulary (NF)</option>
              </select>
            </div>
            
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-xs font-bold text-slate-400">RESULTS</span>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                {totalResults.toLocaleString()} items
              </span>
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/50">
          {loading && offset === 0 ? (
            <div className="p-8 text-center text-slate-400 font-medium animate-pulse flex flex-col items-center">
              <RefreshCw className="w-6 h-6 animate-spin mb-2" /> Searching...
            </div>
          ) : results.length > 0 ? (
            results.map((r) => (
              <div 
                key={r.brand_id} 
                onClick={() => setSelectedBrandId(r.brand_id)}
                className={cn(
                  "p-4 rounded-2xl cursor-pointer transition-all duration-200 border",
                  selectedBrandId === r.brand_id 
                    ? "bg-white border-indigo-600 shadow-[0_8px_30px_rgb(0,0,0,0.08)] scale-[1.02] z-10 relative" 
                    : "bg-white border-slate-200/60 hover:border-slate-300 hover:shadow-md"
                )}
              >
                <div className="flex gap-4">
                  <div className="pt-0.5">
                    <button 
                      onClick={(e) => toggleDdiSelection(r.brand_id, e)}
                      className={cn(
                        "w-5 h-5 rounded flex items-center justify-center border transition-all",
                        selectedForDdi.has(r.brand_id)
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "bg-slate-50 border-slate-300 hover:border-indigo-400"
                      )}
                    >
                      {selectedForDdi.has(r.brand_id) && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="font-bold text-slate-900 text-sm truncate">{r.name_en}</h4>
                      <Badge variant={r.formulary_status === 'Formulary' ? 'success' : 'secondary'} className="shrink-0">
                        {r.formulary_status === 'Formulary' ? 'F' : 'NF'}
                      </Badge>
                    </div>
                    {r.name_ar && <p className="text-xs font-medium text-slate-500 truncate mb-2" dir="rtl">{r.name_ar}</p>}
                    
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200/60">
                        ATC: {r.atc_code}
                      </span>
                      <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200/60 truncate max-w-[120px]">
                        {r.product_type}
                      </span>
                      {r.scd_legal_status === 'Prescription' && (
                        <span className="px-2 py-1 rounded-md bg-red-50 text-red-700 text-[10px] font-bold border border-red-200">
                          Rx Only
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : !loading && (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-slate-300" />
              </div>
              <p className="font-medium text-slate-500">No medications found.</p>
              <p className="text-xs mt-1">Try adjusting your search criteria</p>
            </div>
          )}
          
          {results.length > 0 && results.length < totalResults && (
            <button 
              onClick={() => setOffset(prev => prev + 50)}
              disabled={loading}
              className="w-full py-3.5 mt-4 text-sm font-bold text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 transition-colors rounded-xl border border-indigo-200 border-dashed disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load More Results'}
            </button>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto relative bg-slate-100/50">
        
        {/* DDI Checker Bar */}
        {selectedForDdi.size > 0 && (
          <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-indigo-200 shadow-sm p-4 animate-in slide-in-from-top-4">
            <div className="flex items-center justify-between mb-3 max-w-6xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/20">
                  <FlaskConical className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-bold text-slate-900">
                  Interaction Checker
                </h3>
                <Badge variant="info" className="ml-2 bg-indigo-50 text-indigo-700 border-indigo-200">
                  {selectedForDdi.size} items selected
                </Badge>
              </div>
              <button 
                onClick={() => setSelectedForDdi(new Set())}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
              >
                Clear All
              </button>
            </div>
            
            <div className="max-w-6xl mx-auto">
              {ddiLoading ? (
                <div className="text-sm font-medium text-indigo-600 flex items-center gap-2 p-2 bg-indigo-50 rounded-lg">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Analyzing interactions against clinical databases...
                </div>
              ) : ddiResult ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm font-bold">
                    {ddiResult.summary.Major > 0 && (
                      <span className="flex items-center gap-1.5 text-red-700 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 shadow-sm">
                        <ShieldAlert className="w-4 h-4" /> {ddiResult.summary.Major} Major
                      </span>
                    )}
                    {ddiResult.summary.Moderate > 0 && (
                      <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 shadow-sm">
                        <AlertTriangle className="w-4 h-4" /> {ddiResult.summary.Moderate} Moderate
                      </span>
                    )}
                    {ddiResult.summary.Minor > 0 && (
                      <span className="flex items-center gap-1.5 text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-lg border border-yellow-200 shadow-sm">
                        <Info className="w-4 h-4" /> {ddiResult.summary.Minor} Minor
                      </span>
                    )}
                    {ddiResult.interactionCount === 0 && (
                      <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 shadow-sm">
                        <Shield className="w-4 h-4" /> Safe: No Known Interactions
                      </span>
                    )}
                  </div>
                  
                  {ddiResult.interactions.length > 0 && (
                    <div className="max-h-[250px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-2 space-y-2">
                      {ddiResult.interactions.map((interaction: any) => (
                        <div key={interaction.ddi_id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge variant={
                              interaction.severity === 'Major' ? 'destructive' : 
                              interaction.severity === 'Moderate' ? 'warning' : 'secondary'
                            } className="px-2 py-1">
                              {interaction.severity}
                            </Badge>
                            <span className="font-bold text-slate-800">
                              <span className="text-indigo-600">{interaction.my_drug}</span> 
                              <span className="text-slate-400 mx-2">⚡</span> 
                              <span className="text-indigo-600">{interaction.other_drug}</span>
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-700 leading-relaxed pl-1">
                            {interaction.interaction_text}
                          </p>
                          {interaction.management_text && (
                            <div className="mt-3 bg-slate-50 border border-slate-100 p-3 rounded-lg flex gap-3 items-start">
                              <BookOpen className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                              <p className="text-xs font-medium text-slate-600 leading-relaxed">
                                <span className="font-bold text-slate-800 block mb-0.5">Clinical Management:</span>
                                {interaction.management_text}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="p-8 max-w-[1400px] mx-auto w-full">
          {!detail && !detailLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 mt-20 animate-in fade-in zoom-in-95 duration-500">
              <div className="w-32 h-32 bg-white shadow-xl shadow-slate-200/50 rounded-full flex items-center justify-center mb-8 border border-slate-100">
                <Box className="w-12 h-12 text-indigo-300" />
              </div>
              <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">Clinical Workstation</h3>
              <p className="text-base font-medium text-slate-500 max-w-md text-center leading-relaxed">
                Select a medication from the directory to view its complete clinical profile, safety constraints, and formulary data.
              </p>
            </div>
          ) : detailLoading ? (
            <div className="h-64 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
          ) : detail && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Hero Section */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-8 sm:p-10 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50/50 flex flex-col lg:flex-row gap-8 lg:items-start relative">
                  
                  {/* Image Box */}
                  <div className="w-32 h-32 lg:w-48 lg:h-48 shrink-0 bg-white rounded-2xl border-2 border-slate-100 shadow-xl shadow-slate-200/40 flex items-center justify-center p-4 relative z-10">
                    {detail.vezeeta_image_url ? (
                      <img src={detail.vezeeta_image_url} alt={detail.name_en} className="w-full h-full object-contain drop-shadow-md" />
                    ) : detail.image_id ? (
                      <img src={`/images/medications/${detail.image_id}.jpg`} alt={detail.name_en} className="w-full h-full object-contain drop-shadow-md" 
                           onError={(e) => { (e.target as HTMLImageElement).src = '/images/placeholder-pill.png'; }} />
                    ) : (
                      <Pill className="w-16 h-16 text-slate-200" />
                    )}
                  </div>

                  {/* Header Info */}
                  <div className="flex-1 min-w-0 z-10">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div>
                        <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight leading-tight">{detail.name_en}</h1>
                        {detail.name_ar && <h2 className="text-xl font-bold text-slate-500 mt-1" dir="rtl">{detail.name_ar}</h2>}
                      </div>
                      <Badge variant={detail.formulary_status === 'Formulary' ? 'success' : 'secondary'} className="px-4 py-1.5 text-sm self-start">
                        {detail.formulary_status}
                      </Badge>
                    </div>

                    <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 space-y-3 mt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Company / Manufacturer</span>
                          <span className="text-sm font-semibold text-slate-800">{detail.company || 'Unknown'}</span>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Semantic Clinical Drug (SCD)</span>
                          <span className="text-sm font-semibold text-slate-800">{detail.scd_name || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Dose Form (SCDF)</span>
                          <span className="text-sm font-semibold text-slate-800">{detail.scdf_name || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">ATC Code & Product Type</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{detail.atc_code}</span>
                            <span className="text-sm font-medium text-slate-600">{detail.product_type}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Safety & Alerts Ribbon */}
                <div className="bg-slate-50 border-t border-slate-200 p-4 px-8 flex flex-wrap gap-3">
                  {detail.resolved_legal_status === 'Prescription' && (
                    <Badge variant="destructive" className="px-3 py-1.5 shadow-sm text-sm"><AlertCircle className="w-4 h-4 mr-1.5"/> Prescription Only (Rx)</Badge>
                  )}
                  {detail.resolved_hazardous && (
                    <Badge variant="purple" className="px-3 py-1.5 shadow-sm text-sm"><Zap className="w-4 h-4 mr-1.5"/> Hazardous Drug</Badge>
                  )}
                  {detail.resolved_cytotoxic && (
                    <Badge variant="purple" className="px-3 py-1.5 shadow-sm text-sm"><AlertTriangle className="w-4 h-4 mr-1.5"/> Cytotoxic</Badge>
                  )}
                  {detail.resolved_pregnancy_alarm && (
                    <Badge variant="warning" className="px-3 py-1.5 shadow-sm text-sm">Pregnancy Warning</Badge>
                  )}
                  {detail.resolved_older_adult && (
                    <Badge variant="warning" className="px-3 py-1.5 shadow-sm text-sm">Older Adult Caution</Badge>
                  )}
                  {detail.refrigerated && (
                    <Badge variant="info" className="px-3 py-1.5 shadow-sm text-sm"><Snowflake className="w-4 h-4 mr-1.5"/> Refrigerated ({detail.lower_temp}°C - {detail.upper_temp}°C)</Badge>
                  )}
                  {detail.resolved_light_protection && (
                    <Badge variant="secondary" className="px-3 py-1.5 shadow-sm text-sm"><Sun className="w-4 h-4 mr-1.5"/> Protect from Light</Badge>
                  )}
                  {detail.lasa && (
                    <Badge variant="warning" className="px-3 py-1.5 shadow-sm text-sm font-mono"><EyeOff className="w-4 h-4 mr-1.5"/> LASA: {detail.lasa_level}</Badge>
                  )}
                  {detail.psp && (
                    <Badge variant="purple" className="px-3 py-1.5 shadow-sm text-sm">Patient Safety Program</Badge>
                  )}
                  {detail.market_shortage && (
                    <Badge variant="destructive" className="px-3 py-1.5 shadow-sm text-sm">Market Shortage</Badge>
                  )}
                </div>
              </div>

              {/* Data Tabs Container */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex border-b border-slate-200 px-2 pt-2 bg-slate-50 overflow-x-auto no-scrollbar">
                  <TabButton active={activeTab === 'info'} onClick={() => setActiveTab('info')} icon={Activity} label="Clinical Rules & Specs" />
                  <TabButton active={activeTab === 'ingredients'} onClick={() => setActiveTab('ingredients')} icon={Layers} label={`Ingredients (${detail.ingredients?.length || 0})`} />
                  <TabButton active={activeTab === 'indications'} onClick={() => setActiveTab('indications')} icon={CheckCircle2} label={`Indications (${indications.length})`} />
                  <TabButton active={activeTab === 'adrs'} onClick={() => setActiveTab('adrs')} icon={ShieldAlert} label={`Adverse Reactions (${adrs.length})`} />
                </div>

                <div className="p-8 min-h-[400px]">
                  
                  {/* INFO TAB */}
                  {activeTab === 'info' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                      
                      {/* Clinical Adjustments */}
                      <div>
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-6">
                          <Scale className="w-5 h-5 text-indigo-500" /> Clinical Adjustments
                        </h3>
                        <div className="space-y-4">
                          <AdjustmentCard 
                            active={detail.resolved_renal_adj} 
                            title="Renal Adjustment" 
                            cutoff={detail.crcl_cutoff ? `CrCl < ${detail.crcl_cutoff} ml/min` : null}
                          />
                          <AdjustmentCard 
                            active={detail.resolved_hepatic_adj} 
                            title="Hepatic Adjustment" 
                            cutoff={detail.child_pugh_cutoff ? `Child-Pugh: ${detail.child_pugh_cutoff}` : null}
                          />
                          <AdjustmentCard 
                            active={detail.resolved_obesity_adj} 
                            title="Obesity Adjustment" 
                            cutoff={detail.bmi_cutoff ? `BMI > ${detail.bmi_cutoff}` : null}
                          />
                          {detail.pregnancy_note && (
                            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200">
                              <h4 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> Pregnancy Details
                              </h4>
                              <p className="text-sm font-medium text-amber-800 leading-relaxed">{detail.pregnancy_note}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Specs & Identifiers */}
                      <div>
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-6">
                          <BookOpen className="w-5 h-5 text-indigo-500" /> Specifications & IDs
                        </h3>
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
                          <SpecRow label="Brand ID" value={detail.brand_id} mono />
                          <SpecRow label="Physical Volume" value={detail.volume ? `${detail.volume} ${detail.volume_unit || ''}` : 'N/A'} />
                          <SpecRow label="Concern Level" value={detail.resolved_concern_level || 'Normal'} />
                          <SpecRow label="HIS Coded" value={detail.his_coded ? 'Yes' : 'No'} />
                        </div>
                      </div>

                    </div>
                  )}

                  {/* INGREDIENTS TAB */}
                  {activeTab === 'ingredients' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {detail.ingredients?.map((ing, i) => (
                        <div key={i} className="flex items-start gap-5 p-6 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
                          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xl shrink-0 z-10 shadow-sm border border-indigo-200">
                            {ing.rank}
                          </div>
                          <div className="z-10">
                            <h4 className="font-black text-slate-900 text-lg leading-tight mb-1">{ing.api}</h4>
                            <p className="text-indigo-600 font-bold text-sm bg-indigo-50 inline-block px-2 py-0.5 rounded-md border border-indigo-100 mb-3">{ing.api_roa}</p>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-500 border border-slate-200">IR ID: {ing.ir_id}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* INDICATIONS TAB */}
                  {activeTab === 'indications' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {indications.map((ind) => (
                        <div key={ind.indication_id} className="p-5 border border-slate-200 rounded-2xl bg-white shadow-sm flex items-start gap-4 hover:border-emerald-300 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-base leading-snug mb-1">{ind.indication_text}</p>
                            <p className="text-xs font-bold text-slate-500 capitalize tracking-wide">
                              {ind.indication_type.replace(/_/g, ' ')} • via {ind.source_ingredient}
                            </p>
                          </div>
                        </div>
                      ))}
                      {indications.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-400 font-medium">No specific indications found in clinical database.</div>
                      )}
                    </div>
                  )}

                  {/* ADRs TAB */}
                  {activeTab === 'adrs' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {adrs.map((adr) => (
                        <div key={adr.adr_id} className="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm hover:border-red-300 transition-colors relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-2 h-full bg-red-100 group-hover:bg-red-400 transition-colors" />
                          <p className="font-bold text-slate-900 text-sm leading-snug mb-2 pr-4">{adr.side_effect_name}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {adr.frequency_label}
                            </span>
                            <span className="text-xs font-medium text-slate-400 truncate max-w-[120px]">
                              via {adr.source_ingredient}
                            </span>
                          </div>
                        </div>
                      ))}
                      {adrs.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-400 font-medium">No adverse reactions logged.</div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SUBCOMPONENTS ──

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-6 py-4 text-sm font-bold border-b-2 transition-all relative whitespace-nowrap",
        active 
          ? "border-indigo-600 text-indigo-700 bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.02)] rounded-t-xl" 
          : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
      )}
    >
      <Icon className={cn("w-4 h-4 transition-transform duration-300", active && "scale-110")} />
      {label}
    </button>
  );
}

function SpecRow({ label, value, mono }: { label: string, value: React.ReactNode, mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-3 px-5 hover:bg-slate-50 transition-colors">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span className={cn("text-sm font-semibold text-slate-900", mono && "font-mono bg-slate-100 px-2 py-0.5 rounded")}>{value}</span>
    </div>
  );
}

function AdjustmentCard({ active, title, cutoff }: { active: boolean, title: string, cutoff: React.ReactNode }) {
  return (
    <div className={cn(
      "p-4 rounded-2xl border flex items-center justify-between transition-colors",
      active ? "bg-white border-slate-200 shadow-sm" : "bg-slate-50/50 border-slate-100 opacity-60"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn("w-2 h-2 rounded-full", active ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-slate-300")} />
        <span className={cn("font-bold text-sm", active ? "text-slate-800" : "text-slate-500")}>{title}</span>
      </div>
      <div className="flex items-center gap-3">
        {active && cutoff && (
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">
            {cutoff}
          </span>
        )}
        <span className={cn("text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded", active ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-500")}>
          {active ? 'Required' : 'None'}
        </span>
      </div>
    </div>
  );
}
