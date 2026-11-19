'use strict';
// (러너 밖 · T1337 미세 판) 낮 걷는 몸 걸음 문 — 몸 객체 꼴 ↔ 열 커널 꼴(`walk-wasm` 처럼 열에서 셈 · 몸엔 속도만 되씀).
//   몸 1,500(칸 150 · 리터럴 · 몸 밖 `_stuckPos` · 길 배열) 중 걷는 몸 FRAC · 패스 사이 16 MB 훑어 캐시를 비운 뒤 걷는 몸 하나당 ns.
//   A 지금 꼴 — pid Set + Map → 몸 칸(길 · 길 번호 · 거울 · 자리 · 막힘 자리 · 시각) → 따라가기(hypot · 나눗셈) + 막힘 판정 → 몸에 속도 · 막힘 쓰기
//   B 열 커널 — 걷는 몸 칸 번호 배열을 돌며 열(X · Y · WX · WY · SX · SY · SA)만 읽고 셈 → 열 VX · VY · 막힘 열에 씀(몸 0)
//   C 열 커널 + 몸에 속도 되씀(이동 문 · 방송이 몸 vx · vy 를 읽는 동안의 값 — 몸 첫 짚기 하나)
const N = 1500, F = 150, REP = +(process.argv[2] || 200), FRAC = +(process.argv[3] || 0.33);
const mk = new Function('i', 'return { pid: "n" + i, x: i * 7.5, y: i * 3.25, vx: 0, vy: 0, ' + Array.from({ length: F }, (_, k) => `f${k}: ${k} + i`).join(', ') + ', path: null, pathIndex: 0, _t791P: null, _t791Pn: 0, _t791Px: 0, _t791Py: 0, _stuckPos: null, _stuckN: 0 };');
const bodies = [], junk = [], players = new Map(), npcs = new Set();
for (let i = 0; i < N; i++) { const o = mk(i); bodies.push(o); for (let j = 0; j < 6; j++) junk.push({ a: j, b: [i, j] }); }
for (let i = 0; i < N; i++) { const b = bodies[i]; b._stuckPos = { x: b.x - 3, y: b.y + 2, at: 0 }; b.path = [{ x: b.x + 40, y: b.y + 30 }, { x: b.x + 90, y: b.y + 10 }]; b._t791P = b.path; b._t791Pn = 2; b._t791Px = b.path[0].x; b._t791Py = b.path[0].y; for (let j = 0; j < 3; j++) junk.push([i, j]); }
for (const b of bodies) { players.set(b.pid, b); npcs.add(b.pid); }
const walk = []; for (let i = 0; i < N; i++) if (((i * 2654435761) >>> 0) / 4294967296 < FRAC) walk.push(i);
const W = walk.length;
const X = new Float64Array(N), Y = new Float64Array(N), WX = new Float64Array(N), WY = new Float64Array(N), SX = new Float64Array(N), SY = new Float64Array(N), SA = new Float64Array(N), VX = new Float64Array(N), VY = new Float64Array(N);
for (let i = 0; i < N; i++) { const b = bodies[i]; X[i] = b.x; Y[i] = b.y; WX[i] = b._t791Px; WY[i] = b._t791Py; SX[i] = b._stuckPos.x; SY[i] = b._stuckPos.y; SA[i] = 0; }
const isW = new Uint8Array(N); for (const i of walk) isW[i] = 1;
const thrash = new Float64Array(2 << 20); let sink = 0;
const flush = () => { for (let i = 0; i < thrash.length; i += 8) thrash[i] += 1; };
let now = 1e6;
const run = (name, fn) => { let t = 0n; for (let r = 0; r < REP; r++) { flush(); now += 50; const t0 = process.hrtime.bigint(); sink += fn(now); t += process.hrtime.bigint() - t0; } return [name, +(Number(t) / REP / W).toFixed(1)]; };
const A = (now) => { let s = 0; let i = 0; for (const pid of npcs) { const p = players.get(pid); if (!isW[i++]) continue;
  const P = p.path, M = P === p._t791P; if (!P || p.pathIndex >= (M ? p._t791Pn : P.length)) continue;
  const wx = M && p.pathIndex === 0 ? p._t791Px : P[p.pathIndex].x, wy = M && p.pathIndex === 0 ? p._t791Py : P[p.pathIndex].y;
  const S = p._stuckPos, sdx = p.x - S.x, sdy = p.y - S.y; if (sdx * sdx + sdy * sdy > 25) { S.x = p.x; S.y = p.y; S.at = now; p._stuckN = 0; } else if (now - S.at > 1500) s++;
  const dx = wx - p.x, dy = wy - p.y, dd = Math.hypot(dx, dy); p.vx = dx / dd * 64; p.vy = dy / dd * 64; s += p.vx; } return s; };
const B = (now) => { let s = 0; for (let k = 0; k < W; k++) { const i = walk[k];
  const sdx = X[i] - SX[i], sdy = Y[i] - SY[i]; if (sdx * sdx + sdy * sdy > 25) { SX[i] = X[i]; SY[i] = Y[i]; SA[i] = now; } else if (now - SA[i] > 1500) s++;
  const dx = WX[i] - X[i], dy = WY[i] - Y[i], dd = Math.hypot(dx, dy); VX[i] = dx / dd * 64; VY[i] = dy / dd * 64; s += VX[i]; } return s; };
const C = (now) => { const s = B(now); for (let k = 0; k < W; k++) { const i = walk[k], p = bodies[i]; p.vx = VX[i]; p.vy = VY[i]; } return s; };
const out = [run('A 몸 객체 꼴(걷는 몸 하나당)', A), run('B 열 커널(몸 0)', B), run('C 열 커널 + 몸에 속도 되씀', C)];
console.log(JSON.stringify({ N, F, REP, FRAC, walk: W, ns: Object.fromEntries(out), sink: sink !== 0 }));
