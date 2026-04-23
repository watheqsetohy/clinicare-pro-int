const fs = require('fs');
const file = 'd:/Healthcare Solutions/MTM Project/MTM/src/pages/sections/SectionAConditions.tsx';
let content = fs.readFileSync(file, 'utf-8');

// 1. Types and initial states
content = content.replace(
  `const [hierarchyConflict, setHierarchyConflict] = useState<{ type: 'child' | 'parent', conflictingCode: string, conflictingTerm: string, conflictingCondition: any } | null>(null);`,
  `const [hierarchyConflict, setHierarchyConflict] = useState<{ type: 'child' | 'parent', conflictingCodes: string[], conflictingTerms: string, conflictingConditions: any[] } | null>(null);`
);
content = content.replace(
  `const [groupBy, setGroupBy] = useState<"None" | "Severity" | "Source">("None");`,
  `const [groupBy, setGroupBy] = useState<"None" | "Severity" | "Source" | "System">("None");`
);

// 2. Select Box
content = content.replace(
  `<option value="None">None</option>`,
  `<option value="None">None</option>\n             <option value="System">Body System</option>`
);

// 3. Dropdown Grouping
content = content.replace(
  `else if (groupBy === "Source") group = condition.source || "Unknown";\n            if (!acc[group]) acc[group] = [];`,
  `else if (groupBy === "Source") group = condition.source || "Unknown";\n            else if (groupBy === "System") group = condition.body_system || "Unknown Body System";\n            if (!acc[group]) acc[group] = [];`
);

// 4. API Response Handle
content = content.replace(
  `if (data.conflict !== 'none') {
                              const conflictingCond = conditions.find(c => c.snomed_code === data.conflictingCode && c.status === "Active");
                              setHierarchyConflict({
                                type: data.conflict,
                                conflictingCode: data.conflictingCode,
                                conflictingTerm: conflictingCond?.term || 'Unknown Condition',
                                conflictingCondition: conflictingCond
                              });
                              if (conflictingCond) {
                                setOnsetDate(conflictingCond.onset || "");
                                setSeverity(conflictingCond.severity || "Moderate");
                                setStatus("Active");
                              }
                           } else {`,
  `if (data.conflict !== 'none') {
                              const conflictingConds = conditions.filter(c => data.conflictingCodes && data.conflictingCodes.includes(c.snomed_code) && c.status === "Active");
                              setHierarchyConflict({
                                type: data.conflict,
                                conflictingCodes: data.conflictingCodes,
                                conflictingTerms: conflictingConds.map(c => c.term).join(', ') || 'Unknown Condition',
                                conflictingConditions: conflictingConds
                              });
                              if (conflictingConds.length > 0) {
                                setOnsetDate(conflictingConds[0].onset || "");
                                setSeverity(conflictingConds[0].severity || "Moderate");
                                setStatus("Active");
                              }
                           } else {`
);

// 5. Alert UI mapping
content = content.replace(
  `{hierarchyConflict && !editConditionId && (
                   <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-4 text-amber-900 shadow-sm relative overflow-hidden shrink-0">
                     <div className="absolute right-0 top-0 opacity-10 pointer-events-none translate-x-4 -translate-y-4">
                        <AlertTriangle className="w-24 h-24 text-amber-500" />
                     </div>
                     <div className="flex items-start gap-3 relative z-10">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                           <h4 className="font-semibold text-amber-800 mb-1">Hierarchical Duplicate Detected</h4>
                           {hierarchyConflict.type === 'child' ? (
                              <p className="text-[13px] text-amber-700/90 leading-relaxed mb-3">
                                 The patient already has a broader condition active (<strong>{hierarchyConflict.conflictingTerm}</strong>). Adding this highly specific sub-condition creates clinical redundancy. It is recommended to deactivate the broader condition.
                              </p>
                           ) : (
                              <p className="text-[13px] text-amber-700/90 leading-relaxed mb-3">
                                 The patient already has a more specific condition active (<strong>{hierarchyConflict.conflictingTerm}</strong>). Adding this broader ancestor term is not recommended as it reduces data specificity.
                              </p>
                           )}
                           <div className="bg-white/60 rounded p-2 text-xs font-mono text-amber-800 border border-amber-200/50 inline-block shadow-sm">
                             Active Record: {hierarchyConflict.conflictingTerm} ({hierarchyConflict.conflictingCode})
                           </div>
                        </div>
                     </div>
                   </div>
                 )}`,
  `{hierarchyConflict && !editConditionId && (
                   <div className={cn("border rounded-xl p-4 shadow-sm relative overflow-hidden shrink-0", hierarchyConflict.type === 'parent' ? "bg-red-50 border-red-200/60 text-red-900" : "bg-amber-50 border-amber-200/60 text-amber-900")}>
                     <div className="absolute right-0 top-0 opacity-10 pointer-events-none translate-x-4 -translate-y-4">
                        <AlertTriangle className={cn("w-24 h-24", hierarchyConflict.type === 'parent' ? "text-red-500" : "text-amber-500")} />
                     </div>
                     <div className="flex items-start gap-3 relative z-10">
                        <AlertTriangle className={cn("w-5 h-5 shrink-0 mt-0.5", hierarchyConflict.type === 'parent' ? "text-red-600" : "text-amber-600")} />
                        <div>
                           <h4 className={cn("font-semibold mb-1", hierarchyConflict.type === 'parent' ? "text-red-800" : "text-amber-800")}>Hierarchical Duplicate Detected</h4>
                           {hierarchyConflict.type === 'child' ? (
                              <p className="text-[13px] text-amber-700/90 leading-relaxed mb-3">
                                 The patient already has a broader condition active (<strong>{hierarchyConflict.conflictingTerms}</strong>). Adding this highly specific sub-condition creates clinical redundancy. It is recommended to deactivate the broader condition(s).
                              </p>
                           ) : (
                              <p className="text-[13px] text-red-700/90 leading-relaxed mb-3">
                                 A more specific condition already exists (<strong>{hierarchyConflict.conflictingTerms}</strong>). Adding a broader term is restricted to preserve clinical data quality.
                              </p>
                           )}
                           <div className={cn("bg-white/60 rounded p-2 text-xs font-mono inline-block shadow-sm border", hierarchyConflict.type === 'parent' ? "text-red-800 border-red-200/50" : "text-amber-800 border-amber-200/50")}>
                             Active Record(s): {hierarchyConflict.conflictingTerms}
                           </div>
                        </div>
                     </div>
                   </div>
                 )}`
);

