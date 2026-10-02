/* app.js（ver1.1）
 * 画面の切り替え・全体の管理。
 * 画面は state.screen の名前で決まり、render() が #app の中身を作り直す。
 * 画面どうしの引き継ぎ（選んだ級や解き方）は params に入れて運ぶ。
 *
 * ver1.1 で追加したもの：
 *   ① 級を選んだあとの「解き方」の画面の下に、その級の単語リスト（番号つき）を表示
 *   ② 単語問題に「前回の途中から始める」
 *   ③ 番号で範囲（何番から何番まで）を選んで解く
 */
(function () {
  'use strict';

  var APP_VERSION = '1.1';
  var Store = window.EIQStorage;
  var Quiz = window.EIQQuiz;
  var root = document.getElementById('app');

  // ---------- 状態 ----------
  var state = {
    screen: 'top',
    params: {},
    stack: [],      // 「戻る」で戻る先 [{ screen, params }]
    session: null   // 今のクイズ
  };

  // 画面ごとの色（単語＝青、文法＝紫）
  var DOMAIN_OF = {
    wordsTop: 'words', wordsMode: 'words', wordsRange: 'words', wordsPos: 'words',
    wordsDirection: 'words', wordsCount: 'words', wordsList: 'words',
    grammarTop: 'grammar', gUnits: 'grammar', gUnitLevel: 'grammar', gUnitMode: 'grammar',
    gPracticeLevel: 'grammar', gPracticeCount: 'grammar', grammarList: 'grammar',
    gListMode: 'grammar', gListUnit: 'grammar'
  };

  // ---------- 小さな道具 ----------
  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }

  function merge(a, b) {
    return Object.assign({}, a, b);
  }

  // o から keys に挙げたものを除いたコピー
  function omit(o, keys) {
    var out = {};
    Object.keys(o).forEach(function (k) {
      if (keys.indexOf(k) < 0) out[k] = o[k];
    });
    return out;
  }

  function en(text) {
    return '<span lang="en">' + esc(text) + '</span>';
  }

  // ボタンのHTML。label はHTML（呼ぶ側で esc する）
  function btn(label, o) {
    o = o || {};
    var a = ['type="button"', 'class="' + (o.cls || 'btn') + '"'];
    if (o.act) a.push('data-act="' + o.act + '"');
    if (o.to) a.push('data-to="' + o.to + '"');
    if (o.set) a.push('data-set="' + esc(JSON.stringify(o.set)) + '"');
    if (o.data) {
      Object.keys(o.data).forEach(function (k) { a.push('data-' + k + '="' + esc(o.data[k]) + '"'); });
    }
    if (o.attr) a.push(o.attr);
    if (o.disabled) a.push('disabled');
    return '<button ' + a.join(' ') + '>' + label + '</button>';
  }

  // 大きなメニューボタン。to があれば次の画面へ、act: 'start' ならクイズ開始
  // sub の中の改行（\n）は、そのまま改行して表示する
  function menuBtn(o) {
    var inner = '<span class="menu-text"><span class="menu-main">' + esc(o.label) + '</span>' +
      (o.sub ? '<span class="menu-sub">' + esc(o.sub) + '</span>' : '') + '</span>' +
      '<span class="menu-arrow" aria-hidden="true">›</span>';
    return btn(inner, {
      cls: 'menu-btn' + (o.kind ? ' kind-' + o.kind : ''),
      act: o.act || 'go',
      to: o.to,
      set: o.set,
      disabled: o.disabled
    });
  }

  // 戻るボタン付きの画面
  function page(title, body) {
    return '<header class="topbar">' + btn('← 戻る', { cls: 'btn-back', act: 'back' }) +
      '<h1>' + esc(title) + '</h1></header><main class="screen">' + body + '</main>';
  }

  function menu(items) {
    return '<div class="menu">' + items.join('') + '</div>';
  }

  var toastTimer = null;
  function toast(message) {
    var t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 2600);
  }

  // ---------- 画面の移動 ----------
  function go(screen, params) {
    state.stack.push({ screen: state.screen, params: state.params });
    state.screen = screen;
    state.params = params || {};
    render();
  }

  function back() {
    var prev = state.stack.pop();
    if (prev) {
      state.screen = prev.screen;
      state.params = prev.params;
    } else {
      state.screen = 'top';
      state.params = {};
    }
    render();
  }

  // 今の画面のまま、params だけ変える（タブ・絞り込みの切り替え用）
  function setParams(delta) {
    state.params = merge(state.params, delta);
    render(true);
  }

  function themeClass() {
    var d = DOMAIN_OF[state.screen];
    if ((state.screen === 'quiz' || state.screen === 'result') && state.session) d = state.session.domain;
    return d ? 'theme-' + d : '';
  }

  function render(keepScroll) {
    var html;
    var fn = screens[state.screen] || screens.top;
    try {
      html = fn(state.params);
    } catch (e) {
      if (window.console) console.error(e);
      html = '<main class="screen"><p class="notice">画面を表示できませんでした。ページを読み込み直してください。</p></main>';
    }
    var theme = themeClass();
    root.className = 'app' + (theme ? ' ' + theme : '');
    root.innerHTML = html;
    if (!keepScroll) window.scrollTo(0, 0);
    if (state.screen === 'wordsMode' && state.params.source === 'level') {
      pickFirst = null;
      refreshRange();
    }
  }

  // ---------- 件数・一覧の下ごしらえ ----------
  function listIdsFor(domain, p) {
    var raw = Store.listIds(domain, p.tab || 'wrong');
    if (domain === 'words') {
      var ids = Quiz.sortWordIds(raw);
      if (p.lf && p.lf !== 'all') {
        ids = ids.filter(function (id) { return Quiz.getWord(id).level === p.lf; });
      }
      return ids;
    }
    return Quiz.sortGrammarIds(raw);
  }

  function existingCount(domain, tab) {
    var raw = Store.listIds(domain, tab);
    return (domain === 'words' ? Quiz.sortWordIds(raw) : Quiz.sortGrammarIds(raw)).length;
  }

  // 解き方・品詞・向きの画面で使う、単語の元になる集まり
  function wordPool(p) {
    if (p.source === 'list') return listIdsFor('words', p).map(Quiz.getWord);
    return Quiz.wordsOfLevel(p.level);
  }

  function listSummary(domain) {
    return '間違い ' + existingCount(domain, 'wrong') + '件 ・ ★ ' + existingCount(domain, 'bookmark') + '件';
  }

  function statLine(domain, id) {
    var st = Store.getStats(domain, id);
    return '<div class="item-stat">正解' + st.correct + '回 ・ 不正解' + st.wrong + '回</div>';
  }

  // 文法の問題文。空所 ( ) は目立たせ、fill があれば正解を入れる
  function questionHtml(text, fill) {
    var blank = /\(\s*\)/;
    var html = esc(text);
    if (fill !== null && fill !== undefined) {
      html = html.replace(blank, function () { return '<span class="filled">' + esc(fill) + '</span>'; });
    }
    return html.replace(/\(\s*\)/g, '<span class="blank">(　　　)</span>');
  }

  // ---------- 「前回の途中から始める」 ----------
  function dirLabel(d) {
    return d === 'ja2en' ? '日本語→英語' : '英語→日本語';
  }

  // 出題条件を、「何を」と「向き」の2つの短い言葉で言い表す
  function describeConfig(c) {
    var parts = [];
    if (c.source === 'retry') {
      parts.push('間違えた単語のやり直し');
    } else if (c.source === 'list') {
      parts.push('リスト（' + ({ wrong: '間違い', bookmark: 'ブックマーク', both: '両方まとめ' }[c.tab] || '') + '）');
    } else {
      parts.push(Quiz.levelLabel(c.level));
      if (c.mode === 'order') {
        var r = Quiz.rangeList(c.level)[Number(c.range) || 0];
        parts.push('順番どおり' + (r ? ' ' + r.from + '〜' + r.to : ''));
      } else if (c.mode === 'pos') {
        parts.push('品詞ごと（' + (Quiz.POS_LABEL[c.pos] || '') + '）');
      } else if (c.mode === 'range') {
        parts.push('番号 ' + c.from + '〜' + c.to + (c.shuffle ? '（シャッフル）' : ''));
      } else {
        parts.push('ランダム');
      }
    }
    return { what: parts.join(' ・ '), dir: dirLabel(c.direction) };
  }

  // 「前回の途中から始める」で何が始まるか。
  //   1. 解いている途中のクイズがあれば、その続き
  //   2. なければ、順番どおりに進めていた単語の「前回の続き」の範囲
  //   3. どちらもなければ null
  function resumeInfo() {
    var snap = Store.getResume('words');
    var s = snap ? Quiz.restoreSession(snap) : null;
    if (s) {
      var d = describeConfig(s.config);
      return {
        kind: 'session',
        session: s,
        label: d.what + '\n' + d.dir,
        detail: (s.index + 1) + '問目から（全' + s.total() + '問）'
      };
    }
    var cur = Store.getCursor('words');
    if (cur) {
      var n = Quiz.wordCount(cur.level);
      if (n > 0 && cur.pos < n) {
        var from = cur.pos + 1;
        var to = Math.min(n, cur.pos + cur.size);
        return {
          kind: 'next',
          config: {
            domain: 'words', source: 'level', level: cur.level, mode: 'range',
            from: from, to: to, shuffle: false, direction: cur.direction
          },
          label: Quiz.levelLabel(cur.level) + '\n' + dirLabel(cur.direction),
          detail: '前回の続き：' + from + '〜' + to + '番（' + (to - from + 1) + '問）'
        };
      }
    }
    return null;
  }

  // ---------- 画面 ----------
  var screens = {};

  screens.top = function () {
    var warn = Store.isPersistent() ? '' :
      '<p class="notice">この環境では学習記録を保存できません。ページを閉じると、記録は消えます。</p>';
    var noData = Quiz.totalWordCount() + Quiz.totalGrammarCount() === 0 ?
      '<p class="notice">問題データを読み込めませんでした。</p>' : '';
    return '<main class="screen">' +
      '<h1 class="app-title">中学英語クイズ</h1>' +
      '<p class="lead">単語と文法を、4択で練習しよう。</p>' + warn + noData +
      menu([
        menuBtn({ label: '単語問題', sub: '英検5級〜準2級の単語', to: 'wordsTop', kind: 'words' }),
        menuBtn({ label: '文法問題', sub: '20単元・3レベル', to: 'grammarTop', kind: 'grammar' }),
        menuBtn({ label: '設定', sub: '記録を消す・このアプリについて', to: 'settings' })
      ]) + '</main>';
  };

  screens.settings = function () {
    var warn = Store.isPersistent() ? '' :
      '<p class="notice">この環境では学習記録を保存できません。</p>';
    return page('設定',
      '<section class="card"><h2>学習記録</h2>' +
      '<p>間違いリスト・ブックマーク・成績を、すべて消します。</p>' + warn +
      btn('学習記録をすべて消す', { cls: 'btn-danger', act: 'reset-all' }) + '</section>' +
      '<section class="card"><h2>このアプリについて</h2>' +
      '<p>中学生向けの、英語の4択クイズです。単語問題と文法問題があります。</p>' +
      '<p>単語は英検の出題傾向をもとに選んだもので、英検の公式リストではありません。</p>' +
      '<p>学習記録は、このブラウザの中だけに保存されます。</p>' +
      '<p class="muted">収録：単語 ' + Quiz.totalWordCount() + '語 ／ 文法 ' + Quiz.totalGrammarCount() + '問</p>' +
      '<p class="muted">バージョン ' + APP_VERSION + '</p></section>');
  };

  // ----- 単語 -----
  screens.wordsTop = function () {
    var info = resumeInfo();
    return page('単語問題',
      menu([menuBtn({
        label: '前回の途中から始める',
        sub: info ? info.label + '\n' + info.detail : '途中でやめた問題や、前回の続きがあるときに使えます。',
        act: 'resume-words', kind: 'resume', disabled: !info
      })]) +
      '<p class="lead">級を選んでください。</p>' +
      menu(Quiz.WORD_LEVELS.map(function (lv) {
        return menuBtn({
          label: lv.label, sub: Quiz.wordCount(lv.key) + '語', to: 'wordsMode',
          set: { domain: 'words', source: 'level', level: lv.key }, disabled: Quiz.wordCount(lv.key) === 0
        });
      })) +
      menu([menuBtn({
        label: 'リスト', sub: listSummary('words'), to: 'wordsList',
        set: { domain: 'words', tab: 'wrong', lf: 'all' }
      })]));
  };

  // ① 級の単語リスト（番号つき・やさしい順）。番号は、③の「何番から何番まで」と同じ
  function wordListHtml(level) {
    var list = Quiz.wordsOfLevel(level);
    var ranges = Quiz.rangeList(level);
    var jump = ranges.map(function (r) {
      return btn(r.from + '〜', { cls: 'chip', act: 'wl-jump', data: { i: r.index } });
    }).join('');
    var blocks = ranges.map(function (r) {
      var rows = list.slice(r.from - 1, r.to).map(function (w, k) {
        var no = r.from + k;
        return '<li class="wl-row" role="button" tabindex="0" data-act="wl-pick" data-n="' + no + '">' +
          '<span class="wl-no">' + no + '</span>' +
          '<span class="wl-main"><span class="wl-word">' + en(w.word) + '</span>' +
          '<span class="wl-pos">' + esc(Quiz.POS_LABEL[w.pos] || '') + '</span></span>' +
          '<span class="wl-meaning">' + esc(w.meaning) + '</span></li>';
      }).join('');
      return '<h3 class="wl-block" id="wl-b-' + r.index + '">' + r.from + '〜' + r.to + '</h3>' +
        '<ul class="wl-list">' + rows + '</ul>';
    }).join('');
    return '<section class="wl-section" aria-labelledby="wl-title">' +
      '<h2 class="wl-title" id="wl-title">' + esc(Quiz.levelLabel(level)) + 'の単語リスト（' + list.length + '語）</h2>' +
      '<p class="muted">やさしい順に並んでいます。左の数字が番号です。</p>' +
      '<div class="wl-jump" role="group" aria-label="リストの場所へ移動">' + jump + '</div>' +
      blocks + '</section>';
  }

  // ③ 番号で範囲を選ぶカード
  function rangeCardHtml(p) {
    var n = Quiz.wordCount(p.level);
    var rf = p.rf !== undefined ? p.rf : '1';
    var rt = p.rt !== undefined ? p.rt : String(Math.min(50, n));
    var rs = p.rs === 'random' ? 'random' : 'order';
    function field(id, label, value) {
      return '<label class="range-field"><span>' + label + '</span><span class="range-box">' +
        '<input class="range-input" id="' + id + '" type="number" inputmode="numeric" min="1" max="' + n + '" value="' + esc(value) + '">' +
        '<span class="range-unit">番</span></span></label>';
    }
    return '<section class="range-card" id="range-card" aria-labelledby="range-title">' +
      '<h2 id="range-title">番号で範囲を選ぶ</h2>' +
      '<p class="muted">解きたい単語の番号（下のリストの左の数字）を入れてください。リストの単語を2回タップして選ぶこともできます。</p>' +
      '<div class="range-inputs">' + field('rf', 'はじめ', rf) +
      '<span class="range-tilde" aria-hidden="true">〜</span>' + field('rt', 'おわり', rt) + '</div>' +
      '<p class="range-summary" id="range-summary" aria-live="polite"></p>' +
      '<p class="range-error" id="range-error" role="alert" hidden></p>' +
      '<p class="range-label" id="range-order-label">出題の順番</p>' +
      '<div class="chips cols-2" role="group" aria-labelledby="range-order-label">' +
      '<button type="button" class="chip" data-act="range-order" data-v="order" aria-pressed="' + (rs === 'order') + '">番号順</button>' +
      '<button type="button" class="chip" data-act="range-order" data-v="random" aria-pressed="' + (rs === 'random') + '">シャッフル</button></div>' +
      btn('この範囲で解く', { cls: 'btn-primary', act: 'range-go', attr: 'id="range-go"' }) + '</section>';
  }

  screens.wordsMode = function (p) {
    var isList = p.source === 'list';
    var next = { order: isList ? 'wordsDirection' : 'wordsRange', pos: 'wordsPos', random: 'wordsDirection' };
    var items = [
      { mode: 'order', label: '順番どおり', sub: isList ? '級（5級→準2級）→ やさしい順' : 'やさしい順に、50語ずつ' },
      { mode: 'pos', label: '品詞ごと', sub: '名詞・動詞など、品詞を選ぶ' },
      { mode: 'random', label: 'ランダム', sub: isList ? 'リストの単語をランダムに' : 'この級の全単語からランダムに' }
    ];
    return page(isList ? 'このリストで解く' : Quiz.levelLabel(p.level),
      '<p class="lead">解き方を選んでください。</p>' +
      menu(items.map(function (it) {
        return menuBtn({ label: it.label, sub: it.sub, to: next[it.mode], set: { mode: it.mode } });
      })) +
      (isList ? '' : rangeCardHtml(p) + wordListHtml(p.level)));
  };

  screens.wordsRange = function (p) {
    return page(Quiz.levelLabel(p.level) + ' 順番どおり',
      '<p class="lead">範囲を選んでください。</p>' +
      menu(Quiz.rangeList(p.level).map(function (r) {
        return menuBtn({
          label: r.from + '〜' + r.to, sub: r.count + '語', to: 'wordsDirection', set: { range: r.index }
        });
      })));
  };

  screens.wordsPos = function (p) {
    var counts = Quiz.posCounts(wordPool(p));
    return page('品詞を選ぶ',
      '<p class="lead">品詞を選んでください。</p>' +
      menu(counts.map(function (c) {
        return menuBtn({ label: c.label, sub: c.count + '語', to: 'wordsDirection', set: { pos: c.pos } });
      })));
  };

  screens.wordsDirection = function (p) {
    // リストと番号の範囲は、問題数を選ばず、向きを選んだらすぐ始める
    var direct = p.source === 'list' || p.mode === 'range';
    function dirBtn(direction, label, sub) {
      return menuBtn({
        label: label, sub: sub, act: direct ? 'start' : 'go', to: direct ? undefined : 'wordsCount',
        set: { direction: direction }
      });
    }
    var note = p.mode === 'range' ?
      '<p class="muted">範囲：' + p.from + '〜' + p.to + '番（' + (p.to - p.from + 1) + '語）・' + (p.shuffle ? 'シャッフル' : '番号順') + '</p>' : '';
    return page('出題の向き',
      '<p class="lead">出題の向きを選んでください。</p>' + note +
      menu([
        dirBtn('en2ja', '英語 → 日本語', '英語を見て、日本語の意味を選ぶ'),
        dirBtn('ja2en', '日本語 → 英語', '日本語の意味を見て、英語を選ぶ')
      ]));
  };

  // 今の選び方で、出題できる単語の数
  function availableWordCount(p) {
    if (p.mode === 'order') {
      var r = Quiz.rangeList(p.level)[Number(p.range) || 0];
      return r ? r.count : 0;
    }
    if (p.mode === 'pos') {
      return Quiz.wordsOfLevel(p.level).filter(function (w) { return w.pos === p.pos; }).length;
    }
    return Quiz.wordCount(p.level);
  }

  screens.wordsCount = function (p) {
    var n = availableWordCount(p);
    var items = [10, 20].filter(function (x) { return x < n; }).map(function (x) {
      return menuBtn({ label: x + '問', act: 'start', set: { count: x } });
    });
    items.push(menuBtn({
      label: '全部', sub: n + '問' + (p.mode === 'order' ? '（この範囲の全部）' : ''), act: 'start', set: { count: 'all' }
    }));
    return page('問題数',
      '<p class="lead">問題数を選んでください。</p>' +
      (p.mode === 'order' ? '<p class="muted">範囲のはじめから、順番に出します。</p>' : '') + menu(items));
  };

  // ----- 文法 -----
  screens.grammarTop = function () {
    return page('文法問題', menu([
      menuBtn({ label: '単元別モード', sub: '単元とレベルを選んで解く', to: 'gUnits', set: { domain: 'grammar', source: 'unit' } }),
      menuBtn({ label: '実践モード', sub: '全単元をまぜて、ランダムに出題', to: 'gPracticeLevel', set: { domain: 'grammar', source: 'practice' } }),
      menuBtn({ label: 'リスト', sub: listSummary('grammar'), to: 'grammarList', set: { domain: 'grammar', tab: 'wrong' } })
    ]));
  };

  screens.gUnits = function () {
    var items = [];
    for (var u = 1; u <= Quiz.GRAMMAR_UNITS.length; u++) {
      items.push(menuBtn({
        label: u + '. ' + Quiz.unitName(u), sub: Quiz.grammarCountOfUnit(u) + '問', to: 'gUnitLevel',
        set: { unit: u }, disabled: Quiz.grammarCountOfUnit(u) === 0
      }));
    }
    return page('単元を選ぶ', menu(items));
  };

  screens.gUnitLevel = function (p) {
    return page(p.unit + '. ' + Quiz.unitName(p.unit),
      '<p class="lead">レベルを選んでください。</p>' +
      menu(Quiz.GRAMMAR_LEVELS.map(function (lv) {
        var n = Quiz.grammarCount(p.unit, lv.key);
        return menuBtn({ label: lv.label, sub: n + '問', to: 'gUnitMode', set: { level: lv.key }, disabled: n === 0 });
      })));
  };

  screens.gUnitMode = function (p) {
    return page(p.unit + '. ' + Quiz.unitName(p.unit) + '（' + Quiz.gradeLabel(p.level) + '）',
      '<p class="lead">解き方を選んでください。</p>' +
      menu([
        menuBtn({ label: '順番どおり', sub: 'この単元・レベルの全問を、順番に', act: 'start', set: { mode: 'order' } }),
        menuBtn({ label: 'ランダム', sub: 'この単元・レベルの全問を、ランダムに', act: 'start', set: { mode: 'random' } })
      ]));
  };

  screens.gPracticeLevel = function () {
    return page('実践モード',
      '<p class="lead">レベルを選んでください。</p>' +
      menu(Quiz.GRAMMAR_LEVELS.map(function (lv) {
        var n = Quiz.grammarCountOfLevel(lv.key);
        return menuBtn({ label: lv.label, sub: '全単元から ' + n + '問', to: 'gPracticeCount', set: { level: lv.key }, disabled: n === 0 });
      })));
  };

  screens.gPracticeCount = function (p) {
    var n = Quiz.grammarCountOfLevel(p.level);
    var counts = [10, 20, 30].filter(function (x) { return x <= n; });
    if (counts.length === 0 && n > 0) counts = [n];
    return page('実践モード（' + Quiz.gradeLabel(p.level) + '）',
      '<p class="lead">問題数を選んでください。</p>' +
      menu(counts.map(function (x) {
        return menuBtn({ label: x + '問', act: 'start', set: { count: x } });
      })));
  };

  screens.gListMode = function () {
    return page('このリストで解く',
      '<p class="lead">解き方を選んでください。</p>' +
      menu([
        menuBtn({ label: '順番どおり', sub: '単元 → レベル → 問題の順', act: 'start', set: { mode: 'order' } }),
        menuBtn({ label: '単元ごと', sub: '単元を選んで解く', to: 'gListUnit', set: { mode: 'unit' } }),
        menuBtn({ label: 'ランダム', sub: 'リストの問題をランダムに', act: 'start', set: { mode: 'random' } })
      ]));
  };

  screens.gListUnit = function (p) {
    var count = {};
    listIdsFor('grammar', p).forEach(function (id) {
      var u = Quiz.getGrammar(id).unit;
      count[u] = (count[u] || 0) + 1;
    });
    var items = [];
    for (var u = 1; u <= Quiz.GRAMMAR_UNITS.length; u++) {
      if (count[u]) {
        items.push(menuBtn({ label: u + '. ' + Quiz.unitName(u), sub: count[u] + '問', act: 'start', set: { unit: u } }));
      }
    }
    return page('単元を選ぶ', '<p class="lead">単元を選んでください。</p>' + menu(items));
  };

  // ----- リスト（単語・文法）-----
  var TAB_LABEL = { wrong: '間違えたリスト', bookmark: 'ブックマークリスト', both: '両方まとめたリスト' };

  function removeButtons(domain, id, tab, isWrong, isMarked) {
    function b(label, kind) {
      return btn(label, { cls: 'btn-small', act: 'remove', data: { domain: domain, kind: kind, id: id } });
    }
    if (tab === 'wrong') return b('外す', 'wrong');
    if (tab === 'bookmark') return b('外す', 'bookmark');
    return (isWrong ? b('間違いから外す', 'wrong') : '') + (isMarked ? b('★を外す', 'bookmark') : '');
  }

  function itemTags(domain, id, tab) {
    if (tab !== 'both') return '';
    return (Store.isWrong(domain, id) ? '<span class="tag tag-wrong">間違い</span>' : '') +
      (Store.isBookmarked(domain, id) ? '<span class="tag tag-star">★</span>' : '');
  }

  function wordRow(id, tab) {
    var w = Quiz.getWord(id);
    return '<li class="item"><div class="item-main">' +
      '<div class="item-title"><span class="item-word">' + en(w.word) + '</span>' + itemTags('words', id, tab) + '</div>' +
      '<div class="item-meaning">' + esc(w.meaning) + '</div>' +
      '<div class="item-meta">' + esc(Quiz.POS_LABEL[w.pos] || '') + ' ・ ' + esc(Quiz.levelLabel(w.level)) + '</div>' +
      statLine('words', id) + '</div>' +
      '<div class="item-actions">' +
      removeButtons('words', id, tab, Store.isWrong('words', id), Store.isBookmarked('words', id)) + '</div></li>';
  }

  function grammarRow(id, tab) {
    var g = Quiz.getGrammar(id);
    return '<li class="item"><div class="item-main">' +
      '<div class="item-q">' + questionHtml(g.question, null) + '</div>' +
      '<div class="item-answer">正解：' + esc(g.choices[g.answer]) + '</div>' +
      '<div class="item-title">' + itemTags('grammar', id, tab) + '</div>' +
      '<div class="item-meta">' + esc(g.unit + '. ' + Quiz.unitName(g.unit)) + ' ・ ' + esc(Quiz.gradeLabel(g.level)) + '</div>' +
      statLine('grammar', id) + '</div>' +
      '<div class="item-actions">' +
      removeButtons('grammar', id, tab, Store.isWrong('grammar', id), Store.isBookmarked('grammar', id)) + '</div></li>';
  }

  function listScreen(domain, p) {
    var isWords = domain === 'words';
    var tab = p.tab || 'wrong';
    var ids = listIdsFor(domain, p);

    var tabs = [['wrong', '間違えた<br>リスト'], ['bookmark', 'ブックマーク<br>リスト'], ['both', '両方まとめた<br>リスト']]
      .map(function (t) {
        return '<button type="button" role="tab" class="tab" aria-selected="' + (tab === t[0]) +
          '" data-act="list-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('');

    var chips = '';
    if (isWords) {
      var lf = p.lf || 'all';
      chips = '<div class="chips" role="group" aria-label="級で絞り込む">' +
        [{ key: 'all', label: 'すべて' }].concat(Quiz.WORD_LEVELS).map(function (lv) {
          return '<button type="button" class="chip" aria-pressed="' + (lf === lv.key) +
            '" data-act="list-filter" data-lf="' + lv.key + '">' + esc(lv.label) + '</button>';
        }).join('') + '</div>';
    }

    var body = ids.length === 0 ?
      '<p class="empty">まだありません</p>' :
      '<ul class="items">' + ids.map(function (id) {
        return isWords ? wordRow(id, tab) : grammarRow(id, tab);
      }).join('') + '</ul>';

    return page(isWords ? '単語のリスト' : '文法のリスト',
      '<div class="tabs" role="tablist">' + tabs + '</div>' + chips +
      '<p class="count-line">' + TAB_LABEL[tab] + '：' + ids.length + '件</p>' +
      btn('このリストで解く', {
        cls: 'btn-primary', act: 'go', to: isWords ? 'wordsMode' : 'gListMode',
        set: { source: 'list' }, disabled: ids.length === 0
      }) + body);
  }

  screens.wordsList = function (p) { return listScreen('words', p); };
  screens.grammarList = function (p) { return listScreen('grammar', p); };

  // ----- 問題 -----
  function bookmarkInner(on) {
    return '<span class="star" aria-hidden="true">' + (on ? '★' : '☆') + '</span>' +
      '<span>' + (on ? 'ブックマーク中（もう一度押すと外す）' : 'ブックマークする') + '</span>';
  }

  function screenQuiz() {
    var s = state.session;
    var q = s.question();
    var total = s.total();
    var done = s.index + (s.answered ? 1 : 0);
    var correctText = q.options[q.correctIndex].text;
    var card, detail = '';

    if (q.kind === 'word') {
      var toEnglish = q.direction === 'ja2en';
      card = '<div class="qcard"><p class="q-label">' + (toEnglish ? 'この意味の英語は？' : 'この英語の意味は？') + '</p>' +
        '<div class="q-word' + (toEnglish ? ' is-ja' : '') + '">' + (toEnglish ? esc(q.prompt) : en(q.prompt)) + '</div>' +
        '<span class="pos-badge">' + esc(q.posLabel) + '</span></div>';
    } else {
      var g = q.item;
      card = '<div class="qcard"><p class="q-meta">' + esc(g.unit + '. ' + Quiz.unitName(g.unit) + ' ・ ' + Quiz.gradeLabel(g.level)) + '</p>' +
        '<p class="q-text">' + questionHtml(g.question, s.answered ? correctText : null) + '</p></div>';
    }

    var choices = q.options.map(function (o, i) {
      var cls = 'choice';
      var mark = String(i + 1);
      var hidden = '';
      if (s.answered) {
        if (i === q.correctIndex) { cls += ' is-correct'; mark = '○'; hidden = '（正解）'; }
        else if (i === s.chosen) { cls += ' is-wrong'; mark = '×'; hidden = '（あなたの答え・不正解）'; }
        else cls += ' is-dim';
      }
      var text = q.kind === 'word' && q.direction === 'ja2en' ? en(o.text) : esc(o.text);
      return '<button type="button" class="' + cls + '" data-act="choose" data-i="' + i + '"' + (s.answered ? ' disabled' : '') + '>' +
        '<span class="choice-no" aria-hidden="true">' + mark + '</span>' +
        '<span class="choice-text">' + text + '</span>' +
        (hidden ? '<span class="sr-only">' + hidden + '</span>' : '') + '</button>';
    }).join('');

    var feedback = '';
    if (s.answered) {
      var ok = s.results[s.results.length - 1].correct;
      if (q.kind === 'word') {
        var w = q.item;
        detail = '<section class="detail"><h2 class="detail-title">正しい答え</h2>' +
          '<p><span class="answer-en">' + en(w.word) + '</span><span class="pos-badge">' + esc(q.posLabel) + '</span></p>' +
          '<p class="answer-ja">' + esc(w.meaning) + '</p>' +
          '<div class="example"><p class="ex-en">' + en(w.example) + '</p><p class="ex-ja">' + esc(w.exampleJa) + '</p></div></section>';
      } else {
        detail = '<section class="detail"><h2 class="detail-title">正しい答え</h2>' +
          '<p class="answer-line">' + esc(correctText) + '</p>' +
          '<div class="explain"><span class="explain-title">解説</span>' + esc(q.item.explanation) + '</div></section>';
      }
      var on = Store.isBookmarked(s.domain, q.id);
      feedback = '<div class="banner ' + (ok ? 'ok' : 'ng') + '" role="status">' +
        '<span class="banner-mark" aria-hidden="true">' + (ok ? '○' : '×') + '</span><span>' + (ok ? '正解！' : '不正解') + '</span></div>' +
        detail +
        '<button type="button" class="btn-bookmark' + (on ? ' is-on' : '') + '" data-act="bookmark" aria-pressed="' + on + '">' + bookmarkInner(on) + '</button>' +
        (s.notice ? '<p class="notice">' + esc(s.notice) + '</p>' : '') +
        '<div class="actionbar">' + btn(s.isLast() ? '結果を見る' : '次へ', { cls: 'btn-primary', act: 'next' }) + '</div>';
    }

    return '<header class="topbar quiz-top">' + btn('やめる', { cls: 'btn-back', act: 'quit' }) +
      '<div class="progress-text" aria-live="polite">' + (s.index + 1) + ' / ' + total + '</div></header>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '">' +
      '<span style="width:' + Math.round(done / total * 100) + '%"></span></div>' +
      '<main class="screen">' + card + '<div class="choices">' + choices + '</div>' + feedback + '</main>';
  }

  screens.quiz = function () {
    return state.session ? screenQuiz() : screens.top();
  };

  // ----- 結果 -----
  function resultRow(domain, id) {
    if (domain === 'words') {
      var w = Quiz.getWord(id);
      return '<li class="item"><div class="item-main">' +
        '<div class="item-title"><span class="item-word">' + en(w.word) + '</span></div>' +
        '<div class="item-meaning">' + esc(w.meaning) + '</div>' +
        '<div class="item-meta">' + esc(Quiz.POS_LABEL[w.pos] || '') + ' ・ ' + esc(Quiz.levelLabel(w.level)) + '</div></div></li>';
    }
    var g = Quiz.getGrammar(id);
    return '<li class="item"><div class="item-main">' +
      '<div class="item-q">' + questionHtml(g.question, g.choices[g.answer]) + '</div>' +
      '<div class="item-answer">正解：' + esc(g.choices[g.answer]) + '</div>' +
      '<div class="item-meta">' + esc(g.unit + '. ' + Quiz.unitName(g.unit)) + ' ・ ' + esc(Quiz.gradeLabel(g.level)) + '</div></div></li>';
  }

  screens.result = function () {
    var s = state.session;
    if (!s) return screens.top();
    var sum = s.summary();
    var isWords = s.domain === 'words';
    var noun = isWords ? '単語' : '問題';
    var early = sum.answered < s.total();
    var canContinue = early && isWords; // 途中でやめた単語クイズは、続きから解ける

    var wrongBlock = '';
    if (sum.answered > 0) {
      wrongBlock = sum.wrongIds.length === 0 ?
        '<p class="all-correct">○ 全問正解！</p>' :
        '<h2 class="section-title">この回で間違えた' + noun + '（' + sum.wrongIds.length + '）</h2>' +
        '<ul class="items">' + sum.wrongIds.map(function (id) { return resultRow(s.domain, id); }).join('') + '</ul>';
    }

    return '<header class="topbar">' + btn('← 戻る', { cls: 'btn-back', act: 'back' }) + '<h1>結果</h1></header>' +
      '<main class="screen"><div class="score-card">' +
      '<div class="score">' + sum.correct + ' <small>/ ' + sum.answered + ' 問正解</small></div>' +
      '<div class="percent">正答率 ' + sum.percent + '%</div>' +
      (early ? '<p class="score-note">途中でやめました（全部で ' + s.total() + '問）</p>' : '') + '</div>' +
      '<div class="btn-stack">' +
      (canContinue ? btn('続きから解く（' + (sum.answered + 1) + '問目から）', { cls: 'btn-primary', act: 'continue-session' }) : '') +
      btn('間違えた' + noun + 'だけもう一度', {
        cls: canContinue ? 'btn-secondary' : 'btn-primary', act: 'retry-wrong', disabled: sum.wrongIds.length === 0
      }) +
      btn('同じ条件でもう一度', { cls: 'btn-secondary', act: 'retry-same' }) +
      btn((isWords ? '単語' : '文法') + 'トップへ', { cls: 'btn', act: 'back' }) + '</div>' +
      (canContinue ? '<p class="muted">この続きは、あとで「単語問題」の「前回の途中から始める」からも解けます。</p>' : '') +
      wrongBlock + '</main>';
  };

  // ---------- クイズの進め方 ----------
  // クイズ画面に入る。「戻る」はクイズ中の画面をとばして、トップ画面へ戻れるようにする
  function enterQuiz(session) {
    state.session = session;
    state.stack = [
      { screen: 'top', params: {} },
      { screen: session.domain === 'grammar' ? 'grammarTop' : 'wordsTop', params: { domain: session.domain } }
    ];
    state.screen = 'quiz';
    state.params = {};
    render();
  }

  function startQuiz(config) {
    config = omit(config, ['rf', 'rt', 'rs']); // 番号の入力欄の下書きは、出題条件に入れない
    var listIds = config.source === 'list' ? Store.listIds(config.domain, config.tab) : null;
    var ids = Quiz.selectIds(config, listIds);
    if (ids.length === 0) {
      toast('この条件の問題がありません。');
      return;
    }
    var session = Quiz.createSession(config, ids);
    if (config.domain === 'words') Store.setResume('words', session.snapshot());
    enterQuiz(session);
  }

  // 単語クイズを最後まで答えた。途中の保存を消し、順番どおりだったら「ここまで」の印を残す
  function completeWordsSession(s) {
    Store.clearResume('words');
    var c = s.config;
    if (c.source === 'level' && (c.mode === 'order' || c.mode === 'range')) {
      var last = 0;
      s.ids.forEach(function (id) { last = Math.max(last, Quiz.wordPosition(id)); });
      Store.setCursor('words', { level: c.level, pos: last, size: s.ids.length, direction: c.direction });
    }
  }

  function describeRecord(correct, rec) {
    if (!correct) return rec.added ? '間違いリストに入れました。' : '間違いリストに残っています。';
    if (rec.removed) return Store.STREAK_TO_REMOVE + '回続けて正解！間違いリストから外しました。';
    if (rec.streak > 0) return 'あと' + (Store.STREAK_TO_REMOVE - rec.streak) + '回続けて正解すると、間違いリストから外れます。';
    return '';
  }

  function choose(i) {
    var s = state.session;
    if (state.screen !== 'quiz' || !s || s.answered) return;
    var q = s.question();
    if (!(i >= 0 && i < q.options.length)) return;
    var res = s.answer(i);
    if (!res) return;
    var rec = Store.recordAnswer(s.domain, q.id, res.correct); // 1問ごとにすぐ保存
    if (s.domain === 'words') {
      // 答えた数も、1問ごとに保存する（あとで「前回の途中から」始められる）
      if (s.results.length >= s.total()) completeWordsSession(s);
      else Store.setResume('words', s.snapshot());
    }
    s.notice = describeRecord(res.correct, rec);
    render(true);
    var banner = root.querySelector('.banner');
    if (banner && banner.scrollIntoView) banner.scrollIntoView({ block: 'nearest' });
  }

  function finish() {
    state.screen = 'result';
    state.params = {};
    render();
  }

  function next() {
    var s = state.session;
    if (state.screen !== 'quiz' || !s || !s.answered) return;
    if (s.isLast()) {
      finish();
      return;
    }
    s.next();
    render();
  }

  function quit() {
    var s = state.session;
    var hasRest = s && s.domain === 'words' && s.results.length < s.total();
    var message = 'やめますか？\nここまでの結果を見られます。' +
      (hasRest ? '\n（続きは、あとで「前回の途中から始める」から解けます。）' : '');
    if (!window.confirm(message)) return;
    finish();
  }

  // 結果画面から、やめたところの続きを解く
  function continueSession() {
    var s = state.session;
    if (!s || s.results.length >= s.total()) return;
    if (s.answered) s.next(); // 答えたあとで「やめる」を押した場合は、次の問題から
    enterQuiz(s);
  }

  // 単語問題の「前回の途中から始める」
  function resumeWords() {
    var info = resumeInfo();
    if (!info) {
      toast('続きから始められる問題がありません。');
      render(true);
      return;
    }
    if (info.kind === 'session') {
      enterQuiz(info.session);
      toast('前回の続き（' + (info.session.index + 1) + '問目）から始めます。');
    } else {
      startQuiz(info.config);
    }
  }

  function toggleBookmark(el) {
    var s = state.session;
    if (!s) return;
    var on = Store.toggleBookmark(s.domain, s.question().id);
    el.classList.toggle('is-on', on);
    el.setAttribute('aria-pressed', String(on));
    el.innerHTML = bookmarkInner(on);
  }

  function retryWrong() {
    var s = state.session;
    if (!s) return;
    var ids = s.summary().wrongIds;
    if (ids.length === 0) return;
    startQuiz({ domain: s.domain, source: 'retry', ids: ids, direction: s.config.direction });
  }

  function retrySame() {
    if (state.session) startQuiz(merge(state.session.config, {}));
  }

  function removeFromList(el) {
    var domain = el.getAttribute('data-domain');
    var id = el.getAttribute('data-id');
    if (el.getAttribute('data-kind') === 'wrong') Store.removeWrong(domain, id);
    else Store.removeBookmark(domain, id);
    render(true);
  }

  function resetAll() {
    if (!window.confirm('学習記録（間違いリスト・ブックマーク・成績）を、すべて消します。\nよろしいですか？')) return;
    if (!window.confirm('本当に消しますか？\n消した記録は、元に戻せません。')) return;
    Store.clearAll();
    toast('学習記録を消しました。');
    render(true);
  }

  // ---------- 番号で範囲を選ぶ（③）と、単語リスト（①）の操作 ----------
  var pickFirst = null; // リストの単語を1回タップした（「はじめ」を選んだ）とき、その番号

  function readRange(level) {
    var f = root.querySelector('#rf');
    var t = root.querySelector('#rt');
    var n = Quiz.wordCount(level);
    var from = parseInt(f.value, 10);
    var to = parseInt(t.value, 10);
    return {
      f: from, t: to, n: n, fEl: f, tEl: t,
      valid: isFinite(from) && isFinite(to) && from >= 1 && to <= n && from <= to
    };
  }

  // 入力に合わせて、まとめの文・エラー・ボタン・リストの色づけを更新する
  function refreshRange() {
    if (!root.querySelector('#range-card')) return;
    var level = state.params.level;
    var r = readRange(level);
    var sum = root.querySelector('#range-summary');
    var err = root.querySelector('#range-error');
    var go = root.querySelector('#range-go');

    if (r.valid) {
      var words = Quiz.wordsOfLevel(level);
      sum.textContent = r.f + '〜' + r.t + '番（' + (r.t - r.f + 1) + '語）　' + words[r.f - 1].word + ' 〜 ' + words[r.t - 1].word +
        (pickFirst !== null ? '　（つづけて「おわり」の単語をタップ）' : '');
      err.hidden = true;
    } else {
      sum.textContent = '';
      err.textContent = (isNaN(r.f) || isNaN(r.t)) ?
        '番号を入れてください。' :
        '番号は 1〜' + r.n + ' の間で、「はじめ」を「おわり」以下にしてください。';
      err.hidden = false;
    }
    go.disabled = !r.valid;

    var rows = root.querySelectorAll('.wl-row');
    for (var i = 0; i < rows.length; i++) {
      var no = Number(rows[i].getAttribute('data-n'));
      var inRange = r.valid && no >= r.f && no <= r.t;
      rows[i].classList.toggle('in-range', inRange);
      rows[i].classList.toggle('is-edge', inRange && (no === r.f || no === r.t));
    }
    // 戻ってきたときに同じ入力が残るように、画面の引き継ぎ（params）に控えておく
    state.params = merge(state.params, { rf: r.fEl.value, rt: r.tEl.value });
  }

  // 入力欄を、1〜その級の語数の中に収める
  function clampRangeInputs() {
    var n = Quiz.wordCount(state.params.level);
    ['#rf', '#rt'].forEach(function (sel) {
      var el = root.querySelector(sel);
      var v = parseInt(el.value, 10);
      if (isFinite(v)) el.value = String(Math.min(n, Math.max(1, v)));
    });
  }

  // リストの単語をタップ：1回目＝はじめ、2回目＝おわり（小さいほうが「はじめ」になる）
  function pickWord(no) {
    var f = root.querySelector('#rf');
    var t = root.querySelector('#rt');
    if (!f || !t) return;
    if (pickFirst === null) {
      f.value = String(no);
      t.value = String(no);
      pickFirst = no;
    } else {
      f.value = String(Math.min(pickFirst, no));
      t.value = String(Math.max(pickFirst, no));
      pickFirst = null;
    }
    refreshRange();
    if (pickFirst === null) {
      var card = root.querySelector('#range-card');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'start' });
    }
  }

  function setRangeOrder(v) {
    var chips = root.querySelectorAll('[data-act="range-order"]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute('aria-pressed', String(chips[i].getAttribute('data-v') === v));
    }
    state.params = merge(state.params, { rs: v });
  }

  function rangeGo() {
    var r = readRange(state.params.level);
    if (!r.valid) {
      refreshRange();
      return;
    }
    var shuffle = state.params.rs === 'random';
    go('wordsDirection', merge(omit(state.params, ['rf', 'rt', 'rs']), { mode: 'range', from: r.f, to: r.t, shuffle: shuffle }));
  }

  function jumpTo(i) {
    var el = document.getElementById('wl-b-' + i);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
  }

  // ---------- 操作の受け付け ----------
  function readSet(el) {
    try {
      return JSON.parse(el.getAttribute('data-set') || '{}');
    } catch (e) {
      return {};
    }
  }

  var actions = {
    back: function () { back(); },
    go: function (el) { go(el.getAttribute('data-to'), merge(state.params, readSet(el))); },
    start: function (el) { startQuiz(merge(state.params, readSet(el))); },
    choose: function (el) { choose(Number(el.getAttribute('data-i'))); },
    next: function () { next(); },
    quit: function () { quit(); },
    bookmark: function (el) { toggleBookmark(el); },
    'retry-wrong': function () { retryWrong(); },
    'retry-same': function () { retrySame(); },
    'continue-session': function () { continueSession(); },
    'resume-words': function () { resumeWords(); },
    'list-tab': function (el) { setParams({ tab: el.getAttribute('data-tab') }); },
    'list-filter': function (el) { setParams({ lf: el.getAttribute('data-lf') }); },
    remove: function (el) { removeFromList(el); },
    'reset-all': function () { resetAll(); },
    'range-go': function () { rangeGo(); },
    'range-order': function (el) { setRangeOrder(el.getAttribute('data-v')); },
    'wl-pick': function (el) { pickWord(Number(el.getAttribute('data-n'))); },
    'wl-jump': function (el) { jumpTo(Number(el.getAttribute('data-i'))); }
  };

  root.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-act')];
    if (fn) fn(el);
  });

  // 番号の入力欄：入力するたびに、まとめとリストの色づけを更新する
  root.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('range-input')) {
      pickFirst = null;
      refreshRange();
    }
  });

  root.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('range-input')) {
      clampRangeInputs();
      refreshRange();
    }
  });

  root.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!t || !t.classList) return;
    if (t.classList.contains('wl-row') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      t.click();
    } else if (t.classList.contains('range-input') && e.key === 'Enter') {
      clampRangeInputs();
      refreshRange();
      var go = root.querySelector('#range-go');
      if (go && !go.disabled) go.click();
    }
  });

  // PCでは、数字キー（1〜4）で答え、Enter で次へ進める
  document.addEventListener('keydown', function (e) {
    var s = state.session;
    if (state.screen !== 'quiz' || !s || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!s.answered && /^[1-4]$/.test(e.key)) {
      choose(Number(e.key) - 1);
    } else if (s.answered && e.key === 'Enter' && document.activeElement === document.body) {
      e.preventDefault();
      next();
    }
  });

  render();
})();
