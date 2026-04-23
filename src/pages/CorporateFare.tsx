import React, { useState, useEffect } from "react";
import { 
  Building2, Plus, Save, ArrowLeft, RotateCcw, X, Copy,
  Trash2, ChevronRight, ChevronDown, Network, Check, Briefcase, Map, GitMerge, FileDigit, Settings2
} from "lucide-react";
import * as Icons from "lucide-react";
import { CorporateNode, getCorporateTree, saveCorporateTree, getCorporateLayers, saveCorporateLayers, CorporateLayerDef, getClinicalReferences, saveClinicalReferences } from "../lib/corporateStorage";
import { fetchWithAuth } from "../lib/authSession";

export function CorporateFare() {
  const [nodes, setNodes] = useState<CorporateNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  
  // Resizing and Tree States
  const [leftWidth, setLeftWidth] = useState(33);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState('');
  
  // Layer Dictionary State
  const [layers, setLayers] = useState<CorporateLayerDef[]>([]);
  const [isLayerModalOpen, setIsLayerModalOpen] = useState(false);
  
  // Clinical Reference State
  const [clinicalRefs, setClinicalRefs] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      const [n, l, r] = await Promise.all([getCorporateTree(), getCorporateLayers(), getClinicalReferences()]);
      setNodes(n);
      setLayers(l);
      setClinicalRefs(r);
    };
    load().catch(console.error);
  }, []);

  // Debounced Auto-Save
  useEffect(() => {
    if (nodes.length === 0) return;
    const timer = setTimeout(async () => {
      await saveCorporateTree(nodes);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }, 800);
    return () => clearTimeout(timer);
  }, [nodes]);

  // Resizing logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = (e.clientX / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) setLeftWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleSave = async () => {
    await saveCorporateTree(nodes);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleRestoreDefaults = async () => {
    if (window.confirm("Restore original corporate structure? All custom mapping will be lost.")) {
      const defaults = await fetchWithAuth('/api/config/corporate_tree').then(r => r.ok ? r.json() : []).catch(() => []);
      setNodes(defaults);
      setActiveNodeId(null);
    }
  };

  // Node Traversal Utilities
  const findNode = (tree: CorporateNode[], id: string): CorporateNode | null => {
    for (const node of tree) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const updateNode = (tree: CorporateNode[], id: string, updates: Partial<CorporateNode>): CorporateNode[] => {
    return tree.map(node => {
      if (node.id === id) return { ...node, ...updates };
      if (node.children) return { ...node, children: updateNode(node.children, id, updates) };
      return node;
    });
  };

  const removeNode = (tree: CorporateNode[], id: string): CorporateNode[] => {
    return tree.filter(node => {
      if (node.id === id) return false;
      if (node.children) node.children = removeNode(node.children, id);
      return true;
    });
  };

  const duplicateSubtree = (node: CorporateNode): CorporateNode => {
    return {
      ...node,
      id: `corp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      title: node.title.endsWith(' (Copy)') ? node.title : `${node.title} (Copy)`,
      facilityCode: node.facilityCode ? `${node.facilityCode}-COPY` : undefined,
      children: node.children ? node.children.map(duplicateSubtree) : []
    };
  };

  const duplicateNode = (targetId: string) => {
    const originalNode = findNode(nodes, targetId);
    if (!originalNode) return;

    const copy = duplicateSubtree(originalNode);
    let newActiveId = copy.id;

    // Is it a root node?
    if (nodes.find(n => n.id === targetId)) {
      setNodes([...nodes, copy]);
      setActiveNodeId(newActiveId);
      return;
    }

    // Otherwise append to its parent
    const appendToParent = (tree: CorporateNode[]): CorporateNode[] => {
      return tree.map(node => {
        if (node.children?.some(c => c.id === targetId)) {
          setExpandedNodes(prev => new Set(prev).add(node.id));
          return { ...node, children: [...node.children, copy] };
        }
        if (node.children) return { ...node, children: appendToParent(node.children) };
        return node;
      });
    };
    
    setNodes(appendToParent(nodes));
    setActiveNodeId(newActiveId);
  };

  const addNode = (parentId: string | null = null) => {
    const newNode: CorporateNode = {
      id: `corp_${Date.now()}`,
      title: parentId ? "New Branch" : "New National Group",
      type: layers.length > 0 ? layers[0].title : "Group",
      children: []
    };

    if (!parentId) {
      setNodes([...nodes, newNode]);
    } else {
      const addChild = (tree: CorporateNode[]): CorporateNode[] => {
        return tree.map(node => {
          if (node.id === parentId) {
            setExpandedNodes(prev => new Set(prev).add(node.id));
            const parentLayer = layers.find(l => l.title === node.type);
            // Block branching if the layer demands a unique code (Acting as a facility leaf node)
            if (parentLayer?.requiresCode) return node;
            return { ...node, children: [...(node.children || []), newNode] };
          }
          if (node.children) return { ...node, children: addChild(node.children) };
          return node;
        });
      };
      setNodes(addChild(nodes));
    }
    setActiveNodeId(newNode.id);
  };

  const activeNode = activeNodeId ? findNode(nodes, activeNodeId) : null;

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTree = (treeNodes: CorporateNode[], level = 0): React.ReactNode => {
    return treeNodes.map((node) => {
      const isActive = activeNodeId === node.id;
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = treeSearch ? true : expandedNodes.has(node.id);
      
      const layerDef = layers.find(l => l.title === node.type);
      // @ts-ignore
      let IconCmp = layerDef?.iconName && Icons[layerDef.iconName] ? Icons[layerDef.iconName] : Network;

      return (
        <div key={node.id} className="select-none">
          <div 
            onClick={() => setActiveNodeId(node.id)}
            style={{ paddingLeft: `${(level * 1.5) + 0.5}rem` }}
            className={`flex items-center py-2 pr-4 border-l-2 cursor-pointer transition-colors ${
              isActive 
                ? 'bg-blue-50 dark:bg-slate-800/80 border-[#2960DC]' 
                : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div 
              onClick={hasChildren ? (e) => toggleExpand(node.id, e) : undefined}
              className={`w-5 h-5 flex flex-col items-center justify-center shrink-0 rounded-md transition-colors ${hasChildren ? 'hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer' : ''}`}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />
              ) : (
                <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              )}
            </div>
            
            <div className="flex items-center gap-2 min-w-0 flex-1">
               <IconCmp className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#2960DC]' : layerDef?.requiresCode ? 'text-emerald-600' : 'text-slate-500'}`} />
               <span className={`text-sm truncate ${isActive ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-600 dark:text-slate-400'}`}>
                 {node.title}
               </span>
               {(() => {
                 const BADGE_PALETTE = [
                   'bg-violet-100 text-violet-700 border border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700',
                   'bg-sky-100 text-sky-700 border border-sky-300 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700',
                   'bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700',
                   'bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700',
                   'bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700',
                 ];
                 const idx = layers.findIndex(l => l.title === node.type);
                 const cls = BADGE_PALETTE[(idx < 0 ? 0 : idx) % BADGE_PALETTE.length];
                 return (
                   <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${cls}`}>
                     {node.type}
                   </span>
                 );
               })()}
            </div>
          </div>
          
          {hasChildren && isExpanded && (
            <div className="w-full">
              {renderTree(node.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 shrink-0 bg-[#2960DC] text-white flex items-center justify-between px-6 shadow-md z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => window.history.back()} className="hover:bg-white/10 p-2 rounded-full transition-colors" title="Back to Super Admin Dashboard">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 border-l border-white/20 pl-4">
            <Network className="w-6 h-6 text-blue-100" />
            <div>
              <h1 className="font-semibold text-lg leading-tight tracking-wide shadow-sm">Corporate Fare Structure</h1>
              <p className="text-[10px] text-blue-200 font-medium uppercase tracking-widest opacity-90">Enterprise Network Modeler</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRestoreDefaults}
            className="px-4 py-2 hover:bg-slate-800/50 text-white text-sm border-transparent font-semibold rounded-lg flex items-center gap-2 transition-colors opacity-80 hover:opacity-100"
          >
            <RotateCcw className="w-4 h-4" /> Reset Overrides
          </button>
          
          <button 
            onClick={() => setIsLayerModalOpen(true)}
            className="px-4 py-2 bg-slate-800/20 hover:bg-slate-800/60 text-white text-sm border-transparent font-semibold rounded-lg flex items-center gap-2 transition-colors ml-2"
          >
            <Settings2 className="w-4 h-4" /> Dictionary
          </button>
          
          <button 
            onClick={() => addNode(null)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm border border-white/20 font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-inner ml-2"
          >
            <Plus className="w-4 h-4" /> Add Corporate Group
          </button>

          <button 
            onClick={handleSave}
            className={`px-5 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all shadow-md ml-4 border ${
              isSaved 
                ? 'bg-emerald-500 border-emerald-600 text-white ring-2 ring-emerald-500/50' 
                : 'bg-white text-[#2960DC] border-white hover:bg-blue-50'
            }`}
          >
            {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isSaved ? 'Deployed!' : 'Publish Structure'}
          </button>
        </div>
      </header>

      {/* Main Split-Pane Workspace */}
      <main className="flex flex-1 overflow-hidden relative">
        
        {/* Left Pane - Tree Explorer */}
        <div style={{ width: `${leftWidth}%` }} className="h-full flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 relative overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 space-y-2">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Enterprise Network</h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Search units..."
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#2960DC] outline-none transition-all"
              />
              <svg className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto w-full pb-20 py-2">
            {renderTree((() => {
              if (!treeSearch) return nodes;
              const q = treeSearch.toLowerCase();
              const filter = (ns: CorporateNode[]): CorporateNode[] =>
                ns.reduce<CorporateNode[]>((acc, n) => {
                  const kids = filter(n.children || []);
                  if (n.title.toLowerCase().includes(q) || kids.length > 0)
                    acc.push({ ...n, children: kids });
                  return acc;
                }, []);
              return filter(nodes);
            })())}
            {nodes.length === 0 && (
              <div className="p-8 text-center">
                <Network className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                <p className="text-slate-500 text-sm">No corporate domains built.</p>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Resizer */}
        <div 
          onMouseDown={() => setIsResizing(true)}
          className="w-2 cursor-col-resize hover:bg-[#2960DC]/20 active:bg-[#2960DC]/40 z-10 -ml-1 transition-colors relative"
          style={{ height: '100%' }}
        />

        {/* Right Pane - Inspector */}
        <div className="flex-1 h-full bg-white dark:bg-[#0B1120] overflow-y-auto overflow-x-hidden relative flex flex-col">
          {activeNode ? (() => {
            const activeLayer = layers.find(l => l.title === activeNode.type);
            return (
            <div className="max-w-4xl w-full mx-auto p-8 lg:p-12 space-y-10 pb-32">
              
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                    Structure Inspector
                    <span className={`px-2 py-0.5 text-[10px] rounded uppercase tracking-wider font-bold ${
                      activeLayer?.requiresCode ? 'bg-emerald-100 text-emerald-700 mt-0.5' : 'bg-slate-100 text-slate-600 mt-0.5 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {activeNode.type}
                    </span>
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure metadata and structural alignment for this enterprise unit.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => addNode(activeNode.id)}
                    disabled={activeLayer?.requiresCode}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                      activeLayer?.requiresCode 
                       ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600' 
                       : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30'
                    }`}
                  >
                    <Plus className="w-4 h-4" /> Nest Under Node
                  </button>
                  <button 
                    onClick={() => duplicateNode(activeNode.id)}
                    className="px-4 py-2 bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center"
                    title="Duplicate Entity (All Layers)"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => {
                      if (window.confirm("Delete this node? All nested branches will be permanently lost.")) {
                        setNodes(removeNode(nodes, activeNode.id));
                        setActiveNodeId(null);
                      }
                    }}
                    className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Node Configuration */}
              <div className="bg-slate-50 dark:bg-slate-900/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 md:col-span-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Entity Title</label>
                    
                    <input 
                      value={activeNode.title}
                      onChange={(e) => setNodes(updateNode(nodes, activeNode.id, { title: e.target.value }))}
                      onBlur={() => {
                        // Dynamically train the Clinical Master Reference Dictionary if it's a new term
                        if (activeLayer?.useReferenceList && activeNode.title.trim() !== '') {
                          if (!clinicalRefs.includes(activeNode.title.trim())) {
                            const updatedRefs = [...clinicalRefs, activeNode.title.trim()];
                            setClinicalRefs(updatedRefs);
                            saveClinicalReferences(updatedRefs);
                          }
                        }
                      }}
                      list={activeLayer?.useReferenceList ? "master-clinical-refs" : undefined}
                      placeholder={activeLayer?.useReferenceList ? "Select or enter master department..." : "e.g. Cleopatra Main Branch..."}
                      className="w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#2960DC] transition-all font-semibold text-sm"
                    />
                    
                    {activeLayer?.useReferenceList && (
                      <p className="text-[10px] uppercase font-bold text-[#2960DC] mt-2 tracking-wider flex items-center gap-1"><Check className="w-3 h-3" /> Master Reference Enforced</p>
                    )}

                    <datalist id="master-clinical-refs">
                      {clinicalRefs.map(ref => (
                        <option key={ref} value={ref} />
                      ))}
                    </datalist>

                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Unit Description (Optional)</label>
                    <textarea 
                      value={activeNode.description || ''}
                      onChange={(e) => setNodes(updateNode(nodes, activeNode.id, { description: e.target.value }))}
                      placeholder="Specialty or regional context..."
                      rows={2}
                      className="w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#2960DC] transition-all text-sm resize-none"
                    />
                  </div>
                </div>
                
                <div className="md:col-span-1 border-l border-slate-200 dark:border-slate-800 pl-8 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Corporate Classification</label>
                    <select
                      value={activeNode.type}
                      onChange={(e) => setNodes(updateNode(nodes, activeNode.id, { type: e.target.value }))}
                      className="w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#2960DC] transition-all font-semibold text-sm appearance-none cursor-pointer"
                    >
                      {layers.map(layer => (
                        <option key={layer.id} value={layer.title}>{layer.title}</option>
                      ))}
                    </select>
                  </div>
                  
                  {activeLayer?.requiresCode && (
                    <div className="animate-in fade-in slide-in-from-top-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-500/30 rounded-xl mt-4">
                      <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                        <FileDigit className="w-4 h-4" /> Facility Identity
                      </label>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        {/* Facility Code */}
                        <div>
                          <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Unique Code</p>
                          <input
                            value={activeNode.facilityCode || ''}
                            onChange={(e) => setNodes(updateNode(nodes, activeNode.id, { facilityCode: e.target.value }))}
                            placeholder="e.g. CLEO-1001"
                            className="w-full p-2.5 bg-white dark:bg-slate-800 border border-[#2960DC]/50 rounded-lg outline-none focus:ring-2 focus:ring-[#2960DC] transition-all font-mono font-bold text-sm tracking-widest text-[#2960DC] dark:text-[#4F84F6]"
                          />
                        </div>
                        {/* Acronym */}
                        <div>
                          <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Acronym</p>
                          <input
                            value={activeNode.acronym || ''}
                            onChange={(e) => setNodes(updateNode(nodes, activeNode.id, { acronym: e.target.value.toUpperCase() }))}
                            placeholder="e.g. NBH"
                            maxLength={10}
                            className="w-full p-2.5 bg-white dark:bg-slate-800 border border-emerald-500/50 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono font-bold text-sm tracking-widest text-emerald-700 dark:text-emerald-400 uppercase"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-[#2960DC]/80 dark:text-blue-300/80 mt-2 font-medium">Critical: This identifier connects to clinical mapping bypassing DB foreign constraints.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })() : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600">
              <Network className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a Corporate Unit</p>
              <p className="text-sm mt-2 opacity-70">Define groups, branches, and final facility code parameters.</p>
            </div>
          )}
        </div>
      </main>

      {/* Governance Modal */}
      {isLayerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-[#2960DC]" /> Layer Governance
                </h3>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-1">Official Master Dictionary</p>
              </div>
              <button onClick={() => setIsLayerModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid gap-4">
                {layers.map((layer, idx) => (
                  <div key={layer.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Layer Title</label>
                        <input 
                          value={layer.title}
                          onChange={async (e) => {
                            const newLayers = [...layers];
                            newLayers[idx] = { ...layer, title: e.target.value };
                            setLayers(newLayers);
                            try { await saveCorporateLayers(newLayers); } catch (err) { console.error('Failed to save layers:', err); }
                          }}
                          className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-[#2960DC] outline-none"
                        />
                      </div>
                      <div className="w-24 shrink-0">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Icon</label>
                        <select 
                          value={layer.iconName}
                          onChange={async (e) => {
                            const newLayers = [...layers];
                            newLayers[idx] = { ...layer, iconName: e.target.value };
                            setLayers(newLayers);
                            try { await saveCorporateLayers(newLayers); } catch (err) { console.error('Failed to save layers:', err); }
                          }}
                          className="w-full mt-1 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#2960DC] outline-none cursor-pointer"
                        >
                          <option value="Map">Map</option>
                          <option value="GitMerge">Branch</option>
                          <option value="Network">Network</option>
                          <option value="Building2">Hospital</option>
                          <option value="Briefcase">Case</option>
                          <option value="Activity">Pulse</option>
                          <option value="Stethoscope">Clinical</option>
                          <option value="Users">Users</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={layer.requiresCode}
                            onChange={async (e) => {
                              const newLayers = [...layers];
                              newLayers[idx] = { ...layer, requiresCode: e.target.checked };
                              setLayers(newLayers);
                              try { await saveCorporateLayers(newLayers); } catch (err) { console.error('Failed to save layers:', err); }
                            }}
                            className="w-4 h-4 rounded text-[#2960DC] focus:ring-[#2960DC]" 
                          />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Requires Unique Code</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={layer.useReferenceList}
                            onChange={async (e) => {
                              const newLayers = [...layers];
                              newLayers[idx] = { ...layer, useReferenceList: e.target.checked };
                              setLayers(newLayers);
                              try { await saveCorporateLayers(newLayers); } catch (err) { console.error('Failed to save layers:', err); }
                            }}
                            className="w-4 h-4 rounded text-purple-600 focus:ring-purple-600" 
                          />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Enforce Reference Lookup</span>
                        </label>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {idx > 0 && (
                          <button 
                            onClick={async () => {
                              const newLayers = [...layers];
                              [newLayers[idx], newLayers[idx - 1]] = [newLayers[idx - 1], newLayers[idx]];
                              setLayers(newLayers);
                              try { await saveCorporateLayers(newLayers); } catch (err) { console.error('Failed to save layers:', err); }
                            }}
                            className="text-slate-400 hover:text-blue-500 p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            title="Move Up"
                          >
                            <Icons.ChevronUp className="w-5 h-5" />
                          </button>
                        )}
                        {idx < layers.length - 1 && (
                          <button 
                            onClick={async () => {
                              const newLayers = [...layers];
                              [newLayers[idx], newLayers[idx + 1]] = [newLayers[idx + 1], newLayers[idx]];
                              setLayers(newLayers);
                              try { await saveCorporateLayers(newLayers); } catch (err) { console.error('Failed to save layers:', err); }
                            }}
                            className="text-slate-400 hover:text-blue-500 p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            title="Move Down"
                          >
                            <Icons.ChevronDown className="w-5 h-5" />
                          </button>
                        )}
                        <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"></span>
                        <button 
                          disabled={layers.length <= 1}
                          onClick={async () => {
                            if (!window.confirm(`Delete the "${layer.title}" layer? Nodes using this layer type will keep their current type value.`)) return;
                            const newLayers = layers.filter((_, i) => i !== idx);
                            setLayers(newLayers);
                            try { await saveCorporateLayers(newLayers); } catch (err) {
                              console.error('Failed to delete layer:', err);
                              // Rollback UI on failure
                              setLayers(layers);
                              alert('Failed to delete layer. Please try again.');
                            }
                          }}
                          className="text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-30"
                          title="Delete Layer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {layer.useReferenceList && (
                      <div className="w-full mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/50 flex flex-col gap-2">
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between">
                          Valid Lexicon Tags
                          <span className="text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-bold">Role Scoping</span>
                        </label>
                        
                        {/* Display Current Tags */}
                        {layer.validLexicon && layer.validLexicon.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {layer.validLexicon.map((tag, tIdx) => (
                              <div key={tIdx} className="flex items-center gap-0.5 px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 rounded-full text-[11px] font-bold transition-all">
                                  <button 
                                    disabled={tIdx === 0}
                                    onClick={() => {
                                      const newLayers = [...layers];
                                      const lex = [...layer.validLexicon!];
                                      [lex[tIdx], lex[tIdx-1]] = [lex[tIdx-1], lex[tIdx]];
                                      newLayers[idx] = { ...layer, validLexicon: lex };
                                      setLayers(newLayers);
                                      saveCorporateLayers(newLayers);
                                    }}
                                    className="hover:bg-purple-200 dark:hover:bg-purple-700 rounded bg-purple-100 dark:bg-purple-800/40 opacity-80 hover:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <Icons.ChevronLeft className="w-3.5 h-3.5" />
                                  </button>
                                
                                <span className="px-1">{tag}</span>
                                
                                  <button 
                                    disabled={tIdx >= (layer.validLexicon!.length - 1)}
                                    onClick={() => {
                                      const newLayers = [...layers];
                                      const lex = [...layer.validLexicon!];
                                      [lex[tIdx], lex[tIdx+1]] = [lex[tIdx+1], lex[tIdx]];
                                      newLayers[idx] = { ...layer, validLexicon: lex };
                                      setLayers(newLayers);
                                      saveCorporateLayers(newLayers);
                                    }}
                                    className="hover:bg-purple-200 dark:hover:bg-purple-700 rounded bg-purple-100 dark:bg-purple-800/40 opacity-80 hover:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <Icons.ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                
                                <button 
                                  onClick={() => {
                                    const newLayers = [...layers];
                                    newLayers[idx] = { 
                                      ...layer, 
                                      validLexicon: layer.validLexicon!.filter((_, i) => i !== tIdx) 
                                    };
                                    setLayers(newLayers);
                                    saveCorporateLayers(newLayers);
                                  }}
                                  className="w-4 h-4 ml-1 flex items-center justify-center rounded-full bg-purple-100 dark:bg-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-700 transition-colors"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Add New Tag Input */}
                        <div className="flex items-center gap-2">
                          <input 
                            type="text"
                            placeholder="Add new tag (Press Enter)..."
                            className="flex-1 p-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = e.currentTarget.value.trim();
                                if (!val) return;
                                const currentTags = layer.validLexicon || [];
                                if (!currentTags.includes(val)) {
                                  const newLayers = [...layers];
                                  newLayers[idx] = { 
                                    ...layer, 
                                    validLexicon: [...currentTags, val] 
                                  };
                                  setLayers(newLayers);
                                  saveCorporateLayers(newLayers);
                                }
                                e.currentTarget.value = '';
                              }
                            }}
                          />
                          <button
                            onClick={(e) => {
                              const inputEl = e.currentTarget.previousElementSibling as HTMLInputElement;
                              const val = inputEl.value.trim();
                              if (!val) return;
                              const currentTags = layer.validLexicon || [];
                              if (!currentTags.includes(val)) {
                                const newLayers = [...layers];
                                newLayers[idx] = { ...layer, validLexicon: [...currentTags, val] };
                                setLayers(newLayers);
                                saveCorporateLayers(newLayers);
                              }
                              inputEl.value = '';
                            }}
                            className="p-2 bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800 rounded-lg font-bold transition-colors"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button 
                onClick={async () => {
                  const newLayers = [...layers, { id: `m_${Date.now()}`, title: 'New Classification Tier', iconName: 'Network', requiresCode: false, useReferenceList: false }];
                  setLayers(newLayers);
                  try { await saveCorporateLayers(newLayers); } catch (err) { console.error('Failed to add layer:', err); }
                }}
                className="w-full p-2 border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-[#2960DC] hover:text-[#2960DC] dark:hover:border-[#4F84F6] text-slate-400 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors"
               >
                <Plus className="w-4 h-4" /> Add Official Layer
              </button>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button 
                onClick={() => setIsLayerModalOpen(false)}
                className="bg-[#2960DC] hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-md transition-colors"
              >
                Close & Deploy
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
