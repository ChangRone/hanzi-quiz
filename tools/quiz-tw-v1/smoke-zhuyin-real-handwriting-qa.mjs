import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const qa=require('../../assets/zhuyin-real-handwriting-qa.js');

const empty=qa.summarize([]);
assert.equal(empty.status,'INSUFFICIENT_EVIDENCE');
assert.equal(empty.metrics.correctRecognitionRate,null);
assert.equal(empty.readingsMissing.length,9);
const labels=[
  ...Array.from({length:27},(_,i)=>({human:'correct',actual:'pass',inputMode:'finger',zhuyin:qa.REQUIRED_READINGS[i%9]})),
  ...Array.from({length:27},(_,i)=>({human:'incorrect',actual:'fail',inputMode:'stylus',zhuyin:qa.REQUIRED_READINGS[i%9]})),
  ...Array.from({length:9},(_,i)=>({human:'position',actual:'position_only',inputMode:'finger',zhuyin:qa.REQUIRED_READINGS[i]}))
];
for(let i=0;i<3;i++)labels[i]={...labels[i],zhuyin:'ㄕㄨ˙',neutralSingleTap:true,neutralDotDetected:true};
const synthetic=qa.summarize(labels);
assert.equal(synthetic.status,'ACCEPTED_ON_SUBMITTED_SAMPLES','synthetic ideal corpus tests only report logic');
assert.equal(synthetic.metrics.correctRecognitionRate,1);
assert.equal(synthetic.metrics.incorrectFalsePassRate,0);
assert.equal(synthetic.metrics.placementSeparatedRate,1);
assert.equal(synthetic.neutralDotSamples,3);
assert.equal(synthetic.readingsCovered.length,9);

const wrongPass=qa.summarize(labels.map((x,i)=>i===27?{...x,actual:'pass'}:x));
assert.equal(wrongPass.status,'NOT_ACCEPTED');
assert(wrongPass.problems.includes('incorrect_pronunciation_false_pass'));
const wrongSlot=qa.summarize(labels.map((x,i)=>i===54?{...x,actual:'pass'}:x));
assert.equal(wrongSlot.status,'NOT_ACCEPTED');
assert(wrongSlot.problems.includes('placement_mistaken_as_full_pass'));
const mouse=qa.summarize(labels.map(x=>({...x,inputMode:'mouse'})));
assert.equal(mouse.status,'INSUFFICIENT_EVIDENCE','mouse-only data cannot be called real-touch evidence');
const ambiguous=qa.summarize([{human:'correct',actual:'guessed',inputMode:'finger'}]);
assert.equal(ambiguous.status,'INSUFFICIENT_EVIDENCE');
assert.deepEqual(ambiguous.invalidRecordIndexes,[1]);
console.log('ZHUYIN_REAL_HANDWRITING_REPORT_LOGIC=PASS (synthetic labels only, NOT real handwriting accuracy)');
