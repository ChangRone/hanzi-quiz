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
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.zh-pilot-slot canvas').length),5);
  const positions = await page.evaluate(()=>Object.fromEntries(['neutral','g0','g1','g2','tone'].map(k=>{
    const box=document.querySelector('.zh-pilot-'+k);
    return [k,{x:Number.parseInt(box.style.left),y:Number.parseInt(box.style.top)}];
  })));
  assert.deepEqual(positions,{
    neutral:{x:169,y:43},g0:{x:172,y:163},g1:{x:170,y:245},
    g2:{x:168,y:327},tone:{x:255,y:245}
  },'all five compact positions match the approved template');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.zh-pilot-tone-note').length),1,'one tone note');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.zh-pilot-rule').length),0,'no extra slot teaching paragraph');
  assert.equal(await page.$eval('.zh-pilot-g0 span',e=>e.textContent),'上格');
  await page.select('#human','incorrect');
  await page.select('#input-mode','mouse');
  await page.click('.zh-pilot-actions button');
  await page.waitForFunction(()=>document.querySelector('#results').textContent.includes('已收錄 1 次'),{timeout:10000});
  assert.match(await page.$eval('#results',e=>e.textContent),/符號錯 1 次/,'empty answer fails');
  await page.select('#case','4');
  await page.select('#input-mode','finger'); // False claim must not count fake touch
  // Neutral-tone single tap must be painted and counted without pointermove.
  const dot = await page.evaluate(()=>{
    const canvas=document.querySelector('.zh-pilot-neutral canvas'), rect=canvas.getBoundingClientRect();
    const ev={pointerId:7,pointerType:'touch',bubbles:true,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2};
    canvas.dispatchEvent(new PointerEvent('pointerdown',ev));
    canvas.dispatchEvent(new PointerEvent('pointerup',ev));
    const a=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    return [...a].filter((n,i)=>i%4===3&&n>0).length;
  });
  assert(dot>0,'single neutral tap must leave a visible ink dot');
  assert.match(await page.$eval('#reading',e=>e.textContent),/ㄕㄨ˙/,'neutral tone case');
  await page.select('#human','incorrect');
  await page.click('.zh-pilot-actions button');
  await page.waitForFunction(()=>document.querySelector('#results').textContent.includes('已收錄 2 次'),{timeout:10000});
  assert.match(await page.$eval('#results',e=>e.textContent),/INSUFFICIENT_EVIDENCE/,'automation cannot qualify as real-touch acceptance');
  assert.match(await page.$eval('#results',e=>e.textContent),/符合實際觸控證據 0 次/,
    'synthetic PointerEvent pretending to be touch is not trusted');
  assert.match(await page.$eval('#qa-notice',e=>e.textContent),/不能計入真人觸控 Gate/,
    'manual choice alone cannot count as verified touchscreen evidence');
  assert.equal(await page.$eval('#include-strokes',e=>e.checked),false,'raw handwriting capture opt-in must be OFF');
    assert.equal(requests.filter(url=>!url.startsWith('http://127.0.0.1:8124/')).length,0,'standalone QA must not access third parties');
  const databases=await page.evaluate(()=>indexedDB.databases());
  assert.equal(databases.some(db=>db.name==='hanzi-quiz-learning-db'),false,
    'QA page must not create or open the production learning database');
  console.log('ZHUYIN_QA_STANDALONE_BROWSER=PASS');
}finally{await browser.close()}
