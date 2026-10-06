/* quiz.js（ver1.2）
 * 出題・採点・選択肢づくり。画面（DOM）には触らない。
 *
 * 出題条件（config）の形：
 *   単語  { domain:'words', source:'level', level:'5', mode:'order'|'pos'|'random',
 *           range:0, pos:'noun', direction:'en2ja'|'ja2en', count:10|20|'all' }
 *         { domain:'words', source:'level', level:'5', mode:'range',          // ver1.1：番号で範囲を選ぶ
 *           from:24, to:60, shuffle:false, direction:'en2ja'|'ja2en' }
 *         { domain:'words', source:'list', tab:'wrong'|'bookmark'|'both', lf:'all'|'5'|..,
 *           mode:'order'|'pos'|'random', pos:'noun', direction:'en2ja'|'ja2en' }
 *   文法・数学（ver1.2 で数学を追加。どちらも「単元 × レベル」の問題集で、しくみは同じ）
 *         { domain:'grammar'|'math', source:'unit', unit:1, level:'normal', mode:'order'|'random' }
 *         { domain:'grammar'|'math', source:'practice', level:'normal', count:10|20|30 }
 *         { domain:'grammar'|'math', source:'list', tab:.., mode:'order'|'unit'|'random', unit:1 }
 *   やり直し { domain, source:'retry', ids:[..], direction }
 */
