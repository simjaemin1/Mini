#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-body-chunks.js — 마을 청크는 몸이 있으면 켜진다 (T432 ①) =================================
//
// ★왜 [지시 T432 · ★PM 결정(위임) · 캐논 ⓑ① "관측자 없어도 실걸음"의 나머지 반]
//   T410 이 idle 문을 열었더니 기본 손잡이의 주민은 **청크 문 둘**(결정·이동 — 활성 청크 안의 몸만)에 섰다(걸음 0 → 0).
//   `updateActiveChunks` 가 사람·관측자 둘레만 켜서다. 손잡이 `T432_BODY_CHUNKS`(기본 끔)가 **주민 몸이 선 청크**를 더한다.
//   이 하네스가 지키는 것:
//     ① 손잡이 — 한 자리에서 읽힌다 · 기본 끔 · 블록은 그 손잡이 뒤 · 주민 = `simVillageId`(T316 걷기 술어가 보는 칸 · 새 술어 0) ·
//        겹침 띠 = `HANDOFF_COMMIT`(Phase 5-K2 존 경계 핸드오프의 그 수 · 새 수 0)
//     ② 끔 = **종전 집합 비트 동일** — 블록을 도려낸 종전 함수와 **차례까지** 같은 집합 · 같은 켜기/끄기 호출(청크 집합 해시)
//     ③ 켬 — 활성 청크 수 = 몸이 선 청크 수 + 둘레 · 몸이 없는 청크는 끈다 · 주민이 아닌 몸(사람 · 도적 · 쓰러진 몸)은 안 센다
//     ④ 히스테리시스 — 경계를 오가도 켜고 끄기가 안 되풀이된다 · 띠(COMMIT)를 넘어야 놓는다 · 사라진 몸의 청크는 놓는다
//     ⑤ 차례 — 몸마다 붙잡은 목록이 바뀌어도 집합이 같으면 **차례도 같다**(T421 증분 격자의 "집합이 차례까지 같은가")
//
// ⚠존을 부팅하지 않는다 — 존 소스에서 `updateActiveChunks` **원문 글자**를 뽑아 모의 세계(진짜 `ChunkManager`)에서 돌린다.
//
// 실행: node scripts/test-body-chunks.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const ZC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const bodyOf = (code, name) => (code.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}')) || [''])[0];
const { ChunkManager } = require(path.join(ROOT, 'server', 'chunk.js'));
const constOf = (name) => { const m = ZC.match(new RegExp('^const ' + name + ' = (\\d+);', 'm')); return m ? +m[1] : null; };

console.log('\n① 손잡이 · 주민 · 겹침 띠 — 새 술어 0 · 새 수 0');
const UAC = bodyOf(ZC, 'updateActiveChunks');
ok(/^const T432_BODY_CHUNKS = process\.env\.T432_BODY_CHUNKS === '1';$/m.test(ZC) && (ZC.match(/process\.env\.T432_BODY_CHUNKS/g) || []).length === 1,
  '① 손잡이 `T432_BODY_CHUNKS` 는 **한 자리**에서 읽힌다 · 기본 끔(`=1` 만 켬)');
const BLK = (UAC.match(/\n  if \(T432_BODY_CHUNKS\) \{[\s\S]*?\n  \}\n/) || [''])[0];
ok(BLK.length > 0 && (codeOf(UAC).match(/T432_BODY_CHUNKS/g) || []).length === 1,
  '① 몸 청크 블록은 **손잡이 한 번** 뒤에 통째로 선다(끄면 한 줄도 안 돈다)');
ok(/if \(!p\.isNpc \|\| !p\.simVillageId \|\| p\.hp <= 0\) continue;/.test(BLK) && /function _t316WalkAlways\(npc\) \{\n  if \(!npc \|\| !npc\.simVillageId\) return false;/.test(ZC),
  '① 주민 = `simVillageId` 가 있는 몸(T316 걷기 술어가 보는 **그 칸** · 새 술어 0) · 쓰러진 몸(hp ≤ 0)은 안 센다');
ok(/> HANDOFF_COMMIT\)/.test(BLK) && constOf('HANDOFF_COMMIT') === 256 && !/[^\w.](?:[2-9]|\d{2,})\b/.test(codeOf(BLK).replace(/\b(?:cx|cy|x0|y0|i|k|h|p|H|CX|CY|cs|tk)\b/g, '')),
  '① 겹침 띠 = `HANDOFF_COMMIT`(Phase 5-K2 존 경계 핸드오프 · 256px 그 수) — 블록에 **새 수 0**(0·1 만)', `HANDOFF_COMMIT=${constOf('HANDOFF_COMMIT')}`);
