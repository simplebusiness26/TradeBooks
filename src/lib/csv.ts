/**
 * Small, dependency-free CSV reader/writer.
 *
 * Bank exports are inconsistent: quoted fields containing commas and
 * newlines, BOMs, CRLF endings and stray blank lines all appear. This parser
 * handles those cases rather than splitting on commas and hoping.
 */
export type CsvRow = Record<string, string>;

export function parseCsv(input: string): { headers: string[]; rows: CsvRow[] } {
  const text = input.replace(/^﻿/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (char === '\r') {
      // handled by the \n branch
    } else {
      field += char;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ''));
  const headerRow = nonEmpty.shift();
  if (!headerRow) return { headers: [], rows: [] };

  const headers = headerRow.map((h) => h.trim());
  const rows = nonEmpty.map((cells) => {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim();
    });
    return row;
  });

  return { headers, rows };
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\r\n');
}

/** Finds a column by any of several likely header names, case-insensitively. */
export function pickColumn(headers: string[], candidates: string[]): string | null {
  const normalised = headers.map((h) => ({ original: h, key: h.toLowerCase().replace(/[^a-z0-9]/g, '') }));
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = normalised.find((h) => h.key === key);
    if (match) return match.original;
  }
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = normalised.find((h) => h.key.includes(key));
    if (match) return match.original;
  }
  return null;
}
