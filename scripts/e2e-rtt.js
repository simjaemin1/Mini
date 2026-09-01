#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-rtt.js — 일틱 조각내기의 **RTT 짝 비교** =========================
//
// ★왜 [재민 확정 2026-09-01 · T1 §3]
//   재민 실기: *"RTT 40~800"*. 원인 후보는 게임일 경계의 마을 시뮬 일틱이었고,
//   `scripts/rtt-metrics.js`(계측기)가 시간 상관을 확인해 줬다. 이 배치는 그 덩어리를 쪼갰다.
//   **쪼갠 게 실제로 RTT 를 잡았는지**는 장부가 아니라 **소켓**이 답해야 한다 — 그게 이 하네스다.
//
// ★★짝 비교다(단판 금지 — `e2e-waterperf` 가 배운 것).
//   같은 DB 스냅샷을 복사해 두 번 돌린다:
//     · 대조군 `VILLAGE_TICK_SLICE_MS=0` — **양보 끈을 뽑은** 종전 동작
//     · 현재   `VILLAGE_TICK_SLICE_MS=16` — 조각내기
//   진짜 WS 로 붙어 200ms 마다 ping → pong 왕복을 잰다(클라와 같은 경로).
//
// ★★**상황 선행 assert**: 대조군에서 스파이크가 **실제로 나야** 판정이 성립한다.
//   대조군이 멀쩡하면 이 하네스는 아무것도 안 재고 있는 것이다(자명 통과 방지선).
//   ⇒ ①이 실패하면 뒤 판정을 하지 않고 그 사실을 보고한다.
//
// ★창의 정의: `/perf` 의 `econ_day` 마크는 **마감 시점**에 찍히고 `wall`(마감에 걸린 실시간)을 싣는다.
//   그래서 창은 `[t − wall, t]` — 추측한 ±창이 아니라 **그 하루가 실제로 돈 구간**이다.
//
// 실행: node scripts/e2e-rtt.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const DAY_MS = parseInt(process.env.RTT_DAY_MS || '', 10) || 5000;
const SECS = parseInt(process.env.RTT_SECS || '', 10) || 50;
const SEED_C = '/tmp/slicer-seed-central.db', SEED_Z = '/tmp/slicer-seed-zone.db';

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const cp = (src, dst) => { for (const sfx of ['', '-wal', '-shm']) { try { fs.copyFileSync(src + sfx, dst + sfx); } catch (e) { try { fs.unlinkSync(dst + sfx); } catch (e2) {} } } };
const q = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

async function arm(label, sliceMs) {
  const CDB = `/tmp/rtt-${label}-c.db`, ZDB = `/tmp/rtt-${label}-z.db`;
  cp(SEED_C, CDB); cp(SEED_Z, ZDB);
  boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  if (!await waitHttp(`http://localhost:${CPORT}/zones`, 120)) { killAll(); return null; }
  boot('zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_DAY_MS: String(DAY_MS), ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    VILLAGE_TICK_SLICE_MS: String(sliceMs),
  });
  if (!await waitHttp(`http://localhost:${ZPORT}/health`, 600)) { killAll(); return null; }
  await sleep(2000);
  await fetch(`http://localhost:${ZPORT}/perf?reset=1`);

  const samples = [];
  const ws = new WebSocket(`ws://localhost:${ZPORT}/?username=&password=`);
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m.type === 'pong' && typeof m.t === 'number') samples.push({ t: Date.now(), rtt: Date.now() - m.t });
  });
  await sleep(2000);
  const iv = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 100);   // ★100ms — 표본이 적으면 p95 가 흔들린다
  for (let s = 0; s < SECS; s++) await sleep(1000);
  clearInterval(iv);
  const perf = await (await fetch(`http://localhost:${ZPORT}/perf`)).json();
  try { ws.close(); } catch (e) {}
  killAll();
  await sleep(4000);   // 포트 반납

  // ★창 = 그 하루가 실제로 돈 구간 [t−wall, t]
  const marks = (perf.events || []).filter((e) => e.kind === 'econ_day' && e.wall > 0);
  const inW = [], outW = [];
  for (const sm of samples) {
    (marks.some((e) => sm.t >= e.t - e.wall - 100 && sm.t <= e.t + 100) ? inW : outW).push(sm.rtt);
  }
  return { label, sliceMs, samples: samples.length, marks: marks.length,
           base: q(outW, 0.5), inP95: q(inW, 0.95), inMax: Math.max(0, ...inW), inN: inW.length, outN: outW.length,
           loop: perf.loop, tick: perf.econTick && perf.econTick.last };
}

