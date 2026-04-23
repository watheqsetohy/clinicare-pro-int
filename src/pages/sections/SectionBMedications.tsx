import { useState, useEffect } from "react";
import { fetchWithAuth } from '../../lib/authSession';
import { Plus, Search, AlertTriangle, Clock, Info, CheckCircle2, XCircle, Pill, Edit3, Trash2, FileText, Activity, Calendar, User, Building2, ArrowRight, History, ScrollText } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { DoseHistoryDrawer, NotesHistoryDrawer, AddRecommendationDrawer, InstructionHistoryDrawer, AddInstructionDrawer } from "./MedicationDrawers";

const mockSessions = [
  {
    id: "S1",
    type: "Discharge Medication List",
    date: "Oct 12, 2023 14:30",
    department: "Internal Medicine",
    prescriber: "Dr. Sarah Connor",
    pharmacist: "John Smith, PharmD",
    count: 8,
    status: "Reconciled"
  },
  {
    id: "S2",
    type: "OPD Visit Prescription",
    date: "Sep 05, 2023 09:15",
    department: "Cardiology",
    prescriber: "Dr. James Bond",
    facility: "Heart Center Clinic",
    meds: [
      { id: "HM4", name: "Metoprolol Succinate 25mg ER", sig: "1 tab PO daily", status: "Active" }
    ]
  },
  {
    id: "S3",
    type: "ER Visit",
    date: "Aug 20, 2023 22:45",
    department: "Emergency",
    prescriber: "Dr. Gregory House",
    facility: "Main Hospital",
    meds: [
      { id: "HM5", name: "Ondansetron 4mg ODT", sig: "1 tab PO Q8H PRN nausea", status: "Completed" },
      { id: "HM6", name: "Acetaminophen 500mg", sig: "2 tabs PO Q6H PRN pain", status: "Completed" }
    ]
  }
];

