'use strict';
// (러너 밖 · T1322 미세 판) 서 있는 몸 걸음 꼴 — 몸 1,500(칸 150 · 리터럴 · 사이에 다른 객체) · 몸 밖 `_stuckPos` · pid Set + Map 찾기 ·
//   패스 사이 16 MB 를 훑어 캐시를 비운 뒤 몸마다 ns. 팔:
//   A 지금 꼴(Set 순회 → Map → 몸 칸 ≈ 20 읽기(줄 넷) · 도장 셋 쓰기)
//   B 열 거름(열 여섯 훑어 할 일 몸 번호만 → 그 몸만 A 몸통 · 거르는 몫 f) — 쓰기 길 곱(쓰기마다 열 한 번 더)은 따로 W 팔
//   C 데우기(블록 32 — 몸 칸 줄마다 한 번 · `_stuckPos` 를 먼저 읽고 A 몸통)
//   W 쓰기 길 두 곳(몸 칸 + 열) — 몸당 쓰기 k 번의 늘어남
const N = 1500, F = 150, REP = +(process.argv[2] || 200), FRAC = +(process.argv[3] || 0.62);
const keys = Array.from({ length: F }, (_, k) => 'f' + k);
const mk = new Function('i', 'return { pid: "n" + i, x: i, y: i, vx: 0, vy: 0, ' + keys.map((k, j) => `${k}: ${j} + i`).join(', ') + ', _stuckPos: null };');
const bodies = [], junk = [], players = new Map(), npcs = new Set();
for (let i = 0; i < N; i++) { const o = mk(i); bodies.push(o); for (let j = 0; j < 6; j++) junk.push({ a: j, b: [i, j] }); }
for (let i = 0; i < N; i++) { bodies[i]._stuckPos = { x: i, y: i, at: 0 }; for (let j = 0; j < 3; j++) junk.push([i, j, 'z' + j]); }
const ord = bodies.map((_, i) => i); for (let i = N - 1; i > 0; i--) { const j = (i * 7919) % (i + 1); [ord[i], ord[j]] = [ord[j], ord[i]]; }
for (const i of ord) { players.set(bodies[i].pid, bodies[i]); npcs.add(bodies[i].pid); }
const act = new Uint8Array(N); for (let i = 0; i < N; i++) act[i] = ((i * 2654435761) >>> 0) / 4294967296 < FRAC ? 0 : 1;   // 0 = 서 있는 몸(거를 수 있는 몸)
const slotOf = new Map(bodies.map((b, i) => [b.pid, i])); for (const b of bodies) b.f0 = slotOf.get(b.pid);
const cols = Array.from({ length: 6 }, () => new Float64Array(N)); for (let i = 0; i < N; i++) { cols[0][i] = act[i] ? 0 : 1e15; for (let c = 1; c < 6; c++) cols[c][i] = i + c; }
const thrash = new Float64Array(2 << 20); let sink = 0;
const flush = () => { for (let i = 0; i < thrash.length; i += 8) thrash[i] += 1; };
// 서 있는 몸 꼴 몸통 — 줄 넷에 흩어진 칸 ≈ 20 읽기 · 비교 · 도장 셋(하나는 몸 밖)
function stand(p, now) {
  let s = 0;
  if (p.f30 < now && !p.f31) s++;                 // 결정 문
  if (p.f32 && now < p.f33) s += 2;               // 대피
  if (p.f60 !== p.f61 || p.f62 !== p.f63) s += 3; // 밤 침대 목표
  if (p.f90 !== undefined && p.f91 >= 0 && p.f92 === p.f93) s += 4;   // 길 끝 · 거울
  const dx = p.f120 - p.x, dy = p.f121 - p.y; if (dx * dx + dy * dy < 100) s += 5;
  if (p.f122 === p.f123 && p.f124 === p.f125) s += 6;
  const S = p._stuckPos; S.x = p.x; S.y = p.y; S.at = now;
  p.f34 = now; p.f126 = now; p.vx = 0; p.vy = 0;
  return s;
}
let tick = 1e6;
const run = (name, fn) => { let t = 0n; for (let r = 0; r < REP; r++) { flush(); tick += 100; const t0 = process.hrtime.bigint(); sink += fn(tick); t += process.hrtime.bigint() - t0; } return [name, Number(t) / REP / N]; };
const A = (now) => { let s = 0; for (const pid of npcs) { const p = players.get(pid); if (!p) continue; s += stand(p, now); } return s; };
const B = (now) => {   // 열만 훑어 할 일 있는 몸만(차례 = 열 차례 — 진짜는 npcs 차례를 지켜야 한다 · 여기선 값싼 쪽으로 잰다)
  let s = 0; const c0 = cols[0];
  for (let k = 0; k < N; k++) if (c0[k] <= now || cols[1][k] < 0) s += stand(bodies[k], now);
  return s;
};
const C = (now) => {
  let s = 0; const L = []; for (const pid of npcs) L.push(players.get(pid));
  for (let i0 = 0; i0 < L.length; i0 += 32) {
    const i1 = Math.min(L.length, i0 + 32);
    for (let i = i0; i < i1; i++) { const p = L[i]; s += (p.f30 > 0) + (p.f60 > 0) + (p.f90 > 0) + (p.f120 > 0) + (p._stuckPos.at > 0); }
    for (let i = i0; i < i1; i++) s += stand(L[i], now);
  }
  return s;
};
const Wk = 6;   // 몸당 열 쓰기 늘어남(쓰기 길 두 곳) — 걷는 몸은 틱마다 x · y · vx · vy · 길 번호 · 막힘 도장
const W = (now) => { let s = 0; for (let k = 0; k < N; k++) { if (act[k]) for (let j = 0; j < Wk; j++) cols[1 + (j % 5)][k] = now + j; } return s; };
const out = [run('A 지금 꼴(서 있는 몸 전부 연다)', A), run(`B 열 거름(할 일 몸 ${(100 * (1 - FRAC)).toFixed(0)} % 만 연다)`, B), run('C 데우기 블록 32 + A', C), run(`W 쓰기 길 곱(걷는 몸 × 열 쓰기 ${Wk})`, W)];
console.log(JSON.stringify({ N, F, REP, FRAC, ns: Object.fromEntries(out.map(([k, v]) => [k, +v.toFixed(2)])), sink: sink > 0 }));