(async () => {
  console.log('\n=== 일틱 조각내기 RTT 짝 비교 (같은 DB 스냅샷 · 진짜 WS) ===');
  if (!fs.existsSync(SEED_Z)) {
    console.log('  ✗ 씨앗 DB 가 없다 — `node scripts/test-tick-slicer.js` 를 먼저 한 번 돌려라(씨앗을 만든다).');
    process.exit(1);
  }
  const A = await arm('base', 0);
  const B = await arm('head', 16);
  if (!A || !B) { console.log('  ✗ 부팅 실패 — 판정 불가'); process.exit(1); }

  const rep = (x) => `표본 ${x.samples} · 마감 ${x.marks}회 · 평시 중앙 ${x.base}ms · **창 안 p95 ${x.inP95}ms**(최대 ${x.inMax}) → ×${(x.inP95 / Math.max(1, x.base)).toFixed(1)}`
    + ` · 루프 **최대 막힘 ${x.loop ? x.loop.max : '?'}ms**(p99 ${x.loop ? x.loop.p99 : '?'})`;
  console.log(`\n  대조군(끈 뽑음) ${rep(A)}`);
  console.log(`  조각내기(16ms) ${rep(B)}`);
  if (A.tick && B.tick) console.log(`  일틱 — 대조군 ${A.tick.total}ms/${A.tick.frames}프레임(한 프레임 최대 ${A.tick.frameMax}ms) · 현재 ${B.tick.total}ms/${B.tick.frames}프레임(한 프레임 최대 ${B.tick.frameMax}ms)\n`);

  const ra = A.inP95 / Math.max(1, A.base), rb = B.inP95 / Math.max(1, B.base);

  // ① ★상황 선행 — 대조군에서 스파이크가 실제로 나는가
  ok(A.inN >= 20 && B.inN >= 20, '① [상황] 마감 창 안 표본이 양쪽 20개 이상', `${A.inN} / ${B.inN}`);
  const sit = ra >= 5;
  ok(sit, '① [상황] 대조군 RTT 가 마감 창에서 ×5 이상 튄다', `×${ra.toFixed(1)}`);
  if (!sit) {
    console.log('\n  ⚠대조군이 안 튀었다 — 이 판은 **아무것도 재지 못했다**(자명 통과 방지선).');
    console.log('    하루를 더 짧게(RTT_DAY_MS) 하거나 세계를 더 키워 다시 돌려라.');
    console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
    process.exit(1);
  }

  // ② ★회귀 방지선 — **이 하네스가 지키는 선**. 여기가 깨지면 조각내기가 망가진 것이다.
  //   ★문턱이 왜 1/2 인가: 대조군의 막힘은 **하루에 딱 한 번**이라 그 길이가 판마다 크게 흔들린다
  //     (실측 2,419ms ~ 12,928ms). 조각내기 쪽은 여러 프레임에 퍼져 훨씬 안정적이다(766~1,344ms).
  //     그래서 비율은 ×2.6 ~ ×14 사이를 오간다 — 1/3 로 조이면 **없는 회귀를 보고**한다(실제로 그랬다).
  //     막힘의 크기 자체는 ③(루프 최대 막힘 ≤1/3)과 `test-tick-slicer ③`(한 프레임 ≤1/3)이 따로 지킨다.
  ok(B.inP95 <= A.inP95 / 2, '② 창 안 p95 가 대조군의 절반 이하', `${B.inP95}ms ≤ ${(A.inP95 / 2).toFixed(0)}ms`);
  ok(B.inMax <= A.inMax / 2, '② 창 안 **최악 왕복**도 절반 이하', `${B.inMax}ms ≤ ${(A.inMax / 2).toFixed(0)}ms`);

  // ③ 서버 쪽 증거 — 이벤트 루프가 실제로 덜 막혔다.
  //   ★**p99 가 아니라 최댓값**이다. 두 팔의 막힘은 **횟수가 다르다**: 대조군은 하루에 한 번 크게,
  //     조각내기는 서른 번 작게. p99 는 그 비대칭에 낚인다(실측: 대조군 p99 179ms인데 최대는 5,276ms).
  //     플레이어가 겪는 건 "가장 오래 막힌 한 번"이므로 그걸 잰다.
  const ap = (A.loop && A.loop.max) || 0, bp = (B.loop && B.loop.max) || 0;
  ok(bp > 0 && bp <= ap / 3, '③ 이벤트 루프 **최대 막힘**이 대조군의 1/3 이하', `${bp}ms ≤ ${(ap / 3).toFixed(1)}ms`);

  // ── ★★목표선(재민 확정 "≤×2") — **판정에 세지 않는다. 이유를 적는다.** ────────────
  //   왜 세지 않나: 이 비율의 분모가 **로컬 평시 RTT**(수 ms~수십 ms · 망이 없다)라, 조각이
  //   아무리 작아도 비율은 크게 나온다. 재민 실기의 분모는 **망을 탄 40ms** 였다.
  //   ⇒ 비율은 환경이 정하고, 배치가 실제로 산 것은 **더해진 지연(ms)** 이다. 둘 다 적는다.
  //   ⇒ 이 줄이 '미달'이라고 말하면 그건 하네스 고장이 아니라 **남은 수술**의 신호다(회부 §4-A).
  const RL_BASE = 40;   // 재민 실기 평시 RTT(ms) — 환산 기준. 손잡이가 아니라 관측값이다.
  const added = B.inP95 - B.base;                 // 마감이 **더한** 지연
  const liveRatio = (RL_BASE + added) / RL_BASE;  // 실기 분모로 환산한 비율
  const hit = liveRatio <= 2.0;
  console.log(`\n  ── 목표선(재민 확정 ≤×2) ──`);
  console.log(`     로컬 비율        대조군 ×${ra.toFixed(1)} → 현재 ×${rb.toFixed(1)}   (분모가 로컬 평시라 참고값)`);
  console.log(`     마감이 더한 지연  대조군 +${A.inP95 - A.base}ms → 현재 **+${added}ms**`);
  console.log(`     실기 환산(평시 ${RL_BASE}ms)  ×${((RL_BASE + (A.inP95 - A.base)) / RL_BASE).toFixed(1)} → **×${liveRatio.toFixed(1)}**  ${hit ? '★목표 달성' : '⚠**목표 미달**'}`);
  if (!hit) {
    console.log(`     ⇒ 남은 바닥은 **조각 하나**다(마을 한 곳의 생활층 · 캐러밴 한 대의 A*).`);
    console.log(`        슬라이서는 조각보다 잘게 못 자른다 — 그 안의 수술은 회부(회부_T1_일틱쪼개기_다음층.md §A).`);
  }

  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ${hit ? '· 목표 달성' : '· ★목표 미달(회부 §A)'} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
