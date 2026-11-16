'use strict';
// (@regress 없음 — 계측 훅 · 러너 밖 · T1277 · 판정 0)
// === scripts/t1277-prof.js — 정한 날들만 CPU 프로파일(날 머리 → 이튿날 머리) — 존 아이 프리로드 · 세계에 손대지 않는다 ===
//   쓰는 법: NODE_OPTIONS="… -r $PWD/scripts/t1277-prof.js" T1277_PROF_DAYS=50,53 node scripts/t577-server-run.js 54 1020
//     → 판 JSON 곁 `<판>-<시드>.d<날>.cpuprofile`(날마다 하나 · V8 표본 1 ms) · 날 머리 = econ `tickVillage` 그날 첫 부름(t1243 하루 CPU 칸과 같은 경계)
//   ⚠가상 시계 판도 표본기는 실제 시간으로 뜬다(값 무변 · 그날 CPU 에 표본기 몫이 얹힌다 — 프로파일 날의 하루 CPU 는 표에 쓰지 않는다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') : '';
const DAYS = new Set(String(process.env.T1277_PROF_DAYS || '').split(',').map((s) => parseInt(s, 10)).filter((d) => d > 0));
if (!OUT || !DAYS.size) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const inspector = require('inspector');
let S = null, cur = null;
function start(d) {
  try { S = new inspector.Session(); S.connect(); cur = d;
    S.post('Profiler.enable', () => S.post('Profiler.setSamplingInterval', { interval: 1000 }, () => S.post('Profiler.start'))); } catch (e) { S = null; cur = null; }
}
function stop() {
  const s = S, d = cur; S = null; cur = null; if (!s) return;
  try { s.post('Profiler.stop', (err, r) => { try { if (!err && r && r.profile) fs.writeFileSync(`${OUT}.d${d}.cpuprofile`, JSON.stringify(r.profile)); } catch (e) {} try { s.disconnect(); } catch (e) {} }); } catch (e) {}
}
let last = -1;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; if (S) stop(); if (DAYS.has(day)) start(day); } } catch (e) { /* 계측 실패는 판을 안 막는다 */ }
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (S) stop(); });
