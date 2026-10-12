import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const executablePath = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
if (!executablePath) throw new Error('Chrome/Chromium not found');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const base = 'http://127.0.0.1:8124/';

const old = (id, char, result, reviewedAt) => ({
  id, appVersion: 'historical-v1', char, skill: 'context_write',
  skillKey: char + '|context_write', courseKey: '20262020|03',
  reviewedAt, result, mode: 'normal', allowBackwards: true
});

function readStorage(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('hanzi-quiz-learning-db');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['review_events', 'skill_state'], 'readonly');
      const ev = tx.objectStore('review_events').getAll();
      const ss = tx.objectStore('skill_state').getAll();
      tx.oncomplete = () => { db.close(); resolve({ version: db.version, events: ev.result, states: ss.result }); };
      tx.onerror = () => reject(tx.error);
    };
  }));
}

async function seed(page, events, stateRows = []) {
  await page.goto(base + 'config/schema-config.json');
  await page.evaluate(({ events, stateRows }) => new Promise((resolve, reject) => {
    const req = indexedDB.open('hanzi-quiz-learning-db', 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result, store = db.createObjectStore('review_events', { keyPath: 'id' });
      store.createIndex('by_skill_key', 'skillKey', { unique: false });
      store.createIndex('by_time', 'reviewedAt', { unique: false });
      db.createObjectStore('skill_state', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction(['review_events', 'skill_state'], 'readwrite');
      for (const row of events) tx.objectStore('review_events').put(row);
      for (const row of stateRows) tx.objectStore('skill_state').put(row);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { events, stateRows });
}

try {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const original = [
    old('old-A', '貓', 'pass', '2026-09-01T00:00:00.000Z'),
    old('old-B', '貓', 'fail', '2026-09-02T00:00:00.000Z')
  ];
  const preexistingState = {
    key: '貓|context_write', char: '貓', skill: 'context_write',
    stage: 4, dueAt: '2026-12-31T00:00:00.000Z', lastResult: 'fail'
  };
  await seed(page, original, [preexistingState]);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#sync-status-button'), { timeout: 15000 });
  let snapshot = await readStorage(page);
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.events.length, 2);
  assert.deepEqual(snapshot.states, [preexistingState], 'existing skill_state must survive migration exactly');
  for (const event of original) {
    const migrated = snapshot.events.find(x => x.id === event.id);
    assert.deepEqual(migrated, { ...event, eventType: 'tested' }, 'lossless event conversion');
  }

  // Import an old v1 export twice. It must merge without overwriting history or duplicating IDs.
  const backup = {
    schema: 'hanzi-quiz-learning-backup', version: 1, exportedAt: '2026-09-03T00:00:00.000Z',
    prefs: {}, events: [old('from-v1-backup', '雲', 'pass', '2026-09-03T00:00:00.000Z')]
  };
  const tempFile = path.join(os.tmpdir(), 'hanzi-event-v1-fixture-' + process.pid + '.json');
  fs.writeFileSync(tempFile, JSON.stringify(backup));
  try {
    await page.click('#sync-status-button');
    for (let n = 0; n < 2; n++) {
      await page.$eval('#import-data-file', input => { input.value = ''; });
      const input = await page.$('#import-data-file');
      await input.uploadFile(tempFile);
      await page.waitForFunction(() => document.querySelector('#drive-status').textContent.includes('匯入完成'), { timeout: 15000 });
    }
  } finally { fs.unlinkSync(tempFile); }
  snapshot = await readStorage(page);
  assert.equal(snapshot.events.length, 3, 'v1 backup imported idempotently');
  assert.equal(new Set(snapshot.events.map(x => x.id)).size, 3);
  assert.equal(snapshot.events.find(x => x.id === 'from-v1-backup').eventType, 'tested');
  assert.equal(snapshot.states.find(x => x.key === '雲|context_write')?.stage, 0);

  // Collect the actual application export, not a mocked serializer.
  await page.evaluate(() => {
    const oldCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.__lastExportBlob = blob; return oldCreate(blob); };
  });
  await page.click('#export-data');
  const exported = await page.evaluate(async () => JSON.parse(await window.__lastExportBlob.text()));
  assert.equal(exported.version, 2);
  assert.equal(exported.events.length, 3);
  assert(exported.events.every(event => event.eventType === 'tested'));

  // An exposure from another character must not create skill_state on rebuild.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('hanzi-quiz-learning-db');
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('review_events', 'readwrite');
      tx.objectStore('review_events').put({
        id:'visible-only', appVersion:'v2', char:'天', skill:'context_write',
        skillKey:'天|context_write', courseKey:'20262020|03',
        reviewedAt:'2026-09-04T00:00:00.000Z', eventType:'exposed', result:null, mode:'normal'
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }));
  await page.evaluate(() => document.querySelector('#data-dialog').close());
  await page.click('#open-learning-settings');
  await page.click('#save-learning-settings');
  await page.waitForFunction(() => !document.querySelector('#learning-settings-dialog').open);
  snapshot = await readStorage(page);
  assert.equal(snapshot.events.length, 4);
  assert(!snapshot.states.find(row => row.key === '天|context_write'), 'exposed must not increase mastery');
  assert.equal(snapshot.states.find(row => row.key === '雲|context_write').stage, 0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await readStorage(page);
  assert.deepEqual(afterReload.events, snapshot.events, 'events must survive repeat launch');

  // Verify a malformed v1 row fails atomically, leaving the original DB at v1.
  const badContext = await browser.createBrowserContext();
  const badPage = await badContext.newPage();
  const badLegacy = { ...old('broken-row', '雨', 'pass', '2026-09-01T00:00:00.000Z'), result: null };
  await seed(badPage, [badLegacy]);
  await badPage.goto(base, { waitUntil: 'domcontentloaded' });
  await badPage.waitForFunction(() => document.querySelector('#home-message').textContent.includes('無法啟用'), { timeout: 15000 });
  const bad = await readStorage(badPage);
  assert.equal(bad.version, 1, 'invalid migration must keep DB version 1');
  assert.deepEqual(bad.events, [badLegacy], 'invalid migration must keep bytes of historical record');
  await badContext.close();
  await context.close();
  console.log('REVIEW_EVENT_V2_BACKUP_AND_ROLLBACK=PASS');
} finally {
  await browser.close();
}
