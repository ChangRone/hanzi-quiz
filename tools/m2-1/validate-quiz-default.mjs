import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'char-data/moe-6063-v1');
const DATASET_INFO = path.join(ROOT, 'manifest/char-data/moe-6063-v1/dataset-info.json');
const EXPECTED_ROOT = 'db1cef988e5e006bd88f3eed256add9d3e31a8e47c64347a9457d88100bb4af2';

const samples = ['歡','口','亢','抗','覷','天','空','雲','鳥','水','草','去','再','先','完','院','船','陽','種','像'];
const hexOf = ch => ch.codePointAt(0).toString(16).toLowerCase();

const info = JSON.parse(await fs.readFile(DATASET_INFO, 'utf8'));
if (info.total !== 6063 || info.accepted !== 6063) throw new Error(`dataset count invalid: total=${info.total} accepted=${info.accepted}`);
if (info.corpusRootSha256 !== EXPECTED_ROOT) throw new Error(`dataset root mismatch: ${info.corpusRootSha256}`);

const files = (await fs.readdir(DATA_DIR)).filter(n => n.endsWith('.json'));
if (files.length !== 6063) throw new Error(`expected 6063 JSON files, got ${files.length}`);

for (const ch of samples) {
  const hex = hexOf(ch);
  const p = path.join(DATA_DIR, `${hex}.json`);
  const d = JSON.parse(await fs.readFile(p, 'utf8'));
  if (!Array.isArray(d.strokes) || !Array.isArray(d.medians)) throw new Error(`${ch}/${hex}: missing strokes or medians`);
  if (d.strokes.length < 1 || d.strokes.length !== d.medians.length) throw new Error(`${ch}/${hex}: stroke/median mismatch`);
  if (!d.medians.every(m => Array.isArray(m) && m.length >= 2)) throw new Error(`${ch}/${hex}: invalid median`);
  if (!Array.isArray(d.radStrokes)) throw new Error(`${ch}/${hex}: radStrokes missing`);
  if (ch === '覷' && d.strokes.length !== 18) throw new Error(`覷 should use 18-stroke HW override; got ${d.strokes.length}`);
}

const html = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
const required = [
  "const APPROVED_CHAR_DATASET_VERSION = 'moe-6063-v1';",
  "const APPROVED_CHAR_DATA_TEMPLATE = 'char-data/moe-6063-v1/{hex}.json';",
  ".replaceAll('{hex}', hex)",
  "function loadApprovedCharacterData(char)",
  "? loadCustomCharacterData(char, settings.customTemplate).catch(() => loadApprovedCharacterData(char))",
  ": loadApprovedCharacterData(char);",
  ".catch(() => loadDefaultCharacterData(char))",
  'MOE 6063 核可字庫（預設）'
];
for (const needle of required) if (!html.includes(needle)) throw new Error(`index loader assertion missing: ${needle}`);
if (html.includes("if (settings.mode === 'default') return null;")) throw new Error('legacy default-to-HanziWriter loader is still active');
if (/moedict\.tw|optimizeStroke\s*\(/.test(html)) throw new Error('Quiz runtime must not fetch MOE or run optimizer');

console.log('M2_1_STATIC_VERIFY=PASS');
console.log(`dataset=moe-6063-v1 files=${files.length} root=${info.corpusRootSha256}`);
console.log(`samples=${samples.join('')}`);
console.log('legacyTopLevelCharDataRuntimeDefault=false');
console.log('fallback=HanziWriter default only after approved dataset miss');
