(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HanziReviewEventV2 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeEvent(input) {
    if (!input || typeof input !== 'object' || !input.id) throw new Error('Review event has no stable id');
    const event = { ...input };
    if (!event.eventType) {
      if (event.result !== 'pass' && event.result !== 'fail') {
        throw new Error('Legacy event cannot be classified safely: ' + event.id);
      }
      event.eventType = 'tested';
    }
    if (event.eventType !== 'tested' && event.eventType !== 'exposed') {
      throw new Error('Unknown review eventType: ' + event.eventType);
    }
    if (event.eventType === 'tested' && event.result !== 'pass' && event.result !== 'fail') {
      throw new Error('Tested event requires pass/fail: ' + event.id);
    }
    // Exposure is only proof that text was visible. Never treat it as test success.
    if (event.eventType === 'exposed') event.result = null;
    return event;
  }

  function countsForMastery(event) {
    return normalizeEvent(event).eventType === 'tested';
  }

  return { normalizeEvent, countsForMastery };
});
