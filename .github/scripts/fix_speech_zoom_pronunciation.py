from pathlib import Path
import json

# 1) Correct the resolved textbook readings in the sentence that contains 起司…夾…吐司.
TARGET_READINGS = {'起': 'ㄑㄧˇ', '司': 'ㄙ', '夾': 'ㄐㄧㄚˊ'}
matched = []
changed = []
for path in sorted(Path('packs').glob('*.json')):
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        continue
    dirty = False
    for question in data.get('questions', []):
        text = str(question.get('readText', ''))
        if not ('起司' in text and '夾' in text and '吐司' in text):
            continue
        matched.append((str(path), text))
        for token in question.get('tokens', []):
            char = str(token.get('char', ''))
            if char in TARGET_READINGS and token.get('zhuyin') != TARGET_READINGS[char]:
                token['zhuyin'] = TARGET_READINGS[char]
                dirty = True
                changed.append((str(path), text, char, TARGET_READINGS[char]))
    if dirty:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

if not matched:
    raise SystemExit('No question containing 起司 + 夾 + 吐司 was found')

# 2) Add a portrait-only zoom control to the prompt card.
index = Path('index.html')
h = index.read_text(encoding='utf-8')
old_section = '<section class="card question-card"><div class="question-instruction">請先聽整句，再把空格中的字寫在下方。</div><div id="question-loading" class="question-loading hidden" role="status">載入中…</div><div id="question-text" class="question-text">準備中…</div></section>'
new_section = '<section class="card question-card"><button id="question-zoom-button" class="question-zoom-button" type="button" aria-label="放大句子" aria-pressed="false">＋</button><div class="question-instruction">請先聽整句，再把空格中的字寫在下方。</div><div id="question-loading" class="question-loading hidden" role="status">載入中…</div><div id="question-text" class="question-text">準備中…</div></section>'
if old_section in h:
    h = h.replace(old_section, new_section, 1)
elif 'id="question-zoom-button"' not in h:
    raise SystemExit('question-card HTML anchor not found')
index.write_text(h, encoding='utf-8')

# 3) Improve browser speech startup and prefer an actual zh-TW voice.
app = Path('assets/app.js')
s = app.read_text(encoding='utf-8')

s = s.replace('    autoNextTimer: null,\n', '    autoNextTimer: null,\n    speechTimer: null,\n    questionZoomed: false,\n', 1) if 'speechTimer: null' not in s else s

old_els = "    questionText: el('question-text'), questionLoading: el('question-loading'), writers: el('writers'), quizMessage: el('quiz-message'),\n"
new_els = "    questionText: el('question-text'), questionLoading: el('question-loading'), questionZoomButton: el('question-zoom-button'), writers: el('writers'), quizMessage: el('quiz-message'),\n"
if old_els in s:
    s = s.replace(old_els, new_els, 1)
elif 'questionZoomButton:' not in s:
    raise SystemExit('els questionText anchor not found')

old_speech = '''  function speakQuestion() {
    const question = state.currentQueue[state.currentIndex];
    if (!question || !question.readText || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(question.readText);
    utter.lang = 'zh-TW';
    utter.rate = 0.85;
    speechSynthesis.speak(utter);
  }
'''
new_speech = '''  function getTaiwanSpeechVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = speechSynthesis.getVoices ? speechSynthesis.getVoices() : [];
    return voices.find(voice => String(voice.lang || '').toLowerCase() === 'zh-tw')
      || voices.find(voice => /^zh[-_]/i.test(String(voice.lang || '')))
      || null;
  }

  function setQuestionZoomed(value) {
    state.questionZoomed = Boolean(value);
    els.quizView.classList.toggle('question-zoomed', state.questionZoomed);
    if (els.questionZoomButton) {
      els.questionZoomButton.textContent = state.questionZoomed ? '－' : '＋';
      els.questionZoomButton.setAttribute('aria-pressed', state.questionZoomed ? 'true' : 'false');
      els.questionZoomButton.setAttribute('aria-label', state.questionZoomed ? '還原句子大小' : '放大句子');
    }
  }

  function speakQuestion() {
    const question = state.currentQueue[state.currentIndex];
    if (!question || !question.readText || !('speechSynthesis' in window)) return;
    clearTimeout(state.speechTimer);
    try { speechSynthesis.cancel(); } catch { /* noop */ }
    const utter = new SpeechSynthesisUtterance(`，${question.readText}`);
    utter.lang = 'zh-TW';
    utter.rate = 0.85;
    const voice = getTaiwanSpeechVoice();
    if (voice) utter.voice = voice;
    state.speechTimer = setTimeout(() => {
      try {
        if (speechSynthesis.paused) speechSynthesis.resume();
        speechSynthesis.speak(utter);
      } catch (err) {
        console.warn('Speech synthesis failed', err);
      }
    }, 160);
  }
'''
if old_speech in s:
    s = s.replace(old_speech, new_speech, 1)
