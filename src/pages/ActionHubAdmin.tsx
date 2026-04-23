/**
 * ActionHubAdmin — ARH Configuration Page
 * Tab 1: Role Hierarchy & Matrix Reporting Builder
 * Tab 2: Action Categories
 *
 * Only accessible to Super Admin — reads from existing roles, writes only to arh_* tables.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, ArrowLeft, Save, Plus, Trash2, ChevronDown, ChevronUp,
  Network, Shield, Globe, Building2, GitBranch, Tag,
  AlertCircle, CheckCircle2, Loader2, Settings, LayoutGrid,
  ArrowUpCircle, ArrowRightCircle, X, Eye, ChevronRight
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getUsers, UserProfile } from '@/src/lib/userStorage';
import { fetchWithAuth } from '../lib/authSession';
import { getCorporateTree, CorporateNode } from '@/src/lib/corporateStorage';

interface Role {
  id: string; name: string; scope: string; description: string;
  isCoreLocked: boolean; active: boolean;
}

interface HierarchyLevel { roleId: string; roleName: string; roleScope: string; level: number; displayTitle: string; }

interface ReportingLine {
  id: string; roleId: string; role_name: string; role_scope: string;
  reportsToRoleId: string; reports_to_name: string; reports_to_scope: string;
  reportingType: 'Operational' | 'Functional'; description: string;
}

interface ActionCategory {
  id: string; name: string; description: string; icon_name: string;
  color: string; active: boolean; sort_order: number;
}

const SCOPE_COLORS: Record<string, string> = {
  Global:           'bg-emerald-100 text-emerald-700 border-emerald-200',
  Enterprise:       'bg-violet-100 text-violet-700 border-violet-200',
  'Corporate Group':'bg-violet-100 text-violet-700 border-violet-200',
  'Regional Branch':'bg-amber-100 text-amber-700 border-amber-200',
  Facility:         'bg-blue-100 text-blue-700 border-blue-200',
  Department:       'bg-slate-100 text-slate-600 border-slate-200',
};

function ScopeBadge({ scope }: { scope: string }) {
  const cls = SCOPE_COLORS[scope] || 'bg-slate-100 text-slate-500 border-slate-200';
  return (
    <span className={cn('text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full border', cls)}>
      {scope}
    </span>
  );
}

const TABS = [
  { id: 'orgchart',   label: 'Hierarchy View',     icon: Network     },
  { id: 'lines',      label: 'Reporting Lines',    icon: GitBranch   },
  { id: 'levels',     label: 'Authority Levels',   icon: Eye         },
  { id: 'categories', label: 'Action Categories',  icon: Tag         },
];

// ─── ORG CHART / HIERARCHY VIEW TAB ───────────────────────────────────────────
function OrgChartTab({ roles }: { roles: Role[] }) {
  const [levels, setLevels] = useState<Record<string, { level: number; displayTitle: string }>>({});
  const [lines,  setLines]  = useState<ReportingLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(0.82);

  // Account-Based mapping state
  const [users,              setUsers]              = useState<UserProfile[]>([]);
  const [corpTree,           setCorpTree]           = useState<CorporateNode[]>([]);
  const [allFacilities,      setAllFacilities]      = useState<{ id: string; title: string; code?: string }[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [hierData, dbUsers, treeData] = await Promise.all([
          fetchWithAuth('/api/arh/hierarchy').then(r => r.json()),
          getUsers(),
          getCorporateTree(),
        ]);
        const lvlMap: Record<string, { level: number; displayTitle: string }> = {};
        for (const l of hierData.levels || [])
          lvlMap[l.role_id] = { level: l.hierarchy_level, displayTitle: l.display_title || '' };
        setLevels(lvlMap);
        setLines(hierData.lines || []);
        setUsers(dbUsers);
        setCorpTree(treeData);
        const facs: { id: string; title: string; code?: string }[] = [];
        const walkF = (nodes: CorporateNode[]) => {
          for (const n of nodes) {
            if (n.facilityCode || n.type === 'Facility') facs.push({ id: n.id, title: n.title, code: n.facilityCode });
            if (n.children) walkF(n.children);
          }
        };
        walkF(treeData);
        setAllFacilities(facs.sort((a, b) => a.title.localeCompare(b.title)));
        if (facs.length > 0) setSelectedFacilityId(facs[0].id);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin mr-3" />
      <span>Loading Personnel Matrix…</span>
    </div>
  );

  const roleMap = Object.fromEntries(roles.map(r => [r.id, r]));

  // ── Facility scope filter ────────────────────────────────────────────────────
  const isFacilityAssigned = (uids: string[], fid: string, tree: CorporateNode[]): boolean => {
    if (!fid) return true;
    if (uids.includes('Global')) return true;
    const walk = (nodes: CorporateNode[], on: boolean): boolean => {
      for (const n of nodes) {
        const next = on || uids.includes(n.id);
        if (next && n.id === fid) return true;
        if (n.children && walk(n.children, next)) return true;
      }
      return false;
    };
    return walk(tree, false);
  };

  const siteUsers = users.filter(u =>
    u.status !== 'Suspended' && isFacilityAssigned(u.corporateNodeIds, selectedFacilityId, corpTree)
  );
  const usersByRole: Record<string, UserProfile[]> = {};
  for (const u of siteUsers) {
    if (!usersByRole[u.roleId]) usersByRole[u.roleId] = [];
    usersByRole[u.roleId].push(u);
  }

  // ── Build tree adjacency ─────────────────────────────────────────────────────
  const treeChildren: Record<string, string[]> = {};
  const treeParent:   Record<string, string>   = {};

  // Operational lines establish the primary hierarchy
  for (const rawLine of lines) {
    const ln = rawLine as any;
    const type = ln.reporting_type || ln.reportingType;
    const rId  = ln.role_id || ln.roleId;
    const pId  = ln.reports_to_role_id || ln.reportsToRoleId;

    if (type === 'Operational') {
      if (!treeChildren[pId]) treeChildren[pId] = [];
      if (!treeChildren[pId].includes(rId))
        treeChildren[pId].push(rId);
      treeParent[rId] = pId;
    }
  }
  // Functional lines only for nodes not yet placed in the primary tree
  for (const rawLine of lines) {
    const ln = rawLine as any;
    const type = ln.reporting_type || ln.reportingType;
    const rId  = ln.role_id || ln.roleId;
    const pId  = ln.reports_to_role_id || ln.reportsToRoleId;

    if (type === 'Functional' && !treeParent[rId]) {
      if (!treeChildren[pId]) treeChildren[pId] = [];
      if (!treeChildren[pId].includes(rId))
        treeChildren[pId].push(rId);
      treeParent[rId] = pId;
    }
  }

  const functionalLines = lines.filter(ln => {
    const type = (ln as any).reporting_type || (ln as any).reportingType;
    return type === 'Functional';
  });

  // ── Prune branches with no site users ─────────────────────────────────────────
  // A role is kept if it has users OR if any descendant has users.
  const hasUsersCache: Record<string, boolean> = {};
  const hasSiteUsers = (id: string, visited = new Set<string>()): boolean => {
    if (hasUsersCache[id] !== undefined) return hasUsersCache[id];
    if (visited.has(id)) return false;
    visited.add(id);

    if ((usersByRole[id] || []).length > 0) return (hasUsersCache[id] = true);
    
    for (const childId of (treeChildren[id] || [])) {
      if (hasSiteUsers(childId, visited)) return (hasUsersCache[id] = true);
    }
    return (hasUsersCache[id] = false);
  };

  const rootIds = roles
    .filter(r => !treeParent[r.id] && hasSiteUsers(r.id))
    .sort((a, b) => (levels[a.id]?.level ?? 99) - (levels[b.id]?.level ?? 99))
    .map(r => r.id);

  // ── Layout constants — MUST match the card inline styles below ───────────────
  const NW  = 210;  // node card width
  const NH  = 116;  // node card height — enforced via inline style so SVG math stays accurate
  const HG  = 44;   // horizontal gap between sibling subtrees
  const VG  = 80;   // vertical gap between parent card bottom and child card top
  const PAD = 56;   // canvas edge padding

  const sortCh = (ch: string[]) =>
    [...new Set(ch)]
      .filter(id => hasSiteUsers(id))
      .sort((a, b) => {
        const la = levels[a]?.level ?? 99, lb = levels[b]?.level ?? 99;
        return la !== lb ? la - lb : (roleMap[a]?.name || '').localeCompare(roleMap[b]?.name || '');
      });

  // ── Pass 1: Compute subtree widths ────────────────────────────────────────────
  // Each leaf node occupies exactly (NW + HG) px of horizontal space.
  // A parent's subtree width = sum of all its children's subtree widths.
  const swCache: Record<string, number> = {};
  const getSubW = (id: string, visited = new Set<string>()): number => {
    if (swCache[id] !== undefined) return swCache[id];
    if (visited.has(id)) return NW + HG;    // cycle guard
    const nv = new Set(visited); nv.add(id);
    const ch = sortCh(treeChildren[id] || []);
    const w  = ch.length === 0
      ? NW + HG
      : ch.reduce((s, c) => s + getSubW(c, nv), 0);
    return (swCache[id] = w);
  };

  // ── Pass 2: Place each node ───────────────────────────────────────────────────
  // Node centre X = leftEdge + ownSubtreeWidth / 2
  // Children are laid out left→right from leftEdge sequentially.
  type PN = { roleId: string; cx: number; y: number };
  const placed: PN[] = [];
  const pSet = new Set<string>();

  const placeNode = (id: string, depth: number, leftEdge: number) => {
    if (pSet.has(id)) return;
    pSet.add(id);
    const myW = getSubW(id);
    const cx  = leftEdge + myW / 2;
    const y   = PAD + depth * (NH + VG);
    placed.push({ roleId: id, cx, y });
    const ch = sortCh(treeChildren[id] || []);
    let childLeft = leftEdge;
    for (const c of ch) {
      placeNode(c, depth + 1, childLeft);
      childLeft += getSubW(c);
    }
  };

  let rx = PAD;
  for (const rid of rootIds) {
    placeNode(rid, 0, rx);
    rx += getSubW(rid);
  }

  const nm: Record<string, PN> = Object.fromEntries(placed.map(p => [p.roleId, p]));
  const canvasW = Math.max(rx + PAD, 860);
  const canvasH = (placed.length > 0 ? Math.max(...placed.map(p => p.y)) : 0) + NH + PAD * 2;

  // ── SVG connector groups — correct T-bar bracket geometry ────────────────────
  // KEY FIX: barY = parentBottom + VG * 0.5  (fixed midpoint of the gap)
  // — no longer derived from child positions, so it's always accurate.
  type ConnGroup = {
    px: number; py: number;
    barY: number;
    leftX: number; rightX: number;
    kids: { cx: number; cy: number }[];
    single: boolean;
  };
  const connGroups: ConnGroup[] = [];
  for (const [pid, cids] of Object.entries(treeChildren)) {
    const par = nm[pid]; if (!par) continue;
    const kids = sortCh(cids)
      .map(c => nm[c])
      .filter(Boolean)
      .map(k => ({ cx: k.cx, cy: k.y }));   // cy = top of child card
    if (kids.length === 0) continue;
    const parentBottom = par.y + NH;
    const barY   = parentBottom + VG * 0.5;  // ← fixed midpoint
    const leftX  = Math.min(...kids.map(k => k.cx));
    const rightX = Math.max(...kids.map(k => k.cx));
    connGroups.push({ px: par.cx, py: parentBottom, barY, leftX, rightX, kids, single: kids.length === 1 });
  }

  // ── Level → header colour ─────────────────────────────────────────────────────
  const lvColor = (lv?: number): string =>
    lv === 1 ? '#1e3a5f'
    : lv === 2 ? '#2960DC'
    : lv === 3 ? '#0d9488'
    : lv != null && lv < 99 ? '#475569'
    : '#64748B';

  const hasLines = lines.length > 0;

  return (
    <div className="space-y-6">

      {/* ── Header Banner ──────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#2960DC] to-[#1a3fa8] rounded-3xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white to-transparent" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Dynamic Organization Chart</h2>
              <p className="text-blue-200 text-[11px] flex items-center gap-1.5 mt-0.5">
                <Zap className="w-3.5 h-3.5" /> Live Account-Based Matrix Sync
              </p>
            </div>
          </div>
        </div>
        <div className="relative z-10 shrink-0 w-full md:w-[320px]">
          <label className="block text-[10px] font-bold text-blue-200 uppercase tracking-wider mb-1.5">Context Domain Selection</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2960DC]" />
            <select
              value={selectedFacilityId}
              onChange={e => setSelectedFacilityId(e.target.value)}
              className="w-full pl-9 pr-10 py-2.5 bg-white text-slate-800 text-sm font-bold rounded-xl outline-none appearance-none cursor-pointer shadow-md transition-all truncate"
            >
              {allFacilities.map(f => (
                <option key={f.id} value={f.id}>{f.code ? `[${f.code}] ` : ''}{f.title}</option>
              ))}
              {allFacilities.length === 0 && <option value="">No facilities configured</option>}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── Empty State ─────────────────────────────────────────────────────────── */}
      {!hasLines ? (
        <div className="py-20 text-center bg-blue-50/50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-blue-200 dark:border-slate-700">
          <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mx-auto flex items-center justify-center mb-4">
            <GitBranch className="w-8 h-8 text-[#2960DC]" />
          </div>
          <p className="text-lg font-extrabold text-slate-800 dark:text-slate-100">No Reporting Lines Defined</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-2">
            Configure reporting lines in the <strong>Reporting Lines</strong> tab first, then the chart will render here automatically.
          </p>
        </div>
      ) : (

        /* ── Chart Container ──────────────────────────────────────────────────── */
        <div className="bg-slate-50 dark:bg-[#06091a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-inner overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{placed.length} roles</span>
              <span className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#2960DC]">
                <Globe className="w-3 h-3" /> {siteUsers.length} Active Personnel
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setZoom(z => Math.max(0.25, parseFloat((z - 0.1).toFixed(1))))}
                className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center font-bold text-slate-500 hover:text-[#2960DC] hover:border-[#2960DC] transition-colors select-none text-base leading-none"
              >−</button>
              <span className="text-[11px] font-bold text-slate-500 w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom(z => Math.min(2.0, parseFloat((z + 0.1).toFixed(1))))}
                className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center font-bold text-slate-500 hover:text-[#2960DC] hover:border-[#2960DC] transition-colors select-none text-base leading-none"
              >+</button>
              <button
                onClick={() => setZoom(0.82)}
                className="ml-1 px-2.5 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold text-slate-500 hover:text-[#2960DC] hover:border-[#2960DC] transition-colors"
              >Fit</button>
            </div>
          </div>

          {/* Scrollable canvas — outer div provides scroll bounds */}
          <div className="overflow-auto" style={{ maxHeight: '72vh' }}>
            <div style={{ width: canvasW * zoom, height: canvasH * zoom, minWidth: '100%', position: 'relative' }}>
              {/* Inner div is CSS-transform scaled — connector SVG math stays in un-scaled space */}
              <div style={{
                position: 'absolute', top: 0, left: 0,
                width: canvasW, height: canvasH,
                transform: `scale(${zoom})`, transformOrigin: 'top left',
              }}>

                {/* ── SVG: dot-grid background + T-bar connectors ── */}
                <svg
                  width={canvasW} height={canvasH}
                  style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
                >
                  <defs>
                    <pattern id="orgDotGrid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
                      <circle cx="14" cy="14" r="1" fill="#CBD5E1" opacity="0.45" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#orgDotGrid)" />

                  {/* T-bar bracket connectors */}
                  {connGroups.map((g, gi) => (
                    <g key={gi}>
                      {/* ① Vertical: parent bottom-center → bar (or direct to child if single) */}
                      <line
                        x1={g.px} y1={g.py}
                        x2={g.px} y2={g.single ? g.kids[0].cy : g.barY}
                        stroke="#94A3B8" strokeWidth={1.5} strokeLinecap="round"
                      />
                      {/* ② Horizontal bar spanning all children (only drawn when siblings > 1) */}
                      {!g.single && (
                        <line
                          x1={g.leftX} y1={g.barY} x2={g.rightX} y2={g.barY}
                          stroke="#94A3B8" strokeWidth={1.5} strokeLinecap="round"
                        />
                      )}
                      {/* ③ Vertical drops: bar → each child top-center */}
                      {!g.single && g.kids.map((k, ki) => (
                        <line
                          key={ki}
                          x1={k.cx} y1={g.barY}
                          x2={k.cx} y2={k.cy}
                          stroke="#94A3B8" strokeWidth={1.5} strokeLinecap="round"
                        />
                      ))}
                    </g>
                  ))}
                </svg>

                {/* ── Role Node Cards ── */}
                {placed.map(({ roleId, cx, y }) => {
                  const role = roleMap[roleId];
                  if (!role) return null;
                  const lv   = levels[roleId]?.level;
                  const dt   = levels[roleId]?.displayTitle || role.name;
                  const aus  = usersByRole[roleId] || [];
                  const hdrC = lvColor(lv);
                  const initials = (name: string) =>
                    name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

                  return (
                    <div
                      key={roleId}
                      style={{
                        position: 'absolute',
                        left: cx - NW / 2,
                        top: y,
                        width: NW,
                        height: NH,   // ← ENFORCED: keeps connector anchor math accurate
                      }}
                      className="rounded-2xl overflow-hidden shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-default flex flex-col border border-white/60 dark:border-slate-700"
                    >
                      {/* ── Coloured Header Strip (avatar + occupant + display title) ── */}
                      <div
                        className="flex items-center gap-2 px-3 py-2 shrink-0"
                        style={{ background: hdrC }}
                      >
                        <div className="w-8 h-8 rounded-full bg-white/25 border-2 border-white/40 flex items-center justify-center text-[9px] font-extrabold text-white shrink-0 overflow-hidden">
                          {aus[0]?.photo
                            ? <img src={aus[0].photo} className="w-full h-full object-cover" alt="" />
                            : aus[0]
                              ? initials(aus[0].fullName)
                              : <span className="opacity-50">?</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-extrabold text-white leading-tight truncate">
                            {aus[0]?.fullName ?? 'Vacant'}
                          </p>
                          <p className="text-[8px] text-white/70 leading-tight truncate mt-0.5">{dt}</p>
                        </div>
                        {lv != null && lv < 99 && (
                          <span className="shrink-0 text-[7px] font-extrabold bg-white/20 text-white px-1.5 py-0.5 rounded-full border border-white/30">
                            L{lv}
                          </span>
                        )}
                      </div>

                      {/* ── Card Body (role name + scope + additional occupants) ── */}
                      <div className="flex-1 bg-white dark:bg-slate-800 px-3 py-1.5 flex flex-col justify-between min-h-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-[9.5px] font-bold text-slate-700 dark:text-slate-200 leading-snug line-clamp-2 flex-1">
                            {role.name}
                          </p>
                          <div className="shrink-0 mt-0.5"><ScopeBadge scope={role.scope} /></div>
                        </div>

                        {aus.length > 1 && (
                          <div className="flex items-center gap-1 mt-1 overflow-hidden">
                            {aus.slice(1, 3).map(u => (
                              <div key={u.id} className="flex items-center gap-1 min-w-0 shrink-0">
                                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#0d9488] to-[#0f766e] flex items-center justify-center text-[6px] font-extrabold text-white overflow-hidden">
                                  {u.photo
                                    ? <img src={u.photo} className="w-full h-full object-cover" alt="" />
                                    : initials(u.fullName)
                                  }
                                </div>
                                <p className="text-[8px] font-semibold text-slate-400 dark:text-slate-500 truncate max-w-[56px]">
                                  {u.fullName.split(' ')[0]}
                                </p>
                              </div>
                            ))}
                            {aus.length > 3 && (
                              <span className="text-[7px] font-bold text-slate-300 ml-0.5">+{aus.length - 3}</span>
                            )}
                          </div>
                        )}

                        {aus.length === 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-4 h-4 rounded-full border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                              <span className="text-[7px] font-bold text-slate-300">?</span>
                            </div>
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300 dark:text-slate-600">Vacant</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Legend footer */}
          <div className="flex items-center flex-wrap gap-5 px-5 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-800/50">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Authority Level</span>
            {[
              { label: 'L1 · Executive',  color: '#1e3a5f' },
              { label: 'L2 · Director',   color: '#2960DC' },
              { label: 'L3 · Manager',    color: '#0d9488' },
              { label: 'L4+ · Staff',     color: '#475569' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                <span className="text-[9px] font-semibold text-slate-500">{label}</span>
              </div>
            ))}
            {functionalLines.length > 0 && (
              <>
                <span className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                <div className="flex items-center gap-1.5">
                  <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="3 2"/></svg>
                  <span className="text-[9px] font-semibold text-violet-500">{functionalLines.length} Functional Lines</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HIERARCHY TAB ─────────────────────────────────────────────────────────────
function HierarchyTab({ roles }: { roles: Role[] }) {
  const [levels, setLevels] = useState<Record<string, { level: number; displayTitle: string }>>({});
  const [lines, setLines] = useState<ReportingLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // New reporting line form state
  const [newLine, setNewLine] = useState({
    roleId: '', reportsToRoleId: '', reportingType: 'Operational' as 'Operational' | 'Functional', description: ''
  });

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchWithAuth('/api/arh/hierarchy').then(r => r.json());
        // levels
        const lvlMap: Record<string, { level: number; displayTitle: string }> = {};
        for (const l of data.levels || []) {
          lvlMap[l.role_id] = { level: l.hierarchy_level, displayTitle: l.display_title || '' };
        }
        // init all roles at level 99 if not set
        for (const r of roles) {
          if (!lvlMap[r.id]) lvlMap[r.id] = { level: 99, displayTitle: '' };
        }
        setLevels(lvlMap);
        setLines(data.lines || []);
      } finally { setLoading(false); }
    })();
  }, [roles]);

  const saveLevels = async () => {
    setSaving(true);
    try {
      const payload = Object.entries(levels).map(([roleId, v]: [string, any]) => ({
        roleId, level: v.level, displayTitle: v.displayTitle
      }));
      const r = await fetch('/api/arh/hierarchy', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error();
      showToast('success', 'Hierarchy levels saved');
    } catch { showToast('error', 'Failed to save levels'); }
    finally { setSaving(false); }
  };

  const addLine = async () => {
    if (!newLine.roleId || !newLine.reportsToRoleId) {
      showToast('error', 'Please select both roles');
      return;
    }
    if (newLine.roleId === newLine.reportsToRoleId) {
      showToast('error', 'A role cannot report to itself');
      return;
    }
    try {
      const r = await fetchWithAuth('/api/arh/reporting-lines', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: newLine.roleId,
          reportsToRoleId: newLine.reportsToRoleId,
          reportingType: newLine.reportingType,
          description: newLine.description || null
        })
      });
      if (!r.ok) throw new Error();
      // Refresh lines
      const data = await fetchWithAuth('/api/arh/hierarchy').then(r2 => r2.json());
      setLines(data.lines || []);
      setNewLine({ roleId: '', reportsToRoleId: '', reportingType: 'Operational', description: '' });
      showToast('success', `${newLine.reportingType} reporting line added`);
    } catch { showToast('error', 'Failed to add reporting line'); }
  };

  const removeLine = async (id: string) => {
    try {
      await fetchWithAuth(`/api/arh/reporting-lines/${id}`, { method: 'DELETE' });
      setLines(prev => prev.filter(l => l.id !== id));
      showToast('success', 'Reporting line removed');
    } catch { showToast('error', 'Failed to remove line'); }
  };

  // Group lines by role for the matrix visualisation
  const linesByRole = lines.reduce((acc, l) => {
    if (!acc[l.roleId]) acc[l.roleId] = [];
    acc[l.roleId].push(l);
    return acc;
  }, {} as Record<string, ReportingLine[]>);

  // Sort roles by level
  const sortedRoles = [...roles].sort((a, b) => {
    const la = levels[a.id]?.level ?? 99;
    const lb = levels[b.id]?.level ?? 99;
    return la - lb;
  });

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin mr-3" />
      <span>Loading hierarchy data…</span>
    </div>
  );

  return (
    <div className="space-y-8">

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl border text-sm font-semibold animate-in slide-in-from-top-4 duration-300',
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        )}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
          {toast.msg}
        </div>
      )}

      {/* ── SECTION 1: Authority Levels ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100">Authority Levels</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Assign a level to each role. Level 1 = highest authority (e.g. Executive Director). Higher number = lower in hierarchy.</p>
          </div>
          <button onClick={saveLevels} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-[#2960DC] text-white text-sm font-bold rounded-xl hover:bg-[#1a4bb3] transition-colors shadow-sm disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Levels
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            <span className="col-span-1">Level</span>
            <span className="col-span-4">Role</span>
            <span className="col-span-2">Scope</span>
            <span className="col-span-3">Display Title Override</span>
            <span className="col-span-2">Reporting Lines</span>
          </div>
          {sortedRoles.map((role) => {
            const lv = levels[role.id] ?? { level: 99, displayTitle: '' };
            const roleLines = linesByRole[role.id] || [];
            return (
              <div key={role.id} className="grid grid-cols-12 items-center px-5 py-4 border-b border-slate-50 dark:border-slate-800 hover:bg-blue-50/30 dark:hover:bg-slate-700/30 transition-colors">
                {/* Level number input */}
                <div className="col-span-1">
                  <input
                    type="number" min={1} max={99}
                    value={lv.level === 99 ? '' : lv.level}
                    placeholder="—"
                    onChange={e => setLevels(prev => ({
                      ...prev,
                      [role.id]: { ...lv, level: parseInt(e.target.value) || 99 }
                    }))}
                    className="w-14 px-2 py-1.5 text-center text-sm font-bold rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#2960DC]"
                  />
                </div>

                {/* Role name */}
                <div className="col-span-4 ml-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {role.isCoreLocked && <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                    {role.name}
                  </p>
                </div>

                {/* Scope */}
                <div className="col-span-2"><ScopeBadge scope={role.scope} /></div>

                {/* Display title override */}
                <div className="col-span-3">
                  <input
                    type="text"
                    value={lv.displayTitle}
                    placeholder="e.g. Group Function Lead"
                    onChange={e => setLevels(prev => ({
                      ...prev,
                      [role.id]: { ...lv, displayTitle: e.target.value }
                    }))}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-[#2960DC] placeholder-slate-300"
                  />
                </div>

                {/* Reporting lines summary chips */}
                <div className="col-span-2 flex flex-wrap gap-1 pl-2">
                  {roleLines.filter(l => l.reportingType === 'Operational').length > 0 && (
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">◆ Ops</span>
                  )}
                  {roleLines.filter(l => l.reportingType === 'Functional').length > 0 && (
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200">⬡ Func</span>
                  )}
                  {roleLines.length === 0 && <span className="text-[10px] text-slate-300">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ─── REPORTING LINES TAB (NEW) ────────────────────────────────────────────────
function ReportingLinesTab({ roles }: { roles: Role[] }) {
  const [levels, setLevels] = useState<Record<string, { level: number; displayTitle: string }>>({});
  const [lines, setLines] = useState<ReportingLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [newLine, setNewLine] = useState({
    roleId: '', reportsToRoleId: '', reportingType: 'Operational' as 'Operational' | 'Functional', description: ''
  });

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchWithAuth('/api/arh/hierarchy').then(r => r.json());
        const lvlMap: Record<string, { level: number; displayTitle: string }> = {};
        for (const l of data.levels || []) {
          lvlMap[l.role_id] = { level: l.hierarchy_level, displayTitle: l.display_title || '' };
        }
        setLevels(lvlMap);
        setLines(data.lines || []);
      } finally { setLoading(false); }
    })();
  }, [roles]);

  const addLine = async () => {
    if (!newLine.roleId || !newLine.reportsToRoleId) {
      showToast('error', 'Please select both roles');
      return;
    }
    if (newLine.roleId === newLine.reportsToRoleId) {
      showToast('error', 'A role cannot report to itself');
      return;
    }
    try {
      const r = await fetchWithAuth('/api/arh/reporting-lines', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: newLine.roleId,
          reportsToRoleId: newLine.reportsToRoleId,
          reportingType: newLine.reportingType,
          description: newLine.description || null
        })
      });
      if (!r.ok) throw new Error();
      const data = await fetchWithAuth('/api/arh/hierarchy').then(r2 => r2.json());
      setLines(data.lines || []);
      setNewLine({ roleId: '', reportsToRoleId: '', reportingType: 'Operational', description: '' });
      showToast('success', `${newLine.reportingType} reporting line added`);
    } catch { showToast('error', 'Failed to add reporting line'); }
  };

  const removeLine = async (id: string) => {
    try {
      await fetchWithAuth(`/api/arh/reporting-lines/${id}`, { method: 'DELETE' });
      setLines(prev => prev.filter(l => l.id !== id));
      showToast('success', 'Reporting line removed');
    } catch { showToast('error', 'Failed to remove line'); }
  };

  const linesByRole = lines.reduce((acc, l) => {
    if (!acc[l.roleId]) acc[l.roleId] = [];
    acc[l.roleId].push(l);
    return acc;
  }, {} as Record<string, ReportingLine[]>);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin mr-3" />
      <span>Loading reporting lines…</span>
    </div>
  );

  return (
    <div className="space-y-8">
      {toast && (
        <div className={cn('fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl border text-sm font-semibold animate-in slide-in-from-top-4 duration-300',
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800')}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
          {toast.msg}
        </div>
      )}

      {/* Add new line form */}
      <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center">
            <Plus className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">Add Reporting Line</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Connect roles to build your matrix organization chart.</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Subordinate Role <span className="text-red-500">*</span></label>
            <select value={newLine.roleId} onChange={e => setNewLine(p => ({ ...p, roleId: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#2960DC] cursor-pointer">
              <option value="">Select role…</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Reports To <span className="text-red-500">*</span></label>
            <select value={newLine.reportsToRoleId} onChange={e => setNewLine(p => ({ ...p, reportsToRoleId: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#2960DC] cursor-pointer">
              <option value="">Select manager role…</option>
              {roles.filter(r => r.id !== newLine.roleId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Line Type <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              {(['Operational', 'Functional'] as const).map(type => (
                <button key={type} onClick={() => setNewLine(p => ({ ...p, reportingType: type }))}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl border text-[10px] font-extrabold uppercase tracking-wider transition-all',
                    newLine.reportingType === type
                      ? type === 'Operational'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white dark:bg-slate-700 text-slate-500 border-slate-200 dark:border-slate-600 hover:border-slate-400'
                  )}>
                  {type === 'Operational' ? '◆ Ops' : '⬡ Func'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Line Description (optional)</label>
            <input type="text" value={newLine.description} placeholder="e.g. Area Supervisor"
              onChange={e => setNewLine(p => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-[#2960DC] placeholder-slate-400"
            />
          </div>
        </div>

        <button onClick={addLine} disabled={!newLine.roleId || !newLine.reportsToRoleId}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-[#2960DC] text-white text-sm font-bold rounded-xl hover:bg-[#1a4bb3] transition-colors shadow-sm disabled:opacity-50">
          <CheckCircle2 className="w-4 h-4" /> Add Line
        </button>
      </section>

        {/* Existing lines — grouped by role */}
        {lines.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400">
            <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No reporting lines defined yet</p>
            <p className="text-sm mt-1">Add the first one above to start building your matrix structure.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Matrix view — group lines by subordinate role */}
            {Object.entries(linesByRole).map(([roleId, roleLines]) => {
              const role = roles.find(r => r.id === roleId);
              if (!role) return null;
              const lv = levels[roleId]?.level;
              return (
                <div key={roleId} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {/* Role header */}
                  <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700">
                    {role.isCoreLocked && <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                    <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{role.name}</p>
                    <ScopeBadge scope={role.scope} />
                    {lv && lv < 99 && (
                      <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                        Level {lv}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-slate-400">Reports to:</span>
                  </div>

                  {/* Reporting lines */}
                  <div className="divide-y divide-slate-50 dark:divide-slate-800">
                    {roleLines.map(line => (
                      <div key={line.id} className="flex items-center gap-4 px-5 py-3">
                        <span className={cn(
                          'text-[9px] font-extrabold uppercase tracking-widest px-2 py-1.5 rounded-lg border shrink-0 min-w-[80px] text-center',
                          line.reportingType === 'Functional'
                            ? 'bg-violet-50 border-violet-200 text-violet-700'
                            : 'bg-blue-50 border-blue-200 text-blue-700'
                        )}>
                          {line.reportingType === 'Functional' ? '⬡ Functional' : '◆ Operational'}
                        </span>
                        <ArrowRightCircle className="w-4 h-4 text-slate-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{line.reports_to_name}</p>
                          {line.description && <p className="text-xs text-slate-400">{line.description}</p>}
                        </div>
                        <ScopeBadge scope={line.reports_to_scope} />
                        <button onClick={() => removeLine(line.id)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ─── CATEGORIES TAB ────────────────────────────────────────────────────────────
function CategoriesTab() {
  const [categories, setCategories] = useState<ActionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', icon_name: 'MessageSquare', color: '#2960DC', sort_order: 0 });

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg }); setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchWithAuth('/api/arh/admin/categories').then(r => r.json()).then(d => { setCategories(d); setLoading(false); });
  }, []);

  const save = async () => {
    try {
      if (editId) {
        await fetchWithAuth(`/api/arh/admin/categories/${editId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, active: true })
        });
        setCategories(prev => prev.map(c => c.id === editId ? { ...c, ...form } : c));
        showToast('success', 'Category updated');
      } else {
        const r = await fetchWithAuth('/api/arh/admin/categories', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        const newCat = await r.json();
        setCategories(prev => [...prev, newCat]);
        showToast('success', 'Category added');
      }
      setEditId(null);
      setForm({ name: '', description: '', icon_name: 'MessageSquare', color: '#2960DC', sort_order: 0 });
    } catch { showToast('error', 'Failed to save'); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this action category?')) return;
    await fetchWithAuth(`/api/arh/admin/categories/${id}`, { method: 'DELETE' });
    setCategories(prev => prev.filter(c => c.id !== id));
    showToast('success', 'Category deleted');
  };

  const startEdit = (cat: ActionCategory) => {
    setEditId(cat.id);
    setForm({ name: cat.name, description: cat.description, icon_name: cat.icon_name, color: cat.color, sort_order: cat.sort_order });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      {toast && (
        <div className={cn('fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl border text-sm font-semibold',
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800')}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
          {toast.msg}
        </div>
      )}

      {/* Form */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">{editId ? 'Edit Category' : 'New Category'}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <input type="text" placeholder="Category name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#2960DC]" />
          <input type="text" placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            className="px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#2960DC]" />
          <input type="text" placeholder="Lucide icon name (e.g. CheckCircle)" value={form.icon_name} onChange={e => setForm(p => ({ ...p, icon_name: e.target.value }))}
            className="px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#2960DC]" />
          <div className="flex gap-3">
            <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
              className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-600 cursor-pointer p-1" />
            <input type="number" placeholder="Sort order" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
              className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#2960DC]" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="flex items-center gap-2 px-5 py-2.5 bg-[#2960DC] text-white text-sm font-bold rounded-xl hover:bg-[#1a4bb3] transition-colors shadow-sm">
            <Save className="w-4 h-4" />{editId ? 'Update' : 'Add Category'}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ name: '', description: '', icon_name: 'MessageSquare', color: '#2960DC', sort_order: 0 }); }}
              className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {categories.map(cat => {
          // @ts-ignore
          const CatIco = Icons[cat.icon_name] || Icons.MessageSquare;
          return (
            <div key={cat.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex items-start gap-4 hover:border-[#2960DC]/40 transition-all">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: cat.color + '20' }}>
                <CatIco className="w-5 h-5" style={{ color: cat.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{cat.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{cat.description}</p>
                <span className="text-[10px] font-mono text-slate-300 dark:text-slate-600">{cat.icon_name} · sort {cat.sort_order}</span>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEdit(cat)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#2960DC] hover:bg-blue-50 transition-colors">
                  <Settings className="w-4 h-4" />
                </button>
                <button onClick={() => del(cat.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export function ActionHubAdmin() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('orgchart');
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    fetchWithAuth('/api/roles').then(r => r.json()).then((d: Role[]) => {
      setRoles(d.filter(r => r.active).sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-[#2960DC] px-6 py-4 flex items-center gap-4 shadow-xl sticky top-0 z-50">
        <button onClick={() => navigate('/action-hub')} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-extrabold text-white">ARH Configuration</h1>
          <p className="text-xs text-blue-100">Action Routing Hub — Admin Settings</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-blue-200 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
          <Shield className="w-3.5 h-3.5" />
          Additive only — existing systems are not modified
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6">
        <div className="flex gap-1">
          {TABS.map(tab => {
            const Ico = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-2 transition-all',
                  activeTab === tab.id
                    ? 'border-[#2960DC] text-[#2960DC] dark:text-[#4F84F6]'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
                )}>
                <Ico className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'orgchart' && <OrgChartTab roles={roles} />}
        {activeTab === 'lines' && <ReportingLinesTab roles={roles} />}
        {activeTab === 'levels' && <HierarchyTab roles={roles} />}
        {activeTab === 'categories' && <CategoriesTab />}
      </main>
    </div>
  );
}