export function SectionBMedications({ patientId, activeSessionId, isHistoricalSession }: { patientId: string, activeSessionId?: string | null, isHistoricalSession?: boolean }) {
  const [medications, setMedications] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    fetchWithAuth(`/api/patients/${patientId}/medications`)
      .then(res => res.json())
      .then(data => setMedications(data))
      .catch(err => console.error(err));
  }, [patientId]);
  const [importStep, setImportStep] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [activeDrawer, setActiveDrawer] = useState<{ type: 'dose' | 'notes' | 'add-rec' | 'instruction-history' | 'add-instruction', medId: string } | null>(null);

  const [instructionHistory, setInstructionHistory] = useState<any[]>([
    { id: 1, medId: "HM1", date: "Oct 20, 2023 10:00", author: "Dr. John Doe", language: "EN", instruction: "Take 1 tablet by mouth daily with food to prevent stomach upset. Do not crush or chew.", goal: "Control BP < 130/80" },
    { id: 2, medId: "HM1", date: "Sep 15, 2023 09:30", author: "Dr. Sarah Connor", language: "AR", instruction: "تناول قرص واحد عن طريق الفم يومياً مع الطعام. لا تقم بسحق أو مضغ القرص.", goal: "التحكم في ضغط الدم" }
  ]);

  const [notesHistory, setNotesHistory] = useState<any[]>([
    { id: 1, medId: "HM1", date: "Oct 24, 2023 09:35", author: "Dr. John Doe", type: "Recommendation", status: "Sent", content: "Titrated to 10mg. Monitor BP and renal function. Patient reports occasional dry cough." },
    { id: 2, medId: "HM1", date: "Oct 10, 2023 11:20", author: "Dr. John Doe", type: "Counseling", status: "Completed", content: "Discussed importance of adherence and potential side effects (dizziness, cough)." },
    { id: 3, medId: "HM1", date: "Sep 15, 2023 14:20", author: "System", type: "Override Rationale", status: "Acknowledged", content: "Override DDI Alert: Benefit outweighs risk. Monitoring plan in place." }
  ]);

  const selectedSession = mockSessions.find(s => s.id === selectedSessionId);

  const displayedMedications = isHistoricalSession && activeSessionId 
    ? medications.filter(m => m.session_id === activeSessionId)
    : medications;

  const handleSaveInstruction = (medId: string, newInstruction: string, language: string, goal: string) => {
    // 1. Update the active medication card
    setMedications(prev => prev.map(med => {
      if (med.id === medId) {
        return { ...med, instructions: newInstruction };
      }
      return med;
    }));
    
    // 2. Append to Instruction History
    setInstructionHistory(prev => [
      {
        id: Date.now(),
        medId: medId,
        date: new Date().toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
        author: "Pharmacist (Me)",
        language,
        instruction: newInstruction,
        goal
      },
      ...prev
    ]);
  };

  const handleSessionSelect = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setImportStep(2);
    setSelectedMeds([]);
  };

  const toggleMedSelection = (medId: string) => {
    if (selectedMeds.includes(medId)) {
      setSelectedMeds(selectedMeds.filter(id => id !== medId));
    } else {
      setSelectedMeds([...selectedMeds, medId]);
    }
  };

  const resetModal = () => {
    setIsAddModalOpen(false);
    setImportStep(1);
    setSelectedSessionId(null);
    setSelectedMeds([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Medication Review</h2>
          <p className="text-sm text-slate-500">Pharmacist-editable MTM fields + CDSS</p>
        </div>
        <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
          <button className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm">
            <FileText className="w-4 h-4" />
            Counseling Script
          </button>
          <button 
            onClick={() => setActiveDrawer({ type: 'add-rec', medId: '' })}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm"
          >
            <AlertTriangle className="w-4 h-4" />
            Follow-Up & Recommendations
          </button>
          <button 
            disabled={!activeSessionId || isHistoricalSession}
            onClick={() => setIsAddModalOpen(true)}
            className={cn(
              "px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm",
              activeSessionId && !isHistoricalSession ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-300 text-slate-500 cursor-not-allowed"
            )}
            title={!activeSessionId ? "Please Start a Visit to document clinical changes" : isHistoricalSession ? "Cannot edit during an archived session view" : "Add Medication"}
          >
            <Plus className="w-4 h-4" />
            Add Medication
          </button>
        </div>
      </div>

      {/* Medication Cards */}
      <div className="space-y-4">
        {displayedMedications.length === 0 && (
          <div className="text-center py-10 bg-slate-50 border border-slate-200 rounded-xl">
             <Pill className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
             <h3 className="text-sm font-semibold text-slate-600">No medications found</h3>
             {isHistoricalSession && <p className="text-xs text-slate-500 mt-1">There were no medications prescribed or modified during this session.</p>}
          </div>
        )}
        {displayedMedications.map(med => (
          <div key={med.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row transition-shadow hover:shadow-md">
            
            {/* Left: Thumbnail & Basic Info */}
            <div className="p-5 border-b md:border-b-0 md:border-r border-slate-100 md:w-1/3 shrink-0 bg-slate-50/50 flex gap-4">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <Pill className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg leading-tight">{med.brand}</h3>
                <p className="text-sm text-slate-600 mt-1">{med.clinicalDrug}</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                    med.tag === "Chronic" ? "bg-purple-100 text-purple-800" : "bg-orange-100 text-orange-800"
                  )}>
                    {med.tag}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                    {med.status}
                  </span>
                  <span className="text-xs text-slate-400 font-mono ml-auto">RxNorm: {med.rxNorm}</span>
                </div>
              </div>
            </div>

            {/* Middle: Clinical Details */}
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dosing</span>
                      <button 
                        onClick={() => setActiveDrawer({ type: 'dose', medId: med.id })}
                        className="text-[#2960DC] hover:bg-blue-50 p-1 rounded-full transition-colors"
                        title="Dose History"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-slate-900 mt-0.5">{med.dosing}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Indications</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {med.indications.map((ind, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                          {ind}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Patient Instructions</span>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setActiveDrawer({ type: 'instruction-history', medId: med.id })}
                        className="text-[#2960DC] hover:bg-blue-50 p-1 rounded-full transition-colors"
                        title="Instruction History"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setActiveDrawer({ type: 'add-instruction', medId: med.id })}
                        className="text-[#2960DC] hover:bg-blue-50 p-1 rounded-full transition-colors"
                        title="Add New Instruction"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 mt-0.5 italic">"{med.instructions}"</p>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pharmacy Notes & Recommendations</span>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setActiveDrawer({ type: 'add-rec', medId: med.id })}
                        className="text-[#2960DC] hover:bg-blue-50 p-1 rounded-full transition-colors"
                        title="Add Follow-Up / Recommendation"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setActiveDrawer({ type: 'notes', medId: med.id })}
                        className="text-[#2960DC] hover:bg-blue-50 p-1 rounded-full transition-colors"
                        title="All Notes & Recommendations"
                      >
                        <ScrollText className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-800 mt-0.5 bg-yellow-50/50 p-2 rounded border border-yellow-100/50">
                    {notesHistory.find(n => n.medId === med.id && n.type === "Recommendation")?.content || med.recommendations || "No recommendations recorded."}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100">
                <button className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
                <button className="text-xs font-medium text-red-600 hover:text-red-800 flex items-center gap-1 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Deactivate
                </button>
                <button className="text-xs font-medium text-slate-600 hover:text-slate-800 flex items-center gap-1 transition-colors ml-auto">
                  <Activity className="w-3.5 h-3.5" /> Timeline
                </button>
              </div>
            </div>

            {/* Right: CDSS Alerts */}
            <div className="p-5 border-t md:border-t-0 md:border-l border-slate-100 md:w-64 shrink-0 bg-slate-50/30">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> CDSS Alerts
              </h4>
              <div className="space-y-2">
                {med.cdss.map((alert, i) => (
                  <div key={i} className={cn(
                    "p-2.5 rounded-lg border text-sm relative group cursor-help",
                    alert.type === "danger" ? "bg-red-50 border-red-200 text-red-900" :
                    alert.type === "warn" ? "bg-amber-50 border-amber-200 text-amber-900" :
                    "bg-blue-50 border-blue-200 text-blue-900"
                  )}>
                    <div className="font-semibold flex items-center gap-1.5 mb-1">
                      {alert.type === "danger" ? <XCircle className="w-4 h-4 text-red-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                      {alert.label}
                    </div>
                    <p className="text-xs opacity-90 leading-relaxed">{alert.detail}</p>
                    
                    {/* Hover detail tooltip */}
                    <div className="absolute top-full left-0 mt-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <p className="font-semibold mb-1">Alert Logic Triggered:</p>
                      <p className="text-slate-300">{alert.detail}</p>
                      <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between">
                        <button className="text-blue-400 hover:text-blue-300 font-medium">Override</button>
                        <span className="text-slate-500">Source: First Databank</span>
                      </div>
                    </div>
                  </div>
                ))}
                {med.cdss.length === 0 && (
                  <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    No active alerts
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* History Drawers */}
      {activeDrawer?.type === 'dose' && (
        <DoseHistoryDrawer 
          isOpen={true} 
          onClose={() => setActiveDrawer(null)} 
          medicationBrand={medications.find(m => m.id === activeDrawer.medId)?.brand || 'Medication'} 
        />
      )}
      
      {activeDrawer?.type === 'notes' && (
        <NotesHistoryDrawer 
          isOpen={true} 
          onClose={() => setActiveDrawer(null)} 
          medicationBrand={medications.find(m => m.id === activeDrawer.medId)?.brand || 'Medication'} 
          history={notesHistory.filter(n => n.medId === activeDrawer.medId || n.medId === '')}
        />
      )}

      {activeDrawer?.type === 'add-rec' && (
        <AddRecommendationDrawer 
          isOpen={true} 
          onClose={() => setActiveDrawer(null)} 
          medicationBrand={activeDrawer.medId ? (medications.find(m => m.id === activeDrawer.medId)?.brand || "") : ""}
          patientId={patientId}
          sessionId={selectedSessionId}
          onSaved={(items: any[]) => {
            if (items && items.length > 0) {
              setNotesHistory(prev => [
                ...items.map((item, idx) => ({
                  id: Date.now() + idx,
                  medId: activeDrawer.medId,
                  date: new Date().toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
                  author: "Pharmacist (Me)",
                  type: item.type,
                  status: "Draft",
                  content: item.content
                })),
                ...prev
              ]);
            }
          }}
        />
      )}

      {activeDrawer?.type === 'instruction-history' && (
        <InstructionHistoryDrawer 
          isOpen={activeDrawer?.type === 'instruction-history'} 
          onClose={() => setActiveDrawer(null)}
          medicationBrand={medications.find(m => m.id === activeDrawer?.medId)?.brand || ""}
          history={instructionHistory.filter(h => h.medId === activeDrawer?.medId)}
        />
      )}

      {activeDrawer?.type === 'add-instruction' && (
        <AddInstructionDrawer 
          isOpen={true} 
          onClose={() => setActiveDrawer(null)} 
          medicationBrand={medications.find(m => m.id === activeDrawer.medId)?.brand || 'Medication'} 
          onSave={(instruction, language, goal) => handleSaveInstruction(activeDrawer.medId, instruction, language, goal)}
        />
      )}

      {/* Add Medication Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-semibold text-slate-900">Add Medication</h2>
              <button onClick={resetModal} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Path 1: Import from HIS (Session-Based) */}
              <div className="flex-1 p-6 border-r border-slate-200 overflow-y-auto flex flex-col">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  Import from HIS
                </h3>
                
                {importStep === 1 ? (
                  <div className="space-y-4 flex-1">
                    <p className="text-sm text-slate-500">Step 1: Select an encounter context to view orders.</p>
                    <div className="space-y-3">
                      {mockSessions.map(session => (
                        <div 
                          key={session.id}
                          onClick={() => handleSessionSelect(session.id)}
                          className="p-4 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer transition-all group"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-slate-900">{session.type}</h4>
                            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md group-hover:bg-white">
                              {session.date}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              {session.facility}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              {session.prescriber}
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-blue-600 font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            Select Session <ArrowRight className="w-3 h-3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-2">
                      <button 
                        onClick={() => setImportStep(1)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1"
                      >
                        ← Back to Sessions
                      </button>
                    </div>
                    
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm mb-2">
                      <div className="font-semibold text-slate-900">{selectedSession?.type}</div>
                      <div className="text-slate-500 text-xs mt-1">
                        {selectedSession?.date} • {selectedSession?.prescriber}
                      </div>
                    </div>

                    <p className="text-sm text-slate-500">Step 2: Select medications to import.</p>
                    
                    <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg">
                      {selectedSession?.meds.map(med => (
                        <div 
                          key={med.id}
                          onClick={() => toggleMedSelection(med.id)}
                          className={cn(
                            "p-3 border-b border-slate-100 last:border-0 cursor-pointer flex items-start gap-3 transition-colors",
                            selectedMeds.includes(med.id) ? "bg-blue-50" : "hover:bg-slate-50"
                          )}
                        >
                          <div className={cn(
                            "w-5 h-5 rounded border flex items-center justify-center mt-0.5 transition-colors",
                            selectedMeds.includes(med.id) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white"
                          )}>
                            {selectedMeds.includes(med.id) && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{med.name}</p>
                            <p className="text-xs text-slate-500">{med.sig}</p>
                            <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                              {med.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button 
                      disabled={selectedMeds.length === 0}
                      className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      Import {selectedMeds.length} Selected
                    </button>
                  </div>
                )}
              </div>

              {/* Path 2: Add from scratch */}
              <div className="flex-1 p-6 overflow-y-auto bg-slate-50/50">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Pill className="w-5 h-5 text-purple-600" />
                  Add Manual Entry
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Search Medication</label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input 
                        type="text" 
                        placeholder="Brand or generic name..." 
                        className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all outline-none text-sm"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Dose</label>
                      <input type="text" className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none text-sm" placeholder="e.g., 10mg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Route</label>
                      <select className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none text-sm">
                        <option>PO (Oral)</option>
                        <option>IV (Intravenous)</option>
                        <option>SC (Subcutaneous)</option>
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
                    <input type="text" className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none text-sm" placeholder="e.g., Daily, BID, TID" />
                  </div>
                  
                  <button className="w-full py-2.5 bg-purple-50 text-purple-700 font-medium rounded-lg border border-purple-200 hover:bg-purple-100 transition-colors text-sm">
                    Continue to Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