ok(/for \(const \[k, t\] of _t432Order\) \{ if \(t !== tk\) _t432Order\.delete\(k\); else newActive\.add\(k\); \}/.test(BLK),
  '① 집합에 넣는 차례 = 붙잡힌 차례(`_t432Order` · 이 판에 아무도 안 붙잡은 키는 놓는다)');
ok(UAC.indexOf('if (T432_BODY_CHUNKS) {') > UAC.indexOf('for (const data of observers.values())') && UAC.indexOf('if (T432_BODY_CHUNKS) {') < UAC.indexOf('// transition: 새로 활성된 청크'),
  '① 자리 — 사람·관측자 둘레 **뒤** · 켜기/끄기 전이 **앞**(전이는 종전 두 줄 그대로 · T309/T317 규약 무접촉)');

// ── 모의 세계 — 원문 글자를 그대로 돌린다(진짜 ChunkManager · 켜기/끄기는 호출만 적는다) ─────────────────────
const W = 20 * 1024, Hh = 16 * 1024;
const CAR = constOf('CHUNK_ACTIVE_RADIUS'), HC = constOf('HANDOFF_COMMIT'), BSP = constOf('BUILDING_SEND_PER_TICK');
function mk(src, on) {
  const env = { players: new Map(), observers: new Map(), cm: new ChunkManager(W, Hh), on: [], off: [] };
  const f = new Function('env', `
    const players = env.players, observers = env.observers, chunkManager = env.cm;
    const CHUNK_ACTIVE_RADIUS = ${CAR}, HANDOFF_COMMIT = ${HC}, BUILDING_SEND_PER_TICK = ${BSP}, T432_BODY_CHUNKS = ${on ? 'true' : 'false'};
    let activeChunkKeys = new Set(), prevActiveChunkKeys = new Set(), _buildingSendQueue = [];
    const _t432Order = new Map(); let _t432Tick = 0;
    const broadcast = () => {};
    const activateChunk = (cx, cy) => env.on.push(cx + '_' + cy);
    const deactivateChunk = (cx, cy) => env.off.push(cx + '_' + cy);
    ${src}
    return () => { updateActiveChunks(); return [...activeChunkKeys]; };`);
  env.tick = f(env);
  return env;
}
// 종전 함수 = 원문에서 몸 청크 블록을 도려낸 글자(T410 착지본의 몸통과 같다 — 블록 밖은 한 글자도 안 바뀌었다)
const OLD = UAC.replace(BLK, '\n');
let _s = 12345; const rnd = () => ((_s = (_s * 1103515245 + 12345) >>> 0) / 4294967296);
const hashOf = (arr) => { let h = 2166136261; for (const k of arr) for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };

