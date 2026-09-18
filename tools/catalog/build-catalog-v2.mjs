import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const PACK_DIR = path.join(ROOT, 'packs');
const OUT = path.join(ROOT, 'quiz-catalog-v2.json');

function lessonCodeOf(question) {
  const id = String((question && question.id) || '');
  return /^\d{12}$/.test(id) ? id.slice(8, 10) : '00';
}
function validQuestion(q) {
  return q && Array.isArray(q.tokens) && q.tokens.some(t => t && t.type === 'blank' && typeof t.char === 'string');
}
function rocYear(year) {
  const n = Number(year);
  return Number.isFinite(n) && n > 1911 ? n - 1911 : n;
}
function sha256(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }

export function buildCatalog({ writeFile = true } = {}) {
  const files = fs.readdirSync(PACK_DIR).filter(x => x.endsWith('.json')).sort();
  const lessons = [];
  const missingDecision = [];
  const includedSources = [];
  for (const file of files) {
    const rel = 'packs/' + file;
    const raw = fs.readFileSync(path.join(PACK_DIR, file), 'utf8');
    const pack = JSON.parse(raw);
    if (!pack.catalog || typeof pack.catalog.included !== 'boolean') {
      missingDecision.push(rel);
      continue;
    }
    if (!pack.catalog.included) continue;
    includedSources.push(rel);
    const grouped = new Map();
    for (const q of (pack.questions || []).filter(validQuestion)) {
      const code = lessonCodeOf(q);
      if (!grouped.has(code)) grouped.set(code, []);
      grouped.get(code).push(q);
    }
    if (!grouped.size) throw new Error(rel + ': catalog.included=true but no valid lesson questions');
    const sourceHash = sha256(raw);
    for (const [lessonCode, questions] of grouped) {
      const blankChars = [...new Set(questions.flatMap(q => q.tokens.filter(t => t.type === 'blank').map(t => String(t.char))))];
      const title = String((pack.catalog.lessonTitles && pack.catalog.lessonTitles[lessonCode]) || pack.catalog.lessonTitle || '');
      lessons.push({
        key: String(pack.id) + '|' + lessonCode,
        packId: String(pack.id),
        packTitle: String(pack.title || ''),
        year: String(pack.year || ''),
        rocYear: rocYear(pack.year),
        publisherCode: String(pack.publisherCode || ''),
        grade: String(pack.grade || ''),
        semester: String(pack.semester || ''),
        version: String(pack.version || '1.0.0'),
        lessonCode: String(lessonCode).padStart(2, '0'),
        lessonTitle: title,
        questionCount: questions.length,
        charCount: blankChars.length,
        blankChars,
        dataUrl: rel,
        sourceHash
      });
    }
  }
  if (missingDecision.length) throw new Error('Every pack must declare catalog.included true/false. Missing: ' + missingDecision.join(', '));
  lessons.sort((a, b) => Number(b.rocYear) - Number(a.rocYear)
    || Number(b.grade) - Number(a.grade)
    || Number(b.semester) - Number(a.semester)
    || Number(b.lessonCode) - Number(a.lessonCode)
    || String(a.packId).localeCompare(String(b.packId)));
  const keys = new Set();
  for (const lesson of lessons) {
    if (keys.has(lesson.key)) throw new Error('Duplicate catalog lesson key: ' + lesson.key);
    keys.add(lesson.key);
  }
  const catalog = {
    schema: 'hanzi-quiz-catalog-v2',
    version: 2,
    source: 'packs/*.json catalog.included',
    includedPackCount: includedSources.length,
    lessonCount: lessons.length,
    lessons
  };
  if (writeFile) fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n');
  return catalog;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const catalog = buildCatalog();
  console.log('CATALOG_V2_BUILT packs=' + catalog.includedPackCount + ' lessons=' + catalog.lessonCount);
}
