// Tippkurs engine: drill generation, typing rules, statistics, progress and the page UI.
(function () {
  'use strict';

  const LESSONS = window.TippLessons.LESSONS;
  const WORDS = window.TippLessons.WORDS;
  const SENTENCES = window.TippLessons.SENTENCES;
  const { ROWS, MODIFIER_KEYS, findKey, fingerName } = window.TippLayout;

  const STORAGE_KEY = 'tippkurs.fortschritt.v1';
  const PASS_ACCURACY = 95;
  const MIN_WORD_CANDIDATES = 8;
  const MIN_SENTENCE_CANDIDATES = 3;
  const DEFAULT_LENGTH = { letters: 120, words: 150, sentences: 180 };
  const DEFAULT_DURATION_SEC = 60;
  const TIMED_START_LENGTH = 300;
  const TIMED_CHUNK_LENGTH = 150;
  const TIMED_REFILL_BELOW = 80;
  const TICK_MS = 200;
  const FLASH_MS = 400;

  const $ = id => document.getElementById(id);
  const el = {
    lessonList: $('lesson-list'),
    lessonModule: $('lesson-module'),
    lessonTitle: $('lesson-title'),
    lessonDescription: $('lesson-description'),
    lessonTip: $('lesson-tip'),
    statTime: $('stat-time'),
    statWpm: $('stat-wpm'),
    statAccuracy: $('stat-accuracy'),
    statProgress: $('stat-progress'),
    textPanel: $('text-panel'),
    input: $('typing-input'),
    hint: $('hint'),
    restart: $('restart-btn'),
    keyboard: $('keyboard'),
    result: $('result'),
    resultVerdict: $('result-verdict'),
    resultWpm: $('result-wpm'),
    resultAccuracy: $('result-accuracy'),
    resultErrors: $('result-errors'),
    resultTime: $('result-time'),
    resultHard: $('result-hard'),
    resultRetry: $('result-retry'),
    resultNext: $('result-next'),
    resetProgress: $('reset-progress')
  };

  // Without the page markup there is nothing to run.
  if (Object.values(el).some(node => !node)) return;

  const state = {
    progress: loadProgress(),
    lessonIndex: 0,
    run: null,
    keyEls: {}
  };

  // ---------- Drill generation ----------

  function randomOf(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function fits(text, keys) {
    return Array.from(text).every(ch => keys.has(ch));
  }

  function displayChar(ch) {
    if (ch === ' ') return 'Leertaste';
    return ch === 'ß' ? ch : ch.toUpperCase();
  }

  // Every character the lesson may use: the space plus all keys introduced up to this lesson.
  function lessonKeys(index) {
    const keys = new Set([' ']);
    LESSONS.slice(0, index + 1).forEach(lesson => lesson.newKeys.forEach(ch => keys.add(ch)));
    return keys;
  }

  function lettersDrill(newKeys, keys, length) {
    const allowed = Array.from(keys).filter(ch => ch !== ' ');
    // New keys appear three times in the pool, the others once.
    const pool = allowed.concat(newKeys, newKeys);
    // Every new key must show up at least once, so it is placed in a group first.
    const missing = newKeys.slice();
    let text = '';
    while (text.length < length || missing.length > 0) {
      const size = 3 + Math.floor(Math.random() * 3);
      let group = '';
      for (let i = 0; i < size; i++) {
        group += missing.length > 0 ? missing.shift() : randomOf(pool);
      }
      text += (text ? ' ' : '') + group;
    }
    return text;
  }

  function joinRandom(candidates, length) {
    let text = '';
    let last = null;
    while (text.length < length) {
      let next = randomOf(candidates);
      if (candidates.length > 1) {
        while (next === last) next = randomOf(candidates);
      }
      text += (text ? ' ' : '') + next;
      last = next;
    }
    return text;
  }

  function wordsDrill(keys, length) {
    const candidates = WORDS.filter(word => fits(word, keys));
    return candidates.length < MIN_WORD_CANDIDATES ? null : joinRandom(candidates, length);
  }

  function sentencesDrill(keys, length) {
    const candidates = SENTENCES.filter(sentence => fits(sentence, keys));
    return candidates.length < MIN_SENTENCE_CANDIDATES ? null : joinRandom(candidates, length);
  }

  function generateDrill(lesson, keys, length) {
    const mode = lesson.mode === 'timed' ? 'words' : lesson.mode;
    const target = length || lesson.targetLength || DEFAULT_LENGTH[mode];
    if (mode === 'sentences') {
      return sentencesDrill(keys, target) || wordsDrill(keys, target) || lettersDrill(lesson.newKeys, keys, target);
    }
    if (mode === 'words') {
      return wordsDrill(keys, target) || lettersDrill(lesson.newKeys, keys, target);
    }
    return lettersDrill(lesson.newKeys, keys, target);
  }

  // ---------- Run lifecycle ----------

  function createRun(index) {
    const lesson = LESSONS[index];
    const keys = lessonKeys(index);
    const timed = lesson.mode === 'timed';
    return {
      index,
      lesson,
      keys,
      timed,
      duration: lesson.durationSec || DEFAULT_DURATION_SEC,
      target: generateDrill(lesson, keys, timed ? TIMED_START_LENGTH : undefined),
      pos: 0,
      keystrokes: 0,
      errors: 0,
      errorsByChar: {},
      missAt: 0,
      startedAt: null,
      endedAt: null,
      tickId: null,
      limitId: null,
      finished: false
    };
  }

  function clearTimers(run) {
    clearInterval(run.tickId);
    clearTimeout(run.limitId);
    run.tickId = null;
    run.limitId = null;
  }

  function startRun(index, focusInput) {
    if (state.run) clearTimers(state.run);
    state.lessonIndex = index;
    state.run = createRun(index);
    el.input.readOnly = false;
    el.input.value = '';
    el.result.hidden = true;
    renderHeader();
    renderLessonList();
    renderText();
    updateStats();
    updateKeyboard();
    if (focusInput) el.input.focus();
  }

  function selectLesson(index, focusInput) {
    if (!LESSONS[index] || !isUnlocked(index)) return;
    startRun(index, focusInput);
  }

  // The clock starts with the first character entry, not when the lesson is opened.
  function markStarted(run) {
    if (run.startedAt !== null) return;
    run.startedAt = Date.now();
    run.tickId = setInterval(updateStats, TICK_MS);
    if (run.timed) run.limitId = setTimeout(() => finish(run), run.duration * 1000);
  }

  // ---------- Typing rules ----------

  function onInput() {
    const run = state.run;
    if (!run || run.finished) return;
    const typed = el.input.value;

    if (run.target.startsWith(typed)) {
      const added = typed.length - run.pos;
      if (added > 0) {
        markStarted(run);
        run.keystrokes += added;
        flashKey(keyIdFor(typed.charAt(typed.length - 1)), 'is-hit');
      }
      run.pos = typed.length;
    } else {
      // A wrong character never stays in the field: count it, flash it, and remove it.
      markStarted(run);
      run.keystrokes += 1;
      run.errors += 1;
      const expected = run.target.charAt(run.pos);
      run.errorsByChar[expected] = (run.errorsByChar[expected] || 0) + 1;
      run.missAt = Date.now();
      flashKey(keyIdFor(typed.charAt(run.pos) || typed.slice(-1)), 'is-miss');
      setTimeout(renderText, FLASH_MS + 20);
      el.input.value = run.target.slice(0, run.pos);
    }

    if (run.timed && run.target.length - run.pos < TIMED_REFILL_BELOW) {
      run.target += ` ${generateDrill(run.lesson, run.keys, TIMED_CHUNK_LENGTH)}`;
    }
    if (!run.timed && run.pos === run.target.length) {
      finish(run);
      return;
    }
    renderText();
    updateStats();
    updateKeyboard();
  }

  function finish(run) {
    if (run.finished) return;
    run.finished = true;
    run.endedAt = Date.now();
    clearTimers(run);
    el.input.readOnly = true;
    const stats = measure(run);
    const passed = !run.timed && accuracyRaw(run) >= PASS_ACCURACY;
    saveResult(run, stats, passed);
    renderText();
    updateStats();
    updateKeyboard();
    showResult(run, stats, passed);
    renderLessonList();
  }

  // ---------- Statistics ----------

  function elapsedMs(run) {
    if (run.startedAt === null) return 0;
    return (run.endedAt === null ? Date.now() : run.endedAt) - run.startedAt;
  }

  function accuracyRaw(run) {
    return run.keystrokes === 0 ? 100 : ((run.keystrokes - run.errors) / run.keystrokes) * 100;
  }

  function measure(run) {
    const minutes = Math.max(elapsedMs(run) / 60000, 1 / 60);
    return {
      wpm: run.startedAt === null ? 0 : Math.round(run.pos / 5 / minutes),
      accuracy: run.keystrokes === 0 ? null : Math.round(accuracyRaw(run)),
      seconds: elapsedMs(run) / 1000
    };
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function updateStats() {
    const run = state.run;
    if (!run) return;
    const stats = measure(run);
    const elapsed = stats.seconds;
    el.statTime.textContent = formatTime(run.timed ? run.duration - elapsed : elapsed);
    el.statWpm.textContent = String(stats.wpm);
    el.statAccuracy.textContent = stats.accuracy === null ? '–' : `${stats.accuracy} %`;
    el.statProgress.textContent = run.timed ? `${run.pos} Zeichen` : `${run.pos} / ${run.target.length}`;
  }

  // ---------- Progress ----------

  function loadProgress() {
    try {
      const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
      return {
        passed: data && data.passed && typeof data.passed === 'object' ? data.passed : {},
        sprint: data && data.sprint ? data.sprint : null
      };
    } catch (error) {
      return { passed: {}, sprint: null };
    }
  }

  function persistProgress() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    } catch (error) {
      // Storage unavailable (private window, blocked site data): progress only lasts for this page view.
    }
  }

  function saveResult(run, stats, passed) {
    if (run.timed) {
      const best = state.progress.sprint ? state.progress.sprint.wpm : 0;
      state.progress.sprint = { wpm: Math.max(best, stats.wpm) };
    } else if (passed) {
      const key = String(run.lesson.id);
      const previous = state.progress.passed[key];
      state.progress.passed[key] = {
        wpm: Math.max(previous ? previous.wpm : 0, stats.wpm),
        accuracy: Math.max(previous ? previous.accuracy : 0, stats.accuracy)
      };
    } else {
      return;
    }
    persistProgress();
  }

  function resetProgress() {
    if (!window.confirm('Fortschritt wirklich zurücksetzen? Alle bestandenen Lektionen werden gelöscht.')) return;
    state.progress = { passed: {}, sprint: null };
    persistProgress();
    startRun(0, false);
  }

  function isPassed(lesson) {
    return Boolean(state.progress.passed[String(lesson.id)]);
  }

  function isUnlocked(index) {
    return index === 0 || isPassed(LESSONS[index - 1]);
  }

  function firstOpenLesson() {
    const index = LESSONS.findIndex((lesson, i) => isUnlocked(i) && !isPassed(lesson));
    return index === -1 ? 0 : index;
  }

  // ---------- Text panel ----------

  function renderText() {
    const run = state.run;
    el.textPanel.textContent = '';
    if (!run) return;
    const missFlash = Date.now() - run.missAt < FLASH_MS;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < run.target.length; i++) {
      const span = document.createElement('span');
      span.textContent = run.target.charAt(i);
      if (i < run.pos) {
        span.className = 'done';
      } else if (i === run.pos && !run.finished) {
        span.className = missFlash ? 'current miss' : 'current';
      } else {
        span.className = 'todo';
      }
      fragment.appendChild(span);
    }
    el.textPanel.appendChild(fragment);
    const current = el.textPanel.querySelector('.current');
    if (current) {
      el.textPanel.scrollTop = current.offsetTop - el.textPanel.clientHeight / 2;
    }
  }

  function renderHeader() {
    const lesson = LESSONS[state.lessonIndex];
    el.lessonModule.textContent = lesson.module;
    el.lessonTitle.textContent = `${String(lesson.id).padStart(2, '0')} · ${lesson.title}`;
    el.lessonDescription.textContent = lesson.description;
    el.lessonTip.textContent = lesson.tip || '';
    el.lessonTip.hidden = !lesson.tip;
  }

  function verdictFor(run, passed) {
    if (run.timed) return 'Sprint beendet.';
    if (passed) return 'Bestanden. Die nächste Lektion ist freigeschaltet.';
    return `Noch nicht bestanden – du brauchst mindestens ${PASS_ACCURACY} % Genauigkeit.`;
  }

  function hardestKeys(run) {
    const chars = Object.keys(run.errorsByChar)
      .sort((a, b) => run.errorsByChar[b] - run.errorsByChar[a])
      .slice(0, 3);
    if (chars.length === 0) return 'keine';
    return chars.map(ch => `${displayChar(ch)} (${run.errorsByChar[ch]}×)`).join(', ');
  }

  function showResult(run, stats, passed) {
    el.resultWpm.textContent = String(stats.wpm);
    el.resultAccuracy.textContent = stats.accuracy === null ? '–' : `${stats.accuracy} %`;
    el.resultErrors.textContent = String(run.errors);
    el.resultTime.textContent = formatTime(stats.seconds);
    el.resultVerdict.textContent = verdictFor(run, passed);
    el.resultHard.textContent = hardestKeys(run);
    el.resultNext.hidden = !(passed && LESSONS[run.index + 1]);
    el.result.hidden = false;
    el.result.scrollIntoView({ block: 'nearest' });
  }

  // ---------- Lesson list ----------

  function lessonItem(lesson, index) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lesson-button';
    button.disabled = !isUnlocked(index);
    if (index === state.lessonIndex) button.setAttribute('aria-current', 'true');

    const num = document.createElement('span');
    num.className = 'lesson-num';
    num.textContent = String(lesson.id).padStart(2, '0');

    const name = document.createElement('span');
    name.className = 'lesson-name';
    name.textContent = lesson.title;

    const status = document.createElement('span');
    status.className = 'lesson-status';
    const best = lesson.mode === 'timed' ? state.progress.sprint : state.progress.passed[String(lesson.id)];
    if (!isUnlocked(index)) {
      status.textContent = 'gesperrt';
    } else if (best) {
      status.classList.add('is-passed');
      status.textContent = lesson.mode === 'timed' ? `Bestwert ${best.wpm} WPM` : `bestanden · ${best.wpm} WPM`;
    } else {
      status.textContent = 'offen';
    }

    button.append(num, name, status);
    button.addEventListener('click', () => selectLesson(index, true));
    item.appendChild(button);
    return item;
  }

  function renderLessonList() {
    el.lessonList.textContent = '';
    let moduleName = null;
    let list = null;
    LESSONS.forEach((lesson, index) => {
      if (lesson.module !== moduleName) {
        moduleName = lesson.module;
        const section = document.createElement('section');
        section.className = 'module';
        const heading = document.createElement('h3');
        heading.className = 'module-title mono-label';
        heading.textContent = moduleName;
        list = document.createElement('ul');
        section.append(heading, list);
        el.lessonList.appendChild(section);
      }
      list.appendChild(lessonItem(lesson, index));
    });
  }

  // ---------- Keyboard ----------

  function labelNode(className, text) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  function keyNode(key) {
    const node = document.createElement('div');
    node.className = key.dead ? 'key is-dead' : 'key';
    node.dataset.hand = key.hand;
    node.dataset.finger = key.finger;
    node.style.gridColumn = String(key.col + 2);
    node.appendChild(labelNode('key-main', displayChar(key.plain)));
    // Letter keys show their capital in the main label; only add the Shift label for other characters.
    if (key.shift && key.shift !== key.plain.toUpperCase()) node.appendChild(labelNode('key-shift', key.shift));
    if (key.altgr) node.appendChild(labelNode('key-alt', key.altgr));
    state.keyEls[key.id] = node;
    return node;
  }

  function modifierNode(mod) {
    const node = document.createElement('div');
    node.className = 'key is-modifier';
    node.dataset.hand = mod.hand;
    node.dataset.finger = mod.finger;
    node.style.gridColumn = mod.gridColumn;
    node.appendChild(labelNode('key-main', mod.label));
    state.keyEls[mod.id] = node;
    return node;
  }

  function buildKeyboard() {
    el.keyboard.textContent = '';
    for (let row = 0; row <= 4; row++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      (ROWS[row] || []).forEach(key => rowEl.appendChild(keyNode(key)));
      MODIFIER_KEYS.filter(mod => mod.row === row).forEach(mod => rowEl.appendChild(modifierNode(mod)));
      el.keyboard.appendChild(rowEl);
    }
  }

  function keyIdFor(ch) {
    const info = ch ? findKey(ch) : null;
    return info ? info.id : null;
  }

  function addKeyClass(id, className) {
    const node = id ? state.keyEls[id] : null;
    if (node) node.classList.add(className);
  }

  function flashKey(id, className) {
    const node = id ? state.keyEls[id] : null;
    if (!node) return;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), FLASH_MS);
  }

  function hintFor(ch, info) {
    if (ch === ' ') return 'Leertaste · Daumen';
    if (!info) return `Nächstes Zeichen: ${ch}`;
    if (info.mod === 'shift') {
      const side = info.hand === 'left' ? 'rechten' : 'linken';
      const kind = ch !== ch.toLowerCase() ? 'Großbuchstabe' : 'Sonderzeichen';
      return `${kind}: Halte die Shift-Taste (⇧) der ${side} Seite gedrückt und tippe ${ch}.`;
    }
    if (info.mod === 'altgr') return `Halte AltGr gedrückt (Mac: ⌥ Option) und tippe ${ch}.`;
    return `Nächste Taste: ${displayChar(ch)} · ${fingerName(info)}`;
  }

  // Marks the next key, the Shift or AltGr key that must be held, and updates the hint line.
  function updateKeyboard() {
    Object.keys(state.keyEls).forEach(id => state.keyEls[id].classList.remove('is-next', 'is-mod'));
    const run = state.run;
    if (!run || run.finished) {
      el.hint.textContent = '';
      return;
    }
    const ch = run.target.charAt(run.pos);
    const info = findKey(ch);
    if (info) {
      addKeyClass(info.id, 'is-next');
      if (info.mod === 'shift') addKeyClass(info.hand === 'left' ? 'shift-right' : 'shift-left', 'is-mod');
      if (info.mod === 'altgr') addKeyClass('altgr', 'is-mod');
    }
    el.hint.textContent = hintFor(ch, info);
  }

  // ---------- Header, init ----------

  function init() {
    buildKeyboard();
    el.input.addEventListener('input', onInput);
    el.input.addEventListener('paste', event => event.preventDefault());
    el.textPanel.addEventListener('click', () => el.input.focus());
    el.restart.addEventListener('click', () => startRun(state.lessonIndex, true));
    el.resultRetry.addEventListener('click', () => startRun(state.lessonIndex, true));
    el.resultNext.addEventListener('click', () => selectLesson(state.lessonIndex + 1, true));
    el.resetProgress.addEventListener('click', resetProgress);
    startRun(firstOpenLesson(), false);
  }

  init();

  window.TippKurs = { lessonKeys, generateDrill };
})();
