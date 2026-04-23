import { useState, useEffect } from "react";
import { fetchWithAuth } from '../lib/authSession';
import { useParams } from "react-router-dom";
import { 
  AlertCircle, 
  Activity, 
  FileText, 
  CheckSquare, 
  Pill, 
  Stethoscope,
  Share2,
  FileDown,
  X
} from "lucide-react";
import { cn } from "@/src/lib/utils";

// Placeholder components for sections
import { SectionAConditions } from "./sections/SectionAConditions";
import { SectionBMedications } from "./sections/SectionBMedications";
import { SectionCLabs } from "./sections/SectionCLabs";
import { SectionDReports } from "./sections/SectionDReports";
import { SectionFRecommendations } from "./sections/SectionFRecommendations";
import { DemographicsPanel } from "@/src/components/patient/DemographicsPanel";
import { FamilyHistoryPanel } from "@/src/components/patient/FamilyHistoryPanel";

export function Workspace() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("medications");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [patientData, setPatientData] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      // Fetch Demographics
      fetchWithAuth(`/api/patients/${id}`)
        .then(res => res.json())
        .then(data => setPatientData(data))
        .catch(err => console.error(err));

      // Fetch Sessions History
      fetchWithAuth(`/api/patients/${id}/sessions`)
        .then(res => res.json())
        .then(data => {
          setSessions(data);
          // Auto-select the first open session if it exists
          const openSession = data.find((s: any) => s.status === 'Open');
          if (openSession) setActiveSessionId(openSession.id);
        })
        .catch(err => console.error(err));
    }
  }, [id]);

  const currentSession = sessions.find(s => s.id === activeSessionId);
  const isSessionOpen = currentSession?.status === 'Open';
  const isHistoricalSession = activeSessionId ? currentSession?.status !== 'Open' : false;

  const handleToggleVisit = async () => {
    if (isSessionOpen && currentSession) {
      try {
         await fetchWithAuth(`/api/patients/${id}/sessions/${currentSession.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Archived' })
         });
         setSessions(sessions.map(s => s.id === currentSession.id ? { ...s, status: 'Archived' } : s));
         setActiveSessionId(null);
      } catch (e) {
         console.error(e);
      }
    } else {
      try {
        const res = await fetchWithAuth(`/api/patients/${id}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'MTM Review Session', notes: 'Automated Visit' })
        });
        if (res.ok) {
          const newSession = await res.json();
          setSessions([newSession, ...sessions]);
          setActiveSessionId(newSession.id);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (!patientData) {
    return <div className="flex items-center justify-center h-full bg-slate-50 text-slate-500 font-medium">Loading Workspace...</div>;
  }

  const tabs = [
    { id: "conditions", label: "Medical History", icon: Stethoscope },
    { id: "medications", label: "Medications", icon: Pill },
    { id: "labs", label: "Labs & Trends", icon: Activity },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "recommendations", label: "Recommendations", icon: CheckSquare },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Patient Identity */}
          <div className="flex items-start lg:items-center gap-4">
            <div 
              className="w-12 h-12 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-xl cursor-pointer hover:bg-blue-200 transition-colors"
              onClick={() => setIsProfileOpen(true)}
              title="View Profile"
            >
              ER
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900">{patientData.name}</h1>
                <span className="text-sm font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{patientData.mrn}</span>
                <span className="text-sm font-medium text-slate-600">{patientData.age}y • {patientData.sex}</span>
              </div>
              
              {/* Clinical Badges */}
              <div className="flex flex-wrap gap-2 mt-1.5">
                {patientData.alerts?.map((badge: string, i: number) => (
                  <span 
                    key={i} 
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                      "bg-amber-100 text-amber-800 border border-amber-200"
                    )}
                  >
                    <AlertCircle className="w-3 h-3" />
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Actions & Session Selector */}
          <div className="flex items-center gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 flex flex-col items-start min-w-[200px]">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Clinical Encounter Context</span>
              <select 
                value={activeSessionId || "all"} 
                onChange={(e) => setActiveSessionId(e.target.value === "all" ? null : e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-blue-700 focus:outline-none cursor-pointer appearance-none -ml-1"
              >
                 <option value="all">Longitudinal View (All Data)</option>
                 {sessions.map(s => (
                   <option key={s.id} value={s.id}>
                     {new Date(s.date).toLocaleDateString()} {s.status === 'Open' ? '• Active Session' : '• Archived'}
                   </option>
                 ))}
              </select>
            </div>
            
            <button 
              onClick={handleToggleVisit} 
              className={cn(
                "px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shrink-0",
                isSessionOpen ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {isSessionOpen ? "End Visit" : "Start Visit"}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 flex gap-6 border-t border-slate-100 bg-slate-50/50 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors",
                activeTab === tab.id 
                  ? "border-blue-600 text-blue-700" 
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Scrollable Workspace Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          {activeTab === "conditions" && <SectionAConditions patientId={id!} activeSessionId={activeSessionId} isHistoricalSession={isHistoricalSession} />}
          {activeTab === "medications" && <SectionBMedications patientId={id!} activeSessionId={activeSessionId} isHistoricalSession={isHistoricalSession} />}
          {activeTab === "labs" && <SectionCLabs />}
          {activeTab === "reports" && <SectionDReports />}
          {activeTab === "recommendations" && <SectionFRecommendations patientId={id!} activeSessionId={activeSessionId} isHistoricalSession={isHistoricalSession} />}
        </div>
      </div>

      {/* Profile Drawer Overlay */}
      {isProfileOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-slate-900">Patient Profile</h2>
              <button 
                onClick={() => setIsProfileOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {/* Demographics */}
              <div className="mb-8">
                <DemographicsPanel patientId={id!} />
              </div>

              {/* Family History */}
              <div>
                <FamilyHistoryPanel patientId={id!} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
