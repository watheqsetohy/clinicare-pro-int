import React, { useState, useEffect } from 'react';
import { Search, Filter, AlertTriangle, Pill, ShieldAlert, Activity, BookOpen, Layers, CheckCircle2, ChevronRight, X, FlaskConical, Beaker, Thermometer, BrainCircuit, Fingerprint, ImagePlus, ShieldCheck, Stethoscope, Network, Info, Scale, ExternalLink, Eye, ChevronDown, Lock, Circle, ClipboardCheck, Biohazard, Snowflake, Zap, Sun, Droplets, Syringe, Package, Loader2, RefreshCw } from 'lucide-react';
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
  resolved_concern_level?: string;
  resolved_cytotoxic?: boolean;
  resolved_controlled?: boolean;
  clinisys_code?: string;
  psp?: boolean;
  scd_id?: string;
  scdf_id?: string;
  ham?: string;
  resolved_renal_adj: boolean;
  resolved_hepatic_adj: boolean;
  resolved_pregnancy_alarm: boolean;
  resolved_older_adult: boolean;
  lasa: boolean;
  refrigerated: boolean;
  lower_temp?: number;
  upper_temp?: number;
  market_shortage: boolean;
  photosensitive?: boolean;
  photo_storage?: string;
  photo_reconstitution?: string;
  photo_dilution?: string;
  photo_administration?: string;
  photo_comments?: string;
  scd_name?: string;
  scdf_name: string;
  atc_code: string;
  image_id?: string;
  vezeeta_image_url?: string;
  ingredients?: any[];
  product_type?: string;
  ptc_approvals?: {
    hospital_name: string;
    ptc_code: string;
    ptc_date: string;
    ptc_level: string;
  }[];
  major_unit?: string;
  major_unit_qty?: string;
  mid_unit?: string;
  mid_unit_qty?: string;
  minor_unit?: string;
  minor_unit_qty?: string;
  default_rx_unit?: string;
  default_roa?: string;
  roa_df?: string;
  l1_code?: string;
  l1_name?: string;
  l2_code?: string;
  l2_name?: string;
  l3_code?: string;
  l3_name?: string;
  l4_code?: string;
  l4_name?: string;
  l5_name?: string;
  ddd?: string | number;
  uom?: string;
  atc_adm_route?: string;
}

interface DdiResult {
  drugCount: number;
  interactionCount: number;
  summary: { Major: number; Moderate: number; Minor: number; Unknown: number };
  brandMapping: any[];
  interactions: any[];
}


