(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HanziZhuyinLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SLOT_KEYS = ['neutral', 'g0', 'g1', 'g2', 't0', 't1', 't2'];
  const TONE_MARKS = new Set(['ˊ', 'ˇ', 'ˋ', '˙']);

  function emptySlots() {
    return { neutral: '', g0: '', g1: '', g2: '', t0: '', t1: '', t2: '' };
  }

  function parseZhuyinSlots(zhuyin) {
    const raw = String(zhuyin || '').trim();
    if (!raw) throw new Error('zhuyin is required');
    const chars = [...raw];
    const tone = chars.find(ch => TONE_MARKS.has(ch)) || '';
    const main = chars.filter(ch => !TONE_MARKS.has(ch));
    if (main.length < 1 || main.length > 3) {
      throw new Error('written zhuyin must contain 1..3 main symbols');
    }
    const out = emptySlots();
    if (main.length === 1) out.g1 = main[0];
    if (main.length === 2) { out.g0 = main[0]; out.g2 = main[1]; }
    if (main.length === 3) { out.g0 = main[0]; out.g1 = main[1]; out.g2 = main[2]; }

    if (tone === '˙') {
      out.neutral = '˙';
    } else if (tone && ['ˊ', 'ˇ', 'ˋ'].includes(tone)) {
      if (main.length === 1) out.t1 = tone;
      else out.t2 = tone;
    }
    return out;
  }

  function composeVerifiedZhuyin(slots) {
    const s = Object.assign(emptySlots(), slots || {});
    const main = String(s.g0 || '') + String(s.g1 || '') + String(s.g2 || '');
    const regularTone = [s.t0, s.t1, s.t2].find(Boolean) || '';
    return main + (s.neutral || regularTone || '');
  }

  function validateSlotOccupancy(expectedSlots, observedInk) {
    const errors = [];
    for (const key of SLOT_KEYS) {
      const expected = Boolean(expectedSlots && expectedSlots[key]);
      const actual = Boolean(observedInk && observedInk[key]);
      if (expected && !actual) errors.push({ slot: key, kind: 'missing_symbol' });
      if (!expected && actual) errors.push({ slot: key, kind: 'extra_ink' });
    }
    return { ok: errors.length === 0, errors };
  }

  function acceptNeutralGesture(stats) {
    if (!stats) return { state: 'fail', reason: 'empty' };
    const strokeCount = Number(stats.strokeCount || 0);
    const pointCount = Number(stats.pointCount || 0);
    const width = Number(stats.width || 0);
    const height = Number(stats.height || 0);
    const path = Number(stats.path || 0);

    if (strokeCount === 1 && pointCount <= 3 && path <= 12) {
      return { state: 'pass', reason: 'short_tap' };
    }
    if (strokeCount <= 2 && width <= 22 && height <= 22 && path <= 70) {
      return { state: 'pass', reason: 'small_dot' };
    }
    if (width <= 30 && height <= 30 && path <= 110) {
      return { state: 'uncertain', reason: 'large_dot' };
    }
    return { state: 'fail', reason: 'not_dot_like' };
  }

  return {
    SLOT_KEYS,
    parseZhuyinSlots,
    composeVerifiedZhuyin,
    validateSlotOccupancy,
    acceptNeutralGesture
  };
});
