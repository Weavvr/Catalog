/**
 * @hmc/workflow - Status workflows, deadline tracking, and CSV import
 *
 * Provides:
 * - Configurable status state machine with transition validation
 * - Deadline tracking with overdue detection and upcoming alerts
 * - CSV import engine with flexible column mapping and validation
 * - Audit trail for state changes
 *
 * Generic workflow utilities applicable to any domain.
 */

import { createLogger } from '@hmc/logger';

const logger = createLogger('workflow');

// ── Status State Machine ────────────────────────────────────────

export interface StatusConfig {
  name: string;
  label: string;
  color?: string;
  /** Which statuses can transition TO this status */
  allowedFrom: string[];
  /** Is this a terminal state? */
  isFinal: boolean;
}

export interface WorkflowDefinition {
  name: string;
  statuses: StatusConfig[];
  initialStatus: string;
}

/**
 * Common workflow presets.
 */
export const WORKFLOWS = {
  /** Simple task workflow */
  task: {
    name: 'task',
    initialStatus: 'pending',
    statuses: [
      { name: 'pending', label: 'Pending', allowedFrom: [], isFinal: false },
      { name: 'in_progress', label: 'In Progress', allowedFrom: ['pending'], isFinal: false },
      { name: 'review', label: 'In Review', allowedFrom: ['in_progress'], isFinal: false },
      { name: 'completed', label: 'Completed', allowedFrom: ['in_progress', 'review'], isFinal: true },
      { name: 'cancelled', label: 'Cancelled', allowedFrom: ['pending', 'in_progress', 'review'], isFinal: true },
    ],
  } satisfies WorkflowDefinition,

  /** Document/form processing workflow */
  document: {
    name: 'document',
    initialStatus: 'pending',
    statuses: [
      { name: 'pending', label: 'Pending', allowedFrom: [], isFinal: false },
      { name: 'in_progress', label: 'In Progress', allowedFrom: ['pending'], isFinal: false },
      { name: 'completed', label: 'Completed', allowedFrom: ['in_progress'], isFinal: false },
      { name: 'filed', label: 'Filed', allowedFrom: ['completed'], isFinal: true },
      { name: 'overdue', label: 'Overdue', allowedFrom: ['pending', 'in_progress'], isFinal: false },
      { name: 'cancelled', label: 'Cancelled', allowedFrom: ['pending', 'in_progress', 'completed', 'overdue'], isFinal: true },
    ],
  } satisfies WorkflowDefinition,

  /** Approval workflow */
  approval: {
    name: 'approval',
    initialStatus: 'draft',
    statuses: [
      { name: 'draft', label: 'Draft', allowedFrom: [], isFinal: false },
      { name: 'submitted', label: 'Submitted', allowedFrom: ['draft', 'revision_requested'], isFinal: false },
      { name: 'under_review', label: 'Under Review', allowedFrom: ['submitted'], isFinal: false },
      { name: 'approved', label: 'Approved', allowedFrom: ['under_review'], isFinal: true },
      { name: 'rejected', label: 'Rejected', allowedFrom: ['under_review'], isFinal: true },
      { name: 'revision_requested', label: 'Revision Requested', allowedFrom: ['under_review'], isFinal: false },
    ],
  } satisfies WorkflowDefinition,
} as const;

/**
 * Validate a status transition.
 */
