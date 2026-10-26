#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-return-resume.js — T929 ①: 캐러밴 도착 경계의 귀환 길을 동기 A* 로 파지 않는다(`T929_RET_RESUME`) =================
//
// ★[T929 · T910 회부 1] econ 이 도착을 낸 경계에서 귀환 길을 고르는 줄(`_t661ReturnPts` — `getRoute` 동기 문 · `_walkFor(…, 0)`)이 그 쌍이 캐시에 없으면
//   그 자리에서 수백 ms 를 팠다(T910 §3: 347 · 513 · 810ms · `test-route-persist` ⑥ 빨강). 켬이면 몸을 만지기 전에 같은 쌍을 재개형 문으로
//   조각 몫만큼 파고, 아직이면 `'retry'`(스폰 · 재라우팅과 같은 계약)다.
//   ① 글자 — 손잡이 켬 기본(`=0` 만 끔) · 켬 줄은 inbound 갈래의 첫 줄(몸을 만지기 전) · 끔 갈래 = 종전 줄(`_t661Anchor(body, _t661ReturnPts(body), 'inbound')`) 그대로
//   ② 판 — 실서버 아이 존 둘(빠른 시계 · 선계산 끔 · 도적 끔)을 끔 · 켬 나란히 새 세계로 띄워 길 위 캐러밴이 선 뒤(날 10) **진짜 무효화 훅**을 불러
//      교역로 캐시를 비운다(길 위 캐러밴의 귀환 쌍이 빈다 — 라이브의 벽 · 울타리 무효화와 같은 문) → 8 날 더 돌린다:
//      끔 = 도착 경계에서 귀환 길을 **새로 판** 도착이 있다(`t929.cold` ≥ 1 · 자명 통과 금지 — 종전 동기 A* 가 실제로 돈다)
//      켬 = 기다린 조각이 있다(`t929.wait` ≥ 1 · 켬 줄이 돈다) · 도착 경계에서 새로 판 도착 0(`t929.cold` = 0 — 판 길은 전부 재개형 문이 팠다) ·
//           귀환이 실제로 나간다(존 로그 "귀환 출발") · 캐시에 든 길이 동기 재계산과 비트 동일(`/routedbg?audit` — T85 · 귀환 쌍 포함)
//   ⚠길 층 끔(`ENABLE_ROADS=0` — `test-route-persist` 와 같다): 답압 등급이 날마다 바뀌면 판 그날의 길과 감사 때 다시 판 길이 갈린다(답이 틀린 게 아니라 세계가 바뀐 것 · 첫 판 49/74).
//   ★ms 는 단언하지 않는다(벽시계) — 표로만 낸다(도착 경계 한 줄의 가장 긴 ms · 재개형 한 조각 최대).
// 실행: node scripts/test-return-resume.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };

console.log('\n=== T929 ① 도착 경계 귀환 길 — 동기 A* 0 ===');
console.log('\n① 글자');
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/const T929_RET_RESUME = process\.env\.T929_RET_RESUME !== '0';/.test(V), '손잡이 — 켬 기본 · `=0` 만 끔');
ok(V.includes("    if (c.state === 'inbound') {\n      if (T929_RET_RESUME && T661_ON && body._t661 && _pb > 0 && _t929RetWait(body, _pb)) { _probe.pathWait++; _probe.t929Wait = (_probe.t929Wait | 0) + 1; return 'retry'; }"),
  '켬 줄 = inbound 갈래 첫 줄(몸을 만지기 전 · 재진입 안전) · 예산 0(일괄)이면 건너뛴다');
ok(V.includes("_t661Anchor(body, _t661ReturnPts(body), 'inbound'); body._t661.L = 0;"), '끔 갈래 = 종전 줄(귀환 길 장부) 그대로');
ok(/function _t929RetWait\(body, budgetMs\) \{[\s\S]{0,300}getRouteResumable\(hereVil, homeVil, budgetMs\)[\s\S]{0,120}_walkFor\(hereVil, homeVil, budgetMs\)\.done/.test(V),
  '켬 = 같은 쌍(도착 마을 → 집 · 종전 줄과 같은 차례)을 재개형 교역로 → 재개형 걷는 길(제품 문)');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't929-'));
const zoneEnv = (db, port, extra) => Object.assign({}, process.env, { ZONE_ID: 'hanbando', PORT: String(port), DB_PATH: db, ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
  CENTRAL_SECRET: 't929', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1', T640_BOOT_SLICE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', VILLAGE_ROUTE_WARM: '0', E2E_GIVE: '1', VILLAGE_DAY_MS: '500' }, extra || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exitOf = (c, ms) => new Promise((res) => { const k = setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} }, ms); c.on('exit', (code) => { clearTimeout(k); res(code); }); });
const jget = (port, p, ms) => new Promise((res) => { const q = http.get({ host: '127.0.0.1', port, path: p, headers: { 'x-zone-secret': 't929' }, timeout: ms || 15000 }, (r) => {
  let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } }); }); q.on('error', () => res(null)); q.on('timeout', () => { q.destroy(); res(null); }); });
const base = 39000 + (process.pid % 400);
delete process.env.T929_RET_RESUME;

