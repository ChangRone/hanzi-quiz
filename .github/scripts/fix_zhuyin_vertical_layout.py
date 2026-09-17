from pathlib import Path
import json

TARGET_TEXT = '蝴蝶忙著採花蜜'
TARGET_CHAR = '著'
TARGET_ZHUYIN = 'ㄓㄜ˙'

# 1) Correct the source quiz data wherever this exact sentence appears.
matched_questions = 0
changed_tokens = 0
matched_files = []
for path in sorted(Path('packs').glob('*.json')):
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        continue
    changed = False
    for question in data.get('questions', []):
        if str(question.get('readText', '')) != TARGET_TEXT:
            continue
        matched_questions += 1
        for token in question.get('tokens', []):
            if str(token.get('char', '')) == TARGET_CHAR:
                if token.get('zhuyin') != TARGET_ZHUYIN:
                    token['zhuyin'] = TARGET_ZHUYIN
                    changed_tokens += 1
                    changed = True
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        matched_files.append(str(path))

if matched_questions == 0:
    raise SystemExit(f'Exact sentence not found: {TARGET_TEXT}')

# 2) Keep tokens[].zhuyin unchanged as the data interface, but split the final
#    tone mark into a separate span at render time so vertical layout can place
#    it beside the final Bopomofo symbol instead of consuming another row.
app = Path('assets/app.js')
s = app.read_text(encoding='utf-8')
old = '''  function renderQuestionText(question) {
    return question.tokens.map(token => {
      const isKnownLessonVocab = token.type !== 'blank' && token.lessonVocab;
      const base = token.type === 'blank'
        ? '<span class="blank-char">　</span>'
        : `<span class="${isKnownLessonVocab ? 'known-lesson-vocab' : ''}">${escapeHtml(token.char)}</span>`;
      return token.zhuyin ? `<ruby>${base}<rt>${escapeHtml(token.zhuyin)}</rt></ruby>` : base;
    }).join('');
  }
'''
new = '''  function renderZhuyin(zhuyin) {
    const reading = String(zhuyin || '');
    const toneMatch = reading.match(/([ˊˇˋ˙])$/u);
    const tone = toneMatch ? toneMatch[1] : '';
    const symbols = tone ? reading.slice(0, -1) : reading;
    const neutralClass = tone === '˙' ? ' zhuyin-tone-neutral' : '';
    return `<span class="zhuyin-reading"><span class="zhuyin-symbols">${escapeHtml(symbols)}</span>${tone ? `<span class="zhuyin-tone${neutralClass}">${escapeHtml(tone)}</span>` : ''}</span>`;
  }

  function renderQuestionText(question) {
    return question.tokens.map(token => {
      const isKnownLessonVocab = token.type !== 'blank' && token.lessonVocab;
      const base = token.type === 'blank'
        ? '<span class="blank-char">　</span>'
        : `<span class="${isKnownLessonVocab ? 'known-lesson-vocab' : ''}">${escapeHtml(token.char)}</span>`;
      return token.zhuyin ? `<ruby>${base}<rt>${renderZhuyin(token.zhuyin)}</rt></ruby>` : base;
    }).join('');
  }
'''
if old in s:
    s = s.replace(old, new, 1)
elif 'function renderZhuyin(zhuyin)' not in s:
    raise SystemExit('renderQuestionText block not found')
app.write_text(s, encoding='utf-8')

# 3) Add presentation rules. Horizontal display stays visually identical.
#    Portrait mode stacks Bopomofo vertically and absolutely positions tone
#    marks beside the last symbol. Neutral tone is placed near the top.
css = Path('assets/app.css')
c = css.read_text(encoding='utf-8')
base_anchor = '''rt { font-size: .39em; color: var(--subtle); font-weight: 700; }
'''
base_rules = '''rt { font-size: .39em; color: var(--subtle); font-weight: 700; }
.zhuyin-reading, .zhuyin-symbols, .zhuyin-tone { display: inline; }
'''
if '.zhuyin-reading, .zhuyin-symbols, .zhuyin-tone' not in c:
    if base_anchor not in c:
        raise SystemExit('base rt CSS anchor not found')
    c = c.replace(base_anchor, base_rules, 1)

portrait_anchor = '''  #quiz-view .question-text rt {
    font-size: .36em;
  }
'''
portrait_rules = '''  #quiz-view .question-text rt {
    font-size: .36em;
    overflow: visible;
  }

  /* Textbook-style vertical Bopomofo: symbols consume the vertical positions,
     while the tone mark sits beside the final symbol rather than taking a row. */
  #quiz-view .question-text .zhuyin-reading {
    display: inline-block;
    position: relative;
    writing-mode: vertical-rl;
    text-orientation: upright;
    line-height: 1;
    overflow: visible;
  }

  #quiz-view .question-text .zhuyin-symbols {
    display: inline;
    writing-mode: vertical-rl;
    text-orientation: upright;
  }

  #quiz-view .question-text .zhuyin-tone {
    display: block;
    position: absolute;
    right: -0.62em;
    bottom: 0.05em;
    writing-mode: horizontal-tb;
    text-orientation: mixed;
    line-height: 1;
    font-size: .82em;
  }

  #quiz-view .question-text .zhuyin-tone-neutral {
    top: -0.08em;
    right: -0.52em;
    bottom: auto;
    font-size: .78em;
  }
'''
if 'Textbook-style vertical Bopomofo' not in c:
    if portrait_anchor not in c:
        raise SystemExit('portrait rt CSS anchor not found')
    c = c.replace(portrait_anchor, portrait_rules, 1)
css.write_text(c, encoding='utf-8')

print(f'matched_questions={matched_questions}')
print(f'changed_tokens={changed_tokens}')
print('matched_files=' + ','.join(matched_files))
