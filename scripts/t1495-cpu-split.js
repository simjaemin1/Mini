// (@regress 없음 — 러너 밖 · T1495 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1495-cpu-split.js — 사냥판 틱(`wildlife.js _t1393Tick`)의 CPU 를 구간별로 가른다(`process.cpuUsage` — 가상 시계 판이라 벽시계는 0 이 나온다) ======
//   쓰는 법: `T1495_CPU_OUT=<파일.json> NODE_OPTIONS="--require $PWD/scripts/t1495-cpu-split.js" node scripts/t1331-run.js …`(존 아이에서만 돈다)
//   구간: ① 깨우는 이 고리(몸마다 · 둘레 문 = wakerP · 떠난 대리 빼기 = waker) ② 깨움(칸 통 · 판마다 깨움) ③ 판 걷기 — 판마다 그 판의 대리 갈래로 나눈다
//         (사냥꾼 판 = 일하는 사냥꾼 대리가 있는 판 · 마을 밖 판 = 마을 밖 몸 대리만(깬 몹 있음 · 없음 OutE) · 그 밖) · 걸음 수 · 깬 몹-걸음.
//   덧: 짐승 몸 죽음을 종별로(사냥꾼 손 · 그 밖 — `_t1393Dead`) 센다(회부 4 사냥 몫).
//   ⚠읽어 들일 때 원문에 잴 줄만 끼운다(값 · 차례 무변 — `process.cpuUsage` 는 세계에 아무것도 안 쓴다). 닻 줄이 없으면 아무것도 안 끼우고 `miss` 를 적는다.
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1495_CPU_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const WF = path.join(__dirname, '..', 'server', 'wildlife.js');
const OUT = process.env.T1495_CPU_OUT;
const C = { miss: [], kill: {}, seg: { wakerP: 0, waker: 0, wake: 0, fHunt: 0, fOut: 0, fOutE: 0, fOther: 0, rest: 0 }, n: { fHunt: 0, fOut: 0, fOutE: 0, fOther: 0, stepsHunt: 0, stepsOut: 0, stepsOutE: 0, stepsOther: 0, mobStepsHunt: 0, mobStepsOut: 0, mobStepsOutE: 0, mobStepsOther: 0, ticks: 0 } };
let t0 = null, cls = null, fst0 = 0, mob0 = 0;
const now = () => { const u = process.cpuUsage(); return u.user + u.system; };
global.__t1495cs = {
  kill(sp, byH) { const k = C.kill[sp] || (C.kill[sp] = [0, 0]); k[byH ? 0 : 1]++; },   // 짐승 죽음(종 · 사냥꾼 손 · 그 밖) — 회부 4
  mark(seg) { const t = now(); if (t0 != null && seg) C.seg[seg] += t - t0; t0 = t; if (seg === 'rest' && (++C.n.ticks % 200) === 0) save(); },
  fBegin(F, st) { this.fEnd(st); let w = 0, o = 0; for (const a of F.ag) { if (a.state === 'work') w = 1; else if (a._t1461) o = 1; } mob0 = (F.s && F.s.mobs ? F.s.mobs.length : 0); cls = w ? 'Hunt' : (o ? (mob0 ? 'Out' : 'OutE') : 'Other'); C.n['f' + cls]++; fst0 = st.steps; t0 = now(); },
  fEnd(st) { if (!cls) return; const t = now(); C.seg['f' + cls] += t - t0; const ds = st.steps - fst0; C.n['steps' + cls] += ds; C.n['mobSteps' + cls] += ds * mob0; cls = null; t0 = t; },
};
const P = [
  ['  // 1) 깨우는 이 — 일하는 사냥꾼 몸', '  global.__t1495cs.mark(null);\n  // 1) 깨우는 이 — 일하는 사냥꾼 몸'],
  ['  for (const [pid, pr] of _t1393Px) if (!live.has(pr)) {', '  global.__t1495cs.mark(\'wakerP\');\n  for (const [pid, pr] of _t1393Px) if (!live.has(pr)) {'],
  ['  // 2) 깨움 — 깬 몸 아닌 몸', '  global.__t1495cs.mark(\'waker\');\n  // 2) 깨움 — 깬 몸 아닌 몸'],
  ['  // 3) 판마다 걷기', '  global.__t1495cs.mark(\'wake\');\n  // 3) 판마다 걷기'],
  ['  for (const [key, F] of _t1393F) {\n', '  for (const [key, F] of _t1393F) { global.__t1495cs.fBegin(F, _t1393St);\n'],
  ['  let byH = false; for (const a of F.s.agents) if (a._carc === lm) { byH = true; break; }', '  let byH = false; for (const a of F.s.agents) if (a._carc === lm) { byH = true; break; }\n  global.__t1495cs.kill(b.sp, byH);'],
  ['  _viewRect = vr0; lifeGM = gm0;', '  global.__t1495cs.fEnd(_t1393St); global.__t1495cs.mark(\'rest\');\n  _viewRect = vr0; lifeGM = gm0;'],
];
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === WF) {
    const _c = m._compile;
    m._compile = function (src, fn) { for (const [a, b] of P) { if (src.split(a).length !== 2) { C.miss.push(a.slice(0, 30)); continue; } src = src.replace(a, () => b); } return _c.call(this, src, fn); };
  }
  return _p(m, filename);
};
function save() { C.n.at = Date.now(); try { fs.writeFileSync(OUT, JSON.stringify(C)); } catch (e) {} }
process.on('exit', save);
