import React, { useState, useEffect } from "react";
import {
  LayoutGrid, Plus, Save, ArrowLeft, RotateCcw,
  Trash2, Circle, ChevronRight, ChevronDown, Check, Briefcase, Activity, FileText, Settings, ShieldAlert, Monitor, Users, Database, Stethoscope, Pill, Globe, Link2, FileBox
} from "lucide-react";
import { ModuleNode, ModuleDataScope, SCOPE_RANK, getModules, saveModules } from "../lib/moduleStorage";
import { Role, getRoles } from "../lib/roleStorage";
import * as Icons from "lucide-react";

// Curated categorized list of icons for the visual picker
const ICON_CATEGORIES: Record<string, string[]> = {
  'Healthcare / Clinical': [
    'Stethoscope', 'Pill', 'Activity', 'Heart', 'HeartPulse', 'HeartCrack', 'HeartHandshake',
    'Syringe', 'TestTube', 'TestTubes', 'FlaskConical', 'FlaskRound', 'Microscope', 'Dna',
    'Thermometer', 'Bandage', 'Bone', 'Brain', 'Lungs', 'Ear',
    'Crosshair', 'Radiation', 'Biohazard', 'Baby', 'PersonStanding', 'Accessibility',
    'Ambulance', 'BedDouble', 'Bed', 'Hospital', 'Siren', 'Cross',
    'ClipboardPlus', 'ClipboardList', 'ClipboardCheck', 'ClipboardType', 'Clipboard',
    'NotepadText', 'FileHeart', 'NotebookPen', 'ScanLine', 'ScanHeart',
    'Droplets', 'Droplet', 'Wind', 'Zap', 'ZapOff', 'Weight', 'Ruler', 'Timer',
  ],
  'Pharmacy / Medication': [
    'Tablets', 'Beaker', 'Scale', 'MixerHorizontal', 'MixerVertical',
    'Pipette', 'Vial', 'Capsule', 'Package2', 'Squircle',
  ],
  'Wellness & Lifestyle': [
    'Dumbbell', 'Footprints', 'Apple', 'Flame', 'Leaf', 'TreePine',
    'Sun', 'Moon', 'Snowflake', 'Smile', 'Frown', 'Meh',
  ],
  'Organization / Admin': [
    'LayoutGrid', 'LayoutDashboard', 'LayoutList', 'LayoutPanelLeft',
    'Database', 'ShieldAlert', 'Shield', 'ShieldCheck', 'ShieldOff', 'ShieldPlus',
    'Settings', 'Settings2', 'SlidersHorizontal', 'ToggleLeft', 'ToggleRight',
    'Users', 'UserPlus', 'UserCheck', 'UserX', 'UserCog', 'UserCircle',
    'Monitor', 'MonitorDot', 'FileText', 'FileSignature', 'FilePlus', 'FileMinus',
    'FileCheck', 'FileX', 'FileLock', 'FileBadge', 'FolderOpen', 'FolderPlus',
    'Briefcase', 'Badge', 'BadgeCheck', 'BadgeAlert', 'Stamp',
    'BookOpen', 'BookMarked', 'Notebook', 'NotebookTabs', 'GraduationCap',
    'Award', 'Trophy', 'Star', 'Flag', 'BellRing', 'Bell', 'BellOff',
  ],
  'Data & Analytics': [
    'PieChart', 'BarChart', 'BarChart2', 'BarChart3', 'BarChart4',
    'LineChart', 'AreaChart', 'TrendingUp', 'TrendingDown',
    'History', 'ListChecks', 'Search', 'Filter', 'Sliders',
    'Table', 'TableProperties', 'Sigma', 'Percent', 'Hash',
    'ChartNoAxesCombined', 'ChartScatter', 'Gauge', 'Kanban',
  ],
  'IT / Technology': [
    'Server', 'ServerCog', 'HardDrive', 'HardDriveDownload', 'Cpu', 'CircuitBoard',
    'MemoryStick', 'BotMessageSquare', 'Bot', 'Workflow', 'GitBranch', 'GitMerge',
    'Code', 'Code2', 'Terminal', 'Braces', 'Binary', 'Webhook', 'Cable',
    'Router', 'Network', 'Wifi', 'WifiOff', 'Bluetooth', 'Cloud', 'CloudUpload',
    'CloudDownload', 'CloudCog', 'Globe', 'Globe2', 'Satellite', 'Radio',
    'Antenna', 'Podcast', 'Signal', 'SignalHigh', 'SignalLow', 'SignalZero',
  ],
  'Security & Identity': [
    'Key', 'KeyRound', 'Lock', 'LockOpen', 'Unlock', 'Fingerprint',
    'Eye', 'EyeOff', 'Scan', 'ScanFace', 'ScanBarcode', 'QrCode', 'Barcode',
    'AlertOctagon', 'AlertTriangle',
  ],
  'Finance & Logistics': [
    'CreditCard', 'Wallet', 'Wallet2', 'Receipt', 'Calculator', 'DollarSign',
    'BadgeDollarSign', 'Banknote', 'Coins', 'ShoppingCart', 'ShoppingBag',
    'Package', 'PackageCheck', 'PackagePlus', 'Truck', 'Tag', 'Tags',
    'ArrowLeftRight', 'ArrowUpDown', 'Repeat', 'RefreshCw', 'Scissors',
  ],
  'UI / Navigation': [
    'Home', 'Building', 'Building2', 'Landmark', 'Map', 'MapPin', 'Navigation',
    'Compass', 'Link', 'Link2', 'ExternalLink', 'Box', 'Boxes',
    'Folder', 'FolderClosed', 'List', 'ListOrdered', 'Menu', 'MoreHorizontal',
    'Calendar', 'CalendarCheck', 'CalendarPlus', 'CalendarDays', 'CalendarRange',
    'Clock', 'AlarmClock', 'AlarmClockPlus', 'Timer',
    'Mail', 'MailCheck', 'Phone', 'PhoneCall', 'MessageSquare', 'MessageCircle',
    'Video', 'VideoOff', 'Share2', 'Download', 'Upload', 'Printer',
    'Layers', 'LayoutTemplate', 'PanelLeft', 'PanelRight', 'Columns',
    'Maximize', 'Minimize', 'Expand', 'Shrink', 'Move', 'Plus', 'CirclePlus',
  ],
};

