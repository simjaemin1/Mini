#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1257-seed-handoff.js — 손에 든 씨 몫 `_t1243S` 를 몸 줄(넘김 · 재기동)에 (T1257 · T1252 회부 2) ==========================
//
// ★왜 T1243 추신 14 — 켬(`T1243_FARM_ON=1`) 판에서 거둔 몸은 씨를 손에 들고(`_t1243Reaped` → `inventory[씨]` · `_t1243S[씨]`) 귀환 때 곳간에 내린다
//   (`_t368Deliver`). 그 몫 칸 `_t1243S` 가 몸 줄 칸 목록(`_T747_KEYS`)에 없어, 다시 뜬 몸은 씨를 "그냥 손 물건"으로 들고 귀환해도 곳간에 안 내렸다.
// 판정 사본 0: 운영 함수 그대로(`villages.__p3Bind` — `_t368Hold` · `_t1243Reaped` · `_t747Pack` · `_t747Restore` · `_t368Deliver`).
//   "다시 뜸" = **다른 프로세스**(모듈 새로 적재 · 몸 = 새 객체).
// 지키는 것:
//   ⓪ 정적 — `_t1243S` 가 저장 칸 목록 · 되살림 칸 목록에 하나씩
//   ① ★켬 — 판 1 에서 거둔 몸 손에 씨 몫이 섰다(운영 `_t1243Reaped`) → 몸 줄에 실렸다 → 판 2(새 프로세스)에서 되살린 몸이 귀환하면
//        씨가 곳간에 든다(판 1 에서 그대로 귀환한 것과 같은 곳간 · 손 0)
//   ② ★미끼 — 몸 줄에서 `_t1243S` 를 뺀 판(= 종전 칸 목록)으로 되살리면 씨가 손에 남고 곳간 씨 0(끊김 — 카드가 적은 꼴)
//   ③ 끔(기본) — 씨 몫 칸이 안 선다 · 몸 줄에 `_t1243S` 칸 0(끔 바이트 같음)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

