(() => {
  'use strict';

  if (!window.HanziWriter || typeof window.HanziWriter.create !== 'function') return;

  const originalCreate = window.HanziWriter.create.bind(window.HanziWriter);

  window.HanziWriter.create = function(target, character, options = {}) {
    const targetId = typeof target === 'string' ? target : (target && target.id) || '';
    const isPracticeBox = String(targetId).startsWith('writer-');
    const nextOptions = isPracticeBox
      ? { ...options, showCharacter: false, showOutline: false }
      : options;

    const writer = originalCreate(target, character, nextOptions);
    if (!isPracticeBox) return writer;

    if (typeof writer.hideCharacter === 'function') {
      try { writer.hideCharacter({ duration: 0 }); } catch { /* noop */ }
    }
    if (typeof writer.hideOutline === 'function') {
      try { writer.hideOutline({ duration: 0 }); } catch { /* noop */ }
    }

    if (typeof writer.animateCharacter === 'function') {
      const originalAnimateCharacter = writer.animateCharacter.bind(writer);
      writer.animateCharacter = function(animationOptions = {}) {
        const userOnComplete = animationOptions && animationOptions.onComplete;
        return originalAnimateCharacter({
          ...animationOptions,
          onComplete: () => {
            const resume = () => {
              if (typeof writer.hideOutline === 'function') {
                try { writer.hideOutline({ duration: 0 }); } catch { /* noop */ }
              }
              if (typeof userOnComplete === 'function') userOnComplete();
            };
            if (typeof writer.hideCharacter === 'function') {
              try {
                writer.hideCharacter({ duration: 0, onComplete: resume });
                return;
              } catch { /* fall through */ }
            }
            resume();
          }
        });
      };
    }

    return writer;
  };
})();
