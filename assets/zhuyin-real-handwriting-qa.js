(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HanziRealHandwritingQA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LABELS = ['correct', 'position', 'incorrect'];
  const RESULTS = ['pass', 'position_only', 'fail', 'uncertain'];
  const REQUIRED_READINGS = ['ㄇㄠ', 'ㄒㄧㄤˋ', 'ㄧ', 'ㄕㄨˊ', 'ㄕㄨ˙', 'ㄩˇ', 'ㄩㄢˊ', 'ㄒㄩˊ', 'ㄒㄩㄢˊ'];

  function summarize(input) {
    const records = Array.isArray(input) ? input : (input && input.results) || [];
    const matrix = Object.fromEntries(LABELS.map(expected =>
      [expected, Object.fromEntries(RESULTS.map(actual => [actual, 0]))]));
    const count = Object.fromEntries(LABELS.map(v => [v, 0]));
    const bad = [];
    let touchSamples = 0, neutralDotSamples = 0, missingNeutralDot = 0;
    const readings = new Set();
    const perReading = Object.fromEntries(REQUIRED_READINGS.map(r =>
      [r, { correct: 0, position: 0, incorrect: 0 }]));

    records.forEach((record, i) => {
      if (!record || !LABELS.includes(record.human) || !RESULTS.includes(record.actual)) {
        bad.push(i + 1); return;
      }
      matrix[record.human][record.actual]++;
      count[record.human]++;
      // A selected input-type dropdown is not proof of touch. Only genuine
      // browser PointerEvents (isTrusted) from the claimed touch/pen input
      // count toward the real-handwriting acceptance gate.
      const evidence = Array.isArray(record.trustedPointerTypes)
        ? record.trustedPointerTypes : [];
      const expectedType = record.inputMode === 'finger' ? 'touch'
        : record.inputMode === 'stylus' ? 'pen' : '';
      const verifiedTouch = record.verifiedRealTouch === true &&
        Number(record.trustedTouchStarts) >= 1 &&
        Boolean(expectedType) && evidence.includes(expectedType) &&
        !evidence.includes('mouse');
      if (verifiedTouch) {
        touchSamples++;
        if (record.human === 'correct' && record.zhuyin) readings.add(record.zhuyin);
        if (perReading[record.zhuyin]) perReading[record.zhuyin][record.human]++;
      }
      if (verifiedTouch && record.zhuyin === 'ㄕㄨ˙' &&
          record.neutralSingleTap === true) {
        neutralDotSamples++;
        if (record.neutralDotDetected !== true) missingNeutralDot++;
      }
    });

    const correctDenom = count.correct;
    const incorrectDenom = count.incorrect;
    const positionDenom = count.position;
    const ratio = (n, d) => d ? n / d : null;
    const metrics = {
      correctRecognitionRate: ratio(matrix.correct.pass, correctDenom),
      incorrectFalsePassRate: ratio(matrix.incorrect.pass, incorrectDenom),
      placementFalsePassRate: ratio(matrix.position.pass, positionDenom),
      placementSeparatedRate: ratio(matrix.position.position_only, positionDenom),
      correctUncertainRate: ratio(matrix.correct.uncertain, correctDenom),
      neutralTapDetectedRate: ratio(neutralDotSamples-missingNeutralDot, neutralDotSamples)
    };

    // These thresholds are project acceptance criteria, NOT a claim that
    // a government standard certifies the classifier.
    const min = { correct: 27, incorrect: 27, position: 9, neutralTap: 3 };
    const sufficient = count.correct >= min.correct && count.incorrect >= min.incorrect &&
      count.position >= min.position &&
      neutralDotSamples >= min.neutralTap && touchSamples >= count.correct + count.incorrect + count.position &&
      REQUIRED_READINGS.every(x =>
        perReading[x].correct >= 3 &&
        perReading[x].incorrect >= 3 &&
        perReading[x].position >= 1);

    const problems = [];
    if (bad.length) problems.push('invalid_records');
    if (!sufficient) problems.push('insufficient_real_touch_samples');
    if (sufficient) {
      if (metrics.correctRecognitionRate < 0.90) problems.push('correct_recognition_below_90_percent');
      if (metrics.incorrectFalsePassRate !== 0) problems.push('incorrect_pronunciation_false_pass');
      if (metrics.placementFalsePassRate !== 0) problems.push('placement_mistaken_as_full_pass');
      if (metrics.placementSeparatedRate < 0.70) problems.push('placement_separation_below_70_percent');
      if (metrics.neutralTapDetectedRate !== 1) problems.push('neutral_tap_not_always_detected');
    }

    return {
      status: bad.length || !sufficient ? 'INSUFFICIENT_EVIDENCE' :
        problems.length ? 'NOT_ACCEPTED' : 'ACCEPTED_ON_SUBMITTED_SAMPLES',
      count, sampleCount: records.length, acceptedSamples: count.correct+count.incorrect+count.position,
      invalidRecordIndexes: bad, realTouchSamples: touchSamples,
      readingsCovered: REQUIRED_READINGS.filter(x => readings.has(x)),
      readingsMissing: REQUIRED_READINGS.filter(x => !readings.has(x)),
      perReading,
      neutralDotSamples, neutralDotMisses: missingNeutralDot, matrix, metrics,
      requirements: min, problems,
      warning: '僅統計所提供的真實手寫樣本；不能取代未參與測試的學生及裝置驗證。'
    };
  }
  return { summarize, LABELS, RESULTS, REQUIRED_READINGS };
});