if (process.env.T1257_SUB) {
  const PH = process.env.T1257_SUB;
  const IN = process.env.T1257_IN ? JSON.parse(fs.readFileSync(process.env.T1257_IN, 'utf8')) : null;
  const out = { ph: PH };
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try {
    const V = require(SV('villages.js')), C = require(SV('crops.js'));
    const DAY = 1440000, day = 300;
    const players = new Map();
    const A = { name: '갑촌', npcPids: [], _crop: new Map(), _terrSet: new Set(['3,4']), econ: { name: '갑촌', npcs: [], counts: {}, storage: { food: 0 } } };
    const H = V.__p3Bind({ deps: { players, setHp: (p, hp) => { p.hp = hp; } }, world: { villages: [A.econ], day }, villages: [A] });
    const mk = (pid) => { const p = { pid, isNpc: true, hp: 100, inventory: {} }; players.set(pid, p); return p; };
    const c = 'rice', sd = C.seedOf(c);
    out.sd = sd; out.on = H._t1243On();
    if (PH === 'save' || PH === 'direct') {
      const s1 = mk('s1'); A.npcPids = ['s1'];
      A._crop.set('3,4', { c, p: day - 120, td: day - 120, w: day - 120, wd: 0, ps: 0, q: 1 });
      const it = { c, u: 12 };
      if (H._t1243On()) H._t1243Reaped(A, '3,4', c, day, s1, it);   // 운영 — 거둔 몫에서 씨를 손에(운영 거두기도 `_t1243On()` 일 때만 부른다)
      H._t368Hold(s1, it);
      out.hand = Object.assign({}, s1.inventory); out.S = s1._t1243S ? Object.assign({}, s1._t1243S) : null;
      if (PH === 'direct') { H._t368Deliver(A, s1, 'gran'); out.st = A.econ.storage[sd] || 0; out.handAfter = (s1.inventory[sd] || 0); }
      else { const P = H._t747Pack(A); out.rows = P; out.has = !!(P.rows[0] && '_t1243S' in P.rows[0]); out.rowBytes = Buffer.byteLength(JSON.stringify(P.rows[0])); }
    }
    if (PH === 'restore') {
      const s1 = mk('s1'); A.npcPids = ['s1'];
      A.econ._t747Body = IN;   // 몸 줄 = `_t747Pack` 이 낸 그대로({ rows, sh })
      H._t747Restore();
      out.S = s1._t1243S ? Object.assign({}, s1._t1243S) : null; out.hand = Object.assign({}, s1.inventory);
      H._t368Deliver(A, s1, 'gran');
      out.st = A.econ.storage[sd] || 0; out.handAfter = (s1.inventory[sd] || 0);
    }
  } catch (e) { out.err = String((e && e.stack) || e).slice(0, 600); }
  _log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const KNOBS = ['T1243_FARM_ON', 'T747_BODY_KEEP', 'T1257_SUB', 'T1257_IN'];
const BASE = (() => { const e = Object.assign({}, process.env); for (const k of KNOBS) delete e[k]; return e; })();
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 't1257-'));
let nTmp = 0;
function sub(ph, on, inObj) {
  const env = Object.assign({}, BASE, { T1257_SUB: ph });
  if (on) env.T1243_FARM_ON = '1';
  if (inObj) { const f = path.join(TMP, `in-${nTmp++}.json`); fs.writeFileSync(f, JSON.stringify(inObj)); env.T1257_IN = f; }
  try { return JSON.parse(execFileSync(process.execPath, [__filename], { env, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()); }
  catch (e) { return { err: String((e && e.message) || e).slice(0, 400) }; }
}
const J = JSON.stringify;
console.log('\n=== 손에 든 씨 몫 `_t1243S` — 몸 줄(넘김 · 재기동) ===');
{
  const Vs = fs.readFileSync(SV('villages.js'), 'utf8');
  const keys = (Vs.match(/const _T747_KEYS = \[([^\]]*)\]/) || [])[1] || '';
  const rest = (Vs.match(/for \(const k of \[('oreLedger'[^\]]*)\]\)\n\s*if \(k in S\) b\[k\] = S\[k\];/) || [])[1] || '';
  ok((keys.match(/'_t1243S'/g) || []).length === 1 && (rest.match(/'_t1243S'/g) || []).length === 1, '⓪ `_t1243S` — 저장 칸 목록 · 되살림 칸 목록에 하나씩');
}
const D1 = sub('direct', true), S1 = sub('save', true), S0 = sub('save', false);
const pre = !D1.err && !S1.err && !S0.err && D1.on === true && S1.S && S1.S[S1.sd] > 0 && S1.hand[S1.sd] === S1.S[S1.sd] && D1.st === S1.S[S1.sd];
ok(pre, '[상황] 켬 판 1 — 거둔 몸 손에 씨 몫이 섰다(운영 `_t1243Reaped`) · 그대로 귀환하면 곳간 씨 = 그 몫', S1.err || D1.err || S0.err || J({ S: S1.S, direct: D1.st }));
if (pre) {
  const R1 = sub('restore', true, S1.rows);
  const cut = JSON.parse(J(S1.rows)); delete cut.rows[0]._t1243S;
  const RB = sub('restore', true, cut);
  ok(!R1.err && S1.has && J(R1.S) === J(S1.S) && R1.st === D1.st && R1.handAfter === 0,
    '★① 켬 — 몸 줄에 실려 판 2(새 프로세스)에서 되살린 몸이 귀환하면 씨가 곳간에(판 1 에서 그대로 귀환한 것과 같은 곳간 · 손 0)', R1.err || J({ S: R1.S, 곳간: R1.st, 바로: D1.st, 손: R1.handAfter }));
  ok(!RB.err && RB.S === null && RB.st === 0 && RB.handAfter === S1.S[S1.sd],
    '★② 미끼 — 몸 줄에서 `_t1243S` 를 뺀 판(종전 칸 목록)은 씨가 손에 남고 곳간 씨 0(끊김)', RB.err || J({ S: RB.S, 곳간: RB.st, 손: RB.handAfter }));
}
ok(!S0.err && S0.on === false && S0.S === null && S0.has === false, '③ 끔(기본) — 씨 몫 칸이 안 선다 · 몸 줄에 `_t1243S` 칸 0(끔 바이트 같음)', S0.err || J({ S: S0.S, has: S0.has, bytes: S0.rowBytes }));
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
