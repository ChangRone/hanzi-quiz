import fs from 'node:fs';
import path from 'node:path';
import { buildCatalog } from './build-catalog-v2.mjs';

const files = fs.readdirSync('packs').filter(x => x.endsWith('.json'));
const missing = [];
for (const file of files) {
  const pack = JSON.parse(fs.readFileSync(path.join('packs', file), 'utf8'));
  if (!pack.catalog || typeof pack.catalog.included !== 'boolean') missing.push('packs/' + file);
}
if (missing.length) throw new Error('Missing explicit catalog.included: ' + missing.join(', '));

const committed = JSON.parse(fs.readFileSync('quiz-catalog-v2.json', 'utf8'));
const rebuilt = buildCatalog({ writeFile: false });
if (JSON.stringify(committed) !== JSON.stringify(rebuilt)) throw new Error('quiz-catalog-v2.json is stale');
if (committed.schema !== 'hanzi-quiz-catalog-v2' || committed.version !== 2) throw new Error('bad catalog schema/version');
if (!Array.isArray(committed.lessons) || committed.lessons.length < 1) throw new Error('catalog has no lessons');
const keys = new Set();
for (const x of committed.lessons) {
  for (const field of ['key','packId','year','publisherCode','grade','semester','lessonCode','dataUrl','sourceHash']) {
    if (x[field] === undefined || x[field] === null || x[field] === '') throw new Error(x.key + ': missing ' + field);
  }
  if (keys.has(x.key)) throw new Error('duplicate key ' + x.key);
  keys.add(x.key);
  if (!Array.isArray(x.blankChars) || x.charCount !== x.blankChars.length) throw new Error(x.key + ': bad blankChars');
  if (!Number.isInteger(x.questionCount) || x.questionCount < 1) throw new Error(x.key + ': bad questionCount');
}
console.log('CATALOG_V2_VALIDATE=PASS packs=' + committed.includedPackCount + ' lessons=' + committed.lessonCount);
