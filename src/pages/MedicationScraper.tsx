import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { fetchWithAuth } from '../lib/authSession';
import { Download, Search, UploadCloud, FileSpreadsheet, CheckCircle, RefreshCcw } from 'lucide-react';

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 7; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

export function MedicationScraper() {
  const [tab, setTab] = useState('single');

  // ── Single search state ──
  const [singleInput, setSingleInput]     = useState('');
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [customCode, setCustomCode]       = useState('');

  // ── Bulk CSV state ──
  const [csvHasCode, setCsvHasCode] = useState(false);   // Column A = code, Column B = term

  // ── Shared ──
  const [rawResults, setRawResults]         = useState<any[]>([]);
  const [verifiedResults, setVerifiedResults] = useState<any[]>([]);
  const [processing, setProcessing]         = useState(false);
  const [progressMsg, setProgressMsg]       = useState('');
  const [selections, setSelections]         = useState<any>({});

  // Per-card unified filter: { [code]: string }
  const [filters, setFilters] = useState<any>({});

  // ─────────────────────────────── handlers ──────────────────────────────────
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleInput.trim()) return;
    const resolvedCode = (useCustomCode && customCode.trim()) ? customCode.trim().toUpperCase() : null;
    startScraping([{ term: singleInput.trim(), code: resolvedCode }]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: ({ data }: any) => {
        const items = data
          .filter((_: any, i: number) => i > 0) // skip header row
          .map((row: any) => {
            let code = null;
            let term = '';
            
            if (csvHasCode && row.length >= 2) {
              code = String(row[0] || '').trim().toUpperCase() || null;
              term = String(row[1] || '').trim();
            } else {
              // Smart Inference: if the user forgot to toggle the button, 
              // but Column A contains simple numbers/IDs (like '1', '2', '3')
              // and Column B has the name, we automatically rescue the data.
              if (row.length >= 2 && row[1]) {
                const colA = String(row[0]).trim();
                const colB = String(row[1]).trim();
                if (colA.length <= 5 || !isNaN(Number(colA))) {
                  code = colA.toUpperCase() || null;
                  term = colB;
                } else {
                  term = colA; 
                }
              } else {
                term = String(row[0] || '').trim();
              }
            }
            return { code, term };
          })
          .filter((i: any) => !!i.term);
        startScraping(items);
      }
    });
  };

  const startScraping = async (items: any[]) => {
    setProcessing(true);
    setProgressMsg(`Scraping ${items.length} item${items.length > 1 ? 's' : ''} concurrently...`);
    try {
      const res = await fetchWithAuth('/api/med-scraper/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: items.map(i => i.term) })
      });
      if (!res.ok) throw new Error('API failed');
      const data = await res.json();

      const resultsWithCodes = data.map((itemData: any, idx: number) => ({
        ...itemData,
        code: items[idx].code || generateCode()
      }));
      setRawResults(resultsWithCodes);
    } catch (err: any) {
      console.error(err);
      setRawResults(items.map(i => ({
        term: i.term, code: i.code || generateCode(),
        drugeyeResults: [], vezeetaResults: [], isGoogleFallback: false, error: true
      })));
    }
    setProcessing(false);
    setProgressMsg('');
  };

  useEffect(() => {
    const initSel: any = {};
    const initFilters: any = {};
    rawResults.forEach(r => {
      initSel[r.code] = {
        drugeye: r.drugeyeResults.length > 0 ? 0 : -1,
        vezeeta: r.vezeetaResults.length > 0 ? 0 : -1
      };
      initFilters[r.code] = '';
    });
    setSelections(initSel);
    setFilters(initFilters);
  }, [rawResults]);

  const setFilter = (code: string, val: string) => {
    setFilters((prev: any) => ({ ...prev, [code]: val }));
  };

  const finalizeVerification = async () => {
    setProcessing(true);
    const finalItems = [];
    for (let i = 0; i < rawResults.length; i++) {
      const r   = rawResults[i];
      const sel = selections[r.code];
      setProgressMsg(`Finalizing ${i + 1}/${rawResults.length}: ${r.term}`);

      const de = sel && sel.drugeye >= 0 ? r.drugeyeResults[sel.drugeye] : null;
      const vz = sel && sel.vezeeta >= 0 ? r.vezeetaResults[sel.vezeeta] : null;

      let webPath = '', imageFileName = '';
      if (vz && vz.image) {
        try {
          const dRes = await fetchWithAuth('/api/med-scraper/download-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: vz.image, code: r.code })
          });
          const dData = await dRes.json();
          if (dData.success) { webPath = dData.filePath; imageFileName = dData.fileName; }
          else console.error('Image download error:', dData.error);
        } catch (e: any) { console.error('Image download exception:', e.message); }
      }

      finalItems.push({
        ItemCode: r.code,
        SearchTerm: r.term,
        DrugeyeBrandName:   de ? de.name : '',
        DrugeyePrice:       de ? de.price : '',
        DrugeyeAPI:         de ? de.api : '',
        DrugeyeCategory:    de ? de.category : '',
        DrugeyeManufacturer:de ? de.manufacturer : '',
        VezeetaBrandName:   vz ? vz.name : '',
        VezeetaPrice:       vz ? vz.price : '',
        ImageCode:          r.code,
        ImageFileName:      imageFileName,
        ImageFolder:        'public\\downloads',
        _webPath:           webPath
      });
    }
    setVerifiedResults(finalItems);
    setRawResults([]);
    setProcessing(false);
    setProgressMsg('');
  };

  const downloadCSV = () => {
    if (!verifiedResults.length) return;
    const exportData = verifiedResults.map(({ _webPath, ...rest }) => rest);
    const csv = '\uFEFF' + Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url });
    a.setAttribute('download', 'medication_results.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="w-full h-full p-8 overflow-y-auto bg-slate-50/50">
      <div className="max-w-7xl mx-auto animate-fade-in-up">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
          <Search className="w-8 h-8 text-blue-600" />
          Medication Info Scraper
        </h1>
        <p className="text-slate-500 mt-2">Intelligent cross-platform web extraction mapped directly to MTM coding conventions.</p>
      </div>

      {/* ── Input Phase ── */}
      {!rawResults.length && !verifiedResults.length && !processing && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-2xl mx-auto">
          <div className="flex border-b border-slate-200 w-full">
            <button
              className={`flex-1 flex justify-center items-center gap-2 py-4 text-sm font-semibold transition-colors ${tab === 'single' ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
              onClick={() => setTab('single')}
            >
              <Search className="w-4 h-4" /> Single Search
            </button>
            <button
              className={`flex-1 flex justify-center items-center gap-2 py-4 text-sm font-semibold transition-colors ${tab === 'bulk' ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
              onClick={() => setTab('bulk')}
            >
              <FileSpreadsheet className="w-4 h-4" /> Bulk CSV
            </button>
          </div>

          <div className="p-8 space-y-6">
            {/* ── Single search ── */}
            {tab === 'single' && (
              <form onSubmit={handleSingleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Medication Name</label>
                  <input type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors placeholder:text-slate-400 font-medium"
                    placeholder="E.g., Panadol, Amoxil..."
                    value={singleInput} onChange={e => setSingleInput(e.target.value)} />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button type="button" 
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${useCustomCode ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                    onClick={() => setUseCustomCode(v => !v)}>
                    {useCustomCode ? '✓ Custom Code Active' : '+ Custom Code'}
                  </button>
                  <span className="text-xs text-slate-500">Maps directly to ImageCode logic</span>
                </div>
                
                {useCustomCode && (
                  <div>
                    <input type="text"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono text-sm tracking-widest placeholder:tracking-normal placeholder:font-sans"
                      placeholder="ENTER-CODE-HERE"
                      value={customCode}
                      onChange={e => setCustomCode(e.target.value)} />
                  </div>
                )}

                <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex justify-center items-center gap-2 mt-4">
                  <Search className="w-5 h-5" /> Launch Scraper
                </button>
              </form>
            )}

            {/* ── Bulk CSV ── */}
            {tab === 'bulk' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <button type="button" 
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${csvHasCode ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                    onClick={() => setCsvHasCode(v => !v)}>
                    {csvHasCode ? '✓ Expecting Code Column' : '+ Toggle Code Column'}
                  </button>
                  <span className="text-xs text-slate-500">
                    {csvHasCode ? 'Col A (Code) · Col B (Term)' : 'Col A (Term only)'}
                  </span>
                </div>

                <label className="border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-colors group">
                  <UploadCloud className="w-12 h-12 text-slate-400 group-hover:text-blue-500 mb-4 transition-colors" />
                  <div className="text-[17px] font-semibold text-slate-700 mb-1">Upload Data File</div>
                  <div className="text-sm text-slate-500">Drop a formatted CSV here or click to browse</div>
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Processing State ── */}
      {processing && (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <RefreshCcw className="w-12 h-12 text-blue-500 animate-spin mb-6" />
          <h3 className="text-2xl font-bold text-slate-900 mb-2">Analyzing Networks...</h3>
          <p className="text-slate-500 font-medium">{progressMsg}</p>
        </div>
      )}

      {/* ── Verification Queue ── */}
      {!processing && rawResults.length > 0 && Object.keys(selections).length > 0 && (
        <div className="animate-fade-in-up">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Verification Queue</h2>
              <p className="text-slate-500 text-sm mt-1">Review the raw hits and select the medically accurate match per source.</p>
            </div>
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 shadow-sm transition-colors" onClick={finalizeVerification}>
              <CheckCircle className="w-5 h-5" /> Compile Assets
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {rawResults.map((r) => {
              const query = (filters[r.code] || '').toLowerCase();
              const filteredDE = r.drugeyeResults.filter((de: any) =>
                !query || de.name.toLowerCase().includes(query)
              );
              const filteredVZ = r.vezeetaResults.filter((vz: any) =>
                !query || vz.name.toLowerCase().includes(query)
              );

              return (
                <div key={r.code} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className="bg-slate-50/80 border-b border-slate-200 p-4 flex justify-between items-center">
                    <h3 className="text-[17px] font-bold text-slate-800 line-clamp-1 flex-1 pr-3">{r.term}</h3>
                    <span className="bg-slate-200 text-slate-700 px-2.5 py-1 rounded font-mono text-xs font-semibold shrink-0 shadow-sm border border-slate-300">
                      {r.code}
                    </span>
                  </div>

                  {/* Body Sub-filter */}
                  <div className="p-4 flex-1 flex flex-col gap-6">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={filters[r.code] || ''}
                        onChange={e => setFilter(r.code, e.target.value)}
                        placeholder="Refine sub-results..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none"
                      />
                    </div>

                    {/* DrugEye Block */}
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">DrugEye Results</span>
                        {filteredDE.length > 0 && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.isGoogleFallback ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-100 text-blue-800 border border-blue-200'}`}>
                            {r.isGoogleFallback ? 'GOOGLE FALLBACK' : `${filteredDE.length} FOUND`}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-48 scrollbar-thin">
                        {filteredDE.length === 0 ? (
                          <div className="text-sm text-slate-400 bg-slate-50 rounded-lg p-3 border border-slate-100 text-center italic">No viable results</div>
                        ) : (
                          filteredDE.map((de: any, idx: number) => {
                            const realIdx = r.drugeyeResults.indexOf(de);
                            const isSel = selections[r.code]?.drugeye === realIdx;
                            return (
                              <div key={realIdx}
                                className={`flex flex-col p-3 border rounded-lg cursor-pointer transition-all ${isSel ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 shadow-sm' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
                                onClick={() => {
                                  const currentSel = selections[r.code]?.drugeye;
                                  setSelections({ ...selections, [r.code]: { ...selections[r.code], drugeye: currentSel === realIdx ? -1 : realIdx } });
                                }}>
                                <div className={`font-semibold text-sm ${isSel ? 'text-blue-900' : 'text-slate-800'}`}>{de.name}</div>
                                <div className="text-xs text-slate-500 mt-1 flex justify-between">
                                  <span className="font-medium text-emerald-600">{de.price}</span>
                                  <span className="truncate ml-2">{de.category}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Vezeeta Block */}
                    <div className="flex-1 flex flex-col min-h-0 pt-4 border-t border-slate-100">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vezeeta Media</span>
                        {filteredVZ.length > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                            {filteredVZ.length} FOUND
                          </span>
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-48 scrollbar-thin">
                        {filteredVZ.length === 0 ? (
                          <div className="text-sm text-slate-400 bg-slate-50 rounded-lg p-3 border border-slate-100 text-center italic">No visual media</div>
                        ) : (
                          filteredVZ.map((vz: any, idx: number) => {
                            const realIdx = r.vezeetaResults.indexOf(vz);
                            const isSel = selections[r.code]?.vezeeta === realIdx;
                            return (
                              <div key={realIdx}
                                className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-all ${isSel ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500 shadow-sm' : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'}`}
                                onClick={() => {
                                  const currentSel = selections[r.code]?.vezeeta;
                                  setSelections({ ...selections, [r.code]: { ...selections[r.code], vezeeta: currentSel === realIdx ? -1 : realIdx } });
                                }}>
                                {vz.image ? (
                                  <img src={vz.image} alt="" className="w-10 h-10 rounded-md object-cover border border-slate-200 shrink-0 bg-white" />
                                ) : (
                                  <div className="w-10 h-10 rounded-md bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">?</div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className={`font-semibold text-sm truncate ${isSel ? 'text-teal-900' : 'text-slate-800'}`}>{vz.name}</div>
                                  <div className="text-xs text-slate-500 mt-0.5 font-medium">{vz.price}</div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Final Results ── */}
      {!processing && verifiedResults.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden animate-fade-in-up">
          <div className="flex justify-between items-end p-6 border-b border-slate-200 bg-slate-50/50">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Extracted Schema Ready</h2>
              <p className="text-slate-500 text-sm mt-1">
                Media artifacts synced to: <code className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-semibold">public\downloads\</code>
              </p>
            </div>
            <div className="flex gap-3">
              <button className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-5 py-2.5 rounded-lg font-semibold shadow-sm transition-colors" onClick={() => { setVerifiedResults([]); setRawResults([]); }}>
                Reset Queue
              </button>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 shadow-sm transition-colors" onClick={downloadCSV}>
                <Download className="w-5 h-5" /> Export DB CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Item Code</th>
                  <th className="px-6 py-4">Search Term</th>
                  <th className="px-6 py-4">Clinical Brand (DE)</th>
                  <th className="px-6 py-4">Cost (DE)</th>
                  <th className="px-6 py-4 max-w-[200px]">Active Ingredient</th>
                  <th className="px-6 py-4">Taxonomy (DE)</th>
                  <th className="px-6 py-4">Retail Brand (VZ)</th>
                  <th className="px-6 py-4">Cost (VZ)</th>
                  <th className="px-6 py-4">Media</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {verifiedResults.map((v, i) => (
                  <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-4"><span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-1 rounded text-xs font-bold font-mono">{v.ItemCode}</span></td>
                    <td className="px-6 py-4 font-medium text-slate-900">{v.SearchTerm}</td>
                    <td className="px-6 py-4 max-w-[180px] truncate" title={v.DrugeyeBrandName}>{v.DrugeyeBrandName || '—'}</td>
                    <td className="px-6 py-4 font-medium text-emerald-600">{v.DrugeyePrice || '—'}</td>
                    <td className="px-6 py-4 max-w-[200px] truncate" title={v.DrugeyeAPI}>{v.DrugeyeAPI || '—'}</td>
                    <td className="px-6 py-4 truncate max-w-[150px]">{v.DrugeyeCategory || '—'}</td>
                    <td className="px-6 py-4 max-w-[180px] truncate" title={v.VezeetaBrandName}>{v.VezeetaBrandName || '—'}</td>
                    <td className="px-6 py-4 font-medium text-emerald-600">{v.VezeetaPrice || '—'}</td>
                    <td className="px-6 py-4">
                      {v._webPath ? (
                        <div className="w-10 h-10 rounded border border-slate-200 bg-white overflow-hidden shadow-sm">
                          <img src={v._webPath} className="w-full h-full object-cover" alt="" />
                        </div>
                      ) : <span className="text-slate-400 italic text-xs">No media</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