(function (global) {
  'use strict';

  var RANGE_SIZE = 50; // 「順番どおり」の範囲の大きさ

  var POS_LABEL = {
    noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞',
    preposition: '前置詞', conjunction: '接続詞', pronoun: '代名詞', other: 'その他'
  };
  var POS_ORDER = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'other'];

  var WORD_LEVELS = [
    { key: '5', label: '5級', idPrefix: 'w5' },
    { key: '4', label: '4級', idPrefix: 'w4' },
    { key: '3', label: '3級', idPrefix: 'w3' },
    { key: 'p2', label: '準2級', idPrefix: 'wp2' }
  ];

  var GRAMMAR_LEVELS = [
    { key: 'normal', label: '普通', code: 'n' },
    { key: 'advanced', label: '応用', code: 'a' },
    { key: 'hard', label: '難関', code: 'h' }
  ];

  var GRAMMAR_UNITS = [
    'be動詞',
    '一般動詞の現在形（三単現を含む）',
    '代名詞',
    '疑問詞',
    '命令文',
    '現在進行形',
    '過去形',
    '過去進行形',
    '未来の表現（will / be going to）',
    '助動詞',
    '不定詞',
    '動名詞',
    '比較',
    '接続詞',
    '受動態',
    '現在完了（現在完了進行形を含む）',
    '分詞（名詞を修飾する分詞）',
    '関係代名詞',
    '間接疑問文',
    '仮定法'
  ];

  // ---- 数学（ver1.2）。レベルは文法と同じ「普通・応用・難関」----
  var MATH_UNITS = [
    '正負の数',
    '文字と式',
    '一次方程式',
    '比例と反比例',
    '平面図形',
    '空間図形',
    '式の計算',
    '連立方程式',
    '一次関数',
    '平行線と角',
    '合同と図形の性質',
    '確率',
    'データの活用',
    '式の展開と因数分解',
    '平方根',
    '二次方程式',
    '関数 y=ax²',
    '相似な図形',
    '円周角の定理',
    '三平方の定理'
  ];

  // 単元ごとの学年（画面に小さく出す）
  var MATH_GRADES = [
    '中1', '中1', '中1', '中1', '中1', '中1',
    '中2', '中2', '中2', '中2', '中2', '中2',
    '中1〜3',
    '中3', '中3', '中3', '中3', '中3', '中3', '中3'
  ];

  // 「単元 × レベル」の問題集になっている分野（文法・数学）。データは window.GRAMMAR / window.MATH
  var UNIT_DOMAINS = ['grammar', 'math'];
  var BANK_DEFS = {
    grammar: { dataName: 'GRAMMAR', units: GRAMMAR_UNITS, levels: GRAMMAR_LEVELS, grades: null },
    math: { dataName: 'MATH', units: MATH_UNITS, levels: GRAMMAR_LEVELS, grades: MATH_GRADES }
  };

  // ---------- データの索引 ----------
  var wordById = {};
  var wordOrder = {};      // id -> 並び順（級 → データ順）
  var wordPos = {};        // id -> その級の中での番号（1から）
  var wordsByLevel = {};   // 級 -> 単語の配列（データ順＝やさしい順）
  var banks = {};          // 分野（grammar / math）-> { byId, order, by, all }
                           //   order: id -> 並び順（単元 → レベル → データ順）
                           //   by   : 'unit/level' -> 問題の配列（データ順）

  function wordLevelRank(key) {
    for (var i = 0; i < WORD_LEVELS.length; i++) if (WORD_LEVELS[i].key === key) return i;
    return -1;
  }

  function levelRank(levels, key) {
    for (var i = 0; i < levels.length; i++) if (levels[i].key === key) return i;
    return -1;
  }

  function init() {
    var words = global.WORDS || [];
    wordById = {};
    wordOrder = {};
    wordPos = {};
    wordsByLevel = {};
    banks = {};

    WORD_LEVELS.forEach(function (lv) { wordsByLevel[lv.key] = []; });
    words.forEach(function (w) {
      var rank = wordLevelRank(w.level);
      if (rank < 0) return;
      wordById[w.id] = w;
      wordsByLevel[w.level].push(w);
      wordOrder[w.id] = rank * 1e6 + wordsByLevel[w.level].length;
      wordPos[w.id] = wordsByLevel[w.level].length;
    });

    UNIT_DOMAINS.forEach(function (domain) {
      var def = BANK_DEFS[domain];
      var b = banks[domain] = { byId: {}, order: {}, by: {}, all: [] };
      (global[def.dataName] || []).forEach(function (g) {
        var rank = levelRank(def.levels, g.level);
        if (rank < 0 || !(g.unit >= 1 && g.unit <= def.units.length)) return;
        var k = g.unit + '/' + g.level;
        if (!b.by[k]) b.by[k] = [];
        b.by[k].push(g);
        b.byId[g.id] = g;
        b.all.push(g);
        b.order[g.id] = g.unit * 1e6 + rank * 1e4 + b.by[k].length;
      });
    });
  }

  function bankOf(domain) {
    return banks[domain] || { byId: {}, order: {}, by: {}, all: [] };
  }

  // ---------- 名前・件数 ----------
  function levelLabel(key) {
    var i = wordLevelRank(key);
    return i < 0 ? String(key) : WORD_LEVELS[i].label;
  }

  // 文法・数学のレベル名（普通・応用・難関）
  function gradeLabel(key) {
    var i = levelRank(GRAMMAR_LEVELS, key);
    return i < 0 ? String(key) : GRAMMAR_LEVELS[i].label;
  }

  function unitName(n) {
    return GRAMMAR_UNITS[n - 1] || '';
  }

  // ---- 文法・数学に共通の、単元まわりの名前・件数（domain は 'grammar' か 'math'）----
  function unitsOf(domain) { return BANK_DEFS[domain] ? BANK_DEFS[domain].units : []; }
  function unitNameOf(domain, n) { return unitsOf(domain)[n - 1] || ''; }
  // 単元の学年（数学だけ。文法は空）
  function unitGradeOf(domain, n) {
    var g = BANK_DEFS[domain] && BANK_DEFS[domain].grades;
    return g ? (g[n - 1] || '') : '';
  }
  function getItem(domain, id) { return bankOf(domain).byId[id] || null; }
  function itemsOf(domain, unit, level) { return (bankOf(domain).by[unit + '/' + level] || []).slice(); }
  function countOf(domain, unit, level) { return (bankOf(domain).by[unit + '/' + level] || []).length; }
  function countOfUnit(domain, unit) {
    return GRAMMAR_LEVELS.reduce(function (n, lv) { return n + countOf(domain, unit, lv.key); }, 0);
  }
  function countOfLevel(domain, level) {
    var n = 0;
    for (var u = 1; u <= unitsOf(domain).length; u++) n += countOf(domain, u, level);
    return n;
  }
  function totalOf(domain) { return bankOf(domain).all.length; }

  function getWord(id) { return wordById[id] || null; }
  function getGrammar(id) { return getItem('grammar', id); }
  // その級の中での番号（1から）。単語リストの左の数字と同じ
  function wordPosition(id) { return wordPos[id] || 0; }

  function wordsOfLevel(key) { return (wordsByLevel[key] || []).slice(); }
  function wordCount(key) { return (wordsByLevel[key] || []).length; }
  function totalWordCount() {
    return WORD_LEVELS.reduce(function (n, lv) { return n + wordCount(lv.key); }, 0);
  }

  // 文法用の呼び名（ver1.1 までと同じ。中身は文法・数学に共通の関数）
  function grammarItems(unit, level) { return itemsOf('grammar', unit, level); }
  function grammarCount(unit, level) { return countOf('grammar', unit, level); }
  function grammarCountOfUnit(unit) { return countOfUnit('grammar', unit); }
  function grammarCountOfLevel(level) { return countOfLevel('grammar', level); }
  function totalGrammarCount() { return totalOf('grammar'); }
  function totalMathCount() { return totalOf('math'); }

  // 「順番どおり」の範囲の一覧（1〜50、51〜100、…）
  function rangeList(level) {
    var n = wordCount(level);
    var out = [];
    for (var s = 0, i = 0; s < n; s += RANGE_SIZE, i++) {
      var to = Math.min(n, s + RANGE_SIZE);
      out.push({ index: i, from: s + 1, to: to, count: to - s });
    }
    return out;
  }

  // 単語の配列に含まれる品詞と、その語数
  function posCounts(list) {
    var c = {};
    list.forEach(function (w) { c[w.pos] = (c[w.pos] || 0) + 1; });
    return POS_ORDER.filter(function (p) { return c[p]; }).map(function (p) {
      return { pos: p, label: POS_LABEL[p], count: c[p] };
    });
  }

  // ---------- 並べ替え ----------
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function sortIds(ids, orderMap, byId) {
    return ids.filter(function (id) { return byId[id]; }).sort(function (a, b) {
      return orderMap[a] - orderMap[b];
    });
  }

  // 級（5→4→3→準2）→ データ順
  function sortWordIds(ids) { return sortIds(ids, wordOrder, wordById); }
  // 単元 → レベル → データ順（domain は 'grammar' か 'math'）
  function sortUnitIds(domain, ids) {
    var b = bankOf(domain);
    return sortIds(ids, b.order, b.byId);
  }
  function sortGrammarIds(ids) { return sortUnitIds('grammar', ids); }

  // ---------- 単語の選択肢づくり ----------
  // 意味は「、」などで区切った言葉のならび。ひとつでも同じ言葉があれば「同じ意味」とみなす。
  function meaningTokens(meaning) {
    return String(meaning).split(/[、,，;；]/).map(function (t) { return t.trim(); }).filter(function (t) { return t; });
  }

  function shareToken(a, b) {
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) return true;
    return false;
  }

  function isCapitalized(word) {
    return /^[A-Z]/.test(word);
  }

  // 間違いの選択肢を3つ選ぶ。
  // 優先順：同じ級・同じ品詞 → 同じ級の他の品詞。正解と同じ意味・同じ単語は入れない。
  // （曜日などの大文字の単語は、大文字どうしでそろえて「大文字だから違う」とわからないようにする）
  function pickWordDistractors(target, direction, correctText) {
    var tTokens = meaningTokens(target.meaning);
    var tWord = target.word.toLowerCase();
    var tCap = isCapitalized(target.word);
    var key = correctText.toLowerCase();

    function textOf(c) { return (direction === 'ja2en' ? c.word : c.meaning).toLowerCase(); }
    function allowed(c) {
      return c.id !== target.id && c.word.toLowerCase() !== tWord &&
        !shareToken(meaningTokens(c.meaning), tTokens) && textOf(c) !== key;
    }

    function candidatesFrom(pool) {
      var groups = [[], [], [], []];
      pool.filter(allowed).forEach(function (c) {
        var samePos = c.pos === target.pos;
        var sameCap = isCapitalized(c.word) === tCap;
        groups[(samePos ? 0 : 2) + (sameCap ? 0 : 1)].push(c);
      });
      var out = [];
      groups.forEach(function (g) { out = out.concat(shuffle(g)); });
      return out;
    }

    var result = { picks: [], relaxed: false, crossLevel: false };
    var sameLevel = candidatesFrom(wordsByLevel[target.level] || []);

    function overlapsPicked(c) {
      var t = meaningTokens(c.meaning);
      return result.picks.some(function (p) { return shareToken(meaningTokens(p.meaning), t); });
    }
    function sameTextPicked(c) {
      return result.picks.some(function (p) { return textOf(p) === textOf(c); });
    }

    var i, c;
    // 1回目：選択肢どうしも、意味が重ならないようにする
    for (i = 0; i < sameLevel.length && result.picks.length < 3; i++) {
      c = sameLevel[i];
      if (!sameTextPicked(c) && !overlapsPicked(c)) result.picks.push(c);
    }
    // 2回目（足りないとき）：意味の重なりは許す。同じ文字の選択肢だけは避ける
    for (i = 0; i < sameLevel.length && result.picks.length < 3; i++) {
      c = sameLevel[i];
      if (result.picks.indexOf(c) < 0 && !sameTextPicked(c)) {
        result.picks.push(c);
        result.relaxed = true;
      }
    }
    // 3回目（仮データなどで、同じ級の単語が少ないとき）：他の級から補う
    if (result.picks.length < 3) {
      var others = [];
      WORD_LEVELS.forEach(function (lv) {
        if (lv.key !== target.level) others = others.concat(wordsByLevel[lv.key] || []);
      });
      var more = candidatesFrom(others);
      for (i = 0; i < more.length && result.picks.length < 3; i++) {
        c = more[i];
        if (!sameTextPicked(c)) {
          result.picks.push(c);
          result.crossLevel = true;
        }
      }
    }
    return result;
  }

  function correctIndexOf(options) {
    for (var i = 0; i < options.length; i++) if (options[i].correct) return i;
    return -1;
  }

  // 単語の問題をつくる。direction: 'en2ja'（英語→日本語）/ 'ja2en'（日本語→英語）
  function buildWordQuestion(word, direction) {
    direction = direction === 'ja2en' ? 'ja2en' : 'en2ja';
    var toEnglish = direction === 'ja2en';
    var correctText = toEnglish ? word.word : word.meaning;
    var d = pickWordDistractors(word, direction, correctText);
    var options = [{ text: correctText, correct: true, wordId: word.id }];
    d.picks.forEach(function (c) {
      options.push({ text: toEnglish ? c.word : c.meaning, correct: false, wordId: c.id });
    });
    options = shuffle(options); // 正解の位置は毎回ランダム
    return {
      kind: 'word',
      id: word.id,
      direction: direction,
      prompt: toEnglish ? word.meaning : word.word,
      posLabel: POS_LABEL[word.pos] || '',
      options: options,
      correctIndex: correctIndexOf(options),
      item: word,
      relaxed: d.relaxed,
      crossLevel: d.crossLevel
    };
  }

  // 文法・数学の問題をつくる（選択肢の順番をシャッフル）。domain は 'grammar' か 'math'
  function buildUnitQuestion(domain, g) {
    var order = [];
    for (var i = 0; i < g.choices.length; i++) order.push(i);
    order = shuffle(order);
    var options = order.map(function (i) {
      return { text: g.choices[i], correct: i === g.answer };
    });
    return {
      kind: domain,
      id: g.id,
      prompt: g.question,
      options: options,
      correctIndex: correctIndexOf(options),
      item: g
    };
  }

  function buildGrammarQuestion(g) { return buildUnitQuestion('grammar', g); }
  function buildMathQuestion(g) { return buildUnitQuestion('math', g); }

  // ---------- 出題する問題の選び方 ----------
  function countLimit(count) {
    if (count === undefined || count === null || count === 'all') return Infinity;
    var n = Number(count);
    return n > 0 ? n : Infinity;
  }

  function idsOf(list) {
    return list.map(function (x) { return x.id; });
  }

  function selectWordIds(config, listIds) {
    var ids, pool;

    if (config.source === 'retry') {
      return (config.ids || []).filter(function (id) { return wordById[id]; });
    }

    if (config.source === 'list') {
      ids = sortWordIds(listIds || []);
      if (config.lf && config.lf !== 'all') {
        ids = ids.filter(function (id) { return wordById[id].level === config.lf; });
      }
      if (config.mode === 'pos') {
        ids = shuffle(ids.filter(function (id) { return wordById[id].pos === config.pos; }));
      } else if (config.mode === 'random') {
        ids = shuffle(ids);
      }
      return ids;
    }

    pool = wordsByLevel[config.level] || [];
    if (config.mode === 'range') {
      // 番号で選んだ範囲（from〜to、どちらも含む）。shuffle が true なら並べ替える
      var from = Math.max(1, Math.floor(Number(config.from)) || 1);
      var to = Math.min(pool.length, Math.floor(Number(config.to)) || pool.length);
      var span = idsOf(pool.slice(from - 1, Math.max(from - 1, to)));
      return config.shuffle ? shuffle(span) : span;
    }
    if (config.mode === 'order') {
      var start = (Number(config.range) || 0) * RANGE_SIZE;
      // 範囲（最大50語）のはじめから、指定の数だけ
      return idsOf(pool.slice(start, start + RANGE_SIZE)).slice(0, countLimit(config.count));
    }
    if (config.mode === 'pos') {
      pool = pool.filter(function (w) { return w.pos === config.pos; });
    }
    return idsOf(shuffle(pool)).slice(0, countLimit(config.count));
  }

  // 文法・数学の出題。domain は config.domain（'grammar' か 'math'）
  function selectUnitIds(config, listIds) {
    var domain = config.domain;
    var b = bankOf(domain);
    var ids, pool;

    if (config.source === 'retry') {
      return (config.ids || []).filter(function (id) { return b.byId[id]; });
    }

    if (config.source === 'list') {
      ids = sortUnitIds(domain, listIds || []);
      if (config.mode === 'unit') {
        ids = shuffle(ids.filter(function (id) { return b.byId[id].unit === Number(config.unit); }));
      } else if (config.mode === 'random') {
        ids = shuffle(ids);
      }
      return ids;
    }

    if (config.source === 'practice') {
      // 選んだレベルの全単元から。shuffle してから切るので、同じ問題は出ない
      pool = b.all.filter(function (g) { return g.level === config.level; });
      return idsOf(shuffle(pool)).slice(0, countLimit(config.count));
    }

    pool = itemsOf(domain, Number(config.unit), config.level);
    if (config.mode === 'random') pool = shuffle(pool);
    return idsOf(pool);
  }

  function selectIds(config, listIds) {
    return config.domain === 'words' ? selectWordIds(config, listIds) : selectUnitIds(config, listIds);
  }

  // ---------- 1回分のクイズ ----------
  function Session(config, ids) {
    this.config = config;
    this.domain = config.domain;
    this.ids = ids.slice();
    this.index = 0;
    this.results = []; // { id, correct, chosen }
    this.answered = false;
    this.chosen = -1;
    this.notice = '';  // 答えた後に出す、間違いリストについての一言
    this._question = null;
  }

  Session.prototype.total = function () { return this.ids.length; };
  Session.prototype.isLast = function () { return this.index >= this.ids.length - 1; };

  // 今の問題（同じ問題の間は、同じ選択肢の並びを返す）
  Session.prototype.question = function () {
    if (!this._question) {
      var id = this.ids[this.index];
      this._question = this.domain === 'words'
        ? buildWordQuestion(wordById[id], this.config.direction)
        : buildUnitQuestion(this.domain, bankOf(this.domain).byId[id]);
    }
    return this._question;
  };

  // 採点する。戻り値：{ correct } ／ すでに答えていれば null
  Session.prototype.answer = function (choiceIndex) {
    if (this.answered) return null;
    var q = this.question();
    var correct = choiceIndex === q.correctIndex;
    this.answered = true;
    this.chosen = choiceIndex;
    this.results.push({ id: q.id, correct: correct, chosen: choiceIndex });
    return { correct: correct };
  };

  // 次の問題へ。まだ問題があれば true
  Session.prototype.next = function () {
    if (!this.answered) return false;
    this.index += 1;
    this.answered = false;
    this.chosen = -1;
    this.notice = '';
    this._question = null;
    return this.index < this.ids.length;
  };

  Session.prototype.summary = function () {
    var correct = this.results.filter(function (r) { return r.correct; }).length;
    var answered = this.results.length;
    return {
      answered: answered,
      correct: correct,
      percent: answered ? Math.round(correct / answered * 100) : 0,
      wrongIds: this.results.filter(function (r) { return !r.correct; }).map(function (r) { return r.id; })
    };
  };

  // 途中のクイズを保存するための形（storage の resume と同じ）。results の数＝答えた数
  Session.prototype.snapshot = function () {
    return {
      v: 1,
      config: this.config,
      ids: this.ids.slice(),
      results: this.results.map(function (r) { return [r.id, r.correct ? 1 : 0]; })
    };
  };

  function createSession(config, ids) {
    return new Session(config, ids);
  }

  // 保存した途中のクイズから、続きを解ける Session をつくる。
  // データから消えた問題はとばす。続きの問題が1つもなければ null
  function restoreSession(snap) {
    if (!snap || !snap.config || !Array.isArray(snap.ids) || !Array.isArray(snap.results)) return null;
    var exists = UNIT_DOMAINS.indexOf(snap.config.domain) >= 0 ? bankOf(snap.config.domain).byId : wordById;
    var answered = [];
    snap.results.forEach(function (r) {
      if (exists[r[0]]) answered.push({ id: r[0], correct: !!r[1], chosen: -1 });
    });
    var rest = snap.ids.slice(snap.results.length).filter(function (id) { return exists[id]; });
    if (rest.length === 0) return null;
    var s = new Session(snap.config, answered.map(function (r) { return r.id; }).concat(rest));
    s.results = answered;
    s.index = answered.length;
    return s;
  }

  init();

  global.EIQQuiz = {
    RANGE_SIZE: RANGE_SIZE,
    POS_LABEL: POS_LABEL,
    POS_ORDER: POS_ORDER,
    WORD_LEVELS: WORD_LEVELS,
    GRAMMAR_LEVELS: GRAMMAR_LEVELS,
    GRAMMAR_UNITS: GRAMMAR_UNITS,
    MATH_UNITS: MATH_UNITS,
    MATH_GRADES: MATH_GRADES,
    UNIT_DOMAINS: UNIT_DOMAINS,
    init: init,
    levelLabel: levelLabel,
    gradeLabel: gradeLabel,
    unitName: unitName,
    getWord: getWord,
    getGrammar: getGrammar,
    wordPosition: wordPosition,
    wordsOfLevel: wordsOfLevel,
    wordCount: wordCount,
    totalWordCount: totalWordCount,
    grammarItems: grammarItems,
    grammarCount: grammarCount,
    grammarCountOfUnit: grammarCountOfUnit,
    grammarCountOfLevel: grammarCountOfLevel,
    totalGrammarCount: totalGrammarCount,
    totalMathCount: totalMathCount,
    // 文法・数学に共通（domain は 'grammar' か 'math'）
    unitsOf: unitsOf,
    unitNameOf: unitNameOf,
    unitGradeOf: unitGradeOf,
    getItem: getItem,
    itemsOf: itemsOf,
    countOf: countOf,
    countOfUnit: countOfUnit,
    countOfLevel: countOfLevel,
    totalOf: totalOf,
    sortUnitIds: sortUnitIds,
    buildUnitQuestion: buildUnitQuestion,
    rangeList: rangeList,
    posCounts: posCounts,
    shuffle: shuffle,
    sortWordIds: sortWordIds,
    sortGrammarIds: sortGrammarIds,
    meaningTokens: meaningTokens,
    shareToken: shareToken,
    buildWordQuestion: buildWordQuestion,
    buildGrammarQuestion: buildGrammarQuestion,
    buildMathQuestion: buildMathQuestion,
    selectIds: selectIds,
    createSession: createSession,
    restoreSession: restoreSession
  };
})(window);
