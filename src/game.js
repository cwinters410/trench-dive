/* Trench Dive game flow: rounds, timer, air, depth gauge, reveal and results. */
(function () {
"use strict";
var TD = window.TD, P = TD.PROMPTS, T = TD.TIERS;
var ROUNDS = 7, ROUND_MS = 25000, AIR_MS = 45000, AIR_CAP = 99000, PENALTY_MS = 2000, M_PER_PT = 4;
var el = function (id) { return document.getElementById(id); };
var reduceMotion = false;
try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

var store = {
  get: function (k, d) { try { var v = window.localStorage.getItem("trenchdive." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { window.localStorage.setItem("trenchdive." + k, JSON.stringify(v)); } catch (e) {} }
};

var G = null, raf = 0, shown = 0, countRaf = 0, revealAt = 0, gaugeMaxNow = 0, lastSec = -1;

function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
function zoneOf(m) { return m < 200 ? "Sunlight zone" : m < 1000 ? "Twilight zone" : m < 4000 ? "Midnight zone" : m < 6000 ? "Abyssal zone" : m < 10935 ? "Hadal zone" : "Challenger Deep"; }
function bandOf(m) { return m < 400 ? "Shallows" : m < 1000 ? "Schooler" : m < 1600 ? "Thermocline" : m < 2200 ? "Deep Cut" : "Trench"; }

/* ---------- prompt deck: cycles through every prompt before repeating ---------- */
function getDeck() {
  var d = store.get("deck", null);
  var ok = d && Array.isArray(d.order) && d.order.length === P.length && typeof d.pos === "number" &&
    d.order.slice().sort(function (a, b) { return a - b; }).every(function (v, i) { return v === i; });
  return ok ? d : { order: shuffle(range(P.length)), pos: 0 };
}
function draw(n, prevCat) {
  var d = getDeck();
  if (d.order.length - d.pos < n + 2) d = { order: d.order.slice(d.pos).concat(shuffle(d.order.slice(0, d.pos))), pos: 0 };
  var head = d.order.slice(0, d.pos), rest = d.order.slice(d.pos), picked = [], counts = {};
  for (var pass = 0; pass < 2 && picked.length < n; pass++) {
    for (var i = 0; i < rest.length && picked.length < n; i++) {
      var pi = rest[i];
      if (picked.indexOf(pi) >= 0) continue;
      var c = P[pi].g;
      var lim = pass === 1 ? 99 : n === 1 ? (c === prevCat ? 0 : 1) : 2;
      if ((counts[c] || 0) >= lim) continue;
      counts[c] = (counts[c] || 0) + 1;
      picked.push(pi);
    }
  }
  var left = rest.filter(function (pi) { return picked.indexOf(pi) < 0; });
  store.set("deck", { order: head.concat(picked, left), pos: head.length + picked.length });
  return picked;
}

/* ---------- depth gauge ---------- */
function gaugeMax(m) {
  if (!G || G.mode !== "endless") return 2800;
  return m < 2800 ? 2800 : m < 4000 ? 4000 : m < 6000 ? 6000 : 11000;
}
function layoutGauge(max) {
  if (max === gaugeMaxNow) return;
  gaugeMaxNow = max;
  var marks = (max <= 4000 ? [200, 1000, 4000] : [1000, 4000, 6000, 10935]).filter(function (b) { return b < max; });
  if ((max - marks[marks.length - 1]) / max > 0.06) marks.push(max);
  el("g-ticks").innerHTML = marks.map(function (b) {
    var p = b / max, cls = p < 0.06 ? " start" : p > 0.86 ? " end" : "";
    return '<div class="g-tick' + cls + '" style="--p:' + p.toFixed(4) + '"><span>' + fmt(b) + " m</span></div>";
  }).join("");
}
function depthTo(m, instant) {
  var from = shown, to = m, max = gaugeMax(to);
  layoutGauge(max);
  var gauge = el("gauge"), marker = gauge.querySelector(".g-marker");
  if (instant) marker.style.transition = "none";
  gauge.style.setProperty("--p", Math.min(1, to / max).toFixed(4));
  if (instant) { void marker.offsetWidth; marker.style.transition = ""; }
  el("sea").style.setProperty("--dark", (Math.pow(Math.min(1, to / 2800), 0.85) * 0.9).toFixed(3));
  el("zone").textContent = zoneOf(to);
  cancelAnimationFrame(countRaf);
  if (instant || reduceMotion || from === to) { shown = to; el("depth").textContent = fmt(to) + " m"; return; }
  var t0 = performance.now(), dur = 900;
  (function tick() {
    var k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    shown = from + (to - from) * e;
    el("depth").textContent = fmt(shown) + " m";
    if (k < 1) countRaf = requestAnimationFrame(tick); else shown = to;
  })();
}

/* ---------- screens ---------- */
function show(id) {
  ["s-start", "s-play", "s-end"].forEach(function (s) { el(s).hidden = s !== id; });
}
function renderStart() {
  el("tier-table").innerHTML = T.map(function (t, i) {
    return '<tr data-t="' + i + '"><td class="nm"><i></i>' + t.name + '<span class="ds">' + t.desc + '</span></td><td class="num">' + t.pts + ' pts</td><td class="num">' + (t.pts * M_PER_PT) + " m</td></tr>";
  }).join("");
  var b = store.get("best", 0), e = store.get("bestEndless", 0), parts = [];
  if (b) parts.push("Best dive: " + fmt(b) + " m");
  if (e) parts.push("Best endless: " + fmt(e) + " m");
  el("bests").textContent = parts.join("  ·  ");
  el("bests").hidden = !parts.length;
  el("pool-note").textContent = P.length + " prompts across geography, nature, science, sports, pop culture, history and everyday stuff. Rarity tiers are estimates, not real player data. A fan-made game inspired by Krillion.";
}
function goHome() {
  stopLoop();
  hideSug();
  G = null;
  shown = 0;
  depthTo(0, true);
  renderStart();
  show("s-start");
}

/* ---------- a game ---------- */
function newGame(mode) {
  stopLoop();
  G = { mode: mode, list: mode === "dive" ? draw(ROUNDS) : draw(1, null), idx: 0, score: 0, res: [], air: AIR_MS, phase: "play" };
  shown = 0;
  gaugeMaxNow = 0;
  depthTo(0, true);
  show("s-play");
  startRound();
}
function renderMeta() {
  var p = P[G.list[G.idx]];
  el("m-round").textContent = G.mode === "dive" ? "Prompt " + (G.idx + 1) + " of " + ROUNDS : "Endless · prompt " + (G.idx + 1);
  el("m-cat").textContent = p.g;
  el("m-score").textContent = fmt(G.score) + " pts";
  el("q").textContent = p.q;
}
function startRound() {
  G.phase = "play";
  renderMeta();
  el("s-play").classList.remove("krill");
  el("reveal").hidden = true;
  el("form").hidden = false;
  el("under").hidden = false;
  el("clock").hidden = false;
  el("clock-label").textContent = G.mode === "dive" ? "Time" : "Air";
  el("pass").textContent = G.mode === "dive" ? "Pass" : "Skip this one";
  var a = el("ans");
  a.value = "";
  fb("", "");
  hideSug();
  var now = performance.now();
  G.deadline = now + ROUND_MS;
  G.last = now;
  lastSec = -1;
  run();
  try { a.focus({ preventScroll: true }); } catch (e) { a.focus(); }
}
function fb(msg, kind) { var f = el("fb"); f.textContent = msg; f.className = "fb" + (kind ? " " + kind : ""); }

/* ---------- "Did you mean ...?" guesses ---------- */
var sugFor = null;
function hideSug() { sugFor = null; el("sug").hidden = true; el("sug-opts").textContent = ""; }
function showSug(p, opts, raw) {
  var box = el("sug-opts");
  box.textContent = "";
  opts.forEach(function (i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sug-opt";
    b.textContent = p._ans[i].name;
    b.addEventListener("click", function () { if (G && G.phase === "play") endRound({ raw: raw.trim(), i: i }, false); });
    box.appendChild(b);
  });
  el("sug-hint").textContent = opts.length > 1 ? "Tap one, or press Enter for the first." : "Tap it, or press Enter to use it.";
  sugFor = { key: TD.norm(raw, p._x), opts: opts };
  el("sug").hidden = false;
}
el("ans").addEventListener("input", function () { if (sugFor) hideSug(); });

function run() {
  cancelAnimationFrame(raf);
  var step = function () {
    if (!G || G.phase !== "play") return;
    var now = performance.now(), rem, frac;
    if (G.mode === "dive") { rem = G.deadline - now; frac = rem / ROUND_MS; }
    else { G.air -= now - G.last; G.last = now; rem = G.air; frac = rem / AIR_MS; }
    drawClock(rem, frac);
    if (rem <= 0) { if (G.mode === "dive") endRound(null, false); else outOfAir(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function stopLoop() { cancelAnimationFrame(raf); }
function drawClock(rem, frac) {
  el("clock-fill").style.transform = "scaleX(" + Math.max(0, Math.min(1, frac)).toFixed(4) + ")";
  var s = Math.max(0, Math.ceil(rem / 1000));
  if (s !== lastSec) { el("clock-num").textContent = s + "s"; lastSec = s; }
  el("clock").classList.toggle("low", rem < 7000);
}
function penalize() {
  if (G.mode === "dive") G.deadline -= PENALTY_MS; else G.air -= PENALTY_MS;
  var c = el("clock");
  c.classList.remove("hit"); void c.offsetWidth; c.classList.add("hit");
}
function shake(node) { node.classList.remove("shake"); void node.offsetWidth; node.classList.add("shake"); }

el("form").addEventListener("submit", function (e) {
  e.preventDefault();
  if (!G || G.phase !== "play") return;
  var a = el("ans"), raw = a.value, p = P[G.list[G.idx]];
  if (sugFor && sugFor.key && sugFor.key === TD.norm(raw, p._x)) { endRound({ raw: raw.trim(), i: sugFor.opts[0] }, false); return; }
  var r = TD.judge(p, raw);
  if (r.t === "empty") return;
  if (r.t === "ok") { endRound({ raw: raw.trim(), i: r.i }, false); return; }
  if (r.t === "sug") { fb("", ""); showSug(p, r.opts, raw); return; }
  hideSug();
  if (r.t === "amb") { fb(r.msg, "amb"); a.select(); return; }
  penalize();
  fb(r.t === "near" ? r.msg : "Not on the list. Try another.", "no");
  a.select();
  shake(a);
});
el("pass").addEventListener("click", function () { if (G && G.phase === "play") endRound(null, true); });

function endRound(hit, passed) {
  if (!G || G.phase !== "play") return;
  stopLoop();
  G.phase = "reveal";
  hideSug();
  revealAt = performance.now();
  var pi = G.list[G.idx], p = P[pi];
  var tier = hit ? p._ans[hit.i].tier : -1;
  var pts = tier >= 0 ? T[tier].pts : 0, airAdd = 0;
  G.score += pts;
  if (G.mode === "endless" && tier >= 0) { airAdd = T[tier].air * 1000; G.air = Math.min(G.air + airAdd, AIR_CAP); }
  var r = { pi: pi, raw: hit ? hit.raw : "", name: hit ? p._ans[hit.i].name : "", tier: tier, pts: pts, passed: !!passed };
  G.res.push(r);
  depthTo(G.score * M_PER_PT);
  el("m-score").textContent = fmt(G.score) + " pts";
  renderReveal(r, airAdd);
}

function listRow(label, text, cls) {
  var div = document.createElement("div");
  if (cls) div.className = cls;
  var dt = document.createElement("dt"); dt.textContent = label;
  var dd = document.createElement("dd"); dd.textContent = text;
  div.appendChild(dt); div.appendChild(dd);
  return div;
}
function pick(arr, n) { return shuffle(arr.slice()).slice(0, n); }

function renderReveal(r, airAdd) {
  var p = P[r.pi];
  el("form").hidden = true;
  el("under").hidden = true;
  el("clock").hidden = true;
  var pill = el("r-pill");
  pill.dataset.t = String(r.tier);
  pill.textContent = r.tier >= 0 ? T[r.tier].name : (r.passed ? "Passed" : "Out of time");
  var gain = el("r-gain");
  gain.textContent = "+" + r.pts + " pts";
  var small = document.createElement("small");
  small.textContent = r.tier >= 0 ? "· " + (r.pts * M_PER_PT) + " m deeper" + (airAdd ? " · +" + (airAdd / 1000) + "s air" : "") : "· no change in depth";
  gain.appendChild(small);

  var said = el("r-said");
  said.textContent = "";
  if (r.tier >= 0) {
    var same = TD.norm(r.raw, p._x) === TD.norm(r.name, p._x);
    var b = document.createElement("b"); b.textContent = r.name;
    if (same) { said.appendChild(document.createTextNode("You said ")); said.appendChild(b); said.appendChild(document.createTextNode(".")); }
    else { said.appendChild(document.createTextNode("You typed “" + r.raw + "”, which counts as ")); said.appendChild(b); said.appendChild(document.createTextNode(".")); }
  } else {
    said.textContent = r.passed ? "No answer this time." : "The clock ran out.";
  }
  el("r-note").textContent = r.tier >= 0 ? T[r.tier].note : "";

  var lists = el("r-lists");
  lists.textContent = "";
  lists.appendChild(listRow("One in a Krillion", p._k.name, "kr"));
  var common = p._ans.filter(function (a) { return a.tier === 0; }).slice(0, 4).map(function (a) { return a.name; });
  if (common.length) lists.appendChild(listRow("Most common", common.join(", ")));
  var clever = p._ans.filter(function (a) { return a.tier === 1; }).map(function (a) { return a.name; });
  if (clever.length) lists.appendChild(listRow("Too clever", clever.join(", ")));
  var deepTier = p._ans.some(function (a) { return a.tier === 4; }) ? 4 : 3;
  var deep = p._ans.filter(function (a) { return a.tier === deepTier && a.name !== r.name; }).map(function (a) { return a.name; });
  if (deep.length) lists.appendChild(listRow(deepTier === 4 ? "Some deep cuts" : "Some rare ones", pick(deep, 3).join(", ")));
  el("r-count").textContent = p._ans.length + " accepted answers on this list.";

  var last = G.mode === "dive" && G.idx >= ROUNDS - 1;
  el("next").textContent = last ? "See how deep you got" : "Next prompt";
  el("reveal").hidden = false;
  if (r.tier === 5) { var s = el("s-play"); s.classList.remove("krill"); void s.offsetWidth; s.classList.add("krill"); }
  setTimeout(function () { try { el("next").focus({ preventScroll: true }); } catch (e) { el("next").focus(); } }, 40);
}

function goNext() {
  if (!G || G.phase !== "reveal") return;
  if (performance.now() - revealAt < 350) return;
  if (G.mode === "dive") {
    G.idx++;
    if (G.idx >= ROUNDS) { finish(); return; }
    startRound();
    return;
  }
  var prev = P[G.list[G.idx]].g;
  G.list = G.list.concat(draw(1, prev));
  G.idx++;
  startRound();
}
el("next").addEventListener("click", goNext);
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && G && G.phase === "reveal" && document.activeElement !== el("next")) { e.preventDefault(); goNext(); }
});

function outOfAir() {
  stopLoop();
  G.res.push({ pi: G.list[G.idx], raw: "", name: "", tier: -1, pts: 0, passed: false, drowned: true });
  finish();
}

function shareText() {
  var m = G.score * M_PER_PT;
  var row = G.res.map(function (r) { return r.tier >= 0 ? T[r.tier].emoji : "⬛"; }).join("");
  if (G.mode === "dive") return "Trench Dive · " + fmt(m) + " m (" + bandOf(m) + ")\n" + row;
  var n = G.res.filter(function (r) { return r.tier >= 0; }).length;
  return "Trench Dive Endless · " + fmt(m) + " m · " + n + " answers\n" + row;
}

function finish() {
  stopLoop();
  G.phase = "end";
  var m = G.score * M_PER_PT;
  var key = G.mode === "dive" ? "best" : "bestEndless";
  var best = store.get(key, 0), isBest = m > best;
  if (isBest) store.set(key, m);
  var answered = G.res.filter(function (r) { return r.tier >= 0; }).length;
  el("e-eyebrow").textContent = G.mode === "dive" ? "Dive complete" : "Out of air";
  el("e-depth").textContent = fmt(m) + " m";
  el("e-sub").textContent = G.mode === "dive"
    ? bandOf(m) + "  ·  " + fmt(G.score) + " points  ·  " + zoneOf(m)
    : fmt(G.score) + " points  ·  " + answered + " answers  ·  " + zoneOf(m);
  var list = el("e-recap");
  list.textContent = "";
  G.res.forEach(function (r) {
    var p = P[r.pi], li = document.createElement("li");
    var pill = document.createElement("span");
    pill.className = "pill"; pill.dataset.t = String(r.tier);
    pill.textContent = r.tier >= 0 ? T[r.tier].name : (r.drowned ? "Out of air" : r.passed ? "Passed" : "Out of time");
    var mid = document.createElement("div");
    var q = document.createElement("p"); q.className = "rq-q"; q.textContent = p.q;
    var a = document.createElement("p"); a.className = "rq-a";
    a.textContent = r.tier === 5 ? "You: " + r.name + " (the Krillion)" : (r.tier >= 0 ? "You: " + r.name : "No answer") + "  ·  Krillion: " + p._k.name;
    mid.appendChild(q); mid.appendChild(a);
    var pts = document.createElement("span"); pts.className = "rq-pts"; pts.textContent = "+" + r.pts;
    li.appendChild(pill); li.appendChild(mid); li.appendChild(pts);
    list.appendChild(li);
  });
  el("e-share").textContent = shareText();
  el("e-best").textContent = isBest ? "New personal best." : "Personal best: " + fmt(best) + " m";
  el("again").textContent = G.mode === "dive" ? "Dive again" : "Start a dive";
  el("again-endless").textContent = G.mode === "endless" ? "Endless again" : "Endless dive";
  show("s-end");
  try { el("again").focus({ preventScroll: true }); } catch (e) {}
}

el("copy").addEventListener("click", function () {
  var btn = this, txt = el("e-share").textContent;
  var done = function (ok) {
    btn.textContent = ok ? "Copied" : "Select and copy";
    if (!ok) { var r = document.createRange(); r.selectNodeContents(el("e-share")); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    setTimeout(function () { btn.textContent = "Copy result"; }, 1800);
  };
  try { navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
});
el("go-dive").addEventListener("click", function () { newGame("dive"); });
el("go-endless").addEventListener("click", function () { newGame("endless"); });
el("again").addEventListener("click", function () { newGame("dive"); });
el("again-endless").addEventListener("click", function () { newGame("endless"); });
el("home").addEventListener("click", goHome);
el("quit").addEventListener("click", goHome);

/* ---------- boot (keeps a game in progress across page updates) ---------- */
function resume() {
  shown = 0; gaugeMaxNow = 0;
  depthTo(G.score * M_PER_PT, true);
  renderStart();
  if (G.phase === "end") { finish(); return; }
  show("s-play");
  if (G.phase === "reveal") { revealAt = 0; renderMeta(); renderReveal(G.res[G.res.length - 1], 0); return; }
  startRound();
}
function boot(data) {
  try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(function () { return { G: G }; }); } catch (e) {}
  var g = data && data.G;
  if (g && g.mode && Array.isArray(g.list) && g.list.length && g.list.every(function (pi) { return !!P[pi]; }) && Array.isArray(g.res)) { G = g; resume(); }
  else goHome();
}
var hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
