import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
if(!chrome)throw Error('Chromium is unavailable');
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  const page=await browser.newPage();
  const requests=[];
  page.on('request',x=>requests.push(x.url()));
  page.on('pageerror',error=>{throw error});
  await page.goto('http://127.0.0.1:8124/poc/zhuyin-handwriting-qa/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.zh-pilot-card');
  assert.equal(await page.$eval('#case',e=>e.options.length),9);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.zh-pilot-slot canvas').length),7);
  await page.click('.zh-pilot-actions button');
  await page.waitForFunction(()=>document.querySelector('#results').textContent.includes('共 1 次'),{timeout:10000});
  assert.match(await page.$eval('#results',e=>e.textContent),/FAIL 1/,'empty answer fails');
  await page.select('#case','4');
  assert.match(await page.$eval('#reading',e=>e.textContent),/ㄕㄨ˙/,'neutral tone case');
  await page.click('.zh-pilot-actions button');
  await page.waitForFunction(()=>document.querySelector('#results').textContent.includes('共 2 次'),{timeout:10000});
  assert.equal(requests.filter(url=>!url.startsWith('http://127.0.0.1:8124/')).length,0,'standalone QA must not access third parties');
  const databases=await page.evaluate(()=>indexedDB.databases());
  assert.equal(databases.some(db=>db.name==='hanzi-quiz-learning-db'),false,
    'QA page must not create or open the production learning database');
  console.log('ZHUYIN_QA_STANDALONE_BROWSER=PASS');
}finally{await browser.close()}
