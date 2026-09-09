import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const ROOT = process.cwd();
const LIST = path.join(ROOT, 'tools/corpus-import/moe-6063-v1-hex.txt');
const EXPECTED = (await fs.readFile(path.join(ROOT, 'tools/corpus-import/moe-6063-v1-expected-root.txt'), 'utf8')).trim();
const OUT = path.join(ROOT, 'char-data/moe-6063-v1');
const MAN = path.join(ROOT, 'manifest/char-data/moe-6063-v1');
const hexes = (await fs.readFile(LIST, 'utf8')).trim().split(/\s+/).filter(Boolean);
if (hexes.length !== 6063) throw new Error(`corpus list must have 6063 entries; got ${hexes.length}`);
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await fs.mkdir(MAN, { recursive: true });

const chromeCandidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const executablePath = chromeCandidates.find(p => fssync.existsSync(p));
if (!executablePath) throw new Error(`Chrome/Chromium not found: ${chromeCandidates.join(', ')}`);

const server = spawn('python3', ['-m', 'http.server', '8123', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(resolve, 1000);
  server.once('error', e => { clearTimeout(t); reject(e); });
});

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const pages = [];
const workers = Math.max(1, Math.min(4, Number(process.env.CORPUS_WORKERS || 4)));
for (let i = 0; i < workers; i++) {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8123/tools/corpus-import/optimizer-runtime.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!window.MedianProbe, { timeout: 10000 });
  pages.push(page);
}

let cursor = 0, done = 0;
const failures = [];
async function generateOne(page, hex) {
  const char = String.fromCodePoint(parseInt(hex, 16));
  return page.evaluate(async ({ char, hex }) => {
    const round = n => Math.round(n * 100) / 100;
    if (char === '覷') {
      const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/${encodeURIComponent(char)}.json`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HW reference HTTP ${r.status}`);
      const raw = await r.json();
      if (!raw || !Array.isArray(raw.strokes) || !Array.isArray(raw.medians) || raw.strokes.length !== raw.medians.length || !raw.medians.every(m => Array.isArray(m) && m.length >= 2)) throw new Error('覷 HW reference invalid');
      return { strokes: raw.strokes, medians: raw.medians, radStrokes: Array.isArray(raw.radStrokes) ? raw.radStrokes : [] };
    }
    const url = `https://www.moedict.tw/api/stroke-json/${hex}.json`;
    const raw = await window.MedianProbe.fetchJson(url);
    const a = window.MedianProbe.adaptStrokeJson(raw);
    const settings = window.MedianProbe.settingsFromUi();
    const medians = [];
    for (let i = 0; i < a.data.strokes.length; i++) {
      const rr = window.MedianProbe.optimizeStroke(a.data.strokes[i], a.data.medians[i] || [], settings);
      if (!rr.valid) throw new Error(`optimizer fail stroke ${i + 1}: ${rr.q?.failureCode || 'FAILED'}`);
      medians.push((rr.points || []).map(p => [round(p[0]), round(p[1])]));
    }
    return { strokes: a.data.strokes, medians, radStrokes: [] };
  }, { char, hex });
}

async function worker(page, id) {
  while (true) {
    const i = cursor++;
    if (i >= hexes.length) return;
    const hex = hexes[i];
    try {
      const hw = await generateOne(page, hex);
      await fs.writeFile(path.join(OUT, `${hex}.json`), JSON.stringify(hw));
    } catch (e) {
      failures.push({ hex, char: String.fromCodePoint(parseInt(hex, 16)), error: String(e?.message || e) });
      console.error(`[worker ${id}] FAIL ${hex}:`, e);
    }
    done++;
    if (done % 50 === 0 || done === hexes.length) console.log(`generated ${done}/${hexes.length} failures=${failures.length}`);
  }
}

try {
  await Promise.all(pages.map((p, i) => worker(p, i + 1)));
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
if (failures.length) {
  await fs.writeFile(path.join(MAN, 'generation-failures.json'), JSON.stringify(failures, null, 2));
  throw new Error(`generation failed for ${failures.length} characters`);
}

const hashes = [];
for (const hex of hexes) {
  const b = await fs.readFile(path.join(OUT, `${hex}.json`));
  hashes.push(`${hex}:${crypto.createHash('sha256').update(b).digest('hex')}\n`);
}
const rootHash = crypto.createHash('sha256').update(hashes.join('')).digest('hex');
console.log(`corpusRoot=${rootHash}`);
if (rootHash !== EXPECTED) {
  await fs.writeFile(path.join(MAN, 'root-mismatch.json'), JSON.stringify({ expected: EXPECTED, actual: rootHash }, null, 2));
  throw new Error(`approved corpus root mismatch: expected ${EXPECTED}, actual ${rootHash}`);
}

const info = {
  dataset: 'MOE-6063',
  version: 'moe-6063-v1',
  format: 'hanzi-writer-character-data',
  total: 6063,
  accepted: 6063,
  approved: 6062,
  exceptionApproved: 1,
  optimizerVersion: 'median-v3-adaptive-failclosed',
  settingsSignature: '{"mode":"auto","spacing":16,"gridStep":4,"edgeWeight":45,"rawWeight":0.025,"smoothPasses":1,"autoTune":true}',
  corpusRootSha256: rootHash,
  source: 'MOE 2025 stroke JSON via moedict.tw',
  runtimePolicy: 'frozen-approved-dataset; do not regenerate at Quiz runtime',
  exceptions: [{ char: '覷', hex: '89b7', reviewStatus: 'EXCEPTION_APPROVED', reason: 'HW_REFERENCE_OVERRIDE', moeStrokeCount: 19, hwStrokeCount: 18 }],
  generatedForDeploymentAt: new Date().toISOString()
};
await fs.writeFile(path.join(MAN, 'dataset-info.json'), JSON.stringify(info, null, 2));
await fs.writeFile(path.join(MAN, 'corpus-root.sha256'), `${rootHash}  moe-6063-v1\n`);
console.log('APPROVED_CORPUS_VERIFY=PASS');
