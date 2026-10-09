#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-tick-slicer.js — 일틱 **조각내기** 구조 검사 =====================
//
// ★왜 [재민 확정 2026-09-01 · T1]
//   실기 RTT 가 이따금 ×10 으로 튄다. 원인은 게임일 경계에서 마을 시뮬이 이벤트 루프를
//   **한 덩어리로** 잡아먹기 때문이다(실측 중앙 2,018ms). 이 배치는 그 덩어리를
//   **단계 경계·마을 경계**에서 여러 프레임에 나눈다.
//
// ★★이 하네스가 재는 것은 **구조**다(RTT 자체는 `e2e-rtt` 가 짝 비교로 잰다).
//   구조란: ⓐ 조각이 실제로 나뉘는가 ⓑ 최대 조각이 내려갔는가
//           ⓒ **순서가 그대로인가**(조각내기는 *언제*를 바꾸지 *무엇을*은 안 바꾼다)
//           ⓓ 하루가 남김없이 끝나는가(조각이 남으면 그날은 영원히 안 끝난다).
//
// ★★**상황 선행 assert**(①): 대조군(`VILLAGE_TICK_SLICE_MS=0` — 양보 끈을 뽑은 종전 동작)에서
//   일틱이 정말 **한 프레임에 몰리는지** 먼저 확인한다. 이게 실패하면 이 하네스는 아무것도
//   재고 있지 않은 것이다(이 레포가 여러 번 당한 '자명 통과'의 예방선).
//
// ★짝 비교다 — 같은 DB 스냅샷을 **복사해** 두 번 돌린다. 세계가 달라지면 ms 비교가 무의미하다.
//
// 실행: node scripts/test-tick-slicer.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const DAY_MS = parseInt(process.env.SLICER_DAY_MS || '', 10) || 5000;
const DAYS = parseInt(process.env.SLICER_DAYS || '', 10) || 6;
// ★DB 를 **재사용**한다 — 50마을 시딩이 첫 부팅에 수 분 걸린다(그건 재는 대상이 아니다).
//   두 팔이 같은 세계에서 출발하도록 스냅샷을 팔마다 복사한다.
// ★[T49 2026-09-02] 씨앗 경로·시딩 절차는 `scripts/slicer-seed.js` 가 정본이다.
//   `test-site-memo` 가 같은 씨앗을 쓰는데 러너 이름순으로 **그쪽이 먼저** 돈다 —
//   양쪽이 각자 시딩 코드를 들면 사본이고, 한쪽만 들면 다른 쪽이 영영 못 돈다.
const { SEED_C, SEED_Z, ensureSeed } = require('./slicer-seed.js');

let pass = 0, fail = 0;
let STOP_AT = null;   // ★[T665] 씨앗 날 + DAYS(아래 씨앗 준비 뒤에 읽는다)
const _t665 = {};   // ★[T665] 쌍마다 경제 크기 차(바닥 재기 — `T665_DUMP` 가 있을 때만 파일로)
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
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const cp = (src, dst) => { for (const sfx of ['', '-wal', '-shm']) { try { fs.copyFileSync(src + sfx, dst + sfx); } catch (e) { try { fs.unlinkSync(dst + sfx); } catch (e2) {} } } };