console.log('\n② 끔 = 종전 집합 비트 동일 — 블록을 도려낸 종전 함수와 차례까지 · 켜기/끄기 호출까지');
{
  let same = 0, N = 0, hA = 0, hB = 0, callsSame = true, nonEmpty = 0;
  for (let sc = 0; sc < 120; sc++) {
    const A = mk(UAC, false), B = mk(OLD, false);
    for (const E of [A, B]) { E.players.clear(); E.observers.clear(); }
    const nh = (rnd() * 3) | 0, no = (rnd() * 2) | 0, nr = (rnd() * 60) | 0;
    const P = [];
    for (let i = 0; i < nh; i++) P.push({ pid: 'h' + i, isNpc: false, hp: rnd() < 0.9 ? 100 : 0, x: rnd() * W, y: rnd() * Hh });
    for (let i = 0; i < nr; i++) P.push({ pid: 'n' + i, isNpc: true, simVillageId: rnd() < 0.8 ? 1 + (i % 5) : undefined, hp: 100, x: rnd() * W, y: rnd() * Hh });
    const O = []; for (let i = 0; i < no; i++) O.push({ viewerX: rnd() * W, viewerY: rnd() * Hh });
    for (const E of [A, B]) { for (const p of P) E.players.set(p.pid, Object.assign({}, p)); O.forEach((o, i) => E.observers.set(i, Object.assign({}, o))); }
    for (let t = 0; t < 4; t++) {   // 여러 판 — 몸·사람이 움직인다(두 세계에 같은 걸음)
      const a = A.tick(), b = B.tick(); N++;
      if (a.join('|') === b.join('|')) same++;
      if (a.length) nonEmpty++;
      hA = (hA ^ hashOf(a)) >>> 0; hB = (hB ^ hashOf(b)) >>> 0;
      const step = [...A.players.values()].map(() => [(rnd() - 0.5) * 900, (rnd() - 0.5) * 900]);
      for (const E of [A, B]) { let i = 0; for (const p of E.players.values()) { p.x = Math.max(0, Math.min(W - 1, p.x + step[i][0])); p.y = Math.max(0, Math.min(Hh - 1, p.y + step[i][1])); i++; } }
    }
    if (A.on.join() !== B.on.join() || A.off.join() !== B.off.join()) callsSame = false;
  }
  ok(same === N && hA === hB, '② ★★끔 — 120판 × 4틱 집합이 **차례까지** 종전 함수와 같다(청크 집합 해시 같음)', `${same}/${N} · 해시 ${hA.toString(16)} = ${hB.toString(16)}`);
  ok(callsSame, '② ★끔 — 켜기(`activateChunk`) · 끄기(`deactivateChunk`) 호출 차례도 같다');
  ok(nonEmpty > N / 3, '② [자명 통과 금지] 비교한 판의 1/3 넘게 활성 청크가 **있다**(빈 집합끼리 같은 것이 아니다)', `${nonEmpty}/${N}`);
  // 끔이면 주민이 아무리 많아도 집합에 안 든다
  const E = mk(UAC, false);
  for (let i = 0; i < 40; i++) E.players.set('n' + i, { isNpc: true, simVillageId: 1, hp: 100, x: 3000 + i * 300, y: 5000 });
  ok(E.tick().length === 0 && E.on.length === 0, '② 끔 — 주민 40이 서 있어도 사람·관측자가 없으면 활성 청크 **0**(종전 · T410 청크 표의 ∅)');
}