elif 'function getTaiwanSpeechVoice()' not in s:
    raise SystemExit('speakQuestion block not found')

show_anchor = "    els.progressLabel.textContent = `第 ${state.currentIndex + 1} / ${state.currentQueue.length} 題`;\n"
if show_anchor in s and 'setQuestionZoomed(false);\n    els.progressLabel.textContent' not in s:
    s = s.replace(show_anchor, '    setQuestionZoomed(false);\n' + show_anchor, 1)

home_anchor = "    clearTimeout(state.autoNextTimer);\n    try { speechSynthesis.cancel(); } catch { /* noop */ }\n"
if home_anchor in s:
    s = s.replace(home_anchor, "    clearTimeout(state.autoNextTimer);\n    clearTimeout(state.speechTimer);\n    try { speechSynthesis.cancel(); } catch { /* noop */ }\n", 1)

bind_anchor = "    els.audioButton.addEventListener('click', speakQuestion);\n"
if bind_anchor in s and "questionZoomButton.addEventListener" not in s:
    s = s.replace(bind_anchor, bind_anchor + "    if (els.questionZoomButton) els.questionZoomButton.addEventListener('click', () => setQuestionZoomed(!state.questionZoomed));\n", 1)

app.write_text(s, encoding='utf-8')

# 4) Portrait-only zoom styling. Normal desktop/landscape remains unchanged.
css = Path('assets/app.css')
c = css.read_text(encoding='utf-8')
base_anchor = '.question-card { position: relative; }\n'
base_add = '''.question-card { position: relative; }
.question-zoom-button { display: none; }
'''
if '.question-zoom-button { display: none; }' not in c:
    if base_anchor not in c:
        raise SystemExit('question-card CSS anchor not found')
    c = c.replace(base_anchor, base_add, 1)

portrait_anchor = '''  #quiz-view .question-card {
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
'''
portrait_add = portrait_anchor + '''
  #quiz-view .question-zoom-button {
    display: grid;
    place-items: center;
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 3;
    width: 26px;
    height: 26px;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: rgba(237, 243, 255, .96);
    color: #416ab8;
    font-size: 1.05rem;
    font-weight: 900;
    line-height: 1;
  }

  #quiz-view.question-zoomed .question-card {
    width: 132px;
    overflow: visible;
    box-shadow: 0 10px 30px rgba(32, 45, 72, .20);
  }

  #quiz-view.question-zoomed .question-text {
    font-size: clamp(1.7rem, 8vw, 2rem);
    line-height: 1.7;
    max-height: calc(100svh - 175px);
  }
'''
if '#quiz-view.question-zoomed .question-card' not in c:
    if portrait_anchor not in c:
        raise SystemExit('portrait question-card CSS anchor not found')
    c = c.replace(portrait_anchor, portrait_add, 1)
css.write_text(c, encoding='utf-8')

print('matched questions:')
for item in matched:
    print('  ', item)
print('changed readings:')
for item in changed:
    print('  ', item)
