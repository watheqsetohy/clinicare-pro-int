import { useState, Fragment } from "react";
import { 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  ChevronDown, 
  ChevronRight, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle2, 
  Clock, 
  FileText, 
  ArrowRight,
  Upload,
  X,
  Activity
} from "lucide-react";
import { cn } from "@/src/lib/utils";

// --- Types & Mock Data ---

type LabResult = {
  value: number;
  unit: string;
  time: string;
  isAbnormal?: boolean;
  isCritical?: boolean;
  refRange?: string;
};

type LabTest = {
  id: string;
  name: string;
  unit: string;
  results: Record<string, LabResult[]>; // Key is date string YYYY-MM-DD
  cdss?: {
    type: "warn" | "critical" | "info";
    message: string;
    relatedMeds?: string[];
  };
};

type LabGroup = {
  id: string;
  name: string;
  tests: LabTest[];
};

type LabRequest = {
  id: string;
  name: string;
  orderedDate: string;
  department: string;
  prescriber: string;
  status: "Ordered" | "Collected" | "Reported" | "Canceled";
};

const DATES = ["2023-10-10", "2023-10-12", "2023-10-15", "2023-11-01", "2023-11-05"];

const MOCK_LAB_GROUPS: LabGroup[] = [
  {
    id: "chem",
    name: "Chemistry Panel",
    tests: [
      {
        id: "creatinine",
        name: "Creatinine",
        unit: "mg/dL",
        results: {
          "2023-10-10": [{ value: 1.1, unit: "mg/dL", time: "08:00" }],
          "2023-10-12": [{ value: 1.2, unit: "mg/dL", time: "09:30" }],
          "2023-10-15": [{ value: 1.4, unit: "mg/dL", time: "08:15", isAbnormal: true, refRange: "0.6-1.2" }],
          "2023-11-01": [{ value: 1.5, unit: "mg/dL", time: "10:00", isAbnormal: true, refRange: "0.6-1.2" }],
          "2023-11-05": [{ value: 1.6, unit: "mg/dL", time: "08:00", isAbnormal: true, isCritical: true, refRange: "0.6-1.2" }],
        },
        cdss: {
          type: "critical",
          message: "Rising Creatinine trend. Acute Kidney Injury risk.",
          relatedMeds: ["Lisinopril", "Ibuprofen"]
        }
      },
      {
        id: "egfr",
        name: "eGFR",
        unit: "mL/min",
        results: {
          "2023-10-10": [{ value: 65, unit: "mL/min", time: "08:00" }],
          "2023-10-12": [{ value: 60, unit: "mL/min", time: "09:30" }],
          "2023-10-15": [{ value: 55, unit: "mL/min", time: "08:15", isAbnormal: true, refRange: ">60" }],
          "2023-11-01": [{ value: 50, unit: "mL/min", time: "10:00", isAbnormal: true, refRange: ">60" }],
          "2023-11-05": [{ value: 45, unit: "mL/min", time: "08:00", isAbnormal: true, isCritical: true, refRange: ">60" }],
        },
        cdss: {
          type: "critical",
          message: "eGFR < 60. CKD Stage 3a. Dose adjust renal-cleared meds.",
          relatedMeds: ["Metformin"]
        }
      },
      {
        id: "k",
        name: "Potassium",
        unit: "mEq/L",
        results: {
          "2023-10-10": [{ value: 4.1, unit: "mEq/L", time: "08:00" }],
          "2023-10-15": [{ value: 4.5, unit: "mEq/L", time: "08:15" }],
          "2023-11-05": [{ value: 5.2, unit: "mEq/L", time: "08:00", isAbnormal: true, refRange: "3.5-5.0" }],
        },
        cdss: {
          type: "warn",
          message: "Hyperkalemia risk. Monitor closely.",
          relatedMeds: ["Lisinopril"]
        }
      },
      {
        id: "na",
        name: "Sodium",
        unit: "mEq/L",
        results: {
          "2023-10-10": [{ value: 138, unit: "mEq/L", time: "08:00" }],
          "2023-11-05": [{ value: 136, unit: "mEq/L", time: "08:00" }],
        }
      }
    ]
  },
  {
    id: "cbc",
    name: "CBC with Differential",
    tests: [
      {
        id: "wbc",
        name: "WBC",
        unit: "x10^3/uL",
        results: {
          "2023-10-10": [{ value: 7.5, unit: "x10^3/uL", time: "08:00" }],
          "2023-11-05": [{ value: 8.1, unit: "x10^3/uL", time: "08:00" }],
        }
      },
      {
        id: "hgb",
        name: "Hemoglobin",
        unit: "g/dL",
        results: {
          "2023-10-10": [{ value: 13.2, unit: "g/dL", time: "08:00" }],
          "2023-11-05": [{ value: 12.8, unit: "g/dL", time: "08:00" }],
        }
      }
    ]
  },
  {
    id: "glucose",
    name: "Glucose Monitoring",
    tests: [
      {
        id: "gluc_random",
        name: "Glucose, Random",
        unit: "mg/dL",
        results: {
          "2023-10-12": [
            { value: 145, unit: "mg/dL", time: "08:15", isAbnormal: true, refRange: "70-140" },
            { value: 180, unit: "mg/dL", time: "13:30", isAbnormal: true, refRange: "70-140" }
          ],
          "2023-11-01": [{ value: 160, unit: "mg/dL", time: "14:00", isAbnormal: true, refRange: "70-140" }]
        },
        cdss: {
          type: "warn",
          message: "Elevated random glucose. Check HbA1c.",
        }
      }
    ]
  }
];

