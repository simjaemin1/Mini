'use strict';
// (@regress 없음 — 러너 밖 · T728 ⑥ 계측기 · 제품 무변)
// === scripts/t728-jump-hook.js — 다시 뜬 존(실제 시계)에 얹는다: 시계 흉내(+N 분) · 날 뜀 뒤 첫 econ 틱에서 밀린 캐러밴이 도착했나 ==========
//   T728_JUMP_OFF_MS = Date.now 에 더할 ms(멈춘 N 분 흉내) · T728_JUMP_OUT = 결과 JSON · T728_JUMP_DAYS = 몇 번째 econ 틱 뒤에 끝낼까(기본 0 = 준비 뒤 바로)
const fs = require('fs');
const path = require('path');
const OFF = +process.env.T728_JUMP_OFF_MS || 0;
const OUT = process.env.T728_JUMP_OUT || '';
const DAYS = +process.env.T728_JUMP_DAYS || 0;
if (OFF) { const _n = Date.now; Date.now = function () { return _n() + OFF; }; }
const ROOT = path.join(__dirname, '..');
const VILL = path.join(ROOT, 'server', 'villages.js');
const Module = require('module');
const _load = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VILL) { const src = fs.readFileSync(filename, 'utf8') + '\n;module.exports.__t728j = function () { return state; };\n'; return m._compile(src, filename); }
  return _load(m, filename);
};
const R = { off: OFF, ticks: [] };
const overdue = (W) => (W.caravans || []).filter((c) => !c._done && ((c.state === 'outbound' && W.day >= c.arriveDay) || (c.state === 'inbound' && W.day >= c.returnArriveDay))).length;
const overOut = (W) => (W.caravans || []).filter((c) => !c._done && c.state === 'outbound' && W.day >= c.arriveDay).length;
const overIn = (W) => (W.caravans || []).filter((c) => !c._done && c.state === 'inbound' && W.day >= c.returnArriveDay).length;
const iv = setInterval(() => {
  let st; try { st = require(VILL).__t728j(); } catch (e) { return; }
  if (!st || !st.ready || !st.world) return;
  if (!R.ready) {
    const W = st.world;
    R.ready = { at: Date.now(), econDay: W.day, wallDay: Math.floor((Date.now() - st.epoch) / st.dayMs), lastGameDay: st.lastGameDay, dayMs: st.dayMs, epoch: st.epoch,
      caravans: (W.caravans || []).length, ids0: (W.caravans || []).map((c) => [c.id, c.state, c._t707 ? 1 : 0]), overdue: overdue(W), overOut: overOut(W), overIn: overIn(W), restored: require(VILL).t728Stat ? require(VILL).t728Stat().restored : null,
      calNext: require(VILL).t728CalNext ? require(VILL).t728CalNext() : null };
    R.lastDay = W.day;
    if (!DAYS) { fs.writeFileSync(OUT, JSON.stringify(R)); process.kill(process.pid, 'SIGTERM'); }
    return;
  }
  const W = st.world;
  if (W.day !== R.lastDay && !st.tickJobs) {
    R.lastDay = W.day;
    const tl = (W.tradeLog || []).filter((t) => (t.day | 0) === (W.day | 0)).length;
    R.ticks.push({ at: Date.now(), econDay: W.day, wallDay: Math.floor((Date.now() - st.epoch) / st.dayMs), caravans: (W.caravans || []).length, overdue: overdue(W), overOut: overOut(W), overIn: overIn(W), tradeToday: tl, ids: (W.caravans || []).filter((c) => !c._done).map((c) => [c.id, c.state, c._t707 ? 1 : 0]), inSample: (W.caravans || []).filter((c) => !c._done && c.state === 'inbound' && W.day >= c.returnArriveDay).slice(0, 4).map((c) => { const o = {}; for (const k of Object.keys(c)) { const x = c[k]; o[k] = (x && typeof x === 'object') ? (x.name || (k === 'trader' ? x.id : '{' + Object.keys(x).slice(0, 6).join(',') + '}')) : x; } return o; }) });
    if (R.ticks.length >= DAYS) { clearInterval(iv); fs.writeFileSync(OUT, JSON.stringify(R)); process.kill(process.pid, 'SIGTERM'); }
  }
}, 20);
