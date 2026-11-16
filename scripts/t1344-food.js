'use strict';
// (@regress 없음 — 러너 밖 · T1344 표 자 · 읽기만)
// === scripts/t1344-food.js — 식량 교역(t1344 관찰기 econ 식량 단위)을 가른다: 첫째 화물 줄(닿음) · 그 가운데 먹을거리 · 보낸 식량(첫째 · 둘째 화물) · 받아 온 식량 ==========
//   쓰는 법: node scripts/t1344-food.js <이름=머리> [<이름=머리> …]   (머리 = 판 JSON 에서 `.json` 을 뗀 것 · 곁 `.t1344.json` · `.t1333.json`(.gz))
//   줄 수는 관찰기 장부(t1333 `resN` — 보낸 쪽 품목 줄 = 첫째 + 둘째 화물 · 버린 줄 빼고)에서 둘째 화물 줄(t1344 `mix`)을 뺀 것 —
//     로그(`캐러밴#N 출발`)는 판 끝 몇 날이 잘린 판이 있어(서버 자 SABM-1020 · SM-1020 · SAB-7 · SAB-42) 안 쓴다.
//   식량 몫 = econ `storageFoodPer`(관찰기와 같은 함수) · 둘째 화물 식량 = 관찰기 `mix` 줄(닿은 양) × 식량 몫
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const V1 = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } catch (e2) { return null; } } };
const fp = (r) => { try { const f = V1.storageFoodPer({ storage: {}, npcs: [], counts: {} }, r); return f > 0 ? f : 0; } catch (e) { return 0; } };
console.log('| 판 | 첫째 화물 줄(닿음) · 그 가운데 먹을거리 | 보낸 식량 — 첫째 · 둘째 | 받아 온 식량 | 합 |');
console.log('|---|---:|---:|---:|---:|');
for (const a of process.argv.slice(2)) {
  const k = a.indexOf('='), n = a.slice(0, k), h = a.slice(k + 1);
  const X = rd(h + '.t1344.json'), O = rd(h + '.t1333.json');
  if (!X) { console.log(`| ${n} | (관찰기 없음) |||| `); continue; }
  let out = 0, back = 0; for (const t of Object.values(X.trade)) { out += t[1]; back += t[2]; }
  let mixF = 0, mixRows = 0, mixFoodRows = 0; for (const m of (X.mix || [])) { mixRows++; const f = fp(m[5]); mixF += m[6] * f; if (f > 0) mixFoodRows++; }
  let rows = null, foodRows = null;
  if (O && O.resN) { rows = 0; foodRows = 0; for (const [r, c] of Object.entries(O.resN)) { if (r[0] === '↩') continue; rows += c; if (fp(r) > 0) foodRows += c; } rows -= mixRows; foodRows -= mixFoodRows; }
  console.log(`| ${n} | ${rows == null ? '—' : rows} · ${foodRows == null ? '—' : foodRows} | ${(out - mixF).toFixed(0)} · ${mixF.toFixed(0)} | ${back.toFixed(0)} | ${(out + back).toFixed(0)} |`);
}
