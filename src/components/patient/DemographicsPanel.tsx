import { useState, useEffect } from "react";
import { fetchWithAuth } from "../../lib/authSession";
import { Edit2, Save, X, History, AlertTriangle, CheckCircle2, Building, MapPin } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { MapPickerModal } from "./MapPickerModal";

interface DemographicField {
  label: string;
  value: string;
  key: string;
  editable: boolean;
}

interface AuditLog {
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  author: string;
  timestamp: string;
}

const initialData = {
  name: "Eleanor Rigby",
  mrn: "MRN-847291",
  dob: "1951-08-14",
  age: "72",
  sex: "Female",
  phone: "(555) 123-4567",
  address: "123 Penny Lane, Liverpool",
  facility: "Main Hospital",
  payer: "Medicare Part D",
  emergencyContact: "Paul McCartney (Son) - (555) 987-6543"
};

export function DemographicsPanel({ patientId }: { patientId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [tempData, setTempData] = useState<any>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // MRN Link state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkMrnInput, setLinkMrnInput] = useState("");
  
  // Insurance Modals and State
  const [payersList, setPayersList] = useState<any[]>([]);
  const [contractsList, setContractsList] = useState<any[]>([]);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [newCoverage, setNewCoverage] = useState({ service: "", percent: "" });
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [nationalitiesList, setNationalitiesList] = useState<any[]>([]);
  const [uploadedPhoto, setUploadedPhoto] = useState<File | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [isAddingPayer, setIsAddingPayer] = useState(false);
  const [newPayerData, setNewPayerData] = useState({ name: "", type: "Private" });

  const fetchData = async () => {
    try {
      const res = await fetchWithAuth(`/api/patients/${patientId}`);
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
      setTempData(json);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPayers = async () => {
    try {
      const res = await fetchWithAuth('/api/insurance/payers');
      if (res.ok) setPayersList(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchServices = async () => {
    try {
      const res = await fetchWithAuth('/api/insurance/services');
      if (res.ok) setAvailableServices(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNationalities = async () => {
    try {
      const res = await fetchWithAuth('/api/nationalities');
      if (res.ok) setNationalitiesList(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
    fetchPayers();
    fetchServices();
    fetchNationalities();
  }, [patientId]);

  // Phone auto-prefix when nationality changes in editing mode
  useEffect(() => {
    if (tempData?.nationality && isEditing) {
      const nat = nationalitiesList.find(n => n.name === tempData.nationality);
      if (nat && (!tempData.phone || !tempData.phone.startsWith(nat.code))) {
        setTempData((prev: any) => ({ ...prev, phone: nat.code + " " }));
      }
    }
  }, [tempData?.nationality]);

  useEffect(() => {
    if (tempData?.payer_id && tempData.payer_id !== 'OOP') {
      fetchWithAuth(`/api/insurance/payers/${tempData.payer_id}/contracts`)
        .then(res => res.json())
        .then(c => setContractsList(c))
        .catch(e => console.error(e));
    } else {
      setContractsList([]);
    }
  }, [tempData?.payer_id]);

  const handleAddCoverage = async () => {
    if (!newCoverage.service || !newCoverage.percent || !tempData.contract_id) return;
    const contract = contractsList.find(c => c.id === tempData.contract_id);
    if (!contract) return;
    
    const updatedCoverages = { ...contract.coverages, [newCoverage.service]: parseInt(newCoverage.percent) };
    
    try {
      const res = await fetchWithAuth(`/api/insurance/contracts/${tempData.contract_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverages: updatedCoverages })
      });
      if (res.ok) {
        setContractsList(contractsList.map(c => 
          c.id === tempData.contract_id ? { ...c, coverages: updatedCoverages } : c
        ));
        setNewCoverage({ service: "", percent: "" });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddNewPayer = async () => {
    if (!newPayerData.name) return;
    try {
      const res = await fetchWithAuth('/api/insurance/payers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPayerData)
      });
      if (res.ok) {
        const data = await res.json();
        setPayersList([...payersList, { id: data.id, name: data.name, type: data.type }]);
        setTempData({ ...tempData, payer_id: data.id, contract_id: "" });
        setIsAddingPayer(false);
        setNewPayerData({ name: "", type: "Private" });
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!data || !tempData) return <div className="text-sm p-4 text-slate-500">Loading demographics...</div>;

  const fields: DemographicField[] = [
    { label: "Full Name", value: data.name || "", key: "name", editable: true },
    { label: "Master MRN", value: data.mrn || "", key: "mrn", editable: false },
    { label: "DOB", value: data.dob || "", key: "dob", editable: true },
    { label: "Sex", value: data.sex || "", key: "sex", editable: true },
    { label: "Height (cm)", value: data.height || "", key: "height", editable: true },
    { label: "Weight (kg)", value: data.weight || "", key: "weight", editable: true },
    { label: "Social Status", value: data.social_status || "", key: "social_status", editable: true },
    { label: "Nationality", value: data.nationality || "", key: "nationality", editable: true },
    { label: "National ID / Passport", value: data.national_id || "", key: "national_id", editable: true },
    { label: "Phone", value: data.phone || "", key: "phone", editable: true },
    { label: "Address", value: data.address || "", key: "address", editable: true },
    { label: "Location", value: data.location || "", key: "location", editable: true },
    { label: "Facility", value: data.facility || "", key: "facility", editable: true },
    { label: "Emergency Contact", value: data.emergency_contact || "", key: "emergency_contact", editable: true },
  ];

  const handleSaveClick = () => {
    // Check for changes
    const hasChanges = Object.keys(data).some(key => data[key as keyof typeof data] !== tempData[key as keyof typeof tempData]);
    if (hasChanges) {
      setShowOverrideModal(true);
    } else {
      setIsEditing(false);
    }
  };

  const confirmSave = async () => {
    try {
      const res = await fetchWithAuth(`/api/patients/${patientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tempData),
      });
      if (res.ok) {
        setData(tempData);
        setIsEditing(false);
        setShowOverrideModal(false);
        setOverrideReason("");
        setAuditLogs([...auditLogs, {
          field: "Multiple Fields",
          oldValue: "Various",
          newValue: "Various",
          reason: overrideReason,
          author: "Clinical Pharmacist",
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const linkNewMrn = async () => {
    if (!linkMrnInput) return;
    const array = [...(data.linked_mrns || []), linkMrnInput];
    try {
      const res = await fetchWithAuth(`/api/patients/${patientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linked_mrns: array }),
      });
      if (res.ok) {
        setData({...data, linked_mrns: array});
        setTempData({...tempData, linked_mrns: array});
        setLinkMrnInput("");
        setShowLinkModal(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancel = () => {
    setTempData(data);
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          Demographics
          {auditLogs.length > 0 && (
            <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {auditLogs.length} edits
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              showHistory ? "bg-blue-100 text-blue-700" : "hover:bg-slate-100 text-slate-500"
            )}
            title="View Audit History"
          >
            <History className="w-4 h-4" />
          </button>
          {!isEditing ? (
            <button 
              onClick={() => setIsEditing(true)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 hover:bg-blue-50 rounded"
            >
              <Edit2 className="w-3 h-3" /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button 
                onClick={handleCancel}
                className="text-xs font-medium text-slate-600 hover:text-slate-700 px-2 py-1 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveClick}
                className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded flex items-center gap-1"
              >
                <Save className="w-3 h-3" /> Save
              </button>
            </div>
          )}
        </div>
      </div>

      {showHistory ? (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-sm space-y-4 max-h-96 overflow-y-auto">
          <h4 className="font-medium text-slate-700 mb-2">Audit Log (Immutable)</h4>
          {auditLogs.length === 0 ? (
            <p className="text-slate-500 italic">No manual overrides recorded.</p>
          ) : (
            auditLogs.map((log, i) => (
              <div key={i} className="border-l-2 border-blue-400 pl-3 py-1">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                  <span>by {log.author}</span>
                </div>
                <p className="font-medium text-slate-800">
                  Changed <span className="text-blue-600">{log.field}</span>
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs mt-1 bg-white p-2 rounded border border-slate-200">
                  <div>
                    <span className="text-slate-400 block">Old Value</span>
                    <span className="text-red-600 line-through">{log.oldValue}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">New Value</span>
                    <span className="text-emerald-600">{log.newValue}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-1 italic">
                  Reason: "{log.reason}"
                </p>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          {fields.map((field) => (
            <div key={field.key} className="grid grid-cols-3 gap-2 items-center">
              <span className="text-slate-500 font-medium">{field.label}</span>
              <div className="col-span-2">
                {isEditing && field.editable ? (
                  field.key === "phone" ? (
                    <div className="space-y-2 w-full">
                       {(() => {
                         let parsedPhones = [{type: "Mobile", number: tempData.phone || ""}];
                         try {
                           if (tempData.phone && tempData.phone.startsWith('[')) {
                             parsedPhones = JSON.parse(tempData.phone);
                           }
                         } catch { }

                         return (
                            <div className="flex flex-col gap-2">
                              {parsedPhones.map((p: any, i: number) => (
                                 <div key={i} className="flex gap-2">
                                   <select 
                                     value={p.type} 
                                     onChange={e => {
                                       const n = [...parsedPhones]; n[i].type = e.target.value;
                                       setTempData({...tempData, phone: JSON.stringify(n)});
                                     }}
                                     className="w-1/3 px-2 py-1.5 text-xs border border-slate-300 rounded outline-none focus:border-blue-500 bg-white"
                                   >
                                      <option>Mobile</option><option>Home</option><option>Work</option><option>WhatsApp</option><option>Caregiver</option>
                                   </select>
                                   <input type="text" value={p.number} onChange={e => {
                                       const n = [...parsedPhones]; n[i].number = e.target.value;
                                       setTempData({...tempData, phone: JSON.stringify(n)});
                                   }} className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded outline-none focus:border-blue-500" />
                                   {parsedPhones.length > 1 && (
                                      <button onClick={() => {
                                        const n = parsedPhones.filter((_, idx)=>idx!==i);
                                        setTempData({...tempData, phone: JSON.stringify(n)});
                                      }} className="text-slate-400 hover:text-red-500 pt-1.5"><X className="w-4 h-4"/></button>
                                   )}
                                 </div>
                              ))}
                              <button onClick={() => {
                                 const n = [...parsedPhones, {type:'Mobile', number:''}];
                                 setTempData({...tempData, phone: JSON.stringify(n)});
                              }} className="text-[10px] text-blue-600 font-bold hover:underline self-start">+ ADD PHONE</button>
                            </div>
                         );
                       })()}
                    </div>
                  ) : field.key === "address" ? (
                    <div className="flex flex-col gap-1 w-full">
                       <textarea
                         value={tempData[field.key] || ""}
                         onChange={(e) => setTempData({ ...tempData, [field.key]: e.target.value })}
                         className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none resize-none"
                         rows={2}
                       />
                    </div>
                  ) : field.key === "location" ? (
                    <div className="flex flex-col gap-1 w-full relative">
                       <textarea
                         value={tempData[field.key] || ""}
                         onChange={(e) => setTempData({ ...tempData, [field.key]: e.target.value })}
                         className="w-full px-2 py-1 text-sm border border-slate-300 rounded outline-none resize-none bg-slate-50 text-blue-600 font-medium pb-8"
                         rows={2}
                         readOnly
                       />
                       <button 
                         onClick={(e) => {
                           e.preventDefault();
                           setShowMapPicker(true);
                         }}
                         className="absolute bottom-1 right-1 text-[10px] text-blue-600 font-bold flex items-center gap-1 hover:text-blue-800 transition px-2 py-1 bg-white border border-blue-100 hover:bg-blue-50 rounded"
                       >
                         <MapPin className="w-3 h-3" /> MAP
                       </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={tempData[field.key] || ""}
                      onChange={(e) => setTempData({ ...tempData, [field.key]: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                    />
                  )
                ) : (
                  field.key === "phone" ? (
                    <div className="flex flex-col gap-1 w-full">
                       {(() => {
                          if (!field.value) return <span className="text-slate-900">-</span>;
                          try { 
                            const parsed = JSON.parse(field.value);
                            if (Array.isArray(parsed)) return parsed.map((x:any, idx:number) => <div key={idx} className="text-slate-900 leading-tight">{x.number} <span className="text-[10px] text-slate-400 font-medium">({x.type})</span></div>);
                            return <span className="text-slate-900">{field.value}</span>;
                          } catch { return <span className="text-slate-900">{field.value}</span>; }
                       })()}
                    </div>
                  ) : field.key === "location" ? (
                    <div className="flex flex-wrap items-center gap-2 w-full">
                      {field.value ? (
                        <a href={field.value} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800 transition px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded-lg">
                          <MapPin className="w-4 h-4" /> Open in Google Maps
                        </a>
                      ) : (
                        <span className="text-slate-900">-</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-slate-900", field.key === "mrn" && "font-mono font-semibold")}>
                        {field.value || "-"}
                      </span>
                      {field.key === "mrn" && (
                        <div className="flex flex-wrap items-center gap-1.5 ml-2">
                          {(data.linked_mrns || []).map((mrnObj: string, i: number) => (
                            <span key={i} className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                              {mrnObj}
                            </span>
                          ))}
                          <button onClick={() => setShowLinkModal(true)} className="text-[10px] font-semibold text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded transition-colors uppercase">
                            + Link
                          </button>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          ))}

          <div className="col-span-2">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2 mt-4 flex items-center gap-2">
              <Building className="w-3 h-3" />
              Insurance & Contract
            </h4>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex justify-between items-center">
              <div>
                {data.payer_id ? (
                  <>
                    <p className="font-semibold text-blue-900">{payersList.find(p => p.id === data.payer_id)?.name || data.payer_id}</p>
                    <p className="text-xs text-blue-700 font-mono mt-0.5">Contact ID: {data.contract_id || 'None'} • Number: {data.insurance_id_number}</p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-slate-500 italic">No insurance configured.</p>
                )}
              </div>
              {isEditing && (
                <button 
                  onClick={() => setShowInsuranceModal(true)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 transition"
                >
                  Configure
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Insurance Configuration Modal */}
      {showInsuranceModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-blue-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-600" /> Configure Contract Link
              </h3>
              <button onClick={() => setShowInsuranceModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Insurance Payer</label>
                {!isAddingPayer ? (
                  <select 
                    value={tempData.payer_id || ""} 
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        setIsAddingPayer(true);
                        setTempData({...tempData, payer_id: "", contract_id: ""});
                      } else {
                        setTempData({...tempData, payer_id: e.target.value, contract_id: ""});
                      }
                    }}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none text-sm font-medium focus:border-blue-500"
                  >
                    <option value="">Select Payer Company...</option>
                    {payersList.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                    ))}
                    <option value="ADD_NEW" className="font-bold text-blue-600">+ Add New Payer...</option>
                  </select>
                ) : (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                    <input 
                      type="text" 
                      placeholder="Enter Payer Name..." 
                      value={newPayerData.name}
                      onChange={e => setNewPayerData({...newPayerData, name: e.target.value})}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded outline-none focus:border-blue-500" 
                    />
                    <div className="flex gap-2">
                      <select 
                        value={newPayerData.type}
                        onChange={e => setNewPayerData({...newPayerData, type: e.target.value})}
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded outline-none focus:border-blue-500 bg-white"
                      >
                        <option value="Private">Private</option>
                        <option value="Public">Public</option>
                      </select>
                      <button 
                        onClick={handleAddNewPayer}
                        className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold shadow hover:bg-blue-700 transition"
                      >
                        Save
                      </button>
                      <button 
                        onClick={() => setIsAddingPayer(false)}
                        className="px-3 py-2 text-slate-500 hover:bg-slate-200 rounded text-sm font-bold transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {tempData.payer_id && tempData.payer_id !== 'OOP' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned Contract</label>
                  <select 
                    value={tempData.contract_id || ""} 
                    onChange={(e) => setTempData({...tempData, contract_id: e.target.value})}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none text-sm font-medium focus:border-blue-500"
                  >
                    <option value="">Select Contract Coverage...</option>
                    {contractsList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {tempData.contract_id && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Coverage Breakdown</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {contractsList.find(c => c.id === tempData.contract_id)?.coverages && 
                      Object.entries(contractsList.find(c => c.id === tempData.contract_id).coverages).map(([service, pct]) => (
                        <div key={service} className="flex justify-between items-center text-sm border-b border-slate-200 pb-1">
                          <span className="text-slate-700">{service}</span>
                          <span className="font-semibold text-blue-700">{String(pct)}%</span>
                        </div>
                      ))
                    }
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200 flex gap-2">
                    <input 
                      type="text"
                      list="services-datalist-demographics"
                      placeholder="Search Service..."
                      value={newCoverage.service}
                      onChange={e => setNewCoverage({...newCoverage, service: e.target.value})}
                      className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded outline-none focus:border-blue-500 bg-white"
                    />
                    <datalist id="services-datalist-demographics">
                      {availableServices
                        .filter(s => !(contractsList.find(c => c.id === tempData.contract_id)?.coverages?.[s]))
                        .map(s => (
                          <option key={s} value={s}>{s}</option>
                      ))}
                    </datalist>
                    <div className="relative w-20">
                      <input 
                        type="number" 
                        placeholder="%" 
                        value={newCoverage.percent}
                        onChange={e => setNewCoverage({...newCoverage, percent: e.target.value})}
                        className="w-full px-2 py-1 text-xs border border-slate-300 rounded outline-none focus:border-blue-500 pr-5" 
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                    </div>
                    <button 
                      onClick={handleAddCoverage}
                      className="px-2 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-xs font-bold transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Insurance ID Number</label>
                <input 
                  type="text" 
                  value={tempData.insurance_id_number || ""}
                  onChange={(e) => setTempData({...tempData, insurance_id_number: e.target.value})}
                  placeholder="e.g. BUP-998877"
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none text-sm font-mono focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Insurance Card Photo</label>
                <div className="relative w-full border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors overflow-hidden">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadedPhoto(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {uploadedPhoto ? (
                    <div>
                      <p className="text-sm font-bold text-green-600 truncate">{uploadedPhoto.name}</p>
                      <p className="text-xs text-slate-500 mt-1">Ready to upload</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-blue-600">Click to Browse File</p>
                      <p className="text-xs text-slate-400 mt-1">JPEG, PNG accepted</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowInsuranceModal(false)} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* MRN Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 border border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-2">Link Foreign MRN</h3>
            <p className="text-xs text-slate-500 mb-4">Merge another hospital's MRN alias to this Master Patient Index record.</p>
            <input 
              type="text"
              placeholder="e.g. HOSPB-99887"
              value={linkMrnInput}
              onChange={(e) => setLinkMrnInput(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg outline-none font-mono text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowLinkModal(false)} className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-sm">Cancel</button>
              <button onClick={linkNewMrn} disabled={!linkMrnInput} className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50">Link MRN</button>
            </div>
          </div>
        </div>
      )}

      {/* Override Reason Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-full text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Manual Override Required</h3>
                <p className="text-sm text-slate-500 mt-1">
                  You are overriding HIS-imported data. Please provide a clinical or administrative reason for this change.
                </p>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Reason for Change</label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g., Patient reported new address, HIS data outdated..."
                className="w-full p-3 border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm h-24 resize-none"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={confirmSave}
                disabled={!overrideReason.trim()}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Map Picker Modal */}
      <MapPickerModal
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelect={(url) => setTempData({...tempData, address: url})}
      />
    </div>
  );
}