export function canTransition(
  workflow: WorkflowDefinition,
  currentStatus: string,
  newStatus: string,
): { allowed: boolean; reason?: string } {
  const targetConfig = workflow.statuses.find(s => s.name === newStatus);
  if (!targetConfig) return { allowed: false, reason: `Unknown status: ${newStatus}` };

  const currentConfig = workflow.statuses.find(s => s.name === currentStatus);
  if (!currentConfig) return { allowed: false, reason: `Unknown current status: ${currentStatus}` };

  if (currentConfig.isFinal) {
    return { allowed: false, reason: `Cannot transition from final status: ${currentStatus}` };
  }

  if (currentStatus === newStatus) {
    return { allowed: false, reason: 'Already in this status' };
  }

  if (!targetConfig.allowedFrom.includes(currentStatus)) {
    return {
      allowed: false,
      reason: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed from: ${targetConfig.allowedFrom.join(', ')}`,
    };
  }

  return { allowed: true };
}

/**
 * Get available next statuses from current status.
 */
export function getNextStatuses(
  workflow: WorkflowDefinition,
  currentStatus: string,
): StatusConfig[] {
  const current = workflow.statuses.find(s => s.name === currentStatus);
  if (!current || current.isFinal) return [];

  return workflow.statuses.filter(s => s.allowedFrom.includes(currentStatus));
}

// ── Deadline Tracking ───────────────────────────────────────────

export interface DeadlineItem {
  id: string;
  label: string;
  dueDate: Date;
  extendedDueDate?: Date;
  status: string;
  assignedTo?: string;
  metadata?: Record<string, unknown>;
}

export interface DeadlineAlert {
  item: DeadlineItem;
  type: 'overdue' | 'due_today' | 'due_this_week' | 'due_this_month';
  daysUntilDue: number;
  effectiveDueDate: Date;
}

/**
 * Check deadlines and categorize items by urgency.
 */
export function checkDeadlines(
  items: DeadlineItem[],
  now: Date = new Date(),
  options?: { excludeFinalStatuses?: string[] },
): {
  overdue: DeadlineAlert[];
  dueToday: DeadlineAlert[];
  dueThisWeek: DeadlineAlert[];
  dueThisMonth: DeadlineAlert[];
  summary: { overdue: number; dueToday: number; dueThisWeek: number; dueThisMonth: number; total: number };
} {
  const excludeStatuses = new Set(options?.excludeFinalStatuses || ['completed', 'filed', 'cancelled', 'approved', 'rejected']);
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const overdue: DeadlineAlert[] = [];
  const dueToday: DeadlineAlert[] = [];
  const dueThisWeek: DeadlineAlert[] = [];
  const dueThisMonth: DeadlineAlert[] = [];

  for (const item of items) {
    if (excludeStatuses.has(item.status)) continue;

    const effectiveDue = item.extendedDueDate || item.dueDate;
    const dueMs = effectiveDue.getTime();
    const daysUntil = Math.ceil((dueMs - nowMs) / dayMs);

    const alert: DeadlineAlert = {
      item,
      type: 'due_this_month',
      daysUntilDue: daysUntil,
      effectiveDueDate: effectiveDue,
    };

    if (daysUntil < 0) {
      alert.type = 'overdue';
      overdue.push(alert);
    } else if (daysUntil === 0) {
      alert.type = 'due_today';
      dueToday.push(alert);
    } else if (daysUntil <= 7) {
      alert.type = 'due_this_week';
      dueThisWeek.push(alert);
    } else if (daysUntil <= 30) {
      alert.type = 'due_this_month';
      dueThisMonth.push(alert);
    }
  }

  return {
    overdue: overdue.sort((a, b) => a.daysUntilDue - b.daysUntilDue),
    dueToday,
    dueThisWeek: dueThisWeek.sort((a, b) => a.daysUntilDue - b.daysUntilDue),
    dueThisMonth: dueThisMonth.sort((a, b) => a.daysUntilDue - b.daysUntilDue),
    summary: {
      overdue: overdue.length,
      dueToday: dueToday.length,
      dueThisWeek: dueThisWeek.length,
      dueThisMonth: dueThisMonth.length,
      total: items.filter(i => !excludeStatuses.has(i.status)).length,
    },
  };
}

// ── CSV Import Engine ───────────────────────────────────────────

export interface ColumnMapping {
  /** CSV column header (case-insensitive, trimmed) */
  csvHeader: string;
  /** Target field name */
  field: string;
  /** Optional transform function */
  transform?: (value: string) => unknown;
  /** Is this field required? */
  required?: boolean;
}

export interface CSVImportConfig {
  /** Column mappings (multiple CSV headers can map to the same field) */
  columns: ColumnMapping[];
  /** Skip rows where the required fields are empty */
  skipEmptyRows: boolean;
  /** Custom validation for each parsed row */
  validateRow?: (row: Record<string, unknown>, rowIndex: number) => string | null;
}

export interface CSVImportResult<T> {
  imported: T[];
  failed: Array<{ rowIndex: number; data: Record<string, string>; error: string }>;
  totalRows: number;
  importedCount: number;
  failedCount: number;
}

/**
 * Parse a CSV string with flexible column mapping.
 * Handles BOM, trailing commas, and quoted fields.
 */
export function parseCSV<T extends Record<string, unknown>>(
  csvContent: string,
  config: CSVImportConfig,
): CSVImportResult<T> {
  // Strip BOM
  const content = csvContent.replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length < 2) {
    return { imported: [], failed: [], totalRows: 0, importedCount: 0, failedCount: 0 };
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.trim());

  // Build header index → column mapping
  const headerMap = new Map<number, ColumnMapping>();
  for (const col of config.columns) {
    const idx = headers.findIndex(h => h.toLowerCase() === col.csvHeader.toLowerCase());
    if (idx >= 0) {
      headerMap.set(idx, col);
    }
  }

  const imported: T[] = [];
  const failed: Array<{ rowIndex: number; data: Record<string, string>; error: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const rawData: Record<string, string> = {};
    const parsed: Record<string, unknown> = {};

    // Map values to fields
    for (let j = 0; j < values.length; j++) {
      const mapping = headerMap.get(j);
      if (mapping) {
        const raw = values[j].trim();
        rawData[mapping.csvHeader] = raw;

        if (mapping.transform) {
          try {
            parsed[mapping.field] = mapping.transform(raw);
          } catch (e) {
            parsed[mapping.field] = raw;
          }
        } else {
          parsed[mapping.field] = raw;
        }
      }
    }

    // Check required fields
    const missingRequired = config.columns
      .filter(c => c.required && !parsed[c.field])
      .map(c => c.field);

    if (missingRequired.length > 0) {
      if (config.skipEmptyRows) continue;
      failed.push({ rowIndex: i, data: rawData, error: `Missing required fields: ${missingRequired.join(', ')}` });
      continue;
    }

    // Custom validation
    if (config.validateRow) {
      const error = config.validateRow(parsed, i);
      if (error) {
        failed.push({ rowIndex: i, data: rawData, error });
        continue;
      }
    }

    imported.push(parsed as T);
  }

  logger.info('CSV parsed', { totalRows: lines.length - 1, imported: imported.length, failed: failed.length });

  return {
    imported,
    failed,
    totalRows: lines.length - 1,
    importedCount: imported.length,
    failedCount: failed.length,
  };
}

/**
 * Parse a single CSV line handling quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

// ── Date Parsing Utilities ──────────────────────────────────────

/**
 * Parse dates from various common formats.
 */
export function parseFlexibleDate(value: string): Date | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  // ISO format
  const iso = Date.parse(trimmed);
  if (!isNaN(iso)) return new Date(iso);

  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return new Date(parseInt(slashMatch[3]), parseInt(slashMatch[1]) - 1, parseInt(slashMatch[2]));
  }

  // MM-DD-YYYY
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    return new Date(parseInt(dashMatch[3]), parseInt(dashMatch[1]) - 1, parseInt(dashMatch[2]));
  }

  return null;
}
