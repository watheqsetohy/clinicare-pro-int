import { useState } from "react";
import { X, History, User, ArrowRight, FileText, CheckCircle2, Clock, ShieldAlert, Plus, Trash2, ChevronDown, Search, Calendar, AlertCircle, Pill, Activity, Stethoscope, Building2 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { SnomedBrowser } from "@/src/pages/SnomedBrowser";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  medicationBrand: string;
}

// Mock Data for Dose History
const mockDoseHistory = [
  {
    id: 1,
    date: "Oct 24, 2023 09:30",
    prevDose: "5mg",
    newDose: "10mg",
    routeFreq: "PO Daily",
    source: "Pharmacist Edit",
    author: "Dr. John Doe",
    context: "MTM Session #1023"
  },
  {
    id: 2,
    date: "Sep 15, 2023 14:15",
    prevDose: "2.5mg",
    newDose: "5mg",
    routeFreq: "PO Daily",
    source: "HIS Import",
    author: "Dr. Sarah Connor",
    context: "Cardiology Follow-up"
  },
  {
    id: 3,
    date: "Aug 01, 2023 10:00",
    prevDose: "-",
    newDose: "2.5mg",
    routeFreq: "PO Daily",
    source: "HIS Import",
    author: "Dr. Sarah Connor",
    context: "Initial Prescription"
  }
];

// Mock Data for Notes History
const mockNotesHistory = [
  {
    id: 1,
    date: "Oct 24, 2023 09:35",
    author: "Dr. John Doe",
    type: "Recommendation",
    status: "Sent",
    content: "Titrated to 10mg. Monitor BP and renal function. Patient reports occasional dry cough."
  },
  {
    id: 2,
    date: "Oct 10, 2023 11:20",
    author: "Dr. John Doe",
    type: "Counseling",
    status: "Completed",
    content: "Discussed importance of adherence and potential side effects (dizziness, cough)."
  },
  {
    id: 3,
    date: "Sep 15, 2023 14:20",
    author: "System",
    type: "Override Rationale",
    status: "Acknowledged",
    content: "Override DDI Alert: Benefit outweighs risk. Monitoring plan in place."
  }
];

