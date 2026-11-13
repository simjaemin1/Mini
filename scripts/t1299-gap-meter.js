'use strict';
// (@regress 없음 — 러너 밖 · T1299 계측 프리로드 · 읽기만 · 제품 손잡이 0 · 게이트 `gate-house.js --slow` 의 틈 판이 싣는다)
// === scripts/t1299-gap-meter.js — 마감 틈에서 econ 날 시계가 정의대로 서 있나(T1299 · T1289 회부 3) ==================================
//
// ★왜 [T1289 회부 3] 게이트 느린 틱 판(`--house` · 캐러밴 0 · 벽시계 = 가상 시계 지문)은 마감 틈 갈래 미끼 둘을 못 봤다(둘 다 PASS):
//   'gapK1' = 마감 중 econ 날 시계를 그날 머리로(T1282 앞) · 'gapG1' = 틈 `econDayToMs` 정렬을 종전 `world.day` 로(T1289 앞).
//   틈(마감 · 창을 연 틱부터 econ 머리 `world.day += 1` 까지)은 벽시계 판에서만 서고 드물며(T1289 라이브 3/38 · 2 ~ 4틱),
//   지문(곳간 · 인구 · 주거 · 금고)은 틈 안 시계 값을 읽는 자리(캐러밴 몸 · 장인 머묾 · 기온)에 거의 안 닿는다.
// ★이 자 — 존 아이(벽시계 · `T577_OUT` 이 선 판 자 아이 · 가상 시계 판은 안 잰다)에 실려:
//   ① `server/villages.js` 글자 끝에 읽기 문 한 줄을 붙인다(`_t1253Now` · `econDayToMs` · `state` 를 부르는 닫힘 — 값 · 차례 무변 · 파일 무변)
//      + 셈 문 둘(`tickCaravanBodies` · `_t1196Step` 머리 — 틈에 불린 번만 센다 · 증인).
//      글자 손질은 `Module.prototype._compile` 겹(앞선 프리로드의 글자 손질 — 미끼 — 위에 얹는다 · 미끼 글자도 그대로 재 본다).
//   ② 30Hz 고리(존 본 틱 포함)마다 콜백 뒤에 잰다 — 정의(T1282 머리 주석 · T1289 ①):
//      ⓐ 단조 — econ 날 시계(`_t1253Now()`)가 앞 잰 값보다 작아지지 않는다(틈 = 닫는 날의 끝 (Dc + 1) × 하루 · 머리 뒤 = 그 값 + 흐른 몫)
//      ⓑ 경계 — 틈에서 본 `econDayToMs(Dc)` 가 머리 뒤(world.day > Dc) 처음 본 `econDayToMs(Dc)` 와 같다(같은 econ 날의 벽시계 경계는 하나)
//      ⓒ 틈 — 틈 선 마감 수 · 틈 틱 수(0 이면 이 자는 아무것도 안 본 것 — 게이트가 판 실패로 친다)
//   끝에 `<T577_OUT>.t1299gap.json` 하나. 세계에 아무것도 안 쓴다(읽기만 — 부르는 두 함수는 `state` · `Date.now()` 만 읽는다).
// ★틈을 세우는 손 — 이 자가 아니라 부르는 쪽(`gate-house.js` 틈 판)이 `VILLAGE_TICK_SLICE_MS=1`(마감 조각 예산 1ms — *언제*만 · 값 무변 · 슬라이서 규약)을 준다.
// 쓰는 법: T1299_GAP=1 NODE_OPTIONS="--require $PWD/scripts/t1299-gap-meter.js" VILLAGE_TICK_SLICE_MS=1 node scripts/t577-server-run.js 12 42
if (process.env.T1299_GAP !== '1' || !process.env.T577_OUT || process.env.T745_VCLOCK === '1') return;
if (!require('worker_threads').isMainThread) return;   // 일꾼 스레드(길 · 걸음표)는 안 잰다
const fs = require('fs'), path = require('path'), Module = require('module');
const VFILE = path.join(__dirname, '..', 'server', 'villages.js');
const OUT = process.env.T577_OUT + '.t1299gap.json';
const G = { checks: 0, gapTicks: 0, gapCloses: 0, bodyGap: 0, artGap: 0, dec: 0, decGap: 0, decMax: 0, decAt: null, drift: 0, driftMax: 0, driftAt: null, bound: 0, inj: 0 };
const INJ = [
  ['function tickCaravanBodies(now) {', 'function tickCaravanBodies(now) { if (global.__t1299g) global.__t1299g.body();'],
  ['function _t1196Step(vil, npc, now0, job) {', 'function _t1196Step(vil, npc, now0, job) { if (global.__t1299g) global.__t1299g.art();'],
];
const TAIL = '\n;global.__t1299r = { now: () => _t1253Now(), edm: (d) => econDayToMs(d), st: () => state };\n';
{
  const oc = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename === VFILE && typeof content === 'string' && !content.includes('global.__t1299r')) {
      for (const [a, b] of INJ) { const n = content.split(a).length - 1; if (n !== 1) { console.error(`[T1299 틈 자] 자리 ${n}곳 — ${a} — 멈춤`); process.exit(3); } content = content.replace(a, b); G.inj++; }
      content += TAIL; G.inj++;
    }
    return oc.call(this, content, filename);
  };
}
const inGap = (s) => !!(s && s.world && (s.tickJobs || s._t731 || s._t1253Edge) && s._t1282D === (s.world.day | 0));
let lastNow = null, openD = null, bound = null;   // bound = { d: Dc, ms: 틈에서 본 econDayToMs(Dc) }
global.__t1299g = { body() { const R = global.__t1299r; if (R && inGap(R.st())) G.bodyGap++; }, art() { const R = global.__t1299r; if (R && inGap(R.st())) G.artGap++; } };
function check() {
  const R = global.__t1299r; if (!R) return;
  let s, n; try { s = R.st(); if (!s || !s.world || !s.dayMs) return; n = R.now(); } catch (e) { return; }
  G.checks++;
  const D = s.world.day | 0, gap = inGap(s);
  if (lastNow != null && n < lastNow) { G.dec++; if (gap) G.decGap++; const d = lastNow - n; if (d > G.decMax) { G.decMax = d; G.decAt = { day: D, gap, from: lastNow, to: n }; } }
  lastNow = n;
  if (gap) {
    G.gapTicks++;
    if (openD !== D) { openD = D; G.gapCloses++; }
    if (!bound || bound.d !== D) { try { bound = { d: D, ms: R.edm(D) }; } catch (e) { bound = null; } }
  } else if (bound && D > bound.d) {
    let ms = null; try { ms = R.edm(bound.d); } catch (e) {}
    G.bound++;
    if (ms !== bound.ms) { G.drift++; const d = Math.abs((ms || 0) - bound.ms); if (d > G.driftMax) { G.driftMax = d; G.driftAt = { day: bound.d, gap: bound.ms, head: ms }; } }
    bound = null;
  }
}
{
  const T30 = (ms) => Math.abs(+ms - 1000 / 30) < 2;
  const si = global.setInterval;
  global.setInterval = function (fn, ms, ...a) {
    if (typeof fn !== 'function' || !T30(ms)) return si.apply(this, arguments);
    return si.call(this, function () { try { return fn.apply(this, arguments); } finally { check(); } }, ms, ...a);
  };
}
const flush = () => { try { fs.writeFileSync(OUT, JSON.stringify(G)); } catch (e) { /* 계측 실패는 세계에 0 */ } };
setInterval(flush, 5000).unref();   // 판이 끊겨도(시한 · SIGKILL) 앞 5초까지는 남는다
process.on('exit', flush);
