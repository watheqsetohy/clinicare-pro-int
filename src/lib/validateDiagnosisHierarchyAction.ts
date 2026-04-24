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

    // Find the parent condition among the conflicting records (if any is a parent)
    // and the latest active child onset for replacement comparison
    const conflictOnsets = activeConflicts
      .map((c) => c.onset)
      .filter(Boolean) as string[];
    const latestConflictOnset = conflictOnsets.sort().reverse()[0] ?? null;
    const earliestConflictOnset = conflictOnsets.sort()[0] ?? null;

    // ── Find the PARENT onset from non-conflicting active conditions ──────────
    // Non-conflicting active conditions that are NOT the target code are likely
    // the broader parent(s) shared by both the new child and the existing sibling.
    const nonConflicting = existingConditions.filter(
      (c) =>
        !hierarchyData.conflictingCodes.includes(c.snomed_code) &&
        c.snomed_code !== targetCode &&
        c.status === 'Active'
    );
    const parentOnsets = nonConflicting
      .map((c) => c.onset)
      .filter(Boolean) as string[];
    // Earliest non-conflicting onset = most likely the shared parent onset
    const parentOnset = parentOnsets.sort()[0] ?? null;

    if (!targetOnset) {
      // No date — let the UI's existing !onsetDate guard handle this
      return {
        allowed: true,
        actionType: 'ADD_ACTIVE',
        message: '',
        affectedIds: [],
        auditEvent: { type: 'CONDITION_ADDED', detail: `Added ${targetCode}` },
      };
    }

    // Rule 2A — new child onset is LATER than the latest active sibling/child → replace
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

    // new child onset is earlier than the active sibling — check parent date
    if (latestConflictOnset && targetOnset < latestConflictOnset) {

      // Rule 2C — new child onset is EARLIER than the parent onset (if parent exists) → BLOCK
      if (parentOnset && targetOnset < parentOnset) {
        return {
          allowed: false,
          actionType: 'BLOCK',
          message:
            'Cannot add a child condition earlier than the recorded parent diagnosis date. Please verify the parent date and modify it to an earlier date if clinically correct, or enter the correct child onset date.',
          affectedIds: activeConflicts.map((c) => c.id),
          auditEvent: {
            type: 'BLOCKED_CHRONOLOGICAL_CHILD',
            detail: `Child onset ${targetOnset} is before parent onset ${parentOnset}`,
          },
        };
      }

      // Rule 2B — new child onset is BETWEEN parent onset and active sibling onset → inject as HPI
      // (Also applies when no parent is recorded — we don't block without a reference)
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
