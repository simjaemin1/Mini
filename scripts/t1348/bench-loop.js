// (@regress 없음 — 미세 판 · 제품 무변) T1348 ⓐ 결정 순회 고리 — 건너는 몸 하나의 몫: pid Set + 칸 Map + players Map ↔ 칸 번호 배열 + 열
'use strict';
const N = +(process.argv[2] || 1500), R = +(process.argv[3] || 4000);
class PM extends Map { set(k, v) { super.set(k, v); return this; } delete(k) { return super.delete(k); } }
function mk(MapC) {
  const players = new MapC(), npcs = new Set(), slotOf = new Map(), own = [], TK = new Uint8Array(N), VT = new Int32Array(N), NDA = new Float64Array(N), SK = new Float64Array(N), GN = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const pid = 'npc_' + (1e6 + i * 7919 % 100003); const p = { pid, x: i, y: i, hp: 100, junk: new Array(40).fill(i) }; players.set(pid, p); npcs.add(pid); slotOf.set(pid, i); own[i] = p; TK[i] = 1; NDA[i] = 1e12; }
  const P = [...npcs], S = P.map((pid) => slotOf.get(pid));
  return { players, npcs, slotOf, own, TK, VT, NDA, SK, GN, P, S };
}
function oldLoop(W, tick, now) { let k = 0; for (const pid of W.npcs) { const s0 = W.slotOf.get(pid), s = s0 === undefined ? -1 : s0; if (s >= 0 && W.TK[s] && W.players.get(pid) === W.own[s] && W.VT[s] === tick - 1 && now < W.NDA[s]) { W.SK[s] = now; W.VT[s] = tick; k++; continue; } } return k; }
function newLoop(W, tick, now) { let k = 0; const P = W.P, S = W.S, own = W.own; for (let i = 0; i < P.length; i++) { const pid = P[i]; if (pid === undefined) continue; let s = S[i]; if (s < 0 || own[s] === null) { const t = W.slotOf.get(pid); s = t === undefined ? -1 : t; S[i] = s; } if (s >= 0 && W.TK[s] && !W.GN[s] && W.VT[s] === tick - 1 && now < W.NDA[s]) { W.SK[s] = now; W.VT[s] = tick; k++; continue; } } return k; }
function run(name, W, f) { let t = 0; for (let r = 0; r < 300; r++) { t++; f(W, t, r); } const t0 = process.hrtime.bigint(); for (let r = 0; r < R; r++) { t++; f(W, t, r); } const ns = Number(process.hrtime.bigint() - t0) / R / N; console.log(`${name}: ${ns.toFixed(1)} ns/몸`); return ns; }
const W1 = mk(Map), W2 = mk(PM);
run('A 종전(Set · 칸 Map · players.get)', W1, oldLoop); run('A 종전 + players 하위 클래스', W2, oldLoop); run('B 칸 번호 배열 + 열', W1, newLoop);
run('A 종전(다시)', W1, oldLoop); run('B 칸 번호 배열(다시)', W1, newLoop);
// players.get 값 비교 — 하위 클래스가 get 을 늦추나
function gets(W) { let s = 0; for (const pid of W.P) if (W.players.get(pid)) s++; return s; }
for (const [nm, W] of [['Map.get', W1], ['PM.get', W2], ['Map.get', W1], ['PM.get', W2]]) { gets(W); const t0 = process.hrtime.bigint(); for (let r = 0; r < R; r++) gets(W); console.log(`${nm}: ${(Number(process.hrtime.bigint() - t0) / R / N).toFixed(1)} ns`); }