function CollapsibleSection({ title, icon: Icon, children, defaultOpen = true, headerBg = "bg-slate-50 dark:bg-slate-900/50", iconBg = "bg-blue-50", iconColor = "text-blue-600" }: any) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  return (
    <section className="bg-white dark:bg-surface-dark rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden mb-8 transition-all">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors ${headerBg}`}
      >
        <div className="flex items-center gap-3">
           <div className={`p-2 rounded-lg flex items-center justify-center ${iconBg} ${iconColor}`}>
             <Icon className="w-6 h-6" />
           </div>
           <h3 className="font-bold text-xl text-slate-800 dark:text-white tracking-tight">{title}</h3>
        </div>
        <div className="text-slate-400">
           <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {isOpen && (
        <div className="animate-fadeIn">
          {children}
        </div>
      )}
    </section>
  );
}

// ── Photosensitivity Handling Stage Pipeline ──
function PhotosensitivityPipeline({ detail }: { detail: BrandDetail }) {
  const [expanded, setExpanded] = useState(false);

  const stages = [
    { key: 'storage', label: 'Storage', icon: Package, note: detail.photo_storage, color: 'from-amber-400 to-amber-500', ring: 'ring-amber-200', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    { key: 'reconstitution', label: 'Reconstitution', icon: Droplets, note: detail.photo_reconstitution, color: 'from-orange-400 to-orange-500', ring: 'ring-orange-200', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
    { key: 'dilution', label: 'Dilution', icon: FlaskConical, note: detail.photo_dilution, color: 'from-rose-400 to-rose-500', ring: 'ring-rose-200', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
    { key: 'administration', label: 'Administration', icon: Syringe, note: detail.photo_administration, color: 'from-red-400 to-red-500', ring: 'ring-red-200', bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
  ];

  const activeStages = stages.filter(s => s.note && s.note.trim());

  return (
    <div className="mt-3">
    <div className="group relative h-full flex flex-col">
      {/* Trigger Button */}
      <button
        onClick={() => activeStages.length > 0 ? setExpanded(!expanded) : null}
        className={`w-full p-4 rounded-xl border flex flex-col justify-between transition-all shadow-sm min-h-[108px] h-full ${
          activeStages.length > 0 
            ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 cursor-pointer' 
            : 'bg-slate-800 border-slate-900 cursor-default'
        }`}
      >
        <div className="flex items-start justify-between w-full">
          <span className="text-sm font-bold text-white max-w-[140px] leading-tight text-left">
            Protect from Light
          </span>
          <Sun className="w-5 h-5 text-yellow-400 shrink-0" />
        </div>
        
        {activeStages.length > 0 ? (
           <div className="flex items-center justify-between w-full mt-auto pt-2">
             <div className="text-[10px] text-yellow-400/80 uppercase tracking-wider font-bold text-left">
               {activeStages.length} of {stages.length} stages — Click to view
             </div>
             <ChevronDown className={`w-5 h-5 text-yellow-500 transition-transform duration-300 shrink-0 ${expanded ? 'rotate-180' : ''}`} />
           </div>
        ) : (
           <div className="mt-auto pt-2"></div>
        )}
      </button>

      {/* Expanded Pipeline Visualization */}
      {expanded && (
        <div className="mt-4 animate-fadeIn">
          {/* Pipeline Track */}
          <div className="relative">
            {/* Horizontal connector line */}
            <div className="absolute top-[34px] left-[40px] right-[40px] h-1 bg-gradient-to-r from-amber-200 via-orange-200 via-rose-200 to-red-200 rounded-full z-0" />
            {/* Animated glow overlay */}
            <div className="absolute top-[33px] left-[40px] right-[40px] h-1.5 bg-gradient-to-r from-amber-300 via-orange-300 via-rose-300 to-red-300 rounded-full z-0 opacity-50 animate-pulse" />

            {/* Stage Nodes */}
            <div className="relative z-10 grid grid-cols-4 gap-2">
              {stages.map((stage) => {
                const StageIcon = stage.icon;
                const hasData = stage.note && stage.note.trim();
                return (
                  <div key={stage.key} className="flex flex-col items-center">
                    {/* Node Circle */}
                    <div className={`w-[68px] h-[68px] rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${
                      hasData
                        ? `bg-gradient-to-br ${stage.color} ring-4 ${stage.ring} ring-offset-2`
                        : 'bg-slate-200 ring-2 ring-slate-100'
                    }`}>
                      <StageIcon className={`w-7 h-7 ${hasData ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                    {/* Label */}
                    <span className={`mt-2 text-[10px] font-black uppercase tracking-wider ${hasData ? stage.text : 'text-slate-400'}`}>
                      {stage.label}
                    </span>
                    {/* Status indicator */}
                    <div className={`mt-1 w-2 h-2 rounded-full ${hasData ? 'bg-green-500 shadow-sm shadow-green-300' : 'bg-slate-300'}`} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stage Detail Cards */}
          {activeStages.length > 0 && (
            <div className="mt-6 space-y-3">
              {activeStages.map((stage) => {
                const StageIcon = stage.icon;
                return (
                  <div key={stage.key} className={`${stage.bg} ${stage.border} border rounded-xl p-4 flex items-start gap-3 transition-all hover:shadow-md`}>
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stage.color} flex items-center justify-center shrink-0 shadow-sm`}>
                      <StageIcon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-black uppercase tracking-wider ${stage.text} mb-1`}>{stage.label}</div>
                      <p className="text-sm text-slate-700 leading-relaxed">{stage.note}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Additional Comments */}
          {detail.photo_comments && (
            <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 italic">
              <span className="font-bold not-italic text-slate-500 uppercase text-[10px] tracking-wider block mb-1">Additional Notes:</span>
              {detail.photo_comments}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function LasaDetailsDrawer({ lasaCode, onClose }: { lasaCode: string | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    if (!lasaCode) return;
    setLoading(true);
    fetch(`/api/pharma/lasa/${encodeURIComponent(lasaCode)}`)
      .then(res => res.json())
      .then(d => {
        setData(d || []);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, [lasaCode]);

  if (!lasaCode) return null;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-[201] flex flex-col transform transition-transform duration-300 animate-in slide-in-from-right">
        <div className="p-6 border-b flex items-start justify-between bg-yellow-50 border-yellow-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-yellow-200 flex items-center justify-center">
                <Eye className="w-5 h-5 text-yellow-700" />
              </div>
              <h2 className="text-xl font-black text-yellow-900">LASA Group</h2>
            </div>
            <p className="text-sm font-bold text-yellow-700/70 uppercase tracking-widest pl-10">Code: {lasaCode}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-yellow-200 rounded-xl transition-colors">
            <X className="w-5 h-5 text-yellow-700" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-4">
              <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
              <div className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Fetching Group...</div>
            </div>
          ) : (
            <div className="space-y-3">
              {data.map((item) => (
                <div key={item.brand_id} className="p-4 rounded-xl border bg-white shadow-sm flex flex-col gap-1 hover:border-yellow-300 hover:shadow-md transition-all">
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-slate-800">{item.name_en}</div>
                    {item.lasa_level && (
                      <div className="px-2 py-0.5 rounded-md bg-slate-100 border text-[10px] font-black text-slate-500 uppercase tracking-wider">{item.lasa_level}</div>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">{item.scd_name}</div>
                  <div className="mt-2 text-[11px] font-bold text-yellow-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    {item.lasa}
                  </div>
                </div>
              ))}
              {data.length === 0 && !loading && (
                <div className="text-center py-10 text-slate-500 font-medium text-sm">
                  No other medications found in this group.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
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
  
  const [selectedLasaCode, setSelectedLasaCode] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'indications' | 'adr' | 'ddi'>('indications');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [adrs, setAdrs] = useState<any[]>([]);
  const [indications, setIndications] = useState<any[]>([]);
  const [packaging, setPackaging] = useState<{
    resolved: any;
    local: any;
    live: any;
    hasLive: boolean;
  } | null>(null);
  const [packagingView, setPackagingView] = useState<'resolved' | 'local' | 'live'>('resolved');
  const [liveStatus, setLiveStatus] = useState<{ connected: boolean; error?: string } | null>(null);
  const [syncingLive, setSyncingLive] = useState(false);

  const [selectedForDdi, setSelectedForDdi] = useState<Set<string>>(new Set());
  const [ddiResult, setDdiResult] = useState<DdiResult | null>(null);
  const [ddiLoading, setDdiLoading] = useState(false);

  // Resize Logic
  const [sidebarWidth, setSidebarWidth] = useState(384);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // e.clientX is in screen pixels. Subtract the 80px Layout sidebar (ml-20),
      // then divide by 0.88 zoom to convert to CSS pixels inside the zoomed container.
      const newWidth = (e.clientX - 80) / 0.88;
      if (newWidth >= 250 && newWidth <= 800) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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
      setPackaging(null);
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

        // Fetch Packaging (dual source)
        const pkgRes = await fetch(`/api/pharma/brand/${selectedBrandId}/packaging`);
        if (pkgRes.ok) {
          const pkgData = await pkgRes.json();
          setPackaging(pkgData);
        }

        // Fetch live DB status (non-blocking)
        fetch('/api/pharma/packaging/live-status')
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setLiveStatus(d); })
          .catch(() => {});

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
    <div style={{ zoom: '88%', height: 'calc(100% / 0.88)' }} className="flex overflow-hidden bg-gray-50/50 dark:bg-black/20 transition-colors duration-200 w-full">
      {/* LEFT PANEL: Search & Results */}
      <div style={{ width: sidebarWidth }} className="bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 relative z-0 transition-colors shadow-sm">
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

        {/* Pagination/Add */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <button className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-2.5 rounded-xl transition-colors border border-blue-200 border-dashed">
            <span className="text-xl leading-none">+</span>
            Add New Medication
          </button>
        </div>
      </div>

      {/* RESIZE HANDLE */}
      <div 
        onMouseDown={() => setIsResizing(true)}
        className="w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 z-50 transition-colors shrink-0"
        style={{
          boxShadow: isResizing ? '0 0 0 1px #60a5fa' : 'none'
        }}
      ></div>

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
          <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-black/20 animate-fadeIn relative">
            {/* Page Header (Frozen) */}
            <div className="sticky top-0 z-50 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur-md px-6 py-6 md:px-8 border-b border-slate-200 dark:border-slate-800 shadow-sm mb-8">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white">
                    {detail.name_en}
                  </h2>
                  <span className="px-3 py-1 text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800">
                    {detail.formulary_status}
                  </span>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-arabic tracking-wide mb-2" dir="rtl">
                  {detail.name_ar}
                </p>
                <div className="inline-block mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 bg-white border border-slate-200 uppercase tracking-widest rounded px-1.5 py-0.5 shadow-sm">SCD</span>
                    <span className="text-sm font-bold text-slate-600">{detail.scd_name || 'Not Specified'}</span>
                  </div>
                </div>
                {/* ATTACHED ICONS */}
                <div className="flex flex-wrap items-center gap-3">
                  {detail.refrigerated ? (
                    <div title="Refrigerated" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-50 text-cyan-700 border border-cyan-200 font-bold text-xs uppercase tracking-wide">
                      <Snowflake className="w-4 h-4" /> Refrigerated
                    </div>
                  ) : (
                    <div title="Room Temperature" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs uppercase tracking-wide">
                      <Thermometer className="w-4 h-4" /> Room Temp
                    </div>
                  )}
                  {detail.ham && (
                    <div title="High Alert Medication" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 font-bold text-xs uppercase tracking-wide">
                      <AlertTriangle className="w-4 h-4" /> HAM
                    </div>
                  )}
                  {detail.resolved_hazardous && (
                    <div title="Hazardous Drug" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-200 font-bold text-xs uppercase tracking-wide">
                      <Biohazard className="w-4 h-4" /> HD
                    </div>
                  )}
                  {detail.resolved_controlled && (
                    <div title="Controlled Substance" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs uppercase tracking-wide">
                      <Lock className="w-4 h-4" /> CS
                    </div>
                  )}
                  {detail.psp && (
                    <div title="Patient Support Program" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-pink-50 text-pink-700 border border-pink-200 font-bold text-xs uppercase tracking-wide">
                      <Package className="w-4 h-4" /> PSP
                    </div>
                  )}
                  {detail.lasa && (
                    <button onClick={() => setSelectedLasaCode(detail.lasa_code)} title="Look Alike / Sound Alike" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-200 font-bold text-xs uppercase tracking-wide hover:bg-yellow-100 transition-colors cursor-pointer">
                      <Eye className="w-4 h-4" /> LASA
                    </button>
                  )}
                  {detail.resolved_light_protection && (
                    <div title="Protect from Light" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-yellow-300 border border-slate-600 font-bold text-xs uppercase tracking-wide">
                      <Sun className="w-4 h-4" /> PSD
                    </div>
                  )}
                </div>
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
            </div>

            {/* Inner Content Wrapper */}
            <div className="px-6 md:px-8 pb-8">
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
                      <IdentityItem label="HIS Code" value={detail.clinisys_code || 'NA'} source="Medication_Master.Clinisys_Code" />
                      <IdentityItem label="Manufacturer" value={detail.company || 'Unknown'} source="Medication_Master.Company" />
                      <IdentityItem label="Product Type" value={detail.product_type || 'Medication'} source="SCDF_Directory.Product_Type" />
                      <IdentityItem label="Formulary Status" value={detail.formulary_status} source="Medication_Master.Formulary_Status" isBadge />
                    </div>
                    <div className="space-y-6">
                      <IdentityItem label="ATC Level 5 Code" value={detail.atc_code || 'NA'} source="ATC Directory.ATC Code" />
                      <IdentityItem label="SCD Code" value={detail.scd_id || 'NA'} source="SCD_Directory.SCD_ID" />
                      <IdentityItem label="SCDF Code" value={detail.scdf_id || 'NA'} source="SCDF_Directory.SCDF_ID" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* PTC APPROVALS SECTION */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
              <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-xl text-slate-800 tracking-tight">PTC Approvals</h3>
              </div>
              <div className="p-6">
                {detail.ptc_approvals && detail.ptc_approvals.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {detail.ptc_approvals.map((ptc, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-100 rounded-bl-3xl -mr-2 -mt-2 flex items-center justify-center z-0">
                           <ShieldCheck className="w-5 h-5 text-emerald-600 mb-1 ml-1" />
                        </div>
                        <div className="relative z-10 space-y-3">
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Hospital / PTC Body</span>
                            <span className="text-sm font-bold text-slate-800">{ptc.hospital_name || 'Unknown'}</span>
                          </div>
                          <div className="flex items-center gap-6 pt-2 border-t border-slate-200/60">
                             <div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Code</span>
                                <span className="text-xs font-semibold text-slate-600">{ptc.ptc_code || 'N/A'}</span>
                             </div>
                             <div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Date</span>
                                <span className="text-xs font-semibold text-slate-600">{ptc.ptc_date || 'N/A'}</span>
                             </div>
                             <div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Level</span>
                                <span className="text-xs font-semibold text-slate-600">{ptc.ptc_level || 'N/A'}</span>
                             </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 opacity-40">
                    <ClipboardCheck className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-sm text-slate-600 font-medium">No hospital-specific PTC approvals documented for this brand.</p>
                  </div>
                )}
              </div>
            </section>

            {/* SECTION 2: SAFETY & HANDLING */}
            <CollapsibleSection title="Safety & Handling" icon={ShieldAlert} iconBg="bg-blue-50 dark:bg-blue-900/20" iconColor="text-blue-500"><div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* 1- Safety */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-6 bg-red-500 rounded-full"></div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">1- Safety</h4>
                  </div>
                  <div className="space-y-4">
                    {/* HAM */}
                    {detail.ham && (
                      <div className="group relative h-full">
                        <div className="p-4 rounded-xl border flex flex-col justify-center items-center gap-2 transition-colors shadow-sm bg-red-50 border-red-200 min-h-[108px] h-full text-center">
                          <AlertTriangle className="w-8 h-8 text-red-600 mb-1" />
                          <span className="text-sm font-bold text-red-900 leading-tight">
                            High Alert Medication
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* LASA */}
                    {detail.lasa && (
                      <div className="group relative h-full">
                        <button 
                          onClick={() => setSelectedLasaCode(detail.lasa_code)}
                          className="w-full p-4 rounded-xl border transition-all shadow-sm bg-yellow-50 hover:bg-yellow-100 border-yellow-200 flex flex-col justify-between gap-3 text-left cursor-pointer min-h-[108px] h-full"
                        >
                          <div className="flex items-start justify-between w-full">
                            <span className="text-sm font-bold text-yellow-900 max-w-[200px] leading-tight">
                              Look-Alike / Sound-Alike (LASA)
                            </span>
                            <Eye className="w-5 h-5 text-yellow-600 shrink-0" />
                          </div>
                          <div className="flex items-center justify-between w-full mt-auto">
                             <div>
                               <div className="text-xs font-black text-yellow-700 uppercase tracking-widest">{detail.lasa}</div>
                               <div className="text-[10px] text-yellow-600/80 uppercase font-bold tracking-wider mt-0.5">Level: {detail.lasa_level || 'N/A'} • Code: {detail.lasa_code}</div>
                             </div>
                             <ChevronRight className="w-5 h-5 text-yellow-500 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0" />
                          </div>
                        </button>
                      </div>
                    )}
                    
                    {/* Hazardous */}
                    {detail.resolved_hazardous && (
                      <div className="group relative h-full">
                        <div className="p-4 rounded-xl border flex flex-col justify-between transition-colors shadow-sm bg-orange-50 border-orange-200 min-h-[108px] h-full">
                          <div className="flex items-start justify-between w-full mb-3">
                            <span className="text-sm font-bold text-orange-900 max-w-[150px] leading-tight">
                              Hazardous Drug
                            </span>
                            <Biohazard className="w-5 h-5 text-orange-600 shrink-0" />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 mt-auto">
                             <div className="bg-white/60 rounded-md p-2 border border-orange-100">
                               <div className="text-[9px] font-bold text-orange-500 uppercase tracking-widest mb-0.5">Concern Level</div>
                               <div className="text-xs font-black text-orange-800">{detail.resolved_concern_level || 'N/A'}</div>
                             </div>
                             <div className="bg-white/60 rounded-md p-2 border border-orange-100">
                               <div className="text-[9px] font-bold text-orange-500 uppercase tracking-widest mb-0.5">Cytotoxic</div>
                               <div className="text-xs font-black text-orange-800">{detail.resolved_cytotoxic ? 'YES' : 'NO'}</div>
                             </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {!detail.ham && !detail.resolved_hazardous && (
                       <div className="text-sm text-slate-400 font-medium italic">No specific safety warnings.</div>
                    )}
                  </div>
                </div>

                {/* 2- Legal Identity */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-6 bg-amber-500 rounded-full"></div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">2- Legal Identity</h4>
                  </div>
                  <div className="space-y-4">
                    {/* Legal Status */}
                    <div className="group relative h-full">
                      <div className={`p-4 rounded-xl border flex flex-col justify-between transition-colors shadow-sm min-h-[108px] h-full ${detail.resolved_legal_status === 'Prescription' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                        <div className="flex items-start justify-between w-full">
                          <span className={`text-sm font-bold max-w-[120px] leading-tight ${detail.resolved_legal_status === 'Prescription' ? 'text-amber-900' : 'text-emerald-900'}`}>
                            Legal Status
                          </span>
                          <Scale className={`w-5 h-5 shrink-0 ${detail.resolved_legal_status === 'Prescription' ? 'text-amber-600' : 'text-emerald-600'}`} />
                        </div>
                        <div className="flex items-center mt-auto pt-2">
                          {detail.resolved_legal_status === 'Prescription' ? (
                            <div className="flex items-center gap-2 text-amber-700">
                              <span className="font-serif italic font-black text-2xl leading-none pr-2 border-r border-amber-300">Rx</span>
                              <span className="text-sm font-black uppercase tracking-widest">{detail.resolved_legal_status}</span>
                            </div>
                          ) : (
                            <span className="text-sm font-black uppercase tracking-widest text-emerald-700">{detail.resolved_legal_status || 'Unspecified'}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Controlled Substance */}
                    {detail.resolved_controlled && (
                      <div className="group relative h-full">
                        <div className="p-4 rounded-xl border flex flex-col justify-between transition-colors shadow-sm bg-purple-50 border-purple-200 min-h-[108px] h-full">
                          <div className="flex items-start justify-between w-full">
                            <span className="text-sm font-bold text-purple-900 max-w-[140px] leading-tight">
                              Controlled Substance
                            </span>
                            <Lock className="w-5 h-5 text-purple-600 shrink-0" />
                          </div>
                          <div className="text-xs font-black text-purple-700 uppercase tracking-widest mt-auto pt-2">Controlled Narcotics</div>
                        </div>
                      </div>
                    )}
                    
                    {/* Patient Support Program (PSP) */}
                    {detail.psp && (
                      <div className="group relative h-full">
                        <div className="p-4 rounded-xl border flex flex-col justify-between transition-colors shadow-sm bg-pink-50 border-pink-200 min-h-[108px] h-full">
                          <div className="flex items-start justify-between w-full">
                            <span className="text-sm font-bold text-pink-900 max-w-[140px] leading-tight">
                              Patient Support Program
                            </span>
                            <Package className="w-5 h-5 text-pink-600 shrink-0" />
                          </div>
                          <div className="text-xs font-black text-pink-700 uppercase tracking-widest mt-auto pt-2">PSP Available</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3- Storage */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">3- Storage</h4>
                  </div>
                  <div className="space-y-4">
                    {/* Refrigerated */}
                    <div className="group relative h-full">
                      <div className={`p-4 rounded-xl border flex flex-col justify-between transition-colors shadow-sm min-h-[108px] h-full ${detail.refrigerated ? "bg-cyan-50 border-cyan-100" : "bg-slate-50 border-slate-200"}`}>
                        <div className="flex items-start justify-between w-full">
                          <span className={`text-sm font-bold max-w-[120px] leading-tight ${detail.refrigerated ? "text-cyan-800" : "text-slate-600"}`}>
                            {detail.refrigerated ? 'Refrigerated' : 'Room Temperature'}
                          </span>
                          {detail.refrigerated ? (
                            <Snowflake className="w-5 h-5 text-cyan-600 shrink-0" />
                          ) : (
                            <Thermometer className="w-5 h-5 text-slate-400 shrink-0" />
                          )}
                        </div>
                        
                        {/* Temp Range */}
                        <div className="flex items-center gap-3 mt-auto pt-3 border-t border-slate-200/60 dark:border-slate-300/20">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase text-slate-400 font-bold">Lower</span>
                            <span className="text-xs font-black text-slate-700">{detail.lower_temp || (detail.refrigerated ? '2' : '15')}°C</span>
                          </div>
                          <div className="w-px h-3 bg-slate-300"></div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase text-slate-400 font-bold">Upper</span>
                            <span className="text-xs font-black text-slate-700">{detail.upper_temp || (detail.refrigerated ? '8' : '25')}°C</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Photosensitivity Pipeline (Combines static tag + interactive details) */}
                    {(detail.resolved_light_protection || detail.photosensitive) && (
                      <PhotosensitivityPipeline detail={detail} />
                    )}
                  </div>
                </div>
              </div></CollapsibleSection>

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
                    <span className="text-base font-bold text-slate-800">{detail.default_rx_unit || 'Not Specified'}</span>
                  </div>
                  <div className="flex justify-between items-center group">
                    <div className="flex flex-col">
                      <span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Route of Administration:</span>
                    </div>
                    <span className="text-base font-bold text-slate-800">{detail.default_roa || 'Not Specified'}</span>
                  </div>
                </div>
              </section>
              {/* PACKAGING HIERARCHY — dual source: Local + Live */}
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-full">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-500 flex items-center justify-center">
                      <Layers className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 tracking-tight">Packaging Hierarchy</h3>
                      {packaging?.hasLive && (
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Live Override Active</span>
                      )}
                    </div>
                  </div>
                  {/* Source toggle + sync button */}
                  <div className="flex items-center gap-2">
                    <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-bold">
                      <button
                        onClick={() => setPackagingView('resolved')}
                        className={`px-2.5 py-1 rounded-md transition-all ${
                          packagingView === 'resolved'
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >Resolved</button>
                      <button
                        onClick={() => setPackagingView('local')}
                        className={`px-2.5 py-1 rounded-md transition-all ${
                          packagingView === 'local'
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >Local</button>
                      <button
                        onClick={() => setPackagingView('live')}
                        className={`px-2.5 py-1 rounded-md transition-all ${
                          packagingView === 'live'
                            ? (packaging?.hasLive ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm')
                            : (packaging?.hasLive ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-500 hover:text-slate-700')
                        }`}
                      >
                        Live {liveStatus?.connected ? '🟢' : liveStatus ? '🔴' : '⚪'}
                      </button>
                    </div>
                    <button
                      title="Sync from live HIS database"
                      disabled={syncingLive || liveStatus?.connected === false}
                      onClick={async () => {
                        setSyncingLive(true);
                        try {
                          await fetch('/api/pharma/packaging/sync-live', { method: 'POST' });
                          // Re-fetch packaging after sync
                          const r = await fetch(`/api/pharma/brand/${selectedBrandId}/packaging`);
                          if (r.ok) setPackaging(await r.json());
                        } finally {
                          setSyncingLive(false);
                        }
                      }}
                      className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingLive ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Data display */}
                <div className="p-6 space-y-4">
                  {(() => {
                    const src = packagingView === 'live' ? packaging?.live :
                                packagingView === 'local' ? packaging?.local :
                                packaging?.resolved;

                    if (!src) {
                      return (
                        <div className="text-center py-6 text-slate-400 text-sm">
                          {packagingView === 'live'
                            ? liveStatus?.connected === false
                              ? '🔴 Live database not configured or unreachable.'
                              : 'No live packaging data synced yet. Click ↻ to sync.'
                            : 'No packaging data recorded.'}
                        </div>
                      );
                    }

                    const unitRow = (label: string, unit: string | null, qty: string | number | null) => (
                      <div className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                        <span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">{label}:</span>
                        <div className="flex items-center gap-2">
                          {qty != null && <span className="bg-slate-100 text-slate-600 text-xs font-black px-2 py-0.5 rounded-md">×{Number(qty)}</span>}
                          <span className="text-sm font-black text-slate-800">{unit || <span className="text-slate-300 font-normal">—</span>}</span>
                        </div>
                      </div>
                    );

                    return (
                      <>
                        {unitRow('Major Unit', src.major_unit, src.major_unit_qty)}
                        {unitRow('Med Unit',   src.mid_unit,   src.mid_unit_qty)}
                        {unitRow('Minor Unit', src.minor_unit, src.minor_unit_qty)}
                        {src === packaging?.live && packaging?.live?.synced_at && (
                          <p className="text-[10px] text-slate-400 mt-3 text-right">
                            Live synced: {new Date(packaging.live.synced_at).toLocaleString()}
                          </p>
                        )}
                      </>
                    );
                  })()}
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
                <div className="space-y-4">
                  <div className="flex justify-between items-baseline px-1">
                    <span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">Ingredient(s), Strength(s), and Strength Unit(s)</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {detail.ingredients?.length ? (
                      detail.ingredients.map((i, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full shadow-sm">
                          <FlaskConical className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-bold text-slate-800">
                            {i.api} {i.api_conc != null ? Number(i.api_conc) : ''} {i.api_conc_unit || ''}
                          </span>
                          <span className="px-2 py-0.5 ml-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
                            API
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-sm font-bold text-slate-500 px-2">No ingredients recorded</span>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 pt-4 border-t border-slate-100">
                  <ClinicalItem label="Dose Form" value={detail.roa_df || 'Not Specified'} source="SCDF_Directory.ROA_DF" />
                  <ClinicalItem label="Dosage Form Group" value={detail.scdf_name?.split(' ').pop() || 'Not Specified'} source="SCDF_Directory.SCDF_Name" />
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
              <div className="p-6 md:p-8">
                <div className="space-y-4">
                  {/* Layer 1 */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm">
                    <span className="bg-slate-200 text-slate-700 text-xs font-black px-2.5 py-1.5 rounded-lg min-w-[50px] text-center border border-slate-300">{detail.l1_code || 'N/A'}</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anatomical Main Group (Level 1)</span>
                      <span className="text-sm font-bold text-slate-800">{detail.l1_name || 'Not Specified'}</span>
                    </div>
                  </div>
                  {/* Layer 2 */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm ml-0 sm:ml-4">
                    <span className="bg-slate-200 text-slate-700 text-xs font-black px-2.5 py-1.5 rounded-lg min-w-[50px] text-center border border-slate-300">{detail.l2_code || 'N/A'}</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Therapeutic Main Group (Level 2)</span>
                      <span className="text-sm font-bold text-slate-800">{detail.l2_name || 'Not Specified'}</span>
                    </div>
                  </div>
                  {/* Layer 3 */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm ml-0 sm:ml-8">
                    <span className="bg-slate-200 text-slate-700 text-xs font-black px-2.5 py-1.5 rounded-lg min-w-[50px] text-center border border-slate-300">{detail.l3_code || 'N/A'}</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pharmacological Subgroup (Level 3)</span>
                      <span className="text-sm font-bold text-slate-800">{detail.l3_name || 'Not Specified'}</span>
                    </div>
                  </div>
                  {/* Layer 4 */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm ml-0 sm:ml-12">
                    <span className="bg-slate-200 text-slate-700 text-xs font-black px-2.5 py-1.5 rounded-lg min-w-[50px] text-center border border-slate-300">{detail.l4_code || 'N/A'}</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chemical/Therapeutic Subgroup (Level 4)</span>
                      <span className="text-sm font-bold text-slate-800">{detail.l4_name || 'Not Specified'}</span>
                    </div>
                  </div>
                  {/* Layer 5 */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-blue-50 p-4 rounded-xl border border-blue-200 shadow-sm ml-0 sm:ml-16">
                    <span className="bg-blue-600 text-white text-xs font-black px-2.5 py-1.5 rounded-lg min-w-[70px] text-center shadow-inner">{detail.atc_code || 'N/A'}</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Chemical Substance (Level 5)</span>
                      <span className="text-base font-black text-blue-900">{detail.l5_name || detail.name_en}</span>
                    </div>
                  </div>
                  
                  {/* DDD Info */}
                  {(detail.ddd || detail.atc_adm_route) && (
                    <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Defined Daily Dose (DDD)</span>
                         <span className="text-lg font-black text-slate-700">{detail.ddd ? `${detail.ddd} ${detail.uom || ''}` : 'N/A'}</span>
                       </div>
                       <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Final ROA</span>
                         <span className="text-lg font-black text-slate-700">{detail.atc_adm_route || 'N/A'}</span>
                       </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* SECTION 7: CDSS & CLINICAL MONOGRAPH */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
              <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-500 flex items-center justify-center">
                  <BrainCircuit className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-xl text-slate-800 tracking-tight">CDSS & Clinical Monograph</h3>
              </div>
              
              {detail.rxcui && /^\d+$/.test(detail.rxcui) ? (
                <>
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
                </>
              ) : (
                <div className="p-12 flex flex-col items-center justify-center text-center bg-slate-50/50">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <ShieldAlert className="w-8 h-8 text-slate-400" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-700 mb-2">Virtual SCDF Detected</h4>
                  <p className="text-sm text-slate-500 max-w-md">
                    This medication is mapped to a Virtual SCDF (RxNorm ID: <strong>{detail.rxcui || 'None'}</strong>). Because this is a localized variant and not an exact 1:1 international RxNorm match, CDSS interactions and clinical monographs are intentionally disabled for clinical safety.
                  </p>
                </div>
              )}
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
          </div>
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
      {/* Modals and Drawers */}
      <LasaDetailsDrawer lasaCode={selectedLasaCode} onClose={() => setSelectedLasaCode(null)} />
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
      {isExpanded && (
        <div className="p-4 pt-0 border-t border-slate-100 bg-white">
          <div className="grid grid-cols-2 gap-4 mt-3">
            <ExpandedItem label="Frequency – lower bound" value={adr.freq_lower !== null && adr.freq_lower !== undefined ? `${adr.freq_lower}` : null} />
            <ExpandedItem label="Frequency – upper bound" value={adr.freq_upper !== null && adr.freq_upper !== undefined ? `${adr.freq_upper}` : null} />
          </div>
        </div>
      )}
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
        <span className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg border shadow-sm bg-emerald-50 text-emerald-700 border-emerald-100`}>{indication.approval_level || 'Unknown'}</span>
      </div>
      {isExpanded && (
        <div className="p-4 pt-0 border-t border-slate-100 bg-white">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3">
            <ExpandedItem label="Indication Type" value={indication.indication_type?.replace(/_/g, ' ')} />
            <ExpandedItem label="Combined Product Details" value={indication.combined_product} />
            <ExpandedItem label="Age Group" value={indication.age_group} />
            <ExpandedItem label="Patient Characteristics" value={indication.patient_chars} />
            <ExpandedItem label="Dose Form" value={indication.dose_form} />
          </div>
        </div>
      )}
    </div>
  );
};
