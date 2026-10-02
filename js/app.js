/* app.js
 * 画面の切り替え・全体の管理。
 * 画面は state.screen の名前で決まり、render() が #app の中身を作り直す。
 * 画面どうしの引き継ぎ（選んだ級や解き方）は params に入れて運ぶ。
 */
(function () {
  'use strict';

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
      '<p class="muted">収録：単語 ' + Quiz.totalWordCount() + '語 ／ 文法 ' + Quiz.totalGrammarCount() + '問</p></section>');
  };

  // ----- 単語 -----
  screens.wordsTop = function () {
    return page('単語問題',
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
      })));
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
    var isList = p.source === 'list';
    function dirBtn(direction, label, sub) {
      return menuBtn({
        label: label, sub: sub, act: isList ? 'start' : 'go', to: isList ? undefined : 'wordsCount',
        set: { direction: direction }
      });
    }
    return page('出題の向き',
      '<p class="lead">出題の向きを選んでください。</p>' +
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
      btn('間違えた' + noun + 'だけもう一度', { cls: 'btn-primary', act: 'retry-wrong', disabled: sum.wrongIds.length === 0 }) +
      btn('同じ条件でもう一度', { cls: 'btn-secondary', act: 'retry-same' }) +
      btn((isWords ? '単語' : '文法') + 'トップへ', { cls: 'btn', act: 'back' }) + '</div>' +
      wrongBlock + '</main>';
  };

  // ---------- クイズの進め方 ----------
  function startQuiz(config) {
    var listIds = config.source === 'list' ? Store.listIds(config.domain, config.tab) : null;
    var ids = Quiz.selectIds(config, listIds);
    if (ids.length === 0) {
      toast('この条件の問題がありません。');
      return;
    }
    state.session = Quiz.createSession(config, ids);
    // 「戻る」はクイズ中の画面をとばして、トップ画面へ戻れるようにする
    state.stack = [
      { screen: 'top', params: {} },
      { screen: config.domain === 'grammar' ? 'grammarTop' : 'wordsTop', params: { domain: config.domain } }
    ];
    state.screen = 'quiz';
    state.params = {};
    render();
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
    if (!window.confirm('やめますか？\nここまでの結果を見られます。')) return;
    finish();
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
    'list-tab': function (el) { setParams({ tab: el.getAttribute('data-tab') }); },
    'list-filter': function (el) { setParams({ lf: el.getAttribute('data-lf') }); },
    remove: function (el) { removeFromList(el); },
    'reset-all': function () { resetAll(); }
  };

  root.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-act')];
    if (fn) fn(el);
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
