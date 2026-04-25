import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  Activity,
  FileText,
  CheckSquare,
  Settings,
  Pill,
  Search,
  ChevronRight,
  ChevronLeft,
  Zap,
  Bell,
  MessageSquare
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { getAuthSession, fetchWithAuth } from "@/src/lib/authSession";
import { UserAvatarMenu } from "@/src/components/UserAvatarMenu";

function NotificationBell({ expanded }: { expanded: boolean }) {
  const [count, setCount] = useState(0);
  const session = getAuthSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session?.userId) return;
    const fetchCount = () => {
      fetchWithAuth(`/api/arh/notifications/unread-count?userId=${session.userId}`)
        .then(r => r.json())
        .then(d => setCount(d.count || 0))
        .catch(() => {});
    };
    fetchCount();
    const iv = setInterval(fetchCount, 15000); // 15s poll
    return () => clearInterval(iv);
  }, [session?.userId]);

  return (
    <div className="mt-2 text-center w-full">
      <button
        onClick={(e) => {
          e.preventDefault();
          document.dispatchEvent(new CustomEvent('toggle-global-notifications'));
        }}
        onDoubleClick={() => navigate('/notifications')}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative border",
          count > 0 
            ? "bg-red-50 hover:bg-red-100 border-red-200 dark:bg-red-500/10 dark:border-red-500/20 shadow-sm" 
            : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-200 dark:hover:border-slate-700",
          expanded ? "justify-start" : "justify-center"
        )}
      >
        <div className="relative">
          <Bell className={cn("w-5 h-5 shrink-0 transition-colors", count > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500 group-hover:text-[#2960DC] dark:text-slate-400 dark:group-hover:text-[#38bdf8]")} />
          {count > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center shadow-sm">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </div>
        {expanded && (
          <span className={cn("text-sm tracking-wide whitespace-nowrap", count > 0 ? "font-bold text-red-700 dark:text-red-400" : "font-medium text-slate-500 group-hover:text-[#2960DC] dark:text-slate-400 dark:group-hover:text-[#38bdf8]")}>
            Notifications
          </span>
        )}
        {!expanded && (
          <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md opacity-0 pointer-events-none group-hover:opacity-100 whitespace-nowrap z-50 shadow-xl border border-slate-700">
            Notifications {count > 0 && `(${count} unread)`}
          </div>
        )}
      </button>
    </div>
  );
}

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",         to: "/" },
  { icon: Users,           label: "Patients",          to: "/patients" },
  { icon: Stethoscope,     label: "MTM Sessions",      to: "/sessions" },
  { icon: Pill,            label: "Medication Review", to: "/workspace" },
  { icon: Activity,        label: "Labs & Trends",     to: "/labs" },
  { icon: FileText,        label: "Reports",           to: "/reports" },
  { icon: Search,          label: "SNOMED Browser",    to: "/snomed" },
  { icon: Pill,            label: "Medication Browser",to: "/pharma" },
  { icon: CheckSquare,     label: "Tasks & Follow-ups",to: "/tasks" },
  { icon: Settings,        label: "Admin",             to: "/admin" },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_expanded') === 'true';
  });

  const toggle = () => {
    setExpanded(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_expanded', String(next));
      return next;
    });
  };

  const session = getAuthSession();
  const navigate = useNavigate();

  return (
    <aside
      className={cn(
        "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex flex-col h-screen fixed left-0 top-0 border-r border-slate-200 dark:border-slate-700 z-50 shadow-[2px_0_5px_rgba(0,0,0,0.05)] transition-all duration-300 ease-in-out",
        expanded ? "w-64" : "w-20"
      )}
    >
      {/* ── Header: Logo only (arrow moved to bottom in expanded) ── */}
      {expanded ? (
        /* Expanded: wide logo fills full width, no arrow here */
        <div className="border-b border-slate-100 dark:border-slate-700 shrink-0 py-4 px-4 flex items-center justify-center">
          <img src="/logos/Logo Horizontal.png" alt="CLINIcare Pro" className="w-[85%] h-auto object-contain hidden dark:block brightness-0 invert" />
          <img src="/logos/Logo Horizontal.png" alt="CLINIcare Pro" className="w-[85%] h-auto object-contain dark:hidden" />
        </div>
      ) : (
        /* Collapsed: box logo full width, arrow centred below */
        <div className="flex flex-col items-center gap-2 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700 shrink-0 w-full relative group">
          <div className="w-full px-2 flex justify-center">
            <img
              src="/logos/Box white Background.png"
              alt="CLINIcare"
              className="w-11 h-11 rounded-xl object-contain shadow-sm border border-slate-200 dark:border-slate-700 bg-white"
            />
          </div>
          <button
            onClick={toggle}
            title="Expand sidebar"
            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-600 flex items-center justify-center transition-colors shadow-sm mt-1"
          >
            <ChevronRight className="w-4 h-4 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200" />
          </button>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 py-5 flex flex-col gap-1.5 px-3 overflow-y-auto no-scrollbar">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative border",
                expanded ? "justify-start" : "justify-center",
                isActive
                  ? "bg-[#2960DC]/10 border-[#2960DC]/20 text-[#2960DC] dark:bg-blue-900/40 dark:border-blue-800 dark:text-[#38bdf8] shadow-sm font-semibold"
                  : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-200 dark:hover:border-slate-700 text-slate-500 hover:text-[#2960DC] dark:text-slate-400 dark:hover:text-[#38bdf8]"
              )
            }
          >
            <item.icon className={cn("w-5 h-5 shrink-0 transition-transform group-hover:scale-110")} />

            {expanded && (
              <span className="text-sm tracking-wide whitespace-nowrap">
                {item.label}
              </span>
            )}

            {/* Tooltip — only in collapsed state */}
            {!expanded && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md opacity-0 pointer-events-none group-hover:opacity-100 whitespace-nowrap z-50 shadow-xl border border-slate-700">
                {item.label}
              </div>
            )}
          </NavLink>
        ))}

        {/* ARH shortcut — pinned, distinct */}
        <div className="mt-2 border-t border-slate-100 dark:border-slate-700 pt-2">
          <button
            onClick={() => navigate('/action-hub')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative border",
              "bg-amber-50 hover:bg-amber-100 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 shadow-sm",
              expanded ? "justify-start" : "justify-center"
            )}
          >
            <Zap className="w-5 h-5 shrink-0 text-amber-500 group-hover:text-amber-600 dark:text-amber-400 transition-colors" />
            {expanded && (
              <span className="text-sm font-bold tracking-wide whitespace-nowrap text-amber-700 dark:text-amber-300">
                Action Routing Hub
              </span>
            )}
            {!expanded && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-amber-300 text-xs font-medium rounded-md opacity-0 pointer-events-none group-hover:opacity-100 whitespace-nowrap z-50 shadow-xl border border-slate-700">
                Action Routing Hub
              </div>
            )}
          </button>
        </div>

        {/* Global Notifications Bell */}
        <NotificationBell expanded={expanded} />
      </nav>


      {/* ── Bottom: User Avatar ── */}
      <div
        className={cn(
          "border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shrink-0 transition-all duration-300",
          expanded ? "px-3 py-3" : "p-3 flex justify-center"
        )}
      >
        {session && (
          expanded ? (
            <div className="flex items-center justify-between gap-2">
              <UserAvatarMenu
                session={session}
                dropUp
                dropdownAlign="left"
              />
              <button
                onClick={toggle}
                title="Collapse sidebar"
                className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 flex items-center justify-center transition-colors shadow-sm shrink-0"
              >
                <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
          ) : (
            <UserAvatarMenu
              session={session}
              compact
              dropUp
              dropdownAlign="left"
            />
          )
        )}
      </div>
    </aside>
  );
}