async function arm(tag, on, k) {
  const db = path.join(TMP, tag + '.db'), port = base + k, log = path.join(TMP, tag + '.log');
  const fd = fs.openSync(log, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env: zoneEnv(db, port, on ? {} : { T929_RET_RESUME: '0' }), stdio: ['ignore', fd, fd] });
  let dead = false; const zx = exitOf(c, 1800000).then((c) => { dead = true; return c; });   // 아이가 죽으면 기다리지 않는다
  const day = async () => { const p = await jget(port, '/perf'); return p && p.econTick ? (p.econTick.days | 0) : -1; };
  let d = -1; const t0 = Date.now();
  while (!dead && Date.now() - t0 < 900000) { await sleep(3000); d = await day(); if (d >= 10) break; }
  const inv = d >= 10 ? await jget(port, '/routedbg?invalidate=1') : null;
  const P0 = await jget(port, '/perf'); const d0 = P0 && P0.econTick ? P0.econTick.days | 0 : -1;
  while (!dead && Date.now() - t0 < 1500000 && d0 >= 0) { await sleep(3000); d = await day(); if (d >= d0 + 8) break; }
  const P1 = await jget(port, '/perf');
  const R = await jget(port, '/routedbg?audit=2000', 600000);
  try { c.kill('SIGKILL'); } catch (e) {} await zx;
  const L = fs.readFileSync(log, 'utf8');
  const pr0 = (P0 && P0.econTick && P0.econTick.probe) || {}, pr1 = (P1 && P1.econTick && P1.econTick.probe) || {};
  const t = (x) => x.t929 || { wait: 0, cold: 0, msMax: 0 };
  return { d0, d1: P1 && P1.econTick ? P1.econTick.days | 0 : -1, inv: !!(inv && inv.invalidated),
    wait: t(pr1).wait - t(pr0).wait, cold: t(pr1).cold - t(pr0).cold, msMax: t(pr1).msMax, on: t(pr1).on,
    sliceMax: pr1.pathSliceMax | 0, chunkMax: pr1.pathChunkMax | 0, jobs: (pr1.pathJobs | 0) - (pr0.pathJobs | 0),
    ret: (L.match(/귀환 출발/g) || []).length, arr: (L.match(/캐러밴#\d+ 도착:/g) || []).length, audit: R && R.audit };
}

(async () => {
  console.log('\n② 판 — 새 세계 끔 · 켬 나란히 → 날 10 에 무효화 → 8 날 더');
  const [A, B] = await Promise.all([arm('off', false, 0), arm('on', true, 1)]);
  console.log(`  (감사 — 끔 ${A.audit ? A.audit.mismatch + '/' + A.audit.n : '?'} · 켬 ${B.audit ? B.audit.mismatch + '/' + B.audit.n : '?'})`);
  console.log(`  끔: 날 ${A.d0}→${A.d1} · 도착 ${A.arr} · 귀환 출발 ${A.ret} · 새로 판 귀환 ${A.cold} · 기다림 ${A.wait} · 그 줄 최대 ${A.msMax}ms · 재개형 조각 최대 ${A.sliceMax}ms`);
  console.log(`  켬: 날 ${B.d0}→${B.d1} · 도착 ${B.arr} · 귀환 출발 ${B.ret} · 새로 판 귀환 ${B.cold} · 기다림 ${B.wait} · 그 줄 최대 ${B.msMax}ms · 재개형 조각 최대 ${B.sliceMax}ms · 알갱이 최대 ${B.chunkMax}ms · 교역로 일 ${B.jobs}`);
  ok(A.inv && B.inv && A.d1 >= A.d0 + 8 && B.d1 >= B.d0 + 8, '[상황] 두 판이 날 10 에 무효화를 받고 8 날을 더 돌았다', `끔 ${A.d0}→${A.d1} · 켬 ${B.d0}→${B.d1}`);
  ok(A.on === false && B.on === true, '[상황] 두 판의 손잡이가 갈렸다(`/perf` t929.on)');
  ok(A.cold >= 1, '[상황 · 자명 통과 금지] 끔: 도착 경계에서 귀환 길을 **새로 판** 도착이 있다(종전 동기 A*)', `${A.cold}번 · 그 줄 최대 ${A.msMax}ms`);
  ok(B.wait >= 1, '켬: 도착 경계에서 귀환 길을 기다린 조각이 있다(켬 줄이 실제로 돈다)', `${B.wait}조각`);
  ok(B.cold === 0, '★★켬: 도착 경계 줄에서 새로 판 귀환 길 0(전부 재개형 문이 조각으로 팠다)', `${B.cold}번 · 그 줄 최대 ${B.msMax}ms`);
  ok(B.ret >= 1 && B.arr >= 1, '켬: 기다린 캐러밴도 귀환을 실제로 나간다(몸이 서지 않는다)', `도착 ${B.arr} · 귀환 출발 ${B.ret}`);
  ok(B.audit && B.audit.n >= 1 && B.audit.mismatch === 0, '★켬: 캐시에 든 길(귀환 쌍 포함)이 동기 재계산과 **비트 동일**(T85)', B.audit ? `불일치 ${B.audit.mismatch}/${B.audit.n}` : '감사 실패');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})();
