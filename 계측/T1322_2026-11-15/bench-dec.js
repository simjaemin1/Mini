'use strict';
const N = 1500, F = 150, REP = 200, SHUF = process.argv[2] === 'shuf';
const keys = Array.from({ length: F }, (_, k) => 'f' + k);
const mk = new Function('i', 'return { pid: "n" + i, x: i, y: i, vx: 0, vy: 0, ' + keys.map((k, j) => `${k}: ${j} + i`).join(', ') + ', _stuckPos: null };');
const bodies = [], junk = [], players = new Map(), npcs = new Set();
for (let i = 0; i < N; i++) { const o = mk(i); bodies.push(o); for (let j = 0; j < 6; j++) junk.push({ a: j, b: [i, j] }); }
for (let i = 0; i < N; i++) { bodies[i]._stuckPos = { x: i, y: i, at: 0 }; for (let j = 0; j < 3; j++) junk.push([i, j, 'z' + j]); }
const ord = bodies.map((_, i) => i); if (SHUF) for (let i = N - 1; i > 0; i--) { const j = (i * 7919) % (i + 1); [ord[i], ord[j]] = [ord[j], ord[i]]; }
for (const i of ord) { players.set(bodies[i].pid, bodies[i]); npcs.add(bodies[i].pid); }
const arr = ord.map((i) => bodies[i]);
const thrash = new Float64Array(2 << 20); let sink = 0;
const flush = () => { for (let i = 0; i < thrash.length; i += 8) thrash[i] += 1; };
const run = (name, fn) => { let t = 0n; for (let r = 0; r < REP; r++) { flush(); const t0 = process.hrtime.bigint(); sink += fn(); t += process.hrtime.bigint() - t0; } return [name, +(Number(t) / REP / N).toFixed(1)]; };
const R = [
  run('Set 순회만', () => { let s = 0; for (const pid of npcs) s += pid.length; return s; }),
  run('Set + Map.get', () => { let s = 0; for (const pid of npcs) { const p = players.get(pid); if (p) s++; } return s; }),
  run('Set + Map.get + 칸 하나', () => { let s = 0; for (const pid of npcs) { const p = players.get(pid); s += p.f30; } return s; }),
  run('Set + Map.get + 줄 넷', () => { let s = 0; for (const pid of npcs) { const p = players.get(pid); s += p.f30 + p.f60 + p.f90 + p.f120; } return s; }),
  run('Set + Map.get + 줄 넷 + 몸 밖', () => { let s = 0; for (const pid of npcs) { const p = players.get(pid); s += p.f30 + p.f60 + p.f90 + p.f120 + p._stuckPos.at; } return s; }),
  run('배열 + 줄 넷 + 몸 밖', () => { let s = 0; for (let i = 0; i < N; i++) { const p = arr[i]; s += p.f30 + p.f60 + p.f90 + p.f120 + p._stuckPos.at; } return s; }),
];
console.log(SHUF ? '흩은 차례' : '낳은 차례', JSON.stringify(Object.fromEntries(R)));
