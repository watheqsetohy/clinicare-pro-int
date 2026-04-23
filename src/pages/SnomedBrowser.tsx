import { useState, useEffect, useRef } from "react";
import { fetchWithAuth } from '../lib/authSession';
import { Search, Info, PlusCircle, Activity, ChevronRight, Stethoscope, Copy, AlertCircle, Menu, Filter, Slash, ChevronDown, Pill, FlaskConical, Sparkles, X } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface SnomedResult {
  conceptId: string;
  term: string;
  fsn: string;
  semanticTag: string;
}

interface SearchResponse {
  results: SnomedResult[];
  tagsCount: Record<string, number>;
}

interface ConceptDetail {
  conceptId: string;
  descriptions: any[];
  parents: any[];
  children: any[];
  attributes?: any[];
}

export function SnomedBrowser({ 
  onSelect, 
  isModal = false 
}: { 
  onSelect?: (concept: { conceptId: string, term: string, fsn: string }) => void,
  isModal?: boolean
} = {}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SnomedResult[]>([]);
  const [tagsCount, setTagsCount] = useState<Record<string, number>>({});
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [conceptDetail, setConceptDetail] = useState<ConceptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'diagram' | 'expression' | 'drugs'>('summary');

  // CDSS: Drug Therapy (SCDF-expanded indications)
  const [drugSuggestions, setDrugSuggestions] = useState<any[]>([]);
  const [drugsLoading, setDrugsLoading]       = useState(false);
  const [drugSearchQuery, setDrugSearchQuery] = useState('');
  const [inCounts,   setInCounts]   = useState<Record<string,number>>({});
  const [scdfCounts, setScdfCounts] = useState<Record<string,number>>({});

  // CDSS: SCDF-based Contraindications (Phase C4a)
  const [ciScdf, setCiScdf]           = useState<any[]>([]);
  const [ciScdfLoading, setCiScdfLoading] = useState(false);
  const [ciInCount,   setCiInCount]   = useState(0);
  const [ciScdfCount, setCiScdfCount] = useState(0);
  const [fdaCITerm, setFdaCITerm]     = useState(''); // keep for compat
  const [activeCard, setActiveCard]   = useState<'therapy'|'ci'>('therapy');

  // Detect if selected concept is a clinical disorder/finding
  const getSemanticTag = (): string | null => {
    if (!conceptDetail) return null;
    const fsn = conceptDetail.descriptions.find(d => d.typeId === '900000000000003001')?.term || '';
    const match = fsn.match(/\(([^)]+)\)$/);
    return match ? match[1].toLowerCase() : null;
  };
  const DISORDER_TAGS = new Set(['disorder', 'finding', 'disease', 'syndrome', 'condition']);

  const filterRef = useRef<HTMLDivElement>(null);
  
  // New SNOMED search configuration state
  const [showOptionsDropdown, setShowOptionsDropdown] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [searchMode, setSearchMode] = useState("Prefix any order");
  const [statusMode, setStatusMode] = useState("Active concepts only");
  const [descType, setDescType] = useState("Preferred Term");
  const [languageRefsets, setLanguageRefsets] = useState<string[]>(['US', 'GB']);

  const toggleLanguage = (lang: string) => {
    setLanguageRefsets(prev => 
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  // Close dropdown if clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptionsDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (query.trim().length >= 3) {
        setLoading(true);
        fetchWithAuth(`/api/snomed/search?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(searchMode)}&status=${encodeURIComponent(statusMode)}&desc=${encodeURIComponent(descType)}&langs=${encodeURIComponent(languageRefsets.join(','))}`)
          .then(res => res.json())
          .then((data: SearchResponse) => {
            if (data && data.results) {
              setResults(data.results);
              setTagsCount(data.tagsCount);
            } else {
              setResults([]);
              setTagsCount({});
            }
          })
          .catch(err => console.error("Search failed:", err))
          .finally(() => setLoading(false));
      } else {
        setResults([]);
        setTagsCount({});
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query, searchMode, statusMode, descType, languageRefsets]);

  useEffect(() => {
    if (selectedConceptId) {
      setDetailLoading(true);
      fetchWithAuth(`/api/snomed/concept/${selectedConceptId}`)
        .then(res => res.json())
        .then(data => {
          setConceptDetail(data);
        })
        .catch(err => console.error("Concept fetch failed:", err))
        .finally(() => setDetailLoading(false));
    } else {
      setConceptDetail(null);
    }
  }, [selectedConceptId]);

  // Fetch drug suggestions whenever we select a disorder concept
  useEffect(() => {
    if (!selectedConceptId || !conceptDetail) {
      setDrugSuggestions([]);
      setCiScdf([]); setCiInCount(0); setCiScdfCount(0); setFdaCITerm('');
      return;
    }
    const tag = getSemanticTag();
    if (!tag || !DISORDER_TAGS.has(tag)) {
      setDrugSuggestions([]); setCiScdf([]); setCiInCount(0); setCiScdfCount(0); setFdaCITerm('');
      return;
    }

    setDrugsLoading(true);
    fetchWithAuth(`/api/snomed/concept/${selectedConceptId}/medications?rel=all&limit=300`)
      .then(r => r.json())
      .then(data => {
        setDrugSuggestions(data.results || []);
        setInCounts(data.inCounts   || {});
        setScdfCounts(data.scdfCounts || {});
      })
      .catch(() => setDrugSuggestions([]))
      .finally(() => setDrugsLoading(false));

    // Fetch SCDF-based CI for this disorder
    setCiScdfLoading(true);
    fetchWithAuth(`/api/snomed/concept/${selectedConceptId}/ci-scdf?limit=300`)
      .then(r => r.json())
      .then(data => {
        setCiScdf(data.results || []);
        setCiInCount(data.inCount || 0);
        setCiScdfCount(data.scdfCount || 0);
        setFdaCITerm(data.conceptTerm || '');
      })
      .catch(() => setCiScdf([]))
      .finally(() => setCiScdfLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConceptId, conceptDetail]);

  const getFsn = (descriptions: any[]) => {
    return descriptions.find(d => d.typeId === '900000000000003001')?.term || "Unknown concept";
  };

  const toggleTag = (tag: string) => {
    setActiveTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const filteredResults = activeTags.length > 0 
    ? results.filter(r => activeTags.includes(r.semanticTag))
    : results;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      {!isModal && (
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0 shadow-sm z-10 w-full justify-between">
          <div className="flex items-center gap-2 pr-6">
            <Stethoscope className="w-6 h-6 text-blue-600" />
            <h1 className="font-semibold text-slate-800 text-lg">Terminology</h1>
          </div>
        </header>
      )}

      {/* Main 2-Column Split */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Column 1: Search Input & Results List */}
        <div className="w-[400px] bg-white border-r border-slate-200 flex flex-col shrink-0 relative z-10">
          <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
               <div className="text-xs text-slate-500 font-medium border-b-2 border-blue-500 px-1 pb-1">Search</div>
               
               <div className="flex items-center gap-2">
                 {/* Options Dropdown */}
                 <div className="relative" ref={optionsRef}>
                   <button 
                     onClick={() => setShowOptionsDropdown(!showOptionsDropdown)}
                     className={cn(
                       "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all",
                       showOptionsDropdown ? "border-[#1e8a38] text-white bg-[#22a042]" : "border-slate-300 text-slate-600 bg-white hover:bg-slate-50"
                     )}
                   >
                     <span className="text-[14px] leading-none mb-[1px]">⚙</span>
                     <span>Options</span>
                     <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                   </button>

                   {showOptionsDropdown && (
                     <div className="absolute left-0 top-full mt-2 w-[320px] bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-4">
                        
                        <div>
                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Search Mode</label>
                           <select 
                             className="w-full text-sm border border-slate-300 rounded-lg focus:ring-[#22a042] focus:border-[#22a042] py-2 px-3 bg-[#e8f5e9] text-[#1b5e20] font-medium font-sans"
                             value={searchMode} onChange={(e) => setSearchMode(e.target.value)}
                           >
                              <option value="Prefix any order">Prefix any order</option>
                              <option value="Whole word">Whole word</option>
                           </select>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Status</label>
                           <select className="w-full text-sm border border-[#c8e6c9] rounded-lg focus:ring-[#22a042] focus:border-[#22a042] py-2 px-3 bg-[#e8f5e9] text-[#1b5e20] font-medium"
                                   value={statusMode} onChange={(e) => setStatusMode(e.target.value)}>
                              <option value="Active concepts only">Active concepts only</option>
                              <option value="Active and Inactive concepts">Active and Inactive concepts</option>
                              <option value="Inactive concepts only">Inactive concepts only</option>
                           </select>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Description Type</label>
                           <select className="w-full text-sm border border-[#c8e6c9] rounded-lg focus:ring-[#22a042] focus:border-[#22a042] py-2 px-3 bg-[#e8f5e9] text-[#1b5e20] font-medium"
                                   value={descType} onChange={(e) => setDescType(e.target.value)}>
                              <option value="Preferred Term">Preferred Term</option>
                              <option value="FSN">FSN</option>
                              <option value="Exclude definitions">Exclude definitions</option>
                              <option value="All">All</option>
                           </select>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                           <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Language Refsets (Multi-select)</label>
                           <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                             <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={languageRefsets.includes('US')} onChange={() => toggleLanguage('US')} 
                                       className="w-4 h-4 rounded border-slate-300 text-[#22a042] focus:ring-[#22a042]" />
                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">US English</span>
                             </label>
                             <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={languageRefsets.includes('GB')} onChange={() => toggleLanguage('GB')} 
                                       className="w-4 h-4 rounded border-slate-300 text-[#22a042] focus:ring-[#22a042]" />
                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">GB English</span>
                             </label>
                           </div>
                        </div>

                     </div>
                   )}
                 </div>

               {/* Filter Dropdown */}
               <div className="relative" ref={filterRef}>
                 <button 
                   onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                   className={cn(
                     "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border bg-white transition-all",
                     activeTags.length > 0 ? "border-blue-500 text-blue-600 bg-blue-50" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                   )}
                 >
                   <Filter className="w-3.5 h-3.5" />
                   Filter by Tag {activeTags.length > 0 && `(${activeTags.length})`}
                   <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                 </button>

                 {showFilterDropdown && (
                   <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                     <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2 pt-1">Semantic Tags</div>
                     <div className="max-h-64 overflow-y-auto space-y-1">
                       {Object.keys(tagsCount).length === 0 ? (
                         <div className="px-2 py-3 text-xs text-slate-400 italic">Type a search term first...</div>
                       ) : (
                         Object.entries(tagsCount).sort((a,b) => (b[1] as number) - (a[1] as number)).map(([tag, count]) => (
                           <label key={tag} className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer group transition-colors">
                             <div className="flex items-center gap-3">
                               <input 
                                 type="checkbox" 
                                 className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                                 checked={activeTags.includes(tag)}
                                 onChange={() => toggleTag(tag)}
                               />
                               <span className="text-sm text-slate-700 group-hover:text-slate-900 capitalize leading-none">{tag}</span>
                             </div>
                             <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">
                               {count}
                             </span>
                           </label>
                         ))
                       )}
                     </div>
                   </div>
                 )}
               </div>
             </div>
          </div>

            <div className="relative">
              <input 
                type="text" 
                placeholder="Type at least 3 characters..."
                className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-all"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
            
            <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 px-1 font-medium">
              <span>
                {query.length >= 3 
                  ? `${filteredResults.length} matches found` 
                  : ''
                }
              </span>
              {loading && <Activity className="w-4 h-4 text-blue-500 animate-spin" />}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-white">
            {filteredResults.map((res, idx) => {
              const isSelected = selectedConceptId === res.conceptId;
              
              return (
                <div 
                  key={res.conceptId + idx}
                  onClick={() => setSelectedConceptId(res.conceptId)}
                  className={cn(
                    "flex flex-col p-3 border-b border-slate-100 cursor-pointer transition-colors relative",
                    isSelected ? "bg-blue-50/50" : "hover:bg-slate-50"
                  )}
                >
                  {isSelected && <div className="absolute left-0 top-0 h-full w-1 bg-blue-500" />}
                  
                  <div className="flex items-start gap-3 w-full pl-1">
                    <div className="w-6 h-6 rounded-full bg-[#fdf3c6] border border-[#f5e396] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <Menu className="w-3.5 h-3.5 text-[#b49911]" />
                    </div>
                    
                    {/* The stacked description layout: Term on top, FSN underneath */}
                    <div className="flex flex-col w-full overflow-hidden gap-0.5 mt-0.5">
                       <p className="text-[14px] font-semibold text-slate-800 leading-snug">
                          {res.term}
                       </p>
                       <p className="text-[12px] text-slate-500 leading-snug truncate" title={res.fsn}>
                          {res.fsn}
                       </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {query.length >= 3 && filteredResults.length === 0 && !loading && (
              <div className="text-center p-8 text-slate-500 flex flex-col items-center">
                <AlertCircle className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-sm">No matches found</p>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Concept Detail Panel (Unchanged DNA, matching original SNOMED behavior) */}
        <div className="flex-1 bg-slate-50 flex flex-col p-6 lg:p-8 overflow-y-auto z-0">
          {detailLoading ? (
             <div className="h-full flex items-center justify-center">
               <Activity className="w-10 h-10 text-blue-500 animate-spin opacity-50" />
             </div>
          ) : selectedConceptId && conceptDetail ? (
            <div className="max-w-4xl w-full mx-auto space-y-4">
              
              {/* Tabs */}
              <div className="flex gap-6 border-b border-slate-200 px-2">
                {(['Summary', 'Diagram', 'Expression'] as const).map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab.toLowerCase() as any)}
                    className={cn(
                      "pb-3 text-sm font-semibold transition-colors relative",
                      activeTab === tab.toLowerCase() ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {tab}
                    {activeTab === tab.toLowerCase() && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />
                    )}
                  </button>
                ))}

                {/* Drug Guidance tab — conditionally shown for disorders */}
                {(getSemanticTag() && DISORDER_TAGS.has(getSemanticTag()!)) && (
                  <button
                    onClick={() => setActiveTab('drugs')}
                    className={cn(
                      "pb-3 text-sm font-semibold transition-colors relative flex items-center gap-1.5",
                      activeTab === 'drugs' ? "text-emerald-600" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <Pill className="w-3.5 h-3.5" />
                    Drug Guidance
                    {drugSuggestions.length > 0 && (
                      <span className="ml-1 bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                        {drugSuggestions.length}
                      </span>
                    )}
                    {drugsLoading && <Activity className="w-3 h-3 text-emerald-500 animate-spin ml-1" />}
                    {activeTab === 'drugs' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t" />
                    )}
                  </button>
                )}
              </div>

              {activeTab === 'summary' && (
                <div className="space-y-4">
                  {/* Box 1: Parents */}
              <div className="bg-white border border-slate-300 rounded overflow-hidden shadow-sm">
                <div className="p-3 border-b border-slate-200">
                  <span className="text-sm font-semibold text-slate-700">Parents</span>
                </div>
                {conceptDetail.parents.length > 0 ? (
                  <div className="p-2 space-y-0.5">
                    {conceptDetail.parents.map((p, i) => (
                      <button 
                         key={i}
                         onClick={() => setSelectedConceptId(p.conceptId)}
                         className="flex items-center gap-2 p-2 w-full text-left rounded hover:bg-slate-50 transition-colors group"
                      >
                        <ChevronRight className="w-4 h-4 text-blue-600 font-bold shrink-0" />
                        <div className="w-4 h-4 rounded-full bg-[#fdf3c6] border border-[#f5e396] flex items-center justify-center shrink-0">
                          <Menu className="w-2.5 h-2.5 text-[#b49911]" />
                        </div>
                        <span className="text-sm text-slate-700 group-hover:text-amber-800">{p.term || p.conceptId}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 flex items-center gap-3">
                     <div className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1.5" />
                     <p className="text-sm text-slate-400 italic">No parents for this concept</p>
                  </div>
                )}
              </div>

              {/* Box 2: Core Concept Details (Focus) */}
              <div className="flex flex-col md:flex-row gap-4 items-start">
                  <div className="bg-[#487eb0] border border-[#3c6b97] rounded flex-1 w-full text-white p-4 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-20 pointer-events-none">
                       <Stethoscope className="w-24 h-24" />
                    </div>
                    
                    <div className="flex items-start gap-3 relative z-10">
                       <div className="w-6 h-6 rounded-full bg-[#fdf3c6] border border-[#f5e396] flex items-center justify-center shrink-0 mt-1">
                          <Menu className="w-3.5 h-3.5 text-[#b49911]" />
                       </div>
                       
                       <div className="flex-1">
                          <h2 className="text-lg font-bold text-white leading-snug mb-1">
                             {getFsn(conceptDetail.descriptions)}
                          </h2>
                          <p className="text-[12px] text-blue-100 font-mono mb-4">SCTID: {conceptDetail.conceptId}</p>

                          <div className="bg-[#3c6b97] border border-[#2e5275] rounded p-3 text-[12px] font-mono leading-relaxed max-h-48 overflow-y-auto space-y-1">
                             <div className="font-semibold text-white mb-2 pl-7">{conceptDetail.conceptId} | {getFsn(conceptDetail.descriptions)} |</div>
                             {conceptDetail.descriptions.filter(d => d.typeId !== '900000000000003001').map(d => (
                                <div key={d.id} className="flex gap-2">
                                   <span className="text-blue-200 italic font-semibold shrink-0">en</span>
                                   <span className="text-blue-50">{d.term}</span>
                                </div>
                             ))}
                          </div>
                          
                          <div className="mt-4 flex gap-3">
                             <button 
                                onClick={() => {
                                  if (onSelect) {
                                    const fsnText = getFsn(conceptDetail.descriptions);
                                    onSelect({ 
                                      conceptId: conceptDetail.conceptId, 
                                      term: fsnText.replace(/\([^)]+\)$/, '').trim(),
                                      fsn: fsnText
                                    });
                                  }
                                }}
                                className="py-2 px-4 bg-white text-blue-800 font-semibold rounded shadow-sm hover:bg-slate-100 transition-colors flex items-center gap-2 text-sm"
                             >
                                <PlusCircle className="w-4 h-4" /> Pick Condition
                             </button>
                             <button className="py-2 px-3 hover:bg-white/10 text-white rounded transition-colors text-sm flex items-center gap-2">
                                <Copy className="w-4 h-4" /> Copy ID
                             </button>
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="w-full md:w-64 bg-white border border-slate-300 rounded shadow-sm text-xs p-3 flex flex-col h-full">
                     {(!conceptDetail.attributes || conceptDetail.attributes.length === 0) ? (
                        <div className="border border-slate-200 rounded p-2 text-slate-400 bg-slate-50 flex items-center justify-center flex-1 italic mt-1">
                           No stated clinical attributes
                        </div>
                     ) : (
                        <div className="flex flex-col gap-1.5 mt-1 overflow-y-auto max-h-56">
                           {conceptDetail.attributes.map((attr, idx) => {
                             // Clean up FSN (remove semantic tags for display in the box)
                             const cleanType = attr.typeTerm ? attr.typeTerm.replace(/\([^)]+\)$/, '').trim() : 'Attribute';
                             const cleanDest = attr.destTerm ? attr.destTerm.replace(/\([^)]+\)$/, '').trim() : 'Value';
                             
                             return (
                               <div key={idx} className="border border-slate-200 rounded px-2 py-1.5 text-slate-600 bg-slate-50 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 leading-tight">
                                  <span className="font-semibold">{cleanType}</span>
                                  <span className="text-slate-400 hidden sm:inline">→</span>
                                  <span className="text-slate-400 sm:hidden">↓</span>
                                  <button 
                                    onClick={() => setSelectedConceptId(attr.destId)}
                                    className="text-left hover:text-blue-600 hover:underline transition-colors"
                                  >
                                    {cleanDest}
                                  </button>
                               </div>
                             );
                           })}
                        </div>
                     )}
                  </div>
              </div>

              {/* Box 3: Children */}
              <div className="bg-white border border-slate-300 rounded overflow-hidden shadow-sm">
                <div className="p-3 border-b border-slate-200">
                  <span className="text-sm font-semibold text-slate-700">Children ({conceptDetail.children.length})</span>
                </div>
                {conceptDetail.children.length > 0 ? (
                  <div className="p-2 space-y-0.5 max-h-[400px] overflow-y-auto">
                    {conceptDetail.children.map((c, i) => (
                      <button 
                         key={i}
                         onClick={() => setSelectedConceptId(c.conceptId)}
                         className="flex items-center gap-2 p-2 w-full text-left rounded hover:bg-slate-50 transition-colors group"
                      >
                        <ChevronRight className="w-4 h-4 text-blue-600 font-bold shrink-0" />
                        <div className="w-4 h-4 rounded-full bg-[#fdf3c6] border border-[#f5e396] flex items-center justify-center shrink-0">
                          {i % 2 === 0 ? <Menu className="w-2.5 h-2.5 text-[#b49911]" /> : <Slash className="w-2 h-2 text-slate-400 rotate-90" />}
                        </div>
                        <span className="text-sm text-slate-700 group-hover:text-emerald-800">{c.term || c.conceptId}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 flex flex-col gap-1 text-slate-400 italic">
                     <p className="text-sm flex items-center gap-2">No children</p>
                  </div>
                )}
              </div>
                </div>
              )}

              {activeTab === 'diagram' && (
                <div className="bg-[#f8fafc] border border-slate-200 rounded-xl shadow-inner p-10 overflow-auto min-h-[500px]">
                  <div className="min-w-max flex flex-col font-sans pt-8 pb-10">
                     
                     {/* Pre-process Branches */}
                     {(() => {
                        const allBranches: any[] = [
                           ...conceptDetail.parents.map(p => ({ type: 'parent', data: p })),
                           ...(conceptDetail.attributes || []).map(a => ({ type: 'attribute', data: a }))
                        ];
                        const firstBranch = allBranches[0];
                        const remainingBranches = allBranches.slice(1);
                        
                        return (
                           <>
                              {/* ROW 1 (Base Line) - Concept, Axiom, Root Junction, and First Branch */}
                              <div className="flex items-center relative z-10 w-max">
                                 
                                 {/* Concept */}
                                 <div className="bg-[#3b82f6] border border-[#2563eb] rounded-xl shadow-lg p-5 w-[260px] text-white cursor-default shrink-0">
                                    <p className="text-[11px] font-mono text-blue-200 mb-1 tracking-wider">{conceptDetail.conceptId}</p>
                                    <p className="font-semibold text-[15px] leading-snug">{getFsn(conceptDetail.descriptions)}</p>
                                 </div>
                                 
                                 {/* Connector */}
                                 <div className="w-10 h-[3px] bg-slate-400 shrink-0"></div>

                                 {/* Axiom Symbol ⊑ */}
                                 <div className="w-12 h-12 bg-white rounded-full border-[3px] border-slate-400 flex items-center justify-center font-bold text-xl text-slate-500 shadow-sm shrink-0">⊑</div>

                                 {/* Connector With Arrow Pointing to First Branch (If No Dot) */}
                                 <div className="w-10 h-[3px] bg-slate-400 shrink-0 relative">
                                    {remainingBranches.length === 0 && firstBranch?.type === 'parent' && (
                                       <div className="absolute right-0 top-1/2 -translate-y-1/2 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[10px] border-l-slate-400"></div>
                                    )}
                                 </div>

                                 {/* The Root Fork Dot (Conjunction) */}
                                 {(remainingBranches.length > 0 || (firstBranch && firstBranch.type === 'attribute')) && (
                                    <div className="relative flex items-center justify-center shrink-0 w-6 h-6 mr-1">
                                       <div className="w-5 h-5 rounded-full bg-slate-800 shadow-sm z-20 shrink-0 border-2 border-white ring-1 ring-slate-800"></div>
                                       
                                       {/* The Magic Vertical Stem */}
                                       {remainingBranches.length > 0 && (
                                          <div className="absolute top-1/2 left-1/2 w-[3px] bg-slate-400 -translate-x-1/2 z-10" ref={(el) => {
                                             if (el) {
                                                setTimeout(() => {
                                                   const rows = el.closest('.min-w-max')?.querySelectorAll('.diagram-branch-row');
                                                   if (rows && rows.length > 0) {
                                                      const lastRow = rows[rows.length - 1];
                                                      const stemRect = el.getBoundingClientRect();
                                                      const lastRect = lastRow.getBoundingClientRect();
                                                      el.style.height = `${lastRect.top - stemRect.top + (lastRect.height / 2)}px`;
                                                   }
                                                }, 50);
                                             }
                                          }}></div>
                                       )}
                                    </div>
                                 )}

                                 {/* First Branch aligned directly on the main axis */}
                                 {firstBranch && (
                                    <div className="flex items-center diagram-branch-first">
                                       {firstBranch.type === 'parent' ? (
                                          <>
                                             {(remainingBranches.length > 0 || firstBranch.type === 'attribute') && (
                                                <div className="w-8 h-[3px] bg-slate-400 relative shrink-0">
                                                   <div className="absolute right-0 top-1/2 -translate-y-1/2 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[10px] border-l-slate-400"></div>
                                                </div>
                                             )}
                                             <div className="bg-[#e9d5ff] border border-[#d8b4fe] text-purple-950 p-4 rounded-xl shadow-sm w-[350px] ml-1 transition-all cursor-pointer hover:shadow-md" onClick={() => setSelectedConceptId(firstBranch.data.conceptId)}>
                                                <p className="text-[11px] font-mono text-purple-700/80 mb-1">{firstBranch.data.conceptId}</p>
                                                <p className="font-semibold text-[14px] leading-snug">{firstBranch.data.term || firstBranch.data.conceptId}</p>
                                             </div>
                                          </>
                                       ) : (
                                          <>
                                             <div className="w-10 h-[3px] bg-slate-400 relative shrink-0"></div>
                                             <div className="w-12 h-12 bg-white rounded-full border-[3px] border-slate-400 shadow-sm shrink-0"></div>
                                             <div className="w-8 h-[3px] bg-slate-400 relative shrink-0"></div>
                                             <div className="w-5 h-5 rounded-full bg-slate-800 shadow-sm shrink-0 border-2 border-white ring-1 ring-slate-800"></div>
                                             <div className="w-8 h-[3px] bg-slate-400 relative shrink-0">
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[10px] border-l-slate-400"></div>
                                             </div>
                                             <div className="bg-[#fef08a] border border-[#fde047] text-amber-950 px-6 py-3 rounded-full shadow-sm text-center min-w-[200px] mx-1">
                                                <p className="text-[10px] font-mono text-amber-700/80 mb-0.5">{firstBranch.data.typeTerm?.match(/\d+/)?.[0] || 'Attribute'}</p>
                                                <p className="font-semibold text-[13px] whitespace-nowrap">{firstBranch.data.typeTerm?.replace(/\([^)]+\)$/, '').trim() || 'Attribute'}</p>
                                             </div>
                                             <div className="w-8 h-[3px] bg-slate-400 relative shrink-0">
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[10px] border-l-slate-400"></div>
                                             </div>
                                             <div className="bg-[#bae6fd] border border-[#7dd3fc] text-sky-950 p-4 rounded-xl shadow-sm w-[350px] ml-1 transition-all cursor-pointer hover:shadow-md" onClick={() => setSelectedConceptId(firstBranch.data.destId)}>
                                                <p className="text-[11px] font-mono text-sky-700/80 mb-1">{firstBranch.data.destId}</p>
                                                <p className="font-semibold text-[14px] leading-snug">{firstBranch.data.destTerm ? firstBranch.data.destTerm.replace(/\([^)]+\)$/, '').trim() : firstBranch.data.destId}</p>
                                             </div>
                                          </>
                                       )}
                                    </div>
                                 )}
                              </div>

                              {/* Stack of Remaining Branches directly underneath the stem! */}
                              {remainingBranches.length > 0 && (
                                 <div className="flex flex-col gap-6 relative z-0 mt-6" style={{ marginLeft: '400px' }}>
                                    {remainingBranches.map((branch, i) => (
                                       <div key={i} className="flex items-center diagram-branch-row">
                                          {branch.type === 'parent' ? (
                                             <>
                                                <div className="w-10 h-[3px] bg-slate-400 relative shrink-0">
                                                   <div className="absolute right-0 top-1/2 -translate-y-1/2 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[10px] border-l-slate-400"></div>
                                                </div>
                                                <div className="bg-[#e9d5ff] border border-[#d8b4fe] text-purple-950 p-4 rounded-xl shadow-sm w-[350px] ml-1 transition-all cursor-pointer hover:shadow-md" onClick={() => setSelectedConceptId(branch.data.conceptId)}>
                                                   <p className="text-[11px] font-mono text-purple-700/80 mb-1">{branch.data.conceptId}</p>
                                                   <p className="font-semibold text-[14px] leading-snug">{branch.data.term || branch.data.conceptId}</p>
                                                </div>
                                             </>
                                          ) : (
                                             <>
                                                <div className="w-10 h-[3px] bg-slate-400 relative shrink-0"></div>
                                                <div className="w-12 h-12 bg-white rounded-full border-[3px] border-slate-400 shadow-sm shrink-0"></div>
                                                <div className="w-8 h-[3px] bg-slate-400 relative shrink-0"></div>
                                                <div className="w-5 h-5 rounded-full bg-slate-800 shadow-sm shrink-0 border-2 border-white ring-1 ring-slate-800"></div>
                                                <div className="w-8 h-[3px] bg-slate-400 relative shrink-0">
                                                   <div className="absolute right-0 top-1/2 -translate-y-1/2 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[10px] border-l-slate-400"></div>
                                                </div>
                                                <div className="bg-[#fef08a] border border-[#fde047] text-amber-950 px-6 py-3 rounded-full shadow-sm text-center min-w-[200px] mx-1">
                                                   <p className="text-[10px] font-mono text-amber-700/80 mb-0.5">{branch.data.typeTerm?.match(/\d+/)?.[0] || 'Attribute'}</p>
                                                   <p className="font-semibold text-[13px] whitespace-nowrap">{branch.data.typeTerm?.replace(/\([^)]+\)$/, '').trim() || 'Attribute'}</p>
                                                </div>
                                                <div className="w-8 h-[3px] bg-slate-400 relative shrink-0">
                                                   <div className="absolute right-0 top-1/2 -translate-y-1/2 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[10px] border-l-slate-400"></div>
                                                </div>
                                                <div className="bg-[#bae6fd] border border-[#7dd3fc] text-sky-950 p-4 rounded-xl shadow-sm w-[350px] ml-1 transition-all cursor-pointer hover:shadow-md" onClick={() => setSelectedConceptId(branch.data.destId)}>
                                                   <p className="text-[11px] font-mono text-sky-700/80 mb-1">{branch.data.destId}</p>
                                                   <p className="font-semibold text-[14px] leading-snug">{branch.data.destTerm ? branch.data.destTerm.replace(/\([^)]+\)$/, '').trim() : branch.data.destId}</p>
                                                </div>
                                             </>
                                          )}
                                       </div>
                                    ))}
                                 </div>
                              )}
                           </>
                        );
                     })()}
                  </div>
                </div>
              )}

              {activeTab === 'expression' && (
                <div className="bg-white border border-slate-300 rounded shadow-sm p-6 overflow-hidden">
                   <h4 className="font-semibold text-slate-700 mb-4 border-b pb-2">Expressions</h4>
                   <div className="bg-slate-50 border border-slate-200 p-4 rounded font-mono text-[13px] whitespace-pre-wrap text-slate-800 shadow-inner overflow-x-auto leading-relaxed">
                      <span className="text-blue-600 font-bold">===</span> {conceptDetail.conceptId} | {getFsn(conceptDetail.descriptions)} | <span className="text-blue-600 font-bold">===</span>
                      <br/>
                      {conceptDetail.parents.length > 0 && (
                        <>
                          <br/>
                          <span className="text-emerald-600 font-bold">+</span> <span className="text-slate-400 italic">Parents (116680003 | Is a (attribute) |)</span>
                          {conceptDetail.parents.map(p => (
                             <div key={p.conceptId} className="ml-8 mt-1">
                               <span className="text-slate-400">-</span> {p.conceptId} | {p.term} |
                             </div>
                          ))}
                        </>
                      )}
                      {conceptDetail.attributes && conceptDetail.attributes.length > 0 && (
                        <>
                          <br/>
                          <span className="text-emerald-600 font-bold">+</span> <span className="text-slate-400 italic">Attributes</span>
                          {conceptDetail.attributes.map(a => (
                             <div key={a.destId + a.typeTerm} className="ml-8 mt-1">
                               {a.typeTerm} <span className="text-purple-600 font-bold text-lg leading-none">=</span> {a.destId} | {a.destTerm} |
                             </div>
                          ))}
                        </>
                      )}
                   </div>
                   <div className="mt-4 text-xs text-slate-500 italic">
                      This represents the compositional grammar equivalent of the concept's definitions.
                   </div>
                </div>
              )}

              {/* ─── Drug Guidance Tab ───────────────────────────────── */}
              {activeTab === 'drugs' && (
                <div className="space-y-3">

                  {/* Header */}
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-xl">
                    <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800">CDSS Drug Guidance — SCDF Level</p>
                      <p className="text-[10px] text-slate-500">MED-RT indications · SNOMED-coded disease–drug CIs · RxNorm SCDF forms</p>
                    </div>
                    {(drugsLoading || ciScdfLoading) && (
                      <Activity className="w-4 h-4 text-slate-400 animate-spin shrink-0" />
                    )}
                  </div>

                  {/* Loading state */}
                  {drugsLoading && ciScdfLoading && (
                    <div className="flex items-center justify-center py-10">
                      <Activity className="w-5 h-5 text-emerald-500 animate-spin mr-2" />
                      <span className="text-sm text-slate-500">Loading clinical guidance...</span>
                    </div>
                  )}

                  {/* No data */}
                  {!drugsLoading && !ciScdfLoading && drugSuggestions.length === 0 && ciScdf.length === 0 && (
                    <div className="flex flex-col items-center py-10 text-slate-400">
                      <FlaskConical className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm font-semibold text-slate-600">No drug-disease links found</p>
                      <p className="text-xs text-slate-400 mt-1 text-center max-w-xs">This condition may not have MED-RT drug links yet, or is not classified as a disorder.</p>
                    </div>
                  )}




                  {/* ── Card Row + Expanded Panel ─────────────────────── */}
                  {(drugSuggestions.length > 0 || ciScdf.length > 0 || drugsLoading || ciScdfLoading) && (
                    <div className="space-y-0">

                      {/* ── Two summary cards (always visible) ───────── */}
                      <div className="grid grid-cols-2 gap-4">

                        {/* Drug Therapy card */}
                        <button
                          onClick={() => setActiveCard('therapy')}
                          className={`relative group text-left p-4 rounded-2xl border transition-all duration-500 ease-out overflow-hidden ${
                            activeCard === 'therapy'
                              ? 'bg-white border-emerald-300 shadow-xl shadow-emerald-500/10 ring-2 ring-emerald-500/20 scale-[1.02] z-10'
                              : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-emerald-200 hover:shadow-md opacity-70 hover:opacity-100 transform-gpu'
                          }`}
                        >
                          <div className={`absolute top-0 left-0 w-full h-1.5 transition-all duration-500 bg-gradient-to-r from-emerald-400 to-teal-400 ${activeCard === 'therapy' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
                          
                          <div className="flex items-center gap-2 mb-3 mt-1">
                            <span className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shadow-sm shrink-0">Rx</span>
                            <span className="text-[13px] font-black text-emerald-950 uppercase tracking-widest">Drug Therapy</span>
                            {drugsLoading && <Activity className="w-3 h-3 text-emerald-400 animate-spin ml-auto" />}
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between bg-emerald-50/50 px-2 py-1.5 rounded-lg border border-emerald-100/50">
                              <span className="text-[11px] font-medium text-emerald-800 flex items-center gap-1.5">💊 May Treat</span>
                              <span className="text-[12px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 shadow-sm border border-emerald-200/50">
                                {drugsLoading ? '...' : (scdfCounts['may_treat'] ?? 0)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between bg-sky-50/50 px-2 py-1.5 rounded-lg border border-sky-100/50">
                              <span className="text-[11px] font-medium text-sky-800 flex items-center gap-1.5">🛡️ May Prevent</span>
                              <span className="text-[12px] font-black px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 shadow-sm border border-sky-200/50">
                                {drugsLoading ? '...' : (scdfCounts['may_prevent'] ?? 0)}
                              </span>
                            </div>
                            <p className="text-[9px] text-emerald-600/60 mt-0.5 ml-1 font-medium">SCDF forms · MED-RT indications</p>
                          </div>
                        </button>

                        {/* Contraindications card */}
                        <button
                          onClick={() => setActiveCard('ci')}
                          className={`relative group text-left p-4 rounded-2xl border transition-all duration-500 ease-out overflow-hidden ${
                            activeCard === 'ci'
                              ? 'bg-white border-red-300 shadow-xl shadow-red-500/10 ring-2 ring-red-500/20 scale-[1.02] z-10'
                              : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-red-200 hover:shadow-md opacity-70 hover:opacity-100 transform-gpu'
                          }`}
                        >
                          <div className={`absolute top-0 left-0 w-full h-1.5 transition-all duration-500 bg-gradient-to-r from-red-400 to-rose-400 ${activeCard === 'ci' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
                          
                          <div className="flex items-center gap-2 mb-3 mt-1">
                            <span className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shadow-sm shrink-0">CI</span>
                            <span className="text-[13px] font-black text-red-950 uppercase tracking-widest">Contraindications</span>
                            {ciScdfLoading && <Activity className="w-3 h-3 text-red-400 animate-spin ml-auto" />}
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between bg-red-50/50 px-2 py-1.5 rounded-lg border border-red-100/50">
                              <span className="text-[11px] font-medium text-red-800 flex items-center gap-1.5">⚠️ SCDF forms</span>
                              <span className="text-[12px] font-black px-2 py-0.5 rounded-md bg-red-100 text-red-700 shadow-sm border border-red-200/50">
                                {ciScdfLoading ? '...' : ciScdfCount}
                              </span>
                            </div>
                            <div className="flex items-center justify-between bg-rose-50/50 px-2 py-1.5 rounded-lg border border-rose-100/50">
                              <span className="text-[11px] font-medium text-rose-800 flex items-center gap-1.5">🧪 Ingredients (IN)</span>
                              <span className="text-[12px] font-black px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 shadow-sm border border-rose-200/50">
                                {ciScdfLoading ? '...' : ciInCount}
                              </span>
                            </div>
                            <p className="text-[9px] text-red-600/60 mt-0.5 ml-1 font-medium">MED-RT coded · SNOMED hierarchy</p>
                          </div>
                        </button>
                      </div>

                      {/* ── Expanded panel ──────────────────────────── */}
                      <div className="relative mt-2">
                        {/* Animated Pointer Arrow */}
                        <div 
                          className={`absolute -top-2 w-4 h-4 bg-white border-t border-l rotate-45 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-20 ${
                            activeCard === 'therapy' 
                              ? 'left-[25%] -translate-x-1/2 border-emerald-200' 
                              : 'left-[75%] -translate-x-1/2 border-red-200'
                          }`}
                        />

                        {/* Main Panel Wrapper */}
                        <div className={`relative bg-white rounded-3xl border transition-all duration-500 overflow-hidden shadow-2xl z-10 pb-2 ${
                          activeCard === 'therapy' ? 'border-emerald-200 shadow-emerald-900/10' : 'border-red-200 shadow-red-900/10'
                        }`}>
                          {/* Inner Ambient Top Glow */}
                          <div className={`absolute top-0 left-0 w-full h-40 opacity-15 pointer-events-none transition-colors duration-500 ${
                            activeCard === 'therapy' ? 'bg-gradient-to-b from-emerald-400 to-transparent' : 'bg-gradient-to-b from-red-400 to-transparent'
                          }`} />


                        {/* ─ DRUG THERAPY panel */}
                        {activeCard === 'therapy' && (
                          <div className="p-3 space-y-2">
                            {/* Filter bar */}
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                              <input
                                type="text" placeholder="Filter drugs..."
                                value={drugSearchQuery}
                                onChange={e => setDrugSearchQuery(e.target.value)}
                                className="w-full pl-7 pr-7 py-2 text-xs border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-emerald-50/30 placeholder-emerald-600/40"
                              />
                              {drugSearchQuery && (
                                <button onClick={() => setDrugSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            {/* Unified Wide View for Drug Therapy */}
                            <div className="border border-emerald-200 rounded-xl overflow-hidden bg-white shadow-[0_10px_40px_rgb(16,185,129,0.06)]">
                              <div className="flex items-center justify-between px-4 py-2 border-b border-emerald-100 bg-emerald-50/50">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-black text-emerald-900 uppercase tracking-widest">Therapy Options</span>
                                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 uppercase">SCDF FORMS</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] text-emerald-600 font-semibold gap-2 flex">
                                    <span>{scdfCounts['may_treat'] ?? 0} Treat</span>
                                    <span className="opacity-40">•</span>
                                    <span>{scdfCounts['may_prevent'] ?? 0} Prevent</span>
                                  </span>
                                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">
                                    {drugsLoading ? '...' : ((scdfCounts['may_treat'] ?? 0) + (scdfCounts['may_prevent'] ?? 0))}
                                  </span>
                                </div>
                              </div>

                              <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                                {drugSuggestions.length === 0 && !drugsLoading && (
                                  <div className="px-4 py-8 text-center text-[11px] text-slate-500 italic bg-white">
                                    No therapy drugs found.
                                  </div>
                                )}

                                {(() => {
                                  const q = drugSearchQuery.toLowerCase();
                                  const filtered = drugSuggestions.filter((d: any) => {
                                    const label = d.rel === 'may_prevent' ? 'may prevent' : 'may treat';
                                    return !q ||
                                           (d.name || '').toLowerCase().includes(q) ||
                                           (d.parent_ingredient || '').toLowerCase().includes(q) ||
                                           label.includes(q);
                                  });

                                  // Group essentially by sorting: May Treat first, then May Prevent
                                  const sorted = filtered.sort((a: any, b: any) => {
                                      if (a.rel === b.rel) return (a.name || '').localeCompare(b.name || '');
                                      return a.rel === 'may_treat' ? -1 : 1;
                                  });

                                  return (
                                    <>
                                      {sorted.map((d: any, i: number) => {
                                        const isPrevent = d.rel === 'may_prevent';
                                        return (
                                          <div key={`therapy-${d.rxcui}-${i}`} className="flex items-center justify-between px-4 py-2 hover:bg-emerald-50/40 transition-colors bg-white group">
                                            <div className="flex flex-col min-w-0 flex-1 pr-4">
                                              <p className="text-[12px] font-bold text-slate-800 truncate">{d.name}</p>
                                              <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                                                <span className="font-mono bg-slate-50 px-1 py-0.5 rounded border border-slate-100 text-slate-500">RXCUI: {d.rxcui}</span>
                                                {d.parent_ingredient && <span className="text-emerald-600/70 italic">← ingredient: {d.parent_ingredient}</span>}
                                              </p>
                                            </div>
                                            <div className="shrink-0 flex items-center">
                                              {isPrevent ? (
                                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-sky-50 border border-sky-200/60 shadow-sm text-sky-700 min-w-[100px] justify-center">
                                                  <span className="text-[10px] leading-none mb-[2px]">🛡️</span>
                                                  <span className="text-[9px] font-black uppercase tracking-widest">May Prevent</span>
                                                </div>
                                              ) : (
                                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200/60 shadow-sm text-emerald-700 min-w-[100px] justify-center">
                                                  <span className="text-[10px] leading-none mb-[2px]">💊</span>
                                                  <span className="text-[9px] font-black uppercase tracking-widest">May Treat</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                      
                                      {!q && ((scdfCounts['may_treat'] ?? 0) + (scdfCounts['may_prevent'] ?? 0) > sorted.length) && (
                                        <div className="px-4 py-3 text-[10px] text-emerald-600/70 italic text-center bg-emerald-50/40 border-t border-emerald-100/50">
                                          Showing first <strong>{sorted.length}</strong> of <strong>{(scdfCounts['may_treat'] ?? 0) + (scdfCounts['may_prevent'] ?? 0)}</strong> available SCDF forms.
                                        </div>
                                      )}
                                      
                                      {q && sorted.length === 0 && (
                                        <div className="px-4 py-8 text-[11px] text-slate-500 italic text-center bg-white">
                                          No matching therapies found for "{drugSearchQuery}".
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>

                            <p className="text-[9px] text-slate-400 italic text-center">
                              Source: UMLS 2025AB MED-RT · IN→SCDF expansion · Clinical reference only
                            </p>
                          </div>
                        )}

                        {/* ─ CONTRAINDICATIONS panel */}
                        {activeCard === 'ci' && (
                          <div className="p-3 space-y-2">
                            {/* Filter bar */}
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                              <input
                                type="text" placeholder="Filter contraindicated drugs..."
                                value={drugSearchQuery}
                                onChange={e => setDrugSearchQuery(e.target.value)}
                                className="w-full pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 bg-slate-50 placeholder-slate-400"
                              />
                              {drugSearchQuery && (
                                <button onClick={() => setDrugSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            {/* CI full-width table */}
                            <div className="border border-red-200 rounded-xl overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 bg-red-50">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-red-800 uppercase">Contraindicated Drugs</span>
                                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-500 uppercase">MED-RT</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {ciScdfLoading && <Activity className="w-3 h-3 text-red-400 animate-spin" />}
                                  <span className="text-[9px] text-red-500">
                                    {ciScdfCount > 0 ? `${ciScdfCount} SCDF forms · ${ciInCount} ingredients` : ''}
                                  </span>
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-800">
                                    {ciScdfLoading ? '...' : ciScdfCount}
                                  </span>
                                </div>
                              </div>

                              <div className="divide-y divide-slate-100 bg-white max-h-[420px] overflow-y-auto">
                                {ciScdf.length === 0 && !ciScdfLoading && (
                                  <div className="px-3 py-6 text-center">
                                    <p className="text-[11px] font-semibold text-slate-500">No coded CIs found</p>
                                    <p className="text-[10px] text-slate-400 mt-1 italic">Try a parent concept (e.g. "Renal insufficiency" instead of specific CKD stage)</p>
                                  </div>
                                )}

                                {ciScdf.length > 0 && (() => {
                                  const q = drugSearchQuery.toLowerCase();
                                  const filtered = ciScdf.filter((ci: any) =>
                                    !q ||
                                    (ci.scdf_name||'').toLowerCase().includes(q) ||
                                    (ci.in_name||'').toLowerCase().includes(q)
                                  );
                                  const byIn = new Map<string, any[]>();
                                  for (const ci of filtered) {
                                    const key = ci.in_name || ci.in_rxcui;
                                    if (!byIn.has(key)) byIn.set(key, []);
                                    byIn.get(key)!.push(ci);
                                  }
                                  return (
                                    <>
                                      {[...byIn.entries()].map(([inName, forms]) => (
                                        <details key={inName} open={byIn.size <= 8}>
                                          <summary className="flex items-center justify-between px-4 py-2 hover:bg-red-50/60 cursor-pointer list-none bg-red-50/20">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700 shrink-0">CI-IN</span>
                                              <span className="text-[12px] font-bold text-red-900 truncate">{inName}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                                                forms[0]?.severity === 'absolute' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                              }`}>{forms[0]?.severity}</span>
                                              <span className="text-[9px] text-slate-500 font-mono">{forms.length} forms</span>
                                              <ChevronDown className="w-3 h-3 text-red-300" />
                                            </div>
                                          </summary>
                                          <div className="grid grid-cols-2 gap-px bg-red-50/30">
                                            {forms.map((ci: any, i: number) => (
                                              <div key={`ci-${ci.scdf_rxcui}-${i}`} className="px-4 py-1.5 hover:bg-red-50/60 transition-colors bg-white">
                                                <p className="text-[11px] text-slate-700 truncate">{ci.scdf_name}</p>
                                                <p className="text-[9px] text-slate-400 font-mono">RXCUI: {ci.scdf_rxcui}</p>
                                              </div>
                                            ))}
                                          </div>
                                        </details>
                                      ))}
                                    </>
                                  );
                                })()}

                                {ciScdf.length > 0 && (
                                  <div className="px-3 py-2 text-[9px] text-slate-400 italic text-center bg-slate-50">
                                    Source: UMLS 2025AB MED-RT contraindicated_with_disease · SNOMED hierarchy walk · Clinical reference only
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          )}
                        </div>{/* end main panel wrapper */}
                      </div>{/* end expanded panel */}
                    </div>
                  )}

                </div>
              )}

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 max-w-sm mx-auto p-6 text-center">
              <div className="w-20 h-20 bg-white shadow-sm border border-slate-200 rounded-full flex items-center justify-center mb-6">
                <Search className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Explore Terminology</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Click on any condition to automatically focus it and navigate its hierarchy backwards to the parent or forward into sub-conditions.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
