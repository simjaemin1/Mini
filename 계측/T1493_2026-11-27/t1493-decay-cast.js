#!/usr/bin/env node
// (@regress 없음 — T1493 계측 · 러너 밖) 아무도 안 밟아 닳기만 한 칸의 등급 내림이 하루 방송(`road_cells`)에 드나 — 끔(칸 객체) · 켬(T1448) 둘 다 · 제품 파일 무변
//   칸 둘(v 9 = 등급 1 · v 30 = 등급 2)을 밟고 37날을 넘긴다(가짜 시계 · 마을 모듈 대신 16 ms 조각 — test-road-day 와 같은 틀) ·
//   날마다 `clientRoads`(welcome 이 줄 등급)와 받은 방송을 적는다 → 등급이 닳아 내려가도 방송이 오나
//   쓰는 법: node --experimental-sqlite 계측/T1493_2026-11-27/t1493-decay-cast.js
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), Module = require('module');
const ROOT = path.join(__dirname, '..', '..');
let NOW = 0; Date.now = () => NOW;
const _log = console.log; console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[thr')) return; _log(...a); };
const VP = require.resolve(path.join(ROOT, 'server', 'villages.js'));
require.cache[VP] = { id: VP, filename: VP, loaded: true, exports: { tickSliceMs: () => 16 } };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dcast-'));
const RP = path.join(ROOT, 'server', 'roads.js'), DP = path.join(ROOT, 'server', 'zone-local-db.js');
function load(tag, grid) {
  process.env.DB_PATH = path.join(TMP, tag + '.db'); process.env.ZONE_ID = 'thr'; process.env.T1448_ROAD_GRID = grid ? '1' : '0';
  delete require.cache[DP]; const db = require(DP);
  const m = new Module(RP, module); m.filename = RP; m.paths = Module._nodeModulePaths(path.dirname(RP));
  const orig = Module.prototype.require; m.require = function (id) { return id === './zone-local-db' ? db : orig.call(this, id); };
  m._compile(fs.readFileSync(RP, 'utf8'), RP); return m.exports;
}
const W = 160, H = 128, DAY = 1000;
for (const grid of [false, true]) {
  NOW = 3 * DAY + 10;
  const R = load('g' + (+grid), grid), bc = [];
  R.init({ zoneId: 'thr', cellsW: W, cellsH: H, epoch: 0, dayMs: DAY, broadcast: (m) => bc.push(m) });
  for (let i = 0; i < 9; i++) R.stampCell(10, 10);    // v 9 → 등급 1(문턱 8) — 닳아 22일쯤 뒤 0
  for (let i = 0; i < 30; i++) R.stampCell(20, 20);   // v 30 → 등급 2(문턱 28) — 닳아 14일쯤 뒤 1
  const seen = { a: [], b: [] }, wel = [];
  for (let d = 4; d <= 40; d++) {
    NOW = d * DAY + 5; for (let t = 0; t < 40; t++) R.onGameTick(NOW + t);
    const c = R.clientRoads() || [], g = (x, y) => { for (let i = 0; i < c.length; i += 3) if (c[i] === x && c[i + 1] === y) return c[i + 2]; return 0; };
    wel.push(`${d}:${g(10, 10)}/${g(20, 20)}`);
  }
  for (const m of bc) if (m.type === 'road_cells') for (let i = 0; i < m.cells.length; i += 3) { const k = m.cells[i] + ',' + m.cells[i + 1]; if (k === '10,10') seen.a.push(m.cells[i + 2]); if (k === '20,20') seen.b.push(m.cells[i + 2]); }
  _log(JSON.stringify({ grid, casts: bc.length, cell_10_10: seen.a, cell_20_20: seen.b, welcomeGradeByDay: wel.filter((x, i) => i % 4 === 0 || i === wel.length - 1).join(' ') }));
}
