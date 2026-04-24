/**
 * validateDiagnosisHierarchyAction
 * ---------------------------------------------------------------------------
 * Pure validation function for clinical condition / diagnosis hierarchy rules.
 * - No API calls, no state mutations, no side-effects.
 * - Called by the UI save handler (SectionAConditions.tsx) before any network
 *   request is made. The caller applies the returned actionType.
 * - Safe to reuse from server-side or unit tests.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RULE MAP (source of truth — every rule below maps to exactly one return)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GLOBAL RULES (always checked first):
 *   G1. Onset date > today → BLOCK (future date)
 *   G2. Same SNOMED code already Active → DUPLICATE
 *
 * NO ACTIVE PARENT OR CHILD (conflict = 'none' / null):
 *   N.a  Add as new active condition → ADD_ACTIVE
 *   N.b  Onset must be ≤ today (handled by G1)
 *
 * ACTIVE CHILD EXISTS — ADDING PARENT (conflict = 'parent'):
 *   1.a  No previous parent & parent onset < all children → ADD_PARENT_AS_HPI
 *   1.b  No previous parent & parent onset ≥ any child → BLOCK
 *   1.c  Same parent already recorded → DUPLICATE
 *
 * ACTIVE CHILD EXISTS — ADDING SIBLING CHILD (conflict = 'sibling'):
 *   2.a  New child onset > active child onset → DEACTIVATE_AND_ADD
 *   2.b  New child onset < active child & ≥ parent onset (if present) → ADD_CHILD_AS_HPI
 *   2.c  New child onset < active child & < parent onset (if present) → BLOCK
 *
 * ACTIVE PARENT EXISTS — ADDING PARENT (conflict = 'parent' on self):
 *   3.a  Same parent already recorded → DUPLICATE (handled by G2 or 1.c)
 *
 * ACTIVE PARENT EXISTS — ADDING CHILD (conflict = 'child'):
 *   4.a  New child onset ≥ parent onset → ADD_ACTIVE
 *   4.b  New child onset < parent onset → BLOCK
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type DiagnosisActionType =
  | 'ADD_ACTIVE'          // Normal new active condition – no conflict
  | 'ADD_PARENT_AS_HPI'   // Parent is older than all active children → inject HPI log
  | 'ADD_CHILD_AS_HPI'    // New child is older than active child but after parent → inject HPI log
  | 'DEACTIVATE_AND_ADD'  // New child is newer than current active child → deactivate old, add new
  | 'BLOCK'               // Chronological contradiction – cannot proceed
  | 'DUPLICATE'           // Exact or parent duplicate already recorded
  | 'DATE_REQUIRED';      // Onset date missing and is required for this check

export interface ExistingCondition {
  id: string;
  snomed_code: string;
  term: string;
  onset: string | null; // ISO date string "YYYY-MM-DD" or null
  status: 'Active' | 'Inactive' | 'Superseded';
}

export interface HierarchyData {
  conflict: 'none' | 'parent' | 'child' | 'sibling';
  conflictingCodes: string[];
  /** SNOMED codes of the shared parent (only populated for sibling conflicts) */
  parentCodes?: string[];
}

export interface ValidationInput {
  targetCode: string;
  targetTerm: string;
  targetOnset: string | null;   // "YYYY-MM-DD" or null/empty
  targetStatus: 'Active' | 'Inactive';
  existingConditions: ExistingCondition[];
  hierarchyData: HierarchyData | null;
  today: string; // "YYYY-MM-DD" – caller provides this so the fn stays pure
}

export interface ValidationResult {
  allowed: boolean;
  actionType: DiagnosisActionType;
  message: string;
  /** IDs of conditions that must be updated as part of the action */
  affectedIds: string[];
  /** Structured entry to append to the audit log */
  auditEvent: { type: string; detail: string };
}

// ─────────────────────────────────────────────────────────────────────────────

