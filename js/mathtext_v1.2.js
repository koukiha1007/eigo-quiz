/* mathtext.js（ver1.2）
 * 数学の問題文・選択肢・解説に使う、かんたんな書き方を、画面に出す形（HTML）に直す。
 * 画面（DOM）には触らない。文字は必ずエスケープして出すので、そのまま innerHTML に入れてよい。
 *
 * データの文字列の中での書き方
 *   {3/4}  {x+1/2}      分数（上 / 下）。{ } の中の、いちばん外側の / で上下に分ける
 *   x^2  x^{n+1}        べき（右上の小さな文字）。数字・英字ひとつなら { } は省略できる
 *   √2  √x  √{18}       平方根。{ } をつけると、ルートの中身を長く書ける
 *   -                   表示のとき、マイナス記号（−）にそろえる
 *   \n                  改行
 * それ以外の文字は、そのまま出す（< や & も安全）。
 *
 * 使い方
 *   EIQMath.html(text)      画面用のHTML
 *   EIQMath.plain(text)     ふつうの文字（検査・テスト用。分数は 3/4、べきは x^2）
 *   EIQMath.speak(text)     読み上げ用の日本語（分数は「4分の3」）
 *   EIQMath.problems(text)  書き方の間違いを、文章のリストで返す（なければ空）
 */
