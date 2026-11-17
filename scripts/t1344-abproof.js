'use strict';
// (@regress 없음 — 러너 밖 · T1344 표 자 · 읽기만)
// === scripts/t1344-abproof.js — 병기고 손잡이(`T1344_BRONZE_STOCK`)가 그 판에서 설 자리가 있었나(손잡이 끔 판의 t1344 관찰기 날 줄로) ==========
//   손잡이가 갈래를 바꾸는 자리는 셋 다 "잘 먹는 날(식량 안보 > 0.45)"에만 선다(주조 문 곳간 · 석공 청동 우선권 · 대장장이 자리).
//   ㉮ 잘 먹고 근접검 ≥ 청동 몫 한도(사람 × 0.72 × 0.45) — 주조 문 · 석공 문이 갈릴 수 있는 마을-날(근접검 < 한도면 청동 근접검 ≤ 근접검 < 한도라 두 곳간이 같은 답)
//   ㉯ 대장장이 자리는 잘 먹고 근접검 < 한도면 종전 목표(병기고 0.72 결손 + 마모)가 청동 몫 목표(0.324 결손 + 마모)보다 크다 → 큰 쪽 = 종전(같은 노동 식 · 같은 두 수)
//   ⇒ ㉮ = 0 이면 손잡이 켬 판 = 끔 판(바이트 같음). 틈: 식량 안보 > 0.40 인 날의 근접검 ÷ 한도 최대(1 에서 얼마나 먼가 — 하루 안 흔들림이 못 넘는다)
//   쓰는 법: node scripts/t1344-abproof.js <머리> [<머리> …]   (머리 = 판 JSON 에서 `.json` 을 뗀 것 · 곁 `.t1344.json`(.gz))
const fs = require('fs'), zlib = require('zlib');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } };
console.log('| 판 | 잘 먹는 마을-날(구리 ≥ 0.3 · 주석 ≥ 0.12) | ㉮ 잘 먹고 근접검 ≥ 청동 몫 한도 | 식량 안보 > 0.40 인 날 근접검 ÷ 한도 최대(마을 · 날) |');
console.log('|---|---:|---:|---|');
for (const h of process.argv.slice(2)) {
  const X = rd(h + '.t1344.json'), I = (k) => X.acols.indexOf(k);
  let fedMetal = 0, A = 0, mr = -1, at = '—';
  for (const [d, D] of Object.entries(X.day)) for (const [v, r] of Object.entries(D)) {
    const s = r[I('secF')]; if (s == null) continue;
    const melee = r[I('weapon')] * (r[I('swordFrac')] == null ? 0.5 : r[I('swordFrac')]), cap = r[I('pop')] * 0.72 * 0.45;
    const metal = (r[I('copper')] || 0) >= 0.3 && (r[I('tin')] || 0) >= 0.12;
    if (s > 0.45 && metal) fedMetal++;
    if (s > 0.45 && melee >= cap) A++;
    if (s > 0.40 && cap > 0 && melee / cap > mr) { mr = melee / cap; at = `${v} 날 ${d}`; }
  }
  console.log(`| ${h.split('/').pop()} | ${fedMetal} | ${A} | ${mr < 0 ? '—' : mr.toFixed(3)} (${at}) |`);
}
