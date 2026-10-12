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
 // Exercise an actual question with the flag OFF.
 await page.click('#open-materials');
 await page.waitForSelector('input[data-lesson-key="20262020|03"]',{timeout:15000});
 await page.$eval('input[data-lesson-key="20262020|03"]',el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.click('#save-materials');
 await page.waitForFunction(()=>!document.querySelector('#start-practice').disabled,{timeout:20000});
 await page.click('#start-practice');
 await page.waitForSelector('.writer-card',{timeout:25000});
 assert.equal(await page.$('.zh-pilot-card'),null,'flag OFF: no handwriting panel in real quiz');
 await page.click('#back-home');
 await page.waitForFunction(()=>!document.querySelector('#home-view').classList.contains('hidden'));
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
 assert.equal(await page.$('.zh-pilot-slot canvas').then(a=>a.length),7,'all seven slots visible');
 // Simulate a cancelled touch and verify no ghost pixels survive.
 const ghost = await page.evaluate(()=>{
  const canvas=document.querySelector('.zh-pilot-g0 canvas'), b=canvas.getBoundingClientRect();
  const e={bubbles:true,pointerId:43,pointerType:'touch',clientX:b.left+25,clientY:b.top+25};
  canvas.dispatchEvent(new PointerEvent('pointerdown',e));
  canvas.dispatchEvent(new PointerEvent('pointermove',{...e,clientX:e.clientX+12}));
  canvas.dispatchEvent(new PointerEvent('pointercancel',e));
  const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  return [...d].some((n,i)=>i%4===3 && n>0);
 });
 assert.equal(ghost,false,'pointercancel leaves no ink');
 // Deliberately write in an answer-empty slot. Missing as well as extra ink
 // must be reported rather than forgiving the misplaced stroke.
 await page.evaluate(()=>{
  const reading=document.querySelector('.writer-label').textContent.trim();
  const expected=HanziZhuyinLayout.parseZhuyinSlots(reading);
  const key=Object.keys(expected).find(k=>!expected[k]);
  if(!key)throw new Error('No empty slot to test');
  const canvas=document.querySelector('.zh-pilot-'+key+' canvas'),b=canvas.getBoundingClientRect();
  const e={bubbles:true,pointerId:44,pointerType:'touch',clientX:b.left+25,clientY:b.top+25};
  canvas.dispatchEvent(new PointerEvent('pointerdown',e));
  canvas.dispatchEvent(new PointerEvent('pointerup',e));
 });
 await page.$eval('.zh-pilot-actions button',b=>b.click()); // invalid empty-slot mark
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
 assert.ok(events[0].zhuyinErrorKinds.includes('extra_ink'));
 // Disable after testing: new question must no longer show the panel.
 await page.click('#back-home');
 await page.click('#sync-status-button');
 await page.$eval('#zhuyin-pilot-toggle',el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.evaluate(()=>document.querySelector('#data-dialog').close());
 await page.click('#start-practice');
 await page.waitForSelector('.writer-card',{timeout:25000});
 assert.equal(await page.$('.zh-pilot-card'),null,'opt out hides panel');
 console.log('ZHUYIN_HANDWRITING_BROWSER_PILOT=PASS');
}finally{await browser.close();}
