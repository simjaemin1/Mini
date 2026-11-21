#!/usr/bin/env node
'use strict';
// (계측 자 · 판정 0) T1410 ① — "마을이 하루 장부를 닫는 중" 창(`villagesBusy()` = `state.tickJobs` — 하루 마감을 조각으로 도는 동안)의 길이 · 하루 몇 번.
//   존을 이 프로세스에 띄우고(central 없음 · 하네스 판 조건 env) 10ms 마다 `villagesBusy()` 를 묻는다 — 창 하나 = 참이 이어진 구간(벽시계 ms · 조각 사이 틈 포함).
//   쓰는 법: node 계측/T1410_2026-11-21/장부창.js <VILLAGE_DAY_MS> <VILLAGE_MAX> <잴 초>
//   ★판 조건: 존이 기본 포트를 안 쥐게 PORT 를 준다 · ENABLE_BANDITS/ROADS/WILDLIFE 0(blackbox 판 조건) · 끝나면 DB 를 지운다.
const path = require('path'), fs = require('fs');
const [DAY, VMAX, SEC] = [process.argv[2] || '500', process.argv[3] || '4', +(process.argv[4] || 120)];
const ROOT = path.join(__dirname, '..', '..');
const DB = require(path.join(ROOT, 'scripts', 'lib-tmp')).file('t1410busy', '.db');
Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require(path.join(ROOT, 'scripts', 'lib-port')).port(47100)), DB_PATH: DB, CENTRAL_URL: 'http://localhost:1',
  ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_MAX: VMAX, VILLAGE_DAY_MS: DAY, E2E_GIVE: '1' });
const _l = console.log; console.log = () => {}; console.warn = () => {};
require(path.join(ROOT, 'server', 'zone.js'));
const SV = require(path.join(ROOT, 'server', 'villages.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 600 && !(SV.clientVillages && SV.clientVillages().length); i++) await sleep(500);   // 마을이 설 때까지
  await sleep(3000);
  const t0 = Date.now(); let busy = false, bs = 0, nS = 0, nB = 0; const wins = [];
  while (Date.now() - t0 < SEC * 1000) {
    const b = !!SV.villagesBusy(); nS++; if (b) nB++;
    if (b && !busy) { busy = true; bs = Date.now(); }
    if (!b && busy) { busy = false; wins.push(Date.now() - bs); }
    await sleep(10);
  }
  const el = Date.now() - t0, days = el / +DAY, s = wins.slice().sort((a, b) => a - b), q = (p) => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
  console.log = _l;
  console.log(JSON.stringify({ dayMs: +DAY, villages: SV.clientVillages().length, sec: Math.round(el / 1000), windows: wins.length, perDay: +(wins.length / days).toFixed(2),
    winP50: q(0.5), winP90: q(0.9), winMax: s.length ? s[s.length - 1] : 0, busyFrac: +(nB / nS).toFixed(3), wallPerDayBusyMs: Math.round(wins.reduce((a, b) => a + b, 0) / Math.max(1, days)) }));
  process.exit(0);
})();
