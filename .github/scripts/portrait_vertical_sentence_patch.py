from pathlib import Path

css = Path('assets/app.css')
s = css.read_text(encoding='utf-8')
marker = '/* portrait-mobile-quiz-prototype'
pos = s.find(marker)
if pos < 0:
    raise SystemExit('portrait prototype marker not found')

block = '''/* portrait-mobile-quiz-prototype
   Portrait phone layout: vertical sentence on the left, writing boxes in the
   middle, and a dedicated touch-scroll gutter on the right. Quiz/scoring logic
   is intentionally unchanged. */
@media (max-width: 640px) and (orientation: portrait) {
  #quiz-view {
    --portrait-prompt-width: 68px;
    --portrait-scroll-gutter: 34px;
    display: grid;
    grid-template-columns: var(--portrait-prompt-width) minmax(0, 1fr) var(--portrait-scroll-gutter);
    column-gap: 6px;
    align-items: start;
  }

  #quiz-view .quiz-header {
    grid-column: 1 / 3;
    position: relative;
    top: auto;
    z-index: 1;
    margin-bottom: 8px;
  }

  #quiz-view .question-card {
    grid-column: 1;
    position: sticky;
    top: 6px;
    z-index: 16;
    align-self: start;
    width: var(--portrait-prompt-width);
    margin: 0;
    padding: 9px 6px;
    border-radius: 15px;
    box-shadow: 0 7px 20px rgba(32, 45, 72, 0.10);
    overflow: hidden;
  }

  #quiz-view .question-instruction {
    display: none;
  }

  #quiz-view .question-text {
    writing-mode: vertical-rl;
    text-orientation: upright;
    min-height: 0;
    max-height: calc(100svh - 205px);
    margin: 0 auto;
    font-size: clamp(1.15rem, 5.6vw, 1.45rem);
    font-weight: 900;
    line-height: 1.55;
    overflow: hidden;
  }

  #quiz-view .question-text ruby {
    margin: 2px 0;
  }

  #quiz-view .question-text rt {
    font-size: .36em;
  }

  #quiz-view .question-text .blank-char {
    display: inline-block;
    min-width: 0;
    min-height: 0;
    inline-size: 1.08em;
    block-size: 1em;
    border-bottom: 0;
    border-right: 3px solid #727d90;
    margin: 3px 0;
  }

  #quiz-view .question-loading {
    writing-mode: horizontal-tb;
    top: 4px;
    left: 4px;
    right: 4px;
    padding: 4px 3px;
    font-size: .66rem;
    text-align: center;
  }

  #quiz-view .writers-wrap {
    grid-column: 2;
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
    justify-content: flex-start;
    gap: 10px;
    min-width: 0;
    padding: 0;
  }

  #quiz-view .writer-card {
    width: 100%;
    max-width: none;
    align-self: stretch;
    padding: 8px;
    border-radius: 16px;
  }

  #quiz-view .writer-label {
    margin-bottom: 5px;
    font-size: .88rem;
  }

  #quiz-view .writer-box {
    width: 100%;
    max-width: 286px;
    margin: 0 auto;
  }

  #quiz-view .quiz-message,
  #quiz-view .quiz-spacer {
    grid-column: 1 / 3;
  }

  #quiz-view .quiz-message {
    margin-top: 10px;
    margin-bottom: 8px;
    font-size: .82rem;
  }

  #quiz-view .quiz-dock {
    left: 9px;
    right: calc(9px + var(--portrait-scroll-gutter));
    width: auto;
    transform: none;
    bottom: max(8px, env(safe-area-inset-bottom));
  }

  .dock-button:disabled {
    opacity: .42;
    cursor: default;
  }
}
'''

css.write_text(s[:pos].rstrip() + '\n\n' + block, encoding='utf-8')
