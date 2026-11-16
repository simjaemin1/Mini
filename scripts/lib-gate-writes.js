// (@regress 없음 — 하네스 돕는 모듈 · 제품 무변)
// === scripts/lib-gate-writes.js — 걸음 판정 칸 쓰기 자리 전수(T1323 · 첫 거름 T1322 의 전제) ===
//   첫 거름은 "표가 산 동안 걸음 문 밖에서 그 몸의 판정 칸이 안 바뀐다"에 선다. 이 모듈은 server/*.js 의 판정 칸 쓰기 자리를
//   걸음 문 안(npcStep · 결정 · 생활층 한 몸 틱에서만 닿는 함수)과 문 밖(그 밖 입구 — 최상위 코드 · 다른 파일의 부름 · 값으로 넘김 — 에서도 닿는 함수)으로 가른다.
//   정적 · 이름 부름 그래프 · 최상위 함수 단위(`function 이름(` … 첫 칸 `}`) · 줄 주석은 뺀다. `scripts/t1323/census.py` 와 같은 규칙.
//   쓰기 = `<몸 변수>.<칸> =` · `++` · `--` · `+=` · `-=`(몸 변수 이름: npc · p · b · body · pp · ep · bd · nb · q2).
'use strict';
const fs = require('fs'), path = require('path');
const FIELDS = ['canadiaVillage', 'nextDecisionAt', 'simEvacUntil', 'behavior', 'npcHomeX', 'npcHomeY', 'npcBedX', 'npcBedY', 'simLonOff', '_t720', 'targetX', 'targetY', 'gatherTarget', 'harvestTarget',
  'canadiaTask', 'path', '_t791P', '_t791Pn', '_t791Px', '_t791Py', 'pathIndex', 'x', 'y', '_t670TkX', '_t670TkY', '_t670Tk', '_pathFor', '_stuckN', 'vx', 'vy', 'hp', '_stuckPos', 'simVillageId', 'simJob', 'floor', 'onStairId'];
const STEP_ROOTS = new Set(['npcStep', 'decideNpcBehavior', 'npcLifeTick', 'detectStuck', 'unstuckNpc', 'followNpcPath', 'computeNpcPath', '_t1145Detect', '_t1145Follow', '_t1140Detect', '_t670Stuck', '_t1145Stuck', '_t791Mir', '_desTimed']);
const TOUCH = /\b(_t1322Touch|_t1323Touch|t1322Touch)\b/;
const W = new RegExp(`\\b(npc|p|b|body|pp|ep|bd|nb|q2)\\.(${FIELDS.join('|')})\\s*(=(?!=)|\\+\\+|--|\\+=|-=)`, 'g');
const FN = /^(?:async\s+)?function\s+([\w$]+)\s*\(/;
const NC = (t) => t.replace(/(?<![:'"\\])\/\/[^\n]*/g, '');
function census(root, extra) {
  const files = fs.readdirSync(path.join(root, 'server')).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(root, 'server', f), 'utf8')]);
  if (extra) files.push(...extra);   // 미끼(하네스가 글자를 더 얹는다)
  const funcs = new Map();
  for (const [f, src] of files) {
    const L = src.split('\n'); let cur = null, st = 0;
    L.forEach((l, i) => { const m = FN.exec(l); if (m) { cur = m[1]; st = i; } else if (cur && l === '}') { if (!funcs.has(cur)) funcs.set(cur, { file: f, a: st + 1, text: L.slice(st, i + 1).join('\n') }); cur = null; } });
  }
  const names = new Set(funcs.keys()), callers = new Map(), top = new Set();
  const tok = /(?<![\w$])([\w$]+)\s*\(/g, ref = /(?<![\w$.])([\w$]+)(?![\w$])(?!\s*\()/g, word = /(?<![\w$])([\w$]+)(?![\w$])/g;
  for (const [n, F] of funcs) {
    const body = NC(F.text.split('\n').slice(1).join('\n'));
    for (const m of body.matchAll(tok)) if (names.has(m[1]) && m[1] !== n) { if (!callers.has(m[1])) callers.set(m[1], new Set()); callers.get(m[1]).add(n); }
    for (const m of body.matchAll(ref)) if (names.has(m[1]) && m[1] !== n && !STEP_ROOTS.has(m[1])) top.add(m[1]);   // 값으로 넘김 = 문 밖 입구
  }
  for (const [f, src] of files) {
    let inF = false, inX = false;
    for (const l of src.split('\n')) {
      if (FN.test(l)) { inF = true; continue; }
      if (inF && l === '}') { inF = false; continue; }
      if (/^module\.exports\s*=\s*\{/.test(l)) inX = true;
      if (inX) { if (/^\}/.test(l)) inX = false; continue; }
      if (!inF) for (const m of NC(l).matchAll(word)) if (names.has(m[1])) top.add(m[1]);
    }
    for (const m of NC(src).matchAll(/\.([\w$]+)\s*\(/g)) { const n = m[1]; if (names.has(n) && funcs.get(n).file !== f && !STEP_ROOTS.has(n)) top.add(n); }
  }
  const inside = new Set(STEP_ROOTS);
  for (let ch = true; ch;) { ch = false; for (const n of names) { if (inside.has(n) || top.has(n)) continue; const cs = callers.get(n); if (cs && cs.size && [...cs].every((c) => inside.has(c))) { inside.add(n); ch = true; } } }
  const rows = [];
  for (const [n, F] of funcs) F.text.split('\n').forEach((l, j) => { for (const m of NC(l).matchAll(W)) rows.push({ file: F.file, line: F.a + j, fn: n, field: m[2], inside: inside.has(n), touched: TOUCH.test(F.text) }); });
  return { rows, funcs, inside };
}
module.exports = { census, FIELDS, STEP_ROOTS };
