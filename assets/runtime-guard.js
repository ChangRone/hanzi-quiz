(() => {
  'use strict';

  const failedByWriterId = new Map();
  const activeWriters = new Map();
  const nativeFetch = window.fetch.bind(window);

  // Keep the approved MOE 6063 dataset as the default, but preserve the
  // established Hanzi Writer official-data fallback for missing characters.
  window.fetch = async function guardedFetch(input, init) {
    const response = await nativeFetch(input, init);
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (response.ok || !/char-data\/moe-6063-v1\/([0-9a-fA-F]+)\.json(?:$|[?#])/.test(url)) return response;
    try {
      const match = url.match(/char-data\/moe-6063-v1\/([0-9a-fA-F]+)\.json(?:$|[?#])/);
      const char = String.fromCodePoint(parseInt(match[1], 16));
      const data = await HanziWriter.loadCharacterData(char);
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Hanzi-Source': 'hanzi-writer-fallback' }
      });
    } catch {
      return response;
    }
  };

  const originalCreate = HanziWriter.create.bind(HanziWriter);
  HanziWriter.create = function guardedCreate(target, char, options) {
    const writerId = typeof target === 'string' ? target : (target && target.id) || `writer-${Date.now()}`;
    const previous = activeWriters.get(writerId);
    if (previous) {
      try { previous.cancelQuiz(); } catch { /* noop */ }
    }

    const writer = originalCreate(target, char, options);
    const originalQuiz = writer.quiz.bind(writer);
    writer.quiz = function guardedQuiz(quizOptions = {}) {
      const userMistake = quizOptions.onMistake;
      const userComplete = quizOptions.onComplete;
      return originalQuiz({
        ...quizOptions,
        onMistake(data) {
          failedByWriterId.set(writerId, true);
          if (typeof userMistake === 'function') userMistake(data);
        },
        onComplete(summary = {}) {
          const guardedSummary = failedByWriterId.get(writerId)
            ? { ...summary, totalMistakes: Math.max(1, Number(summary.totalMistakes) || 0) }
            : summary;
          failedByWriterId.delete(writerId);
          if (typeof userComplete === 'function') userComplete(guardedSummary);
        }
      });
    };
    activeWriters.set(writerId, writer);
    return writer;
  };

  function clearAbandonedAttempt() {
    activeWriters.forEach(writer => {
      try { writer.cancelQuiz(); } catch { /* noop */ }
    });
    activeWriters.clear();
    failedByWriterId.clear();
  }

  // These actions intentionally abandon/change the current question scope.
  // Reset is excluded so an earlier mistake remains a fail after rewriting.
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('back-home')?.addEventListener('click', clearAbandonedAttempt);
    document.getElementById('quiz-lesson-focus')?.addEventListener('change', clearAbandonedAttempt);
    document.getElementById('next-button')?.addEventListener('click', clearAbandonedAttempt);
  });
})();
