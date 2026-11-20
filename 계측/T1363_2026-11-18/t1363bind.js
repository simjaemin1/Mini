'use strict';
// (@regress 없음 — 러너 밖 · T1363 반사실 판 훅 · 제품 파일 무변 · 존 프로세스가 읽는 econ 원문에 한 줄씩 묶는다)
// === 계측/T1363_2026-11-18/t1363bind.js — 굶주림 ↔ 도구 나선의 반사실 판(T1363 ①) ===
//   NODE_OPTIONS="--require <이 파일> …" T1363_BIND=<갈래> — 판 자 아이 존(server/zone.js · T577_SEED)에서만 선다(판 자 어버이 · 랩 · 하네스 무동작).
//   묶는 법(T1342 · T1346 bind 그 꼴): 존이 econ(`sim/economy-sim.js`)을 처음 읽을 때 원문의 정해진 한 줄(닻 · 꼭 한 번 나와야 한다)을 바꿔 컴파일한다 —
//   제품 파일은 한 글자도 안 바뀐다 · 닻이 없거나 둘이면 판이 멈춘다(조용히 안 묶인 판 0).
//   갈래:
//     tool05 — 생산 도구 배수에서 석기 몫을 일꾼의 절반 밑으로 안 내린다(그날 생산만 · 곳간 도구 · 마모 · 피커 · 석공 목표는 그대로):
//              석기 쓰는 일꾼 = min(남은 일꾼, max(곳간 석기, 일꾼 × 0.5 − 철 − 청동)) — 도구 몫이 0.5 밑으로 가도 생산 배수는 0.5 몫(≈ 0.5 × 1.4 + 0.5 × 0.25 = 0.825)에 머문다.
//              "나선이 없었다면" — 곳간이 마르는 마을이 도구까지 잃어 생산이 꺾이는 고리 하나만 끊은 판(0.5 = 진단 칸의 그 문턱 · 판 자에서만 글자로).
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const MODES = new Set(String(process.env.T1363_BIND || '').split(',').map((s) => s.trim()).filter(Boolean));
if (!MODES.size) return;
const path = require('path'), fs = require('fs'), Module = require('module');
const ROOT = path.resolve(__dirname, '..', '..');
const F_E = path.join(ROOT, 'sim', 'economy-sim.js');
const P = { [F_E]: [] };
if (MODES.has('tool05')) P[F_E].push(['    const ns = Math.min(toolDeps - ni - nb, v.storage.tool || 0);',
  () => '    const ns = Math.min(toolDeps - ni - nb, Math.max(v.storage.tool || 0, toolDeps * 0.5 - ni - nb));   // ★[T1363 bind tool05] 생산 석기 몫 ≥ 일꾼 절반']);
for (const m of MODES) if (!['tool05'].includes(m)) throw new Error(`[T1363 bind] 모르는 갈래 ${m}`);
const orig = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  const L = P[filename];
  if (!L || !L.length) return orig(m, filename);
  let src = fs.readFileSync(filename, 'utf8');
  for (const [a, f] of L) {
    const n = src.split(a).length - 1;
    if (n !== 1) throw new Error(`[T1363 bind] 닻이 ${n}번 — ${path.basename(filename)} :: ${a.slice(0, 60)}`);
    const i = src.indexOf(a);
    src = src.slice(0, i) + f(a) + src.slice(i + a.length);
  }
  console.log(`[T1363 bind] ${path.basename(filename)} 묶음 ${L.length}줄 — ${[...MODES].join(',')}`);
  m._compile(src, filename);
};
