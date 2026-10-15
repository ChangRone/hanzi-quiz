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
// Synthetic evidence tests summary maths only; it is NOT human handwriting.
for (const row of labels) {
  row.verifiedRealTouch = true;
  row.trustedTouchStarts = 2;
  row.trustedPointerTypes = [row.inputMode === 'finger' ? 'touch' : 'pen'];
}
for (const i of [4,13,22]) {
  labels[i].neutralSingleTap = true;
  labels[i].neutralDotDetected = true;
}
const synthetic=qa.summarize(labels);
assert.equal(synthetic.status,'ACCEPTED_ON_SUBMITTED_SAMPLES','synthetic ideal corpus tests only report logic');
assert.equal(synthetic.metrics.correctRecognitionRate,1);
assert.equal(synthetic.metrics.incorrectFalsePassRate,0);
assert.equal(synthetic.metrics.placementSeparatedRate,1);
assert.equal(synthetic.neutralDotSamples,3);
assert.equal(synthetic.readingsCovered.length,9);

const fakeTouch=qa.summarize(labels.map(x=>({...x,verifiedRealTouch:false, trustedTouchStarts:0, trustedPointerTypes:[]})));
assert.equal(fakeTouch.status,'INSUFFICIENT_EVIDENCE','manually selecting touch without trusted events is not evidence');
const unbalanced=qa.summarize(labels.map((row,i)=>i===0?{...row,zhuyin:'ㄕㄨ˙'}:row));
assert.equal(unbalanced.status,'INSUFFICIENT_EVIDENCE','total counts alone cannot hide insufficient samples of one reading');
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
