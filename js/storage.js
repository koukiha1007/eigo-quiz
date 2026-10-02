/* storage.js
 * 学習記録（間違いリスト・ブックマーク・成績）の保存。
 * localStorage のキー eiq_v1 に、1つのオブジェクトとして保存する。
 * 読み書きはすべて try/catch。保存できない環境でも、メモリ上だけでアプリは動く。
 */
(function (global) {
  'use strict';

  var KEY = 'eiq_v1';
  var VERSION = 1;
  var STREAK_TO_REMOVE = 2; // 間違いリストの問題に2回続けて正解したら、リストから外す
  var DOMAINS = ['words', 'grammar'];

  var persistent = true; // localStorage に読み書きできているか
  var data = emptyData();

  function emptyDomain() {
    return { wrong: {}, bookmarks: [], stats: {} };
  }

  function emptyData() {
    return { version: VERSION, words: emptyDomain(), grammar: emptyDomain() };
  }

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function toCount(v) {
    return typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }

  // 読み込んだデータを、決まった形に整える（壊れた値は捨てる）
  function cleanDomain(src) {
    var d = emptyDomain();
    if (!isObject(src)) return d;

    if (isObject(src.wrong)) {
      Object.keys(src.wrong).forEach(function (id) {
        var w = src.wrong[id];
        d.wrong[id] = { streak: isObject(w) ? toCount(w.streak) : 0 };
      });
    }
    if (Array.isArray(src.bookmarks)) {
      src.bookmarks.forEach(function (id) {
        if (typeof id === 'string' && d.bookmarks.indexOf(id) < 0) d.bookmarks.push(id);
      });
    }
    if (isObject(src.stats)) {
      Object.keys(src.stats).forEach(function (id) {
        var s = src.stats[id];
        if (isObject(s)) d.stats[id] = { correct: toCount(s.correct), wrong: toCount(s.wrong) };
      });
    }
    return d;
  }

  function getStorage() {
    try {
      return global.localStorage || null;
    } catch (e) {
      return null; // Cookie をブロックしている場合などは、参照しただけで例外になる
    }
  }

  function load() {
    var ls = getStorage();
    var raw;
    data = emptyData();
    if (!ls) {
      persistent = false;
      return;
    }
    try {
      raw = ls.getItem(KEY);
      persistent = true;
    } catch (e) {
      persistent = false;
      return;
    }
    if (raw === null || raw === undefined) return;
    try {
      var parsed = JSON.parse(raw);
      data = {
        version: VERSION,
        words: cleanDomain(parsed && parsed.words),
        grammar: cleanDomain(parsed && parsed.grammar)
      };
    } catch (e) {
      // 壊れたデータは別名で残して、空の状態から始める
      try { ls.setItem(KEY + '_broken', raw); } catch (e2) { /* 何もしない */ }
      data = emptyData();
    }
  }

  function save() {
    var ls = getStorage();
    if (!ls) {
      persistent = false;
      return false;
    }
    try {
      ls.setItem(KEY, JSON.stringify(data));
      persistent = true;
      return true;
    } catch (e) {
      persistent = false;
      return false;
    }
  }

  function dom(name) {
    if (DOMAINS.indexOf(name) < 0) throw new Error('unknown domain: ' + name);
    return data[name];
  }

  // ---- 成績 ----
  function getStats(domain, id) {
    var s = dom(domain).stats[id];
    return s ? { correct: s.correct, wrong: s.wrong } : { correct: 0, wrong: 0 };
  }

  // ---- 間違いリスト ----
  function isWrong(domain, id) {
    return Object.prototype.hasOwnProperty.call(dom(domain).wrong, id);
  }

  function removeWrong(domain, id) {
    delete dom(domain).wrong[id];
    save();
  }

  // 1問答えるごとに呼ぶ。成績・間違いリストを更新して、すぐ保存する。
  // 戻り値：{ added, removed, streak }
  function recordAnswer(domain, id, correct) {
    var d = dom(domain);
    var st = d.stats[id] || (d.stats[id] = { correct: 0, wrong: 0 });
    var result = { added: false, removed: false, streak: 0 };

    if (correct) {
      st.correct += 1;
      if (isWrong(domain, id)) {
        d.wrong[id].streak += 1;
        result.streak = d.wrong[id].streak;
        if (d.wrong[id].streak >= STREAK_TO_REMOVE) {
          delete d.wrong[id];
          result.removed = true;
        }
      }
    } else {
      st.wrong += 1;
      if (isWrong(domain, id)) {
        d.wrong[id].streak = 0; // 連続正解は0に戻す
      } else {
        d.wrong[id] = { streak: 0 };
        result.added = true;
      }
    }
    save();
    return result;
  }

  // ---- ブックマーク ----
  function isBookmarked(domain, id) {
    return dom(domain).bookmarks.indexOf(id) >= 0;
  }

  // 追加・解除を切り替える。戻り値：切り替え後にブックマーク中か
  function toggleBookmark(domain, id) {
    var list = dom(domain).bookmarks;
    var i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    save();
    return i < 0;
  }

  function removeBookmark(domain, id) {
    var list = dom(domain).bookmarks;
    var i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    save();
  }

  // ---- リスト ----
  // tab: 'wrong'（間違い）/ 'bookmark'（ブックマーク）/ 'both'（両方まとめ・重複なし）
  function listIds(domain, tab) {
    var d = dom(domain);
    var wrong = Object.keys(d.wrong);
    if (tab === 'wrong') return wrong;
    if (tab === 'bookmark') return d.bookmarks.slice();
    var out = wrong.slice();
    d.bookmarks.forEach(function (id) {
      if (out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }

  // ---- 全消去 ----
  function clearAll() {
    data = emptyData();
    var ls = getStorage();
    if (!ls) return false;
    try {
      ls.removeItem(KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  load();

  global.EIQStorage = {
    KEY: KEY,
    STREAK_TO_REMOVE: STREAK_TO_REMOVE,
    isPersistent: function () { return persistent; },
    getStats: getStats,
    isWrong: isWrong,
    removeWrong: removeWrong,
    recordAnswer: recordAnswer,
    isBookmarked: isBookmarked,
    toggleBookmark: toggleBookmark,
    removeBookmark: removeBookmark,
    listIds: listIds,
    clearAll: clearAll,
    reload: load
  };
})(window);