const MOCK_REQUESTS: LabRequest[] = [
  { id: "LR1", name: "Basic Metabolic Panel", orderedDate: "2023-11-05 09:00", department: "Internal Medicine", prescriber: "Dr. Sarah Connor", status: "Reported" },
  { id: "LR2", name: "HbA1c", orderedDate: "2023-11-05 09:00", department: "Internal Medicine", prescriber: "Dr. Sarah Connor", status: "Collected" },
  { id: "LR3", name: "Lipid Panel", orderedDate: "2023-10-12 14:30", department: "Cardiology", prescriber: "Dr. James Bond", status: "Reported" },
];

export function SectionCLabs() {
  const [activeTab, setActiveTab] = useState<"comparative" | "requests">("comparative");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    chem: true,
    cbc: false,
    glucose: true
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<"HIS" | "Manual">("HIS");

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Helper to group dates by month for the header
  const getMonthHeaders = () => {
    const months: { label: string; colSpan: number }[] = [];
    let currentMonth = "";
    let count = 0;

    DATES.forEach((date, index) => {
      const d = new Date(date);
      const monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      
      if (monthLabel !== currentMonth) {
        if (currentMonth) {
          months.push({ label: currentMonth, colSpan: count });
        }
        currentMonth = monthLabel;
        count = 1;
      } else {
        count++;
      }
      
      if (index === DATES.length - 1) {
        months.push({ label: currentMonth, colSpan: count });
      }
    });
    return months;
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Labs & Investigations</h2>
          <p className="text-sm text-slate-500">Comparative trends & CDSS analysis</p>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto">
          {/* Date Picker (Mock) */}
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <select className="pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-200 hover:bg-slate-50 transition-colors appearance-none cursor-pointer">
              <option>Last 6 Months</option>
              <option>Last 12 Months</option>
              <option>All History</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add / Record Result
          </button>
        </div>
      </div>

      {/* Inner Tabs */}
      <div className="border-b border-slate-200 flex gap-6">
        <button
          onClick={() => setActiveTab("comparative")}
          className={cn(
            "pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            activeTab === "comparative" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Activity className="w-4 h-4" />
          Comparative Results
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={cn(
            "pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            activeTab === "requests" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <FileText className="w-4 h-4" />
          Lab Requests
          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs">
            {MOCK_REQUESTS.length}
          </span>
        </button>
      </div>

      {/* Content Area */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[500px]">
        
        {activeTab === "comparative" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {/* Month Headers */}
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-200 w-64 min-w-[250px] p-3"></th>
                  {getMonthHeaders().map((month, i) => (
                    <th key={i} colSpan={month.colSpan} className="text-center py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-r border-slate-200 last:border-r-0">
                      {month.label}
                    </th>
                  ))}
                  <th className="sticky right-0 z-20 bg-slate-50 border-l border-slate-200 w-16 min-w-[64px]"></th>
                </tr>
                {/* Day Headers */}
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-200 w-64 min-w-[250px] p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left pl-6">
                    Test Name
                  </th>
                  {DATES.map((date) => (
                    <th key={date} className="p-2 text-center min-w-[100px] border-r border-slate-100 last:border-r-0">
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-bold text-slate-700">{new Date(date).getDate()}</span>
                        <span className="text-[10px] text-slate-400 font-medium uppercase">{new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      </div>
                    </th>
                  ))}
                  <th className="sticky right-0 z-20 bg-slate-50 border-l border-slate-200 w-16 min-w-[64px] p-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    CDSS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MOCK_LAB_GROUPS.map((group) => (
                  <Fragment key={group.id}>
                    {/* Group Header */}
                    <tr 
                      className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer transition-colors"
                      onClick={() => toggleGroup(group.id)}
                    >
                      <td className="sticky left-0 z-10 bg-slate-50/80 border-r border-slate-200 p-3 font-semibold text-slate-800 flex items-center gap-2">
                        {expandedGroups[group.id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        {group.name}
                      </td>
                      <td colSpan={DATES.length + 1} className="bg-slate-50/80"></td>
                    </tr>

                    {/* Tests */}
                    {expandedGroups[group.id] && group.tests.map((test) => (
                      <tr key={test.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/30 border-r border-slate-200 p-3 pl-8 text-sm font-medium text-slate-700">
                          {test.name} <span className="text-xs text-slate-400 font-normal ml-1">({test.unit})</span>
                        </td>
                        {DATES.map((date) => {
                          const results = test.results[date];
                          return (
                            <td key={date} className="p-2 text-center border-r border-slate-100 last:border-r-0 align-top">
                              {results ? (
                                <div className="flex flex-col items-center gap-1">
                                  {results.map((res, idx) => (
                                    <div 
                                      key={idx} 
                                      className={cn(
                                        "px-2 py-1 rounded-md text-sm font-medium w-full max-w-[80px] relative group/cell cursor-default",
                                        res.isCritical ? "bg-red-100 text-red-800 ring-1 ring-red-200" :
                                        res.isAbnormal ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" :
                                        "text-slate-700 hover:bg-slate-100"
                                      )}
                                    >
                                      {res.value}
                                      {results.length > 1 && (
                                        <span className="block text-[9px] opacity-70 font-normal">{res.time}</span>
                                      )}
                                      
                                      {/* Tooltip for abnormal/critical */}
                                      {(res.isAbnormal || res.isCritical) && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-xs rounded shadow-xl opacity-0 invisible group-hover/cell:opacity-100 group-hover/cell:visible transition-all z-50 text-left pointer-events-none">
                                          <p className="font-bold mb-1">{res.isCritical ? "Critical Value" : "Abnormal Value"}</p>
                                          <p>Ref Range: {res.refRange} {test.unit}</p>
                                          <p className="mt-1 text-slate-300">Recorded at {res.time}</p>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-200 text-xs">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-10 bg-white group-hover:bg-blue-50/30 border-l border-slate-200 p-2 text-center align-middle">
                          {test.cdss && (
                            <div className="relative group/cdss flex justify-center">
                              {test.cdss.type === "critical" ? (
                                <AlertCircle className="w-5 h-5 text-red-600 cursor-help" />
                              ) : test.cdss.type === "warn" ? (
                                <AlertTriangle className="w-5 h-5 text-amber-500 cursor-help" />
                              ) : (
                                <Info className="w-5 h-5 text-blue-500 cursor-help" />
                              )}
                              
                              {/* CDSS Tooltip */}
                              <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 w-64 p-3 bg-white border border-slate-200 text-slate-800 text-xs rounded-lg shadow-xl opacity-0 invisible group-hover/cdss:opacity-100 group-hover/cdss:visible transition-all z-50 text-left">
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                                  {test.cdss.type === "critical" ? (
                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                  ) : (
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                  )}
                                  <span className="font-bold uppercase tracking-wider text-[10px]">Clinical Alert</span>
                                </div>
                                <p className="mb-2 leading-relaxed">{test.cdss.message}</p>
                                {test.cdss.relatedMeds && (
                                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Related Meds</span>
                                    <div className="flex flex-wrap gap-1">
                                      {test.cdss.relatedMeds.map(med => (
                                        <span key={med} className="text-blue-600 hover:underline cursor-pointer">{med}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "requests" && (
          <div className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4">Request Name</th>
                  <th className="px-6 py-4">Date/Time</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Prescriber</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MOCK_REQUESTS.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{req.name}</td>
                    <td className="px-6 py-4 text-slate-600">{req.orderedDate}</td>
                    <td className="px-6 py-4 text-slate-600">{req.department}</td>
                    <td className="px-6 py-4 text-slate-600 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                        {req.prescriber.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      {req.prescriber}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                        req.status === "Reported" ? "bg-emerald-100 text-emerald-800" :
                        req.status === "Collected" ? "bg-blue-100 text-blue-800" :
                        req.status === "Ordered" ? "bg-slate-100 text-slate-800" :
                        "bg-red-100 text-red-800"
                      )}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-blue-600 hover:text-blue-800 font-medium text-xs flex items-center gap-1 ml-auto">
                        View Details <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Record Result Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-semibold text-slate-900">Add Lab Result</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setAddMode("HIS")}
                className={cn(
                  "flex-1 py-3 text-sm font-medium text-center transition-colors border-b-2",
                  addMode === "HIS" ? "border-blue-600 text-blue-700 bg-blue-50/50" : "border-transparent text-slate-500 hover:bg-slate-50"
                )}
              >
                Option A: Import from HIS
              </button>
              <button
                onClick={() => setAddMode("Manual")}
                className={cn(
                  "flex-1 py-3 text-sm font-medium text-center transition-colors border-b-2",
                  addMode === "Manual" ? "border-blue-600 text-blue-700 bg-blue-50/50" : "border-transparent text-slate-500 hover:bg-slate-50"
                )}
              >
                Option B: Manual Entry
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {addMode === "HIS" ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date Range</label>
                      <select className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                        <option>Last 7 Days</option>
                        <option>Last 30 Days</option>
                        <option>Custom Range</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Encounter Context</label>
                      <select className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                        <option>All Encounters</option>
                        <option>Inpatient Admission (Nov 01)</option>
                        <option>OPD Visit (Oct 12)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Lab Panel</label>
                      <select className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                        <option>All Panels</option>
                        <option>Chemistry</option>
                        <option>Hematology</option>
                      </select>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider flex justify-between">
                      <span>Available Results</span>
                      <span>3 New Found</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {[
                        { name: "Magnesium", value: "1.8", unit: "mg/dL", date: "Nov 05, 08:00", flag: "Normal" },
                        { name: "Phosphorus", value: "4.8", unit: "mg/dL", date: "Nov 05, 08:00", flag: "High" },
                        { name: "Calcium", value: "8.9", unit: "mg/dL", date: "Nov 05, 08:00", flag: "Low" },
                      ].map((res, i) => (
                        <div key={i} className="p-3 hover:bg-slate-50 flex items-center gap-3 cursor-pointer group">
                          <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                          <div className="flex-1 grid grid-cols-4 gap-4 items-center">
                            <span className="font-medium text-slate-900 text-sm">{res.name}</span>
                            <span className="text-sm text-slate-700">{res.value} <span className="text-slate-500 text-xs">{res.unit}</span></span>
                            <span className="text-xs text-slate-500">{res.date}</span>
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded w-fit",
                              res.flag === "High" || res.flag === "Low" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                            )}>{res.flag}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Lab Test Type</label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input 
                        type="text" 
                        placeholder="Search LOINC or test name..." 
                        className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Value</label>
                      <input type="text" className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none text-sm" placeholder="Numeric value" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Unit</label>
                      <input type="text" className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none text-sm" placeholder="e.g., mg/dL" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Date & Time</label>
                      <input type="datetime-local" className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Reference Range (Optional)</label>
                      <input type="text" className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none text-sm" placeholder="e.g., 0.6 - 1.2" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Source Label</label>
                    <select className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none text-sm">
                      <option>External Lab Report</option>
                      <option>Patient Reported</option>
                      <option>Paper Record</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Evidence / Attachment</label>
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer">
                      <Upload className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="text-sm text-slate-600 font-medium">Click to upload PDF or Image</p>
                      <p className="text-xs text-slate-400 mt-1">Supports JPG, PNG, PDF up to 5MB</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium shadow-sm">
                {addMode === "HIS" ? "Import Selected" : "Save Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

