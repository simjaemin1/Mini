#!/usr/bin/env node
// === scripts/t621-ghost-cost.js — `syncGhostsToNeighbors` 한 부름의 몫 가르기: 건물 훑기 ↔ 보내기 (T621 · 계측기) ===============
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(판정 0 · 표만 낸다).
//
// T605 타이머 팔은 그 함수 한 부름을 **통째로** 잰다(건물 훑기 + 유령 몸 + 몸통 만들기 + `postJSON` 동기 몫). 이 자는 같은 함수 글자를
// (`scripts/test-ghost-band.js` 와 같은 문법 — 존 소스를 떠서 함수로) 존을 안 띄우고 돌려 그 안을 가른다:
//   ⓐ 전(색인 한 줄을 `buildings.values()` 로 되돌린 판 · 평범한 Map) ↔ 후(지금 판 · `_BuildingMap`) — 보내기는 빈 손(몸통만 만든다)
//   ⓑ 같은 판에 보내기를 **진짜 `http.request`**(닫힌 포트 — 라이브 타이머 팔과 같은 꼴: 이웃 존이 없는 판)로 — 보내기 몫
//   건물 수 N 은 라이브 판의 수(`/health` buildings)와 그 열 배 · 띠 몫·종류 섞임은 시드 시나리오(띠 안 절반 · 종류 열둘).
//
// 실행: node scripts/t621-ghost-cost.js [--n 2196,21960] [--calls 3000] [--zone hanbando] [--band 12]
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const NS = opt('n', '2196,21960').split(',').map(Number);
const CALLS = +opt('calls', '3000');
const ZID = opt('zone', 'hanbando');
const BAND = opt('band', '');   // 주면: 띠 후보를 정확히 이만큼(서쪽 경계 한 집 — 라이브 판 꼴) · 나머지는 띠 밖
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const FN = (Z.match(/\nfunction syncGhostsToNeighbors\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
const a = Z.indexOf('\nconst GHOST_REACH = '), b = Z.indexOf('\nconst buildings = new _BuildingMap();');
const BLOCK = a >= 0 && b > a ? Z.slice(a, b) : '';
if (!FN || !BLOCK) { console.error('함수·색인 덩이를 못 떴다'); process.exit(1); }
const OLD_FN = FN.replace('for (const b of buildings.ghostBand())', 'for (const b of buildings.values())');
const REACH = (BLOCK.match(/\nconst GHOST_REACH = [^\n]*/) || [''])[0];
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const TYPES = ['wall', 'wall', 'wall', 'door', 'fence', 'fence', 'floor', 'farmland', 'farmland', 'farmland', 'chest', 'stair'];
const ZONE = ZC.ZONES[ZID];

function make(fnSrc, block, post) {
  const f = new Function('players', 'ZONE', 'findZoneAt', 'ZONE_ID', 'ZONES', 'T512_GHOST_EXTRAP', '_ghostRtt', 'postJSON', 'performance', '__mk',
    block + '\nlet buildings = __mk(typeof _BuildingMap === "function" ? _BuildingMap : null);\n' + fnSrc + '\nreturn { sync: syncGhostsToNeighbors, buildings: () => buildings };');
  const players = new Map();
  for (let i = 0; i < 408; i++) players.set(i, { pid: i, playerId: 'npc' + i, name: 'n', x: 5000 + i, y: 5000, vx: 0, vy: 0, isNpc: true });   // 라이브 판처럼 NPC 몸만(관측자 0)
  const zones = {};   // 이웃 존 주소를 닫힌 포트로(라이브 타이머 팔 판 — 이웃 존이 안 떠 있다)
  for (const [k, z] of Object.entries(ZC.ZONES)) zones[k] = Object.assign({}, z, { host: '127.0.0.1', port: 9 });
  return f(players, ZONE, ZC.findZoneAt, ZID, zones, true, new Map(), post, require('perf_hooks').performance, (BM) => (BM ? new BM() : new Map()));
}
function fill(B, n, seed) {
  const R = rng(seed), zw = ZONE.zoneWidth, zh = ZONE.zoneHeight, cell = (v) => Math.floor(v / 32) * 32;
  if (BAND !== '') {   // 라이브 판 꼴 — 띠 후보 k 개(서쪽 경계 1,024~1,184px 의 벽 한 채) + 나머지는 띠 밖(같은 종류 섞임)
    const k = +BAND;
    for (let i = 0; i < k; i++) B.set('w' + i, { id: 'w' + i, type: 'wall', x: 1024 + 32 * (i % 6), y: 56288 + 32 * Math.floor(i / 6), floor: 0, data: { side: i % 2 ? 'N' : 'E' } });
    for (let i = 0; i < n - k; i++) { const x = 2400 + R() * (zw - 4800), y = 2400 + R() * (zh - 4800), t = TYPES[Math.floor(R() * TYPES.length)];
      B.set('b' + i, { id: 'b' + i, type: t, x: cell(x), y: cell(y), floor: 0, data: { side: R() < 0.5 ? 'N' : 'E' } }); }
    return;
  }
  for (let i = 0; i < n; i++) {
    let x, y;
    if (R() < 0.5) { const side = Math.floor(R() * 4), d = R() * 2400; [x, y] = side === 0 ? [d, R() * zh] : side === 1 ? [zw - d, R() * zh] : side === 2 ? [R() * zw, d] : [R() * zw, zh - d]; }
    else { x = R() * zw; y = R() * zh; }
    const t = TYPES[Math.floor(R() * TYPES.length)];
    B.set('b' + i, { id: 'b' + i, type: t, x: cell(x), y: cell(y), floor: 0, data: { side: R() < 0.5 ? 'N' : 'E' } });
  }
}
const nullPost = () => new Promise(() => {});
function httpPost(host, port, p, body) {   // 라이브 `postJSON` 꼴 — 몸통 문자열 · 요청 · 닫힌 포트(동기 몫만 이 부름에 든다)
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const req = http.request({ host, port, path: p, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (r) => { r.resume(); r.on('end', res); });
    req.on('error', rej); req.write(data); req.end();
  });
}
async function time(fnSrc, block, n, post) {
  const h = make(fnSrc, block, post); fill(h.buildings(), n, 621);
  let band = 0; if (h.buildings().ghostBand) for (const _ of h.buildings().ghostBand()) band++;
  const { performance } = require('perf_hooks');
  for (let i = 0; i < 200; i++) h.sync();   // 데우기
  const xs = [];
  for (let i = 0; i < CALLS; i++) { const s = performance.now(); h.sync(); xs.push(performance.now() - s); if (post !== nullPost && i % 50 === 49) await new Promise((r) => setImmediate(r)); }
  xs.sort((p, q) => p - q);
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  return { n, band, mean: +(mean * 1000).toFixed(1), p50: +(xs[xs.length >> 1] * 1000).toFixed(1), p99: +(xs[Math.floor(xs.length * 0.99)] * 1000).toFixed(1) };
}
(async () => {
  console.log(`\n### syncGhostsToNeighbors 한 부름 — ${ZID} · NPC 몸 408 · ${CALLS}부름 · µs(평균 · p50 · p99)\n`);
  console.log('| 건물 N(띠 후보) | 전 — 훑기만 | 후 — 훑기만 | 전 — 보내기 포함 | 후 — 보내기 포함 |');
  console.log('|---|---|---|---|---|');
  for (const n of NS) {
    const o0 = await time(OLD_FN, REACH, n, nullPost), n0 = await time(FN, BLOCK, n, nullPost);
    const o1 = await time(OLD_FN, REACH, n, httpPost), n1 = await time(FN, BLOCK, n, httpPost);
    const f = (r) => `${r.mean} · ${r.p50} · ${r.p99}`;
    console.log(`| ${n.toLocaleString()}(${n0.band}) | ${f(o0)} | ${f(n0)} | ${f(o1)} | ${f(n1)} |`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
