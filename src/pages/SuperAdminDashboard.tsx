import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building, Globe, Shield, Database, Radio, Key,
  ActivitySquare, LayoutGrid, Users, Link, Server, Cpu,
  Search, Bell, Moon, Sun, LayoutDashboard, Play, Zap, Pill, Stethoscope
} from "lucide-react";
import * as Icons from "lucide-react";
import { getModules, ModuleNode } from "../lib/moduleStorage";
import { getAuthSession } from "../lib/authSession";
import { UserAvatarMenu } from "../components/UserAvatarMenu";

const getIconForModule = (module: string) => {
  const iconMap: Record<string, any> = {
    'Tenant/Hospital Management': Building,
    'Global System Config': Globe,
    'License & Billing': Key,
    'Database Maintenance': Database,
    'API & Webhooks': Link,
    'System Health Dashboard': ActivitySquare,
    'System Module Management': LayoutGrid,
    'Super User Roles': Users,
    'Security Auditing': Shield,
    'Server Diagnostics': Server,
    'Resource Allocation': Cpu,
    'Live Broadcasting': Radio
  };
  return iconMap[module] || Building;
};

export function SuperAdminDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [superModules, setSuperModules] = useState<ModuleNode[]>([]);

  const session = getAuthSession();

  useEffect(() => {
    if (localStorage.getItem('darkMode') === 'true') {
      document.documentElement.classList.add('dark');
      setDarkMode(true);
    }
    const load = async () => {
      const allModules = await getModules();
      const superAdminNode = allModules.find(m => m.id === 'm_super');
      if (superAdminNode && superAdminNode.submodules) {
        setSuperModules(superAdminNode.submodules);
      }
    };
    load().catch(console.error);
  }, []);

  const toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', String(isDark));
    setDarkMode(isDark);
  };

  const filteredModules = superModules.filter(module => 
    module.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const navigate = useNavigate();

  const handleModuleClick = (mod: ModuleNode) => {
    if (!mod.active) return;
    // Parent module with sub-nodes → dedicated landing page
    if (mod.submodules && mod.submodules.length > 0) {
      navigate(`/module/${mod.id}`);
      return;
    }
    // Core module with a real route → navigate directly
    if (mod.route && mod.route !== '#') {
      navigate(mod.route);
      return;
    }
    // Generic workspace fallback
    navigate(`/module-page/${mod.id}`);
  };

  return (
    <div className="flex h-screen antialiased bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors">
      {/* Sidebar - Purple hue for Super Admin */}
      <aside className="w-72 p-6 flex flex-col justify-between shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.05)] transition-colors">
        <div>
          <div className="flex items-center mb-10 pl-2">
            <img src="/logos/Logo Horizontal.png" className="h-10 object-contain hidden dark:block brightness-0 invert" alt="CLINICare Logo" />
            <img src="/logos/Logo Horizontal.png" className="h-10 object-contain dark:hidden" alt="CLINICare Logo" />
          </div>
          <nav className="space-y-2">
            <a href="/" className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-[#2960DC] dark:hover:text-[#38bdf8] rounded-lg transition-colors duration-200">
              <LayoutDashboard className="w-5 h-5 transition-transform duration-200 hover:scale-110 group-hover:scale-110" /> 
              <span className="font-medium">Master Portal</span>
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/30 text-[#2960DC] dark:text-[#38bdf8] font-semibold rounded-lg transition-colors">
              <Shield className="w-5 h-5 transition-transform duration-200 hover:scale-110" /> 
              <span>Super Admin Panel</span>
            </a>
          </nav>
        </div>
        <div className="text-center pt-4 border-t border-slate-200 dark:border-slate-700 mt-auto">
          <p className="text-xs font-semibold text-[#2960DC] dark:text-[#38bdf8] mb-2">SYSTEM ROOT</p>
          <p className="text-[10px] text-slate-400 mt-4">CLINICare Pro Global © 2026</p>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header matching MTM Design DNA */}
        <header className="bg-[#2960DC] border-b border-white/10 p-5 flex justify-between items-center shrink-0 shadow-xl transition-colors">
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-white/80" />
            Global Administration
          </h1>
          
          <div className="flex items-center space-x-6">
            <div className="relative">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search global settings..." 
                className="w-80 px-4 py-2.5 pl-10 rounded-lg bg-white/10 border border-transparent focus:bg-white focus:text-[#2960DC] focus:border-white focus:ring-2 focus:ring-white/20 text-sm outline-none transition-all placeholder-white/50 text-white"
              />
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50" />
            </div>

            <div className="relative">
              <button onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} className="relative text-white/70 hover:text-white hover:bg-white/10 rounded-full p-2 transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full"></span>
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">System Alerts</h3>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    <a href="#" className="flex items-start p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <Play className="w-5 h-5 text-[#2960DC] dark:text-[#38bdf8] shrink-0 mt-0.5" />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-200">Global Database Sync</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Sync completed across 12 tenants.</p>
                        <p className="text-xs text-slate-400 mt-1">Just now</p>
                      </div>
                    </a>
                  </div>
                  <a href="#" className="block bg-slate-50 dark:bg-slate-900/50 text-center text-sm font-medium text-[#2960DC] dark:text-[#38bdf8] py-2 rounded-b-lg hover:underline">View all logs</a>
                </div>
              )}
            </div>

            <button onClick={toggleDarkMode} className="p-2 text-white/70 hover:bg-white/10 hover:text-white rounded-full transition-colors">
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {session && <UserAvatarMenu session={session} dark />}
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Multi-Tenant Management</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">DANGER ZONE: Changes here affect all clinical systems and hospitals.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative z-10 p-6">

            {/* ── ARH Configuration — pinned system portal card ── */}
            <button
              onClick={() => navigate('/action-hub/admin')}
              className="bg-gradient-to-br from-[#1a3fa0] to-[#2960DC] p-8 rounded-xl border border-blue-400/30 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex flex-col items-center justify-center gap-4 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Zap className="w-7 h-7 text-yellow-300" />
              </div>
              <div className="text-center">
                <span className="font-bold text-sm text-white block">ARH Configuration</span>
                <span className="text-[10px] uppercase font-bold text-blue-200 mt-1 block tracking-wider">Action Routing Hub</span>
              </div>
            </button>

            {/* ── SNOMED CT Browser — terminology portal card ── */}
            <button
              onClick={() => navigate('/snomed')}
              className="bg-gradient-to-br from-[#1a4a6b] to-[#2176ae] p-8 rounded-xl border border-blue-300/30 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex flex-col items-center justify-center gap-4 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Stethoscope className="w-7 h-7 text-cyan-200" />
              </div>
              <div className="text-center">
                <span className="font-bold text-sm text-white block">SNOMED CT Browser</span>
                <span className="text-[10px] uppercase font-bold text-blue-200 mt-1 block tracking-wider">Clinical Terminology</span>
              </div>
            </button>

            {/* ── RxNorm Browser — drug database portal card ── */}
            <button
              onClick={() => navigate('/rxnorm')}
              className="bg-gradient-to-br from-emerald-700 to-teal-700 p-8 rounded-xl border border-emerald-400/30 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex flex-col items-center justify-center gap-4 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Pill className="w-7 h-7 text-emerald-200" />
              </div>
              <div className="text-center">
                <span className="font-bold text-sm text-white block">RxNorm Browser</span>
                <span className="text-[10px] uppercase font-bold text-emerald-200 mt-1 block tracking-wider">Drug Terminology (NLM)</span>
              </div>
            </button>

            {filteredModules.map((module) => {
              // @ts-ignore dynamic mapping
              const Icon = Icons[module.iconName] || Icons.Box;
              return (
                <button
                  key={module.id}
                  onClick={() => handleModuleClick(module)}
                  className={`bg-white dark:bg-slate-800 p-8 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2960DC] hover:shadow-xl transition-all duration-300 flex flex-col items-center justify-center gap-4 group ${!module.active ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!module.active}
                >
                  <Icon className="w-10 h-10 text-[#2960DC] dark:text-[#38bdf8] group-hover:scale-110 transition-transform duration-300" />
                  <span className="font-semibold text-sm text-slate-700 dark:text-slate-300 text-center">{module.title}</span>
                  {module.submodules && module.submodules.length > 0 && (
                    <span className="text-[10px] uppercase font-bold text-slate-400">{module.submodules.length} sub-modules</span>
                  )}
                  {!module.active && <span className="text-[10px] uppercase font-bold text-slate-400">Disabled</span>}
                </button>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
