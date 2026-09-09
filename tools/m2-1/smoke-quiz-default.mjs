import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const executablePath = candidates.find(p => fs.existsSync(p));
if (!executablePath) throw new Error(`Chrome/Chromium not found: ${candidates.join(', ')}`);

const samples = ['歡','口','亢','抗','覷','天','空','雲','鳥','水','草','去','再','先','完','院','船','陽','種','像'];
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  const approvedRequests = [];
  page.on('response', res => {
    const url = res.url();
    if (url.includes('/char-data/moe-6063-v1/')) approvedRequests.push({ url, status: res.status() });
  });
  await page.goto('http://127.0.0.1:8124/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof buildCharDataLoader === 'function' && typeof resolveCharTemplate === 'function', { timeout: 10000 });

  const result = await page.evaluate(async chars => {
    const loadOne = ch => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout loading ${ch}`)), 8000);
      try {
        const loader = buildCharDataLoader({ mode: 'default', customTemplate: 'char-data/{char}.json' });
        loader(ch, data => {
          clearTimeout(timer);
          resolve({
            ch,
            path: resolveCharTemplate('char-data/moe-6063-v1/{hex}.json', ch),
            strokes: data?.strokes?.length || 0,
            medians: data?.medians?.length || 0,
            radStrokes: Array.isArray(data?.radStrokes)
          });
        });
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
    const out = [];
    for (const ch of chars) out.push(await loadOne(ch));
    return {
      label: formatCharSourceModeLabel('default'),
      items: out
    };
  }, samples);

  if (result.label !== 'MOE 6063 核可字庫') throw new Error(`unexpected source label: ${result.label}`);
  for (const item of result.items) {
    if (!item.path.match(/^char-data\/moe-6063-v1\/[0-9a-f]+\.json$/)) throw new Error(`${item.ch}: bad resolved path ${item.path}`);
    if (item.strokes < 1 || item.strokes !== item.medians || !item.radStrokes) throw new Error(`${item.ch}: invalid runtime data ${JSON.stringify(item)}`);
    if (item.ch === '覷' && item.strokes !== 18) throw new Error(`覷 runtime expected 18 strokes, got ${item.strokes}`);
  }
  const okResponses = approvedRequests.filter(x => x.status === 200);
  if (okResponses.length < samples.length) throw new Error(`approved dataset requests too few: ${okResponses.length}/${samples.length}`);

  console.log('M2_1_BROWSER_SMOKE=PASS');
  console.log(`sourceLabel=${result.label}`);
  for (const item of result.items) console.log(`${item.ch} ${item.path} strokes=${item.strokes}`);
} finally {
  await browser.close();
}