console.log('\n③ 켬 — 활성 청크 수 = 몸이 선 청크 수 + 둘레 · 몸 없는 청크는 끈다 · 주민 아닌 몸은 안 센다');
{
  const E = mk(UAC, true);
  // 주민 셋: 두 몸이 같은 청크 한가운데 · 한 몸은 다른 청크 한가운데(띠 밖)
  E.players.set('a', { isNpc: true, simVillageId: 1, hp: 100, x: 3 * 1024 + 512, y: 4 * 1024 + 512 });
  E.players.set('b', { isNpc: true, simVillageId: 1, hp: 100, x: 3 * 1024 + 500, y: 4 * 1024 + 530 });
  E.players.set('c', { isNpc: true, simVillageId: 2, hp: 100, x: 9 * 1024 + 512, y: 2 * 1024 + 512 });
  // 안 세는 몸: 마을 밖 NPC(도적 등) · 쓰러진 주민
  E.players.set('d', { isNpc: true, hp: 100, x: 15 * 1024 + 512, y: 12 * 1024 + 512 });
  E.players.set('e', { isNpc: true, simVillageId: 3, hp: 0, x: 17 * 1024 + 512, y: 12 * 1024 + 512 });
  const s0 = E.tick();
  ok(s0.length === 2 && s0.includes('3_4') && s0.includes('9_2'), '③ ★몸이 선 청크만 켠다 — 주민 셋 · 청크 둘(같은 청크의 두 몸은 한 번) · 둘레 0', `[${s0}]`);
  ok(!s0.includes('15_12') && !s0.includes('17_12'), '③ 마을 밖 NPC(`simVillageId` 없음)와 쓰러진 주민(hp 0)은 청크를 안 켠다');
  // 관측자 하나를 더하면 = 둘레(5×5) ∪ 몸 청크
  E.observers.set('o', { viewerX: 12 * 1024 + 512, viewerY: 9 * 1024 + 512 });
  const s1 = E.tick(), r = Math.ceil(CAR / 1024), ring = (2 * r + 1) * (2 * r + 1);
  ok(s1.length === ring + 2, '③ ★게이트 — 활성 청크 수 = 몸이 선 청크 수(2) + 둘레(관측자 하나 · 겹침 0)', `${s1.length} = 2 + ${ring}`);
  // 몸이 떠나면(사라지면) 그 청크는 다음 판에 꺼진다
  E.players.delete('c'); E.on.length = 0; E.off.length = 0;
  const s2 = E.tick();
  ok(!s2.includes('9_2') && E.off.join() === '9_2' && E.on.length === 0, '③ 몸이 사라진 청크는 **다음 판에** 끈다(끄기 한 번 · 다른 청크 무변)', `끄기 [${E.off}]`);
  // 사람 player 는 종전 규칙(둘레) 그대로 — 몸 청크 규칙에 안 든다
  const F = mk(UAC, true); F.players.set('h', { isNpc: false, hp: 100, x: 5 * 1024 + 10, y: 5 * 1024 + 10 });
  ok(F.tick().length === ring, '③ 사람 player 는 종전 둘레 그대로(몸 청크 규칙 밖)', `${ring}`);
  // 지도 밖 좌표(가장자리 클램프 너머)는 안 넣는다
  const G = mk(UAC, true); G.players.set('z', { isNpc: true, simVillageId: 1, hp: 100, x: W + 5, y: -3 });
  ok(G.tick().length === 0, '③ 청크 좌표가 지도 밖이면 안 넣는다(종전 둘레와 같은 경계 검사)');
}

console.log('\n④ 히스테리시스 — 겹침 띠(COMMIT) 안에서 오가면 켜고 끄기가 안 되풀이된다');
{
  const E = mk(UAC, true), B = 5 * 1024;   // 청크 (4,y)↔(5,y) 경계 x = 5120
  const p = { isNpc: true, simVillageId: 1, hp: 100, x: B - 400, y: 3 * 1024 + 512 };
  E.players.set('p', p);
  E.tick(); const on0 = E.on.length;
  let seq = [];
  for (let i = 0; i < 50; i++) { p.x = (i % 2) ? B - 100 : B + 100; seq.push(E.tick().length); }   // 경계를 50번 넘나든다(띠 안)
  ok(on0 === 1 && E.on.length === 2 && E.off.length === 0, '④ ★★경계를 50번 넘나들어도 켜기 **한 번**(이웃 청크) · 끄기 **0**(띠 안에선 놓지 않는다)', `켜기 ${E.on.length} · 끄기 ${E.off.length}`);
  ok(seq.every((n) => n === 2), '④ 그동안 두 청크가 **같이** 켜져 있다(선 청크는 늘 켜짐 — 몸이 청크 문에 안 걸린다)');
  p.x = B - HC; E.tick();
  ok(E.off.length === 0, '④ 이웃 청크 밖 **딱 COMMIT px**(띠 끝)까지는 아직 놓지 않는다', `x = 경계 − ${HC}`);
  p.x = B - HC - 1; E.tick();
  ok(E.off.join() === '5_3', '④ ★띠를 넘으면(COMMIT px 초과 — 한 px 라도) 이웃 청크를 **한 번** 놓는다', `x = 경계 − ${HC + 1} · 끄기 [${E.off}]`);
  // 모서리 — 네 청크가 만나는 점 곁을 돌면 넷까지 붙잡고, 멀어지면 셋을 놓는다
  const Q = mk(UAC, true), q = { isNpc: true, simVillageId: 1, hp: 100, x: 8 * 1024 - 50, y: 6 * 1024 - 50 };
  Q.players.set('q', q);
  for (const [dx, dy] of [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]) { q.x = 8 * 1024 - 50 + dx; q.y = 6 * 1024 - 50 + dy; Q.tick(); }
  ok(Q.on.length === 4 && Q.off.length === 0, '④ 모서리 — 네 청크를 돌면 넷을 붙잡는다(켜기 4 · 끄기 0)', `켜기 ${Q.on.length}`);
  q.x = 7 * 1024 + 300; q.y = 5 * 1024 + 300; Q.tick();   // 한 청크 한가운데 쪽으로 COMMIT 넘게
  ok(Q.off.length === 3 && Q.tick().length === 1, '④ 모서리에서 COMMIT 넘게 멀어지면 셋을 놓고 선 청크 하나만 남는다');
  // 순간이동(재배치) — 멀리 뛰면 옛 청크는 곧바로 놓는다
  const T = mk(UAC, true), tp = { isNpc: true, simVillageId: 1, hp: 100, x: 1 * 1024 + 512, y: 1 * 1024 + 512 };
  T.players.set('t', tp); T.tick(); tp.x = 15 * 1024 + 512; tp.y = 10 * 1024 + 512; const tt = T.tick();
  ok(tt.join() === '15_10' && T.off.join() === '1_1', '④ 멀리 옮겨진 몸 — 옛 청크를 곧바로 놓고 선 청크 하나');
}

