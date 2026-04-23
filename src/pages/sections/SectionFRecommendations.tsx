import { useState, useEffect } from "react";
import { fetchWithAuth } from '../../lib/authSession';
import { Plus, CheckCircle2, Clock, AlertTriangle, MessageSquare, Link as LinkIcon, Calendar, ArrowRight, User, Stethoscope, Pill } from "lucide-react";
import { cn } from "@/src/lib/utils";

export function SectionFRecommendations({ patientId, activeSessionId, isHistoricalSession }: { patientId: string, activeSessionId?: string | null, isHistoricalSession?: boolean }) {
  const [viewMode, setViewMode] = useState("table");
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    fetchWithAuth(`/api/patients/${patientId}/recommendations`)
      .then(res => res.json())
      .then(data => setRecommendations(data))
      .catch(err => console.error(err));
  }, [patientId]);

  const displayedRecommendations = isHistoricalSession && activeSessionId
    ? recommendations.filter(r => r.session_id === activeSessionId)
    : recommendations;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Recommendations & Follow-up</h2>
          <p className="text-sm text-slate-500">Actionable care plan, communication, and tracking</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm">
            <Calendar className="w-4 h-4" />
            Schedule Follow-up
          </button>
          <button 
            disabled={!activeSessionId || isHistoricalSession}
            title={!activeSessionId ? "Please Start a Visit or select an Active Session to add recommendations" : isHistoricalSession ? "Cannot edit during an archived session view" : "Add Recommendation"}
            className={cn(
               "px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm",
               activeSessionId && !isHistoricalSession ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-300 text-slate-500 cursor-not-allowed"
            )}
          >
            <Plus className="w-4 h-4" />
            New Recommendation
          </button>
        </div>
      </div>

      {/* View Toggle & Filters */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              viewMode === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Table View
          </button>
          <button
            onClick={() => setViewMode("kanban")}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              viewMode === "kanban" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Kanban Board
          </button>
        </div>
        
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="text-slate-600 font-medium">Urgent</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <span className="text-slate-600 font-medium">Routine</span>
          </div>
        </div>
      </div>

      {/* Table View */}
      {viewMode === "table" && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4">Action / Detail</th>
                  <th className="px-6 py-4">Target</th>
                  <th className="px-6 py-4">Priority & Due</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Evidence</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRecommendations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center bg-slate-50">
                      <AlertTriangle className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
                      <h3 className="text-sm font-semibold text-slate-600">No recommendations found</h3>
                      {isHistoricalSession && <p className="text-xs text-slate-500 mt-1">There were no recommendations recorded during this session.</p>}
                    </td>
                  </tr>
                )}
                {displayedRecommendations.map(rec => (
                  <tr key={rec.id} className={cn(
                    "hover:bg-slate-50/50 transition-colors group",
                    activeSessionId && rec.session_id === activeSessionId ? "bg-blue-50/30" : ""
                  )}>
                    <td className="px-6 py-4 max-w-md">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-semibold text-slate-900">{rec.action}</div>
                        {activeSessionId && rec.session_id === activeSessionId && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase font-bold">This Session</span>
                        )}
                      </div>
                      <div className="text-slate-600 leading-relaxed">{rec.detail}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {rec.target === "Physician" ? <Stethoscope className="w-4 h-4 text-blue-600" /> :
                         rec.target === "Patient" ? <User className="w-4 h-4 text-emerald-600" /> :
                         <Pill className="w-4 h-4 text-purple-600" />}
                        <span className="font-medium text-slate-700">{rec.target}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full w-fit",
                          rec.priority === "Urgent" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                        )}>
                          {rec.priority === "Urgent" && <AlertTriangle className="w-3 h-3" />}
                          {rec.priority}
                        </span>
                        <span className="text-slate-500 flex items-center gap-1 text-xs">
                          <Clock className="w-3 h-3" />
                          {rec.dueDate}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          rec.status === "Completed" ? "bg-emerald-500" :
                          rec.status === "Sent" ? "bg-blue-500" :
                          rec.status === "Acknowledged" ? "bg-purple-500" :
                          "bg-slate-400"
                        )}></div>
                        <span className="font-medium text-slate-700">{rec.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {rec.evidence.map((ev, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200 hover:bg-slate-200 cursor-pointer transition-colors">
                            <LinkIcon className="w-3 h-3" />
                            {ev}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-slate-400 hover:text-blue-600 transition-colors relative" title="Communication Thread">
                        <MessageSquare className="w-5 h-5" />
                        {rec.thread > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {rec.thread}
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kanban View (Placeholder) */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {["Draft", "Sent", "Acknowledged", "Completed"].map(status => (
            <div key={status} className="bg-slate-100/50 rounded-xl p-4 border border-slate-200 flex flex-col h-[600px]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-slate-800 uppercase tracking-wider text-sm">{status}</h3>
                <span className="bg-white text-slate-500 text-xs font-bold px-2 py-1 rounded-full shadow-sm border border-slate-200">
                  {displayedRecommendations.filter(r => r.status === status).length}
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3">
                {displayedRecommendations.filter(r => r.status === status).length === 0 && isHistoricalSession && (
                  <div className="text-xs text-slate-400 italic text-center py-4">No records.</div>
                )}
                {displayedRecommendations.filter(r => r.status === status).map(rec => (
                  <div key={rec.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
                    <div className="flex justify-between items-start mb-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                        rec.priority === "Urgent" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                      )}>
                        {rec.priority}
                      </span>
                      {rec.thread > 0 && (
                        <span className="flex items-center gap-1 text-xs text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded">
                          <MessageSquare className="w-3 h-3" /> {rec.thread}
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-slate-900 text-sm mb-1">{rec.action}</h4>
                    <p className="text-xs text-slate-600 line-clamp-2 mb-3">{rec.detail}</p>
                    
                    <div className="flex justify-between items-center text-xs text-slate-500 pt-3 border-t border-slate-100">
                      <span className="flex items-center gap-1 font-medium">
                        {rec.target === "Physician" ? <Stethoscope className="w-3 h-3" /> :
                         rec.target === "Patient" ? <User className="w-3 h-3" /> :
                         <Pill className="w-3 h-3" />}
                        {rec.target}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {rec.dueDate}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
