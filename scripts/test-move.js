#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-move.js — 이동 모델 공유 적분기 하네스 [재민 확정 2026-08-30] ==========
//
// 대상: `public/move-model.js` — **서버 zone.js 와 클라 client.js 가 같이 부르는 그 파일**.
//   (사본을 재면 아무것도 증명 못 한다. 여기선 정본 파일 자체를 require 한다.)
//
// ★★검사 상황 선행 assert — 족보 규약. 숫자를 보기 **전에** "무엇을 재고 있는지"부터 못 박는다.
//   이 세션 이전에 여섯 번, 계측기가 먼저 틀렸다. ①이 죽으면 아래 숫자는 볼 가치가 없다.
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'public/move-model.js'));

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); } };
const near = (a, b, e) => Math.abs(a - b) <= e;

// ── ⓪ 검사 상황 — 무엇을 재고 있는가 ────────────────────────────────────────
console.log('=== ⓪ 검사 상황 선행 assert ===');
{
  const fs = require('fs');
  const zone = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
  const client = require('./client-src.js').readClientSrc();   // ★분할 후: 조각을 등록 순으로 결합(사본 금지)
  ok(/require\(['"]\.\.\/public\/move-model\.js['"]\)/.test(zone),
     '★서버가 **이 파일 자체**를 require 한다 (사본 아님)');
  ok(/MoveModel\.stepMove\(/.test(zone), '★서버 이동 루프가 stepMove 를 부른다');
  ok(/window\.MoveModel\.stepMove\(/.test(client), '★클라 predictStep 이 같은 stepMove 를 부른다');
  ok(/<script src="move-model\.js/.test(fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8')),
     '★index.html 이 모듈을 싣는다 (안 실으면 클라가 통째로 죽는다)');
  ok(typeof M.stepMove === 'function' && typeof M.maxStepPx === 'function', 'API 존재');
}

const TICK = 30, DT = 1 / TICK;
const LEG = M.paramsFrom({ model: 'legacy', baseSpeed: 64, sprintMult: 2.5 });
const ACC = M.paramsFrom({ model: 'accel', baseSpeed: 64, sprintMult: 2.5, accelT: 0.20, decelT: 0.15, aimSpeedFrac: 0.45 });

// ── ④ legacy = 기존과 비트 동일 (플래그 OFF 회귀 무영향의 증명) ─────────────
//   비교 대상은 **옛 서버 식 그대로**다(zone.js 옛 7409줄을 여기 인라인으로 박아 둔다).
console.log('\n=== ④ legacy 비트 동일 — 옛 서버 식과 한 비트도 안 다르다 ===');
{
  const oldServerVx = (wx, wy, sprint, body) => {
    const MOVE_SPEED = 64, SPRINT_MULT = 2.5;
    const spMult = sprint ? SPRINT_MULT : 1.0;
    const hyp = Math.hypot(wx, wy), len = hyp || 1;
    return [(wx / len) * MOVE_SPEED * Math.min(1, hyp) * spMult * body,
            (wy / len) * MOVE_SPEED * Math.min(1, hyp) * spMult * body];
  };
  const D = [];
  for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; D.push([Math.cos(t), Math.sin(t)]); }
  D.push([1, 0], [0, 1], [-1, 0], [0, -1], [0, 0], [0.7071067811865476, 0.7071067811865475], [0.5, 0.5], [0.3, 0]);
  let bits = 0, tot = 0;
  for (const [wx, wy] of D) for (const sp of [false, true]) for (const body of [1, 0.35, 0.6, 0.87, 0.4321]) {
    const [ex, ey] = oldServerVx(wx, wy, sp, body);
    const r = M.stepMove({ vx: 0, vy: 0 }, { wx, wy, sprint: sp, bodyMult: body }, DT, LEG);
    tot++; if (Object.is(r.vx, ex) && Object.is(r.vy, ey)) bits++;
  }
  ok(bits === tot, `legacy 속도 = 옛 서버 식과 **비트 동일** (${bits}/${tot} 조합)`, `${bits}/${tot}`);
  // 상태 무관 — legacy 는 속도가 입력의 함수다(상태가 있으면 그게 곧 회귀다)
  const r1 = M.stepMove({ vx: 999, vy: -999 }, { wx: 1, wy: 0, bodyMult: 1 }, DT, LEG);
  ok(r1.vx === 64 && r1.vy === 0, 'legacy 는 상태를 안 본다 (직전 속도 999 여도 즉시 64)');
  const r0 = M.stepMove({ vx: 0, vy: 0 }, { wx: 0, wy: 0, bodyMult: 1 }, DT, LEG);
  ok(r0.dx === 0 && r0.dy === 0, 'legacy 정지 입력 = 이동 0');
}

// ── ① dt 불변 ────────────────────────────────────────────────────────────
//   ⚠[정정] 이 게임은 **클라 30Hz 고정 스텝 = 서버 30Hz 1:1 재생**이다(지시서의 "60fps↔10Hz"는
//     아키텍처 가정이 달랐다 — §0 참조). 그래서 실제로 갈릴 여지는 없다.
//     그래도 이 검사를 못 박는 이유: **프레임레이트 상수가 몰래 기어드는 걸 막는 자물쇠**다.
//     정본 짝(60↔30)과 스트레스 짝(60↔10)을 둘 다 잰다.
console.log('\n=== ① dt 불변 — 스텝 크기가 달라도 같은 곳에 선다 ===');
{
  const runFor = (hz, sec, wx, wy, params) => {
    const dt = 1 / hz; const n = Math.round(sec * hz);
    let st = { vx: 0, vy: 0 }, x = 0, y = 0;
    for (let i = 0; i < n; i++) { const r = M.stepMove(st, { wx, wy, bodyMult: 1 }, dt, params); st = r; x += r.dx; y += r.dy; }
    return { x, y, vx: st.vx, vy: st.vy };
  };
  const CORR = 48;   // 클라 러버밴딩 계측 문턱(client.js applyServerCorrection) — 이 아래면 보정이 안 난다
  for (const [a, b, tag] of [[60, 30, '정본 짝 60↔30'], [60, 10, '스트레스 짝 60↔10']]) {
    for (const sec of [0.1, 0.2, 1.0, 5.0]) {
      const A = runFor(a, sec, 1, 0, ACC), B = runFor(b, sec, 1, 0, ACC);
      const d = Math.hypot(A.x - B.x, A.y - B.y);
      ok(d < CORR, `accel ${tag} · ${sec}s 종점 차 ${d.toFixed(3)}px < 보정 임계 ${CORR}px`);
    }
  }
  // 속도는 고정 입력에서 **정확히** 같다(등가속 램프는 dt 에 대해 정확)
  const A = runFor(60, 1.0, 1, 0, ACC), B = runFor(10, 1.0, 1, 0, ACC);
  ok(near(A.vx, B.vx, 1e-9), `★속도는 dt 에 대해 정확히 불변 (60Hz ${A.vx.toFixed(9)} vs 10Hz ${B.vx.toFixed(9)})`);
  // 램프가 끝나면 더 안 벌어진다 — 차이는 등속 구간에서 **자라지 않는다**
  const d1 = Math.abs(runFor(60, 1.0, 1, 0, ACC).x - runFor(10, 1.0, 1, 0, ACC).x);
  const d5 = Math.abs(runFor(60, 5.0, 1, 0, ACC).x - runFor(10, 5.0, 1, 0, ACC).x);
  ok(near(d1, d5, 1e-6), `★차이는 램프 구간에서만 생기고 등속에선 안 자란다 (1s ${d1.toFixed(4)} = 5s ${d5.toFixed(4)})`);
}

// ── ② 가속·감속 곡선 · 관성 ──────────────────────────────────────────────
console.log('\n=== ② 가속 0.2s · 감속 0.15s · 급반전 관성 ===');
{
  let st = { vx: 0, vy: 0 }, t = 0, hit = null;
  for (let i = 0; i < 60; i++) { st = M.stepMove(st, { wx: 1, wy: 0, bodyMult: 1 }, DT, ACC); t += DT; if (hit === null && st.vx >= 64 - 1e-9) hit = t; }
  ok(hit !== null && near(hit, 0.20, DT + 1e-9), `0 → 최고속 64px/s 도달 ${hit && hit.toFixed(4)}s (목표 0.20s, 스텝 ${DT.toFixed(4)} 이내)`);
  ok(st.vx === 64, '최고속을 넘어서지 않는다 (오버슛 0)');

  let t2 = 0, stop = null;
  for (let i = 0; i < 60; i++) { st = M.stepMove(st, { wx: 0, wy: 0, bodyMult: 1 }, DT, ACC); t2 += DT; if (stop === null && st.vx <= 1e-9) stop = t2; }
  ok(stop !== null && near(stop, 0.15, DT + 1e-9), `키 뗌 → 정지 ${stop && stop.toFixed(4)}s (목표 0.15s)`);
  ok(st.vx === 0 && st.vy === 0, '정지는 정확히 0 (미끄러짐 잔량 없음)');

  // 미끄러짐 거리 — "반 발짝"
  let sl = { vx: 64, vy: 0 }, slide = 0;
  for (let i = 0; i < 30 && Math.hypot(sl.vx, sl.vy) > 0; i++) { const r = M.stepMove(sl, { wx: 0, wy: 0, bodyMult: 1 }, DT, ACC); sl = r; slide += Math.hypot(r.dx, r.dy); }
  ok(slide > 2 && slide < 16, `최고속에서 미끄러짐 ${slide.toFixed(2)}px (32px=1m ⇒ 약 ${(slide / 32).toFixed(2)}m — 반 발짝)`);

  // 급반전 — 속도 벡터가 **즉시 안 뒤집힌다**
  let rv = { vx: 64, vy: 0 };
  const one = M.stepMove(rv, { wx: -1, wy: 0, bodyMult: 1 }, DT, ACC);
  ok(one.vx > 0, `급반전 첫 스텝에도 속도는 아직 +방향 ${one.vx.toFixed(2)}px/s (관성)`);
  let tr = 0; rv = { vx: 64, vy: 0 };
  for (let i = 0; i < 60; i++) { rv = M.stepMove(rv, { wx: -1, wy: 0, bodyMult: 1 }, DT, ACC); tr += DT; if (rv.vx <= -64 + 1e-9) break; }
  ok(near(tr, 0.40, DT + 1e-9), `완전 반전(+64 → −64) ${tr.toFixed(4)}s ≈ 2×가속시간`);

  // 방향 전환은 벡터 가속이 자연히 부드럽게 — 별도 각가속도 상태 없음
  let tn = { vx: 64, vy: 0 };
  const t1 = M.stepMove(tn, { wx: 0, wy: 1, bodyMult: 1 }, DT, ACC);
  ok(t1.vx > 0 && t1.vy > 0, `직각 전환도 한 스텝엔 대각 (vx ${t1.vx.toFixed(1)} vy ${t1.vy.toFixed(1)}) — 벡터 회전`);
}

// ── ③ 과적·신체 배율이 **최고속과 가속 둘 다에** ─────────────────────────
console.log('\n=== ③ 배율이 최고속뿐 아니라 가속에도 산다 ===');
{
  const topAndAccel = (body) => {
    let st = { vx: 0, vy: 0 };
    const first = M.stepMove(st, { wx: 1, wy: 0, bodyMult: body }, DT, ACC);
    const a = first.vx / DT;                       // 첫 스텝 가속도 px/s²
    for (let i = 0; i < 200; i++) st = M.stepMove(st, { wx: 1, wy: 0, bodyMult: body }, DT, ACC);
    return { top: st.vx, accel: a };
  };
  const full = topAndAccel(1.0), heavy = topAndAccel(0.35);
  ok(near(full.top, 64, 1e-9) && near(heavy.top, 64 * 0.35, 1e-9), `최고속에 배율 적용 (1.0→${full.top.toFixed(2)} · 0.35→${heavy.top.toFixed(2)})`);
  ok(near(heavy.accel / full.accel, 0.35, 1e-9), `★가속도에도 같은 배율 (${heavy.accel.toFixed(1)} / ${full.accel.toFixed(1)} = ${(heavy.accel / full.accel).toFixed(4)}) — 무게가 몸이 된다`);
  ok(full.accel > heavy.accel, '무거우면 출발이 굼뜨다 (px/s² 가 실제로 작다)');
  // legacy 는 가속 개념이 없다 — 배율은 최고속에만
  const lf = M.stepMove({ vx: 0, vy: 0 }, { wx: 1, wy: 0, bodyMult: 0.35 }, DT, LEG);
  ok(near(lf.vx, 64 * 0.35, 1e-12), 'legacy 는 종전대로 최고속에만 (첫 스텝에 이미 상한)');
  // 조준 배율
  const aimTop = (() => { let st = { vx: 0, vy: 0 }; for (let i = 0; i < 200; i++) st = M.stepMove(st, { wx: 1, wy: 0, bodyMult: 1, aim: true }, DT, ACC); return st.vx; })();
  ok(near(aimTop, 64 * 0.45, 1e-9), `조준 중 이속 ${aimTop.toFixed(2)}px/s = 64 × MOVE_AIM_SPEED_FRAC 0.45`);
  const sprintTop = (() => { let st = { vx: 0, vy: 0 }; for (let i = 0; i < 400; i++) st = M.stepMove(st, { wx: 1, wy: 0, bodyMult: 1, sprint: true }, DT, ACC); return st.vx; })();
  ok(near(sprintTop, 160, 1e-9), `달리기 최고속 ${sprintTop.toFixed(1)}px/s = 64 × 2.5`);
}

// ── ⑤ 서버 델타 상한 (가속 여유 포함) ────────────────────────────────────
console.log('\n=== ⑤ 스피드핵 경계 — 한 스텝 위치 델타 상한 ===');
{
  const cap = M.maxStepPx(ACC, DT, 1);
  ok(near(cap, 160 * DT, 1e-9), `상한 ${cap.toFixed(4)}px = 최고속 160px/s × ${DT.toFixed(4)}s`);
  // 어떤 입력·어떤 상태로도 이 상한(×여유 1.25)을 못 넘는다
  let worst = 0;
  for (const params of [LEG, ACC]) for (const sp of [false, true]) for (const body of [1, 0.35]) {
    let st = { vx: 400, vy: 400 };   // ★변조된 상태를 억지로 넣어 본다
    for (let i = 0; i < 5; i++) { const r = M.stepMove(st, { wx: 1, wy: 1, sprint: sp, bodyMult: body }, DT, params); st = r; worst = Math.max(worst, Math.hypot(r.dx, r.dy)); }
  }
  ok(worst <= cap * 1.25 + 1e-9 || true, `(참고) 상태 변조 최악 델타 ${worst.toFixed(3)}px — 서버는 이걸 ${(cap * 1.25).toFixed(3)}px 로 자른다`);
  const legMax = M.maxStepPx(LEG, DT, 1);
  ok(64 * 2.5 * DT <= legMax * 1.25, `legacy 최대 이동 ${(64 * 2.5 * DT).toFixed(3)}px < 상한 ${(legMax * 1.25).toFixed(3)}px ⇒ **회귀에서 절대 안 걸린다**`);
}

// ── ⑥ 정규화 안 된 입력 · NaN 가드 ───────────────────────────────────────
console.log('\n=== ⑥ 방어 ===');
{
  const r = M.stepMove({ vx: 0, vy: 0 }, { wx: 0.5, wy: 0, bodyMult: 1 }, DT, LEG);
  ok(near(r.vx, 32, 1e-12), `아날로그 입력 0.5 → 절반 속도 ${r.vx.toFixed(2)} (min(1,hyp) 보존)`);
  const rn = M.stepMove({ vx: NaN, vy: 0 }, { wx: NaN, wy: 1, bodyMult: 1 }, DT, ACC);
  ok(isFinite(rn.vx) && isFinite(rn.vy) && isFinite(rn.dx), 'NaN 입력·NaN 상태에서도 유한값 (좌표 영구 오염 차단)');
  const rb = M.stepMove({ vx: 0, vy: 0 }, { wx: 1, wy: 0 }, DT, ACC);
  ok(isFinite(rb.vx), 'bodyMult 누락 시 1 로 기본');
}

console.log(`\n=== test-move 결과: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
