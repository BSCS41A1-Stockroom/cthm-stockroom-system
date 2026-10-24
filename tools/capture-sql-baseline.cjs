// Archive source artifacts only. Does not connect to or modify a database.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const commit = process.argv[2];
if (!/^[0-9a-f]{40}$/.test(commit || '')) throw Error('Pass the source commit from git rev-parse HEAD as the first argument.');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'research/sql-baseline/2026-10-23');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const relative = 'server/controllers/borrowController.js';
const raw = fs.readFileSync(path.join(root, relative));
const source = raw.toString('utf8');
const start = source.indexOf('async function loadValidationContext(');
const end = source.indexOf('async function withValidation(', start);
if (start < 0 || end < 0) throw Error('Missing baseline function boundaries');
const section = source.slice(start, end);
const names = ['01-borrower-lock', '02-accountability', '03-usable-inventory', '04-inventory-commitments', '05-outstanding-borrowing', '06-borrower-conflicts', '07-item-unavailability'];
const queries = [...section.matchAll(/client\.query\(\s*`([^`]+)`/g)];
if (queries.length !== names.length || queries.some(m => m[1].includes('${'))) throw Error('Unexpected query structure');
// Never overwrite a captured baseline.
if (fs.existsSync(path.join(out, 'manifest.json'))) throw Error('Baseline already exists; use a new version for another capture.');
fs.mkdirSync(out, { recursive: true });
const files = [];
function save(name, bytes) {
  const target = path.join(out, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    if (hash(fs.readFileSync(target)) !== hash(bytes)) throw Error('Partial snapshot differs: ' + name);
  } else fs.writeFileSync(target, bytes, { flag: 'wx' });
  files.push({ file: name, sha256: hash(bytes) });
}
save('source/borrowController.js', raw);
save('source/conflictDetection.js', fs.readFileSync(path.join(root, 'server/algorithms/conflictDetection.js')));
const entries = queries.map((m, i) => {
  const file = names[i] + '.sql';
  save(file, m[1]);
  return { id: names[i], file, source: relative, line: source.slice(0, start + m.index).split('\n').length, sha256: hash(m[1]) };
});
for (const name of fs.readdirSync(path.join(root, 'server/migrations')).filter(n => n.endsWith('.sql')).sort()) {
  save('migrations/' + name, fs.readFileSync(path.join(root, 'server/migrations', name)));
}
const manifest = {
  baselineDate: '2026-10-23',
  capturedAt: new Date().toISOString(),
  commit,
  scope: 'loadValidationContext: seven original parameterized SQL statements; not every application query',
  databaseExecuted: false,
  schemaNote: 'Migration source snapshot only; not proof of deployed schema, indexes, or PostgreSQL settings.',
  queries: entries, files,
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
for (const f of files) if (hash(fs.readFileSync(path.join(out, f.file))) !== f.sha256) throw Error('Integrity check failed: ' + f.file);
console.log(`Captured and verified ${entries.length} SQL statements and ${files.length} artifacts at ${out}`);