const AVAILABLE_ICONS = Object.values(ICON_CATEGORIES).flat();

// For the mega-search, we can use the keys exposed by the module
const ALL_LUCIDE_ICONS_KEYS = Object.keys(Icons).filter(k => /^[A-Z]/.test(k) && k !== 'createLucideIcon' && k !== 'LucideProps' && k !== 'IconProps');

// Scope display config
const SCOPE_ORDER: ModuleDataScope[] = ['site', 'role-driven', 'enterprise', 'global'];
const SCOPE_CONFIG: Record<ModuleDataScope, { label: string; badgeColor: string; badgeBg: string; badgeBorder: string; selectorColor: string; selectorBg: string; selectorBorder: string; description: string }> = {
  'site':        { label: 'SITE',   badgeColor: 'text-sky-700 dark:text-sky-300',      badgeBg: 'bg-sky-100 dark:bg-sky-900/40',      badgeBorder: 'border-sky-300 dark:border-sky-700',      selectorColor: 'text-blue-700 dark:text-blue-300',    selectorBg: 'bg-blue-50 dark:bg-blue-900/30',    selectorBorder: 'border-blue-400',    description: 'Filtered strictly by the active selected facility' },
  'role-driven': { label: 'AUTO',   badgeColor: 'text-amber-700 dark:text-amber-300',  badgeBg: 'bg-amber-100 dark:bg-amber-900/40',  badgeBorder: 'border-amber-300 dark:border-amber-700',  selectorColor: 'text-amber-700 dark:text-amber-300',  selectorBg: 'bg-amber-50 dark:bg-amber-900/30',  selectorBorder: 'border-amber-400',   description: 'Scope resolved dynamically from user role & corporate node' },
  'enterprise':  { label: 'GROUP',  badgeColor: 'text-violet-700 dark:text-violet-300', badgeBg: 'bg-violet-100 dark:bg-violet-900/40', badgeBorder: 'border-violet-300 dark:border-violet-700', selectorColor: 'text-violet-700 dark:text-violet-300', selectorBg: 'bg-violet-50 dark:bg-violet-900/30', selectorBorder: 'border-violet-400',  description: 'Scoped to all authorized facilities for the user' },
  'global':      { label: 'GLOBAL', badgeColor: 'text-emerald-700 dark:text-emerald-300', badgeBg: 'bg-emerald-100 dark:bg-emerald-900/40', badgeBorder: 'border-emerald-300 dark:border-emerald-700', selectorColor: 'text-emerald-700 dark:text-emerald-300', selectorBg: 'bg-emerald-50 dark:bg-emerald-900/30', selectorBorder: 'border-emerald-400', description: 'No site filter — sees all enterprise data' },
};

// Known navigable system routes for the Direct Link picker
const SYSTEM_ROUTES = [
  { value: '/patients',              label: 'MTM Patient List — /patients' },
  { value: '/admin',                 label: 'Admin Dashboard — /admin' },
  { value: '/super-admin',           label: 'Super Admin Portal — /super-admin' },
  { value: '/super-admin/modules',   label: 'Module Composer — /super-admin/modules' },
  { value: '/super-admin/roles',     label: 'Role Access Matrix — /super-admin/roles' },
  { value: '/super-admin/corporate', label: 'Corporate Fare — /super-admin/corporate' },
  { value: '/snomed',                label: 'SNOMED CT Browser — /snomed' },
];

