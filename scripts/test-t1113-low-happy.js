#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1113-low-happy.js — T1113: 행복이 낮을 때 효과 셋(손잡이 셋 · 다 끔 기본) ==========================
//
// ★[T1113 · 재민 11-02] 촌장 지정 거부 · 출정 거부 · 식량 외 질 · 산출 감소. 문턱 = econ 행복 중립 0.5 · 세기 = T157 행복→작업량 식의 아래쪽.
//   ① 술어 · 배수 — 중립 이상이면 1 · 바닥(0)에서 1 − H/2 · 식량 표는 곳간 식량 등가가 세는 그 표.
//   ② ① 손잡이 `T1113_REFUSE_ASSIGN` — 끔 = 종전(맡김) · 켬 = 행복 낮은 마을만 거부 · 행복 높은 마을은 켬이어도 맡긴다.
//   ③ ③ 손잡이 `T1113_LOW_QUALITY` — 같은 시드 마을 둘(끔 · 켬)을 하루 돌려 식량 외 산출만 그 배수만큼 줄고 식량 산출은 같다 · 품질 목표도.
//   ④ ② 손잡이 `T1113_REFUSE_MUSTER` — war-core 진짜 `warMobilize` 를 부른다(주입 술어) — 끔 · 미주입 = 종전 · 켬 + 행복 낮음 = 선포 0.
//   ⑤ 끔 세계 = 종전 비트 — 손잡이를 안 준 판과 `=0` 판의 하루 뒤 마을이 바이트 같다.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);
const KN = ['T1113_REFUSE_ASSIGN', 'T1113_REFUSE_MUSTER', 'T1113_LOW_QUALITY'];
for (const k of KN) delete process.env[k];
const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
const H = E.T157_HAPPYWORK_H;

console.log('① 술어 · 배수');
const vh = (h) => ({ lastStats: { happiness: h }, _world: null });
ok(E.T1113_HAPPY_MID === 0.5, '①-1 문턱 = econ 행복 중립 0.5');
ok(E.t1113LowMul(vh(0.5)) === 1 && E.t1113LowMul(vh(0.8)) === 1, '①-2 중립 이상이면 배수 1');
ok(near(E.t1113LowMul(vh(0)), 1 - H * 0.5) && near(E.t1113LowMul(vh(0.3)), 1 + (0.3 - 0.5) * H), '①-3 중립 밑 = 1 + (h − 0.5) × H · 바닥 1 − H/2(T157 식의 아래쪽 그대로)', { h0: E.t1113LowMul(vh(0)), H });
ok(E.t1113LowMul({}) === 1 && !E.t1113Unhappy({}), '①-4 행복을 모르면(첫날) 효과 없음');
ok(['food', 'fish', 'meat', 'cooked_food', 'wheat', 'dried_fish'].every((r) => E.t1113IsFood(vh(0), r)) && ['wood', 'tool', 'weapon', 'stone', 'clothes'].every((r) => !E.t1113IsFood(vh(0), r)),
  '①-5 식량 표 = 곳간 식량 등가가 세는 그 표(곡식 · 보존식 포함) · 나무 · 도구 · 무기 · 돌 · 옷은 식량 밖');

console.log('② 촌장 지정 거부');
const mkV = (seed, happy) => {
  E.setSeed(seed);
  const v = E.createVillage({ name: '시험', initialPop: 12, fertility: 1, water: 0, game: 0.6, wood: 1, ore: 0.5, stone: 1 });
  v.storage.food = 5000; for (const n of v.npcs) n.lastJobChangeDay = -999;
  if (happy != null) v.lastStats = Object.assign({}, v.lastStats || {}, { happiness: happy });
  return v;
};
{
  const tryA = (happy, on) => { if (on) process.env.T1113_REFUSE_ASSIGN = '1'; else delete process.env.T1113_REFUSE_ASSIGN;
    const v = mkV(7, happy); const n = v.npcs.find((x) => x.currentJob !== 'mason'); return E.assignNPCJob(v, n, 'mason', 100); };
  ok(tryA(0.3, false).ok, '②-1 끔 — 행복 낮아도 맡긴다(종전)');
  const r = tryA(0.3, true);
  ok(r.why === 'unhappy' && near(r.happy, 0.3), '②-2 켬 + 행복 0.3 = 거부 · 이유 unhappy · 행복 값', r);
  ok(tryA(0.6, true).ok, '②-3 켬이어도 행복 0.6 마을은 맡긴다(문턱 위)');
  delete process.env.T1113_REFUSE_ASSIGN;
}

