import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const z = require('../../assets/zhuyin-layout.js');

const cases = [
  ['貓', 'ㄇㄠ', { neutral:'', g0:'ㄇ', g1:'', g2:'ㄠ', t0:'', t1:'', t2:'' }],
  ['巷', 'ㄒㄧㄤˋ', { neutral:'', g0:'ㄒ', g1:'ㄧ', g2:'ㄤ', t0:'', t1:'', t2:'ˋ' }],
  ['一', 'ㄧ', { neutral:'', g0:'', g1:'ㄧ', g2:'', t0:'', t1:'', t2:'' }],
  ['叔二聲', 'ㄕㄨˊ', { neutral:'', g0:'ㄕ', g1:'', g2:'ㄨ', t0:'', t1:'', t2:'ˊ' }],
  ['叔輕聲', 'ㄕㄨ˙', { neutral:'˙', g0:'ㄕ', g1:'', g2:'ㄨ', t0:'', t1:'', t2:'' }],
  ['語', 'ㄩˇ', { neutral:'', g0:'', g1:'ㄩ', g2:'', t0:'', t1:'ˇ', t2:'' }],
  ['園', 'ㄩㄢˊ', { neutral:'', g0:'ㄩ', g1:'', g2:'ㄢ', t0:'', t1:'', t2:'ˊ' }],
  ['徐', 'ㄒㄩˊ', { neutral:'', g0:'ㄒ', g1:'', g2:'ㄩ', t0:'', t1:'', t2:'ˊ' }],
  ['旋', 'ㄒㄩㄢˊ', { neutral:'', g0:'ㄒ', g1:'ㄩ', g2:'ㄢ', t0:'', t1:'', t2:'ˊ' }]
];

for (const [label, input, expected] of cases) {
  const slots = z.parseZhuyinSlots(input);
  assert.deepEqual(slots, expected, label);
  assert.equal(z.composeVerifiedZhuyin(slots), input, label + ' compose');
}

const cat = z.parseZhuyinSlots('ㄇㄠ');
assert.equal(
  z.validateSlotOccupancy(cat, { g0:true, g2:true }).ok,
  true,
  'correct blank preservation'
);
assert.equal(
  z.validateSlotOccupancy(cat, { g0:true, g1:true, g2:true }).ok,
  false,
  'extra ink in required blank must fail'
);

assert.equal(z.acceptNeutralGesture({strokeCount:1,pointCount:1,width:0,height:0,path:0}).state, 'pass');
assert.equal(z.acceptNeutralGesture({strokeCount:1,pointCount:20,width:80,height:10,path:140}).state, 'fail');

console.log(JSON.stringify({status:'PASS', caseCount:cases.length, regressions:4}));
