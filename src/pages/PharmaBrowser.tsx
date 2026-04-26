import React, { useState, useEffect } from 'react';
import { Search, Filter, AlertTriangle, Pill, ShieldAlert, Activity, BookOpen, Layers, CheckCircle2, ChevronRight, X, FlaskConical, Beaker, Thermometer } from 'lucide-react';
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
  
  const [activeTab, setActiveTab] = useState<'info' | 'ingredients' | 'adrs' | 'indications'>('info');
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

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-slate-50">
      {/* LEFT PANEL: Search & Results */}
      <div className="w-[400px] flex-shrink-0 flex flex-col border-r border-slate-200 bg-white z-10">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Beaker className="w-6 h-6 text-indigo-600" />
            Pharma Directory
          </h2>
          
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search medications (min 3 chars)..."
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
              />
            </div>
            
            <div className="flex gap-2">
              <select 
                value={status}
                onChange={e => { setStatus(e.target.value); setOffset(0); }}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Formularies</option>
                <option value="Formulary">Formulary</option>
                <option value="Non-Formulary">Non-Formulary</option>
              </select>
            </div>
            {totalResults > 0 && (
              <div className="text-xs font-semibold text-slate-500 mt-2">
                Showing {results.length} of {totalResults.toLocaleString()} medications
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Searching...</div>
          ) : results.length > 0 ? (
            results.map((r) => (
              <div 
                key={r.brand_id} 
                onClick={() => setSelectedBrandId(r.brand_id)}
                className={cn(
                  "p-3 rounded-xl cursor-pointer transition-all border",
                  selectedBrandId === r.brand_id 
                    ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                    : "bg-white border-transparent hover:bg-slate-50 hover:border-slate-200"
                )}
              >
                <div className="flex gap-3">
                  <div className="pt-1">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                      checked={selectedForDdi.has(r.brand_id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleDdiSelection(r.brand_id);
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-semibold text-slate-800 text-sm truncate">{r.name_en}</h4>
                      <Badge variant={r.formulary_status === 'Formulary' ? 'success' : 'secondary'} className="text-[10px] shrink-0">
                        {r.formulary_status === 'Formulary' ? 'F' : 'NF'}
                      </Badge>
                    </div>
                    {r.name_ar && <p className="text-xs text-slate-500 truncate" dir="rtl">{r.name_ar}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">ATC: {r.atc_code}</span>
                      {r.scd_legal_status === 'Prescription' && (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-medium border border-amber-200">Rx</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
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
              className="w-full py-3 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors rounded-xl border border-indigo-100 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load More Medications'}
            </button>
          )}
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
          <div className="p-8 max-w-5xl mx-auto w-full">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              
              {/* Header */}
              <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-start gap-6">
                
                {/* Photo rendering logic */}
                <div className="w-24 h-24 shrink-0 bg-white border border-slate-200 rounded-xl flex items-center justify-center overflow-hidden shadow-sm">
                  {detail.vezeeta_image_url ? (
                    <img src={detail.vezeeta_image_url} alt={detail.name_en} className="w-full h-full object-contain" />
                  ) : detail.image_id ? (
                    <img src={`/images/medications/${detail.image_id}.jpg`} alt={detail.name_en} className="w-full h-full object-contain" 
                         onError={(e) => { (e.target as HTMLImageElement).src = '/images/placeholder-pill.png'; }} />
                  ) : (
                    <Pill className="w-10 h-10 text-slate-300" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h1 className="text-2xl font-black text-slate-900">{detail.name_en}</h1>
                      {detail.name_ar && <h2 className="text-lg text-slate-600 mt-1" dir="rtl">{detail.name_ar}</h2>}
                      <p className="text-slate-500 mt-2 text-sm">{detail.scdf_name}</p>
                    </div>
                    <Badge variant={detail.formulary_status === 'Formulary' ? 'success' : 'secondary'} className="text-sm px-3 py-1">
                      {detail.formulary_status}
                    </Badge>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mt-4">
                    {detail.resolved_legal_status === 'Prescription' && (
                      <Badge variant="destructive" className="bg-amber-100 text-amber-800 border-amber-200">Prescription Only (Rx)</Badge>
                    )}
                    {detail.resolved_hazardous && (
                      <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200"><AlertTriangle className="w-3 h-3 mr-1"/> Hazardous</Badge>
                    )}
                    {detail.resolved_pregnancy_alarm && (
                      <Badge variant="warning" className="bg-orange-100 text-orange-800 border-orange-200">Pregnancy Warning</Badge>
                    )}
                    {detail.refrigerated && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200"><Thermometer className="w-3 h-3 mr-1"/> Refrigerated</Badge>
                    )}
                    {detail.resolved_light_protection && (
                      <Badge variant="secondary" className="bg-slate-800 text-white">Protect from Light</Badge>
                    )}
                    {detail.lasa && (
                      <Badge variant="warning" className="bg-yellow-100 text-yellow-800 border-yellow-300 font-mono">LASA</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 px-4 bg-slate-50/50">
                <TabButton active={activeTab === 'info'} onClick={() => setActiveTab('info')} icon={BookOpen} label="Clinical Card" />
                <TabButton active={activeTab === 'ingredients'} onClick={() => setActiveTab('ingredients')} icon={Layers} label={`Ingredients (${detail.ingredients?.length || 0})`} />
                <TabButton active={activeTab === 'indications'} onClick={() => setActiveTab('indications')} icon={CheckCircle2} label={`Indications (${indications.length})`} />
                <TabButton active={activeTab === 'adrs'} onClick={() => setActiveTab('adrs')} icon={ShieldAlert} label={`ADRs (${adrs.length})`} />
              </div>

              {/* Tab Content */}
              <div className="p-6 bg-white min-h-[400px]">
                
                {/* INFO TAB */}
                {activeTab === 'info' && (
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <h3 className="font-bold text-slate-800 border-b pb-2">Identity & Classification</h3>
                      <div className="space-y-3 text-sm">
                        <InfoRow label="Brand ID" value={<span className="font-mono text-slate-600">{detail.brand_id}</span>} />
                        <InfoRow label="Company" value={detail.company || '-'} />
                        <InfoRow label="ATC Code" value={<span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">{detail.atc_code}</span>} />
                        <InfoRow label="Market Shortage" value={detail.market_shortage ? <span className="text-red-600 font-bold">Yes</span> : 'No'} />
                        <InfoRow label="SCD / SCD IN" value={<span className="text-slate-600 text-xs">{detail.scd_name || detail.ingredients?.map(i => i.api).join(' + ') || 'N/A'}</span>} />
                        <InfoRow label="SCDF (Dose Form)" value={<span className="text-slate-600 text-xs">{detail.scdf_name || 'N/A'}</span>} />
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <h3 className="font-bold text-slate-800 border-b pb-2">Clinical Adjustments (Inherited)</h3>
                      <div className="space-y-3 text-sm">
                        <InfoRow label="Renal Adjustment" value={detail.resolved_renal_adj ? 'Required' : 'Not required'} />
                        <InfoRow label="Hepatic Adjustment" value={detail.resolved_hepatic_adj ? 'Required' : 'Not required'} />
                        <InfoRow label="Older Adult Flag" value={detail.resolved_older_adult ? 'Caution' : 'None'} />
                      </div>
                    </div>
                  </div>
                )}

                {/* INGREDIENTS TAB */}
                {activeTab === 'ingredients' && (
                  <div className="space-y-4">
                    {detail.ingredients?.map((ing, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                          {ing.rank}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-lg">{ing.api}</h4>
                          <p className="text-slate-500 text-sm mt-1">{ing.api_roa}</p>
                          <div className="mt-3">
                            <span className="text-xs text-slate-400 font-mono">IR ID: {ing.ir_id}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* INDICATIONS TAB */}
                {activeTab === 'indications' && (
                  <div className="grid gap-3">
                    {indications.map((ind) => (
                      <div key={ind.indication_id} className="p-3 border border-slate-200 rounded-lg flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-slate-800">{ind.indication_text}</p>
                          <p className="text-xs text-slate-500 mt-1 capitalize">
                            {ind.indication_type.replace(/_/g, ' ')} • via {ind.source_ingredient}
                          </p>
                        </div>
                      </div>
                    ))}
                    {indications.length === 0 && <p className="text-slate-500 text-center py-8">No specific indications found.</p>}
                  </div>
                )}

                {/* ADRs TAB */}
                {activeTab === 'adrs' && (
                  <div className="grid grid-cols-2 gap-3">
                    {adrs.map((adr) => (
                      <div key={adr.adr_id} className="p-3 border border-slate-200 rounded-lg">
                        <p className="font-medium text-slate-800">{adr.side_effect_name}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {adr.frequency_label} • via {adr.source_ingredient}
                        </p>
                      </div>
                    ))}
                    {adrs.length === 0 && <p className="text-slate-500 text-center py-8 col-span-2">No adverse reactions logged.</p>}
                  </div>
                )}

              </div>
            </div>
          </div>
        ) : (
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

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-colors",
        active 
          ? "border-indigo-600 text-indigo-700 bg-indigo-50/50" 
          : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1 border-b border-slate-100 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
