import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const executablePath = candidates.find(x => fs.existsSync(x));
if (!executablePath) throw new Error('Chrome/Chromium missing');
const browser = await puppeteer.launch({ executablePath, headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  // Seed version-1 data on the same origin, without loading the application.
  await page.goto('http://127.0.0.1:8124/config/schema-config.json');
  await page.evaluate(async () => {
    const name = 'hanzi-quiz-learning-db';
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const events = db.createObjectStore('review_events', {keyPath:'id'});
        events.createIndex('by_skill_key','skillKey',{unique:false});
        events.createIndex('by_time','reviewedAt',{unique:false});
        db.createObjectStore('skill_state',{keyPath:'key'});
      };
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction(['review_events','skill_state'],'readwrite');
        tx.objectStore('review_events').put({
          id:'old-event-001', appVersion:'v1', char:'貓', skill:'context_write',
          skillKey:'貓|context_write', courseKey:'20262020|03',
          reviewedAt:'2026-10-01T00:00:00.000Z', result:'pass',
          mode:'normal', allowBackwards:true
        });
        tx.objectStore('skill_state').put({key:'貓|context_write',char:'貓',skill:'context_write',stage:3,dueAt:'2026-11-01T00:00:00.000Z',lastResult:'pass'});
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  await page.goto('http://127.0.0.1:8124/', {waitUntil:'domcontentloaded'});
  const verify = () => page.evaluate(() => new Promise((resolve,reject) => {
    const req = indexedDB.open('hanzi-quiz-learning-db');
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction(['review_events','skill_state'],'readonly');
      const re = tx.objectStore('review_events').getAll();
      const ss = tx.objectStore('skill_state').getAll();
      tx.oncomplete = () => { const result={version:db.version,events:re.result,states:ss.result};db.close();resolve(result);};
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }));
  const first = await verify();
  assert.equal(first.version,2);
  assert.equal(first.events.length,1);
  assert.equal(first.events[0].id,'old-event-001');
  assert.equal(first.events[0].eventType,'tested');
  assert.equal(first.events[0].result,'pass');
  assert.equal(first.states[0].stage,3,'preexisting mastery must survive');
  await page.reload({waitUntil:'domcontentloaded'});
  const second = await verify();
  assert.deepEqual(second.events,first.events,'repeat launch must be idempotent');
  assert.deepEqual(second.states,first.states,'no mastery reset on restart');
  console.log('REVIEW_EVENT_V2_BROWSER_MIGRATION=PASS');
} finally { await browser.close(); }
