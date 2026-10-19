/*
 * Trench Dive answer matcher.
 * Normalizes input (case, accents, punctuation, plurals), then tries in order:
 * exact alias, near-miss hint, ambiguity hint, typo tolerance, an answer inside
 * a longer input, and a clear chunk of a longer answer.
 */
(function (root) {
"use strict";

var TIERS = root.TRENCH_TIERS, PROMPTS = root.TRENCH_PROMPTS;
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

/* Damerau-Levenshtein (optimal string alignment), bails out above max */
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
  return P;
}

function whichOf(P, idx) {
  var names = idx.filter(function (i) { return P._ans[i].tier !== 5; }).slice(0, 3).map(function (i) { return P._ans[i].name; });
  if (!names.length) return "Close to more than one answer. Be more specific.";
  return "Which one? " + names.join(", ") + (idx.length > names.length ? ", or another" : "") + "?";
}

function judge(P, raw) {
  var k = norm(raw, P._x);
  if (!k) return /[a-z0-9]/i.test(String(raw || "")) ? { t: "near", msg: "Name a specific one." } : { t: "empty" };
  var ns = k.replace(/ /g, ""), i, j, e, m;

  i = P._map[k];
  if (i === undefined) i = P._map[ns];
  if (i !== undefined) return { t: "ok", i: i };

  m = P._near[k] || P._near[ns];
  if (m) return { t: "near", msg: m };
  m = P._amb[k] || P._amb[ns];
  if (m) return { t: "amb", msg: m };

  /* typo tolerance */
  var L = ns.length, th = L >= 8 ? 2 : L >= 5 ? 1 : 0;
  if (th) {
    var best = th + 1, hits = [];
    for (j = 0; j < P._keys.length; j++) {
      e = P._keys[j];
      if (Math.abs(e.ns.length - L) > th) continue;
      var d = dl(ns, e.ns, th);
      if (d < best) { best = d; hits = [e.i]; }
      else if (d === best && hits.indexOf(e.i) < 0) hits.push(e.i);
    }
    if (best <= th) {
      if (hits.length === 1) return { t: "ok", i: hits[0], fuzzy: true };
      return { t: "amb", msg: whichOf(P, hits) };
    }
  }

  /* a known answer appears inside a longer input ("swiss franc", "the hanging gardens of babylon") */
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

  /* a clear chunk of a longer answer ("jersey" -> New Jersey) */
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
  return { t: "no" };
}

PROMPTS.forEach(build);
root.TD = { TIERS: TIERS, PROMPTS: PROMPTS, norm: norm, judge: judge, dl: dl };
})(typeof window !== "undefined" ? window : globalThis);
