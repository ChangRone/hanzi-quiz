(() => {
  'use strict';

  const APP_VERSION = 'learning-loop-v1';
  const DB_NAME = 'hanzi-quiz-learning-db';
  const DB_VERSION = 1;
  const REVIEW_INTERVALS_DAYS = [1, 3, 10, 30, 90];
  const REVIEW_SPEED_MULTIPLIER = { dense: 0.7, normal: 1, relaxed: 1.5 };
  const REVIEW_SPEED_LABEL = { dense: '密集', normal: '標準', relaxed: '寬鬆' };
  const PUBLISHERS = { '0': '南一', '1': '翰林', '2': '康軒' };
  const SEMESTERS = { '0': '上學期', '1': '下學期' };
  const APPROVED_DATASET_PATH = 'char-data/moe-6063-v1/{hex}.json';
  const DEFAULT_DEV = {
    leniency: 1.4,
    drawingWidth: 18,
    highlightOnComplete: true,
    markStrokeCorrectAfterMisses: 4,
    customCharDataTemplate: '',
    customCharDataFirst: false
  };

  const state = {
    db: null,
    lessons: [],
    selectedLessonKeys: new Set(),
    profileGrade: 1,
    practiceMode: 'normal',
    reviewSpeed: 'normal',
    allowBackwards: false,
    dev: { ...DEFAULT_DEV },
    currentQueue: [],
    currentIndex: 0,
    currentLessonFocus: '',
    writerStates: [],
    autoNextTimer: null,
    catalogLoaded: false,
    driveConfig: null,
    driveTokenClient: null,
    driveAccessToken: '',
    driveEnabled: false,
    prefsUpdatedAt: new Date(0).toISOString()
  };

  const el = id => document.getElementById(id);
  const els = {
    homeView: el('home-view'), quizView: el('quiz-view'),
    profileGrade: el('profile-grade'), syncStatusButton: el('sync-status-button'),
    materialSummaryTitle: el('material-summary-title'), materialSummary: el('material-summary'),
    openMaterials: el('open-materials'), materialsDialog: el('materials-dialog'),
    recommendedPath: el('recommended-path'), filterYear: el('filter-year'), filterPublisher: el('filter-publisher'),
    filterGrade: el('filter-grade'), filterSemester: el('filter-semester'), lessonList: el('lesson-list'),
    selectRecommended: el('select-recommended'), selectFiltered: el('select-filtered'), clearMaterials: el('clear-materials'), saveMaterials: el('save-materials'),
    openLearningSettings: el('open-learning-settings'), learningSettingsDialog: el('learning-settings-dialog'), saveLearningSettings: el('save-learning-settings'),
    reviewSpeedLabel: el('review-speed-label'), allowBackwards: el('allow-backwards'),
    practiceEstimate: el('practice-estimate'), practiceEstimateNote: el('practice-estimate-note'), startPractice: el('start-practice'), homeMessage: el('home-message'),
    backHome: el('back-home'), quizModeLabel: el('quiz-mode-label'), progressLabel: el('progress-label'), quizLessonFocus: el('quiz-lesson-focus'),
    questionText: el('question-text'), writers: el('writers'), quizMessage: el('quiz-message'),
    audioButton: el('audio-button'), resetButton: el('reset-button'), hintButton: el('hint-button'), nextButton: el('next-button'),
    dataDialog: el('data-dialog'), storageStatus: el('storage-status'), exportData: el('export-data'), importDataButton: el('import-data-button'), importDataFile: el('import-data-file'),
    driveStatus: el('drive-status'), driveConnect: el('drive-connect'), driveSync: el('drive-sync')
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function nowIso() { return new Date().toISOString(); }
  function dayMs(days) { return days * 24 * 60 * 60 * 1000; }
  function uuid() {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }

  function getAcademicYearRoc(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return month >= 8 ? year - 1911 : year - 1912;
  }

  function gregorianToRocYear(yearValue) {
    const n = Number(yearValue);
    if (!Number.isFinite(n)) return String(yearValue || '');
    return n > 1911 ? n - 1911 : n;
  }

  function gradeLabel(grade) { return `${Number(grade)}年級`; }
  function semesterShort(value) { return String(value) === '0' ? '上' : '下'; }
  function lessonLabel(code) { return `第 ${Number(code)} 課`; }
  function skillOfQuestion(question) { return String(question.practiceType || 'context_write'); }
  function stateKey(char, skill) { return `${char}|${skill}`; }
  function lessonKey(packId, lessonCode) { return `${packId}|${lessonCode}`; }

  function getPrefs() {
    try { return JSON.parse(localStorage.getItem('hanziQuizPrefsV1') || '{}'); } catch { return {}; }
  }

  function savePrefs(patch = {}) {
    const current = getPrefs();
    const next = { ...current, ...patch, updatedAt: nowIso(), version: 1 };
    localStorage.setItem('hanziQuizPrefsV1', JSON.stringify(next));
    state.prefsUpdatedAt = next.updatedAt;
    return next;
  }

  function loadPrefsIntoState() {
    const prefs = getPrefs();
    state.profileGrade = Math.min(6, Math.max(1, Number(prefs.profileGrade) || 1));
    state.practiceMode = ['normal', 'review'].includes(prefs.practiceMode) ? prefs.practiceMode : 'normal';
    state.reviewSpeed = REVIEW_SPEED_MULTIPLIER[prefs.reviewSpeed] ? prefs.reviewSpeed : 'normal';
    state.allowBackwards = Boolean(prefs.allowBackwards);
    state.selectedLessonKeys = new Set(Array.isArray(prefs.selectedLessonKeys) ? prefs.selectedLessonKeys : []);
    state.driveEnabled = Boolean(prefs.driveEnabled);
    state.prefsUpdatedAt = prefs.updatedAt || new Date(0).toISOString();
    try {
      state.dev = { ...DEFAULT_DEV, ...JSON.parse(localStorage.getItem('hanziQuizDevSettings') || '{}') };
    } catch {
      state.dev = { ...DEFAULT_DEV };
    }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('review_events')) {
          const store = db.createObjectStore('review_events', { keyPath: 'id' });
          store.createIndex('by_skill_key', 'skillKey', { unique: false });
          store.createIndex('by_time', 'reviewedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('skill_state')) {
          db.createObjectStore('skill_state', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 無法開啟'));
    });
  }

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB 操作失敗'));
    });
  }

  async function getAll(storeName) {
    const tx = state.db.transaction(storeName, 'readonly');
    return idbRequest(tx.objectStore(storeName).getAll());
  }

  async function getSkillState(char, skill) {
    const tx = state.db.transaction('skill_state', 'readonly');
    return idbRequest(tx.objectStore('skill_state').get(stateKey(char, skill)));
  }

  async function getSkillStates(keys) {
    if (!keys.length) return new Map();
    const tx = state.db.transaction('skill_state', 'readonly');
    const store = tx.objectStore('skill_state');
    const pairs = await Promise.all(keys.map(key => idbRequest(store.get(key)).then(value => [key, value])));
    return new Map(pairs.filter(([, value]) => value));
  }

  async function recordReview({ char, skill, courseKey, result, mode }) {
    const key = stateKey(char, skill);
    const existing = await getSkillState(char, skill);
    const multiplier = REVIEW_SPEED_MULTIPLIER[state.reviewSpeed] || 1;
    const pass = result === 'pass';
    const stage = pass ? Math.min((existing ? Number(existing.stage) : -1) + 1, REVIEW_INTERVALS_DAYS.length - 1) : 0;
    const baseDays = REVIEW_INTERVALS_DAYS[stage];
    const intervalDays = Math.max(1, Math.round(baseDays * multiplier));
    const reviewedAt = nowIso();
    const dueAt = new Date(Date.now() + dayMs(intervalDays)).toISOString();
    const event = {
      id: uuid(), appVersion: APP_VERSION, char, skill, skillKey: key, courseKey,
      reviewedAt, result, mode, allowBackwards: state.allowBackwards
    };
    const nextState = { key, char, skill, stage, dueAt, lastResult: result, lastReviewedAt: reviewedAt };
    const tx = state.db.transaction(['review_events', 'skill_state'], 'readwrite');
    tx.objectStore('review_events').put(event);
    tx.objectStore('skill_state').put(nextState);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('學習紀錄儲存失敗'));
      tx.onabort = () => reject(tx.error || new Error('學習紀錄儲存中止'));
    });
    return event;
  }

  async function rebuildSkillStateFromEvents() {
    const events = (await getAll('review_events')).sort((a, b) => String(a.reviewedAt).localeCompare(String(b.reviewedAt)));
    const map = new Map();
    for (const event of events) {
      const key = event.skillKey || stateKey(event.char, event.skill || 'context_write');
      const previous = map.get(key);
      const pass = event.result === 'pass';
      const stage = pass ? Math.min((previous ? previous.stage : -1) + 1, REVIEW_INTERVALS_DAYS.length - 1) : 0;
      const multiplier = REVIEW_SPEED_MULTIPLIER[state.reviewSpeed] || 1;
      const intervalDays = Math.max(1, Math.round(REVIEW_INTERVALS_DAYS[stage] * multiplier));
      map.set(key, {
        key, char: event.char, skill: event.skill || 'context_write', stage,
        dueAt: new Date(new Date(event.reviewedAt).getTime() + dayMs(intervalDays)).toISOString(),
        lastResult: event.result, lastReviewedAt: event.reviewedAt
      });
    }
    const tx = state.db.transaction('skill_state', 'readwrite');
    const store = tx.objectStore('skill_state');
    store.clear();
    map.forEach(item => store.put(item));
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }

  async function loadCatalog() {
    const response = await fetch('quiz-index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`題庫索引載入失敗 (${response.status})`);
    const catalog = await response.json();
    if (!Array.isArray(catalog)) throw new Error('題庫索引格式不正確');
    const lessons = [];
    for (const item of catalog) {
      const expanded = await loadCatalogItem(item);
      lessons.push(...expanded);
    }
    state.lessons = lessons.sort(compareLessonsNewestFirst);
    state.catalogLoaded = true;
    if (!state.selectedLessonKeys.size) {
      const recommended = getRecommendedLessons();
      const initial = recommended.length ? recommended : state.lessons;
      initial.forEach(lesson => state.selectedLessonKeys.add(lesson.key));
      savePrefs({ selectedLessonKeys: [...state.selectedLessonKeys] });
    } else {
      const available = new Set(state.lessons.map(item => item.key));
      state.selectedLessonKeys = new Set([...state.selectedLessonKeys].filter(key => available.has(key)));
      if (!state.selectedLessonKeys.size && state.lessons.length) {
        state.lessons.forEach(lesson => state.selectedLessonKeys.add(lesson.key));
        savePrefs({ selectedLessonKeys: [...state.selectedLessonKeys] });
      }
    }
  }

  async function loadCatalogItem(item) {
    const lessonRange = Array.isArray(item.lessonRange) ? item.lessonRange : [];
    if (item.lessonPattern && lessonRange.length === 2) {
      const start = Number(lessonRange[0]);
      const end = Number(lessonRange[1]);
      const tasks = [];
      for (let n = start; n <= end; n += 1) {
        const code = String(n).padStart(2, '0');
        const url = String(item.lessonPattern).replace('{LL}', code);
        tasks.push(fetchLessonFile(url, code));
      }
      const results = await Promise.allSettled(tasks);
      return results.filter(r => r.status === 'fulfilled').map(r => r.value);
    }
    if (item.dataUrl) {
      const response = await fetch(item.dataUrl, { cache: 'no-store' });
      if (!response.ok) return [];
      const pack = await response.json();
      const grouped = new Map();
      (pack.questions || []).forEach(q => {
        const code = getQuestionLessonCode(q);
        if (!grouped.has(code)) grouped.set(code, []);
        grouped.get(code).push(q);
      });
      return [...grouped.entries()].map(([code, questions]) => normalizeLesson(pack, code, questions));
    }
    return [];
  }

  async function fetchLessonFile(url, lessonCode) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`載入 ${url} 失敗`);
    const pack = await response.json();
    return normalizeLesson(pack, lessonCode, pack.questions || []);
  }

  function normalizeLesson(pack, lessonCode, questions) {
    const normalizedQuestions = questions.filter(validateQuestion).map(question => ({
      ...question,
      id: String(question.id),
      readText: String(question.readText || ''),
      tokens: question.tokens.map(token => ({ type: token.type, char: String(token.char), zhuyin: String(token.zhuyin || '') })),
      practiceType: String(question.practiceType || 'context_write')
    }));
    return {
      key: lessonKey(String(pack.id), lessonCode),
      packId: String(pack.id),
      packTitle: String(pack.title || ''),
      year: String(pack.year || ''),
      rocYear: gregorianToRocYear(pack.year),
      publisherCode: String(pack.publisherCode || ''),
      grade: String(pack.grade || ''),
      semester: String(pack.semester || ''),
      version: String(pack.version || '1.0.0'),
      lessonCode: String(lessonCode).padStart(2, '0'),
      questions: normalizedQuestions
    };
  }

  function validateQuestion(q) {
    return q && Array.isArray(q.tokens) && q.tokens.some(token => token && token.type === 'blank' && typeof token.char === 'string');
  }

  function getQuestionLessonCode(question) {
    const id = String(question && question.id || '');
    return /^\d{12}$/.test(id) ? id.slice(8, 10) : '00';
  }

  function compareLessonsNewestFirst(a, b) {
    return Number(b.rocYear) - Number(a.rocYear)
      || Number(b.grade) - Number(a.grade)
      || Number(b.semester) - Number(a.semester)
      || Number(b.lessonCode) - Number(a.lessonCode)
      || String(a.packId).localeCompare(String(b.packId));
  }

  function recommendedPairs() {
    const currentAy = getAcademicYearRoc();
    const rows = [];
    for (let grade = state.profileGrade; grade >= 1; grade -= 1) {
      rows.push({ rocYear: currentAy - (state.profileGrade - grade), grade });
    }
    return rows;
  }

  function isRecommendedLesson(lesson) {
    return recommendedPairs().some(pair => Number(lesson.rocYear) === pair.rocYear && Number(lesson.grade) === pair.grade);
  }

  function getRecommendedLessons() { return state.lessons.filter(isRecommendedLesson); }
  function selectedLessons() { return state.lessons.filter(item => state.selectedLessonKeys.has(item.key)).sort(compareLessonsNewestFirst); }

  function renderRecommendedPath() {
    els.recommendedPath.innerHTML = `<strong>依目前 ${gradeLabel(state.profileGrade)} 推薦：</strong><br>${recommendedPairs().map(pair => `${pair.rocYear} 學年度 ${gradeLabel(pair.grade)}`).join('　→　')}<br><span class="profile-note">推薦只幫你縮小範圍；仍可自由選其他年級、出版社與獨立課次。</span>`;
  }

  function fillSelect(select, values, labeler, allLabel = '全部') {
    const previous = select.value;
    select.innerHTML = `<option value="">${allLabel}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(labeler(value))}</option>`).join('');
    if (values.includes(previous)) select.value = previous;
  }

  function renderMaterialFilters() {
    fillSelect(els.filterYear, [...new Set(state.lessons.map(x => String(x.rocYear)))].sort((a, b) => Number(b) - Number(a)), value => `${value} 學年度`);
    fillSelect(els.filterPublisher, [...new Set(state.lessons.map(x => x.publisherCode))].sort(), value => PUBLISHERS[value] || value);
    fillSelect(els.filterGrade, [...new Set(state.lessons.map(x => x.grade))].sort(), value => gradeLabel(value));
    fillSelect(els.filterSemester, [...new Set(state.lessons.map(x => x.semester))].sort(), value => SEMESTERS[value] || value);
  }

  function filteredLessons() {
    return state.lessons.filter(lesson => {
      if (els.filterYear.value && String(lesson.rocYear) !== els.filterYear.value) return false;
      if (els.filterPublisher.value && lesson.publisherCode !== els.filterPublisher.value) return false;
      if (els.filterGrade.value && lesson.grade !== els.filterGrade.value) return false;
      if (els.filterSemester.value && lesson.semester !== els.filterSemester.value) return false;
      return true;
    });
  }

  function renderLessonList() {
    const list = filteredLessons();
    if (!list.length) {
      els.lessonList.innerHTML = '<div class="summary-box">目前篩選條件下沒有已匯入教材。</div>';
      return;
    }
    els.lessonList.innerHTML = list.map(lesson => {
      const checked = state.selectedLessonKeys.has(lesson.key) ? 'checked' : '';
      const recommended = isRecommendedLesson(lesson) ? '・推薦' : '';
      return `<label class="lesson-item"><input type="checkbox" data-lesson-key="${escapeHtml(lesson.key)}" ${checked}/><span><strong>${escapeHtml(PUBLISHERS[lesson.publisherCode] || lesson.publisherCode)}・${escapeHtml(lesson.rocYear)} ${gradeLabel(lesson.grade)}${semesterShort(lesson.semester)}・${lessonLabel(lesson.lessonCode)}</strong><small>${lesson.questions.length} 題${recommended}</small></span></label>`;
    }).join('');
  }

  function courseDisplay(lesson) {
    return `${PUBLISHERS[lesson.publisherCode] || lesson.publisherCode} ${lesson.rocYear} ${Number(lesson.grade)}${semesterShort(lesson.semester)} ${lessonLabel(lesson.lessonCode)}`;
  }

  function countUniqueChars(lessons) {
    const set = new Set();
    lessons.forEach(lesson => lesson.questions.forEach(q => q.tokens.forEach(token => { if (token.type === 'blank') set.add(token.char); })));
    return set.size;
  }

  function renderMaterialSummary() {
    const lessons = selectedLessons();
    els.materialSummaryTitle.textContent = lessons.length ? `${lessons.length} 課已加入` : '尚未選擇教材';
    if (!lessons.length) {
      els.materialSummary.textContent = '請加入至少一課教材。';
      return;
    }
    const groups = new Map();
    lessons.forEach(lesson => {
      const key = `${lesson.rocYear}|${lesson.grade}|${lesson.semester}|${lesson.publisherCode}`;
      if (!groups.has(key)) groups.set(key, { lesson, codes: [] });
      groups.get(key).codes.push(Number(lesson.lessonCode));
    });
    const rows = [...groups.values()].map(group => {
      group.codes.sort((a, b) => a - b);
      return `${PUBLISHERS[group.lesson.publisherCode] || group.lesson.publisherCode}・${group.lesson.rocYear} 學年度・${gradeLabel(group.lesson.grade)}${semesterShort(group.lesson.semester)}：第 ${group.codes.join('、')} 課`;
    });
    els.materialSummary.innerHTML = `${rows.map(row => escapeHtml(row)).join('<br>')}<br><strong>共 ${countUniqueChars(lessons)} 個生字</strong>`;
  }

  function collectCandidateCharacters(lessons) {
    const rows = [];
    const seen = new Set();
    lessons.forEach(lesson => {
      lesson.questions.forEach(question => {
        const skill = skillOfQuestion(question);
        question.tokens.forEach(token => {
          if (token.type !== 'blank') return;
          const key = stateKey(token.char, skill);
          if (seen.has(key)) return;
          seen.add(key);
          rows.push({ key, char: token.char, skill, lesson, question });
        });
      });
    });
    return rows;
  }

  async function buildQueue(lessonSubset = null) {
    const lessons = (lessonSubset || selectedLessons()).slice().sort(compareLessonsNewestFirst);
    const candidates = collectCandidateCharacters(lessons);
    const stateMap = await getSkillStates(candidates.map(item => item.key));
    const now = Date.now();
    const eligibleKeys = new Set(candidates.filter(item => {
      if (state.practiceMode === 'review') return true;
      const skillState = stateMap.get(item.key);
      return !skillState || !skillState.dueAt || new Date(skillState.dueAt).getTime() <= now;
    }).map(item => item.key));

    const used = new Set();
    const queue = [];
    for (const lesson of lessons) {
      for (const question of lesson.questions) {
        const skill = skillOfQuestion(question);
        const tokens = question.tokens.map(token => {
          if (token.type !== 'blank') return { ...token };
          const key = stateKey(token.char, skill);
          if (!eligibleKeys.has(key) || used.has(key)) return { ...token, type: 'text' };
          used.add(key);
          return { ...token, type: 'blank' };
        });
        if (!tokens.some(token => token.type === 'blank')) continue;
        queue.push({ ...question, tokens, lesson, courseKey: lesson.key, skill });
      }
    }
    if (state.practiceMode === 'review') shuffle(queue);
    return { queue, charCount: used.size, newCount: candidates.filter(item => eligibleKeys.has(item.key) && !stateMap.has(item.key)).length };
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  async function updatePracticeEstimate() {
    if (!state.catalogLoaded || !state.db) return;
    const lessons = selectedLessons();
    if (!lessons.length) {
      els.practiceEstimate.textContent = '0 字';
      els.practiceEstimateNote.textContent = '請先加入教材。';
      els.startPractice.disabled = true;
      return;
    }
    const result = await buildQueue();
    els.practiceEstimate.textContent = `${result.charCount} 字`;
    if (state.practiceMode === 'review') {
      els.practiceEstimateNote.textContent = '總複習：所選範圍全部納入並打亂。';
    } else if (result.charCount === 0) {
      els.practiceEstimateNote.textContent = '目前沒有新字或到期生字；可改用總複習。';
    } else {
      const reviewCount = Math.max(0, result.charCount - result.newCount);
      els.practiceEstimateNote.textContent = `新字 ${result.newCount}・到期複習 ${reviewCount}；由新到舊。`;
    }
    els.startPractice.disabled = result.charCount === 0;
  }

  function renderHomeControls() {
    els.profileGrade.value = String(state.profileGrade);
    els.allowBackwards.checked = state.allowBackwards;
    els.reviewSpeedLabel.textContent = REVIEW_SPEED_LABEL[state.reviewSpeed] || '標準';
    document.querySelectorAll('input[name="practice-mode"]').forEach(input => { input.checked = input.value === state.practiceMode; });
    renderRecommendedPath();
    renderMaterialFilters();
    renderLessonList();
    renderMaterialSummary();
  }

  function renderQuestionText(question) {
    return question.tokens.map(token => {
      const ruby = token.zhuyin ? `<ruby>${token.type === 'blank' ? '<span class="blank-char">　</span>' : escapeHtml(token.char)}<rt>${escapeHtml(token.zhuyin)}</rt></ruby>` : (token.type === 'blank' ? '<span class="blank-char">　</span>' : escapeHtml(token.char));
      return ruby;
    }).join('');
  }

  function codePointHex(char) { return char.codePointAt(0).toString(16).padStart(4, '0'); }

  function customCharUrl(template, char) {
    return String(template || '')
      .replaceAll('{char}', char)
      .replaceAll('{charEncoded}', encodeURIComponent(char))
      .replaceAll('{hex}', codePointHex(char));
  }

  function approvedCharUrl(char) { return APPROVED_DATASET_PATH.replace('{hex}', codePointHex(char)); }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function makeCharDataLoader() {
    return async (char, onLoad, onError) => {
      try {
        if (state.dev.customCharDataFirst && state.dev.customCharDataTemplate) {
          try { return onLoad(await fetchJson(customCharUrl(state.dev.customCharDataTemplate, char))); } catch { /* fallback */ }
        }
        return onLoad(await fetchJson(approvedCharUrl(char)));
      } catch (err) {
        onError(err);
      }
    };
  }

  function createWriterState(question, token, index) {
    const box = document.createElement('div');
    box.className = 'writer-box';
    box.id = `writer-${question.courseKey.replace(/[^a-zA-Z0-9_-]/g, '_')}-${question.id}-${index}`;
    const card = document.createElement('div');
    card.className = 'writer-card';
    card.innerHTML = `<div class="writer-label">${escapeHtml(token.zhuyin || '')}</div>`;
    card.appendChild(box);
    els.writers.appendChild(card);

    const writer = HanziWriter.create(box.id, token.char, {
      width: box.clientWidth || 260,
      height: box.clientWidth || 260,
      padding: 8,
      showOutline: true,
      showCharacter: false,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 180,
      drawingWidth: Number(state.dev.drawingWidth) || 18,
      strokeColor: '#111827',
      outlineColor: 'rgba(17, 24, 39, 0.18)',
      highlightColor: '#5b8def',
      charDataLoader: makeCharDataLoader()
    });

    const ws = { token, writer, box, failed: false, completed: false, recorded: false, question };
    startWriterQuiz(ws);
    return ws;
  }

  function startWriterQuiz(ws) {
    ws.completed = false;
    ws.box.classList.remove('done');
    ws.writer.quiz({
      leniency: Number(state.dev.leniency) || 1.4,
      acceptBackwardsStrokes: state.allowBackwards,
      showHintAfterMisses: 4,
      highlightOnComplete: state.dev.highlightOnComplete !== false,
      markStrokeCorrectAfterMisses: Number(state.dev.markStrokeCorrectAfterMisses) || 4,
      onMistake: () => { ws.failed = true; },
      onComplete: async summary => {
        ws.completed = true;
        ws.box.classList.add('done');
        if (summary && Number(summary.totalMistakes) > 0) ws.failed = true;
        await recordWriterResult(ws, ws.failed ? 'fail' : 'pass');
        if (state.writerStates.every(item => item.completed)) {
          els.quizMessage.textContent = '本題完成';
          clearTimeout(state.autoNextTimer);
          state.autoNextTimer = setTimeout(() => goNextQuestion(), 1800);
        }
      }
    });
  }

  async function recordWriterResult(ws, result) {
    if (ws.recorded) return;
    ws.recorded = true;
    try {
      await recordReview({ char: ws.token.char, skill: ws.question.skill, courseKey: ws.question.courseKey, result, mode: state.practiceMode });
    } catch (err) {
      console.error(err);
      els.quizMessage.textContent = '作答完成，但學習紀錄儲存失敗。';
    }
  }

  async function recordIncompleteAsFail() {
    const jobs = state.writerStates.filter(ws => !ws.recorded).map(ws => recordWriterResult(ws, 'fail'));
    await Promise.all(jobs);
  }

  function speakQuestion() {
    const question = state.currentQueue[state.currentIndex];
    if (!question || !question.readText || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(question.readText);
    utter.lang = 'zh-TW';
    utter.rate = 0.85;
    speechSynthesis.speak(utter);
  }

  async function showQuestion() {
    clearTimeout(state.autoNextTimer);
    const question = state.currentQueue[state.currentIndex];
    if (!question) {
      await finishPractice();
      return;
    }
    els.progressLabel.textContent = `第 ${state.currentIndex + 1} / ${state.currentQueue.length} 題`;
    els.questionText.innerHTML = renderQuestionText(question);
    els.quizMessage.textContent = `${courseDisplay(question.lesson)}`;
    els.writers.innerHTML = '';
    state.writerStates = [];
    const blanks = question.tokens.map((token, index) => ({ token, index })).filter(item => item.token.type === 'blank');
    blanks.forEach(item => state.writerStates.push(createWriterState(question, item.token, item.index)));
    setTimeout(speakQuestion, 250);
  }

  async function goNextQuestion() {
    clearTimeout(state.autoNextTimer);
    await recordIncompleteAsFail();
    if (state.currentIndex >= state.currentQueue.length - 1) {
      await finishPractice();
      return;
    }
    state.currentIndex += 1;
    await showQuestion();
  }

  async function resetCurrentQuestion() {
    state.writerStates.forEach(ws => { if (!ws.completed) ws.failed = true; });
    const question = state.currentQueue[state.currentIndex];
    if (!question) return;
    await showQuestion();
  }

  function hintCurrentQuestion() {
    state.writerStates.forEach(ws => {
      if (ws.completed) return;
      ws.failed = true;
      try {
        ws.writer.cancelQuiz();
        ws.writer.animateCharacter({ onComplete: () => startWriterQuiz(ws) });
      } catch {
        startWriterQuiz(ws);
      }
    });
  }

  async function finishPractice() {
    clearTimeout(state.autoNextTimer);
    await recordIncompleteAsFail();
    els.quizMessage.textContent = '這次練習完成！';
    els.questionText.textContent = '完成';
    els.writers.innerHTML = '';
    els.nextButton.textContent = '回首頁';
    els.nextButton.onclick = () => showHome();
    await updateStorageStatus();
    if (state.driveAccessToken) {
      try { await syncDrive(false); } catch (err) { console.warn('Auto sync failed', err); }
    }
  }

  async function startPractice(lessonSubset = null) {
    const result = await buildQueue(lessonSubset);
    if (!result.queue.length) {
      els.homeMessage.textContent = state.practiceMode === 'normal' ? '目前沒有新字或到期生字。' : '目前沒有可練習的生字。';
      return;
    }
    state.currentQueue = result.queue;
    state.currentIndex = 0;
    els.quizModeLabel.textContent = state.practiceMode === 'review' ? '總複習・隨機' : '一般練習・由新到舊';
    buildQuizLessonFocus();
    els.homeView.classList.add('hidden');
    els.quizView.classList.remove('hidden');
    els.nextButton.textContent = '下一題 ➜';
    els.nextButton.onclick = () => goNextQuestion();
    await showQuestion();
  }

  function buildQuizLessonFocus() {
    const lessons = selectedLessons();
    els.quizLessonFocus.innerHTML = '<option value="">全部已選課次</option>' + lessons.map(lesson => `<option value="${escapeHtml(lesson.key)}">${escapeHtml(lessonLabel(lesson.lessonCode))}・${escapeHtml(PUBLISHERS[lesson.publisherCode] || '')}</option>`).join('');
    els.quizLessonFocus.value = state.currentLessonFocus;
  }

  async function focusLesson(key) {
    state.currentLessonFocus = key;
    const subset = key ? selectedLessons().filter(lesson => lesson.key === key) : null;
    await startPractice(subset);
  }

  async function showHome() {
    clearTimeout(state.autoNextTimer);
    try { speechSynthesis.cancel(); } catch { /* noop */ }
    state.currentLessonFocus = '';
    els.quizView.classList.add('hidden');
    els.homeView.classList.remove('hidden');
    renderHomeControls();
    await updatePracticeEstimate();
    await updateSyncChip();
  }

  async function exportPayload() {
    const events = await getAll('review_events');
    return {
      schema: 'hanzi-quiz-learning-backup', version: 1, exportedAt: nowIso(),
      prefs: getPrefs(), events
    };
  }

  async function importPayload(payload, merge = true) {
    if (!payload || payload.schema !== 'hanzi-quiz-learning-backup' || !Array.isArray(payload.events)) throw new Error('不是支援的 Hanzi Quiz 備份格式');
    const localEvents = merge ? await getAll('review_events') : [];
    const eventMap = new Map(localEvents.map(item => [item.id, item]));
    payload.events.forEach(item => { if (item && item.id) eventMap.set(item.id, item); });
    const tx = state.db.transaction('review_events', 'readwrite');
    const store = tx.objectStore('review_events');
    if (!merge) store.clear();
    eventMap.forEach(item => store.put(item));
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    const remotePrefs = payload.prefs || {};
    const localPrefs = getPrefs();
    if (String(remotePrefs.updatedAt || '') > String(localPrefs.updatedAt || '')) {
      localStorage.setItem('hanziQuizPrefsV1', JSON.stringify(remotePrefs));
      loadPrefsIntoState();
    }
    await rebuildSkillStateFromEvents();
    renderHomeControls();
    await updatePracticeEstimate();
  }

  async function downloadBackup() {
    const payload = await exportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hanzi-quiz-backup-${new Date().toISOString().slice(0,10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function updateStorageStatus() {
    if (!state.db) return;
    const events = await getAll('review_events');
    let quotaText = '';
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const used = Math.round((estimate.usage || 0) / 1024 / 1024 * 10) / 10;
        quotaText = `<br>瀏覽器網站資料：約 ${used} MB`;
      }
    } catch { /* noop */ }
    els.storageStatus.innerHTML = `本機 IndexedDB：<strong>${events.length}</strong> 筆學習紀錄${quotaText}<br><span class="profile-note">匯出備份可完整保留原始 Review Events。</span>`;
  }

  async function loadDriveConfig() {
    try {
      const response = await fetch('config/google-drive.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('config missing');
      state.driveConfig = await response.json();
    } catch {
      state.driveConfig = { clientId: '', fileName: 'hanzi-quiz-learning-v1.json' };
    }
    updateDriveUi();
  }

  function updateDriveUi(message = '') {
    const configured = Boolean(state.driveConfig && state.driveConfig.clientId);
    if (!configured) {
      els.driveStatus.textContent = 'Google Drive 同步程式已就緒，但正式環境尚未設定 OAuth Client ID。匯出／匯入可正常使用。';
      els.driveConnect.disabled = true;
      els.driveSync.disabled = true;
      return;
    }
    els.driveConnect.disabled = false;
    els.driveSync.disabled = !state.driveAccessToken;
    els.driveStatus.textContent = message || (state.driveAccessToken ? '已連接，可同步到 Google Drive appDataFolder。' : '尚未連接 Google Drive。');
  }

  function loadGoogleIdentityScript() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
      const existing = document.querySelector('script[data-google-identity]');
      if (existing) { existing.addEventListener('load', resolve, { once: true }); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = '1';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google Identity Services 載入失敗'));
      document.head.appendChild(script);
    });
  }

  async function initDriveTokenClient() {
    if (!state.driveConfig || !state.driveConfig.clientId) throw new Error('尚未設定 Google OAuth Client ID');
    await loadGoogleIdentityScript();
    if (state.driveTokenClient) return state.driveTokenClient;
    state.driveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: state.driveConfig.clientId,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      callback: () => {}
    });
    return state.driveTokenClient;
  }

  async function requestDriveToken(promptMode = '') {
    const client = await initDriveTokenClient();
    return new Promise((resolve, reject) => {
      client.callback = response => {
        if (response && response.access_token) {
          state.driveAccessToken = response.access_token;
          state.driveEnabled = true;
          savePrefs({ driveEnabled: true });
          updateDriveUi('已連接 Google Drive。');
          resolve(response.access_token);
        } else reject(new Error(response && response.error || 'Google 授權失敗'));
      };
      client.requestAccessToken({ prompt: promptMode });
    });
  }

  async function driveFetch(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${state.driveAccessToken}` } });
    if (!response.ok) throw new Error(`Google Drive API ${response.status}`);
    return response;
  }

  async function findDriveBackupFile() {
    const name = state.driveConfig.fileName || 'hanzi-quiz-learning-v1.json';
    const query = encodeURIComponent(`name='${name.replaceAll("'", "\\'")}' and trashed=false`);
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`);
    const data = await response.json();
    return Array.isArray(data.files) ? data.files[0] || null : null;
  }

  async function readDriveBackup(fileId) {
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    return response.json();
  }

  async function writeDriveBackup(payload, fileId = '') {
    const metadata = { name: state.driveConfig.fileName || 'hanzi-quiz-learning-v1.json', parents: fileId ? undefined : ['appDataFolder'] };
    if (metadata.parents === undefined) delete metadata.parents;
    const boundary = `hanzi_${Date.now()}`;
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`;
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const response = await driveFetch(url, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return response.json();
  }

  function mergeBackups(localPayload, remotePayload) {
    const eventMap = new Map();
    [...(remotePayload && remotePayload.events || []), ...(localPayload.events || [])].forEach(item => { if (item && item.id) eventMap.set(item.id, item); });
    const localPrefs = localPayload.prefs || {};
    const remotePrefs = remotePayload && remotePayload.prefs || {};
    const prefs = String(remotePrefs.updatedAt || '') > String(localPrefs.updatedAt || '') ? remotePrefs : localPrefs;
    return { schema: 'hanzi-quiz-learning-backup', version: 1, exportedAt: nowIso(), prefs, events: [...eventMap.values()] };
  }

  async function syncDrive(showMessage = true) {
    if (!state.driveAccessToken) await requestDriveToken('');
    if (showMessage) updateDriveUi('同步中…');
    const local = await exportPayload();
    const file = await findDriveBackupFile();
    let merged = local;
    if (file) {
      try { merged = mergeBackups(local, await readDriveBackup(file.id)); } catch { merged = local; }
    }
    await importPayload(merged, false);
    await writeDriveBackup(await exportPayload(), file ? file.id : '');
    updateDriveUi(`同步完成：${new Date().toLocaleString('zh-TW')}`);
    await updateSyncChip();
  }

  async function updateSyncChip() {
    if (!state.driveConfig || !state.driveConfig.clientId) {
      els.syncStatusButton.textContent = '☁ 可備份';
      return;
    }
    els.syncStatusButton.textContent = state.driveAccessToken ? '☁ 已連接' : (state.driveEnabled ? '☁ 待同步' : '☁ 尚未連接');
  }

  function bindEvents() {
    els.profileGrade.addEventListener('change', async () => {
      state.profileGrade = Number(els.profileGrade.value);
      savePrefs({ profileGrade: state.profileGrade });
      renderRecommendedPath();
      renderLessonList();
      await updatePracticeEstimate();
    });

    document.querySelectorAll('input[name="practice-mode"]').forEach(input => input.addEventListener('change', async () => {
      if (!input.checked) return;
      state.practiceMode = input.value;
      savePrefs({ practiceMode: state.practiceMode });
      await updatePracticeEstimate();
    }));

    els.allowBackwards.addEventListener('change', () => {
      state.allowBackwards = els.allowBackwards.checked;
      savePrefs({ allowBackwards: state.allowBackwards });
    });

    els.openMaterials.addEventListener('click', () => {
      renderRecommendedPath(); renderMaterialFilters(); renderLessonList(); els.materialsDialog.showModal();
    });
    [els.filterYear, els.filterPublisher, els.filterGrade, els.filterSemester].forEach(select => select.addEventListener('change', renderLessonList));
    els.lessonList.addEventListener('change', event => {
      const checkbox = event.target.closest('input[data-lesson-key]');
      if (!checkbox) return;
      checkbox.checked ? state.selectedLessonKeys.add(checkbox.dataset.lessonKey) : state.selectedLessonKeys.delete(checkbox.dataset.lessonKey);
    });
    els.selectRecommended.addEventListener('click', () => { state.selectedLessonKeys = new Set(getRecommendedLessons().map(x => x.key)); renderLessonList(); });
    els.selectFiltered.addEventListener('click', () => { filteredLessons().forEach(x => state.selectedLessonKeys.add(x.key)); renderLessonList(); });
    els.clearMaterials.addEventListener('click', () => { state.selectedLessonKeys.clear(); renderLessonList(); });
    els.saveMaterials.addEventListener('click', async () => {
      savePrefs({ selectedLessonKeys: [...state.selectedLessonKeys] });
      els.materialsDialog.close();
      renderMaterialSummary();
      await updatePracticeEstimate();
    });

    els.openLearningSettings.addEventListener('click', () => {
      document.querySelectorAll('input[name="review-speed"]').forEach(input => { input.checked = input.value === state.reviewSpeed; });
      els.learningSettingsDialog.showModal();
    });
    els.saveLearningSettings.addEventListener('click', async () => {
      const selected = document.querySelector('input[name="review-speed"]:checked');
      state.reviewSpeed = selected ? selected.value : 'normal';
      savePrefs({ reviewSpeed: state.reviewSpeed });
      await rebuildSkillStateFromEvents();
      els.reviewSpeedLabel.textContent = REVIEW_SPEED_LABEL[state.reviewSpeed];
      els.learningSettingsDialog.close();
      await updatePracticeEstimate();
    });

    els.startPractice.addEventListener('click', () => startPractice());
    els.backHome.addEventListener('click', showHome);
    els.quizLessonFocus.addEventListener('change', () => focusLesson(els.quizLessonFocus.value));
    els.audioButton.addEventListener('click', speakQuestion);
    els.resetButton.addEventListener('click', resetCurrentQuestion);
    els.hintButton.addEventListener('click', hintCurrentQuestion);
    els.nextButton.addEventListener('click', goNextQuestion);

    els.syncStatusButton.addEventListener('click', async () => { await updateStorageStatus(); updateDriveUi(); els.dataDialog.showModal(); });
    els.exportData.addEventListener('click', downloadBackup);
    els.importDataButton.addEventListener('click', () => els.importDataFile.click());
    els.importDataFile.addEventListener('change', async () => {
      const file = els.importDataFile.files && els.importDataFile.files[0];
      if (!file) return;
      try {
        await importPayload(JSON.parse(await file.text()), true);
        await updateStorageStatus();
        els.driveStatus.textContent = '匯入完成，已與本機學習紀錄合併。';
      } catch (err) {
        els.driveStatus.textContent = `匯入失敗：${err.message}`;
      } finally { els.importDataFile.value = ''; }
    });
    els.driveConnect.addEventListener('click', async () => {
      try { await requestDriveToken('consent'); await syncDrive(); } catch (err) { updateDriveUi(`連接失敗：${err.message}`); }
    });
    els.driveSync.addEventListener('click', async () => {
      try { await syncDrive(); } catch (err) { updateDriveUi(`同步失敗：${err.message}`); }
    });
  }

  async function requestPersistentStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
    } catch { /* best effort */ }
  }

  async function bootstrap() {
    loadPrefsIntoState();
    bindEvents();
    renderHomeControls();
    try {
      state.db = await openDb();
      await requestPersistentStorage();
    } catch (err) {
      els.homeMessage.textContent = `本機學習紀錄無法啟用：${err.message}`;
      return;
    }
    await loadDriveConfig();
    try {
      await loadCatalog();
      renderHomeControls();
      await updatePracticeEstimate();
    } catch (err) {
      els.materialSummaryTitle.textContent = '教材載入失敗';
      els.materialSummary.textContent = err.message;
      els.homeMessage.textContent = '請確認題庫檔案或重新整理頁面。';
    }
    await updateStorageStatus();
    await updateSyncChip();
    if (state.driveEnabled && state.driveConfig && state.driveConfig.clientId) {
      try { await requestDriveToken(''); await syncDrive(false); } catch { updateDriveUi('Google Drive 需要重新連接；本機資料不受影響。'); }
    }
  }

  bootstrap();
})();
