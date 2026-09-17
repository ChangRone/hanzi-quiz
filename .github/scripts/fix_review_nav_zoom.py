from pathlib import Path

app_path = Path('assets/app.js')
css_path = Path('assets/app.css')
app = app_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')

old = "    questionZoomed: false,\n    catalogLoaded: false,"
new = "    questionZoomed: false,\n    navigating: false,\n    catalogLoaded: false,"
if old in app:
    app = app.replace(old, new, 1)

marker = "    const stateMap = await getSkillStates(candidates.map(item => item.key));\n    const now = Date.now();"
review_branch = '''    const stateMap = await getSkillStates(candidates.map(item => item.key));

    // Total review is lesson/question-complete practice, not unique-character scheduling.
    // Keep every selected question and every original blank. Learned history must not
    // turn later occurrences blue or remove whole questions from the review queue.
    if (state.practiceMode === 'review') {
      const queue = [];
      const reviewKeys = new Set();
      for (const lesson of lessons) {
        for (const question of lesson.questions) {
          const skill = skillOfQuestion(question);
          const tokens = question.tokens.map(token => ({ ...token }));
          tokens.filter(token => token.type === 'blank').forEach(token => reviewKeys.add(stateKey(token.char, skill)));
          if (!tokens.some(token => token.type === 'blank')) continue;
          queue.push({ ...question, tokens, lesson, courseKey: lesson.key, skill });
        }
      }
      shuffle(queue);
      return {
        queue,
        charCount: reviewKeys.size,
        newCount: candidates.filter(item => !stateMap.has(item.key)).length
      };
    }

    const now = Date.now();'''
if marker in app:
    app = app.replace(marker, review_branch, 1)

old_eligible = '''    const eligibleKeys = new Set(candidates.filter(item => {
      if (state.practiceMode === 'review') return true;
      const skillState = stateMap.get(item.key);
      return !skillState || !skillState.dueAt || new Date(skillState.dueAt).getTime() <= now;
    }).map(item => item.key));'''
new_eligible = '''    const eligibleKeys = new Set(candidates.filter(item => {
      const skillState = stateMap.get(item.key);
      return !skillState || !skillState.dueAt || new Date(skillState.dueAt).getTime() <= now;
    }).map(item => item.key));'''
if old_eligible in app:
    app = app.replace(old_eligible, new_eligible, 1)

old_next = '''  async function goNextQuestion() {
    clearTimeout(state.autoNextTimer);
    await recordIncompleteAsFail();
    if (state.currentIndex >= state.currentQueue.length - 1) {
      await finishPractice();
      return;
    }
    state.currentIndex += 1;
    await showQuestion();
  }'''
new_next = '''  async function goNextQuestion() {
    if (state.navigating) return;
    state.navigating = true;
    clearTimeout(state.autoNextTimer);
    els.nextButton.disabled = true;
    try {
      await recordIncompleteAsFail();
      if (state.currentIndex >= state.currentQueue.length - 1) {
        await finishPractice();
        return;
      }
      state.currentIndex += 1;
      await showQuestion();
    } finally {
      state.navigating = false;
      els.nextButton.disabled = false;
    }
  }'''
if old_next in app:
    app = app.replace(old_next, new_next, 1)

old_start = '''    state.currentQueue = result.queue;
    state.currentIndex = 0;
    els.quizModeLabel.textContent'''
new_start = '''    state.currentQueue = result.queue;
    state.currentIndex = 0;
    state.navigating = false;
    els.nextButton.disabled = false;
    els.quizModeLabel.textContent'''
if old_start in app:
    app = app.replace(old_start, new_start, 1)

old_css = "  #quiz-view.question-zoomed .question-card {\n    width: 132px;"
new_css = "  #quiz-view.question-zoomed .question-card {\n    width: min(200px, calc(100vw - var(--portrait-scroll-gutter) - 18px));"
if old_css in css:
    css = css.replace(old_css, new_css, 1)

assert "Total review is lesson/question-complete practice" in app
assert "if (state.navigating) return;" in app
assert "state.navigating = false;" in app
assert "width: min(200px, calc(100vw - var(--portrait-scroll-gutter) - 18px));" in css

app_path.write_text(app, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')
