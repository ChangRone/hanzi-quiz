import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
if(!chrome)throw Error('Chromium not found');
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const page=await browser.newPage();
  const pageErrors=[];
  const outside=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('request',q=>{if(!q.url().startsWith('http://127.0.0.1:8124/'))outside.push(q.url())});
  await page.goto('http://127.0.0.1:8124/poc/zhuyin-handwriting-qa-v3/index.html',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.zh-pilot-card');
  assert.deepEqual(pageErrors,[],'No script errors on page startup');
  assert.equal(await page.$eval('#category',e=>e.value),'risk');
  assert.equal(await page.$eval('#case',e=>e.options.length),10);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.zh-pilot-slot canvas').length),5,'five original writing zones');

  const categories={similar:23,tone:6,neutral:3,placement:6,all:48,risk:10};
  for(const [cat,num] of Object.entries(categories)){
    await page.select('#category',cat);
    assert.equal(await page.$eval('#case',e=>e.options.length),num,cat+' coverage');
    assert(await page.$eval('#qa-task',e=>e.textContent.length)>25,'instruction must remain usable');
  }
  await page.select('#category','risk');
  assert.match(await page.$eval('#qa-focus',e=>e.textContent),/ㄇ、ㄠ/);
  await page.$eval('#next-pending',e=>e.click());
  assert.equal(await page.$eval('#case',e=>e.value),'1','next incomplete case moves to risk #2');
  assert.match(await page.$eval('#qa-focus',e=>e.textContent),/ㄇ → ㄋ/);

  await page.select('#human','incorrect');
  await page.select('#input-mode','stylus');
  await page.click('.zh-pilot-actions button:first-child'); // empty input => fail
  await page.waitForFunction(()=>document.querySelector('#results').textContent.includes('已測 1 次'));
  assert.match(await page.$eval('#results',e=>e.textContent),/具真實觸控事件 0 次/,'no simulated touch treated as real');
  assert.equal(await page.$eval('#include-strokes',e=>e.checked),false,'private strokes are opt-in');

  await page.evaluate(()=>{
    const original=URL.createObjectURL.bind(URL);
    URL.createObjectURL=(blob)=>{window.__capturedQA=blob;return original(blob)};
  });
  await page.$eval('#export',e=>e.click());
  await page.waitForFunction(()=>!!window.__capturedQA);
  const payload=await page.evaluate(async()=>JSON.parse(await window.__capturedQA.text()));
  assert.equal(payload.schema,'hanzi-zhuyin-focused-handwriting-qa-v3');
  assert.equal(payload.focused.targetScenarios.length,48);
  assert.equal(payload.results.length,1);
  assert.equal(payload.results[0].caseId,'R02');
  assert.equal(payload.results[0].target,'ㄇ → ㄋ');
  assert.equal(payload.results[0].verifiedRealTouch,false);
  assert.equal(payload.results[0].drawing,undefined);
  assert.equal(payload.legacyAcceptanceSummary.status,'INSUFFICIENT_EVIDENCE');
  assert.deepEqual(outside,[],'offline QA must not request outside network');
  assert.deepEqual(pageErrors,[],'no page JS errors');
  const databases=await page.evaluate(()=>indexedDB.databases());
  assert.equal(databases.some(db=>db.name==='hanzi-quiz-learning-db'),false,'QA never touches Quiz learning DB');
  console.log('ZHUYIN_FOCUSED_QA_V3_BROWSER=PASS');
}finally {await browser.close();}
