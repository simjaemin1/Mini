#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1393 판 자 · 제품 무변)
// === scripts/t1393-hunt-field.js — 서버 사냥판 하나에서 사냥 한 번 재기(T1396 랩 표의 옆 칸 · T1393 할 일 3 첫 줄) ======================
//   서버 글자 그대로(`server/wildlife.js` 사냥판 · `_hunterBrain` · 블록 `updateMobs` · `server/beast-body.js` 몸 표) · 가짜 존 하나(운영 시계 축 — 1틱 6게임분 · 판은 1분씩 걷는다).
//   조건 = T1396 자와 같은 그림: 몸 환율 5,000 · 무리터 2,923칸(원) · 몸 58(그 종 하나) · 사냥꾼 1 · 3 · 17(일터 = 무리터 가장자리 20 m 안) · 24게임시간 사냥 · 숲 칸(숲 배수 2 — 시야 감쇠).
//   잰다: 하루 마리/사냥꾼 · 한 마리 분(사냥꾼 판 분 ÷ 사냥 죽음) · 다침(사냥꾼 hp 깎임 합 · 번) · 깬 몸 꼭대기 · 남은 몸.
//   `T1393_FOREST=0` = 숲 칸 없음(시야 감쇠 0 — 대조).
//   쓰는 법: node scripts/t1393-hunt-field.js [--seeds 7,1020] [--sp deer,wild_boar,arctic_hare] [--hunters 1,3,17] [--days 3] → JSON 줄
'use strict';
const path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2), opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
if (!process.env.__T1393_FIELD) {
  for (const seed of opt('seeds', '7,1020').split(',')) for (const sp of opt('sp', 'deer,wild_boar,arctic_hare').split(',')) for (const nh of opt('hunters', '1,3,17').split(','))
    process.stdout.write(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1393_FIELD: [seed, sp, nh, opt('days', '3')].join(':'), T1331_BEAST_BODY: '1', T1393_HUNT_CHASE: '1', T1195_HUNT_REAL: '1' }), encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter((l) => l.startsWith('{')).pop() + '\n');
  process.exit(0);
}
const [SEED, SP, NH, DAYS] = process.env.__T1393_FIELD.split(':'); const nh = +NH, days = +DAYS;
const BB = require(path.join(ROOT, 'server', 'beast-body.js')), Wl = require(path.join(ROOT, 'server', 'wildlife.js'));
let seed = (+SEED) * 2654435761 >>> 0; const rng = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const B = BB.create({ L_GAMEMAX: 100, L_GAMER: 0.002, huntTake: () => 0, species: [SP], scale: 5000 });
const R = Math.sqrt(2923 / Math.PI), led = new Map();
for (let x = -31; x <= 31; x++) for (let y = -31; y <= 31; y++) if (x * x + y * y <= R * R) led.set((500 + x) + ',' + (500 + y), 0);
const ks = [...led.keys()]; for (const k of ks) led.set(k, 58 * 5000 / ks.length);
B.migrate('V', led, 1);
const mobs = new Map(), players = new Map(), cm = { chunkSize: 1024, keyOf: (cx, cy) => cx + '_' + cy, insertMob: () => {}, removeMob: () => {}, updateMobChunk: () => {} };
let hurt = 0, hurtN = 0;
for (let i = 0; i < nh; i++) { const a = i / nh * 6.283, wx = 500 + Math.round(Math.cos(a) * 20), wy = 500 + Math.round(Math.sin(a) * 20);
  players.set('h' + i, { pid: 'h' + i, isNpc: true, simJob: 'hunter', _huntOn: 1, hp: 100, x: wx * 32, y: wy * 32, _workSite: { x: wx * 32, y: wy * 32 }, _huntWk: { cx: wx, cy: wy }, vx: 0, vy: 0 }); }
Wl.init({ ZONE_ID: 'hanbando', ZONE: { zoneWidth: 40000, zoneHeight: 40000 }, TICK_HZ: 30, chunkManager: cm, mobs, players, isTerrainBlockedLocal: () => false, isRockTileLocal: () => false,
  terrainMod: { getForestMultiplier: () => (process.env.T1393_FOREST === '0' ? 1 : 2) }, getActiveChunkKeys: () => new Set(), isPositionActive: () => false, spawnCorpse: () => null,
  damagePlayer: (p, d) => { hurt += d; hurtN++; p.hp = Math.max(1, p.hp - d); }, broadcast: () => {}, WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 }, setMobHp: (m, v) => { m.hp = v; },
  simVillages: () => [], legacyVillages: [], rng, huntBudgetOf: () => Infinity, t1393Put: (p, x, y) => { p.x = x; p.y = y; } });
let now = 7.2 * 3600 * 1000;   // 07:12(T1396 · hunt-check 시작)
const act = {};
for (let m = 0; m < days * 1440; m += 6) { now += 6000; Wl.tick(now); for (const p of players.values()) { p.hp = 100; const k = p._lifeAct || '-'; act[k] = (act[k] || 0) + 6; } }   // 다침은 세고 다시 채운다(랩 자 — 사냥꾼 수 고정)
const st = Wl.t1393Stat(), died = B.W.st.died;
console.log(JSON.stringify({ seed: +SEED, sp: SP, hunters: nh, days, perDay: +(died.hunt / nh / days).toFixed(2), minPerKill: died.hunt ? Math.round(st.huntMin / died.hunt) : null,
  kills: died.hunt, left: B.alive(), hurtN, hurt, awakePeak: st.awakePeak, wake: st.wake, sleep: st.sleep, act }));