export function validateDiagnosisHierarchyAction(
  input: ValidationInput
): ValidationResult {
  const {
    targetCode,
    targetTerm,
    targetOnset,
    existingConditions,
    hierarchyData,
    today,
  } = input;

  // ══════════════════════════════════════════════════════════════════════════
  // G1. FUTURE DATE GUARD — must run first
  // ══════════════════════════════════════════════════════════════════════════
  if (targetOnset && targetOnset > today) {
    return {
      allowed: false,
      actionType: 'BLOCK',
      message: 'Onset date cannot be later than today. Please select today or a past date.',
      affectedIds: [],
      auditEvent: { type: 'BLOCKED_FUTURE_DATE', detail: `Attempted future onset: ${targetOnset}` },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // G2. EXACT DUPLICATE — same SNOMED code already Active
  // ══════════════════════════════════════════════════════════════════════════
  const exactDup = existingConditions.find(
    (c) => c.snomed_code === targetCode && c.status === 'Active'
  );
  if (exactDup) {
    return {
      allowed: false,
      actionType: 'DUPLICATE',
      message: 'This condition is already recorded and active. Please edit the existing record if needed.',
      affectedIds: [exactDup.id],
      auditEvent: { type: 'DUPLICATE_DETECTED', detail: `Duplicate SNOMED code: ${targetCode}` },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NO CONFLICT — standard add (Rule N.a)
  // ══════════════════════════════════════════════════════════════════════════
  if (!hierarchyData || hierarchyData.conflict === 'none') {
    return {
      allowed: true,
      actionType: 'ADD_ACTIVE',
      message: '',
      affectedIds: [],
      auditEvent: { type: 'CONDITION_ADDED', detail: `Added ${targetCode} (${targetTerm}) on ${targetOnset ?? 'unknown'}` },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFLICT TYPE: 'parent'
  // Target is BROADER than existing → "Active child exists, adding parent"
  // Rules 1.a / 1.b / 1.c
  // ══════════════════════════════════════════════════════════════════════════
  if (hierarchyData.conflict === 'parent') {
    const activeChildren = existingConditions.filter(
      (c) => hierarchyData.conflictingCodes.includes(c.snomed_code) && c.status === 'Active'
    );

    // Rule 1.c — same parent already recorded (any status)
    const parentAlreadyRecorded = existingConditions.find(
      (c) => c.snomed_code === targetCode
    );
    if (parentAlreadyRecorded) {
      return {
        allowed: false,
        actionType: 'DUPLICATE',
        message: 'This parent condition is already recorded. Please edit the existing parent condition if needed.',
        affectedIds: [parentAlreadyRecorded.id],
        auditEvent: { type: 'DUPLICATE_PARENT', detail: `Duplicate parent: ${targetCode}` },
      };
    }

    // Date required for chronological comparison against children
    if (!targetOnset) {
      return {
        allowed: false,
        actionType: 'DATE_REQUIRED',
        message: 'Onset date is required to validate this parent condition against existing child conditions.',
        affectedIds: activeChildren.map((c) => c.id),
        auditEvent: { type: 'DATE_MISSING', detail: 'Parent onset date missing' },
      };
    }

    // Find earliest child onset
    const childOnsets = activeChildren.map((c) => c.onset).filter(Boolean) as string[];
    const earliestChildOnset = [...childOnsets].sort()[0] ?? null;

    // Rule 1.a — parent onset < ALL active child onsets → HPI injection
    if (!earliestChildOnset || targetOnset < earliestChildOnset) {
      return {
        allowed: true,
        actionType: 'ADD_PARENT_AS_HPI',
        message: `This condition predates the active specific diagnosis (${activeChildren.map((c) => c.term).join(', ')}). It will be injected as a Historical Present Illness (HPI) entry in that condition's timeline.`,
        affectedIds: activeChildren.map((c) => c.id),
        auditEvent: {
          type: 'HPI_INJECTION_PARENT',
          detail: `Parent ${targetCode} (${targetTerm}) injected as HPI on ${targetOnset}`,
        },
      };
    }

    // Rule 1.b — parent onset ≥ any child onset → BLOCK
    return {
      allowed: false,
      actionType: 'BLOCK',
      message: 'Cannot add this parent condition because a more specific child condition already exists with an earlier onset date. The parent must predate all child conditions.',
      affectedIds: activeChildren.map((c) => c.id),
      auditEvent: {
        type: 'BLOCKED_CHRONOLOGICAL_PARENT',
        detail: `Parent onset ${targetOnset} is not before earliest child onset ${earliestChildOnset}`,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFLICT TYPE: 'child'
  // Target is MORE SPECIFIC than existing → "Active parent exists, adding child"
  // Rules 4.a / 4.b
  // ══════════════════════════════════════════════════════════════════════════
  if (hierarchyData.conflict === 'child') {
    const activeParents = existingConditions.filter(
      (c) => hierarchyData.conflictingCodes.includes(c.snomed_code) && c.status === 'Active'
    );
    const parentOnsets = activeParents.map((c) => c.onset).filter(Boolean) as string[];
    const earliestParentOnset = [...parentOnsets].sort()[0] ?? null;

    if (!targetOnset) {
      return {
        allowed: true,
        actionType: 'ADD_ACTIVE',
        message: '',
        affectedIds: [],
        auditEvent: { type: 'CONDITION_ADDED', detail: `Added ${targetCode}` },
      };
    }

    // Rule 4.b — child onset < parent onset → BLOCK
    if (earliestParentOnset && targetOnset < earliestParentOnset) {
      return {
        allowed: false,
        actionType: 'BLOCK',
        message: 'Cannot add a child condition with an onset date earlier than the recorded parent diagnosis date. Please verify the parent date and modify it to an earlier date if clinically correct, or enter the correct child onset date.',
        affectedIds: activeParents.map((c) => c.id),
        auditEvent: {
          type: 'BLOCKED_CHRONOLOGICAL_CHILD',
          detail: `Child onset ${targetOnset} is before parent onset ${earliestParentOnset}`,
        },
      };
    }

    // Rule 4.a — child onset ≥ parent onset → add as new specific condition
    return {
      allowed: true,
      actionType: 'ADD_ACTIVE',
      message: '',
      affectedIds: [],
      auditEvent: {
        type: 'CONDITION_ADDED',
        detail: `Added specific condition ${targetCode} (${targetTerm}) under parent on ${targetOnset}`,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFLICT TYPE: 'sibling'
  // Target is at the same level as existing → "Active child exists, adding sibling"
  // Rules 2.a / 2.b / 2.c
  // ══════════════════════════════════════════════════════════════════════════
  if (hierarchyData.conflict === 'sibling') {
    const activeSiblings = existingConditions.filter(
      (c) => hierarchyData.conflictingCodes.includes(c.snomed_code) && c.status === 'Active'
    );
    const siblingOnsets = activeSiblings.map((c) => c.onset).filter(Boolean) as string[];
    const sortedSiblingOnsets = [...siblingOnsets].sort();
    const latestSiblingOnset = sortedSiblingOnsets[sortedSiblingOnsets.length - 1] ?? null;

    // Find the recorded parent onset (if present) by checking parentCodes
    // against the patient's existing conditions
    let recordedParentOnset: string | null = null;
    if (hierarchyData.parentCodes && hierarchyData.parentCodes.length > 0) {
      const parentConditions = existingConditions.filter(
        (c) => hierarchyData.parentCodes!.includes(c.snomed_code) &&
               (c.status === 'Active' || c.status === 'Inactive')
      );
      const pOnsets = parentConditions.map((c) => c.onset).filter(Boolean) as string[];
      recordedParentOnset = [...pOnsets].sort()[0] ?? null;
    }

    if (!targetOnset) {
      return {
        allowed: true,
        actionType: 'ADD_ACTIVE',
        message: '',
        affectedIds: [],
        auditEvent: { type: 'CONDITION_ADDED', detail: `Added ${targetCode}` },
      };
    }

    // Rule 2.a — new child onset > active child onset → replace and deactivate
    if (latestSiblingOnset && targetOnset > latestSiblingOnset) {
      return {
        allowed: true,
        actionType: 'DEACTIVATE_AND_ADD',
        message: 'This more specific diagnosis will replace the current active condition. The previous record will be deactivated.',
        affectedIds: activeSiblings.map((c) => c.id),
        auditEvent: {
          type: 'ACTIVE_CHILD_DEACTIVATED',
          detail: `Replaced by ${targetCode} (${targetTerm}) on ${targetOnset}`,
        },
      };
    }

    // new child onset ≤ active child onset → check parent date
    if (latestSiblingOnset && targetOnset < latestSiblingOnset) {

      // Rule 2.c — new child onset < parent onset (if parent IS recorded) → BLOCK
      if (recordedParentOnset && targetOnset < recordedParentOnset) {
        return {
          allowed: false,
          actionType: 'BLOCK',
          message: 'Cannot add a child condition with an onset date earlier than the recorded parent diagnosis date. Please verify the parent date and modify it to an earlier date if clinically correct, or enter the correct child onset date.',
          affectedIds: activeSiblings.map((c) => c.id),
          auditEvent: {
            type: 'BLOCKED_CHRONOLOGICAL_CHILD',
            detail: `Child onset ${targetOnset} is before parent onset ${recordedParentOnset}`,
          },
        };
      }

      // Rule 2.b — new child onset ≥ parent onset (or no parent recorded) → HPI injection
      return {
        allowed: true,
        actionType: 'ADD_CHILD_AS_HPI',
        message: 'This condition predates the current active diagnosis. It will be injected as a Historical Present Illness (HPI) note into the active condition\'s timeline. The active diagnosis remains unchanged.',
        affectedIds: activeSiblings.map((c) => c.id),
        auditEvent: {
          type: 'HPI_INJECTION_CHILD',
          detail: `Child ${targetCode} (${targetTerm}) injected as HPI on ${targetOnset}`,
        },
      };
    }

    // Same date as active sibling → treat as duplicate scenario
    if (latestSiblingOnset && targetOnset === latestSiblingOnset) {
      return {
        allowed: true,
        actionType: 'DEACTIVATE_AND_ADD',
        message: 'This condition has the same onset date as the current active condition. It will replace the existing record.',
        affectedIds: activeSiblings.map((c) => c.id),
        auditEvent: {
          type: 'ACTIVE_CHILD_DEACTIVATED',
          detail: `Same-date replacement by ${targetCode} (${targetTerm}) on ${targetOnset}`,
        },
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FALLBACK — no conflict matched, standard add
  // ══════════════════════════════════════════════════════════════════════════
  return {
    allowed: true,
    actionType: 'ADD_ACTIVE',
    message: '',
    affectedIds: [],
    auditEvent: {
      type: 'CONDITION_ADDED',
      detail: `Added ${targetCode} (${targetTerm}) on ${targetOnset ?? 'unknown'}`,
    },
  };
}
