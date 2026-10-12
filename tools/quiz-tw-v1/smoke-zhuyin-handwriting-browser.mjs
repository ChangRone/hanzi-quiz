import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const executablePath=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(x=>fs.existsSync(x));
if(!executablePath)throw new Error('Chromium missing');
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage();
 page.on('pageerror',err=>console.error('PAGE ERROR',err.message));
 await page.goto('http://127.0.0.1:8124/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>!document.querySelector('#open-materials').disabled,{timeout:20000});
 assert.equal(await page.$('.zh-pilot-card'),null,'default off');
 await page.click('#sync-status-button');
 await page.waitForSelector('#zhuyin-pilot-toggle');
 await page.$eval('#zhuyin-pilot-toggle',el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.$eval('#zhuyin-pilot-toggle',el=>el.checked),true);
 await page.evaluate(()=>document.querySelector('#data-dialog').close());
 await page.click('#open-materials');
 await page.waitForSelector('input[data-lesson-key="20262020|03"]',{timeout:15000});
 await page.$eval('input[data-lesson-key="20262020|03"]',el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.click('#save-materials');
 await page.waitForFunction(()=>!document.querySelector('#start-practice').disabled,{timeout:20000});
 await page.click('#start-practice');
 await page.waitForSelector('.zh-pilot-card',{timeout:25000});
 assert.equal(await page.$$('.zh-pilot-slot canvas').then(a=>a.length),7,'all seven slots visible');
 await page.$eval('.zh-pilot-actions button',b=>b.click()); // empty answer must fail
 await page.waitForFunction(()=>document.querySelector('.zh-pilot-result').textContent.includes('注音有'));
 const events=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const req=indexedDB.open('hanzi-quiz-learning-db');
  req.onsuccess=()=>{const db=req.result,tx=db.transaction('review_events','readonly'),get=tx.objectStore('review_events').getAll();
   tx.oncomplete=()=>{db.close();resolve(get.result.filter(e=>e.skill==='zhuyin_write'));};
   tx.onerror=()=>reject(tx.error);};
  req.onerror=()=>reject(req.error);
 }));
 assert.equal(events.length,1);
 assert.equal(events[0].eventType,'tested');
 assert.equal(events[0].result,'fail');
 assert.equal(events[0].zhuyinCorrect,false);
 assert.ok(events[0].zhuyinErrorKinds.includes('missing_symbol'));
 console.log('ZHUYIN_HANDWRITING_BROWSER_PILOT=PASS');
}finally{await browser.close();}
