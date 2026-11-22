#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1416 판 자 · 제품 무변)
// === scripts/t1416-bot-bench.js — T1393 봇 자(`t1393-bot-bench.js` 그대로 · 같은 가짜 존 · 같은 몸 표 · 같은 씨)에 두 칸을 더한다 ===================
//   ① `--seen` — 봇이 진짜 사람처럼 **제 청크를 켠다**(존 `activeChunkKeys` = 봇이 선 청크 · 3×3) — T1393 자는 켜진 청크가 비어 있어(보는 이 0) 존 몹 그림자도 안 섰다.
//   ② 틱 CPU 와 함께 사냥판 셈(`t1393Stat` · `t1416Stat`)을 한 줄에 — 손잡이는 env 그대로(`T1416_FIELD_UNIT=1` 등).
//   쓰는 법: node scripts/t1416-bot-bench.js [N…=1,10,50] [--min 30] [--seen] → JSON 한 줄씩.
'use strict';
process.env.T1331_BEAST_BODY = '1'; process.env.T1393_HUNT_CHASE = process.env.T1393_HUNT_CHASE || '1'; process.env.T1195_HUNT_REAL = '1';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const MIN = A.includes('--min') ? +A[A.indexOf('--min') + 1] : 30;
const SEEN = A.includes('--seen');
const NS = (A.find((x) => /^\d+(,\d+)*$/.test(x)) || '1,10,50').split(',').map(Number);
const { execFileSync } = require('child_process');
if (!process.env.__T1416_KID) {
  for (const n of NS) process.stdout.write(execFileSync(process.execPath, [__filename, String(n), '--min', String(MIN)].concat(SEEN ? ['--seen'] : []), { env: Object.assign({}, process.env, { __T1416_KID: '1' }), encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter((l) => l.startsWith('{')).pop() + '\n');
  process.exit(0);
}
const N = NS[0];
const BB = require(path.join(ROOT, 'server', 'beast-body.js')), Wl = require(path.join(ROOT, 'server', 'wildlife.js'));
let seed = 7; const rng = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const B = BB.create({ L_GAMEMAX: 100, L_GAMER: 0.002, huntTake: () => 0, species: ['deer', 'deer', 'deer', 'wild_boar', 'arctic_hare', 'arctic_hare'], scale: 5000 });
const R = Math.sqrt(2923 / Math.PI), C = [];
for (let i = 0; i < 51; i++) {
  const cx = 300 + (i % 8) * 400, cy = 300 + Math.floor(i / 8) * 400; C.push([cx, cy]);
  const led = new Map(); for (let x = -31; x <= 31; x++) for (let y = -31; y <= 31; y++) if (x * x + y * y <= R * R) led.set((cx + x) + ',' + (cy + y), 0);
  const ks = [...led.keys()]; for (const k of ks) led.set(k, 58 * 5000 / ks.length);
  B.migrate('V' + i, led, 1);
}
const mobs = new Map(), players = new Map(), cm = { chunkSize: 1024, keyOf: (cx, cy) => cx + '_' + cy, insertMob: () => {}, removeMob: () => {}, updateMobChunk: () => {} };
for (let i = 0; i < N; i++) { const [cx, cy] = C[i % 51]; players.set('bot' + i, { pid: 'bot' + i, isNpc: false, hp: 100, x: (cx + (i / 51 | 0) * 3) * 32, y: cy * 32, vx: 0, vy: 0 }); }
const act = new Set();
if (SEEN) for (const p of players.values()) { const kx = Math.floor(p.x / 1024), ky = Math.floor(p.y / 1024); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) act.add((kx + dx) + '_' + (ky + dy)); }
Wl.init({ ZONE_ID: 'hanbando', ZONE: { zoneWidth: 4000 * 32, zoneHeight: 4000 * 32 }, TICK_HZ: 30, chunkManager: cm, mobs, players, isTerrainBlockedLocal: () => false, isRockTileLocal: () => false,
  terrainMod: { getForestMultiplier: () => 2 }, getActiveChunkKeys: () => act, isPositionActive: () => true, spawnCorpse: () => null, damagePlayer: () => {}, broadcast: () => {},
  WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 }, setMobHp: (m, v) => { m.hp = v; }, simVillages: () => [], legacyVillages: [], rng, huntBudgetOf: () => Infinity, t1393Put: () => {} });
let now = 9 * 3600 * 1000;
const ticks = MIN * 60 * 30, us = [];
for (let t = 0; t < ticks; t++) { now += 1000 / 30; const u0 = process.cpuUsage(); Wl.tick(now); const u = process.cpuUsage(u0); if (t >= 30) us.push(u.user + u.system); }
us.sort((a, b) => a - b);
const st = Wl.t1393Stat ? Wl.t1393Stat() : {}, s16 = Wl.t1416Stat ? Wl.t1416Stat() : {};
const q = (p) => us[Math.min(us.length - 1, Math.floor(p * us.length))];
const mean = us.reduce((a, c) => a + c, 0) / Math.max(1, us.length);
const awake = [...B.W.bodies.values()].filter((b) => b.mat).length;
console.log(JSON.stringify({ N, seen: SEEN, unit: !!s16.unit, pre: !!s16.pre, bodies: B.alive(), awakeEnd: awake, awakePeak: st.awakePeak, fields: st.fieldPeak, shadows: mobs.size,
  usMean: +mean.toFixed(1), usP50: q(0.5), usP99: q(0.99), usMax: us[us.length - 1], tickShare: +(mean / (1e6 / 30) * 100).toFixed(1), usPerAwake: awake ? +(mean / awake).toFixed(2) : null,
  unitSteps: s16.unitSteps, fracSteps: s16.fracSteps, obsFields: s16.obsFields, ticks, min: MIN }));
