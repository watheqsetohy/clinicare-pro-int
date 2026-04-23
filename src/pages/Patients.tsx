import { useState, useEffect } from "react";
import { fetchWithAuth } from "../lib/authSession";
import { Search, Filter, AlertTriangle, Calendar, Users, UserPlus, X, Building, LayoutDashboard, Clock, Plus, MapPin } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useNavigate } from "react-router-dom";
import { MapPickerModal } from "@/src/components/patient/MapPickerModal";

export function Patients() {
  const [search, setSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [patientsList, setPatientsList] = useState<any[]>([]);
  const [isAddingPatient, setIsAddingPatient] = useState(false);
  const [addMode, setAddMode] = useState<"HIS" | "Manual">("HIS");
  const [newPatient, setNewPatient] = useState({
    mrn: "", name: "", dob: "", age: "", sex: "Unknown", height: "", weight: "", social_status: "Single", phone: "", address: "", location: "", nationality: "", national_id: "", facility: "", payer_id: "", contract_id: "", insurance_id_number: "", emergency_contact: ""
  });
  
  // Insurance Modals and State
  const [payersList, setPayersList] = useState<any[]>([]);
  const [contractsList, setContractsList] = useState<any[]>([]);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [newCoverage, setNewCoverage] = useState({ service: "", percent: "" });
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [nationalitiesList, setNationalitiesList] = useState<any[]>([]);
  const [uploadedPhoto, setUploadedPhoto] = useState<File | null>(null);
  const [phonesList, setPhonesList] = useState<{type: string, number: string}[]>([{ type: "Mobile", number: "" }]);
  const [showMapPicker, setShowMapPicker] = useState(false);
  
  const [isAddingPayer, setIsAddingPayer] = useState(false);
  const [newPayerData, setNewPayerData] = useState({ name: "", type: "Private" });
  
  const navigate = useNavigate();

  const fetchPatients = () => {
    fetchWithAuth('/api/patients')
      .then(res => res.json())
      .then(data => setPatientsList(data))
      .catch(err => console.error("Failed to fetch patients:", err));
  };
  
  const fetchPayers = () => {
    fetchWithAuth('/api/insurance/payers')
      .then(res => res.json())
      .then(data => setPayersList(data))
      .catch(err => console.error(err));
  };
  
  const fetchServices = () => {
    fetchWithAuth('/api/insurance/services')
      .then(res => res.json())
      .then(data => setAvailableServices(data))
      .catch(err => console.error(err));
  };
  
  const fetchNationalities = () => {
    fetchWithAuth('/api/nationalities')
      .then(res => res.json())
      .then(data => setNationalitiesList(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchPatients();
    fetchPayers();
    fetchServices();
    fetchNationalities();
  }, []);

  // Age Auto-Calculation Hook
  useEffect(() => {
    if (newPatient.dob) {
      const birthDate = new Date(newPatient.dob);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      setNewPatient(prev => ({ ...prev, age: String(calculatedAge) }));
    }
  }, [newPatient.dob]);

  // Phone Auto-Prefix Hook
  useEffect(() => {
    if (newPatient.nationality) {
      const nat = nationalitiesList.find(n => n.name === newPatient.nationality);
      if (nat) {
        setPhonesList(prev => prev.map((p, i) => {
          if (i === 0 && (!p.number || !p.number.startsWith(nat.code))) {
            return { ...p, number: nat.code + " " };
          }
          return p;
        }));
      }
    }
  }, [newPatient.nationality]);

  useEffect(() => {
    if (newPatient.payer_id && newPatient.payer_id !== 'OOP') {
      fetchWithAuth(`/api/insurance/payers/${newPatient.payer_id}/contracts`)
        .then(res => res.json())
        .then(data => setContractsList(data))
        .catch(err => console.error(err));
    } else {
      setContractsList([]);
    }
  }, [newPatient.payer_id]);

  const handleAddCoverage = async () => {
    if (!newCoverage.service || !newCoverage.percent || !newPatient.contract_id) return;
    const contract = contractsList.find(c => c.id === newPatient.contract_id);
    if (!contract) return;
    
    const updatedCoverages = { ...contract.coverages, [newCoverage.service]: parseInt(newCoverage.percent) };
    
    try {
      const res = await fetchWithAuth(`/api/insurance/contracts/${newPatient.contract_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverages: updatedCoverages })
      });
      if (res.ok) {
        setContractsList(contractsList.map(c => 
          c.id === newPatient.contract_id ? { ...c, coverages: updatedCoverages } : c
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
        setNewPatient({ ...newPatient, payer_id: data.id, contract_id: "" });
        setIsAddingPayer(false);
        setNewPayerData({ name: "", type: "Private" });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleHisFetch = () => {
    if (!newPatient.mrn) return;
    // Simulate fetching from HIS
    setNewPatient(prev => ({
      ...prev,
      name: "Arthur Dent",
      dob: "1978-03-11",
      age: "46",
      sex: "Male",
      phone: "(555) 999-8888",
      address: "Sector ZZ9 Plural Z Alpha",
      facility: "Intergalactic Clinic",
      payer: "Universal Health",
      emergency_contact: "Ford Prefect (Friend)"
    }));
  };

  const handleSavePatient = async () => {
    if (!newPatient.mrn || !newPatient.name) return;
    try {
      const payload = { ...newPatient, phone: JSON.stringify(phonesList) };
      const res = await fetchWithAuth('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setIsAddingPatient(false);
        fetchPatients();
        setNewPatient({ mrn: "", name: "", dob: "", age: "", sex: "Unknown", height: "", weight: "", social_status: "Single", phone: "", address: "", location: "", nationality: "", national_id: "", facility: "", payer_id: "", contract_id: "", insurance_id_number: "", emergency_contact: "" });
        setPhonesList([{ type: "Mobile", number: "" }]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredPatients = patientsList.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.mrn.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top Search Bar */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0">
        <div className="flex-1 max-w-2xl relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search patient by MRN or Name..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-lg focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <div className="w-px h-6 bg-slate-200 mx-1"></div>
          <button 
            onClick={() => setIsAddingPatient(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            New Patient
          </button>
        </div>
      </header>

      {/* Main Content Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Patient List */}
        <div className="w-1/3 min-w-[320px] max-w-md border-r border-slate-200 bg-white flex flex-col h-full">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="font-semibold text-slate-800">Results ({filteredPatients.length})</h2>
            <span className="text-xs text-slate-500">Sorted by Risk</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {filteredPatients.map(patient => (
              <div 
                key={patient.id}
                onClick={() => setSelectedPatient(patient.id)}
                className={cn(
                  "p-4 rounded-xl border cursor-pointer transition-all duration-200",
                  selectedPatient === patient.id 
                    ? "border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500/20" 
                    : "border-slate-200 hover:border-blue-300 hover:shadow-sm bg-white"
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{patient.name}</h3>
                    <p className="text-sm text-slate-500 font-mono mt-0.5">{patient.mrn}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                      {patient.age}y • {patient.sex}
                    </span>
                  </div>
                </div>
                
                {patient.alerts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {patient.alerts.map(alert => (
                      <span key={alert} className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        <AlertTriangle className="w-3 h-3" />
                        {alert}
                      </span>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  <Calendar className="w-3.5 h-3.5" />
                  Last MTM: {patient.lastMtm}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Placeholder or Actions */}
        <div className="flex-1 bg-slate-50/50 flex flex-col items-center justify-center p-8">
          {selectedPatient ? (
            <div className="max-w-xl w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                  <Users className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-semibold text-slate-900 mb-1">
                  {patientsList.find(p => p.id === selectedPatient)?.name}
                </h2>
                <p className="text-slate-500 font-medium">
                  {patientsList.find(p => p.id === selectedPatient)?.mrn} • {patientsList.find(p => p.id === selectedPatient)?.age}y {patientsList.find(p => p.id === selectedPatient)?.sex}
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-8 max-h-[300px] overflow-y-auto">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Patient Summary</h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                  <div><span className="text-slate-500 block text-xs">DOB</span> <span className="font-medium text-slate-800">{patientsList.find(p => p.id === selectedPatient)?.dob || 'N/A'}</span></div>
                  <div className="col-span-2 sm:col-span-1"><span className="text-slate-500 block text-xs">Phone</span> <span className="font-medium text-slate-800 break-words">{(() => {
                    const p = patientsList.find(pt => pt.id === selectedPatient)?.phone;
                    if (!p) return 'N/A';
                    try {
                      const parsed = JSON.parse(p);
                      if (Array.isArray(parsed)) return parsed.map(x => `${x.number} (${x.type})`).join(', ');
                      return p;
                    } catch { return p; }
                  })()}</span></div>
                  <div><span className="text-slate-500 block text-xs">Nationality</span> <span className="font-medium text-slate-800">{patientsList.find(p => p.id === selectedPatient)?.nationality || 'N/A'}</span></div>
                  <div><span className="text-slate-500 block text-xs">Facility</span> <span className="font-medium text-slate-800">{patientsList.find(p => p.id === selectedPatient)?.facility || 'N/A'}</span></div>
                  <div><span className="text-slate-500 block text-xs">Payer ID</span> <span className="font-medium text-slate-800">{patientsList.find(p => p.id === selectedPatient)?.payer_id || 'Self-Pay / N/A'}</span></div>
                  <div><span className="text-slate-500 block text-xs">Risk Level</span> <span className="font-medium text-slate-800">{patientsList.find(p => p.id === selectedPatient)?.risk || 'N/A'}</span></div>
                  <div className="col-span-2"><span className="text-slate-500 block text-xs">Address</span> <span className="font-medium text-slate-800">{patientsList.find(p => p.id === selectedPatient)?.address || 'N/A'}</span></div>
                </div>
              </div>
              
              <div className="space-y-3">
                <button 
                  onClick={() => navigate(`/workspace/${selectedPatient}`)}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm"
                >
                  Start New MTM Session
                </button>
                <button 
                  onClick={() => navigate(`/workspace/${selectedPatient}`)} // You can route this to a specific "profile only" view later if needed.
                  className="w-full py-3 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium rounded-xl transition-colors"
                >
                  View All Patient Profile
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-400">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">Select a patient to view details</p>
              <p className="text-sm mt-1">Search by MRN or Name in the left panel</p>
            </div>
          )}
        </div>
      </div>

      {/* Add new Patient Modal */}
      {isAddingPatient && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 flex items-center justify-center rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Add New Patient</h3>
                  <p className="text-xs text-slate-500">Create a new Master Patient Record in the MTM Database</p>
                </div>
              </div>
              <button onClick={() => setIsAddingPatient(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setAddMode("HIS")}
                className={cn(
                  "flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors border-b-2",
                  addMode === "HIS" ? "border-blue-600 text-blue-700 bg-blue-50/50" : "border-transparent text-slate-500 hover:bg-slate-50"
                )}
              >
                <Building className="w-4 h-4" />
                Fetch from HIS
              </button>
              <button
                onClick={() => setAddMode("Manual")}
                className={cn(
                  "flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors border-b-2",
                  addMode === "Manual" ? "border-blue-600 text-blue-700 bg-blue-50/50" : "border-transparent text-slate-500 hover:bg-slate-50"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
                Manual Entry
              </button>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-50/30">
              {addMode === "HIS" && (
                <div className="mb-6 p-4 bg-white border border-blue-200 rounded-xl shadow-sm">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Hospital MRN</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g. MRN-12345" 
                      value={newPatient.mrn}
                      onChange={(e) => setNewPatient({ ...newPatient, mrn: e.target.value })}
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none font-mono"
                    />
                    <button onClick={handleHisFetch} className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium text-sm transition-colors shadow-sm">
                      Fetch Data
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    Simulates an HL7 query to external HIS provider
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {addMode === "Manual" && (
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">MRN <span className="text-red-500">*</span></label>
                    <input type="text" value={newPatient.mrn} onChange={e => setNewPatient({...newPatient, mrn: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm font-mono" />
                  </div>
                )}
                <div className={addMode === "HIS" ? "col-span-2" : "col-span-2 sm:col-span-1"}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">Full Name <span className="text-red-500">*</span></label>
                  <input type="text" value={newPatient.name} onChange={e => setNewPatient({...newPatient, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm font-medium" />
                </div>
                
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">Date of Birth</label>
                  <input type="date" value={newPatient.dob} onChange={e => setNewPatient({...newPatient, dob: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm" />
                </div>
                
                <div className="col-span-2">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">Age</label>
                      <input type="number" placeholder="Years" value={newPatient.age} onChange={e => setNewPatient({...newPatient, age: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">Sex</label>
                      <select value={newPatient.sex} onChange={e => setNewPatient({...newPatient, sex: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-sm bg-white">
                        <option>Unknown</option>
                        <option>M</option>
                        <option>F</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">Height (cm)</label>
                      <input type="number" placeholder="cm" value={newPatient.height} onChange={e => setNewPatient({...newPatient, height: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">Weight (kg)</label>
                      <input type="number" placeholder="kg" value={newPatient.weight} onChange={e => setNewPatient({...newPatient, weight: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">Social Status</label>
                      <select value={newPatient.social_status} onChange={e => setNewPatient({...newPatient, social_status: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-sm bg-white">
                        <option>Single</option>
                        <option>Married</option>
                        <option>Divorced</option>
                        <option>Widowed</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">Nationality</label>
                  <input 
                    type="text" 
                    list="nationality-list"
                    value={newPatient.nationality} 
                    onChange={e => setNewPatient({...newPatient, nationality: e.target.value})} 
                    placeholder="Search country..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm" 
                  />
                  <datalist id="nationality-list">
                    {nationalitiesList.map(n => <option key={n.name} value={n.name} />)}
                  </datalist>
                </div>
                
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wider">National ID / Passport No.</label>
                  <input type="text" value={newPatient.national_id} onChange={e => setNewPatient({...newPatient, national_id: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm font-mono" />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Phone Numbers</label>
                    <button onClick={() => setPhonesList([...phonesList, {type: 'Mobile', number: ''}])} className="text-[10px] text-blue-600 font-bold flex items-center gap-1 hover:text-blue-700 transition">
                      <Plus className="w-3 h-3" /> ADD
                    </button>
                  </div>
                  <div className="space-y-2">
                    {phonesList.map((p, i) => (
                      <div key={i} className="flex gap-2">
                        <select 
                          value={p.type} 
                          onChange={e => {
                            const newPhones = [...phonesList];
                            newPhones[i].type = e.target.value;
                            setPhonesList(newPhones);
                          }} 
                          className="w-1/3 px-2 py-2 border border-slate-300 rounded-lg outline-none text-xs focus:border-blue-500"
                        >
                          <option value="Mobile">Mobile</option>
                          <option value="Home">Home</option>
                          <option value="Work">Work</option>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Caregiver">Caregiver</option>
                        </select>
                        <input 
                          type="text" 
                          value={p.number} 
                          onChange={e => {
                            const newPhones = [...phonesList];
                            newPhones[i].number = e.target.value;
                            setPhonesList(newPhones);
                          }} 
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm" 
                        />
                        {phonesList.length > 1 && (
                          <button 
                            onClick={() => setPhonesList(phonesList.filter((_, idx) => idx !== i))} 
                            className="text-slate-400 hover:text-red-500 transition-colors p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="col-span-2 sm:col-span-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Facility & Insurance</label>
                    <button onClick={() => setShowInsuranceModal(true)} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded flex items-center gap-1 font-bold hover:bg-blue-200 transition-colors">
                      <Plus className="w-3 h-3" /> ADD INSURANCE
                    </button>
                  </div>
                  <input type="text" placeholder="Facility Name" value={newPatient.facility} onChange={e => setNewPatient({...newPatient, facility: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm mb-2" />
                  
                  {newPatient.payer_id && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                      <div className="font-semibold text-blue-800">{payersList.find(p => p.id === newPatient.payer_id)?.name}</div>
                      <div className="text-blue-600 font-mono text-[10px] mt-0.5">ID: {newPatient.insurance_id_number}</div>
                    </div>
                  )}
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Detailed Address</label>
                  </div>
                  <textarea 
                    value={newPatient.address} 
                    onChange={e => setNewPatient({...newPatient, address: e.target.value})} 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 outline-none text-sm resize-none"
                    rows={2}
                    placeholder="Enter physical address details..."
                  />
                </div>
                
                <div className="col-span-2 sm:col-span-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Map Location</label>
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        setShowMapPicker(true);
                      }} 
                      className="text-[10px] text-blue-600 font-bold flex items-center gap-1 hover:text-blue-700 transition px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded"
                    >
                      <MapPin className="w-3 h-3" /> DROP EXACT LOCATION
                    </button>
                  </div>
                  <textarea 
                    value={newPatient.location} 
                    onChange={e => setNewPatient({...newPatient, location: e.target.value})} 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none text-sm resize-none bg-slate-50 text-blue-600 font-medium"
                    rows={2}
                    readOnly
                    placeholder="Location Map Link..."
                  />
                </div>

                <div className="col-span-2 text-sm text-slate-500 mt-2 bg-slate-100 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-slate-700">Creation Summary</span>
                  </div>
                  This wizard enrolls a master patient index record and initiates a blank MTM workspace.
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsAddingPatient(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition-colors">
                Cancel
              </button>
              <button 
                onClick={handleSavePatient}
                disabled={!newPatient.mrn || !newPatient.name}
                className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-sm font-bold transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
              >
                Create Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Insurance Configuration Modal */}
      {showInsuranceModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-y-auto max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-blue-50 sticky top-0">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-600" /> Contract & Coverage Link
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
                    value={newPatient.payer_id} 
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        setIsAddingPayer(true);
                        setNewPatient({...newPatient, payer_id: "", contract_id: ""});
                      } else {
                        setNewPatient({...newPatient, payer_id: e.target.value, contract_id: ""});
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
              
              {newPatient.payer_id !== 'OOP' && (
                <>
                  {newPatient.payer_id && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned Contract</label>
                      <select 
                        value={newPatient.contract_id} 
                        onChange={(e) => setNewPatient({...newPatient, contract_id: e.target.value})}
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none text-sm font-medium focus:border-blue-500"
                      >
                        <option value="">Select Contract Coverage...</option>
                        {contractsList.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {newPatient.contract_id && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Coverage Breakdown</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {contractsList.find(c => c.id === newPatient.contract_id)?.coverages && 
                          Object.entries(contractsList.find(c => c.id === newPatient.contract_id).coverages).map(([service, pct]) => (
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
                          list="services-datalist-patients"
                          placeholder="Search Service..."
                          value={newCoverage.service}
                          onChange={e => setNewCoverage({...newCoverage, service: e.target.value})}
                          className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded outline-none focus:border-blue-500 bg-white"
                        />
                        <datalist id="services-datalist-patients">
                          {availableServices
                            .filter(s => !(contractsList.find(c => c.id === newPatient.contract_id)?.coverages?.[s]))
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
                      value={newPatient.insurance_id_number}
                      onChange={(e) => setNewPatient({...newPatient, insurance_id_number: e.target.value})}
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
                </>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowInsuranceModal(false)} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700">Save Insurance</button>
            </div>
          </div>
        </div>
      )}
      {/* Map Picker Modal */}
      <MapPickerModal
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelect={(url) => setNewPatient({...newPatient, location: url})}
      />
    </div>
  );
}
