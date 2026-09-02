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
           loop: perf.loop, tick: perf.econTick && perf.econTick.last,
           // ★[T42-b] **창 전체**의 최대 조각·최대 프레임(계측 전용) — 루프 히스토그램과 자를 맞추려면 이게 있어야 한다.
           win: perf.econTick ? { maxChunk: perf.econTick.maxChunk | 0, maxChunkAt: perf.econTick.maxChunkAt || '', frameMax: perf.econTick.frameMax | 0 } : null };
}

(async () => {
  console.log('\n=== 일틱 조각내기 RTT 짝 비교 (같은 DB 스냅샷 · 진짜 WS) ===');
  if (!fs.existsSync(SEED_Z)) {
    console.log('  ✗ 씨앗 DB 가 없다 — `node scripts/test-tick-slicer.js` 를 먼저 한 번 돌려라(씨앗을 만든다).');
    process.exit(1);
  }
  const A = await arm('base', 0);
  // ★★[T49 2026-09-02] 자기 실패 검사기 — `RTT_SABOTAGE=1` 이면 **조각내기 팔에도 끈을 뽑는다.**
  const SLICE_MS = process.env.RTT_SABOTAGE === '1' ? 0 : 16;
  if (SLICE_MS === 0) console.log('  ★사보타주 — 조각내기 팔도 끈을 뽑는다(효과비가 1 로 떨어져야 한다)');
  const B = await arm('head', SLICE_MS);
  // ★★[T49 2026-09-02] **대조군을 한 번 더 돈다 — 잡음 바닥을 재기 위해서다**(족보 80).
  //   ③ 은 "최대 막힘이 대조군의 1/3 이하"였는데 `max` 는 꼬리가 두꺼운 통계다.
  //   2026-09-01 전수에서 2258.63 ≤ 2214.6 으로 **2%** 차이로 떨어졌다 — 회귀가 아니라
  //   문턱이 잡음 폭 안에 앉아 있던 것이다. 이 파일 스스로 "비율이 ×2.6~×14 사이를 오간다"고
  //   적어 두고도 판정은 고정 비율이었다. ⇒ 그 흔들림을 **재서** 판정의 분모로 쓴다.
  const A2 = await arm('base2', 0);
  if (!A || !B || !A2) { console.log('  ✗ 부팅 실패 — 판정 불가'); process.exit(1); }

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
  // ②a **무조건 지키는 선** — 서버가 한 프레임에 막히는 시간. 이건 슬라이서가 온전히 소유한다.
  //   소켓 쪽 수치(아래 ②b)는 하루의 구성에 따라 흔들리지만 이건 안 흔들린다.
  //   ★★[T42-b] **슬라이서가 실제로 약속하는 것**부터 무조건 묻는다(②a). 약속은 "대조군의 절반"이
  //     아니라 **"한 프레임 = 조각 하나 + 예산"** 이다 — 조각보다 잘게 못 자르기 때문이다.
  //     비율(②a')은 대조군이 그날 얼마나 무거웠느냐에 달렸고, 실측으로 1,431~1,675ms 를 오간다.
  //     실제로 798ms ≤ 795ms 로 **1ms 차이**로 떨어진 판이 있었다 — 그건 슬라이서 이야기가 아니다.
  const wchunk = Math.max(1, (B.win && B.win.maxChunk) || (B.tick && B.tick.maxChunk) || 0);
  const wchunkAt = (B.win && B.win.maxChunkAt) || (B.tick && B.tick.maxChunkAt) || '?';
  const wframe = Math.max(0, (B.win && B.win.frameMax) || (B.tick && B.tick.frameMax) || 0);
  ok(wframe > 0 && wframe <= wchunk + 16 + 200, '②a ★한 프레임이 **조각 하나 + 예산** 안이다(무조건 · 슬라이서가 소유하는 선)',
    `창 전체 프레임 최대 ${wframe}ms ≤ 조각 ${wchunk}ms(${wchunkAt}) + 16 + 200`);
  //   ★★[T49 2026-09-02 · 리베이스 병합] **위 ②a 는 남긴다** — 그건 눈대중 절대값이 아니라
  //     그 판의 조각 크기에서 **유도한** 선이다(족보 74). 잡음에 안 흔들린다.
  //     아래는 T42-b 의 ②a'(대조군의 절반)를 **비율의 비율**로 바꾼 것이다 — 그 자리가
  //     "대조군이 그날 얼마나 무거웠느냐"에 달려 있던 자리다(족보 80).
  //     T42-b 의 ②a' 자체는 **참고 출력으로 내린다** — 같은 것을 두 자로 두 번 재지 않는다.
  {
    console.log(`  [참고 — 판정 아님] T42-b ②a' 여지: 대조군 한 프레임 ${A.tick ? A.tick.frameMax : '?'}ms / 조각 ${wchunk}ms`
      + ` = ×${A.tick ? (A.tick.frameMax / wchunk).toFixed(1) : '?'} (3배 미만이면 '절반'은 닿을 수 없는 선이었다)`);
    const f1 = (A.tick && A.tick.frameMax) || 0, f2 = (A2.tick && A2.tick.frameMax) || 0, fb = (B.tick && B.tick.frameMax) || 0;
    const fNoise = Math.max(f1, f2) / Math.max(1, Math.min(f1, f2));
    const fEff = ((f1 + f2) / 2) / Math.max(1, fb);
    const FK = parseFloat(process.env.RTT_FRAME_K || '1.4') || 1.4;
    console.log(`  잡음 바닥 — 대조군 두 번 한 프레임 최대 ${f1}ms vs ${f2}ms → 잡음비 ${fNoise.toFixed(3)}`);
    console.log(`  [참고 — 판정 아님] 절대 문턱 1/2 · ${fb && fb <= f1 / 2 ? '넘음' : '★못 넘음'}  (${fb}ms vs ${(f1 / 2).toFixed(0)}ms)`);
  // ★★[T49 후속 2026-09-02] **잡음이 크면 판정하지 않는다.**
  //   전수 2회차에서 이 자리가 빨갰다 — 효과비 2.63 인데 **잡음비가 2.001** 이라 비율의 비율이
  //   1.32 로 떨어진 것이다. 같은 조건 두 판이 2배 벌어지는 판에서는 3배 개선도 증명이 안 된다.
  //   그런데 그때 빨갛게 죽으면 읽는 사람은 **제품 회귀**로 오독한다. 사실은 "못 쟀다"다.
  //   ⇒ 잡음이 문턱을 넘으면 그 사실을 적고, **나빠지지는 않았다**만 지킨다(e2e-weight 와 같은 결).
  //   ★K 를 한 표본으로 정한 게 내 실수였다 — 그 실수는 문턱을 낮춰 덮지 않고 이렇게 갈랐다.
    const NMAX = parseFloat(process.env.RTT_NOISE_MAX || '1.5') || 1.5;
    ok(fNoise < 3, '②a 전제 — 자가 믿을 만하다(같은 조건 두 번이 3배 안)', `잡음비 ${fNoise.toFixed(3)}`);
    if (fNoise < NMAX) {
      ok(fb > 0 && fEff > fNoise * FK,
         `②a **한 프레임 막힘**이 줄었다(서버 쪽) — 비율의 비율 ${(fEff / Math.max(0.01, fNoise)).toFixed(2)} > ${FK}`,
         `효과비 ${fEff.toFixed(2)}(대조 중앙 ${((f1 + f2) / 2).toFixed(0)}ms → ${fb}ms) vs 잡음비 ${fNoise.toFixed(3)}`);
    } else {
      console.log(`  ★이 판은 잡음이 커서(${fNoise.toFixed(3)} ≥ ${NMAX}) ②a 를 가를 수 없다 — 판정하지 않는다("안 줄었다"가 아니라 "못 쟀다").`);
      ok(fb > 0 && fEff > 1, '②a [잡음 큼] 최소한 **나빠지지는 않았다**(이것만 잰다)',
         `효과비 ${fEff.toFixed(2)} · 잡음비 ${fNoise.toFixed(3)}`);
    }
  }

  // ★★[상황 선행 · T41 뒤에 필요해졌다] **쪼갤 여지가 있는 판인가.**
  //   최악 왕복(`inMax`)은 대조군에선 '하루 전체', 조각내기에선 '가장 큰 조각 하나'다.
  //   그런데 T41 이 집터 헛수고(하루의 56%)를 없애면서 **대조군의 하루도 같이 가벼워졌고**,
  //   남은 하루는 캐러밴 콜드 A*(1.3~1.7초) 한 조각이 대부분이다. 그런 판에서는
  //   조각내기가 최악값을 못 줄인다 — **슬라이서는 조각보다 잘게 못 자르기 때문**이다.
  //   ⇒ 그건 하네스 고장이 아니라 **T42 가 풀 문제**다. 그러니 여지가 없으면 판정을 유보하고
  //     그 사실을 수치로 적는다(없는 회귀를 보고하지 않는다).
  //   ★★[T42-b 2026-09-01 · 문지방을 **판정과 같은 계기로** 잰다] 여지를 서버 쪽 수치
  //     (`A.tick.frameMax`)로 재던 것을 **소켓 쪽 관측**으로 바꿨다. 왜: 실측 두 판이
  //     서버 여지 ×3.9 로 **똑같은데** 대조군 창 안 p95 는 1,498ms 와 10,392ms 로 7배 달랐다
  //     (마감 창에 핑이 몇 개나 물리느냐가 판마다 다르다). 앞 판에서 ②b 가 838ms ≤ 749ms 로
  //     떨어졌는데, 그건 슬라이서가 나빠진 게 아니라 **대조군이 그날따라 순했던 것**이다.
  //     ⇒ 소켓 판정의 문지방은 소켓 수치로 잰다: 조각내기 팔은 **조각 하나 밑으로 못 내려가고**
  //       실측 바닥이 조각의 2~3배(838/385 · 810/369)다. 그러니 대조군이 조각의 **6배**는 돼야
  //       "절반으로 줄였다"가 슬라이서 이야기가 된다. 그 아래면 유보하고 수치만 적는다.
  const chunk = Math.max(1, (B.tick && B.tick.maxChunk) || 0);
  const room = (A.tick && B.tick) ? (A.tick.frameMax / chunk) : 0;
  //   ★★[T42-b 셋째 판] **소켓 쪽 바닥은 '조각 하나'가 아니다.** 실측 다섯 판에서 조각내기 팔의
  //     창 안 p95 는 **777~838ms 로 거의 안 흔들렸다**(조각이 240ms 인 판에서도 825ms 였다) —
  //     그 값을 정하는 건 조각 크기가 아니라 **프레임 리듬**(30Hz × 17~18프레임)이기 때문이다.
  //     반면 대조군은 1,482~10,392ms 로 7배를 오간다. ⇒ "절반 이하"는 대조군이 ~1,600ms 를
  //     넘을 때만 **애초에 닿을 수 있는 선**이고, 그 아래에서 세면 없는 회귀를 보고한다(족보 (80)).
  //     ⇒ 문지방을 **관측된 바닥에서** 끌어온다: 대조군이 3,000ms(바닥의 약 ×4) 이상일 때만 센다.
  //       그 아래면 유보하고 수치만 적는다 — 서버 쪽 무조건선(②a·③)이 대신 지킨다.
  const SOCK_FLOOR = 3000;   // 관측 바닥 777~838ms 에서 끌어온 값(가정 아님 — 위 주석의 실측)
  const gate = (ctl) => ctl >= SOCK_FLOOR;
  console.log(`  · 쪼갤 여지 ×${room.toFixed(1)} — 대조군 한 프레임 ${A.tick ? A.tick.frameMax : '?'}ms ÷ 가장 큰 조각 ${B.tick ? B.tick.maxChunk : '?'}ms(${B.tick ? B.tick.maxChunkAt : '?'})`);
  console.log(`  · 소켓 여지 — 대조군 p95 ${A.inP95}ms · 최악 ${A.inMax}ms  (②b 는 각각 ${SOCK_FLOOR}ms 이상일 때만 센다 — 조각내기 팔의 관측 바닥이 ~800ms)`);
  const _defer = (nm, ctl, cur) => {
    console.log(`  · [${nm} 판정 유보] 대조군 ${ctl}ms < ${SOCK_FLOOR}ms — 현재 ${cur}ms(×${(ctl / Math.max(1, cur)).toFixed(2)}).`);
    console.log(`    조각내기 팔의 바닥이 ~800ms(프레임 리듬)라, 대조군이 그 두 배를 못 넘으면 '절반 이하'는 닿을 수 없는 선이다.`);
  };
  if (room >= 3 && gate(A.inP95)) {
    ok(B.inP95 <= A.inP95 / 2, '②b 창 안 p95 가 대조군의 절반 이하', `${B.inP95}ms ≤ ${(A.inP95 / 2).toFixed(0)}ms`);
  } else _defer('②b p95', A.inP95, B.inP95);
  if (room >= 3 && gate(A.inMax)) {
    ok(B.inMax <= A.inMax / 2, '②b 창 안 **최악 왕복**도 절반 이하', `${B.inMax}ms ≤ ${(A.inMax / 2).toFixed(0)}ms`);
  } else _defer('②b 최악', A.inMax, B.inMax);

  // ③ 서버 쪽 증거 — 이벤트 루프가 실제로 덜 막혔다.
  //   ★**p99 가 아니라 최댓값**이다. 두 팔의 막힘은 **횟수가 다르다**: 대조군은 하루에 한 번 크게,
  //     조각내기는 서른 번 작게. p99 는 그 비대칭에 낚인다(실측: 대조군 p99 179ms인데 최대는 5,276ms).
  //     플레이어가 겪는 건 "가장 오래 막힌 한 번"이므로 그걸 잰다.
  const ap = (A.loop && A.loop.max) || 0, bp = (B.loop && B.loop.max) || 0;
  //   ★★[T42-b] ②a 와 같은 규약 — **무조건선은 조각으로, 비율은 여지가 있을 때만**.
  //     루프 히스토그램은 **창 전체**라 조각도 창 전체 최댓값으로 잰다(자를 하나로).
  ok(bp > 0 && bp <= wchunk * 2 + 300, '③ ★루프 최대 막힘이 **가장 큰 조각 안**이다(무조건)',
    `${bp.toFixed(0)}ms ≤ 창 전체 최대 조각 ${wchunk}ms(${wchunkAt}) × 2 + 300`);
  //   ★★[T49 2026-09-02 · 리베이스 병합] 위 무조건선(조각에서 유도)은 남기고,
  //     T42-b 의 ③'(대조군의 1/3)만 **비율의 비율**로 바꾼다 — 같은 것을 두 자로 두 번 재지 않는다.
  console.log(`  [참고 — 판정 아님] T42-b ③' 여지: 대조군 루프 최대 ${ap.toFixed(0)}ms / 조각 ${wchunk}ms = ×${(ap / wchunk).toFixed(1)}`);
  const ap2 = (A2.loop && A2.loop.max) || 0;
  const lNoise = Math.max(ap, ap2) / Math.max(1, Math.min(ap, ap2));
  const lMed = (ap + ap2) / 2;
  const lEff = lMed / Math.max(1, bp);
  const LK = parseFloat(process.env.RTT_LOOP_K || '1.6') || 1.6;
  console.log(`  잡음 바닥 — 대조군 두 번 최대 막힘 ${ap}ms vs ${ap2}ms → 잡음비 ${lNoise.toFixed(3)}`);
  console.log(`  [참고 — 판정 아님] 절대 문턱 1/3 · ${bp > 0 && bp <= ap / 3 ? '넘음' : '★못 넘음'}  (${bp}ms vs ${(ap / 3).toFixed(1)}ms)`);
  const LNMAX = parseFloat(process.env.RTT_NOISE_MAX || '1.5') || 1.5;
  ok(lNoise < 3, '③ 전제 — 자가 믿을 만하다(같은 조건 두 번이 3배 안)', `잡음비 ${lNoise.toFixed(3)}`);
  if (lNoise < LNMAX) {
    ok(bp > 0 && lEff > lNoise * LK,
       `③ 이벤트 루프 **최대 막힘**이 줄었다 — 비율의 비율 ${(lEff / Math.max(0.01, lNoise)).toFixed(2)} > ${LK}`,
       `효과비 ${lEff.toFixed(2)}(대조 중앙 ${lMed.toFixed(0)}ms → ${bp}ms) vs 잡음비 ${lNoise.toFixed(3)}`);
  } else {
    console.log(`  ★이 판은 잡음이 커서(${lNoise.toFixed(3)} ≥ ${LNMAX}) ③ 을 가를 수 없다 — 판정하지 않는다.`);
    ok(bp > 0 && lEff > 1, '③ [잡음 큼] 최소한 **나빠지지는 않았다**(이것만 잰다)',
       `효과비 ${lEff.toFixed(2)} · 잡음비 ${lNoise.toFixed(3)}`);
  }

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
