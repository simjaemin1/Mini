#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1393 판 자 · 제품 무변)
// === scripts/t1393-bot-bench.js — 사람(봇) N 이 숲에 서 있을 때 깨어 있는 몸 수 · 틱 값(T1393 할 일 3 끝 줄) ======================
//   가짜 존(운영 시계 · 30 Hz · 1틱 = 1/30 게임분) · 몸 표 하나(무리터 51 — 마을 평균 2,923칸 원 · 몸 58 · 종 섞음 = 보이는 사냥 먹잇감 섞음 사슴 3 · 멧돼지 1 · 토끼 2) ·
//   봇 = 사람(가만히 선 몸 · 무리터 가운데 · N 이 51 보다 작으면 앞 N 곳). wildlife `tick` 을 그대로 돌리고 틱마다 CPU(µs)를 잰다.
//   쓰는 법: node scripts/t1393-bot-bench.js [N…=1,10,50] [--min 30](게임분) · 결과 JSON 한 줄씩.
'use strict';
process.env.T1331_BEAST_BODY = '1'; process.env.T1393_HUNT_CHASE = process.env.T1393_HUNT_CHASE || '1'; process.env.T1195_HUNT_REAL = '1';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const MIN = A.includes('--min') ? +A[A.indexOf('--min') + 1] : 30;
const NS = (A.find((x) => /^\d+(,\d+)*$/.test(x)) || '1,10,50').split(',').map(Number);
const { execFileSync } = require('child_process');
if (!process.env.__T1393_KID) {
  for (const n of NS) process.stdout.write(execFileSync(process.execPath, [__filename, String(n), '--min', String(MIN)], { env: Object.assign({}, process.env, { __T1393_KID: '1' }), encoding: 'utf8' }).split('\n').filter((l) => l.startsWith('{')).pop() + '\n');
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
Wl.init({ ZONE_ID: 'hanbando', ZONE: { zoneWidth: 4000 * 32, zoneHeight: 4000 * 32 }, TICK_HZ: 30, chunkManager: cm, mobs, players, isTerrainBlockedLocal: () => false, isRockTileLocal: () => false,
  terrainMod: { getForestMultiplier: () => 2 }, getActiveChunkKeys: () => new Set(), isPositionActive: () => true, spawnCorpse: () => null, damagePlayer: () => {}, broadcast: () => {},
  WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 }, setMobHp: (m, v) => { m.hp = v; }, simVillages: () => [], legacyVillages: [], rng, huntBudgetOf: () => Infinity, t1393Put: () => {} });
let now = 9 * 3600 * 1000;
const ticks = MIN * 60 * 30, us = [];
for (let t = 0; t < ticks; t++) { now += 1000 / 30; const u0 = process.cpuUsage(); Wl.tick(now); const u = process.cpuUsage(u0); if (t >= 30) us.push(u.user + u.system); }
us.sort((a, b) => a - b);
const st = Wl.t1393Stat ? Wl.t1393Stat() : {};
const q = (p) => us[Math.min(us.length - 1, Math.floor(p * us.length))];
const mean = us.reduce((a, c) => a + c, 0) / Math.max(1, us.length);
const awake = [...B.W.bodies.values()].filter((b) => b.mat).length;
console.log(JSON.stringify({ N, on: process.env.T1393_HUNT_CHASE === '1', bodies: B.alive(), awakeEnd: awake, awakePeak: st.awakePeak, fields: st.fieldPeak, cap: st.cap, usMean: +mean.toFixed(1), usP50: q(0.5), usP99: q(0.99), usMax: us[us.length - 1], usPerAwake: awake ? +(mean / awake).toFixed(2) : null, ticks, min: MIN }));
