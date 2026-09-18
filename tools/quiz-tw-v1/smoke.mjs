import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const candidates=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
const executablePath=candidates.find(p=>fs.existsSync(p));
if(!executablePath) throw new Error('Chrome/Chromium not found');
const requests=[];
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const page=await browser.newPage();
  page.on('request',r=>requests.push(r.url()));
  await page.setViewport({width:390,height:844,isMobile:true});
  await page.goto('http://127.0.0.1:8124/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#open-materials').disabled,{timeout:15000});
  const initialPackRequests=requests.filter(u=>/\/packs\//.test(u));
  if(initialPackRequests.length) throw new Error('metadata-first failed: packs loaded before selection: '+initialPackRequests.length);
  await page.click('#open-materials');
  await page.waitForSelector('input[data-lesson-key="20262020|03"]',{timeout:10000});
  const before=await page.$$eval('#lesson-list input:checked',xs=>xs.length);
  await page.click('input[data-lesson-key="20262020|03"]');
  await page.evaluate(()=>document.querySelector('#materials-dialog button[value="cancel"]').click());
  await page.waitForFunction(()=>!document.querySelector('#materials-dialog').open);
  await page.click('#open-materials');
  const after=await page.$$eval('#lesson-list input:checked',xs=>xs.length);
  if(after!==before) throw new Error('material cancel did not roll back draft selection');
  const target=await page.$('input[data-lesson-key="20262020|03"]');
  if(!(await target.evaluate(el=>el.checked))) await target.click();
  await page.click('#save-materials');
  await page.waitForFunction(()=>!document.querySelector('#materials-dialog').open);
  await page.waitForFunction(()=>!document.querySelector('#start-practice').disabled,{timeout:20000});
  await page.click('#start-practice');
  await page.waitForSelector('.bopomofo-cell',{timeout:20000});
  await page.click('#question-zoom-button');
  await new Promise(r=>setTimeout(r,180));
  const portrait=await page.evaluate(()=>{
    const card=document.querySelector('.question-card').getBoundingClientRect();
    const writer=document.querySelector('.writer-card')?.getBoundingClientRect();
    const text=document.querySelector('#question-text');
    return {cardRight:card.right,writerLeft:writer?.left||9999,overflow:getComputedStyle(text).overflow,scrollH:text.scrollHeight,clientH:text.clientHeight};
  });
  if(portrait.cardRight>portrait.writerLeft+2) throw new Error('zoomed prompt overlaps writer column: '+JSON.stringify(portrait));
  if(portrait.scrollH>portrait.clientH+4 && !['auto','scroll'].includes(portrait.overflow)) throw new Error('long prompt can still be clipped');
  await page.setViewport({width:900,height:600,isMobile:false});
  await new Promise(r=>setTimeout(r,220));
  const landscape=await page.evaluate(()=>{
    const cell=document.querySelector('.bopomofo-cell');
    const base=cell?.querySelector('.hanzi-character,.blank-char')?.getBoundingClientRect();
    const rt=cell?.querySelector('.bopomofo-rt')?.getBoundingClientRect();
    const tone=document.querySelector('.zhuyin-tone');
    return {baseRight:base?.right||0,rtLeft:rt?.left||0,tonePosition:tone?getComputedStyle(tone).position:''};
  });
  if(landscape.rtLeft<landscape.baseRight-2) throw new Error('Bopomofo is not right of Hanzi: '+JSON.stringify(landscape));
  if(landscape.tonePosition && landscape.tonePosition!=='absolute') throw new Error('tone anchor is not absolute');
  console.log('QUIZ_TW_CATALOG_BROWSER_SMOKE=PASS');
} finally { await browser.close(); }
