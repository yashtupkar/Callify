import { readSheet } from "read-excel-file/browser";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 50000;

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). Returns an array of rows. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";" || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function toTable(matrix) {
  const [head, ...body] = matrix.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (!head) throw new Error("The file is empty");
  const columns = head.map((h, i) => String(h ?? "").trim() || `column_${i + 1}`);
  if (body.length > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS.toLocaleString()})`);
  const rows = body.map((r) =>
    Object.fromEntries(columns.map((c, i) => [c, r[i] === null || r[i] === undefined ? "" : String(r[i])])),
  );
  return { columns, rows };
}

/** Parses a CSV or XLSX file in the browser into { columns, rows }. The server re-validates everything. */
export async function parseContactFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error("File is larger than 5 MB");
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return toTable(parseCsv(await file.text()));
  if (name.endsWith(".xlsx")) return toTable(await readSheet(file));
  throw new Error("Upload a .csv or .xlsx file");
}