// 6. Action button Replacement
content = content.replace(
  `{hierarchyConflict && !editConditionId ? (
                     <button 
                       onClick={() => {
                          if (!onsetDate) return alert("Onset date is required");
                          setIsSaving(true);
                          
                          const conflictPayload = {
                            ...hierarchyConflict.conflictingCondition,
                            status: 'Inactive'
                          };

                          // 1. Deactivate existing
                          fetchWithAuth(\`/api/patients/\${patientId}/conditions/\${hierarchyConflict.conflictingCondition.id}\`, {
                             method: 'PUT',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify(conflictPayload)
                          }).then(() => {
                             // 2. Add new
                             const payload = {
                               term: selectedConcept?.term,
                               snomed_code: selectedConcept?.conceptId,
                               onset: onsetDate,
                               severity: severity,
                               status: status,
                               source: source,
                               notes: description
                             };
                             return fetchWithAuth(\`/api/patients/\${patientId}/conditions\`, {
                               method: 'POST',
                               headers: { 'Content-Type': 'application/json' },
                               body: JSON.stringify(payload)
                             });
                          }).then(res => res.json())
                          .then(() => {
                            setIsAddModalOpen(false);
                            setAddStep(1);
                            setEditConditionId(null);
                            setOnsetDate("");
                            setDescription("");
                            setHierarchyConflict(null);
                            setDuplicateError(null);
                            fetchConditions(); // Refresh UI
                          })
                          .catch(err => console.error(err))
                          .finally(() => setIsSaving(false));
                       }}
                       disabled={isSaving || !onsetDate}
                       className="px-6 py-2.5 bg-amber-600 text-white font-medium hover:bg-amber-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                     >
                       {isSaving ? "Replacing..." : "Replace & Deactivate Old"}
                     </button>
                  ) : (
                  <button`,
  `{hierarchyConflict && !editConditionId && hierarchyConflict.type === 'child' ? (
                     <button 
                       onClick={async () => {
                          if (!onsetDate) return alert("Onset date is required");
                          setIsSaving(true);
                          
                          try {
                            const deactivatePromises = hierarchyConflict.conflictingConditions.map((cond: any) => {
                               return fetchWithAuth(\`/api/patients/\${patientId}/conditions/\${cond.id}\`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ ...cond, status: 'Inactive' })
                               });
                            });
                            await Promise.all(deactivatePromises);

                            const payload = {
                              term: selectedConcept?.term,
                              snomed_code: selectedConcept?.conceptId,
                              onset: onsetDate,
                              severity: severity,
                              status: status,
                              source: source,
                              notes: description
                            };
                            await fetchWithAuth(\`/api/patients/\${patientId}/conditions\`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(payload)
                            });
                            
                            setIsAddModalOpen(false);
                            setAddStep(1);
                            setEditConditionId(null);
                            setOnsetDate("");
                            setDescription("");
                            setHierarchyConflict(null);
                            setDuplicateError(null);
                            fetchConditions(); // Refresh UI
                          } catch (err) {
                             console.error(err);
                          } finally {
                             setIsSaving(false);
                          }
                       }}
                       disabled={isSaving || !onsetDate}
                       className="px-6 py-2.5 bg-amber-600 text-white font-medium hover:bg-amber-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                     >
                       {isSaving ? "Replacing..." : "Replace & Deactivate Old"}
                     </button>
                  ) : hierarchyConflict && !editConditionId && hierarchyConflict.type === 'parent' ? null : (
                  <button`
);

// 7. Reactivation handler
content = content.replace(
  `alert(\`Cannot reactivate: This condition creates a hierarchical conflict with an existing active condition. Please deactivate the conflicting condition first.\`);`,
  `alert(\`Cannot reactivate: This condition creates a hierarchical conflict with an existing active condition. Please evaluate conditions manually first.\`);`
);

fs.writeFileSync(file, content);
console.log('Update Complete');
