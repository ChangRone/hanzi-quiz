import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const candidates = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);
const executablePath = candidates.find(p => fs.existsSync(p));
if (!executablePath) throw new Error('Chrome/Chromium not found');

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  const requests = [];
  await page.setRequestInterception(true);
  page.on('request', req => {
    requests.push(req.url());
    req.continue();
  });

  await page.evaluateOnNewDocument(() => {
    window.__speechSynthesisSpeakCalls = 0;
    const patch = () => {
      if (!window.speechSynthesis || typeof window.speechSynthesis.speak !== 'function') return;
      try {
        const original = window.speechSynthesis.speak.bind(window.speechSynthesis);
        window.speechSynthesis.speak = (...args) => {
          window.__speechSynthesisSpeakCalls += 1;
          return original(...args);
        };
      } catch {}
    };
    patch();
    window.addEventListener('DOMContentLoaded', patch, { once: true });
  });

  await page.goto('http://127.0.0.1:8124/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('#open-materials').disabled, { timeout: 15000 });

  await page.click('#open-materials');
  await page.waitForSelector('input[data-lesson-key="20262020|03"]', { timeout: 10000 });
  await page.evaluate(() => {
    document.querySelectorAll('#lesson-list input[data-lesson-key]').forEach(x => { x.checked = false; });
  });
  await page.click('input[data-lesson-key="20262020|03"]');
  await page.click('#save-materials');
  await page.waitForFunction(() => !document.querySelector('#materials-dialog').open);
  await page.waitForFunction(() => !document.querySelector('#start-practice').disabled, { timeout: 20000 });
  await page.click('#start-practice');
  await page.waitForSelector('.writer-box svg', { timeout: 20000 });
  await new Promise(resolve => setTimeout(resolve, 1000));

  const speechCalls = await page.evaluate(() => window.__speechSynthesisSpeakCalls || 0);
  if (speechCalls !== 0) {
    throw new Error('Production Quiz invoked speechSynthesis.speak(): ' + speechCalls);
  }

  const mp3Request = requests.find(url =>
    /https:\/\/changrone\.github\.io\/hanzi-writing-lab\/production-audio\/v1\/audio\/202620200301\.mp3(?:\?|$)/.test(url)
  );
  if (!mp3Request) {
    throw new Error('No Lab Azure MP3 request observed. MP3 requests: ' + requests.filter(x => x.includes('.mp3')).join(', '));
  }

  const geometry = async () => page.evaluate(() => {
    const box = document.querySelector('.writer-box');
    const svg = box && box.querySelector('svg');
    if (!box || !svg) return null;
    const b = box.getBoundingClientRect();
    const s = svg.getBoundingClientRect();
    return {
      box: { x: b.x, y: b.y, width: b.width, height: b.height, clientWidth: box.clientWidth, clientHeight: box.clientHeight },
      svg: { x: s.x, y: s.y, width: s.width, height: s.height }
    };
  });

  const before = await geometry();
  if (!before) throw new Error('Writer geometry unavailable before rotation');

  await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
  await new Promise(resolve => setTimeout(resolve, 700));

  const after = await geometry();
  if (!after) throw new Error('Writer geometry unavailable after rotation');

  const close = (a, b, tolerance = 3) => Math.abs(a - b) <= tolerance;
  if (!close(after.svg.width, after.box.clientWidth) || !close(after.svg.height, after.box.clientHeight)) {
    throw new Error('Writer SVG size is stale after rotation: ' + JSON.stringify({ before, after }));
  }
  const boxCenterX = after.box.x + after.box.width / 2;
  const boxCenterY = after.box.y + after.box.height / 2;
  const svgCenterX = after.svg.x + after.svg.width / 2;
  const svgCenterY = after.svg.y + after.svg.height / 2;
  if (!close(boxCenterX, svgCenterX) || !close(boxCenterY, svgCenterY)) {
    throw new Error('Writer SVG is not centered after rotation: ' + JSON.stringify({ before, after }));
  }

  console.log('AZURE_AUDIO_ROTATION_SMOKE=PASS');
  console.log(JSON.stringify({ mp3Request, speechCalls, before, after }));
} finally {
  await browser.close();
}
