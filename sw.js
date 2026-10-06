/* sw.js : ホーム画面から起動したとき、オフラインでも ver1.2 が動くようにする。
 * 開いたら保存済みのファイルをすぐ使い、裏で新しい版を取りに行く（次に開いたとき反映）。
 * ファイルを増やしたら FILES に足し、CACHE の番号を1つ上げる。 */
var CACHE = 'eiq-v1.2-1';
var FILES = [
  './',
  './ver1.2.html',
  './ver1.1.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './css/style_v1.2.css',
  './js/storage_v1.2.js',
  './js/mathtext_v1.2.js',
  './js/quiz_v1.2.js',
  './js/app_v1.2.js',
  './data/words_5.js',
  './data/words_4.js',
  './data/words_3.js',
  './data/words_p2.js',
  './data/grammar/01_be.js',
  './data/grammar/02_present.js',
  './data/grammar/03_pronoun.js',
  './data/grammar/04_wh.js',
  './data/grammar/05_imperative.js',
  './data/grammar/06_present_prog.js',
  './data/grammar/07_past.js',
  './data/grammar/08_past_prog.js',
  './data/grammar/09_future.js',
  './data/grammar/10_modal.js',
  './data/grammar/11_infinitive.js',
  './data/grammar/12_gerund.js',
  './data/grammar/13_comparison.js',
  './data/grammar/14_conjunction.js',
  './data/grammar/15_passive.js',
  './data/grammar/16_perfect.js',
  './data/grammar/17_participle.js',
  './data/grammar/18_relative.js',
  './data/grammar/19_indirect.js',
  './data/grammar/20_subjunctive.js',
  './data/math/01_signed.js',
  './data/math/02_letters.js',
  './data/math/03_linear_eq.js',
  './data/math/04_proportion.js',
  './data/math/05_plane.js',
  './data/math/06_solid.js',
  './data/math/07_expressions.js',
  './data/math/08_simultaneous.js',
  './data/math/09_linear_func.js',
  './data/math/10_angles.js',
  './data/math/11_congruence.js',
  './data/math/12_probability.js',
  './data/math/13_data.js',
  './data/math/14_expand_factor.js',
  './data/math/15_sqrt.js',
  './data/math/16_quadratic_eq.js',
  './data/math/17_quadratic_func.js',
  './data/math/18_similar.js',
  './data/math/19_circle.js',
  './data/math/20_pythagoras.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.ok) c.put(e.request, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