// ── 한 팔: 부팅 → DAYS 게임일 → /perf 수확 ──────────────────────────────────
async function arm(label, sliceMs, extraEnv) {
  const CDB = `/tmp/slicer-${label}-c.db`, ZDB = `/tmp/slicer-${label}-z.db`;
  const ECON = `/tmp/slicer-${label}-econ.jsonl`; try { fs.unlinkSync(ECON); } catch (e) {}   // ★[T645] ⑨ 의 증인(econ 마을 칸 조각 이름 — `slicer-econ-ids.js`)
  cp(SEED_C, CDB); cp(SEED_Z, ZDB);
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  // ★★[T349 2026-09-21] 기동 증인은 **아이의 입**이다(정본 `fixture-boot.waitUp` · T344).
  //   포트 응답은 증인이 아니다 — 앞 판 central 이 포트를 쥔 채면 새 central 은 `EADDRINUSE` 로 즉시
  //   죽는데 그 폴링은 **앞 판의 central** 에게 200 을 받아 "떴다"고 답한다(T344 가 두 번 재현).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다 — `await` 만 아래로 내린다(표식은 ~120ms 뒤에 찍힌다).
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _up = await _upP;
  if (!_up.ok) { console.log(`  ★${_up.why}`); killAll(); return null; }
  const _zone = boot('zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_DAY_MS: String(DAY_MS), ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    VILLAGE_TICK_SLICE_MS: String(sliceMs),
    SLICER_BAIT: '',   // ★[T665] 미끼는 부모 env 에서 새지 않게 — 조각내기 팔만 `extraEnv` 로 받는다
    ...(extraEnv || {}),   // ★[T513] 팔마다 손잡이 하나 더(`T513_DAY_SLICE` 팔)
    // ★[T645] ⑨ 증인 — econ 정본 조각의 마을 칸이 하루에 어느 마을로 따로 불렸나(시간 무관 · 존 코드 무접촉 · 값 무변)
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${path.join(__dirname, 'slicer-econ-ids.js')} --require ${path.join(__dirname, 'slicer-day-stop.js')}`.trim(), SLICER_ECON_OUT: ECON,
    SLICER_STOP_DAYS: String(DAYS),   // ★[T665] 모든 팔을 같은 날에서 세운다(`slicer-day-stop.js` — 같은 날끼리 견주게)
    ...(STOP_AT != null ? { SLICER_STOP_AT: String(STOP_AT) } : {}),   //   절대 날 = 씨앗 날 + DAYS(부팅 날을 늦게 읽어 한 팔만 하루 밀리던 판이 있었다)
    // ★[T42 뒤] 교역로 **선계산을 끈다.** 이 하네스의 주제는 *일틱 조각내기*이고, 선계산은
    //   무인 프레임에 A*(100~1,900ms)를 도는 별개 층이다. 켜 두면 루프 지연·경제 잡음이
    //   그쪽에서 들어와 조각내기를 못 잰다(실제로 ⑥·⑧이 그걸로 흔들렸다).
    //   선계산 자체의 값과 대가는 `test-route-persist` 가 잰다.
    VILLAGE_ROUTE_WARM: '0',
  });
  // ★★[T355 2026-09-22] 존 기동도 **아이의 입**으로 듣는다(정본 `fixture-boot.waitUp` · T344·T349).
  //   포트 응답은 증인이 아니다 — 앞 판 존이 포트를 쥔 채면 새 존은 `EADDRINUSE` 로 죽고 폴링은
  //   **앞 판의 존**에게 200 을 받는다. 존은 하네스마다 **세계가 다르므로**(다른 DB·다른 래퍼)
  //   남의 존에 붙으면 세계가 통째로 바뀐 채로 재게 된다 — central 보다 더 나쁘다.
  //   ⚠실측(이 카드 · 3판): 존 기동은 **78.8~83.1초**가 걸리고 아이의 입과 1초 폴링의 차는
  //     **177~306ms** 뿐이다 — central 때처럼 "우연히 벌어 주던 1초"가 **여기엔 없다**(재는 값 무변).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다(T349 ⑧ 함정) — `await` 만 아래로 내린다.
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!await (await _zp).ok) { killAll(); return null; }
  await sleep(1500);
  await fetch(`http://localhost:${ZPORT}/perf?reset=1`);   // ★창을 열기 직전에 루프 히스토그램 영점
  let j = null;
  for (let i = 0; i < 300; i++) {
    await sleep(2000);
    j = await (await fetch(`http://localhost:${ZPORT}/perf`)).json();
    if (j.econTick && j.econTick.days >= DAYS) break;
  }
  // ★저장 큐를 다 흘려 보내고 스냅샷을 뜬다 — 저장은 **1마을/틱**이라, 그냥 끄면 팔마다
  //   '어제치가 남은 마을 수'가 달라진다(실측: 한쪽 49곳이 526일 · 다른 쪽 50곳이 527일).
  //   그 상태로 DB 를 대조하면 **없는 발산을 보고**하게 된다(⑧이 첫 판에 정확히 그랬다).
  //   ⚠계측(`j`)은 **위에서 이미 떴다** — 이 대기 구간은 판정 창 밖이다.
  //   ★[T665] 날이 얼었으니(`slicer-day-stop.js`) 마을 행이 **다 같은 날**로 저장될 때까지 기다렸다 끈다(종전: 하루 둘을 더 흘리고 끝 —
  //     끄는 순간 팔마다 저장된 날이 갈려 같은 날 마을이 0~4곳만 남는 판이 있었다). 상한은 종전 대기의 다섯 배(배수가 못 끝나면 그대로 끄고 전제가 말한다).
  { const { DatabaseSync } = require('node:sqlite');
    const until = Date.now() + (DAY_MS * 2 + 1000) * 5;
    let last = null;
    for (;;) {
      let days = null;
      try { const db = new DatabaseSync(ZDB, { readOnly: true }); days = db.prepare('SELECT MIN(day) lo, MAX(day) hi, COUNT(*) n FROM villages WHERE econ_state IS NOT NULL').get(); db.close(); } catch (e) {}
      last = days;
      if (days && days.n > 0 && days.lo === days.hi && (STOP_AT != null ? days.hi >= STOP_AT : (j && j.econTick && j.econTick.last && days.hi >= j.econTick.last.day))) break;
      if (Date.now() > until) break;
      await sleep(500);
    }
    //   진단 한 줄 — 팔이 몇 일 행으로 섰나(전제가 빨가면 여기부터 본다)
    console.log(`  · [${label}] 마을 행 날 ${last ? `${last.lo}~${last.hi} · ${last.n}곳` : '—'}${STOP_AT != null ? ` (목표 ${STOP_AT})` : ''}`);
  }
  killAll();
  await sleep(4000);   // 포트 반납(직전 배치의 교훈 — 연속 부팅은 바인드에 실패한다)
  return j;
}

(async () => {
  console.log('\n=== 일틱 조각내기 구조 검사 (짝 비교 · 같은 DB 스냅샷) ===');
  // 씨앗 DB — 없으면 한 번 만들어 둔다(그 뒤로는 재사용). 절차는 공용 정본이 갖고 있다.
  { const r = await ensureSeed();
    if (!r.ok) { console.log(`  ✗ 씨앗 준비 실패 — ${r.why}`); process.exit(1); } }
  //   ★[T665] 씨앗 날 — 모든 팔이 여기서 출발해 씨앗 날 + DAYS 에서 선다(`slicer-day-stop.js`)
  try { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(SEED_Z, { readOnly: true });
    const r = db.prepare('SELECT MAX(day) d FROM villages').get(); db.close(); if (r && Number.isFinite(r.d)) STOP_AT = r.d + DAYS; } catch (e) { STOP_AT = null; }
  console.log(`  · 씨앗 날 ${STOP_AT != null ? STOP_AT - DAYS : '?'} → 모든 팔이 ${STOP_AT != null ? STOP_AT : '부팅 날 + ' + DAYS} 일에서 선다(T665)`);

  const A = await arm('base', 0);    // 대조군 — 양보 끈을 뽑았다(종전 동작)
  // ★★[T49 2026-09-02] 자기 실패 검사기 — `SLICER_SABOTAGE=1` 이면 **조각내기 팔에도 끈을 뽑는다.**
  //   판정을 비율의 비율로 옮겼으니, 그 판정이 "무엇을 넣어도 통과"하지 않는다는 걸
  //   밖에서 한 번 돌려 빨간 걸 보일 수 있어야 한다. 기본 부팅엔 이 분기가 없다.
  const SLICE_MS = process.env.SLICER_SABOTAGE === '1' ? 0 : 16;
  if (SLICE_MS === 0) console.log('  ★사보타주 — 조각내기 팔도 끈을 뽑는다(효과비가 1 로 떨어져야 한다)');
  const B = await arm('head', SLICE_MS, process.env.SLICER_BAIT ? { SLICER_BAIT: process.env.SLICER_BAIT } : null);   // 조각내기 · ★[T665] 미끼는 이 팔에만
  // ★★[T49 2026-09-02] **대조군을 한 번 더 돈다 — 잡음 바닥을 재기 위해서다**(족보 80).
  //   ⑥ 은 "최대 막힘이 대조군의 1/3 이하"였는데, `max` 는 꼬리가 두꺼운 통계다.
  //   2026-09-01 전수에서 2183.14 ≤ 2118.1 로 **3%** 차이로 떨어졌다 — 그건 회귀가 아니라
  //   문턱(1/3)이 잡음 폭 안에 앉아 있던 것이다.
  //   ⇒ 같은 조건(A) 을 두 번 돌려 **그 자의 흔들림**을 재고, 판정을 비율의 비율로 옮긴다.
  const A2 = await arm('base2', 0);
  if (!A || !B || !A2 || !A.econTick || !B.econTick || !A.econTick.last || !B.econTick.last) {
    console.log('  ✗ 부팅/수확 실패 — 판정 불가'); process.exit(1);
  }
  const a = A.econTick.last, b = B.econTick.last;
  const fmt = (x) => `${x.day}일 · 총 ${x.total}ms · 조각 ${x.chunks} · 프레임 ${x.frames} · **한 프레임 최대 ${x.frameMax}ms** · 최대 조각 ${x.maxChunk}ms(${x.maxChunkAt})`;
  console.log(`\n  대조군(끈 뽑음) ${fmt(a)}`);
  console.log(`  조각내기(16ms) ${fmt(b)}`);
  console.log(`  이벤트 루프 지연 — 대조군 p99 ${A.loop && A.loop.p99}ms(최대 ${A.loop && A.loop.max}) · 조각내기 p99 ${B.loop && B.loop.p99}ms(최대 ${B.loop && B.loop.max})\n`);

  // ① ★상황 선행 — 대조군이 정말 한 덩어리인가(아니면 이 하네스는 아무것도 안 재고 있다)
  //   ★판정 잣대는 '조각'이 아니라 **한 프레임**이다. 조각 크기는 두 팔이 같다(같은 일을 한다) —
  //     달라지는 건 *한 프레임에 몇 개를 몰아 넣느냐*뿐이고, RTT 를 정하는 건 그 값이다.
  ok(a.frames === 1, '① [상황] 대조군은 일틱을 **한 프레임**에 몬다', `프레임 ${a.frames}`);
  ok(a.frameMax >= a.total * 0.9, '① [상황] 그 한 프레임이 하루 전부를 먹는다', `${a.frameMax}/${a.total}ms`);
  // ★★[T513 2026-09-29] **"잴 만큼 무거운 하루"의 문턱을 유도한다**(새 수 0). 종전 `≥300ms` 는 지은 수였고
  //   컨테이너가 빨라지자 야간 3밤 상시 빨강이 됐다(하루 131~213ms — 제품이 아니라 **자가 못 잰 것**).
  //   조각내기가 벌 수 있는 몫 = 대조군 한 프레임(≈ 하루 전부) ÷ 조각내기 팔의 가장 큰 조각(더는 못 자른다).
  //   ③·⑥ 이 "줄었다"를 가르려면 그 몫이 **FK × NMAX**(이 파일의 두 문턱 · 효과비 > 잡음비 × FK · 잡음비 < NMAX)를 넘어야 한다.
  //   ⇒ 못 넘으면 이 판은 **잴 수 없는 판**이다 — 그 사실을 적고 초록으로 둔다(효과 판정 ③·⑥ 은 '나빠지지 않았다'만 · ③ 의 1/3 줄은 건너뛴다).
  const _FK0 = parseFloat(process.env.SLICER_FRAME_K || '1.8') || 1.8, _NM0 = parseFloat(process.env.SLICER_NOISE_MAX || '1.5') || 1.5;
  const _room = a.total / Math.max(1, b.maxChunk || 1), _need = _FK0 * _NM0;
  const MEASURABLE = _room >= _need;
  ok(true, `① [상황] 잴 수 있는 하루인가 — ${MEASURABLE ? '○ 잰다' : '★잴 수 없다(적고 초록)'}`,
    `대조군 하루 ${a.total}ms ÷ 가장 큰 조각 ${b.maxChunk}ms(${b.maxChunkAt}) = ${_room.toFixed(2)} ${MEASURABLE ? '≥' : '<'} FK×NMAX ${_need.toFixed(2)}`);

  // ② 실제로 나뉘는가 — 마을 수만큼은 나와야 한다(생활층·영토·채굴이 마을 경계다)
  ok(b.chunks >= b.villages, `② 조각이 마을 수(${b.villages}) 이상으로 나뉜다`, `${b.chunks}개`);
  ok(b.frames >= 10, '② 여러 프레임에 걸쳐 돈다', `${b.frames} 프레임`);

  // ③ 한 프레임의 막힘이 내려갔는가 — 이 배치가 산 것
  // ★★[T49] ③ 도 같은 병이었다 — 이 판에서 1505 ≤ 1481 로 **1.6%** 차이로 떨어졌다.
  //   ⑥ 과 같은 처방: 대조군을 두 번 돌아 잡음 바닥을 재고 비율의 비율로 판정한다.
  const a2 = A2.econTick.last;
  const fNoise = Math.max(a.frameMax, a2.frameMax) / Math.max(1, Math.min(a.frameMax, a2.frameMax));
  const fMed = (a.frameMax + a2.frameMax) / 2;
  const fEffect = fMed / Math.max(1, b.frameMax);
  const FK = parseFloat(process.env.SLICER_FRAME_K || '1.8') || 1.8;
  console.log(`  잡음 바닥 — 대조군 두 번 한 프레임 최대 ${a.frameMax}ms vs ${a2.frameMax}ms → 잡음비 ${fNoise.toFixed(3)}`);
  console.log(`  [참고 — 판정 아님] 절대 문턱 1/3 · ${b.frameMax <= a.frameMax / 3 ? '넘음' : '★못 넘음'}`
    + `  (${b.frameMax}ms vs ${(a.frameMax / 3).toFixed(0)}ms)`);
  // ★★[T49 후속 2026-09-02] **잡음이 크면 판정하지 않는다.**
  //   전수 2회차에서 이 자리가 빨갰다 — 효과비 2.63 인데 **잡음비가 2.001** 이라 비율의 비율이
  //   1.32 로 떨어진 것이다. 같은 조건 두 판이 2배 벌어지는 판에서는 3배 개선도 증명이 안 된다.
  //   그런데 그때 빨갛게 죽으면 읽는 사람은 **제품 회귀**로 오독한다. 사실은 "못 쟀다"다.
  //   ⇒ 잡음이 문턱을 넘으면 그 사실을 적고, **나빠지지는 않았다**만 지킨다(e2e-weight 와 같은 결).
  //   ★K 를 한 표본으로 정한 게 내 실수였다 — 그 실수는 문턱을 낮춰 덮지 않고 이렇게 갈랐다.
  const NMAX = parseFloat(process.env.SLICER_NOISE_MAX || '1.5') || 1.5;
  ok(fNoise < 3, '③ 전제 — 자가 믿을 만하다(같은 조건 두 번이 3배 안)', `잡음비 ${fNoise.toFixed(3)}`);
  if (MEASURABLE && fNoise < NMAX) {
    ok(fEffect > fNoise * FK,
       `③ 한 프레임 최대가 줄었다 — 비율의 비율 ${(fEffect / Math.max(0.01, fNoise)).toFixed(2)} > ${FK}`,
       `효과비 ${fEffect.toFixed(2)}(대조 중앙 ${fMed.toFixed(0)}ms → ${b.frameMax}ms) vs 잡음비 ${fNoise.toFixed(3)}`);
  } else {
    console.log(MEASURABLE ? `  ★이 판은 잡음이 커서(${fNoise.toFixed(3)} ≥ ${NMAX}) ③ 을 가를 수 없다 — 판정하지 않는다.` : '  ★잴 수 없는 판(①) — ③ 효과는 가르지 않는다.');
    ok(fEffect > 1, '③ [잡음 큼] 최소한 **나빠지지는 않았다**(이것만 잰다)', `효과비 ${fEffect.toFixed(2)}`);
  }
  if (MEASURABLE) ok(b.frameMax <= b.total / 3, '③ 한 프레임 최대가 하루 총합의 1/3 이하', `${b.frameMax}/${b.total}ms`);
  else console.log(`  · ③ 1/3 줄 건너뜀(잴 수 없는 판 — 가장 큰 조각 ${b.maxChunk}ms 가 하루 ${b.total}ms 의 1/3 을 혼자 넘을 수 있다)`);
  // ★남은 바닥 — 조각 하나(마을 한 곳의 생활층)가 예산(16ms)을 얼마나 넘는지를 **숨기지 않고 적는다**.
  //   이건 실패가 아니라 회부 대상(§4-A)이다. 슬라이서는 조각보다 잘게 못 자른다.
  console.log(`  · 남은 바닥: 가장 큰 조각 ${b.maxChunk}ms(${b.maxChunkAt}) — 예산 16ms 의 ×${(b.maxChunk / 16).toFixed(1)} (회부 §4-A)`);

  // ④ ★순서 불변 — 조각내기는 *언제*를 바꾸지 *무엇을*은 안 바꾼다
  const CANON = ['econ', 'pop', 'terr', 'ore', 'wx', 'bcast', 'caravan', 'events', 'save', 'life', 'dist'];
  ok(JSON.stringify(b.order) === JSON.stringify(CANON), '④ 단계 순서가 정본과 같다', JSON.stringify(b.order));
  ok(JSON.stringify(a.order) === JSON.stringify(b.order), '④ 대조군과 조각내기의 순서가 같다', '');

  // ⑤ 하루가 남김없이 끝나는가 — 조각이 남으면 그날은 영원히 안 끝난다
  ok(B.econTick.days >= DAYS, `⑤ ${DAYS}일이 모두 마감됐다`, `${B.econTick.days}일`);
  ok(A.econTick.days >= DAYS, `⑤ 대조군도 ${DAYS}일 마감`, `${A.econTick.days}일`);
  const dayGap = b.day - (B.econTick.ring ? 0 : 0);
  ok(Number.isFinite(b.day) && b.day > 0, '⑤ 마지막 마감일이 유효하다', `day ${b.day}`);

  // ⑥ 이벤트 루프가 실제로 덜 막히는가 — 이 배치의 존재 이유
  //   ★**p99 가 아니라 최댓값**이다. 하루 경계는 드문 사건이라(창 6번 · 표본 수천) p99 는
  //     그 막힘을 통째로 놓친다 — 실제로 첫 판에서 대조군 p99 가 24ms 로 나왔다(최대는 12,994ms).
  //     "가장 오래 막힌 한 번"이 곧 플레이어가 겪는 스파이크다.
  //   ★★[T42-b 2026-09-01] **비율 하나로만 물으면 대조군이 순한 판에서 없는 회귀를 보고한다.**
  //     실측: 조각내기 팔의 루프 최대는 1,216~1,293ms 로 **거의 안 흔들리는데**(= 가장 큰 조각 하나),
  //     대조군은 2,271~4,100ms 로 흔들린다. 같은 코드가 한 판은 1,216 ≤ 1,367(통과), 다음 판은
  //     1,293 ≤ 757(실패)이 됐다 — 갈린 건 슬라이서가 아니라 **그날의 대조군**이다.
  //     ⇒ 슬라이서가 실제로 약속하는 것을 먼저 무조건 묻는다(⑥a): **조각 밖에서는 안 막힌다.**
  //       비율(⑥b)은 **쪼갤 여지가 있는 판에서만** 센다(족보 (80) 결 · `e2e-rtt ②b` 와 같은 규약).
  const ap = (A.loop && A.loop.max) || 0, bp = (B.loop && B.loop.max) || 0;
  //   ★★자를 하나로 — 루프 히스토그램은 **창 전체**라, 조각도 **창 전체의 최댓값**으로 잰다.
  //     `last.maxChunk`(마지막 하루)로 재면 첫날의 무거운 조각이 루프에만 잡혀 판정이 틀린다.
  const chunk = Math.max(1, B.econTick.maxChunk || b.maxChunk || 0);
  const chunkAt = B.econTick.maxChunkAt || b.maxChunkAt || '?';
  ok(bp > 0 && bp <= chunk * 2 + 300, '⑥a ★조각내기의 루프 최대 막힘이 **가장 큰 조각 안**이다(무조건 · 슬라이서가 소유하는 선)',
    `${bp}ms ≤ 창 전체 최대 조각 ${chunk}ms(${chunkAt}) × 2 + 300 = ${chunk * 2 + 300}ms`);
  //   ★★[T49 2026-09-02 · 리베이스 병합] **위 ⑥a 는 남긴다** — 눈대중 절대값이 아니라
  //     그 판의 조각 크기에서 **유도한** 선이다(족보 74). 잡음에 안 흔들린다.
  //     아래는 T42-b 의 ⑥b(대조군의 1/3)를 **비율의 비율**로 바꾼 것이다(족보 80) —
  //     같은 것을 두 자로 두 번 재지 않으므로 ⑥b 는 **참고 출력으로 내린다**.
  console.log(`  [참고 — 판정 아님] T42-b ⑥b 여지: 대조군 루프 최대 ${ap.toFixed(0)}ms / 조각 ${chunk}ms = ×${(ap / chunk).toFixed(1)}`);
  const ap2 = (A2.loop && A2.loop.max) || 0;
  // 잡음비 — **같은 조건 두 번**이 얼마나 벌어지나(참값 1). 효과비 — 대조군(중앙) 대 조각내기.
  const noiseR = Math.max(ap, ap2) / Math.max(1, Math.min(ap, ap2));
  const apMed = (ap + ap2) / 2;
  const effectR = apMed / Math.max(1, bp);
  const K = parseFloat(process.env.SLICER_RR_K || '1.8') || 1.8;
  console.log(`  잡음 바닥 — 대조군 두 번 최대 막힘 ${ap}ms vs ${ap2}ms → 잡음비 ${noiseR.toFixed(3)}`);
  console.log(`  [참고 — 판정 아님] 절대 문턱 1/3 · ${bp > 0 && bp <= ap / 3 ? '넘음' : '★못 넘음'}`
    + `  (${bp}ms vs ${(ap / 3).toFixed(1)}ms)`);
  ok(noiseR < 3, '⑥ 전제 — 자가 믿을 만하다(같은 조건 두 번이 3배 안)', `잡음비 ${noiseR.toFixed(3)}`);
  if (MEASURABLE && noiseR < NMAX) {
    ok(bp > 0 && effectR > noiseR * K,
       `⑥ 이벤트 루프 **최대 막힘**이 줄었다 — 비율의 비율 ${(effectR / Math.max(0.01, noiseR)).toFixed(2)} > ${K}`,
       `효과비 ${effectR.toFixed(2)}(대조 중앙 ${apMed.toFixed(0)}ms → ${bp}ms) vs 잡음비 ${noiseR.toFixed(3)}`);
  } else {
    console.log(MEASURABLE ? `  ★이 판은 잡음이 커서(${noiseR.toFixed(3)} ≥ ${NMAX}) ⑥ 을 가를 수 없다 — 판정하지 않는다.` : '  ★잴 수 없는 판(①) — ⑥ 효과는 가르지 않는다.');
    ok(bp > 0 && effectR > 1, '⑥ [잡음 큼] 최소한 **나빠지지는 않았다**(이것만 잰다)', `효과비 ${effectR.toFixed(2)}`);
  }

  // ⑦ 하루 총 일감은 그대로다 — 쪼갠다고 일이 줄면 그건 뭔가를 안 한 것이다
  const r = b.total / Math.max(1, a.total);
  ok(r >= 0.5 && r <= 2.0, '⑦ 하루 총 일감이 대조군과 같은 자릿수(0.5~2.0배)', `×${r.toFixed(2)}`);

  // ⑧ ★★**econ 비트 동일** — 조각내기가 *언제*만 바꿨다는 것의 가장 강한 증거.
  //   같은 스냅샷에서 출발해 같은 날까지 돈 두 팔의 **직렬화된 econ 상태**(village_state)를 통째로 비교한다.
  //   ⚠비교는 **같은 날**에서만 뜻이 있다 — 날이 어긋나면 그 사실을 먼저 말하고 판정을 유보한다.
  //   ⚠저장은 하루에 1마을/틱씩 배수되므로(saveQueue), 마지막 하루치가 아직 안 내려간 마을이 있을 수 있다.
  //     그래서 **행이 있는 마을만** 대조하고 그 수를 함께 적는다.
  const econFingerprint = (dbPath) => {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare('SELECT id, econ_state, population, day FROM villages ORDER BY id').all();
    db.close();
    const out = new Map();
    for (const r of rows) if (r.econ_state) out.set(r.id, { day: r.day, pop: r.population, h: require('crypto').createHash('sha256').update(String(r.econ_state)).digest('hex') });
    return out;
  };
  //   ★★이 검사는 **두 번 거짓말을 했고 두 번 다 고쳤다** — 그 내력이 곧 사용법이다.
  //     ① 첫 판: base↔head 가 50곳 중 49곳 갈렸다 → "쪼갰더니 세계가 갈렸다". **가짜였다.**
  //        저장이 1마을/틱이라 스냅샷 순간 팔마다 '어제치가 남은 마을 수'가 달랐을 뿐이다
  //        (base 49곳 526일 vs head 50곳 527일). ⇒ **같은 날끼리만** 대조하고, 끄기 전에 큐를 흘린다.
  //     ② 고친 뒤: A/A 는 50/50 동일한데 A/B 만 21곳 갈렸다 → 이번엔 **진짜였다.**
  //        마감이 몇 초에 걸치는 동안 캐러밴·전투 **실체가 계속 걸어서**, 뒤 단계가 '몇 초 더 간 몸'을 봤다.
  //        ⇒ 마감 중 실체 30Hz 를 멈췄다(villages.js `onGameTick`). 그 뒤 A/B 다름 **0**.
  //   ⇒ 그래서 판정은 **A/B ≤ A/A** 다: 같은 설정 두 판(A/A)이 이 층의 바닥 잡음이고,
  //     조각내기가 그보다 더 갈리게 만들면 안 된다. (econ 엔진 자체의 비트 동일은
  //     `sim/` 무수정 + 번들 8/8 + 3시드 800일이 따로 증명한다 — 여긴 **서버 층**을 잰다.)
  const C2 = await arm('aa', 16);
  // ★★[T513 2026-09-29 · T523 뒤집음] 다섯째 팔 — **되돌림 팔**(`T513_DAY_SLICE=0` = econ 한 조각). 같은 스냅샷 · 같은 날 수.
  //   T523 이 econ 조각을 **기본 켬**으로 올려 위 네 팔이 이미 켬이다 ⇒ 이 팔이 끔(종전)이다.
  const D2 = await arm('day0', 16, { T513_DAY_SLICE: '0' });
  // ★★[T523 2026-09-29 · T528 뒤집음] 여섯째 팔 — **생활층 되돌림 팔**(`T523_LIFE_SLICE=0` = 마을 하나 = 조각 하나).
  //   T528 이 생활층 쉼표(사냥꾼 한 명 = 조각 하나)를 **기본 켬**으로 올려 위 다섯 팔이 이미 켬이다 ⇒ 이 팔이 끔(종전)이다.
  const L2 = await arm('life0', 16, { T523_LIFE_SLICE: '0' });
  //   ★★대조는 **같은 마을 · 같은 날**끼리만 뜻이 있다. 저장은 1마을/틱으로 배수되므로 스냅샷 순간
  //     팔마다 어제치가 남은 마을 수가 다르다(실측: base 49곳이 526일 · head 50곳이 527일).
  //     그걸 섞어 세면 "쪼갰더니 세계가 갈렸다"는 **가짜 결론**이 나온다 — 첫 판이 정확히 그랬다.
  const cnt = (p1, p2) => {
    const F1 = econFingerprint(p1), F2 = econFingerprint(p2);
    let same = 0, diff = 0, skip = 0;
    for (const [id, a1] of F1) { const a2 = F2.get(id); if (!a2) { skip++; continue; } if (a1.day !== a2.day) { skip++; continue; } (a1.h === a2.h ? same++ : diff++); }
    return { same, diff, skip };
  };
  try {
    ok(a.day === b.day, '⑧ [전제] 두 팔이 **같은 날**까지 돌았다', `대조군 day ${a.day} · 조각내기 day ${b.day}`);
    const AA = cnt('/tmp/slicer-head-z.db', '/tmp/slicer-aa-z.db');    // 같은 설정 두 판 = 원래 있던 발산
    const AB = cnt('/tmp/slicer-base-z.db', '/tmp/slicer-head-z.db');  // 끈 뽑음 ↔ 조각내기
    ok(AA.same + AA.diff >= 10 && AB.same + AB.diff >= 10, '⑧ [전제] **같은 날끼리** 대조할 마을이 충분하다(자명 통과 금지)',
      `A/A ${AA.same + AA.diff}곳(건너뜀 ${AA.skip}) · A/B ${AB.same + AB.diff}곳(건너뜀 ${AB.skip})`);
    // ★바이트 일치 수는 **정보로만** 찍는다. 이 층은 실시간과 얽혀 있어(NPC 가 매 프레임 일하고,
    //   그 손이 곳간을 만진다) 같은 설정 두 판도 판마다 0~20곳 갈린다 — 실측으로 그렇다.
    //   그래서 판정은 **경제의 크기**로 한다(아래): 순서 잡음에는 안 흔들리고, 진짜 변화는 잡는다.
    console.log(`  · 바이트 일치(정보) — A/A 동일 ${AA.same}·다름 ${AA.diff} · A/B 동일 ${AB.same}·다름 ${AB.diff}`);
    // ⑧ ★★판정: **경제의 크기가 같은가.** 인구와 곳간 총량은 순서 잡음으로는 안 움직인다 —
    //   움직였다면 그건 "쪼갠 것이 세계를 바꿨다"는 뜻이다(실제로 실체 30Hz 를 안 멈췄을 때 움직였다).
    const mass = (dbPath) => {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const rows = db.prepare('SELECT id, econ_state, day FROM villages ORDER BY id').all();
      db.close();
      const m = new Map();
      for (const r of rows) { if (!r.econ_state) continue; let o; try { o = JSON.parse(r.econ_state); } catch (e) { continue; }
        let food = 0; for (const k of ['food', 'fish', 'meat', 'cooked_food', 'vegetable']) food += +(o.storage || {})[k] || 0;
        m.set(r.id, { day: r.day, pop: (o.npcs || []).length, food: +food.toFixed(2) }); }
      return m;
    };
    const cmpMass = (p1, p2) => {
      const M1 = mass(p1), M2 = mass(p2);
      let n = 0, dPopMax = 0, pop1 = 0, pop2 = 0, f1 = 0, f2 = 0;
      for (const [id, a1] of M1) { const a2 = M2.get(id); if (!a2 || a1.day !== a2.day) continue;
        n++; dPopMax = Math.max(dPopMax, Math.abs(a1.pop - a2.pop)); pop1 += a1.pop; pop2 += a2.pop; f1 += a1.food; f2 += a2.food; }
      return { n, dPopMax, pop1, pop2, f1, f2, dPop: Math.abs(pop1 - pop2), fRel: f1 > 0 ? Math.abs(f1 - f2) / f1 : 0 };
    };
    const MB = cmpMass('/tmp/slicer-base-z.db', '/tmp/slicer-head-z.db');
    const MA = cmpMass('/tmp/slicer-head-z.db', '/tmp/slicer-aa-z.db');
    // ★★[T665 2026-10-05] **문턱 = 이 판의 잡음 바닥에서 유도**(T411 꼴 · 새 수 0). 종전 문턱(인구 0.5% · 식량 2% · 마을 3명)은 손으로 적은 수였고,
    //   대조군 줄은 식량 바닥을 **인구 문턱(0.5%)** 에 대고 있었다 — main 도 같은 판 두 번이 0.3~1.1% 라 그 줄은 늘 반쯤 빨갰다(T655 회부 ③ · T645 회부 ②).
    //   ★바닥 B = **판정 받는 팔(`head`)이 안 낀** 다섯 팔(base · base2 · aa · day0 · life0 — 전부 같은 경제여야 하는 제품 판들) 사이 열 쌍의 차 중 큰 쪽
    //     (곳간 식량 합 · 인구 합 · 마을별 최대 — 셋 따로). 미끼가 바닥을 부풀려 제 몸을 숨기지 못하게 head 는 바닥에 안 넣는다.
    //   ★문턱 = 2B — **삼각 부등식**에서 나온다: head 가 그 다섯과 같은 경제라면 어느 팔 Y 를 거쳐도 |head − R| ≤ |head − Y| + |Y − R| 이고
    //     두 다리 다 바닥 안이다(⇒ ≤ 2B). "같은 판 한 번 더"를 바닥 그 자체(최댓값 한 표본)에 대면 같은 분포의 표본끼리라 동전이다(T411 §ⓐ ·
    //     T665 실측: 바닥 = 최댓값이면 10판 중 3판 빨강) — T411 ⑧ 이 ⑦ 의 바닥을 쓴 그 까닭처럼 구조로 넉넉한 자를 댄다.
    //   미끼(`SLICER_BAIT=skip-trade` — head 의 econ 이 교역을 빼먹는다)는 그 문턱 밖으로 나가 빨갛다(보고 T665 §③).
    const BEN = ['base', 'base2', 'aa', 'day0', 'life0'];
    const PM = {};
    const pm = (x, y) => { const k = x < y ? `${x}/${y}` : `${y}/${x}`; if (!PM[k]) PM[k] = cmpMass(`/tmp/slicer-${x}-z.db`, `/tmp/slicer-${y}-z.db`); return PM[k]; };
    const met = (m) => ({ food: Math.abs(m.f1 - m.f2), pop: m.dPop, max: m.dPopMax, n: m.n });
    const BF = { food: 0, pop: 0, max: 0, pairs: 0, at: {} };
    for (let i = 0; i < BEN.length; i++) for (let k = i + 1; k < BEN.length; k++) {
      const m = pm(BEN[i], BEN[k]); if (m.n < 10) continue; const e = met(m), tag = `${BEN[i]}/${BEN[k]}`; BF.pairs++;
      if (e.food > BF.food) { BF.food = e.food; BF.at.food = tag; }
      if (e.pop > BF.pop) { BF.pop = e.pop; BF.at.pop = tag; }
      if (e.max > BF.max) { BF.max = e.max; BF.at.max = tag; }
    }
    const judge = (m) => { const e = met(m); return { ok: e.n >= 10 && e.food <= 2 * BF.food && e.pop <= 2 * BF.pop && e.max <= 2 * BF.max, e }; };
    const fmtJ = (j) => `식량 차 ${j.e.food.toFixed(0)} ≤ ${(2 * BF.food).toFixed(0)} · 인구 차 ${j.e.pop} ≤ ${2 * BF.pop} · 마을 최대 ${j.e.max} ≤ ${2 * BF.max}명`;
    if (process.env.T665_DUMP) { const AL = ['base', 'head', 'base2', 'aa', 'day0', 'life0']; for (let i = 0; i < AL.length; i++) for (let k = i + 1; k < AL.length; k++) pm(AL[i], AL[k]); }   // 자 밖 판: 쌍 전부(바닥 재기)
    _t665.BF = BF; _t665.PM = PM;
    const MA0 = cmpMass('/tmp/slicer-base-z.db', '/tmp/slicer-base2-z.db');   // ★[T665] 같은 판 둘째 쌍(끈 뽑음 두 판)
    _t665.AA = cnt('/tmp/slicer-head-z.db', '/tmp/slicer-aa-z.db'); _t665.AB = cnt('/tmp/slicer-base-z.db', '/tmp/slicer-head-z.db');
    _t665.AA0 = cnt('/tmp/slicer-base-z.db', '/tmp/slicer-base2-z.db');
    Object.assign(_t665, { MA, MA0, MB });
    ok(MB.n >= 10 && MB.pop1 > 100, '⑧ [전제] 잴 만큼 큰 경제다(자명 통과 금지)', `${MB.n}곳 · 인구 ${MB.pop1}`);
    // ★★[정직하게 적는다] A/A 는 **완전 동일**이다 — 이 층은 같은 일정이면 결정론이다.
    //   그러니 아래 A/B 차이는 잡음이 아니라 **조각내기가 만든 진짜 차이**다.
    //   원인: NPC 는 매 프레임 일하고 그 손이 곳간을 만진다. 하루의 단계들을 3초에 걸쳐 흘리면
    //   그 사이 NPC 노동이 **단계 사이로 끼어든다** — 게임 전체를 3초 얼리지 않는 한 없앨 수 없다.
    //   ⇒ 그래서 판정은 "0" 이 아니라 **크기**로 한다. 0.5%/2% 는 하루치 생산의 잡티 수준이고,
    //     순서가 크게 뒤틀리면(예: 단계 하나를 빠뜨리면) 이 문턱을 훌쩍 넘는다.
    console.log(`  · A/A(같은 일정 두 판) — 인구 차 ${MA.dPop} · 식량 차 ${(MA.fRel * 100).toFixed(3)}%   ← 이 층의 **잡음 바닥**`);
    console.log(`  · A/B(끈 뽑음 ↔ 조각내기) — 인구 ${MB.pop1} vs ${MB.pop2} · 식량 ${MB.f1.toFixed(0)} vs ${MB.f2.toFixed(0)} (${(MB.fRel * 100).toFixed(2)}%)  ★회부 §A-5`);
    ok(BF.pairs === 10, '⑧ [대조군] 잡음 바닥 B 가 섰다 — 판정 받는 팔이 안 낀 다섯 팔의 열 쌍(같은 날 마을 ≥10)',
      `쌍 ${BF.pairs} · B = 식량 ${BF.food.toFixed(0)}(${BF.at.food || '-'}) · 인구 ${BF.pop}(${BF.at.pop || '-'}) · 마을 최대 ${BF.max}명(${BF.at.max || '-'})`);
    { const j = judge(MB); _t665.J8 = j;
      ok(j.ok, '⑧ ★★끈 뽑음 ↔ 조각내기 — 곳간 식량 · 인구 · 마을 최대가 **2B 안**(바닥에서 삼각 부등식으로 유도)', `${fmtJ(j)} (식량 ${(MB.fRel * 100).toFixed(2)}%)`); }

    // ⑨ ★★[T513 · T523] **econ 하루 틱 조각**(기본 켬) ↔ 되돌림(`T513_DAY_SLICE=0` · econ 한 조각) — ⑧ 과 같은 자(경제의 크기).
    //   econ 정본 조각(`tickWorldV2Parts`)은 `tickWorldV2` 가 부르는 그 한 벌이라 조각 사이에 아무 일도 없으면 계산이 같다 —
    //   그 사이에 끼어드는 것은 ⑧ 이 적은 NPC 노동뿐이다(그래서 같은 문턱 · 0 이 아니라 크기).
    console.log('\n  ⑨ econ 하루 틱 조각(기본 켬) ↔ 되돌림(`T513_DAY_SLICE=0`)');
    const d0 = D2 && D2.econTick && D2.econTick.last;
    ok(!!d0, '⑨ [전제] 되돌림 팔이 부팅·수확됐다', d0 ? `${d0.day}일` : '없음');
    if (d0) {
      const st = b.stages || {}, parts = ['econ:head', 'econ:vil', 'econ:trade', 'econ:caravan', 'econ:tail'];
      const pmax = Math.max(0, ...parts.map((k) => st[k + '·max'] || 0));
      const pmaxAt = parts.reduce((m, k) => ((st[k + '·max'] || 0) > (st[m + '·max'] || 0) ? k : m), parts[0]);
      console.log(`  · 되돌림 ${fmt(d0)}`);
      console.log(`  · 켬(조각내기 팔) econ 조각 — ${parts.map((k) => `${k.slice(5)} 합 ${st[k] || 0}ms · 최대 ${st[k + '·max'] || 0}ms`).join(' / ')}`);
      // ★★[T645] 종전 자 `b.chunks >= d0.chunks + d0.villages` 는 조각 **수**라 생활층·캐러밴의 'retry' 조각(= 시간)이 섞여
      //   main 그대로도 379 ↔ 400(문턱 429)로 갈렸다. 뜻은 그대로 — **econ 정본의 마을 칸이 마을마다 따로 불렸나**를 이름 집합으로 본다.
      //   켬: 그날 마감마다 따로 불린 마을 수 = 마을 수 · 부름 수 = 마을 수(한 마을 한 조각) · 이름 해시가 날마다 같다(같은 목록) / 되돌림: 0(정본 조각을 안 연다).
      const rdE = (lb) => { try { return fs.readFileSync(`/tmp/slicer-${lb}-econ.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
      const EH = rdE('head'), E0 = rdE('day0');
      const judge9 = (E, nv) => E.length >= 1 && E.every((e) => e.vil === nv && e.calls === nv);
      ok(judge9(EH, d0.villages) && E0.length === 0, '⑨ 켬(기본)이 econ 을 **마을 수만큼** 따로 나눴다(마을 칸 이름 집합 · 시간 무관)',
        `켬 ${EH.length}마감 × 따로 불린 마을 ${[...new Set(EH.map((e) => e.vil))].join('/')}(부름 ${[...new Set(EH.map((e) => e.calls))].join('/')} · 마을 ${d0.villages}) · 되돌림 마감 ${E0.length}줄 · 참고 조각 수 ${d0.chunks} → ${b.chunks}`);
      ok(!judge9(E0, d0.villages), '⑨ ★미끼 — 같은 판정을 되돌림 팔(켬 끔)에 대면 빨강이다(자명 통과 금지)', `되돌림 ${E0.length}줄`);
      ok(JSON.stringify(d0.order) === JSON.stringify(CANON), '⑨ 되돌림도 단계 순서가 정본과 같다', JSON.stringify(d0.order));
      ok(D2.econTick.days >= DAYS, `⑨ 되돌림 ${DAYS}일이 모두 마감됐다`, `${D2.econTick.days}일`);
      const bEcon = (d0.stages && d0.stages.econ) || 0;
      ok(pmax < bEcon, '⑨ ★econ 의 가장 큰 조각(켬)이 되돌림의 econ 한 조각보다 작다', `${pmax}ms(${pmaxAt}) < ${bEcon}ms`);
      const M9 = cmpMass('/tmp/slicer-day0-z.db', '/tmp/slicer-head-z.db'); _t665.M9 = M9;
      console.log(`  · 되돌림 ↔ 켬 — 인구 ${M9.pop1} vs ${M9.pop2} · 식량 ${M9.f1.toFixed(0)} vs ${M9.f2.toFixed(0)} (${(M9.fRel * 100).toFixed(2)}%) · ${M9.n}곳`);
      { const j = judge(M9); _t665.J9 = j;
        ok(j.ok, '⑨ ★★되돌림 ↔ 켬 — 곳간 식량 · 인구 · 마을 최대가 **2B 안**(⑧ 과 같은 자)', `${fmtJ(j)} (식량 ${(M9.fRel * 100).toFixed(2)}%)`); }
      const B9 = cnt('/tmp/slicer-day0-z.db', '/tmp/slicer-head-z.db');
      console.log(`  · 바이트 일치(정보) — 되돌림 ↔ 켬 동일 ${B9.same}·다름 ${B9.diff}(건너뜀 ${B9.skip})`);
    }

    // ⑩ ★★[T523 · T528] **생활층 쉼표**(기본 켬) ↔ 되돌림(`T523_LIFE_SLICE=0` · 마을 하나 = 조각 하나) — ⑧ 과 같은 자(경제의 크기) · 창 전체의 가장 큰 생활층 조각.
    console.log('\n  ⑩ 생활층 쉼표(기본 켬) ↔ 되돌림(`T523_LIFE_SLICE=0`)');
    const l0 = L2 && L2.econTick && L2.econTick.last;
    ok(!!l0, '⑩ [전제] 되돌림 팔이 부팅·수확됐다', l0 ? `${l0.day}일` : '없음');
    if (l0) {
      const SB = (L2.econTick && L2.econTick.stages) || {}, SL = (B.econTick && B.econTick.stages) || {};   // SB = 되돌림(끔) · SL = 켬(조각내기 팔)
      const lifeOff = (SB['1마을:life전체'] && SB['1마을:life전체'].max) || 0;
      const stepMax = (SL['life:쉼표·max'] && SL['life:쉼표·max'].max) || 0;
      console.log(`  · 되돌림 ${fmt(l0)}`);
      console.log(`  · 창 전체 — 되돌림 한 마을 생활층 최대 ${lifeOff}ms(사냥 하루 ${(SB['1마을:gran'] && SB['1마을:gran'].max) || 0}ms) · 켬 쉼표 조각 최대 ${stepMax}ms · 켬 조각 ${b.chunks}(되돌림 ${l0.chunks})`);
      ok(SL['life:쉼표'] != null && SB['life:쉼표'] == null && b.chunks > l0.chunks, '⑩ 켬(기본)이 생활층을 쉼표에서 더 나눴다 · 되돌림엔 쉼표 조각 0', `조각 ${l0.chunks}(되돌림) → ${b.chunks}`);
      ok(JSON.stringify(l0.order) === JSON.stringify(CANON), '⑩ 되돌림도 단계 순서가 정본과 같다', JSON.stringify(l0.order));
      ok(L2.econTick.days >= DAYS, `⑩ 되돌림 ${DAYS}일이 모두 마감됐다`, `${L2.econTick.days}일`);
      ok(stepMax > 0 && stepMax <= lifeOff, '⑩ ★쉼표 조각 최대 ≤ 되돌림 한 마을 생활층 최대(창 전체)', `${stepMax}ms ≤ ${lifeOff}ms`);
      const M10 = cmpMass('/tmp/slicer-life0-z.db', '/tmp/slicer-head-z.db'); _t665.M10 = M10;
      console.log(`  · 되돌림 ↔ 켬 — 인구 ${M10.pop1} vs ${M10.pop2} · 식량 ${M10.f1.toFixed(0)} vs ${M10.f2.toFixed(0)} (${(M10.fRel * 100).toFixed(2)}%) · ${M10.n}곳`);
      { const j = judge(M10); _t665.J10 = j;
        ok(j.ok, '⑩ ★★되돌림 ↔ 켬 — 곳간 식량 · 인구 · 마을 최대가 **2B 안**(⑧ 과 같은 자)', `${fmtJ(j)} (식량 ${(M10.fRel * 100).toFixed(2)}%)`); }
      const B10 = cnt('/tmp/slicer-life0-z.db', '/tmp/slicer-head-z.db');
      console.log(`  · 바이트 일치(정보) — 되돌림 ↔ 켬 동일 ${B10.same}·다름 ${B10.diff}(건너뜀 ${B10.skip})`);
    }
  } catch (e) { ok(false, '⑧ 발산 대조 실패', e.message); }

  if (process.env.T665_DUMP) { try { fs.appendFileSync(process.env.T665_DUMP, JSON.stringify(_t665) + '\n'); } catch (e) {} }   // ★[T665] 바닥 재기(자 밖 판에서만)
  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
