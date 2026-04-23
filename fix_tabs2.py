import sys
import re

with open('src/pages/sections/SectionAConditions.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Locate the index of the string
start_idx = c.find('<div className="bg-white border text-sm border-slate-200 rounded-xl p-4 shadow-sm relative">')
end_idx = c.find('<div className="border-t border-slate-100 pt-6">')

if start_idx != -1 and end_idx != -1:
    repl = """<div className="bg-white border text-sm border-slate-200 rounded-xl p-4 shadow-sm relative flex flex-col">
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
                     </div>
                  """
    
    new_c = c[:start_idx] + repl + c[end_idx:]
    with open('src/pages/sections/SectionAConditions.tsx', 'w', encoding='utf-8') as f:
        f.write(new_c)
    print("Replaced Successfully By Index")
else:
    print("Could not find start or end index")
