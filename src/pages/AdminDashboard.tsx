import { useState, useEffect } from "react";
import {
  Eye, FileText, Headphones, Pill, CalendarClock, Ban,
  Settings2, FolderKey, Users, ShieldCheck, Wrench, BarChart3,
  Search, Bell, Moon, Sun, LayoutDashboard, Settings
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getAuthSession } from "../lib/authSession";
import { UserAvatarMenu } from "../components/UserAvatarMenu";

const getIconForModule = (module: string) => {
  const iconMap: Record<string, any> = {
    'Define Pharmacist View': Eye,
    'System Logs': FileText,
    'Monitor Support Tickets': Headphones,
    'Define MTM Medications': Pill,
    'Pharmacist Shift Schedule': CalendarClock,
    'Restricted Medications': Ban,
    'ATC Code Management': Settings2,
    'Medical File Access': FolderKey,
    'User Account Management': Users,
    'Role & Permissions': ShieldCheck,
    'System Settings': Wrench,
    'Reporting & Analytics': BarChart3
  };
  return iconMap[module] || Settings;
};

export function AdminDashboard() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const session = getAuthSession();

  useEffect(() => {
    if (localStorage.getItem('darkMode') === 'true') {
      document.documentElement.classList.add('dark');
      setDarkMode(true);
    }
  }, []);

  const toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', String(isDark));
    setDarkMode(isDark);
  };

  const modules = [
    'Define Pharmacist View',
    'System Logs',
    'Monitor Support Tickets',
    'Define MTM Medications',
    'Pharmacist Shift Schedule',
    'Restricted Medications',
    'ATC Code Management',
    'Medical File Access',
    'User Account Management',
    'Role & Permissions',
    'System Settings',
    'Reporting & Analytics'
  ];

  const filteredModules = modules.filter(module => 
    module.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen antialiased bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors">
      {/* Sidebar */}
      <aside className="w-72 p-6 flex flex-col justify-between shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.05)] transition-colors">
        <div>
          <div className="flex items-center mb-10 pl-2">
            <img src="/logos/Logo Horizontal.png" className="h-10 object-contain hidden dark:block brightness-0 invert" alt="CLINICare Logo" />
            <img src="/logos/Logo Horizontal.png" className="h-10 object-contain dark:hidden" alt="CLINICare Logo" />
          </div>
          <nav className="space-y-2">
            <a href="/" className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-[#E6F4FB] dark:hover:bg-slate-700 hover:text-[#2960DC] dark:hover:text-[#38bdf8] rounded-lg transition-colors duration-200">
              <LayoutDashboard className="w-5 h-5 transition-transform duration-200 hover:scale-110 group-hover:scale-110" /> 
              <span className="font-medium">User Dashboard</span>
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 bg-[#E6F4FB] dark:bg-blue-900/40 text-[#2960DC] dark:text-[#38bdf8] font-semibold rounded-lg transition-colors">
              <Settings className="w-5 h-5 transition-transform duration-200 hover:scale-110" /> 
              <span>Admin Settings</span>
            </a>
          </nav>
        </div>
        <div className="text-center pt-4 border-t border-slate-200 dark:border-slate-700 mt-auto">
          <p className="text-xs text-slate-500 mb-2">Powered by</p>
          <div className="flex justify-center flex-col gap-2 items-center text-xs opacity-70">
             [HOSPITAL INTEGRATION PLACEHOLDER]
          </div>
          <p className="text-[10px] text-slate-400 mt-4">CLINICare Pro © 2026</p>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-5 flex justify-between items-center shrink-0 shadow-sm transition-colors">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Admin Interface</h1>
          
          <div className="flex items-center space-x-6">
            <div className="relative">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search system modules..." 
                className="w-80 px-4 py-2.5 pl-10 rounded-lg bg-slate-50 dark:bg-slate-900 border border-transparent focus:bg-white dark:focus:bg-slate-800 focus:border-[#2960DC] focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 text-sm outline-none transition-all dark:text-white"
              />
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            </div>

            <div className="relative">
              <button onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} className="relative text-slate-500 hover:text-[#2960DC] transition-colors">
                <Bell className="w-6 h-6" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 border-2 border-white dark:border-slate-800 rounded-full"></span>
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h3>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    <a href="#" className="flex items-start p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <Settings className="w-5 h-5 text-[#2960DC] dark:text-[#38bdf8] shrink-0 mt-0.5" />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-200">Admin Notification</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">New system update available.</p>
                        <p className="text-xs text-slate-400 mt-1">2 hours ago</p>
                      </div>
                    </a>
                  </div>
                  <a href="#" className="block bg-slate-50 dark:bg-slate-900/50 text-center text-sm font-medium text-[#2960DC] dark:text-[#38bdf8] py-2 rounded-b-lg hover:underline">View all</a>
                </div>
              )}
            </div>

            <button onClick={toggleDarkMode} className="text-slate-500 hover:text-[#2960DC] transition-colors">
              {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            </button>

            {session && <UserAvatarMenu session={session} />}
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">System Configuration & Management</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage critical aspects of the Medication Therapy Management system.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredModules.map(module => {
              const Icon = getIconForModule(module);
              return (
                <button 
                  key={module}
                  onClick={() => {
                    if (module === 'User Account Management') {
                      navigate('/super-admin/users');
                    }
                  }}
                  className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl p-6 text-center transition-all duration-300 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center hover:bg-[#E6F4FB] hover:-translate-y-1 hover:shadow-md hover:text-[#2960DC] hover:border-transparent dark:hover:bg-blue-900/40 dark:hover:text-[#38bdf8] group"
                >
                  <Icon className="w-10 h-10 mb-3 text-[#2960DC] dark:text-[#38bdf8] transition-colors group-hover:text-[#4F84F6]" />
                  <span className="text-sm font-semibold">{module}</span>
                </button>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
