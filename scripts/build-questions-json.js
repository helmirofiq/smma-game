const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CSV_CANDIDATES = [
  process.env.CSV_PATH,
  '/Users/helmi/Downloads/Order Form (Responses) - Form Responses 1.csv',
  path.join(__dirname, '..', 'data', 'responses.csv'),
].filter(Boolean);

function findCsv() {
  const file = CSV_CANDIDATES.find((p) => fs.existsSync(p));
  return file || null;
}

function clean(value) {
  return (value || '').toString().trim();
}

function isPlaceholder(value) {
  const v = clean(value).toLowerCase();
  return !v || ['-', '--', '.', 'xx', 'n/a', 'na'].includes(v);
}

const csvPath = findCsv();
const outPath = path.join(__dirname, '..', 'data', 'questions.json');

if (!csvPath) {
  if (fs.existsSync(outPath)) {
    console.log(`CSV not found. Reusing existing ${outPath}`);
    process.exit(0);
  }
  throw new Error(`CSV not found and ${outPath} does not exist. Checked: ${CSV_CANDIDATES.join(', ')}`);
}

const raw = fs.readFileSync(csvPath, 'utf8');
const rows = parse(raw, { columns: true, skip_empty_lines: true, bom: true });

const questions = rows
  .map((row) => ({
    name: clean(row['Nama']),
    businessUnit: clean(row['Business Unit']),
    fact1: clean(row['Fakta 1']),
    fact2: clean(row['Fakta 2']),
    fictive: clean(row['Fiktif 1']),
  }))
  .filter((row) => row.name && row.fact1 && row.fact2 && row.fictive)
  .filter((row) => ![row.fact1, row.fact2, row.fictive].some(isPlaceholder))
  .filter((row) => new Set([row.fact1.toLowerCase(), row.fact2.toLowerCase(), row.fictive.toLowerCase()]).size === 3);

fs.writeFileSync(outPath, JSON.stringify(questions, null, 2) + '\n');

console.log(`Wrote ${questions.length} questions to ${outPath}`);
console.log(`Source CSV: ${csvPath}`);
