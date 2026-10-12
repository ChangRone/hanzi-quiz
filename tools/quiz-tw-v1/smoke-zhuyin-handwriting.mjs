import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
const z=require('../../assets/zhuyin-layout.js');
const h=require('../../assets/zhuyin-handwriting.js');
assert.equal(h.similarity([[2,2],[3,3]],[[2,2],[3,3]]),1);
assert.equal(h.similarity([[2,2],[3,3]],[[35,35],[36,36]]),0);
for(const reading of ['ㄇㄠ','ㄒㄧㄤˋ','ㄧ','ㄕㄨˊ','ㄕㄨ˙','ㄩˇ','ㄩㄢˊ','ㄒㄩˊ','ㄒㄩㄢˊ']) {
 const slots=z.parseZhuyinSlots(reading);
 assert.equal(z.composeVerifiedZhuyin(slots),reading);
 const occ=Object.fromEntries(z.SLOT_KEYS.map(k=>[k,!!slots[k]]));
 assert.equal(z.validateSlotOccupancy(slots,occ).ok,true);
 const blank=z.SLOT_KEYS.find(k=>!slots[k]);if(blank){occ[blank]=true;assert.equal(z.validateSlotOccupancy(slots,occ).ok,false);}
}
assert.equal(z.acceptNeutralGesture({strokeCount:1,pointCount:1,width:0,height:0,path:0}).state,'pass');
assert.equal(z.acceptNeutralGesture({strokeCount:1,pointCount:20,width:80,height:10,path:140}).state,'fail');
const code=readFileSync(new URL('../../assets/app.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
assert.match(code,/zhuyinPilotEnabled: false/);
assert.match(code,/if \(!state.zhuyinPilotEnabled/);
assert.match(code,/skill: 'zhuyin_write'/);
assert.match(code,/verdict.state === 'uncertain'/);
assert.match(page,/id="zhuyin-pilot-toggle"/);
console.log('ZHUYIN_HANDWRITING_FEATURE_FLAG_SMOKE=PASS');
