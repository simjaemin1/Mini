#!/usr/bin/env node
// === scripts/t640-boot-check.js — 새 세계 첫 부팅: 도적 표본 조각 판이 종전(부팅 한 번에)과 바이트가 같은가 [T640 ① · 2026-10-04] =====
//
// ★묻는 것: 켬(★[T655] 기본 · `T640_BOOT_SLICE=0` 이 종전 끔)이면 표본(유한 쌍 전부 교역로 A*)을 listen 뒤 틱마다 판다. 그 사이 길 칸이 등급을 받아도
//   표본은 부팅 순간 지도(얼린 길)만 보는가 ⇒ 교역로 캐시 · 소굴 자리가 끔 판과 바이트가 같은가.
// ★`--grade` — 부팅 직후(표본이 도는 동안) 첫 마을 · 가운데 마을 가운데 칸에 등급을 준다(정본 문 `roads.stampCell` · T619 자와 같은 문법).
//   관측자가 붙어 몸이 밟는 일을 기다리면 이 판에선 600초 안에 칸이 안 바뀐다(T619 보고 §①) — 그래서 정본 문으로 직접.
// ★재기만 한다 — 제품 코드 0 · 러너 밖. 존을 이 프로세스 안에 띄운다(`test-regrow-block` bootZone 문법).
// 실행: T640_BOOT_SLICE=0 node scripts/t640-boot-check.js --out /tmp/t640/off.json            (끔)
//       node scripts/t640-boot-check.js --grade --out /tmp/t640/on.json                       (켬 · 기본)
//       node scripts/t640-boot-check.js --cmp /tmp/t640/off.json /tmp/t640/on.json
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const say = console.log.bind(console);
if (argv[0] === '--cmp') {
  const a = JSON.parse(fs.readFileSync(argv[1], 'utf8')), b = JSON.parse(fs.readFileSync(argv[2], 'utf8'));
  const keys = new Set([...Object.keys(a.routes), ...Object.keys(b.routes)]);
  let same = 0, diff = 0, onlyA = 0, onlyB = 0;
  for (const k of keys) {
    if (!(k in a.routes)) { onlyB++; continue; } if (!(k in b.routes)) { onlyA++; continue; }
    if (a.routes[k] === b.routes[k]) same++; else diff++;
  }
  say(JSON.stringify({ pairs: keys.size, same, diff, onlyA, onlyB, densSame: JSON.stringify(a.dens) === JSON.stringify(b.dens), dens: [a.dens, b.dens],
    upMs: [a.upMs, b.upMs], slice: b.slice || a.slice || null, graded: [a.graded, b.graded] }));
  process.exit(diff || onlyA || onlyB ? 1 : 0);
}
const OUT = val('--out', '/tmp/t640-boot.json'), GRADE = argv.includes('--grade');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const DB = `/tmp/t640b-${process.pid}.db`;
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(43000 + (process.pid % 500)), DB_PATH: DB, ENABLE_WILDLIFE: '0', E2E_GIVE: '1', ENABLE_VILLAGES: '1' });
  const log = [];
  console.log = (...a) => log.push(a.join(' ')); console.warn = console.log; console.error = console.log;
  const t0 = Date.now();
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const upMs = Date.now() - t0;   // 모듈 적재 = 부팅 동기 몫(시딩 · 거리행렬 · 도적 init) — 이 뒤로 listen · 틱
  const H = Zone.__testBind();
  const V = H.SimVillages, B = V.__p3Bind({}), S = B.state, RD = H.Roads;
  const Bd = require(path.join(ROOT, 'server', 'bandits.js'));
  const graded = [];
  if (GRADE) {
    for (const vil of [S.villages[0], S.villages[Math.floor(S.villages.length / 2)]]) {
      let lv = 0, n = 0; while (lv < 1 && n < 1000) { lv = RD.stampCell(vil.ccx, vil.ccy); n++; }
      graded.push({ vil: vil.name, lv, coarse: RD._S.coarse.size });
    }
  }
  //   표본이 끝날 때까지(끔이면 이미 끝났다) — 도적 준비 줄이 증인
  let slice = null;
  for (let i = 0; i < 7200; i++) { if (log.some((l) => /도적 시뮬 준비/.test(l))) break; await sleep(250); }
  slice = Bd.bootSlice ? Bd.bootSlice() : null;
  const doneMs = Date.now() - t0;
  const routes = {};
  for (const k of [...S.routeCache.keys()].sort()) routes[k] = crypto.createHash('sha1').update(JSON.stringify(S.routeCache.get(k))).digest('hex');
  const dens = (Bd.clientCamps ? Bd.clientCamps() : null);
  const out = { arm: process.env.T640_BOOT_SLICE === '0' ? 'off' : 'on', upMs, doneMs, graded, slice, pairs: Object.keys(routes).length, dens, routes,
    coarseNow: RD._S.coarse.size, readyLine: (log.find((l) => /도적 시뮬 준비/.test(l)) || '').slice(0, 200),
    sliceLines: log.filter((l) => /T640/.test(l)).map((l) => l.slice(0, 300)) };
  fs.writeFileSync(OUT, JSON.stringify(out));
  say(JSON.stringify(Object.assign({}, out, { routes: undefined })));
  try { fs.unlinkSync(DB); } catch (e) {}
  process.exit(0);
})().catch((e) => { say(e && e.stack); process.exit(1); });
