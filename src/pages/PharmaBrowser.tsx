import React, { useState, useEffect } from 'react';
import { Search, Filter, AlertTriangle, Pill, ShieldAlert, Activity, BookOpen, Layers, CheckCircle2, ChevronRight, X, FlaskConical, Beaker, Thermometer, BrainCircuit, Fingerprint, ImagePlus, ShieldCheck, Stethoscope, Network, Info, Scale, ExternalLink, Eye, ChevronDown, Lock, Circle, ClipboardCheck } from 'lucide-react';
import { cn } from '../lib/utils';

function Badge({ children, variant, className }: any) {
  const variants: any = {
    default: "bg-slate-100 text-slate-800",
    success: "bg-emerald-100 text-emerald-800 border-emerald-200",
    secondary: "bg-slate-100 text-slate-700 border-slate-200",
    destructive: "bg-red-100 text-red-800 border-red-200",
    warning: "bg-amber-100 text-amber-800 border-amber-200"
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2", variants[variant] || variants.default, className)}>{children}</span>;
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
  resolved_renal_adj: boolean;
  resolved_hepatic_adj: boolean;
  resolved_pregnancy_alarm: boolean;
  resolved_older_adult: boolean;
  lasa: boolean;
  refrigerated: boolean;
  market_shortage: boolean;
  scd_name?: string;
  scdf_name: string;
  atc_code: string;
  image_id?: string;
  vezeeta_image_url?: string;
  ingredients?: any[];
}

interface DdiResult {
  drugCount: number;
  interactionCount: number;
  summary: { Major: number; Moderate: number; Minor: number; Unknown: number };
  brandMapping: any[];
  interactions: any[];
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
  
  const [activeTab, setActiveTab] = useState<'indications' | 'adr' | 'ddi'>('indications');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [adrs, setAdrs] = useState<any[]>([]);
  const [indications, setIndications] = useState<any[]>([]);

  const [selectedForDdi, setSelectedForDdi] = useState<Set<string>>(new Set());
  const [ddiResult, setDdiResult] = useState<DdiResult | null>(null);
  const [ddiLoading, setDdiLoading] = useState(false);

  // Reset offset when query changes
  useEffect(() => {
    setOffset(0);
  }, [q, status]);

  // Search logic
  useEffect(() => {
    // If empty, it will just fetch the first 50 results (the complete directory view)
    
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
    if (!selectedBrandId) {
      setDetail(null);
      setAdrs([]);
      setIndications([]);
      return;
    }

    async function loadDetail() {
      setDetailLoading(true);
      try {
        // Fetch base detail
        const res = await fetch(`/api/pharma/brand/${selectedBrandId}`);
        if (!res.ok) throw new Error('Detail fetch failed');
        const data = await res.json();
        setDetail(data);

        // Fetch ADRs
        const adrRes = await fetch(`/api/pharma/brand/${selectedBrandId}/adrs`);
        if (adrRes.ok) {
          const adrData = await adrRes.json();
          setAdrs(adrData.adrs || []);
        }

        // Fetch Indications
        const indRes = await fetch(`/api/pharma/brand/${selectedBrandId}/indications`);
        if (indRes.ok) {
          const indData = await indRes.json();
          setIndications(indData.indications || []);
        }

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
        if (res.ok) {
          const data = await res.json();
          setDdiResult(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setDdiLoading(false);
      }
    }
    runDdi();
  }, [selectedForDdi]);

  const toggleDdiSelection = (brandId: string) => {
    const newSet = new Set(selectedForDdi);
    if (newSet.has(brandId)) {
      newSet.delete(brandId);
    } else {
      if (newSet.size >= 10) return; // limit to 10 for safety
      newSet.add(brandId);
    }
    setSelectedForDdi(newSet);
  };


  const handleAskAI = async () => {
    setLoadingAi(true);
    setAiSummary(null);
    setTimeout(() => {
      setAiSummary("This is an AI generated summary of the clinical profile for this medication, analyzing its indications, side effects, and precautions.");
      setLoadingAi(false);
    }, 1500);
  };

  const indicationsByAPI = Object.entries(
    indications.reduce((acc, ind) => {
      const api = ind.source_ingredient || 'Unknown';
      if (!acc[api]) acc[api] = [];
      acc[api].push(ind);
      return acc;
    }, {} as Record<string, any[]>)
  ).map(([api, inds]) => ({ api, indications: inds as any[] }));

  const adrsByAPI = Object.entries(
    adrs.reduce((acc, adr) => {
      const api = adr.source_ingredient || 'Unknown';
      if (!acc[api]) acc[api] = [];
      acc[api].push(adr);
      return acc;
    }, {} as Record<string, any[]>)
  ).map(([api, adrsList]) => ({ api, adrs: adrsList as any[] }));
  
  const ddisByAPI: any[] = [];

  return (
    <div style={{ zoom: '80%' }} className="h-[calc(125vh-5rem)] flex overflow-hidden bg-gray-50/50 dark:bg-black/20 transition-colors duration-200">
      {/* LEFT PANEL: Search & Results */}
      <div className="w-96 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 relative z-0 transition-colors shadow-sm">
        {/* Title Header */}
        <div className="px-6 py-5">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
            Medication Master
          </h2>
        </div>

        {/* Search and Filter */}
        <div className="px-4 pb-4">
          <div className="relative group">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all outline-none placeholder:text-slate-500" 
              placeholder="Search medications..." 
              value={q}
              onChange={e => setQ(e.target.value)}
              type="text"
            />
            <button className="absolute right-3 top-2.5 text-slate-400 hover:text-blue-500 transition-colors">
              <Filter className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex gap-2 mt-3">
            <select 
              value={status}
              onChange={e => { setStatus(e.target.value); setOffset(0); }}
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              <option value="">All Formularies</option>
              <option value="Formulary">Formulary</option>
              <option value="Non-Formulary">Non-Formulary</option>
            </select>
          </div>
          {totalResults > 0 && (
            <div className="text-[11px] font-semibold text-slate-400 mt-3">
              Showing {results.length} of {totalResults.toLocaleString()} medications
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Searching...</div>
          ) : results.length > 0 ? (
            results.map((r) => {
              const isActive = selectedBrandId === r.brand_id;
              return (
              <div 
                key={r.brand_id} 
                onClick={() => setSelectedBrandId(r.brand_id)}
                className={cn(
                  "group relative p-4 rounded-xl cursor-pointer transition-all border",
                  isActive 
                    ? "bg-blue-50/60 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ring-1 ring-blue-100 dark:ring-0 shadow-sm" 
                    : "bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent"
                )}
              >
                {/* Active Selection Indicator */}
                {isActive && (
                  <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-blue-500 rounded-r-full"></div>
                )}
                
                <div className={isActive ? 'pl-2' : ''}>
                  <div className="flex justify-between items-start mb-1.5">
                    <h3 className={cn("font-bold text-base leading-tight pr-2", isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-800 dark:text-slate-100")}>
                      {r.name_en}
                    </h3>
                    
                    {/* Status Dot */}
                    <div className="flex items-center justify-center pt-1 shrink-0">
                      <span className={cn("h-2.5 w-2.5 rounded-full", 
                        isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-blue-500/80"
                      )}></span>
                    </div>
                  </div>

                  <p className={cn("text-[10px] font-medium mb-3 uppercase tracking-tight", isActive ? "text-slate-600 dark:text-slate-300" : "text-slate-500 dark:text-slate-400")} dir="rtl">
                    {r.name_ar || r.scdf_name || r.product_type}
                  </p>

                  <div className="flex items-center">
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-2.5 py-1 rounded-md border border-emerald-100 dark:border-emerald-800/50">
                      {r.formulary_status}
                    </span>
                  </div>
                </div>
              </div>
            )})
          ) : (q || status) ? (
            <div className="p-8 text-center text-slate-500 text-sm">No medications found.</div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
              <Search className="w-8 h-8 text-slate-200" />
              <p>Type to search medications</p>
            </div>
          )}
          
          {results.length > 0 && results.length < totalResults && (
            <button 
              onClick={() => setOffset(prev => prev + 50)}
              disabled={loading}
              className="w-full py-3 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors rounded-xl border border-blue-100 disabled:opacity-50 mt-2"
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>

        {/* Bottom Action Button */}
        <div className="p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 sticky bottom-0 z-10">
          <button className="w-full bg-[#4F81F1] hover:bg-blue-600 text-white py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98]">
            <span className="material-icons-round text-lg">+</span>
            Add New Medication
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: Details & DDI Checker */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto relative">
        
        {/* Top bar for DDI checks (if active) */}
        {selectedForDdi.size > 0 && (
          <div className="sticky top-0 z-20 bg-white border-b border-indigo-100 shadow-sm p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-indigo-600" />
                DDI Checker Engine 
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {selectedForDdi.size} drugs selected
                </span>
              </h3>
              <button 
                onClick={() => setSelectedForDdi(new Set())}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium"
              >
                Clear Selection
              </button>
            </div>
            
            {ddiLoading ? (
              <div className="text-sm text-indigo-600 flex items-center gap-2">
                <Activity className="w-4 h-4 animate-spin" /> Analyzing interactions...
              </div>
            ) : ddiResult ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4 text-sm font-medium">
                  {ddiResult.summary.Major > 0 && (
                    <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-1 rounded-lg border border-red-200">
                      <AlertTriangle className="w-4 h-4" /> {ddiResult.summary.Major} Major
                    </span>
                  )}
                  {ddiResult.summary.Moderate > 0 && (
                    <span className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                      <AlertTriangle className="w-4 h-4" /> {ddiResult.summary.Moderate} Moderate
                    </span>
                  )}
                  {ddiResult.summary.Minor > 0 && (
                    <span className="flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-200">
                      <AlertTriangle className="w-4 h-4" /> {ddiResult.summary.Minor} Minor
                    </span>
                  )}
                  {ddiResult.interactionCount === 0 && (
                    <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                      <CheckCircle2 className="w-4 h-4" /> No known interactions
                    </span>
                  )}
                </div>
                
                {ddiResult.interactions.length > 0 && (
                  <div className="max-h-[300px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-2">
                    {ddiResult.interactions.map(interaction => (
                      <div key={interaction.ddi_id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={
                            interaction.severity === 'Major' ? 'destructive' : 
                            interaction.severity === 'Moderate' ? 'warning' : 'secondary'
                          }>
                            {interaction.severity}
                          </Badge>
                          <span className="font-bold text-slate-800 text-sm">
                            {interaction.my_drug} <span className="text-slate-400 mx-1">×</span> {interaction.other_drug}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {interaction.interaction_text}
                        </p>
                        {interaction.management_text && (
                          <p className="text-xs text-slate-500 mt-2 bg-slate-50 p-2 rounded">
                            <span className="font-semibold block mb-1">Management:</span>
                            {interaction.management_text}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Brand Detail Card */}
        {detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Activity className="w-8 h-8 text-indigo-300 animate-spin" />
          </div>
        ) : detail ? (
          <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-black/20 p-6 md:p-8 animate-fadeIn relative">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white">
                    {detail.name_en}
                  </h2>
                  <span className="px-3 py-1 text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800">
                    {detail.formulary_status}
                  </span>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-arabic tracking-wide" dir="rtl">
                  {detail.name_ar}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleAskAI} 
                  disabled={loadingAi}
                  className="bg-[#4F81F1] hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold shadow-sm transition-all active:scale-95"
                >
                  <span className="text-lg">✨</span>
                  {loadingAi ? 'Analyzing...' : 'Clinical AI Insight'}
                </button>
              </div>
            </div>

            {aiSummary && (
              <section className="mb-8 bg-white rounded-2xl border border-indigo-100 p-6 shadow-sm animate-fadeIn">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <BrainCircuit className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-lg text-indigo-900">AI Clinical Summary</h3>
                </div>
                <div className="prose prose-sm max-w-none text-slate-600 leading-relaxed">
                  {aiSummary.split('\n').map((line, i) => (
                    <p key={i} className="mb-2">{line}</p>
                  ))}
                </div>
              </section>
            )}

            {/* SECTION 1: MEDICATION IDENTITY */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
              <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600 flex items-center justify-center">
                  <Fingerprint className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-xl text-slate-800 tracking-tight">Medication Identity</h3>
              </div>
              <div className="p-6">
                <div className="flex flex-col xl:flex-row gap-8">
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="w-48 h-48 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center overflow-hidden relative shadow-inner">
                      {detail.vezeeta_image_url ? (
                        <img src={detail.vezeeta_image_url} alt={detail.name_en} className="w-full h-full object-contain p-2" />
                      ) : detail.image_id ? (
                        <img src={`/images/medications/${detail.image_id}.jpg`} alt={detail.name_en} className="w-full h-full object-contain p-2" 
                             onError={(e) => { (e.target as HTMLImageElement).src = '/images/placeholder-pill.png'; }} />
                      ) : (
                        <>
                          <ImagePlus className="w-10 h-10 text-slate-300 mb-2" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Photo Available</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                    <div className="space-y-6">
                      <IdentityItem label="Medication Code" value={detail.brand_id} source="Medication_Master.Brand_ID" />
                      <IdentityItem label="HIS Code" value={detail.brand_id} source="Medication_Master.Clinisys_Code" />
                      <IdentityItem label="Manufacturer" value={detail.company || 'Unknown'} source="Medication_Master.Company" />
                      <IdentityItem label="Product Type" value={"Medication"} source="...SCDF_Directory.Product_Type" />
                      <IdentityItem label="Formulary Status" value={detail.formulary_status} source="Medication_Master.Formulary_Status" isBadge />
                    </div>
                    <div className="space-y-6">
                      <IdentityItem label="PTC Approval Code" value={"NA"} source="Medication_Master.PTC-Approval ID" />
                      <IdentityItem label="PTC Approval Date" value={"NA"} source="Medication_Master.PTC Approval Date" />
                      <IdentityItem label="PTC Approval Level" value={"NA"} source="Medication_Master.PTC Approval Level" />
                      <IdentityItem label="PSP" value={'No'} source="Medication_Master.PSP" isBadge={false} badgeType={'default'} />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 2: SAFETY & HANDLING */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
              <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                <div className="text-blue-500 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-xl text-slate-800 tracking-tight">Safety & Handling</h3>
              </div>
              <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-6 bg-red-500 rounded-full"></div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">1- Safety</h4>
                  </div>
                  <div className="space-y-4">
                    <SafetyCard label="High Alert Medication (HAM)" value={detail.resolved_hazardous ? 'TRUE' : 'FALSE'} type={detail.resolved_hazardous ? 'danger' : 'success'} source="SCD_Directory.HAM" />
                    <SafetyCard label="Hazardous" value={detail.resolved_hazardous ? 'YES' : 'No'} type={detail.resolved_hazardous ? 'danger' : 'default'} source="Mapping.Hazardous" />
                    {detail.resolved_pregnancy_alarm && (
                       <SafetyCard label="Pregnancy Warning" value={"YES"} type="danger" source="Mapping.Pregnancy" />
                    )}
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-6 bg-amber-500 rounded-full"></div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">2- Legal Identity</h4>
                  </div>
                  <div className="space-y-4">
                    <SafetyCard label="Legal Status" value={detail.resolved_legal_status || 'Prescription Drug'} type={detail.resolved_legal_status === 'Prescription' ? 'warning' : 'success'} source="SCD_Directory.Legal Status" />
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Controlled Substance</span>
                        <span className="text-sm font-bold text-slate-800">No</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">3- Storage</h4>
                  </div>
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors shadow-sm ${detail.refrigerated ? "bg-emerald-50 border-emerald-100" : "bg-slate-100 border-slate-200"}`}>
                      <span className={`text-sm font-bold ${detail.refrigerated ? "text-emerald-700" : "text-slate-500"}`}>Refrigerated</span>
                      <CheckCircle2 className={`w-5 h-5 ${detail.refrigerated ? "text-emerald-500" : "text-slate-400"}`} />
                    </div>
                    {detail.resolved_light_protection && (
                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors shadow-sm bg-slate-800 border-slate-900`}>
                        <span className="text-sm font-bold text-white">Protect from Light</span>
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION: PTC APPROVALS */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
              <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-500 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-xl text-slate-800 tracking-tight">PTC Approvals</h3>
              </div>
              <div className="p-6 space-y-3">
                <div className="text-center py-10 opacity-40">
                  <ClipboardCheck className="w-10 h-10 mb-2 mx-auto text-slate-400" />
                  <p className="text-sm text-slate-600">No hospital-specific PTC approvals documented for this brand.</p>
                </div>
              </div>
            </section>

            {/* SECTION SIDE-BY-SIDE: DOSAGE & PACKAGING */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-full">
                <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-500 flex items-center justify-center">
                    <Stethoscope className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-xl text-slate-800 tracking-tight">Dosage & Administration</h3>
                </div>
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-center group">
                    <div className="flex flex-col">
                      <span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Default Rx Unit:</span>
                    </div>
                    <span className="text-base font-bold text-slate-800">{detail.scdf_name?.split(' ').pop() || 'Not Specified'}</span>
                  </div>
                  <div className="flex justify-between items-center group">
                    <div className="flex flex-col">
                      <span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Route of Administration:</span>
                    </div>
                    <span className="text-base font-bold text-slate-800">{detail.scdf_name?.split(' ')[1] || 'Not Specified'}</span>
                  </div>
                </div>
              </section>
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-full">
                <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-500 flex items-center justify-center">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-xl text-slate-800 tracking-tight">Packaging Hierarchy</h3>
                </div>
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-center group">
                    <div className="flex flex-col"><span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Major Unit:</span></div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-800">NA</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center group">
                    <div className="flex flex-col"><span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Med Unit:</span></div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-800">NA</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center group">
                    <div className="flex flex-col"><span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Minor Unit:</span></div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-800">NA</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* SECTION 3: RxNORM CLINICAL IDENTITY */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
              <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="font-bold text-xl text-slate-800 tracking-tight">RxNorm-Based Clinical Identity</h3>
              </div>
              <div className="p-8 space-y-8">
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline px-1">
                    <span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Ingredient(s), Strength(s), and Strength Unit(s)</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 shadow-inner group">
                     <span className="text-xl md:text-2xl font-black text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors">
                       {detail.ingredients?.length ? detail.ingredients.map(i => `${i.api} ${i.api_roa || ''}`).join(' / ') : "No ingredients recorded"}
                     </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 pt-4">
                  <ClinicalItem label="Dose Form" value={detail.scdf_name?.split(' ').pop() || 'Not Specified'} source="SCDF_Directory.ROA_DF" />
                  <ClinicalItem label="Semantic Clinical Drug (SCD)" value={detail.scd_name || 'Not Specified'} source="SCD_Directory.SCD" className="text-blue-600" />
                  <ClinicalItem label="Semantic Clinical Drug Form (SCDF)" value={detail.scdf_name || 'Not Specified'} source="SCDF_Directory.SCDF_Name" className="text-blue-600" />
                </div>
              </div>
            </section>

            {/* SECTION 4: WHO ATC CLASSIFICATION */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
              <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-500 flex items-center justify-center">
                  <Network className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-xl text-slate-800 tracking-tight">WHO ATC Classification</h3>
              </div>
              <div className="p-8">
                <div className="space-y-3 max-w-4xl">
                  <div className="flex items-center gap-4 bg-blue-50 p-4 rounded-2xl border border-blue-100 shadow-sm">
                    <span className="bg-blue-200 text-blue-700 text-[10px] font-black px-2 py-1.5 rounded-md min-w-[50px] text-center">{detail.atc_code || 'N/A'}</span>
                    <span className="text-base font-black text-blue-800">{'Pharmacological Class'}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 7: CLINICAL INFORMATION (TABS) */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
              <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-500 flex items-center justify-center">
                  <Info className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-xl text-slate-800 tracking-tight">Clinical Information</h3>
              </div>
              
              {/* Tabs Navigation */}
              <div className="flex border-b border-slate-100">
                <button onClick={() => setActiveTab('indications')} className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'indications' ? 'text-indigo-600 border-indigo-600 bg-indigo-50/30' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>Clinical Indications</button>
                <button onClick={() => setActiveTab('adr')} className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'adr' ? 'text-indigo-600 border-indigo-600 bg-indigo-50/30' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>Adverse Drug Reactions</button>
                <button onClick={() => setActiveTab('ddi')} className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'ddi' ? 'text-indigo-600 border-indigo-600 bg-indigo-50/30' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>Drug-Drug Interactions</button>
              </div>

              <div className="p-6">
                {activeTab === 'indications' && (
                  <div className="space-y-10 animate-fadeIn">
                    {indicationsByAPI.map((group, idx) => (
                      <div key={idx} className="space-y-4">
                        <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                          <div className="w-2 h-6 bg-indigo-400 rounded-full"></div>
                          <h4 className="text-base font-black text-slate-700 tracking-tight uppercase">{group.api}</h4>
                          <span className="text-[10px] text-slate-400 font-mono ml-auto uppercase opacity-50">API (Active Ingredient)</span>
                        </div>
                        <div className="space-y-3">
                          {group.indications.map((ind: any, iIdx: number) => <IndicationRow key={iIdx} indication={ind} />)}
                        </div>
                      </div>
                    ))}
                    {indicationsByAPI.length === 0 && <p className="text-slate-500 text-center py-8">No specific indications found.</p>}
                  </div>
                )}
                {activeTab === 'adr' && (
                  <div className="space-y-10 animate-fadeIn">
                    {adrsByAPI.map((group, idx) => (
                      <div key={idx} className="space-y-4">
                        <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                          <div className="w-2 h-6 bg-rose-400 rounded-full"></div>
                          <h4 className="text-base font-black text-slate-700 tracking-tight uppercase">{group.api}</h4>
                          <span className="text-[10px] text-slate-400 font-mono ml-auto uppercase opacity-50">API (Side Effect Profile)</span>
                        </div>
                        <div className="space-y-3">
                          {group.adrs.map((adr: any, aIdx: number) => <ADRRow key={aIdx} adr={adr} />)}
                        </div>
                      </div>
                    ))}
                    {adrsByAPI.length === 0 && <p className="text-slate-500 text-center py-8">No adverse reactions logged.</p>}
                  </div>
                )}
                {activeTab === 'ddi' && (
                  <div className="space-y-10 animate-fadeIn">
                    <p className="text-slate-500 text-center py-8">Use the global DDI Checker engine at the top of the browser to evaluate interactions.</p>
                  </div>
                )}
              </div>
            </section>

            {/* FINAL SECTION: LEGAL DOCUMENTS */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
              <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-600 flex items-center justify-center">
                  <Scale className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-xl text-slate-800 tracking-tight">Legal Documents</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="col-span-full text-center py-10 opacity-40">
                    <Scale className="w-10 h-10 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-600">No legal compliance documents recorded for this brand.</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="h-10"></div>
          </div>) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <div className="w-20 h-20 bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center mb-6">
              <Pill className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">Medication Browser</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              Search for a medication on the left to view its complete clinical knowledge card. Select multiple to check interactions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


const ExpandedItem: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
  <div>
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{label}:</span>
    <p className="text-sm font-medium text-slate-600 leading-relaxed">{value || 'Not specified'}</p>
  </div>
);

const IdentityItem: React.FC<{ label: string; value: any; source: string; isBadge?: boolean; badgeType?: any }> = ({ label, value, source, isBadge, badgeType }) => (
  <div className="group">
    <div className="flex justify-between items-baseline mb-1">
      <span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">{label}</span>
      <span className="text-[9px] text-slate-300 font-mono opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[150px]">{source}</span>
    </div>
    <div className="flex items-center">
      {isBadge ? <span className="px-3 py-1 text-sm font-bold rounded-lg border shadow-sm bg-blue-50 text-blue-700 border-blue-100">{value || 'N/A'}</span> : <span className="text-slate-800 font-bold text-base truncate">{value || 'No data recorded'}</span>}
    </div>
  </div>
);

const SafetyCard: React.FC<{ label: string; value: string; type?: any; source: string }> = ({ label, value, type, source }) => (
  <div className="group">
    <div className="flex justify-between items-center mb-1">
      <span className="text-slate-500 text-[11px] font-bold uppercase">{label}:</span>
      <span className="text-[7px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity uppercase">{source}</span>
    </div>
    <div className={`px-3 py-2 rounded-xl border text-sm font-bold shadow-sm transition-all ${type === "danger" ? "bg-red-50 text-red-700 border-red-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>{value}</div>
  </div>
);

const ClinicalItem: React.FC<{ label: string; value: string; source: string; className?: string }> = ({ label, value, source, className }) => (
  <div className="group border-b border-slate-50 pb-4">
    <div className="flex justify-between items-center mb-2">
      <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">{label}:</span>
      <span className="text-[8px] text-slate-300 font-mono opacity-0 group-hover:opacity-100 transition-opacity">{source}</span>
    </div>
    <div className={`font-bold text-sm ${className || 'text-slate-700'}`}>{value}</div>
  </div>
);

const ADRRow: React.FC<{ adr: any }> = ({ adr }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden transition-all duration-300 hover:shadow-md">
      <div className="flex items-center justify-between p-4 cursor-pointer select-none" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-4">
          <ChevronRight className={`w-5 h-5 transition-transform duration-300 text-slate-400 ${isExpanded ? "rotate-90 text-rose-500" : ""}`} />
          <span className="font-bold text-slate-700">{adr.side_effect_name || 'Unknown Side Effect'}</span>
        </div>
        <span className="px-3 py-1 text-[10px] font-black uppercase rounded-lg border shadow-sm bg-rose-50 text-rose-700 border-rose-100">{adr.frequency_label || 'Not Specified'}</span>
      </div>
    </div>
  );
};

const IndicationRow: React.FC<{ indication: any }> = ({ indication }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden transition-all duration-300 hover:shadow-md">
      <div className="flex items-center justify-between p-4 cursor-pointer select-none" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-4">
          <ChevronRight className={`w-5 h-5 transition-transform duration-300 text-slate-400 ${isExpanded ? "rotate-90 text-rose-500" : ""}`} />
          <span className="font-bold text-slate-700">{indication.indication_text || 'General Use'}</span>
        </div>
        <span className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg border shadow-sm bg-emerald-50 text-emerald-700 border-emerald-100`}>{indication.indication_type?.replace(/_/g, ' ') || 'Unknown'}</span>
      </div>
    </div>
  );
};
