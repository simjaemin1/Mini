#!/usr/bin/env node
// === scripts/t712-lon-table.js — T712 ② 마을 경도 시각 표(계측 · 읽기만 · 판정 0) ==========
//
// 마을 자리(DB `villages.cx` — 존 안 셀 x)와 존 설정(`zone-config` — 존 원점 · 폭 · 세계 폭 · 하루 길이)만 읽어
// 세 환산이 51마을을 실제 몇 초에 펴는지 적는다(새 수 0 — ⓑ 의 두 경도만 바깥 출처).
//   ⓐ 원통 — 세계 폭 = 360°: 경도 몫 = 절대 x ÷ 세계 폭(존 설정만으로 유도)
//   ⓑ 실제 경도 — 존 폭 = 한반도 실제 경도 범위(LON_W ~ LON_E · 바깥 수 둘)
//   ⓒ 현행 §19 — 존 안 x ÷ 존 폭 × 0.045(손으로 적은 상수 · 존 경계에서 0 으로 돌아간다)
// 실행: node scripts/t712-lon-table.js [DB=/tmp/t686/tpl-t100.db] [--zone hanbando] [--lonw 124.61 --lone 131.87]
'use strict';
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const ZC = require(path.join(__dirname, '..', 'server', 'zone-config.js'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DB = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/t686/tpl-t100.db';
const ZID = arg('--zone', 'hanbando');
const LON_W = +arg('--lonw', '124.61'), LON_E = +arg('--lone', '131.87');   // ⓑ 출처: 대한민국 극점(백령도 124°36′42″ · 독도 131°52′20″)
const Z = ZC.ZONES[ZID], W = ZC.WORLD, T = W.tileSize, DAY_S = W.dayLengthMs / 1000;
const d = new DatabaseSync(DB, { readOnly: true });
const vs = d.prepare('select id, name, cx, cy from villages where zone = ?').all(ZID);
const zc = Math.ceil(Z.zoneWidth / T), wc = W.worldWidth / T, ox = Z.worldOffsetX / T;
const conv = {
  'ⓐ 원통(세계 폭 = 360°)': (cx) => (ox + cx) / wc,
  'ⓑ 실제 경도(존 폭 = 한반도)': (cx) => (cx / zc) * (LON_E - LON_W) / 360,
  'ⓒ 현행 §19(존 안 × 0.045)': (cx) => (cx / zc) * 0.045,
};
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
const out = { zone: ZID, villages: vs.length, zoneCells: zc, worldCells: wc, offsetCells: ox, dayS: DAY_S, cx: [Math.min(...vs.map((v) => v.cx)), Math.max(...vs.map((v) => v.cx))], rows: [] };
for (const [name, f] of Object.entries(conv)) {
  const fr = vs.map((v) => f(v.cx)).sort((a, b) => a - b);
  const gaps = []; for (let i = 1; i < fr.length; i++) gaps.push((fr[i] - fr[i - 1]) * DAY_S); gaps.sort((a, b) => a - b);
  out.rows.push({ name, spreadS: +((fr[fr.length - 1] - fr[0]) * DAY_S).toFixed(1), zoneS: +((f(zc) - f(0)) * DAY_S).toFixed(1),
    gapMedS: +q(gaps, 0.5).toFixed(2), gapP90S: +q(gaps, 0.9).toFixed(2), gapMaxS: +gaps[gaps.length - 1].toFixed(2),
    sameSecond: gaps.filter((g) => g < 1).length, gameMin: +((fr[fr.length - 1] - fr[0]) * 1440).toFixed(0),
    deg: +((fr[fr.length - 1] - fr[0]) * 360).toFixed(2) });
}
//   존 경계 이음(ⓒ 만 끊긴다): 이웃 존 서쪽 끝과 이 존 동쪽 끝의 몫 차
const east = Object.values(ZC.ZONES).find((z) => z.worldOffsetX === Z.worldOffsetX + Z.zoneWidth && z.worldOffsetY <= Z.worldOffsetY && z.worldOffsetY + z.zoneHeight > Z.worldOffsetY);
if (east) out.eastSeam = { zone: Object.keys(ZC.ZONES).find((k) => ZC.ZONES[k] === east),
  'ⓐ': 0, 'ⓒ_gameMin': -0.045 * 1440 };
console.log(JSON.stringify(out, null, 1));
