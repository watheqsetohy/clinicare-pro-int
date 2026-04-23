const fs = require('fs');
const file = 'd:/Healthcare Solutions/MTM Project/MTM/src/pages/ActionHubAdmin.tsx';
let txt = fs.readFileSync(file, 'utf8');

const startMatch = '// ─── ORG CHART / HIERARCHY VIEW TAB ───────────────────────────────────────────';
const endMatch = '// ─── HIERARCHY TAB ─────────────────────────────────────────────────────────────';

const startIdx = txt.indexOf(startMatch);
const endIdx = txt.indexOf(endMatch);
if (startIdx === -1 || endIdx === -1) {
  console.log('Not found boundaries'); process.exit(1);
}

const replacement = `// ─── ORG CHART / HIERARCHY VIEW TAB ───────────────────────────────────────────
function OrgChartTab({ roles }: { roles: Role[] }) {
  const [levels, setLevels] = useState<Record<string, { level: number; displayTitle: string }>>({});
  const [lines, setLines] = useState<ReportingLine[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Data for Account-Based mapping
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [corpTree, setCorpTree] = useState<CorporateNode[]>([]);
  const [allFacilities, setAllFacilities] = useState<{id: string, title: string, code?: string}[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [hierData, dbUsers, treeData] = await Promise.all([
          fetch('/api/arh/hierarchy').then(r => r.json()),
          getUsers(),
          getCorporateTree()
        ]);
        
        const lvlMap: Record<string, { level: number; displayTitle: string }> = {};
        for (const l of hierData.levels || []) {
          lvlMap[l.role_id] = { level: l.hierarchy_level, displayTitle: l.display_title || '' };
        }
        setLevels(lvlMap);
        setLines(hierData.lines || []);
        
        setUsers(dbUsers);
        setCorpTree(treeData);
        
        // Extract flat list of facilities
        const facs: {id: string, title: string, code?: string}[] = [];
        const walkF = (nodes: CorporateNode[]) => {
          for (const n of nodes) {
            if (n.facilityCode || n.type === 'Facility') facs.push({ id: n.id, title: n.title, code: n.facilityCode });
            if (n.children) walkF(n.children);
          }
        };
        walkF(treeData);
        setAllFacilities(facs.sort((a,b) => a.title.localeCompare(b.title)));
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

  // Calculate Site Personnel
  const isFacilityAssigned = (userNodeIds: string[], targetFacilityId: string, tree: CorporateNode[]) => {
    if (userNodeIds.includes('Global')) return true; // Global users are in all sites
    const walk = (nodes: CorporateNode[], collecting: boolean): boolean => {
      for (const node of nodes) {
        const shouldCollect = collecting || userNodeIds.includes(node.id);
        if (shouldCollect && node.id === targetFacilityId) return true;
        if (node.children && walk(node.children, shouldCollect)) return true;
      }
      return false;
    };
    return walk(tree, false);
  };

  const siteUsers = users.filter(u => u.status !== 'Suspended' && isFacilityAssigned(u.corporateNodeIds, selectedFacilityId, corpTree));
  const usersByRole: Record<string, UserProfile[]> = {};
  for (const u of siteUsers) {
    if (!usersByRole[u.roleId]) usersByRole[u.roleId] = [];
    usersByRole[u.roleId].push(u);
  }

  // Build hierarchy tree
  const treeChildren: Record<string, string[]> = {};
  const treeParent:   Record<string, string>   = {};

  for (const line of lines) {
    if (line.reportingType === 'Operational') {
      if (!treeChildren[line.reportsToRoleId]) treeChildren[line.reportsToRoleId] = [];
      treeChildren[line.reportsToRoleId].push(line.roleId);
      treeParent[line.roleId] = line.reportsToRoleId;
    }
  }

  // Fallback Functional parents
  for (const line of lines) {
    if (line.reportingType === 'Functional' && !treeParent[line.roleId]) {
      if (!treeChildren[line.reportsToRoleId]) treeChildren[line.reportsToRoleId] = [];
      treeChildren[line.reportsToRoleId].push(line.roleId);
      treeParent[line.roleId] = line.reportsToRoleId;
    }
  }

  // Root = active roles with no tree parent, sort by level
  const rootIds = roles
    .filter(r => !treeParent[r.id])
    .sort((a, b) => (levels[a.id]?.level ?? 99) - (levels[b.id]?.level ?? 99))
    .map(r => r.id);

  // User Profile Element
  const UserBadgeCard = ({ user }: { user: UserProfile }) => (
    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 pr-4 rounded-xl shadow-sm min-w-[200px] hover:border-[#2960DC] transition-colors relative z-10">
      <div className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-[#2960DC] to-[#1a3fa8] text-white flex items-center justify-center font-extrabold text-[10px] shrink-0 overflow-hidden">
        {user.photo ? <img src={user.photo} className="w-full h-full object-cover"/> : user.fullName.split(' ').map(w=>w[0]).join('').substring(0, 2).toUpperCase()}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="font-bold text-slate-800 dark:text-slate-100 text-[11px] truncate leading-tight">{user.fullName}</span>
        <span className="text-[9px] font-medium text-slate-400 truncate leading-tight">@{user.loginId}</span>
      </div>
    </div>
  );

  // ── Recursive Tree Renderer ───────────────
  const TreeNode = ({ roleId, depth = 0, visited = new Set<string>() }: { roleId: string; depth?: number; visited?: Set<string> }) => {
    if (visited.has(roleId)) return null;
    const nextVisited = new Set(visited); nextVisited.add(roleId);
    
    // Sort children
    const children = Array.from(new Set(treeChildren[roleId] || []))
      .sort((a, b) => {
        const la = levels[a]?.level ?? 99;
        const lb = levels[b]?.level ?? 99;
        return la !== lb ? la - lb : (roleMap[a]?.name || '').localeCompare(roleMap[b]?.name || '');
      });

    const role = roleMap[roleId];
    if (!role) return null;
    
    const lv = levels[roleId]?.level;
    const displayTitle = levels[roleId]?.displayTitle || role.name;
    const hasChildren = children.length > 0;
    const assignedUsers = usersByRole[roleId] || [];

    const lvColor =
      lv === 1 ? 'bg-amber-500 text-white border-amber-600'
             : lv === 2 ? 'bg-blue-500 text-white border-blue-600'
             : lv === 3 ? 'bg-[#2960DC] text-white border-[#1a4bb3]'
             : lv != null && lv < 99 ? 'bg-slate-500 text-white'
             : 'bg-slate-200 text-slate-600';

    return (
      <div className="flex flex-col relative">
        <div className="flex items-start gap-4 my-2 relative z-10" style={{ marginLeft: \`\${depth * 2}rem\` }}>
          
          {/* Connector Line Logic (Left hook pointing right) */}
          {depth > 0 && (
            <div className="absolute w-6 h-px bg-slate-300 dark:bg-slate-600 top-5 -left-8" />
          )}

          {/* Vertical Hierarchy Post */}
          {hasChildren && (
            <div className="absolute w-px bg-slate-300 dark:bg-slate-600 top-10 bottom-[-1rem] left-5" />
          )}

          {/* Role Header Column */}
          <div className="w-[220px] shrink-0 bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 p-3 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-2">
              <div className={cn('text-[9px] font-extrabold px-2 py-0.5 rounded shadow-sm shrink-0 border', lvColor)}>
                {lv != null && lv < 99 ? \`L\${lv}\` : 'L-'}
              </div>
              <ScopeBadge scope={role.scope} />
            </div>
            <p className="font-bold text-slate-800 dark:text-slate-100 text-[11px] leading-snug">{displayTitle}</p>
            {displayTitle !== role.name && <p className="text-[9px] text-slate-400 truncate mt-0.5">{role.name}</p>}
          </div>

          {/* Assigned Personnel Array Bracket */}
          <div className="flex flex-wrap gap-2 py-1.5 border-l-2 border-[#2960DC] border-dashed pl-4 ml-2">
            {assignedUsers.length > 0 ? (
              assignedUsers.map(u => <UserBadgeCard key={u.id} user={u} />)
            ) : (
              <div className="flex items-center gap-2 bg-white dark:bg-slate-800/30 border border-dashed border-slate-300 dark:border-slate-700 p-1.5 px-3 rounded-xl">
                <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-slate-400">?</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vacant Position</span>
              </div>
            )}
          </div>
        </div>

        {/* Children Rows */}
        {hasChildren && (
          <div className="relative">
            <div className="flex flex-col">
              {children.map((childId, idx) => {
                const isLast = idx === children.length - 1;
                return (
                  <div key={childId} className="relative">
                    <TreeNode roleId={childId} depth={depth + 1} visited={nextVisited} />
                    {/* Corner masking to disconnect vertical overflow beyond the last child */}
                    {isLast && (
                       <div className="absolute w-2 h-full bg-slate-50 dark:bg-[#0B1120] bottom-0 z-0" style={{ left: \`\${depth * 2 + 1}rem\`, top: '2rem' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const hasLines = lines.length > 0;

  return (
    <div className="space-y-6">
      
      {/* Dynamic Site Header */}
      <div className="bg-gradient-to-br from-[#2960DC] to-[#1a3fa8] rounded-3xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white to-transparent" />
        <div className="relative z-10 w-full md:w-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Dynamic Organization Chart</h2>
              <p className="text-blue-200 text-[11px] flex items-center gap-1.5 mt-0.5">
                <Zap className="w-3.5 h-3.5" /> 
                Live Account-Based Matrix Sync
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
               className="w-full pl-9 pr-10 py-2.5 bg-white text-slate-800 text-sm font-bold rounded-xl outline-none appearance-none cursor-pointer shadow-md focus:ring-4 focus:ring-white/20 transition-all truncate"
             >
               {allFacilities.map(f => (
                 <option key={f.id} value={f.id}>
                   {f.code ? \`[\${f.code}] \` : ''}{f.title}
                 </option>
               ))}
               {allFacilities.length === 0 && <option value="">No facilities mapped in Enterprise</option>}
             </select>
             <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {!hasLines ? (
        <div className="py-20 text-center bg-blue-50/50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-blue-200 dark:border-slate-700">
          <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mx-auto flex items-center justify-center mb-4">
            <GitBranch className="w-8 h-8 text-[#2960DC]" />
          </div>
          <p className="text-lg font-extrabold text-slate-800 dark:text-slate-100">No Reporting Lines Defined</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-2">
            Configure matrix lines first to synthesize the organizational structure.
          </p>
        </div>
      ) : (
        <div className="bg-slate-50/50 dark:bg-[#0B1120] rounded-3xl border border-slate-200 dark:border-slate-800 overflow-x-auto shadow-inner p-6 min-h-[600px] relative">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200 dark:border-slate-800">
             <div className="flex items-center gap-4">
               <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                 <span className="w-5 h-0.5 bg-slate-300 dark:bg-slate-600 inline-block" /> Vertical Branch Path
               </div>
               <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                 <span className="w-1 h-4 border-l-2 border-[#2960DC] border-dashed inline-block" /> Personnel Scope Container
               </div>
             </div>
             <p className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] shadow-sm font-bold uppercase text-[#2960DC] tracking-widest">
               <Globe className="w-3.5 h-3.5" />
               Site Population: {siteUsers.length} Active
             </p>
          </div>
          
          <div className="flex flex-col px-4 min-w-[700px]">
             {/* Dynamic Organizational Root Start */}
            {rootIds.map(id => (
              <TreeNode key={id} roleId={id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
`;

txt = txt.slice(0, startIdx) + replacement + '\n' + txt.slice(endIdx);
fs.writeFileSync(file, txt, 'utf8');
console.log('Successfully replaced OrgChartTab component using JS');