console.log('\n⑤ 차례 — 몸마다 붙잡은 목록이 바뀌어도 집합이 같으면 차례도 같다(T421 증분 격자가 기대는 것)');
{
  const E = mk(UAC, true);
  // 네 청크 A B C D 를 몸 넷이 붙잡는다 · 그다음 몸들이 서로 자리를 바꿔 선다(집합 같음)
  const at = (cx, cy) => ({ x: cx * 1024 + 512, y: cy * 1024 + 512 });
  const ps = [at(2, 2), at(6, 2), at(2, 7), at(6, 7)].map((c, i) => Object.assign({ isNpc: true, simVillageId: 1, hp: 100 }, c));
  ps.forEach((p, i) => E.players.set('p' + i, p));
  const o0 = E.tick().join('|');
  // 둘이 청크를 맞바꾼다(멀리 옮김 — 옛 청크는 놓고 새 청크를 붙잡는다 · 집합은 같다)
  Object.assign(ps[0], at(6, 7)); Object.assign(ps[3], at(2, 2));
  const o1 = E.tick().join('|');
  ok(o1 === o0, '⑤ ★★몸 둘이 청크를 맞바꿔도(각자 놓고 새로 붙잡음) 집합의 **차례가 같다**', `${o0}`);
  // 한 청크를 두 몸이 붙잡다가 한 몸이 떠나도 차례는 같다
  const F = mk(UAC, true);
  const a = Object.assign({ isNpc: true, simVillageId: 1, hp: 100 }, at(3, 3)), b = Object.assign({ isNpc: true, simVillageId: 1, hp: 100 }, at(3, 3)), c = Object.assign({ isNpc: true, simVillageId: 1, hp: 100 }, at(9, 9));
  F.players.set('a', a); F.players.set('c', c); F.players.set('b', b);
  const f0 = F.tick().join('|'); F.players.delete('a'); const f1 = F.tick().join('|');
  ok(f1 === f0 && f0 === '3_3|9_9', '⑤ 같은 청크를 붙잡은 몸 하나가 떠나도(다른 몸이 붙잡고 있다) 집합·차례 무변', f1);
  // 새 청크는 **뒤에** 붙는다(있던 차례를 흔들지 않는다)
  const d = Object.assign({ isNpc: true, simVillageId: 1, hp: 100 }, at(1, 1)); F.players.set('d', d);
  ok(F.tick().join('|') === '3_3|9_9|1_1', '⑤ 새로 붙잡힌 청크는 **뒤에** 붙는다(있던 차례 무변)');
  // T421 증분 격자는 "집합이 차례까지 같은가" 를 본다 — 그 줄이 그대로인가(무접촉 확인)
  ok(/for \(const k of activeChunkKeys\) \{ if \(keysSame && S\.keys\[ki\] !== k\) keysSame = false; S\.keys\[ki\+\+\] = k; \}/.test(ZC),
    '⑤ T421 `_rebuildSpatialInc` 의 "집합이 차례까지 같은가" 줄은 무접촉(이 카드는 그 줄에 기대기만 한다)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