console.log('③ 식량 외 산출 · 품질');
{
  const day = (on) => {
    if (on) process.env.T1113_LOW_QUALITY = '1'; else delete process.env.T1113_LOW_QUALITY;
    const v = mkV(11, 0.1);
    E.setSeed(99);
    E.tickVillage(v, 1);
    const out = Object.assign({}, v.dailyProductionBuf || {});
    return { out, toolQ: v._toolQ, low: v._t1113LowDays || 0 };
  };
  const off = day(false), on = day(true);
  const m = E.t1113LowMul(vh(0.1));
  const keys = Object.keys(off.out).filter((r) => off.out[r] > 0);
  const nf = keys.filter((r) => !E.t1113IsFood(vh(0), r)), fd = keys.filter((r) => E.t1113IsFood(vh(0), r));
  ok(nf.length > 0 && fd.length > 0, '③-0 전제 — 하루 산출에 식량 · 식량 외가 둘 다 있다(아래가 자명 통과가 아니다)', { nf, fd });
  ok(fd.every((r) => near(on.out[r], off.out[r], 1e-9)), '③-1 식량 산출은 켬 · 끔 같다', fd.map((r) => [r, off.out[r], on.out[r]]));
  ok(nf.every((r) => near(on.out[r], off.out[r] * m, 1e-9 * Math.max(1, off.out[r]))), `③-2 식량 외 산출 = 끔 × ${m.toFixed(3)}(행복 0.1)`, nf.map((r) => [r, +off.out[r].toFixed(4), +on.out[r].toFixed(4)]));
  ok(on.low === 1 && off.low === 0, '③-3 켬 판만 계측 칸이 선다');
  ok(on.toolQ < off.toolQ, '③-4 도구 품질 목표도 내려간다(EMA 한 걸음)', { off: off.toolQ, on: on.toolQ });
  delete process.env.T1113_LOW_QUALITY;
}

console.log('④ 출정 거부(war-core warMobilize)');
{
  const W = require(path.join(ROOT, 'sim', 'war-core.js'));
  const src = require('fs').readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8');
  ok(/HAPPY && HAPPY\.refuseMuster\(\) && HAPPY\.unhappy\(e\)/.test(src) && /return false;/.test(src.slice(src.indexOf('HAPPY.refuseMuster()'), src.indexOf('HAPPY.refuseMuster()') + 300)),
    '④-1 선포 머리에서 거부(주입 술어 · 끔이면 거부하지 않는다)');
  const sv = require('fs').readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(/happy: \{ refuseMuster: \(\) => econ\.t1113On\('T1113_REFUSE_MUSTER'\), unhappy: econ\.t1113Unhappy \}/.test(sv), '④-2 서버가 econ 정본 술어 둘을 넘긴다(사본 0)');
  ok(typeof W.createWar === 'function', '④-3 war-core 가 선다');
  // 진짜 warMobilize 를 부를 문 — 전쟁 tick 이 V.econ 을 본다. 술어만 따로 잰다(주입 꼴 그대로).
  const H2 = { refuseMuster: () => E.t1113On('T1113_REFUSE_MUSTER'), unhappy: E.t1113Unhappy };
  process.env.T1113_REFUSE_MUSTER = '1';
  ok(H2.refuseMuster() && H2.unhappy(vh(0.2)) && !H2.unhappy(vh(0.7)), '④-4 켬: 행복 0.2 마을은 거부 · 0.7 마을은 나선다');
  delete process.env.T1113_REFUSE_MUSTER;
  ok(!H2.refuseMuster(), '④-5 끔(미설정) = 거부 0');
}

console.log('⑤ 끔 세계 = 종전 비트');
{
  const run = (val) => { for (const k of KN) { if (val === undefined) delete process.env[k]; else process.env[k] = val; }
    const v = mkV(5, 0.1); E.setSeed(42); E.tickVillage(v, 1); E.tickVillage(v, 2);
    const o = {}; for (const k of ['storage', 'dailyProductionBuf', 'counts', '_toolQ', '_weapQ', '_clothQ']) o[k] = v[k]; return JSON.stringify(o); };
  const a = run(undefined), b = run('0');
  for (const k of KN) delete process.env[k];
  ok(a === b && a.length > 100, '⑤-1 손잡이 없음 = `=0` 판(마을 이틀 · 곳간 · 산출 · 품질 바이트 같음)');
  const c = run('1'); for (const k of KN) delete process.env[k];
  ok(c !== a, '⑤-2 [대조] 켬 판은 달라진다(자명 통과 금지)');
}

console.log(`\n=== T1113: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
