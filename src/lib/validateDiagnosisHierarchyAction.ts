/**
 * validateDiagnosisHierarchyAction
 * ---------------------------------------------------------------------------
 * Pure validation function for clinical condition / diagnosis hierarchy rules.
 * - No API calls, no state mutations, no side-effects.
 * - Called by the UI save handler (SectionAConditions.tsx) before any network
 *   request is made. The caller applies the returned actionType.
 * - Safe to reuse from server-side or unit tests.
 * ---------------------------------------------------------------------------
 */

export type DiagnosisActionType =
  | 'ADD_ACTIVE'          // Normal new active condition – no conflict
  | 'ADD_PARENT_AS_HPI'   // Parent is older than all active children → inject HPI log
  | 'ADD_CHILD_AS_HPI'    // New child is older than current active child but after parent → inject HPI log
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
    targetStatus,
    existingConditions,
    hierarchyData,
    today,
  } = input;

  // ── RULE B.2: Future date — must run FIRST before any other logic ──────────
  if (targetOnset && targetOnset > today) {
    return {
      allowed: false,
      actionType: 'BLOCK',
      message:
        'Onset date cannot be later than today. Please select today or a past date.',
      affectedIds: [],
      auditEvent: {
        type: 'BLOCKED_FUTURE_DATE',
        detail: `Attempted future onset: ${targetOnset}`,
      },
    };
  }

  // ── RULE: Exact duplicate (same SNOMED code already Active) ───────────────
  const exactDup = existingConditions.find(
    (c) => c.snomed_code === targetCode && c.status === 'Active'
  );
  if (exactDup) {
    return {
      allowed: false,
      actionType: 'DUPLICATE',
      message:
        'This condition is already recorded and active. Please edit the existing record if needed.',
      affectedIds: [exactDup.id],
      auditEvent: {
        type: 'DUPLICATE_DETECTED',
        detail: `Duplicate SNOMED code: ${targetCode}`,
      },
    };
  }

  // ── RULE C — Parent conflict (adding BROADER condition while specific child exists) ──
  if (hierarchyData?.conflict === 'parent') {
    const activeChildren = existingConditions.filter(
      (c) =>
        hierarchyData.conflictingCodes.includes(c.snomed_code) &&
        c.status === 'Active'
    );

    // Rule 1C — same parent already recorded (any status)
    const parentAlreadyRecorded = existingConditions.find(
      (c) => c.snomed_code === targetCode
    );
    if (parentAlreadyRecorded) {
      return {
        allowed: false,
        actionType: 'DUPLICATE',
        message:
          'This parent condition is already recorded. Please edit the existing parent condition if needed.',
        affectedIds: [parentAlreadyRecorded.id],
        auditEvent: {
          type: 'DUPLICATE_PARENT',
          detail: `Duplicate parent: ${targetCode}`,
        },
      };
    }

    // Date required to compare against children
    if (!targetOnset) {
      return {
        allowed: false,
        actionType: 'DATE_REQUIRED',
        message:
          'Onset date is required to validate this parent condition against existing child conditions.',
        affectedIds: activeChildren.map((c) => c.id),
        auditEvent: {
          type: 'DATE_MISSING',
          detail: 'Parent onset date missing',
        },
      };
    }

    // Find earliest child onset (string comparison works for ISO dates)
    const childOnsets = activeChildren
      .map((c) => c.onset)
      .filter(Boolean) as string[];
    const earliestChildOnset = childOnsets.sort()[0] ?? null;

    // Rule 1A — parent date is EARLIER than all active children → HPI injection
    if (!earliestChildOnset || targetOnset < earliestChildOnset) {
      return {
        allowed: true,
        actionType: 'ADD_PARENT_AS_HPI',
        message: `This condition predates the active specific diagnosis (${activeChildren.map((c) => c.term).join(', ')}). It will be injected as a Historical Present Illness (HPI) entry in that condition's timeline on the selected date.`,
        affectedIds: activeChildren.map((c) => c.id),
        auditEvent: {
          type: 'HPI_INJECTION_PARENT',
          detail: `Parent ${targetCode} (${targetTerm}) injected as HPI on ${targetOnset} into child(ren): ${activeChildren.map((c) => c.id).join(', ')}`,
        },
      };
    }

    // Rule 1B — parent onset is on or after a child's onset → block
    return {
      allowed: false,
      actionType: 'BLOCK',
      message:
        'Cannot add this parent condition because a more specific child condition already exists with an earlier onset date. The parent condition must be the first recorded date. Please verify the parent onset date, or correct the child condition date.',
      affectedIds: activeChildren.map((c) => c.id),
      auditEvent: {
        type: 'BLOCKED_CHRONOLOGICAL_PARENT',
        detail: `Parent onset ${targetOnset} is not earlier than earliest child onset ${earliestChildOnset}`,
      },
    };
  }

  // ── RULE C — Child / Sibling conflict (adding MORE SPECIFIC while broader exists) ──
  if (
    hierarchyData?.conflict === 'child' ||
    hierarchyData?.conflict === 'sibling'
  ) {
    const activeConflicts = existingConditions.filter(
      (c) =>
        hierarchyData.conflictingCodes.includes(c.snomed_code) &&
        c.status === 'Active'
    );

    // Use spread copies to avoid JS array-mutation bug with .sort().reverse()
    const conflictOnsets = activeConflicts
      .map((c) => c.onset)
      .filter(Boolean) as string[];
    const sortedOnsets = [...conflictOnsets].sort(); // ascending ISO dates
    const latestConflictOnset  = sortedOnsets[sortedOnsets.length - 1] ?? null; // newest
    const earliestConflictOnset = sortedOnsets[0] ?? null;                       // oldest (= parent onset when conflictIsParent)

    if (!targetOnset) {
      return {
        allowed: true,
        actionType: 'ADD_ACTIVE',
        message: '',
        affectedIds: [],
        auditEvent: { type: 'CONDITION_ADDED', detail: `Added ${targetCode}` },
      };
    }

    // ── Detect if the conflicting condition IS the parent (broader concept) ────
    // conflict === 'child'  means: target is MORE SPECIFIC than existing → existing is the PARENT
    // conflict === 'sibling' means: target is at the same level → existing is a SIBLING
    const conflictIsParent = hierarchyData.conflict === 'child';

    // ══════════════════════════════════════════════════════════════════════════
    // CASE 2: Current condition IS the Parent (conflict.type === 'child')
    // Adding a new CHILD under an existing active parent
    // ══════════════════════════════════════════════════════════════════════════
    if (conflictIsParent) {
      // The conflicting condition IS the parent — use its onset as the reference
      const activeParentOnset = earliestConflictOnset;

      // Rule 2e — new child onset < parent onset → BLOCK
      if (activeParentOnset && targetOnset < activeParentOnset) {
        return {
          allowed: false,
          actionType: 'BLOCK',
          message:
            'Cannot add a child condition earlier than the recorded parent diagnosis date. Please verify the parent date and modify it to an earlier date if clinically correct, or enter the correct child onset date.',
          affectedIds: activeConflicts.map((c) => c.id),
          auditEvent: {
            type: 'BLOCKED_CHRONOLOGICAL_CHILD',
            detail: `Child onset ${targetOnset} is before parent onset ${activeParentOnset}`,
          },
        };
      }

      // Rule 2d — new child onset ≥ parent onset → add as new specific condition (no deactivation)
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
    // CASE 1: Current condition IS an active Child (conflict.type === 'sibling')
    // Adding a NEW sibling — compare only against the existing active sibling.
    // NOTE: We do NOT try to infer the parent from other conditions because
    // unrelated active conditions (e.g. Diabetes) would produce false blocks.
    // The only chronological check here is new sibling vs existing active sibling.
    // ══════════════════════════════════════════════════════════════════════════

    // Rule 2A — new sibling onset is LATER than the active sibling → replace
    if (latestConflictOnset && targetOnset > latestConflictOnset) {
      return {
        allowed: true,
        actionType: 'DEACTIVATE_AND_ADD',
        message: `This more specific diagnosis will replace the current active condition. The previous record will be deactivated.`,
        affectedIds: activeConflicts.map((c) => c.id),
        auditEvent: {
          type: 'ACTIVE_CHILD_DEACTIVATED',
          detail: `Replaced by ${targetCode} (${targetTerm}) on ${targetOnset}`,
        },
      };
    }

    // Rule 2B — new sibling onset is EARLIER than the active sibling → inject as HPI
    // (Parent-date check for Rule 2C is handled at the UI layer where the parent
    //  condition can be identified by SNOMED hierarchy, not guessed here)
    if (latestConflictOnset && targetOnset < latestConflictOnset) {
      return {
        allowed: true,
        actionType: 'ADD_CHILD_AS_HPI',
        message: `This condition predates the current active diagnosis. It will be injected as a Historical Present Illness (HPI) note into the active condition's timeline. The active diagnosis remains unchanged.`,
        affectedIds: activeConflicts.map((c) => c.id),
        auditEvent: {
          type: 'HPI_INJECTION_CHILD',
          detail: `Child ${targetCode} (${targetTerm}) injected as HPI on ${targetOnset}`,
        },
      };
    }
  }
  // ── No conflict — standard add ────────────────────────────────────────────
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
