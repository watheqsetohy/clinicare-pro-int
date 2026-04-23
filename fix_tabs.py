import sys

with open('src/pages/sections/SectionAConditions.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

target = """                     <div className="bg-white border text-sm border-slate-200 rounded-xl p-4 shadow-sm relative">
                        {isLoadingLogs ? (
                          <div className="animate-pulse flex flex-col gap-4">
                            {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded"></div>)}
                          </div>
                        ) : expandedConditionLogs.length > 0 ? (
                          <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-slate-100">
                            {expandedConditionLogs.map((log: any, idx: number) => (
                              <div key={idx} className="relative pl-8">
                                <div className="absolute left-0 top-1 w-[24px] h-[24px] bg-slate-100 border-[3px] border-white rounded-full z-10 flex items-center justify-center">
                                  <div className={cn("w-2 h-2 rounded-full", log.isOnset ? "bg-indigo-600 scale-125" : log.action.includes('Active') ? "bg-emerald-500" : log.action.includes('Deactivate') ? "bg-amber-500" : "bg-blue-500")} />
                                </div>
                                <div className="text-[10px] text-slate-400 mb-0.5">{new Date(log.date).toLocaleString()} • {log.isOnset ? 'Historical Origin' : log.user || 'Clinician'}</div>
                                <div className="text-sm font-semibold text-slate-800 leading-tight">{log.action}</div>
                                {log.condition_term && (
                                  <div className={cn("text-[10px] uppercase mt-0.5", log.condition_code === flyoutCondition.snomed_code ? "text-blue-600 font-bold" : "font-bold text-slate-400")}>
                                    {log.condition_term}
                                  </div>
                                )}
                                {log.note && <div className="text-sm text-slate-600 mt-1 italic whitespace-pre-wrap">"{log.note}"</div>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="italic text-slate-400">No activity logged for this disease cluster.</span>
                        )}
                     </div>"""

repl = """                     <div className="bg-white border text-sm border-slate-200 rounded-xl p-4 shadow-sm relative flex flex-col">
                        <div className="flex bg-slate-100 p-1 rounded-lg mb-4 text-xs font-semibold">
                          <button onClick={() => setLogViewTab('chronological')} className={cn("flex-1 py-1.5 rounded-md flex justify-center items-center gap-2 transition-colors", logViewTab === 'chronological' ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                             <Activity className="w-3.5 h-3.5" /> Chronological History
                          </button>
                          <button onClick={() => setLogViewTab('audit')} className={cn("flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-colors", logViewTab === 'audit' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                             <Server className="w-3.5 h-3.5" /> System Audit Log
                          </button>
                        </div>
                        {isLoadingLogs ? (
                          <div className="animate-pulse flex flex-col gap-4">
                            {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded"></div>)}
                          </div>
                        ) : expandedConditionLogs.length > 0 ? (() => {
                          const sortedLogs = [...expandedConditionLogs].sort((a,b) => {
                             if (logViewTab === 'chronological') {
                               return new Date(a.date).getTime() - new Date(b.date).getTime();
                             } else {
                               return new Date(b.system_date || b.date).getTime() - new Date(a.system_date || a.date).getTime();
                             }
                          });
                          
                          const filteredLogs = logViewTab === 'chronological' 
                                ? sortedLogs.filter(log => !log.action.includes('Deactivate') && !log.action.includes('Activated') && log.action !== 'Added as Inactive')
                                : sortedLogs;

                          return filteredLogs.length > 0 ? (
                            <div className={cn("space-y-4 relative before:absolute before:inset-y-0 before:left-[11px] before:w-[2px]", logViewTab === 'chronological' ? "before:bg-indigo-100" : "before:bg-slate-100")}>
                              {filteredLogs.map((log: any, idx: number) => (
                                <TimelineLogItem key={idx} log={log} logViewTab={logViewTab} flyoutCondition={flyoutCondition} />
                              ))}
                            </div>
                          ) : (
                            <span className="italic text-slate-400 text-center py-4 block">No clinical observations found for biological timeline.</span>
                          );
                        })() : (
                          <span className="italic text-slate-400 text-center py-4 block">No activity logged for this disease cluster.</span>
                        )}
                     </div>"""

if target in c:
    c = c.replace(target, repl)
    with open('src/pages/sections/SectionAConditions.tsx', 'w', encoding='utf-8') as f:
        f.write(c)
    print("Replaced Successfully")
else:
    print("Target string not found in file")
