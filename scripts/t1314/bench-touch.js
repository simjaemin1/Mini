'use strict';
// (러너 밖 · T1314 진단 · 미세 판) 첫 짚기 — 몸 1,500(칸 120 · 빠른 모드) · 패스 사이 16 MB 를 훑어 캐시를 비운 뒤 몸마다 ns:
//   A 몸 칸 하나 · B 몸 칸 여섯(앞 · 가운데 · 뒤 · 길 배열 길이) · C 칸 번호 하나 + 열 여섯 · D 열 여섯만(몸 안 짚기)
const N = 1500, F = 120, REP = +(process.argv[2] || 200);
const bodies = [], junk = [];
const mk = new Function('i', 'return { pid: "n" + i, x: i, y: i, _s: i, ' + Array.from({ length: F }, (_, k) => `f${k}: ${k} + i`).join(', ') + ', path: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };');   // 몸 리터럴 꼴(빠른 모드 · 존 몸과 같은 짓기)
for (let i = 0; i < N; i++) {
  const o = mk(i);
  bodies.push(o); for (let j = 0; j < 8; j++) junk.push({ a: j, b: [i, j] });   // 몸 사이에 다른 객체를 끼워 흩는다
}
const v8 = require('v8'); v8.setFlagsFromString('--allow-natives-syntax');
const fast = new Function('a', 'return %HasFastProperties(a)');
const cols = Array.from({ length: 6 }, () => new Float64Array(N)); for (let i = 0; i < N; i++) for (let c = 0; c < 6; c++) cols[c][i] = i + c;
const thrash = new Float64Array(2 << 20); let sink = 0;
const flush = () => { for (let i = 0; i < thrash.length; i += 8) thrash[i] += 1; };
const run = (name, fn) => { let t = 0n; for (let r = 0; r < REP; r++) { flush(); const t0 = process.hrtime.bigint(); sink += fn(); t += process.hrtime.bigint() - t0; } return [name, Number(t) / REP / N]; };
const out = [
  run('A 몸 칸 하나', () => { let s = 0; for (let i = 0; i < N; i++) s += bodies[i].f3; return s; }),
  run('B 몸 칸 여섯', () => { let s = 0; for (let i = 0; i < N; i++) { const p = bodies[i]; s += p.f3 + p.f40 + p.f80 + p.f115 + p.y + p.path.length; } return s; }),
  run('C 칸 번호 + 열 여섯', () => { let s = 0; for (let i = 0; i < N; i++) { const k = bodies[i]._s; s += cols[0][k] + cols[1][k] + cols[2][k] + cols[3][k] + cols[4][k] + cols[5][k]; } return s; }),
  run('D 열 여섯만', () => { let s = 0; for (let k = 0; k < N; k++) s += cols[0][k] + cols[1][k] + cols[2][k] + cols[3][k] + cols[4][k] + cols[5][k]; return s; }),
];
console.log(JSON.stringify({ N, F, REP, fast: fast(bodies[0]) && fast(bodies[N - 1]), ns: Object.fromEntries(out.map(([k, v]) => [k, +v.toFixed(2)])), sink: sink > 0 }));
