/* quiz.js
 * 出題・採点・選択肢づくり。画面（DOM）には触らない。
 *
 * 出題条件（config）の形：
 *   単語  { domain:'words', source:'level', level:'5', mode:'order'|'pos'|'random',
 *           range:0, pos:'noun', direction:'en2ja'|'ja2en', count:10|20|'all' }
 *         { domain:'words', source:'list', tab:'wrong'|'bookmark'|'both', lf:'all'|'5'|..,
 *           mode:'order'|'pos'|'random', pos:'noun', direction:'en2ja'|'ja2en' }
 *   文法  { domain:'grammar', source:'unit', unit:1, level:'normal', mode:'order'|'random' }
 *         { domain:'grammar', source:'practice', level:'normal', count:10|20|30 }
 *         { domain:'grammar', source:'list', tab:.., mode:'order'|'unit'|'random', unit:1 }
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

  // ---------- データの索引 ----------
  var wordById = {};
  var wordOrder = {};      // id -> 並び順（級 → データ順）
  var wordsByLevel = {};   // 級 -> 単語の配列（データ順＝やさしい順）
  var grammarById = {};
  var grammarOrder = {};   // id -> 並び順（単元 → レベル → データ順）
  var grammarBy = {};      // 'unit/level' -> 問題の配列（データ順）
  var grammarAll = [];

  function wordLevelRank(key) {
    for (var i = 0; i < WORD_LEVELS.length; i++) if (WORD_LEVELS[i].key === key) return i;
    return -1;
  }

  function grammarLevelRank(key) {
    for (var i = 0; i < GRAMMAR_LEVELS.length; i++) if (GRAMMAR_LEVELS[i].key === key) return i;
    return -1;
  }

  function init() {
    var words = global.WORDS || [];
    var grammar = global.GRAMMAR || [];
    wordById = {};
    wordOrder = {};
    wordsByLevel = {};
    grammarById = {};
    grammarOrder = {};
    grammarBy = {};
    grammarAll = [];

    WORD_LEVELS.forEach(function (lv) { wordsByLevel[lv.key] = []; });
    words.forEach(function (w) {
      var rank = wordLevelRank(w.level);
      if (rank < 0) return;
      wordById[w.id] = w;
      wordsByLevel[w.level].push(w);
      wordOrder[w.id] = rank * 1e6 + wordsByLevel[w.level].length;
    });

    grammar.forEach(function (g) {
      var rank = grammarLevelRank(g.level);
      if (rank < 0 || !(g.unit >= 1 && g.unit <= GRAMMAR_UNITS.length)) return;
      var k = g.unit + '/' + g.level;
      if (!grammarBy[k]) grammarBy[k] = [];
      grammarBy[k].push(g);
      grammarById[g.id] = g;
      grammarAll.push(g);
      grammarOrder[g.id] = g.unit * 1e6 + rank * 1e4 + grammarBy[k].length;
    });
  }

  // ---------- 名前・件数 ----------
  function levelLabel(key) {
    var i = wordLevelRank(key);
    return i < 0 ? String(key) : WORD_LEVELS[i].label;
  }

  function gradeLabel(key) {
    var i = grammarLevelRank(key);
    return i < 0 ? String(key) : GRAMMAR_LEVELS[i].label;
  }

  function unitName(n) {
    return GRAMMAR_UNITS[n - 1] || '';
  }

  function getWord(id) { return wordById[id] || null; }
  function getGrammar(id) { return grammarById[id] || null; }

  function wordsOfLevel(key) { return (wordsByLevel[key] || []).slice(); }
  function wordCount(key) { return (wordsByLevel[key] || []).length; }
  function totalWordCount() {
    return WORD_LEVELS.reduce(function (n, lv) { return n + wordCount(lv.key); }, 0);
  }

  function grammarItems(unit, level) { return (grammarBy[unit + '/' + level] || []).slice(); }
  function grammarCount(unit, level) { return (grammarBy[unit + '/' + level] || []).length; }
  function grammarCountOfUnit(unit) {
    return GRAMMAR_LEVELS.reduce(function (n, lv) { return n + grammarCount(unit, lv.key); }, 0);
  }
  function grammarCountOfLevel(level) {
    var n = 0;
    for (var u = 1; u <= GRAMMAR_UNITS.length; u++) n += grammarCount(u, level);
    return n;
  }
  function totalGrammarCount() { return grammarAll.length; }

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
  // 単元 → レベル → データ順
  function sortGrammarIds(ids) { return sortIds(ids, grammarOrder, grammarById); }

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

  // 文法の問題をつくる（選択肢の順番をシャッフル）
  function buildGrammarQuestion(g) {
    var order = [];
    for (var i = 0; i < g.choices.length; i++) order.push(i);
    order = shuffle(order);
    var options = order.map(function (i) {
      return { text: g.choices[i], correct: i === g.answer };
    });
    return {
      kind: 'grammar',
      id: g.id,
      prompt: g.question,
      options: options,
      correctIndex: correctIndexOf(options),
      item: g
    };
  }

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

  function selectGrammarIds(config, listIds) {
    var ids, pool;

    if (config.source === 'retry') {
      return (config.ids || []).filter(function (id) { return grammarById[id]; });
    }

    if (config.source === 'list') {
      ids = sortGrammarIds(listIds || []);
      if (config.mode === 'unit') {
        ids = shuffle(ids.filter(function (id) { return grammarById[id].unit === Number(config.unit); }));
      } else if (config.mode === 'random') {
        ids = shuffle(ids);
      }
      return ids;
    }

    if (config.source === 'practice') {
      // 選んだレベルの全単元から。shuffle してから切るので、同じ問題は出ない
      pool = grammarAll.filter(function (g) { return g.level === config.level; });
      return idsOf(shuffle(pool)).slice(0, countLimit(config.count));
    }

    pool = grammarItems(Number(config.unit), config.level);
    if (config.mode === 'random') pool = shuffle(pool);
    return idsOf(pool);
  }

  function selectIds(config, listIds) {
    return config.domain === 'grammar' ? selectGrammarIds(config, listIds) : selectWordIds(config, listIds);
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
      this._question = this.domain === 'grammar'
        ? buildGrammarQuestion(grammarById[id])
        : buildWordQuestion(wordById[id], this.config.direction);
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

  function createSession(config, ids) {
    return new Session(config, ids);
  }

  init();

  global.EIQQuiz = {
    RANGE_SIZE: RANGE_SIZE,
    POS_LABEL: POS_LABEL,
    POS_ORDER: POS_ORDER,
    WORD_LEVELS: WORD_LEVELS,
    GRAMMAR_LEVELS: GRAMMAR_LEVELS,
    GRAMMAR_UNITS: GRAMMAR_UNITS,
    init: init,
    levelLabel: levelLabel,
    gradeLabel: gradeLabel,
    unitName: unitName,
    getWord: getWord,
    getGrammar: getGrammar,
    wordsOfLevel: wordsOfLevel,
    wordCount: wordCount,
    totalWordCount: totalWordCount,
    grammarItems: grammarItems,
    grammarCount: grammarCount,
    grammarCountOfUnit: grammarCountOfUnit,
    grammarCountOfLevel: grammarCountOfLevel,
    totalGrammarCount: totalGrammarCount,
    rangeList: rangeList,
    posCounts: posCounts,
    shuffle: shuffle,
    sortWordIds: sortWordIds,
    sortGrammarIds: sortGrammarIds,
    meaningTokens: meaningTokens,
    shareToken: shareToken,
    buildWordQuestion: buildWordQuestion,
    buildGrammarQuestion: buildGrammarQuestion,
    selectIds: selectIds,
    createSession: createSession
  };
})(window);