export function SystemModuleManagement() {
  const [modules, setModules] = useState<ModuleNode[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [iconSearch, setIconSearch] = useState('');
  
  // Icon Modal State
  const [isIconModalOpen, setIsIconModalOpen] = useState(false);
  const [iconModalSearch, setIconModalSearch] = useState('');
  
  const [nodeSearch, setNodeSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  // Resizable Panes & Tree States
  const [leftWidth, setLeftWidth] = useState(33);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showAllIcons, setShowAllIcons] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [m, r] = await Promise.all([getModules(), getRoles()]);
      setModules(m);
      setAvailableRoles(r);
    };
    load().catch(console.error);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = (e.clientX / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) setLeftWidth(newWidth);
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

  // Debounced Auto-Save
  useEffect(() => {
    if (modules.length === 0) return;
    const timer = setTimeout(async () => {
      await saveModules(modules);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }, 800);
    return () => clearTimeout(timer);
  }, [modules]);

  const handleSave = async () => {
    await saveModules(modules);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleRestoreDefaults = async () => {
    if (confirm("Are you sure you want to restore the original System Default Modules? This will completely wipe all custom trees and RBAC assignments.")) {
      const fresh = await getModules();
      setModules(fresh);
      setActiveNodeId(null);
    }
  };

  /** Convert a title to a URL-safe slug: "New Sub-Module" → "new-sub-module" */
  const toSlug = (title: string) =>
    title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  /** Build the full route path for a node based on its ancestor chain: /parent-slug/child-slug */
  const buildRoutePath = (nodes: ModuleNode[], targetId: string, prefix = ''): string | null => {
    for (const node of nodes) {
      const segment = `${prefix}/${toSlug(node.title)}`;
      if (node.id === targetId) return segment;
      if (node.submodules) {
        const found = buildRoutePath(node.submodules, targetId, segment);
        if (found) return found;
      }
    }
    return null;
  };

  // N-Level Recursion Helpers
  const updateNode = (nodes: ModuleNode[], id: string, updates: Partial<ModuleNode>): ModuleNode[] => {
    return nodes.map(node => {
      if (node.id === id) return { ...node, ...updates };
      if (node.submodules) return { ...node, submodules: updateNode(node.submodules, id, updates) };
      return node;
    });
  };

  const deleteNode = (nodes: ModuleNode[], id: string): ModuleNode[] => {
    return nodes.filter(node => node.id !== id).map(node => {
      if (node.submodules) return { ...node, submodules: deleteNode(node.submodules, id) };
      return node;
    });
  };

  const addChildNode = (nodes: ModuleNode[], parentId: string): ModuleNode[] => {
    return nodes.map(node => {
      if (node.id === parentId) {
        // Generate a unique title by checking existing sibling names
        const siblings = node.submodules || [];
        const baseName = 'New Sub-Module';
        let newTitle = baseName;
        let counter = 2;
        while (siblings.some(s => s.title === newTitle)) {
          newTitle = `${baseName} ${counter}`;
          counter++;
        }

        const newId = `node_${Date.now()}`;
        const parentSlug = toSlug(node.title);
        const childSlug = toSlug(newTitle);
        const newNode: ModuleNode = {
          id: newId,
          title: newTitle,
          iconName: "Link",
          route: `/${parentSlug}/${childSlug}`,
          active: true,
          desc: "",
          allowedRoles: node.allowedRoles?.length ? node.allowedRoles : ['Super Admin'],
          dataScope: node.dataScope ?? 'site',
          submodules: []
        };
        // Parent becomes a container — reset its route to '#' so the
        // HomePage treats it as an expandable group, not a leaf page
        const parentRoute = node.isCore ? node.route : '#';
        return { ...node, route: parentRoute, submodules: [...(node.submodules || []), newNode] };
      }
      if (node.submodules) {
        return { ...node, submodules: addChildNode(node.submodules, parentId) };
      }
      return node;
    });
  };

  const addNewMasterModule = () => {
    // Generate a unique top-level module name
    const baseName = 'New Master Module';
    let newTitle = baseName;
    let counter = 2;
    while (modules.some(m => m.title === newTitle)) {
      newTitle = `${baseName} ${counter}`;
      counter++;
    }
    const newNode: ModuleNode = {
      id: `module_${Date.now()}`,
      title: newTitle,
      iconName: "LayoutGrid",
      route: `/${toSlug(newTitle)}`,
      active: true,
      desc: "New system block",
      allowedRoles: ['Super Admin'],
      submodules: []
    };
    setModules([...modules, newNode]);
    setActiveNodeId(newNode.id);
  };

  // Find the exact node currently selected to populate Inspector
  const findActiveNode = (nodes: ModuleNode[], id: string): ModuleNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.submodules) {
        const found = findActiveNode(node.submodules, id);
        if (found) return found;
      }
    }
    return null;
  };

  /** Returns the parent ModuleNode, null if root, or undefined if not found */
  const findParentNode = (nodes: ModuleNode[], targetId: string, parent: ModuleNode | null = null): ModuleNode | null | undefined => {
    for (const node of nodes) {
      if (node.id === targetId) return parent;
      if (node.submodules) {
        const result = findParentNode(node.submodules, targetId, node);
        if (result !== undefined) return result;
      }
    }
    return undefined;
  };

  /** Get ancestor chain (root → closest parent) for a given node ID */
  const getAncestorChain = (nodes: ModuleNode[], targetId: string, chain: ModuleNode[] = []): ModuleNode[] | null => {
    for (const node of nodes) {
      if (node.id === targetId) return chain;
      if (node.submodules) {
        const r = getAncestorChain(node.submodules, targetId, [...chain, node]);
        if (r !== null) return r;
      }
    }
    return null;
  };

  /** Remove a role from a target node AND all its descendants (deep cascade downward) */
  const removeRoleFromSubtree = (nodes: ModuleNode[], targetId: string, role: string): ModuleNode[] =>
    nodes.map(node => {
      if (node.id === targetId) {
        const strip = (n: ModuleNode): ModuleNode => ({
          ...n,
          allowedRoles: (n.allowedRoles || []).filter(r => r !== role),
          submodules: n.submodules ? n.submodules.map(strip) : []
        });
        return strip(node);
      }
      if (node.submodules) return { ...node, submodules: removeRoleFromSubtree(node.submodules, targetId, role) };
      return node;
    });

  const activeNode = activeNodeId ? findActiveNode(modules, activeNodeId) : null;
  const activeParent = activeNodeId ? findParentNode(modules, activeNodeId) : undefined;
  // Max allowed scope rank for the active node (parent's rank, or unconstrained for root modules)
  const maxScopeRank = (activeParent && activeParent.dataScope) ? SCOPE_RANK[activeParent.dataScope] : SCOPE_RANK['global'];

  // Render Tree recursively
  const renderTree = (nodes: ModuleNode[], level = 0) => {
    return nodes.map(node => {
      const hasChildren = node.submodules && node.submodules.length > 0;
      const isSelected = activeNodeId === node.id;
      const isExpanded = nodeSearch ? true : expandedNodes.has(node.id);
      // @ts-ignore
      const NodeIcon = Icons[node.iconName] || Icons.Box;

      const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedNodes(prev => {
          const next = new Set(prev);
          if (next.has(node.id)) next.delete(node.id);
          else next.add(node.id);
          return next;
        });
      };

      return (
        <div key={node.id} className="w-full">
          <div 
            onClick={() => setActiveNodeId(node.id)}
            style={{ paddingLeft: `${(level * 1.5) + 0.5}rem` }}
            className={`flex items-center gap-2 py-2 pr-4 border-b border-transparent cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/40 border-l-4 border-l-[#2960DC]' : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-l-transparent'}`}
          >
            <div 
              onClick={hasChildren ? toggleExpand : undefined}
              className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${hasChildren ? 'hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer text-slate-500' : 'text-slate-300'}`}
            >
              {hasChildren ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <Circle className="w-1.5 h-1.5 opacity-30" />}
            </div>
            
            <NodeIcon className={`w-4 h-4 ${node.active ? 'text-[#2960DC] dark:text-[#4F84F6]' : 'text-slate-400 grayscale'}`} />
            
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-medium ${node.active ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-500 line-through'}`}>
                {node.title}
              </span>
            </div>

            {node.dataScope && (() => {
              const cfg = SCOPE_CONFIG[node.dataScope];
              return (
                <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-md border shrink-0 whitespace-nowrap ${cfg.badgeColor} ${cfg.badgeBg} ${cfg.badgeBorder}`}>
                  {cfg.label}
                </span>
              );
            })()}
            {!node.active && <span className="text-[10px] uppercase font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">UP</span>}
          </div>

          {hasChildren && isExpanded && (
            <div className="w-full">
              {renderTree(node.submodules, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-screen antialiased bg-slate-50 dark:bg-slate-900 overflow-hidden text-slate-900 dark:text-slate-100 transition-colors">
      {/* MTM DNA Header */}
      <header className="bg-[#2960DC] border-b border-white/10 px-6 py-4 flex items-center justify-between shrink-0 shadow-xl transition-colors z-50">
        <div className="flex items-center gap-4">
          <a href="/super-admin" className="p-2 -ml-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <LayoutGrid className="w-6 h-6 text-white/80" /> System Module Composer
            </h1>
            <p className="text-xs text-white/70 font-medium">Split-Pane Configuration & Role-Based Access Control (RBAC)</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRestoreDefaults}
            className="px-4 py-2 hover:bg-slate-800/50 text-white text-sm border-transparent font-semibold rounded-lg flex items-center gap-2 transition-colors opacity-80 hover:opacity-100"
            title="Wipe custom changes and restore default modules"
          >
            <RotateCcw className="w-4 h-4" /> Reset Defaults
          </button>
          
          <button 
            onClick={addNewMasterModule}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm border border-white/20 font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-inner ml-2"
          >
            <Plus className="w-4 h-4" /> Add Master Module
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-white text-[#2960DC] hover:bg-blue-50 text-sm font-bold rounded-lg flex items-center gap-2 shadow-lg transition-colors border-2 border-transparent"
          >
            {isSaved ? <Check className="w-4 h-4 text-green-500" /> : <Save className="w-4 h-4" />}
            {isSaved ? 'Published Live' : 'Publish to Portal'}
          </button>
        </div>
      </header>

      {/* Split Pane Body */}
      <main className="flex-1 overflow-hidden flex relative select-none">
        
        {/* Left Pane - Navigator */}
        <div style={{ width: `${leftWidth}%` }} className="bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col h-full z-10 shadow-[2px_0_10px_rgba(0,0,0,0.02)] shrink-0 min-w-[250px]">
          <div className="p-3 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800 shrink-0 space-y-2">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Node Tree Explorer</p>
            <div className="relative">
              <input
                type="text"
                placeholder="Search modules..."
                value={nodeSearch}
                onChange={(e) => setNodeSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#2960DC] outline-none transition-all"
              />
              <svg className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {renderTree((() => {
              if (!nodeSearch) return modules;
              const q = nodeSearch.toLowerCase();
              const filter = (nodes: ModuleNode[]): ModuleNode[] =>
                nodes.reduce<ModuleNode[]>((acc, n) => {
                  const kids = filter(n.submodules || []);
                  if (n.title.toLowerCase().includes(q) || kids.length > 0)
                    acc.push({ ...n, submodules: kids });
                  return acc;
                }, []);
              return filter(modules);
            })())}
          </div>
        </div>

        {/* Resizer Handle */}
        <div 
          onMouseDown={() => setIsResizing(true)}
          className={`w-1.5 -ml-[0.75px] z-20 cursor-col-resize transition-colors ${isResizing ? 'bg-[#2960DC]' : 'hover:bg-blue-300 dark:hover:bg-slate-500 bg-transparent'}`}
        />

        {/* Right Pane - Inspector */}
        <div style={{ width: `${100 - leftWidth}%` }} className="bg-slate-50 dark:bg-slate-900 flex flex-col h-full relative overflow-y-auto flex-1 min-w-[400px]">
          {activeNode ? (
            <div className="p-10 max-w-3xl mx-auto w-full space-y-8 animate-in fade-in zoom-in-95 duration-200">
              
              {/* Toolbar */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  Node Inspector
                </h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setModules(addChildNode(modules, activeNode.id));
                      setExpandedNodes(prev => new Set(prev).add(activeNode.id));
                    }}
                    className="px-3 py-1.5 bg-blue-50 text-[#2960DC] rounded-md text-sm font-semibold hover:bg-blue-100 dark:bg-blue-900/30 dark:text-[#4F84F6] transition-colors"
                  >
                    + Nest Sub-Module
                  </button>
                  {!activeNode.isCore && (
                    confirmDeleteId === activeNode.id ? (
                      <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg px-3 py-1.5 animate-in fade-in duration-150">
                        <span className="text-xs text-red-700 dark:text-red-400 font-semibold whitespace-nowrap">Delete this module?</span>
                        <button
                          onClick={() => {
                            setModules(deleteNode(modules, activeNode.id));
                            setActiveNodeId(null);
                            setConfirmDeleteId(null);
                          }}
                          className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded transition-colors"
                        >Delete</button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(activeNode.id)}
                        className="px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-md text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                        title="Delete Module"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Status & Preview Banner */}
              <div className="flex gap-6" style={{ alignItems: 'stretch' }}>
                  <div className="flex-1 space-y-6">
                     
                     <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                          <label className="font-semibold text-sm">Status (Active / Upcoming)</label>
                          <button 
                            onClick={() => setModules(updateNode(modules, activeNode.id, { active: !activeNode.active }))}
                            className={`w-14 h-7 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${activeNode.active ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                          >
                            <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ${activeNode.active ? 'translate-x-7' : ''}`} />
                          </button>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Module Title</label>
                          <input
                            value={activeNode.title}
                            onChange={(e) => {
                              const newTitle = e.target.value;
                              const updates: Partial<ModuleNode> = { title: newTitle };
                              // Auto-sync route slug if route was auto-generated (not a hand-typed real path)
                              const isParent = activeNode.submodules && activeNode.submodules.length > 0;
                              if (!isParent) {
                                const currentRoute = activeNode.route ?? '#';
                                const autoGenerated = currentRoute === '#' || currentRoute.startsWith('/') && !currentRoute.startsWith('/super-admin') && !currentRoute.startsWith('/patients') && !currentRoute.startsWith('/admin') && !currentRoute.startsWith('/snomed');
                                if (autoGenerated) {
                                  const existingPath = buildRoutePath(modules, activeNode.id);
                                  // rebuild: keep parent prefix, update leaf slug
                                  if (existingPath) {
                                    const parts = existingPath.split('/').filter(Boolean);
                                    parts[parts.length - 1] = toSlug(newTitle) || 'module';
                                    updates.route = '/' + parts.join('/');
                                  }
                                }
                              }
                              setModules(updateNode(modules, activeNode.id, updates));
                            }}
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#2960DC] outline-none transition-all font-medium text-slate-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Description</label>
                          <textarea 
                            value={activeNode.desc}
                            onChange={(e) => setModules(updateNode(modules, activeNode.id, { desc: e.target.value }))}
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#2960DC] outline-none transition-all text-sm text-slate-900 dark:text-white"
                            rows={2}
                          />
                        </div>

                          {/* Route field — plain input for Module Workspace, select for Direct Link */}
                          {activeNode.isDirectLink && !(activeNode.submodules && activeNode.submodules.length > 0) ? (
                            <div className="space-y-2">
                              <select
                                value={SYSTEM_ROUTES.some(r => r.value === activeNode.route) ? activeNode.route : '__custom__'}
                                onChange={e => {
                                  if (e.target.value !== '__custom__') {
                                    setModules(updateNode(modules, activeNode.id, { route: e.target.value }));
                                  } else {
                                    setModules(updateNode(modules, activeNode.id, { route: '' }));
                                  }
                                }}
                                className="w-full p-2.5 rounded-lg border-2 border-emerald-400 dark:border-emerald-600 bg-white dark:bg-slate-900 text-emerald-900 dark:text-emerald-100 font-semibold text-sm outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                              >
                                <option value="">— Select a destination route —</option>
                                {SYSTEM_ROUTES.map(r => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                                <option value="__custom__">✏ Custom route...</option>
                              </select>
                              {(!SYSTEM_ROUTES.some(r => r.value === activeNode.route)) && (
                                <input
                                  type="text"
                                  value={activeNode.route === '#' ? '' : (activeNode.route || '')}
                                  placeholder="Enter custom path, e.g. /patients/detail"
                                  onChange={e => setModules(updateNode(modules, activeNode.id, { route: e.target.value || '#' }))}
                                  className="w-full p-2.5 rounded-lg border-2 border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 font-mono text-sm text-emerald-900 dark:text-emerald-100 font-semibold outline-none focus:ring-2 focus:ring-emerald-400"
                                />
                              )}
                            </div>
                          ) : (
                            <input
                              value={activeNode.route}
                              placeholder={activeNode.isDirectLink ? 'e.g.  /patients  or  /admin  or  /snomed' : ''}
                              onFocus={(e) => {
                                if (e.target.value === '#') {
                                  setModules(updateNode(modules, activeNode.id, { route: '' }));
                                }
                              }}
                              onBlur={(e) => {
                                if (e.target.value.trim() === '') {
                                  setModules(updateNode(modules, activeNode.id, { route: '#' }));
                                }
                              }}
                              onChange={(e) => setModules(updateNode(modules, activeNode.id, { route: e.target.value }))}
                              disabled={activeNode.submodules && activeNode.submodules.length > 0}
                              className={`w-full p-2.5 rounded-lg outline-none transition-all font-mono text-sm ${
                                (activeNode.submodules && activeNode.submodules.length > 0)
                                  ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                                  : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2960DC]'
                              }`}
                            />
                          )}
                          {(activeNode.submodules && activeNode.submodules.length > 0) && (
                            <p className="mt-1.5 text-[10px] text-orange-500 font-bold uppercase tracking-wider flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> Routing disabled for Parent Modules (Folders).
                            </p>
                          )}
                          {activeNode.isDirectLink && activeNode.route && activeNode.route !== '#' && !(activeNode.submodules && activeNode.submodules.length > 0) && (
                            <p className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Route set — clicking this module in the portal will open: <span className="font-mono ml-1 bg-emerald-100 dark:bg-emerald-900/40 px-1 rounded">{activeNode.route}</span>
                            </p>
                          )}
                          {activeNode.isDirectLink && (!activeNode.route || activeNode.route === '#') && !(activeNode.submodules && activeNode.submodules.length > 0) && (
                            <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> No route selected — choose a destination above.
                            </p>
                          )}

                        {/* Navigation Mode — only shown for leaf nodes */}
                        {!(activeNode.submodules && activeNode.submodules.length > 0) && (
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                              Navigation Mode
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                              {/* Generic Workspace option */}
                              <button
                                onClick={() => setModules(updateNode(modules, activeNode.id, { isDirectLink: false }))}
                                className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border-2 text-left transition-all ${
                                  !activeNode.isDirectLink
                                    ? 'border-[#2960DC] bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <FileBox className={`w-4 h-4 ${!activeNode.isDirectLink ? 'text-[#2960DC]' : 'text-slate-400'}`} />
                                  {!activeNode.isDirectLink && <Check className="w-3.5 h-3.5 text-[#2960DC]" />}
                                </div>
                                <span className={`text-xs font-bold ${!activeNode.isDirectLink ? 'text-[#2960DC] dark:text-[#4F84F6]' : 'text-slate-600 dark:text-slate-400'}`}>
                                  Module Workspace
                                </span>
                                <span className="text-[10px] text-slate-400 leading-tight">
                                  Opens generic workspace page (under development placeholder)
                                </span>
                              </button>

                              {/* Direct Link option */}
                              <button
                                onClick={() => setModules(updateNode(modules, activeNode.id, {
                                  isDirectLink: true,
                                  // Reset to empty if the current route is an auto-generated path not in the known list
                                  route: SYSTEM_ROUTES.some(r => r.value === activeNode.route) ? activeNode.route : '',
                                }))}
                                className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border-2 text-left transition-all ${
                                  activeNode.isDirectLink
                                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <Link2 className={`w-4 h-4 ${activeNode.isDirectLink ? 'text-emerald-600' : 'text-slate-400'}`} />
                                  {activeNode.isDirectLink && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                                </div>
                                <span className={`text-xs font-bold ${activeNode.isDirectLink ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                  Direct Page Link
                                </span>
                                <span className="text-[10px] text-slate-400 leading-tight">
                                  Navigates straight to the System Route above
                                </span>
                              </button>
                            </div>

                          </div>
                        )}
                     </div>
                  </div>

                  {/* Icon Picker — same height as left form, scrollable */}
                  <div className="w-[280px] shrink-0 bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col" style={{ alignSelf: 'stretch', minHeight: 0 }}>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider shrink-0">Visual Icon Badge</label>

                    {/* Search */}
                    <div className="relative mb-3 shrink-0">
                      <input
                        type="text"
                        placeholder="Search icons..."
                        value={iconSearch}
                        onChange={(e) => { setIconSearch(e.target.value); setShowAllIcons(true); }}
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#2960DC] outline-none"
                      />
                      <Monitor className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>

                    {/* Grid — fills all remaining height; cells stretch to fill rows */}
                    <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
                      <div className="grid grid-cols-4 gap-1.5 h-full auto-rows-fr">
                        {AVAILABLE_ICONS
                          .filter(i => i.toLowerCase().includes(iconSearch.toLowerCase()))
                          .slice(0, 16)
                          .map(iName => {
                            // @ts-ignore
                            const Ico = Icons[iName] || Icons.Box;
                            const active = activeNode.iconName === iName;
                            return (
                              <button
                                key={iName}
                                onClick={() => setModules(updateNode(modules, activeNode.id, { iconName: iName }))}
                                title={iName}
                                className={`rounded-lg flex items-center justify-center transition-all ${
                                  active
                                    ? 'bg-[#2960DC] text-white shadow-md scale-110'
                                    : 'bg-slate-50 dark:bg-slate-900 text-slate-500 hover:bg-slate-100 hover:text-[#2960DC] dark:hover:bg-slate-700'
                                }`}
                              >
                                <Ico className="w-5 h-5" />
                              </button>
                            );
                          })}
                      </div>
                    </div>

                    {/* Show All / Mega Library Browse Button */}
                    <button
                      onClick={() => {
                        setIconModalSearch('');
                        setIsIconModalOpen(true);
                      }}
                      className="mt-3 shrink-0 w-full py-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2960DC] bg-blue-50 hover:bg-blue-100 dark:bg-slate-700 dark:text-[#4F84F6] dark:hover:bg-slate-600 rounded-lg transition-colors border border-blue-100 dark:border-slate-600"
                    >
                      <LayoutGrid className="w-4 h-4" />
                      Browse Icon Library
                    </button>
                  </div>
              </div>

              {/* Data Scope Layer */}
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-1 border-b border-slate-100 dark:border-slate-700 pb-2">
                  <Globe className="w-4 h-4 text-blue-500" /> Data Scope Layer
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Defines what facility data this module can access.
                  {activeParent && activeParent.dataScope && (
                    <span className="ml-1">
                      Constrained by parent scope:{' '}
                      <span className={`font-bold uppercase ${SCOPE_CONFIG[activeParent.dataScope].selectorColor}`}>
                        {SCOPE_CONFIG[activeParent.dataScope].label}
                      </span>
                      {' '}— child cannot exceed this layer.
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SCOPE_ORDER.map(scope => {
                    const cfg = SCOPE_CONFIG[scope];
                    const rank = SCOPE_RANK[scope];
                    const isDisabled = rank > maxScopeRank;
                    const isSelected = (activeNode.dataScope ?? 'site') === scope;
                    return (
                      <button
                        key={scope}
                        disabled={isDisabled}
                        onClick={() => !isDisabled && setModules(updateNode(modules, activeNode.id, { dataScope: scope }))}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border-2 text-left transition-all ${
                          isDisabled
                            ? 'opacity-30 cursor-not-allowed bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                            : isSelected
                              ? `${cfg.selectorBg} ${cfg.selectorBorder} shadow-sm`
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className={`text-xs font-bold uppercase tracking-wider ${isSelected && !isDisabled ? cfg.selectorColor : 'text-slate-600 dark:text-slate-400'}`}>
                            {cfg.label}
                          </span>
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight truncate">{cfg.description}</span>
                        </div>
                        <div className="shrink-0">
                          {isSelected && !isDisabled && <Check className={`w-3.5 h-3.5 ${cfg.selectorColor}`} />}
                          {isDisabled && <span className="text-[9px] uppercase font-bold text-slate-400">Locked</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Security & RBAC */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                 <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4 border-b border-slate-100 dark:border-slate-700 pb-2">
                   <ShieldAlert className="w-4 h-4 text-orange-500" /> Authorized Roles (RBAC)
                 </h3>
                 <p className="text-xs text-slate-500 mb-4">Select which credentials have authority to click and navigate to this routing target.</p>
                 
                 <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {availableRoles.map(roleObj => {
                      const role = roleObj.name;
                      const isAllowed = activeNode.allowedRoles.includes(role);
                      return (
                        <label key={role} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isAllowed ? 'bg-blue-50 dark:bg-blue-900/20 border-[#2960DC]' : 'bg-slate-50 dark:bg-slate-900 bg-transparent border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100'}`}>
                           <input 
                             type="checkbox"
                             checked={isAllowed}
                             onChange={(e) => {
                               if (e.target.checked) {
                                 // Add role to this node, then propagate UP to every ancestor
                                 let newMods = updateNode(modules, activeNode.id, {
                                   allowedRoles: [...activeNode.allowedRoles, role]
                                 });
                                 const ancestors = getAncestorChain(modules, activeNode.id) ?? [];
                                 for (const anc of ancestors) {
                                   const ancNode = findActiveNode(newMods, anc.id);
                                   if (ancNode && !ancNode.allowedRoles.includes(role)) {
                                     newMods = updateNode(newMods, anc.id, { allowedRoles: [...ancNode.allowedRoles, role] });
                                   }
                                 }
                                 setModules(newMods);
                               } else {
                                 // Remove from this node AND cascade DOWN to all descendants
                                 setModules(removeRoleFromSubtree(modules, activeNode.id, role));
                               }
                             }}
                             className="w-4 h-4 accent-[#2960DC]"
                           />
                           <span className={`text-sm font-medium ${isAllowed ? 'text-[#2960DC] dark:text-[#4F84F6]' : 'text-slate-600 dark:text-slate-400'}`}>{role}</span>
                        </label>
                      )
                    })}
                 </div>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center animate-pulse">
              <LayoutGrid className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-semibold text-lg">Select a Node</p>
              <p className="text-sm">Click any module or sub-module from the explorer tree to launch the Inspector.</p>
            </div>
          )}
        </div>
      </main>
    {/* MEGA ICON LIBRARY MODAL */}
    {/* ───────────────────────────────────────────────────────────── */}
    {isIconModalOpen && activeNode && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-200">
        <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
          {/* Modal Header */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-900">
            <div className="bg-blue-100 dark:bg-blue-900/40 p-3 rounded-xl text-[#2960DC] dark:text-[#4F84F6]">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Icon Mega Library</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Select an icon for <strong>{activeNode.title}</strong></p>
            </div>
            <button 
              onClick={() => setIsIconModalOpen(false)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          </div>
          
          {/* Modal Search Bar */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="relative max-w-2xl mx-auto">
              <Icons.Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search over 1,000+ icons..."
                value={iconModalSearch}
                onChange={e => setIconModalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-[#2960DC] outline-none font-medium transition-all"
              />
            </div>
          </div>

          {/* Modal Content - Scrolling Grid */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950/50">
            <div className="max-w-5xl mx-auto">
              {iconModalSearch.trim() === '' ? (
                /* GROUPED VIEW */
                <div className="space-y-8 pb-8">
                  {Object.entries(ICON_CATEGORIES).map(([category, iconNames]) => (
                    <div key={category}>
                      <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-2">
                        {category}
                      </h3>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
                        {iconNames.map(iName => {
                          // @ts-ignore
                          const Ico = Icons[iName] || Icons.Box;
                          const isSelected = activeNode.iconName === iName;
                          return (
                            <button
                              key={iName}
                              onClick={() => {
                                setModules(updateNode(modules, activeNode.id, { iconName: iName }));
                                setIsIconModalOpen(false);
                              }}
                              title={iName}
                              className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl transition-all ${
                                isSelected 
                                  ? 'bg-[#2960DC] text-white shadow-md ring-2 ring-[#2960DC] ring-offset-2 dark:ring-offset-slate-900 scale-105 z-10' 
                                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-[#2960DC] hover:text-[#2960DC] dark:hover:border-[#4F84F6] hover:shadow-sm'
                              }`}
                            >
                              <Ico className="w-6 h-6" strokeWidth={isSelected ? 2.5 : 2} />
                              <span className="text-[9px] font-medium text-center truncate w-full" title={iName}>{iName}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* SEARCH RESULTS VIEW */
                <div className="pb-8">
                  <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
                    Search Results for "{iconModalSearch}"
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
                    {ALL_LUCIDE_ICONS_KEYS.filter(k => k.toLowerCase().includes(iconModalSearch.toLowerCase())).slice(0, 200).map(iName => {
                      // @ts-ignore
                      const Ico = Icons[iName] || Icons.Box;
                      const isSelected = activeNode.iconName === iName;
                      return (
                        <button
                          key={iName}
                          onClick={() => {
                            setModules(updateNode(modules, activeNode.id, { iconName: iName }));
                            setIsIconModalOpen(false);
                          }}
                          title={iName}
                          className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl transition-all ${
                            isSelected 
                              ? 'bg-[#2960DC] text-white shadow-md ring-2 ring-[#2960DC] ring-offset-2 dark:ring-offset-slate-900 scale-105 z-10' 
                              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-[#2960DC] hover:text-[#2960DC] dark:hover:border-[#4F84F6] hover:shadow-sm'
                          }`}
                        >
                          <Ico className="w-6 h-6" strokeWidth={isSelected ? 2.5 : 2} />
                          <span className="text-[9px] font-medium text-center truncate w-full" title={iName}>{iName}</span>
                        </button>
                      );
                    })}
                    
                    {ALL_LUCIDE_ICONS_KEYS.filter(k => k.toLowerCase().includes(iconModalSearch.toLowerCase())).length === 0 && (
                      <div className="col-span-full py-12 text-center flex flex-col items-center justify-center text-slate-400">
                        <Icons.SearchX className="w-12 h-12 mb-4 opacity-50" />
                        <p>No icons found matching "{iconModalSearch}". Try a different keyword.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Modal Footer */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-center flex justify-between items-center text-xs text-slate-500">
            <p>Powered by Lucide React</p>
            {iconModalSearch.trim() !== '' && (
              <p>Showing top 200 matches</p>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
  );
}
