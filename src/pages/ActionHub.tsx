/**
 * ActionHub — CLINIcare Pro Action Routing Portal
 * 3-step context wizard: Site → Module → Action Category → Find contacts
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe, Network, Building2, LayoutGrid, ChevronRight,
  Zap, Search, ArrowRight, Users, CheckCircle, Circle, Settings, Home, MessageSquare,
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getAuthSession, fetchWithAuth } from '../lib/authSession';
import { getCorporateTree, CorporateNode } from '../lib/corporateStorage';
import { getModules, ModuleNode } from '../lib/moduleStorage';
import { getActiveSite } from '../lib/siteContext';

interface ActionCategory {
  id: string; name: string; description: string;
  icon_name: string; color: string;
}

const STEPS = ['Enterprise Context', 'Module', 'Action Category'];

const scopeConfig: Record<string, { icon: any; cls: string }> = {
  Global:     { icon: Globe,     cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  Enterprise: { icon: Network,   cls: 'bg-violet-50 border-violet-200 text-violet-700' },
  Site:       { icon: Building2, cls: 'bg-blue-50 border-blue-200 text-blue-700' },
};

export function ActionHub() {
  const navigate = useNavigate();
  const session = getAuthSession();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 1 — enterprise
  const [corporateNodes, setCorporateNodes] = useState<CorporateNode[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [selectedSiteTitle, setSelectedSiteTitle] = useState<string>('');
  const [siteSearch, setSiteSearch] = useState('');

  // Step 2 — module
  const [modules, setModules] = useState<ModuleNode[]>([]);
  const [selectedModule, setSelectedModule] = useState<ModuleNode | null>(null);
  const [moduleSearch, setModuleSearch] = useState('');

  // Step 3 — action category
  const [categories, setCategories] = useState<ActionCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [categorySearch, setCategorySearch] = useState('');

  // Collect all facilities recursively
  const flattenFacilities = (nodes: CorporateNode[]): CorporateNode[] => {
    const out: CorporateNode[] = [];
    for (const n of nodes) {
      if (n.facilityCode || n.type === 'Facility') out.push(n);
      if (n.children) out.push(...flattenFacilities(n.children));
    }
    return out;
  };

  useEffect(() => {
    (async () => {
      const tree = await getCorporateTree();
      setCorporateNodes(flattenFacilities(tree));
      const mods = await getModules();
      setModules(mods);
      const cats = await fetchWithAuth('/api/arh/action-categories').then(r => r.json());
      setCategories(cats || []);

      // Pre-fill active site
      const active = getActiveSite();
      if (active) {
        setSelectedSiteId(active.facilityId);
        setSelectedSiteTitle(active.facilityTitle);
      }
    })();
  }, []);

  const handleRoute = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const body = {
        requesterUserId: session.userId,
        siteId: selectedSiteId || undefined,
        moduleId: selectedModule?.id || undefined,
        actionCategoryId: selectedCategoryId || undefined,
      };
      const res = await fetchWithAuth('/api/arh/route', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const results = await res.json();
      navigate('/action-hub/results', { state: { results, context: { body, selectedModule, selectedSiteTitle, category: categories.find(c => c.id === selectedCategoryId) } } });
    } finally { setLoading(false); }
  };

  const filteredModules = modules.filter(m =>
    m.title.toLowerCase().includes(moduleSearch.toLowerCase())
  );
  const filteredSites = corporateNodes.filter(n =>
    n.title.toLowerCase().includes(siteSearch.toLowerCase()) ||
    (n.facilityCode || '').toLowerCase().includes(siteSearch.toLowerCase())
  );
  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
    c.description.toLowerCase().includes(categorySearch.toLowerCase())
  );

  // Clear search when changing step
  const goStep = (n: number) => {
    setSiteSearch(''); setModuleSearch(''); setCategorySearch('');
    setStep(n);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 flex flex-col">

      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center gap-4 shadow-sm sticky top-0 z-50">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2960DC] to-[#1a3fa0] flex items-center justify-center shadow-lg shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">Action Routing Hub</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Find the right person for any task, instantly</p>
        </div>
        <button onClick={() => navigate('/')} className="ml-auto text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors flex items-center gap-1">
          ← Back to Portal
        </button>
        <button onClick={() => navigate('/action-hub/conversations')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-[#2960DC] hover:text-[#2960DC] dark:hover:text-[#4F84F6] transition-all text-xs font-semibold">
          <MessageSquare className="w-3.5 h-3.5" /> Inbox
        </button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">

        {/* Step indicators */}
        <div className="flex items-center gap-0 mb-10">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-0 flex-1">
              <button
                onClick={() => i < step && setStep(i)}
                className={cn(
                  'flex items-center gap-2.5 text-sm font-semibold transition-all',
                  i < step ? 'text-emerald-600 cursor-pointer' : i === step ? 'text-[#2960DC]' : 'text-slate-400 cursor-default'
                )}
              >
                <span className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border-2 transition-all',
                  i < step ? 'bg-emerald-500 border-emerald-500 text-white' :
                  i === step ? 'bg-[#2960DC] border-[#2960DC] text-white shadow-md shadow-blue-300' :
                  'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                )}>
                  {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </span>
                <span className="hidden sm:block">{s}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn('flex-1 h-0.5 mx-3', i < step ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700')} />
              )}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Enterprise Context ─────────────────────────────── */}
        {step === 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="mb-5">
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Select Enterprise Context</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-1">Which site or facility does this relate to?</p>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="Search sites or facility code..."
                value={siteSearch} onChange={e => setSiteSearch(e.target.value)} autoFocus
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#2960DC]"
              />
              {siteSearch && (
                <button onClick={() => setSiteSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  ×
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {/* All Enterprise option — only show when no search or matched */}
              {('all enterprise global'.includes(siteSearch.toLowerCase()) || !siteSearch) && (
                <button
                  onClick={() => { setSelectedSiteId(''); setSelectedSiteTitle('All Enterprise (Global)'); }}
                  className={cn(
                    'text-left p-5 rounded-2xl border-2 transition-all',
                    !selectedSiteId
                      ? 'border-[#2960DC] bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Globe className="w-5 h-5 text-[#2960DC]" />
                    <span className="font-bold text-slate-800 dark:text-slate-100">All Enterprise</span>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">Global</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Search across all sites and users in the enterprise</p>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredSites.length === 0 && siteSearch ? (
                <div className="col-span-2 text-center py-8 text-slate-400">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No sites match "{siteSearch}"</p>
                </div>
              ) : (
                filteredSites.map(node => (
                  <button
                    key={node.id}
                    onClick={() => { setSelectedSiteId(node.id); setSelectedSiteTitle(node.title); }}
                    className={cn(
                      'text-left p-5 rounded-2xl border-2 transition-all',
                      selectedSiteId === node.id
                        ? 'border-[#2960DC] bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                    )}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <Building2 className="w-4 h-4 text-slate-500" />
                      <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{node.title}</span>
                      {selectedSiteId === node.id && <CheckCircle className="w-4 h-4 text-[#2960DC] ml-auto shrink-0" />}
                    </div>
                    {node.facilityCode && <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 ml-7">{node.facilityCode}</p>}
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end mt-8">
              <button onClick={() => goStep(1)}
                className="px-6 py-3 bg-[#2960DC] text-white font-bold rounded-xl hover:bg-[#1a4bb3] transition-all shadow-lg shadow-blue-200 dark:shadow-none flex items-center gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Module ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="mb-5">
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Select Module</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-1">What system area does your request relate to?</p>
            </div>
            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search modules..." value={moduleSearch} autoFocus
                onChange={e => setModuleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#2960DC]"
              />
              {moduleSearch && <button onClick={() => setModuleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">×</button>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
              <button
                onClick={() => setSelectedModule(null)}
                className={cn(
                  'text-left p-4 rounded-2xl border-2 transition-all flex flex-col gap-2',
                  !selectedModule ? 'border-[#2960DC] bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                )}
              >
                <LayoutGrid className="w-6 h-6 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Any Module</span>
              </button>
              {filteredModules.map(mod => {
                // @ts-ignore
                const Ico = Icons[mod.iconName] || Icons.Box;
                const sel = selectedModule?.id === mod.id;
                return (
                  <button key={mod.id} onClick={() => setSelectedModule(mod)}
                    className={cn(
                      'text-left p-4 rounded-2xl border-2 transition-all flex flex-col gap-2',
                      sel ? 'border-[#2960DC] bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                    )}
                  >
                    <Ico className={cn('w-6 h-6', sel ? 'text-[#2960DC]' : 'text-slate-400')} />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 leading-snug line-clamp-2">{mod.title}</span>
                    {mod.submodules?.length > 0 && (
                      <span className="text-[10px] text-slate-400">{mod.submodules.length} sub-modules</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between mt-8">
              <button onClick={() => goStep(0)} className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                ← Back
              </button>
              <button onClick={() => goStep(2)}
                className="px-6 py-3 bg-[#2960DC] text-white font-bold rounded-xl hover:bg-[#1a4bb3] transition-all shadow-lg shadow-blue-200 dark:shadow-none flex items-center gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Action Category ────────────────────────────────── */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="mb-5">
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">What do you need?</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-1">Select the action type to refine the matching</p>
            </div>

            {/* Category search */}
            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="Search action types..." autoFocus
                value={categorySearch} onChange={e => setCategorySearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#2960DC]"
              />
              {categorySearch && <button onClick={() => setCategorySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">×</button>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 max-h-[360px] overflow-y-auto pr-1">
              {filteredCategories.length === 0 ? (
                <div className="col-span-2 text-center py-8 text-slate-400">
                  <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No categories match "{categorySearch}"</p>
                </div>
              ) : filteredCategories.map(cat => {
                // @ts-ignore
                const CatIco = Icons[cat.icon_name] || Icons.MessageSquare;
                const sel = selectedCategoryId === cat.id;
                return (
                  <button key={cat.id} onClick={() => setSelectedCategoryId(sel ? '' : cat.id)}
                    className={cn(
                      'text-left p-5 rounded-2xl border-2 transition-all flex items-start gap-4',
                      sel ? 'border-[#2960DC] bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: cat.color + '20' }}>
                      <CatIco className="w-5 h-5" style={{ color: cat.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{cat.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{cat.description}</p>
                    </div>
                    {sel && <CheckCircle className="w-5 h-5 text-[#2960DC] shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>

            {/* Summary card */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Routing Context Summary</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-slate-500 dark:text-slate-400 shrink-0">Site</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 ml-auto">{selectedSiteTitle || 'All Enterprise'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <LayoutGrid className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-slate-500 dark:text-slate-400 shrink-0">Module</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 ml-auto">{selectedModule?.title || 'Any Module'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Zap className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-slate-500 dark:text-slate-400 shrink-0">Action</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 ml-auto">{categories.find(c => c.id === selectedCategoryId)?.name || 'Not specified'}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => goStep(1)} className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                ← Back
              </button>
              <button onClick={handleRoute} disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-[#2960DC] to-[#1a3fa0] text-white font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-blue-200 dark:shadow-none flex items-center gap-2 disabled:opacity-60 text-base">
                {loading ? 'Searching…' : <>Find the Right Person <Users className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
