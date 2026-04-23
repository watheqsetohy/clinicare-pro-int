/**
 * Corporate Storage — API Client
 * All organisational tree data is now persisted in PostgreSQL (jsonb) via the Express API.
 */

import { fetchWithAuth } from './authSession';

export interface CorporateNode {
  id: string;
  title: string;
  type: string;
  facilityCode?: string;
  acronym?: string;
  description?: string;
  children: CorporateNode[];
}

export interface CorporateLayerDef {
  id: string;
  title: string;
  iconName: string;
  requiresCode: boolean;
  useReferenceList: boolean;
  validLexicon?: string[];
}

// ── Corporate Tree ────────────────────────────────────────────────────────────

export const getCorporateTree = async (): Promise<CorporateNode[]> => {
  const res = await fetchWithAuth('/api/config/corporate_tree');
  if (!res.ok) throw new Error('Failed to fetch corporate tree');
  return res.json();
};

export const saveCorporateTree = async (nodes: CorporateNode[]): Promise<void> => {
  const res = await fetchWithAuth('/api/config/corporate_tree', {
    method: 'PUT',

    body: JSON.stringify(nodes),
  });
  if (!res.ok) throw new Error('Failed to save corporate tree');
};

// ── Corporate Layers ──────────────────────────────────────────────────────────

export const getCorporateLayers = async (): Promise<CorporateLayerDef[]> => {
  const res = await fetchWithAuth('/api/config/corporate_layers');
  if (!res.ok) throw new Error('Failed to fetch corporate layers');
  return res.json();
};

export const saveCorporateLayers = async (layers: CorporateLayerDef[]): Promise<void> => {
  const res = await fetchWithAuth('/api/config/corporate_layers', {
    method: 'PUT',

    body: JSON.stringify(layers),
  });
  if (!res.ok) throw new Error('Failed to save corporate layers');
};

// ── Clinical References ───────────────────────────────────────────────────────

export const getClinicalReferences = async (): Promise<string[]> => {
  const res = await fetchWithAuth('/api/config/clinical_refs');
  if (!res.ok) throw new Error('Failed to fetch clinical references');
  return res.json();
};

export const saveClinicalReferences = async (refs: string[]): Promise<void> => {
  const res = await fetchWithAuth('/api/config/clinical_refs', {
    method: 'PUT',

    body: JSON.stringify(refs),
  });
  if (!res.ok) throw new Error('Failed to save clinical references');
};

/** @deprecated — use getCorporateTree() async instead */
export const getCorporateState = (): CorporateNode[] => {
  console.warn('[corporateStorage] getCorporateState() is deprecated — use getCorporateTree() async instead.');
  return [];
};

/** @deprecated */
export const saveCorporateState = (_nodes: CorporateNode[]) => {
  console.warn('[corporateStorage] saveCorporateState() is deprecated.');
};

/** @deprecated */
export const resetCorporateToDefault = (): CorporateNode[] => {
  console.warn('[corporateStorage] resetCorporateToDefault() is deprecated.');
  return [];
};