export function DoseHistoryDrawer({ isOpen, onClose, medicationBrand }: DrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-[1px] z-[60]" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-[#2960DC]" />
              Dose History
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Timeline for {medicationBrand}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="relative border-l border-slate-200 ml-3 space-y-8">
            {mockDoseHistory.map((item, idx) => (
              <div key={item.id} className="relative pl-6">
                {/* Timeline Dot */}
                <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full border-2 border-white bg-[#2960DC] shadow-sm ring-1 ring-slate-200" />
                
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {item.date}
                  </span>
                  
                  <div className="mt-1 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="text-slate-500">{item.prevDose}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[#2960DC]">{item.newDose}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 font-medium">{item.routeFreq}</p>
                    
                    <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <ShieldAlert className="w-3 h-3" />
                        Source: <span className="text-slate-700">{item.source}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <User className="w-3 h-3" />
                        {item.author}
                      </div>
                      {item.context && (
                        <div className="text-[10px] text-slate-400 mt-0.5 pl-4.5">
                          Context: {item.context}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

interface NotesHistoryDrawerProps extends DrawerProps {
  history: any[];
}

export function NotesHistoryDrawer({ isOpen, onClose, medicationBrand, history }: NotesHistoryDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-[1px] z-[60]" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2960DC]" />
              Notes & Recommendations
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Log for {medicationBrand}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-slate-100 flex gap-2 overflow-x-auto no-scrollbar">
          {["All", "Recommendations", "Counseling", "Follow-up"].map((filter, i) => (
            <button 
              key={filter}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                i === 0 
                  ? "bg-[#2960DC] text-white" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-4">
            {history.map((note) => (
              <div key={note.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                    note.type === "Recommendation" ? "bg-purple-100 text-purple-800" :
                    note.type === "Counseling" ? "bg-blue-100 text-blue-800" :
                    "bg-orange-100 text-orange-800"
                  )}>
                    {note.type}
                  </span>
                  <span className="text-[10px] text-slate-400">{note.date}</span>
                </div>
                
                <p className="text-sm text-slate-700 leading-relaxed mb-3">
                  {note.content}
                </p>
                
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <User className="w-3 h-3" />
                    {note.author}
                  </div>
                  {note.status && (
                    <div className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <CheckCircle2 className="w-3 h-3" />
                      {note.status}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

interface InstructionHistoryDrawerProps extends DrawerProps {
  history: any[];
}

export function InstructionHistoryDrawer({ isOpen, onClose, medicationBrand, history }: InstructionHistoryDrawerProps) {
  const [filter, setFilter] = useState<'All' | 'EN' | 'AR'>('All');

  if (!isOpen) return null;

  const filteredHistory = history.filter(item => 
    filter === 'All' ? true : item.language === filter
  );

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[1px] z-[60]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-[#2960DC]" />
              Instruction History
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">For {medicationBrand}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex gap-2">
          {(['All', 'EN', 'AR'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                filter === f ? "bg-[#2960DC] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {f === 'All' ? 'All' : f === 'EN' ? 'English' : 'Arabic'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {filteredHistory.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                  item.language === 'EN' ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                )}>
                  {item.language}
                </span>
                <span className="text-[10px] text-slate-400">{item.date}</span>
              </div>
              <p className="text-sm text-slate-800 mb-2">{item.instruction}</p>
              {item.goal && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 p-2 rounded">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Goal: {item.goal}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-400">
                <User className="w-3 h-3" />
                {item.author}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// --- Add Instruction Drawer ---

interface AddInstructionDrawerProps extends DrawerProps {
  onSave: (instruction: string, language: string, goal: string) => void;
}

export function AddInstructionDrawer({ isOpen, onClose, medicationBrand, onSave }: AddInstructionDrawerProps) {
  const [language, setLanguage] = useState<'EN' | 'AR'>('EN');
  const [instruction, setInstruction] = useState('');
  const [goal, setGoal] = useState('');

  if (!isOpen) return null;

  const handleSave = () => {
    if (!instruction.trim()) return;
    onSave(instruction, language, goal);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[1px] z-[60]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#2960DC]" />
              Add Patient Instruction
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">For {medicationBrand}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Language <span className="text-red-500">*</span></label>
            <select 
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'EN' | 'AR')}
            >
              <option value="EN">English</option>
              <option value="AR">Arabic</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Instruction <span className="text-red-500">*</span></label>
            <textarea 
              className="w-full p-3 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 min-h-[120px] resize-none"
              placeholder="Enter patient instructions here..."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Goal (Optional)</label>
            <input 
              type="text" 
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="e.g., Control BP < 130/80"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
        </div>

        <div className="p-5 border-t border-slate-200 bg-white flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!instruction.trim()}
            className="px-6 py-2 bg-[#2960DC] text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Instruction
          </button>
        </div>
      </div>
    </>
  );
}
// --- Add Recommendation Drawer ---

type Recommendation = {
  id: string;
  type: 'medication' | 'monitoring' | 'referral';
  summary: string;
};

type Problem = {
  id: string;
  snomedTerm: string;
  recommendations: Recommendation[];
  priority: string;
  reference: string;
  followUpDate: string;
  description?: string;
};

interface AddRecommendationDrawerProps extends DrawerProps {
  patientId: string;
  sessionId?: string | null;
  onSaved?: (items: any[]) => void;
}

export function AddRecommendationDrawer({ isOpen, onClose, medicationBrand, patientId, sessionId, onSaved }: AddRecommendationDrawerProps) {
  const [problems, setProblems] = useState<Problem[]>([
    { id: '1', snomedTerm: '', recommendations: [], priority: '', reference: '', followUpDate: '', description: '' }
  ]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Sub-modal state
  const [isRecModalOpen, setIsRecModalOpen] = useState(false);
  const [activeProblemId, setActiveProblemId] = useState<string | null>(null);
  
  // SNOMED Modal state
  const [showSnomedModal, setShowSnomedModal] = useState(false);
  const [snomedTargetProblemId, setSnomedTargetProblemId] = useState<string | null>(null);
  
  // Rec modal form state
  const [recType, setRecType] = useState<{
    medication: boolean;
    monitoring: boolean;
    referral: boolean;
  }>({ medication: false, monitoring: false, referral: false });
  const [medActionType, setMedActionType] = useState<'Modify Dose' | 'Discontinue'>('Modify Dose');
  
  const openSnomedBrowser = (problemId: string) => {
    setSnomedTargetProblemId(problemId);
    setShowSnomedModal(true);
  };

  const handleSnomedSelect = (concept: any) => {
    if (snomedTargetProblemId) {
      updateProblem(snomedTargetProblemId, 'snomedTerm', concept.term);
    }
    setShowSnomedModal(false);
    setSnomedTargetProblemId(null);
  };

  if (!isOpen) return null;

  const addProblem = () => {
    const newId = (problems.length + 1).toString();
    setProblems([...problems, { id: newId, snomedTerm: '', recommendations: [], priority: '', reference: '', followUpDate: '', description: '' }]);
  };

  const removeProblem = (id: string) => {
    if (problems.length > 1) {
      setProblems(problems.filter(p => p.id !== id));
    }
  };

  const updateProblem = (id: string, field: keyof Problem, value: any) => {
    setProblems(problems.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const openRecModal = (problemId: string) => {
    setActiveProblemId(problemId);
    setRecType({ medication: false, monitoring: false, referral: false });
    setIsRecModalOpen(true);
  };

  const saveRecommendation = () => {
    if (!activeProblemId) return;

    const newRecs: Recommendation[] = [];
    if (recType.medication) newRecs.push({ id: Date.now().toString() + 'm', type: 'medication', summary: medActionType });
    if (recType.monitoring) newRecs.push({ id: Date.now().toString() + 'l', type: 'monitoring', summary: 'Lab / Non-Lab Monitoring' });
    if (recType.referral) newRecs.push({ id: Date.now().toString() + 'r', type: 'referral', summary: 'Referral to Specialist' });

    setProblems(problems.map(p => {
      if (p.id === activeProblemId) {
        return { ...p, recommendations: [...p.recommendations, ...newRecs] };
      }
      return p;
    }));

    setIsRecModalOpen(false);
  };

  const handleSaveSession = async () => {
    setIsSaving(true);
    try {
      const activeSession = sessionId || 'S1'; // Fallback to S1 for mock purposes if none selected
      
      let savedItems = [];

      for (const problem of problems) {
        if (!problem.snomedTerm && !problem.reference && problem.recommendations.length === 0) continue;

        if (problem.recommendations.length === 0) {
          const detailStr = (problem.snomedTerm ? `Problem: ${problem.snomedTerm}` : "General Note") + (problem.description ? `\nSummary: ${problem.description}` : '');
          await fetch(`/api/patients/${patientId}/recommendations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: activeSession,
              action: "Recommendations / Follow-up",
              detail: detailStr,
              target: "Patient",
              priority: problem.priority || 'Routine',
              due_date: problem.followUpDate || new Date().toISOString(),
              status: 'Draft',
              evidence: problem.reference ? [problem.reference] : []
            })
          });
          savedItems.push({
             type: "Recommendation",
             content: detailStr
          });
        }

        for (const rec of problem.recommendations) {
          // Map to recommendation table schema
          let target = "Patient";
          if (rec.type === 'referral') target = "Physician";
          if (rec.type === 'monitoring') target = "Nurse";
          
          await fetch(`/api/patients/${patientId}/recommendations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: activeSession,
              action: rec.summary,
              detail: `Problem: ${problem.snomedTerm}. ${rec.type.toUpperCase()}` + (problem.description ? `\nSummary: ${problem.description}` : ''),
              target: target,
              priority: problem.priority || 'Routine',
              due_date: problem.followUpDate || new Date().toISOString(),
              status: 'Draft',
              evidence: problem.reference ? [problem.reference] : []
            })
          });
          savedItems.push({
             type: "Recommendation",
             content: `Problem: ${problem.snomedTerm}. ${rec.type.toUpperCase()} - ${rec.summary}` + (problem.description ? `\nSummary: ${problem.description}` : '')
          });
        }
      }
      if (onSaved) onSaved(savedItems);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-[1px] z-[60]" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-[70] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-slate-900 text-lg">Add Follow-Up & Recommendation</h3>
              <p className="text-sm text-slate-500 mt-1">Linked to: <span className="font-medium text-blue-700">{medicationBrand || "General Patient Level"}</span></p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-4 mt-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {new Date().toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Pharmacist (Me)
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-slate-500" />
                Problems
              </h4>
              <button 
                onClick={addProblem}
                className="text-xs font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Problem
              </button>
            </div>

            {problems.map((problem, index) => (
              <div key={problem.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Problem #{index + 1}</span>
                  {problems.length > 1 && (
                    <button onClick={() => removeProblem(problem.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* A1: SNOMED CT */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Problem (SNOMED CT)</label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <button 
                      onClick={() => openSnomedBrowser(problem.id)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-left hover:bg-slate-50 outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      {problem.snomedTerm ? (
                        <span className="text-slate-900 font-medium">{problem.snomedTerm}</span>
                      ) : (
                        <span className="text-slate-400">Search SNOMED CT problems...</span>
                      )}
                    </button>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Problem Summary / Narrative */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Summary / Notes</label>
                  <textarea 
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 resize-none min-h-[60px]"
                    placeholder="Briefly describe clinical findings or rationale..."
                    value={problem.description || ''}
                    onChange={(e) => updateProblem(problem.id, 'description', e.target.value)}
                  />
                </div>

                {/* A2: Recommendations */}
                <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recommendations</label>
                    <button 
                      onClick={() => openRecModal(problem.id)}
                      className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Recommendation
                    </button>
                  </div>
                  
                  {problem.recommendations.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No recommendations added yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {problem.recommendations.map(rec => (
                        <div key={rec.id} className="bg-white border border-slate-200 px-2 py-1 rounded text-xs font-medium text-slate-700 flex items-center gap-2 shadow-sm">
                          {rec.type === 'medication' && <Pill className="w-3 h-3 text-purple-500" />}
                          {rec.type === 'monitoring' && <Activity className="w-3 h-3 text-blue-500" />}
                          {rec.type === 'referral' && <Building2 className="w-3 h-3 text-emerald-500" />}
                          {rec.summary}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* A3: Priority */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Priority</label>
                    <select 
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      value={problem.priority}
                      onChange={(e) => updateProblem(problem.id, 'priority', e.target.value)}
                    >
                      <option value="">Select...</option>
                      <option value="Low">Low</option>
                      <option value="Mid">Mid</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>

                  {/* A5: Follow-Up Date */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Next Follow-Up</label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input 
                        type="date" 
                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
                        value={problem.followUpDate}
                        onChange={(e) => updateProblem(problem.id, 'followUpDate', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* A4: Reference */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Reference / Citation</label>
                  <input 
                    type="text" 
                    placeholder="e.g., JNC 8 Guidelines, Hospital Protocol..."
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    value={problem.reference}
                    onChange={(e) => updateProblem(problem.id, 'reference', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-200 bg-white flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSaveSession}
            disabled={isSaving}
            className="px-6 py-2 bg-[#2960DC] text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Session"}
          </button>
        </div>
      </div>

      {/* Add Recommendation Sub-Modal */}
      {isRecModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-900">Add Recommendation</h3>
              <button onClick={() => setIsRecModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              {/* Level 1: Medications */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={recType.medication}
                    onChange={(e) => setRecType({...recType, medication: e.target.checked})}
                  />
                  <Pill className="w-4 h-4 text-purple-500" />
                  Medication Change
                </label>
                {recType.medication && (
                  <div className="ml-6 p-3 bg-purple-50 rounded-lg border border-purple-100 text-sm space-y-2">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="radio" 
                          name="medAction" 
                          className="text-purple-600" 
                          checked={medActionType === 'Modify Dose'}
                          onChange={() => setMedActionType('Modify Dose')}
                        /> Modify
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="radio" 
                          name="medAction" 
                          className="text-purple-600" 
                          checked={medActionType === 'Discontinue'}
                          onChange={() => setMedActionType('Discontinue')}
                        /> Discontinue
                      </label>
                    </div>
                    <input type="text" placeholder="New Dose / Freq..." className="w-full p-2 bg-white border border-purple-200 rounded text-sm" />
                  </div>
                )}
              </div>

              {/* Level 2: Monitoring */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={recType.monitoring}
                    onChange={(e) => setRecType({...recType, monitoring: e.target.checked})}
                  />
                  <Activity className="w-4 h-4 text-blue-500" />
                  Monitoring
                </label>
                {recType.monitoring && (
                  <div className="ml-6 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm space-y-2">
                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <input type="checkbox" /> Lab Monitoring
                      </label>
                      <input type="text" placeholder="Test Name (e.g. K+, SCr)..." className="w-full p-2 bg-white border border-blue-200 rounded text-xs" />
                    </div>
                    <div className="space-y-1 pt-1 border-t border-blue-200/50">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <input type="checkbox" /> Non-Lab Monitoring
                      </label>
                      <input type="text" placeholder="Checklist (e.g. BP, symptoms)..." className="w-full p-2 bg-white border border-blue-200 rounded text-xs" />
                    </div>
                  </div>
                )}
              </div>

              {/* Level 3: Referral */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={recType.referral}
                    onChange={(e) => setRecType({...recType, referral: e.target.checked})}
                  />
                  <Building2 className="w-4 h-4 text-emerald-500" />
                  Referral
                </label>
                {recType.referral && (
                  <div className="ml-6 p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-sm space-y-2">
                    <select className="w-full p-2 bg-white border border-emerald-200 rounded text-sm">
                      <option>Select Target...</option>
                      <option>PCP / GP</option>
                      <option>Cardiologist</option>
                      <option>Endocrinologist</option>
                      <option>Emergency Dept</option>
                    </select>
                    <textarea placeholder="Referral Note..." className="w-full p-2 bg-white border border-emerald-200 rounded text-sm h-16 resize-none"></textarea>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button onClick={() => setIsRecModalOpen(false)} className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded text-sm font-medium">Cancel</button>
              <button onClick={saveRecommendation} className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded text-sm font-medium">Add Selected</button>
            </div>
          </div>
        </div>
      )}
      {/* SNOMED Full Screen Modal Overlay */}
      {showSnomedModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">SNOMED CT Clinical Knowledge Browser</h3>
                <p className="text-sm text-slate-500">Search and map clinical problems for the recommendation.</p>
              </div>
              <button 
                onClick={() => {
                  setShowSnomedModal(false);
                  setSnomedTargetProblemId(null);
                }}
                className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                title="Close Browser"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden relative">
               <SnomedBrowser onSelect={handleSnomedSelect} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
