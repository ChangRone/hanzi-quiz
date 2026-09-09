import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const executablePath = candidates.find(p => fs.existsSync(p));
if (!executablePath) throw new Error(`Chrome/Chromium not found: ${candidates.join(', ')}`);

const samples = ['歡','口','亢','抗','覷','天','空','雲','鳥','水','草','去','再','先','完','院','船','陽','種','像'];
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8124/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof buildCharDataLoader === 'function' && typeof loadApprovedCharacterData === 'function' && typeof resolveCharTemplate === 'function', { timeout: 10000 });

  const result = await page.evaluate(async chars => {
    const validateData = (ch, data) => ({
      ch,
      path: resolveCharTemplate('char-data/moe-6063-v1/{hex}.json', ch),
      strokes: data?.strokes?.length || 0,
      medians: data?.medians?.length || 0,
      radStrokes: Array.isArray(data?.radStrokes)
    });

    const approved = [];
    for (const ch of chars) {
      approved.push(validateData(ch, await loadApprovedCharacterData(ch)));
    }

    const defaultLoadOne = ch => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout loading ${ch}`)), 8000);
      try {
        const loader = buildCharDataLoader({ mode: 'default', customTemplate: 'char-data/{char}.json' });
        loader(ch, data => {
          clearTimeout(timer);
          resolve(validateData(ch, data));
        });
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });

    const defaultLoaded = [];
    for (const ch of ['歡','口','亢','抗','覷']) defaultLoaded.push(await defaultLoadOne(ch));

    return {
      label: formatCharSourceModeLabel('default'),
      approved,
      defaultLoaded
    };
  }, samples);

  if (result.label !== 'MOE 6063 核可字庫') throw new Error(`unexpected source label: ${result.label}`);

  for (const item of result.approved) {
    if (!item.path.match(/^char-data\/moe-6063-v1\/[0-9a-f]+\.json$/)) throw new Error(`${item.ch}: bad resolved path ${item.path}`);
    if (item.strokes < 1 || item.strokes !== item.medians || !item.radStrokes) throw new Error(`${item.ch}: invalid approved runtime data ${JSON.stringify(item)}`);
    if (item.ch === '覷' && item.strokes !== 18) throw new Error(`覷 approved runtime expected 18 strokes, got ${item.strokes}`);
  }

  for (const item of result.defaultLoaded) {
    const approvedItem = result.approved.find(x => x.ch === item.ch);
    if (!approvedItem) throw new Error(`${item.ch}: approved comparison missing`);
    if (item.strokes !== approvedItem.strokes || item.medians !== approvedItem.medians) throw new Error(`${item.ch}: default loader did not match approved dataset`);
  }

  console.log('M2_1_BROWSER_SMOKE=PASS');
  console.log(`sourceLabel=${result.label}`);
  for (const item of result.approved) console.log(`${item.ch} ${item.path} strokes=${item.strokes}`);
  console.log('defaultLoaderSamples=歡口亢抗覷 matched approved dataset');
} finally {
  await browser.close();
}
