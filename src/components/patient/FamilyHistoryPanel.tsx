import { useState, useEffect } from "react";
import { fetchWithAuth } from '../../lib/authSession';
import { Plus, CheckCircle2, XCircle, Clock, AlertTriangle, User, ChevronRight, Save } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { SnomedBrowser } from "@/src/pages/SnomedBrowser";

interface FamilyHistoryEntry {
  id: string;
  patient_id: string;
  relative: string;
  condition: string;
  onset_age: string;
  severity: string;
  status: string;
  source: string;
  snomed_code: string;
  timestamp: string;
}

export function FamilyHistoryPanel({ patientId }: { patientId: string }) {
  const [history, setHistory] = useState<FamilyHistoryEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  
  // Modal tracking
  const [step, setStep] = useState<1 | 2>(1); // 1 = SNOMED search, 2 = Details form
  const [newEntry, setNewEntry] = useState<{
    snomed_code: string;
    condition: string;
    relative: string;
    onset_age: string;
    severity: string;
    source: "Manual" | "HIS";
  } | null>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetchWithAuth(`/api/patients/${patientId}/family_history`);
      if (res.ok) setHistory(await res.json());
    } catch(e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [patientId]);

  const handleSnomedSelect = (concept: any) => {
    setNewEntry({
      snomed_code: concept.conceptId,
      condition: concept.term,
      relative: "", // Not mandatory
      onset_age: "",
      severity: "Unknown",
      source: "Manual"
    });
    setStep(2);
  };

  const handleSave = async () => {
    if (!newEntry) return;
    try {
      const res = await fetchWithAuth(`/api/patients/${patientId}/family_history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry)
      });
      if (res.ok) {
        setIsAdding(false);
        setStep(1);
        setNewEntry(null);
        fetchHistory();
      }
    } catch(e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          Family History
          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {history.length} records
          </span>
        </h3>
        <button 
          onClick={() => { setIsAdding(true); setStep(1); setNewEntry(null); }}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 hover:bg-blue-50 rounded"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {history.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No family history documented.</p>
        ) : (
          history.map((entry) => (
            <div key={entry.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-200 transition-colors group relative">
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-slate-900 text-sm flex items-center gap-2">
                  <User className="w-3 h-3 text-slate-400" />
                  {entry.relative || "Unknown Relative"}
                </span>
                <span className="text-xs text-slate-500">
                  {entry.onset_age && entry.onset_age !== 'Unknown' ? `Onset: ${entry.onset_age}y` : "Onset: Unknown"}
                </span>
              </div>
              <p className="text-sm text-slate-800 font-bold">{entry.condition}</p>
              <div className="mt-2 flex justify-between items-center text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  Severity: <span className={cn(
                    "font-semibold",
                    entry.severity === 'Severe' ? "text-red-600" :
                    entry.severity === 'Moderate' ? "text-amber-600" :
                    "text-blue-600"
                  )}>{entry.severity}</span>
                </span>
                <span className={cn(
                  "px-1.5 py-0.5 rounded font-medium text-[10px] uppercase tracking-wider",
                  entry.source === "HIS" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                )}>
                  {entry.source}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Modal */}
      {isAdding && step === 1 && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex justify-center py-10 px-4">
           <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-full overflow-hidden flex flex-col relative shadow-2xl ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-200">
             <button 
               onClick={() => setIsAdding(false)} 
               className="absolute top-4 right-4 z-50 text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 rounded-full p-1.5 shadow-sm border border-slate-200 transition-colors"
             >
                <XCircle className="w-5 h-5" />
             </button>
             <SnomedBrowser 
               isModal 
               onSelect={handleSnomedSelect} 
               onClose={() => setIsAdding(false)} 
             />
           </div>
        </div>
      )}

      {isAdding && step === 2 && newEntry && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold text-sm">2</div>
                <div>
                  <h3 className="font-semibold text-slate-900 leading-tight">Clinical Details</h3>
                  <p className="text-xs text-slate-500">Family History Record</p>
                </div>
              </div>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-50/50">
              {/* Selected Term Insight */}
              <div className="mb-6 p-4 bg-white border border-slate-200 rounded-xl shadow-sm text-center">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Condition</p>
                <div className="inline-flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                  <h4 className="text-lg font-bold text-slate-900">{newEntry.condition}</h4>
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-2 flex items-center justify-center gap-1">
                  SNOMED CT: {newEntry.snomed_code}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Family Member <span className="text-slate-400 font-normal text-xs">(Optional)</span></label>
                  <input 
                    type="text" 
                    placeholder="e.g. Father, Mother, Sibling"
                    value={newEntry.relative}
                    onChange={(e) => setNewEntry({...newEntry, relative: e.target.value})}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Age of Onset</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 21, 60s"
                      value={newEntry.onset_age}
                      onChange={(e) => setNewEntry({...newEntry, onset_age: e.target.value})}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Severity</label>
                    <select 
                      value={newEntry.severity}
                      onChange={(e) => setNewEntry({...newEntry, severity: e.target.value})}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm font-medium"
                    >
                      <option value="Unknown">Unknown</option>
                      <option value="Mild">Mild</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Severe">Severe</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
              <button 
                onClick={() => setStep(1)} 
                className="text-sm font-semibold text-slate-500 hover:text-slate-700 px-3 py-2"
              >
                ← Back to Search
              </button>
              <button 
                onClick={handleSave}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Family History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
