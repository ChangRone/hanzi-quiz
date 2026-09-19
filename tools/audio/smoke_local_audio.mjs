import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const candidates=[
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);
const executablePath=candidates.find(p=>fs.existsSync(p));
if(!executablePath) throw new Error('Chrome/Chromium not found');

const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
try{
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,isMobile:true});

  const requested=[];
  await page.setRequestInterception(true);
  page.on('request',req=>{
    requested.push(req.url());
    req.continue();
  });

  await page.evaluateOnNewDocument(()=>{
    window.__speechSynthesisSpeakCalls=0;
    const install=()=>{
      if(!window.speechSynthesis) return;
      try{
        const original=window.speechSynthesis.speak.bind(window.speechSynthesis);
        window.speechSynthesis.speak=(...args)=>{
          window.__speechSynthesisSpeakCalls+=1;
          return original(...args);
        };
      }catch{}
    };
    install();
    window.addEventListener('DOMContentLoaded',install,{once:true});
  });

  await page.goto('http://127.0.0.1:8124/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#open-materials').disabled,{timeout:15000});

  await page.click('#open-materials');
  await page.waitForSelector('input[data-lesson-key="20262020|03"]',{timeout:10000});
  await page.evaluate(()=>{
    document.querySelectorAll('#lesson-list input[data-lesson-key]').forEach(x=>{x.checked=false;});
  });
  const target=await page.$('input[data-lesson-key="20262020|03"]');
  await target.click();
  await page.click('#save-materials');
  await page.waitForFunction(()=>!document.querySelector('#materials-dialog').open);
  await page.waitForFunction(()=>!document.querySelector('#start-practice').disabled,{timeout:20000});
  await page.click('#start-practice');
  await page.waitForSelector('.writer-box',{timeout:20000});
  await new Promise(r=>setTimeout(r,1200));

  const speechCalls=await page.evaluate(()=>window.__speechSynthesisSpeakCalls||0);
  if(speechCalls!==0) throw new Error('Production Quiz invoked speechSynthesis.speak(): '+speechCalls);

  const mp3=request=requested.find(url=>/\/assets\/audio\/v1\/audio\/202620200301\.mp3(?:\?|$)/.test(url));
  if(!mp3request) {
    throw new Error('No same-origin production MP3 request observed. Requests: '+requested.filter(x=>x.includes('.mp3')).join(', '));
  }
  if(!mp3request.startsWith('http://127.0.0.1:8124/')) throw new Error('Audio is not same-origin: '+mp3request);

  const audioState=await page.evaluate(()=>{
    const q=window.__speechSynthesisSpeakCalls||0;
    return {speechCalls:q,buttonDisabled:document.querySelector('#audio-button').disabled};
  });
  console.log('LOCAL_AZURE_AUDIO_BROWSER_SMOKE=PASS',JSON.stringify({mp3request,audioState}));
}finally{
  await browser.close();
}
