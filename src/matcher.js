/*
 * Trench Dive answer matcher.
 * Normalizes input (case, accents, punctuation, plurals), then tries in order:
 *  1. an exact alias, near-miss hint or ambiguity hint
 *  2. a very close or sound-alike spelling, which counts automatically
 *  3. an answer inside a longer input ("swiss franc" -> Franc)
 *  4. a slightly looser spelling, which also counts automatically
 *  5. a clear chunk of a longer answer ("jersey" -> New Jersey)
 *  6. one misspelled word inside a longer input ("swiss frank")
 *  7. a looser guess, offered as "Did you mean ...?" for the player to confirm
 */
(function (root) {
"use strict";

var TIERS = root.TRENCH_TIERS, PROMPTS = root.TRENCH_PROMPTS;

/* ---------- normalizing ---------- */
var STOP = { "the": 1, "a": 1, "an": 1 };
var CHARMAP = { "ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "ß": "ss", "đ": "d", "Đ": "d", "ı": "i", "þ": "th", "Þ": "th", "ð": "d" };

function stem(w) {
  if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length >= 4 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

function norm(s, strip) {
  s = String(s == null ? "" : s).replace(/[łŁøØæÆœŒßđĐıþÞð]/g, function (c) { return CHARMAP[c]; });
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(/&/g, " and ").replace(/\+/g, " plus ").replace(/#/g, " sharp ").replace(/['’‘`´ʼ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  if (!s) return "";
  var out = [], words = s.split(" ");
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (w === "saint") w = "st";
    if (STOP[w]) continue;
    if (strip && (strip[w] || strip[stem(w)])) continue;
    out.push(stem(w));
  }
  return out.join(" ");
}

/* ---------- spelling distance ---------- */

/* Respell a squashed key the way it sounds, so "fillipines" and "philippines",
   or "mozerella" and "mozzarella", end up close together. */
function soft(s) {
  return s.replace(/(.)\1+/g, "$1")
    .replace(/^(kn|gn|pn)/, "n").replace(/^ps/, "s").replace(/^wr/, "r").replace(/^wh/, "w").replace(/^x/, "z")
    .replace(/ph/g, "f").replace(/ck/g, "k").replace(/qu?/g, "k").replace(/x/g, "ks")
    .replace(/tch/g, "ch").replace(/sch/g, "sk")
    .replace(/c(?=[eiy])/g, "s").replace(/c(?!h)/g, "k")
    .replace(/dg(?=[eiy])/g, "j").replace(/z/g, "s").replace(/y/g, "i")
    .replace(/([^aeiou])h/g, "$1")
    .replace(/(.)\1+/g, "$1");
}

var VOWEL = { a: 1, e: 1, i: 1, o: 1, u: 1 };
var SIMILAR = { ck: 1, kc: 1, cs: 1, sc: 1, kg: 1, gk: 1, gj: 1, jg: 1, fv: 1, vf: 1, mn: 1, nm: 1, dt: 1, td: 1, bp: 1, pb: 1, wv: 1, vw: 1 };

/* Swapping vowels or similar consonants is cheap; so is a missing vowel, h or doubled letter. */
function subCost(x, y) {
  if (x === y) return 0;
  if (VOWEL[x] && VOWEL[y]) return 0.4;
  if (SIMILAR[x + y]) return 0.5;
  return 1;
}
function gapCost(s, i) {
  var c = s.charAt(i);
  if (c === s.charAt(i - 1) || c === s.charAt(i + 1)) return 0.3;
  if (VOWEL[c]) return 0.6;
  if (c === "h") return 0.4;
  return 1;
}

/* Weighted Damerau-Levenshtein (optimal string alignment); bails out above max */
function wdist(a, b, max) {
  var la = a.length, lb = b.length, i, j, v, lo;
  var p2 = null, p1 = [0], cur;
  for (j = 1; j <= lb; j++) p1[j] = p1[j - 1] + gapCost(b, j - 1);
  for (i = 1; i <= la; i++) {
    cur = [p1[0] + gapCost(a, i - 1)];
    lo = cur[0];
    for (j = 1; j <= lb; j++) {
      v = Math.min(p1[j] + gapCost(a, i - 1), cur[j - 1] + gapCost(b, j - 1), p1[j - 1] + subCost(a.charAt(i - 1), b.charAt(j - 1)));
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) v = Math.min(v, p2[j - 2] + 0.7);
      cur[j] = v;
      if (v < lo) lo = v;
    }
    if (lo > max) return max + 1;
    p2 = p1; p1 = cur;
  }
  return p1[lb];
}

/* How far off a spelling can be, by length: counted automatically, or offered as a guess */
function autoMax(L) { return L <= 3 ? 0 : L === 4 ? 0.5 : L <= 6 ? 1 : L <= 9 ? 1.6 : L <= 13 ? 2.2 : 2.8; }
function guessMax(L) { return L <= 2 ? 0 : L === 3 ? 0.5 : Math.min(4.5, 0.3 * L + 0.2); }

/* Plain Damerau-Levenshtein, kept for tools and tests */
function dl(a, b, max) {
  var la = a.length, lb = b.length, i, j, t;
  if (Math.abs(la - lb) > max) return max + 1;
  var r0 = new Array(lb + 1), r1 = new Array(lb + 1), r2 = new Array(lb + 1);
  for (j = 0; j <= lb; j++) r1[j] = j;
  for (i = 1; i <= la; i++) {
    r2[0] = i;
    var lo = i;
    for (j = 1; j <= lb; j++) {
      var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      var v = Math.min(r1[j] + 1, r2[j - 1] + 1, r1[j - 1] + cost);
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, r0[j - 2] + 1);
      r2[j] = v;
      if (v < lo) lo = v;
    }
    if (lo > max) return max + 1;
    t = r0; r0 = r1; r1 = r2; r2 = t;
  }
  return r1[lb];
}

/* ---------- building each prompt's lookup tables ---------- */
function addMsgs(src, dst, strip) {
  if (!src) return;
  Object.keys(src).forEach(function (ks) {
    ks.split("|").forEach(function (raw) {
      var k = norm(raw, strip);
      if (!k) return;
      dst[k] = src[ks];
      dst[k.replace(/ /g, "")] = src[ks];
    });
  });
}

function build(P) {
  P._x = {};
  (P.x || "").split(" ").forEach(function (w) { if (w) P._x[w] = 1; });
  P._ans = []; P._map = {}; P._keys = []; P._near = {}; P._amb = {}; P._clash = [];
  TIERS.forEach(function (T, ti) {
    var src = P[T.id];
    if (!src) return;
    src.split("|").forEach(function (entry) {
      var names = entry.split("=").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!names.length) return;
      var i = P._ans.length;
      P._ans.push({ name: names[0], tier: ti });
      names.forEach(function (n) {
        var k = norm(n, P._x);
        if (!k) { P._clash.push("empty key: " + n); return; }
        var ns = k.replace(/ /g, "");
        [k, ns].forEach(function (key) {
          if (P._map[key] === undefined) P._map[key] = i;
          else if (P._map[key] !== i) P._clash.push(key + " -> " + P._ans[P._map[key]].name + " / " + names[0]);
        });
        P._keys.push({ k: k, ns: ns, i: i });
      });
    });
  });
  addMsgs(P.n, P._near, P._x);
  addMsgs(P.a, P._amb, P._x);
  if (P.sym) P.sym.split(" ").forEach(function (s) {
    var k = norm(s, P._x);
    if (k && P._near[k] === undefined) P._near[k] = "That's the symbol. Spell out the full name.";
  });
  P._k = P._ans.filter(function (a) { return a.tier === 5; })[0];

  /* sound-alike spellings of every answer, hint and ambiguity key, for fuzzy matching */
  P._fz = [];
  var seen = {};
  var add = function (sf, kind, i, msg, oneWord) {
    var id = kind + ":" + sf + ":" + i;
    if (!sf || seen[id]) return;
    seen[id] = 1;
    P._fz.push({ sf: sf, kind: kind, i: i, msg: msg, one: !!oneWord });
  };
  P._keys.forEach(function (e) { add(soft(e.ns), "ok", e.i, "", e.k.indexOf(" ") < 0); });
  Object.keys(P._near).forEach(function (k) { add(soft(k.replace(/ /g, "")), "near", -1, P._near[k]); });
  Object.keys(P._amb).forEach(function (k) { add(soft(k.replace(/ /g, "")), "amb", -1, P._amb[k]); });
  return P;
}

/* ---------- judging an answer ---------- */
function whichOf(P, idx) {
  var names = idx.filter(function (i) { return P._ans[i].tier !== 5; }).slice(0, 3).map(function (i) { return P._ans[i].name; });
  if (!names.length) return "Close to more than one answer. Be more specific.";
  return "Which one? " + names.join(", ") + (idx.length > names.length ? ", or another" : "") + "?";
}

function distinctAnswers(hits, upTo) {
  var out = [];
  for (var j = 0; j < hits.length; j++) {
    var h = hits[j];
    if (h.e.kind !== "ok" || h.d > upTo || out.indexOf(h.e.i) >= 0) continue;
    out.push(h.e.i);
  }
  return out;
}

function fuzzyHits(P, ns) {
  var sIn = soft(ns), Lin = sIn.length, hits = [];
  if (Lin < 3) return hits;
  for (var j = 0; j < P._fz.length; j++) {
    var e = P._fz[j], L = Math.max(Lin, e.sf.length), cap = guessMax(L), d;
    if (e.sf === sIn) { hits.push({ e: e, d: 0, auto: true }); continue; }
    d = Math.abs(e.sf.length - Lin) * 0.3 > cap ? cap + 1 : wdist(sIn, e.sf, cap);
    if (d > cap) {
      /* the start of a long answer ("brachio" -> Brachiosaurus) is offered as a guess */
      if (e.kind === "ok" && e.one && Lin >= 5 && Lin >= 0.45 * e.sf.length && e.sf.indexOf(sIn) === 0) hits.push({ e: e, d: cap, auto: false });
      continue;
    }
    var auto = d <= autoMax(L);
    if (!auto && d > autoMax(L) + 0.5 && sIn.charAt(0) !== e.sf.charAt(0)) continue; /* loose guesses must start the same way */
    hits.push({ e: e, d: d, auto: auto });
  }
  hits.sort(function (a, b) { return a.d - b.d; });
  return hits;
}

/* answers whose single-word keys are a close spelling of one word in a longer input ("alolan vulpixx") */
function wordHits(P, k) {
  var words = k.split(" "), out = [];
  if (!P.L || words.length < 2) return out;
  words.forEach(function (w) {
    if (w.length < 4) return;
    var hs = fuzzyHits(P, w).filter(function (h) { return h.auto && h.e.kind === "ok" && h.e.one; });
    distinctAnswers(hs, hs.length ? hs[0].d + 0.5 : 0).forEach(function (i) { if (out.indexOf(i) < 0) out.push(i); });
  });
  return out;
}

function judge(P, raw) {
  var k = norm(raw, P._x);
  if (!k) return /[a-z0-9]/i.test(String(raw || "")) ? { t: "near", msg: "Name a specific one." } : { t: "empty" };
  var ns = k.replace(/ /g, ""), i, j, e, m, opts;

  /* 1. exact */
  i = P._map[k];
  if (i === undefined) i = P._map[ns];
  if (i !== undefined) return { t: "ok", i: i };
  m = P._near[k] || P._near[ns];
  if (m) return { t: "near", msg: m };
  m = P._amb[k] || P._amb[ns];
  if (m) return { t: "amb", msg: m };

  var hits = fuzzyHits(P, ns);
  var autos = hits.filter(function (h) { return h.auto; });
  var best = autos[0];
  var bestAns = autos.filter(function (h) { return h.e.kind === "ok"; })[0];
  var closeAnswer = function () {
    opts = distinctAnswers(hits, bestAns.d + 0.5);
    return opts.length === 1 ? { t: "ok", i: opts[0], fuzzy: true } : { t: "sug", opts: opts.slice(0, 3) };
  };

  /* 2. a very close spelling of an answer ("mozerella", "fillipines") */
  if (bestAns && bestAns.d <= 1 && bestAns.d <= best.d) return closeAnswer();

  /* 3. a known answer appears inside a longer input ("swiss franc", "the hanging gardens of babylon") */
  var pad = " " + k + " ", bestLen = 0, c = [];
  for (j = 0; j < P._keys.length; j++) {
    e = P._keys[j];
    if (e.k.indexOf(" ") < 0 && !(P.L && e.k.length >= 3)) continue;
    if (pad.indexOf(" " + e.k + " ") < 0) continue;
    if (e.k.length > bestLen) { bestLen = e.k.length; c = [e.i]; }
    else if (e.k.length === bestLen && c.indexOf(e.i) < 0) c.push(e.i);
  }
  if (c.length === 1) return { t: "ok", i: c[0] };
  if (c.length > 1) return { t: "amb", msg: whichOf(P, c) };

  /* 4. a close spelling of an answer, near miss or ambiguous name */
  if (best) {
    if (best.e.kind !== "ok" && !(bestAns && bestAns.d <= best.d)) {
      return best.e.kind === "near" ? { t: "near", msg: best.e.msg, fuzzy: true } : { t: "amb", msg: best.e.msg };
    }
    return closeAnswer();
  }

  /* 5. a clear chunk of a longer answer ("jersey" -> New Jersey) */
  if (ns.length >= 5) {
    c = [];
    for (j = 0; j < P._keys.length; j++) {
      e = P._keys[j];
      if (e.k.length <= k.length) continue;
      if ((" " + e.k + " ").indexOf(pad) < 0) continue;
      if (ns.length < 0.55 * e.ns.length) continue;
      if (c.indexOf(e.i) < 0) c.push(e.i);
    }
    if (c.length === 1) return { t: "ok", i: c[0] };
    if (c.length > 1) return { t: "amb", msg: whichOf(P, c) };
  }

  /* 6. one misspelled word inside a longer input ("alolan vulpixx", "swiss frank") */
  c = wordHits(P, k);
  if (c.length === 1) return { t: "ok", i: c[0], fuzzy: true };
  if (c.length > 1) return { t: "sug", opts: c.slice(0, 3) };

  /* 7. a looser guess for the player to confirm */
  var ans = hits.filter(function (h) { return h.e.kind === "ok"; })[0];
  var near = hits.filter(function (h) { return h.e.kind === "near"; })[0];
  if (near && (!ans || near.d + 0.5 < ans.d)) return { t: "near", msg: near.e.msg, fuzzy: true };
  if (ans) return { t: "sug", opts: distinctAnswers(hits, ans.d + 0.8).slice(0, 3) };
  return { t: "no" };
}

PROMPTS.forEach(build);
root.TD = { TIERS: TIERS, PROMPTS: PROMPTS, norm: norm, judge: judge, dl: dl, soft: soft, wdist: wdist };
})(typeof window !== "undefined" ? window : globalThis);