(function (global) {
  'use strict';

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  // マイナス記号。日本語フォントの − は幅が広いので、英数字用のフォントで出すための印（m-minus）をつける
  var MINUS_HTML = '<span class="m-minus">−</span>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }

  // s[i] が '{' のとき、対応する '}' の位置（なければ -1）
  function matchBrace(s, i) {
    var depth = 0;
    for (var k = i; k < s.length; k++) {
      var c = s.charAt(k);
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return k;
      }
    }
    return -1;
  }

  // { } の外にある、最初の / の位置（なければ -1）
  function topSlash(s) {
    var depth = 0;
    for (var k = 0; k < s.length; k++) {
      var c = s.charAt(k);
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '/' && depth === 0) return k;
    }
    return -1;
  }

  var EXP_RE = /^-?\d+|^[A-Za-z]/;        // ^ のあとに { } なしで書けるもの
  var RAD_RE = /^\d+(?:\.\d+)?|^[A-Za-z]/; // √ のあとに { } なしで書けるもの

  // ^ や √ のあとの { }、または短い書き方を読む
  function readArg(s, i, re) {
    if (s.charAt(i) === '{') {
      var j = matchBrace(s, i);
      if (j < 0) return null;
      return { text: s.slice(i + 1, j), end: j + 1 };
    }
    var m = re.exec(s.slice(i));
    return m ? { text: m[0], end: i + m[0].length } : null;
  }

  // 出力のしかた（mode ごと）
  var MODES = {
    html: {
      text: esc,
      minus: MINUS_HTML,
      nl: '<br>',
      sup: function (b) { return '<sup class="m-sup">' + b + '</sup>'; },
      root: function (b, label) {
        return '<span class="m-rt" role="math" aria-label="' + esc(label) + '">' +
          '<span class="m-rt-sign" aria-hidden="true">√</span>' +
          '<span class="m-rt-body" aria-hidden="true">' + b + '</span></span>';
      },
      frac: function (n, d, label) {
        return '<span class="m-frac" role="math" aria-label="' + esc(label) + '">' +
          '<span class="m-num" aria-hidden="true">' + n + '</span>' +
          '<span class="m-den" aria-hidden="true">' + d + '</span></span>';
      }
    },
    plain: {
      text: function (c) { return c; },
      minus: '-',
      nl: '\n',
      sup: function (b) { return '^' + wrap(b); },
      root: function (b) { return '√' + wrap(b); },
      frac: function (n, d) { return wrap(n) + '/' + wrap(d); }
    },
    speak: {
      text: function (c) { return c; },
      minus: 'マイナス',
      nl: ' ',
      sup: function (b) { return 'の' + b + '乗'; },
      root: function (b) { return 'ルート' + b; },
      frac: function (n, d) { return d + '分の' + n; }
    }
  };

  // ふつうの文字にするとき、1文字・1語でなければ ( ) で囲む
  function wrap(b) {
    return /^-?[0-9A-Za-z.]+$/.test(b) ? b : '(' + b + ')';
  }

  function convert(s, mode) {
    var M = MODES[mode];
    var out = '';
    var i = 0;
    var c, a, j, inner, k;
    while (i < s.length) {
      c = s.charAt(i);
      if (c === '\n') {
        out += M.nl;
        i++;
      } else if (c === '^') {
        a = readArg(s, i + 1, EXP_RE);
        if (a) {
          out += M.sup(convert(a.text, mode));
          i = a.end;
        } else {
          out += M.text(c);
          i++;
        }
      } else if (c === '√') {
        a = readArg(s, i + 1, RAD_RE);
        if (a) {
          out += M.root(convert(a.text, mode), 'ルート' + convert(a.text, 'speak'));
          i = a.end;
        } else {
          out += M.text(c);
          i++;
        }
      } else if (c === '{') {
        j = matchBrace(s, i);
        if (j < 0) {
          out += M.text(c);
          i++;
        } else {
          inner = s.slice(i + 1, j);
          k = topSlash(inner);
          if (k >= 0) {
            var num = inner.slice(0, k);
            var den = inner.slice(k + 1);
            out += M.frac(convert(num, mode), convert(den, mode), convert(den, 'speak') + '分の' + convert(num, 'speak'));
          } else {
            out += convert(inner, mode);
          }
          i = j + 1;
        }
      } else if (c === '-') {
        out += M.minus;
        i++;
      } else {
        out += M.text(c);
        i++;
      }
    }
    return out;
  }

  function html(text) { return convert(String(text), 'html'); }
  function plain(text) { return convert(String(text), 'plain'); }
  function speak(text) { return convert(String(text), 'speak'); }

  // 書き方の間違い探し。見つけたものを、文章で返す
  function problems(text) {
    var s = String(text);
    var out = [];
    var depth = 0;
    var i, c;

    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth < 0) {
          out.push('} が多すぎます');
          depth = 0;
        }
      }
    }
    if (depth > 0) out.push('{ が閉じていません');

    i = 0;
    while (i < s.length) {
      c = s.charAt(i);
      if (c === '^') {
        var e = readArg(s, i + 1, EXP_RE);
        if (!e) out.push('^ のあとが正しくありません（… ' + s.slice(i, i + 6) + ' …）');
        else if (e.text === '') out.push('^{ } の中が空です');
      } else if (c === '√') {
        var r = readArg(s, i + 1, RAD_RE);
        if (!r) out.push('√ のあとが正しくありません（… ' + s.slice(i, i + 6) + ' …）');
        else if (r.text === '') out.push('√{ } の中が空です');
      } else if (c === '{' && s.charAt(i - 1) !== '^' && s.charAt(i - 1) !== '√') {
        var j = matchBrace(s, i);
        if (j > 0) {
          var inner = s.slice(i + 1, j);
          var k = topSlash(inner);
          if (k >= 0) {
            if (inner.slice(0, k).trim() === '' || inner.slice(k + 1).trim() === '') out.push('分数の上か下が空です：{' + inner + '}');
            if (topSlash(inner.slice(k + 1)) >= 0) out.push('分数に / が2つあります：{' + inner + '}');
          }
        }
      }
      i++;
    }

    if (/[０-９Ａ-Ｚａ-ｚ]/.test(s)) out.push('全角の数字・英字があります');
    if (/＝/.test(s)) out.push('全角の＝があります（半角の = にしてください）');
    if (/\*/.test(s)) out.push('* があります（× にしてください）');
    if (/\t/.test(s)) out.push('タブがあります');
    return out;
  }

  global.EIQMath = { html: html, plain: plain, speak: speak, problems: problems };
})(window);
