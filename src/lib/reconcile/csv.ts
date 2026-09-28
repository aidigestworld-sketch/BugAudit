import Papa from 'papaparse';
import type { CsvRow } from './types';

export type ParsedCsv = { headers: string[]; rows: CsvRow[]; malformedRows: number };

/**
 * Parses CSV text with a header row. Headers are trimmed; blank lines are
 * skipped. Never throws on bad rows — they're counted in malformedRows.
 * Works in both the browser (header preview) and on the server.
 */
export function parseCsv(text: string, maxRows?: number): ParsedCsv {
  const result = Papa.parse<CsvRow>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    preview: maxRows,
  });
  const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
  const rowsWithErrors = new Set(
    result.errors.map((e) => e.row).filter((r): r is number => typeof r === 'number'),
  );
  return { headers, rows: result.data, malformedRows: rowsWithErrors.size };
}
