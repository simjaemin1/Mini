'use strict';
// (@regress 없음 — 러너 밖 · T1385 판 자 · 제품 무변 · 읽기만)
// === scripts/t1385-segmerge.js — 이어 도는 판(`t1308-long-run.js`)의 마디 `seg-<시작 날>.t1385.json` 을 판 하나 `<태그-시드>.t1385.json` 으로 묶는다 ==========
//   쓰는 법: node scripts/t1385-segmerge.js <판 폴더> <태그-시드>
//   잇는 법(칸마다): 날 줄(`days` · `k5` · `casts`) = 잇는다 · 날 열쇠 꾸러미(`snaps`) = 덧붙인다 · 문마다 곳간 합(`gHold`) · 마을마다 문 셈(`gVill`) = 더한다 ·
//   이름 열(`*cols`) · 상수(`consts`) · 손잡이(`knobs`) = 첫 마디 것 · 곁 장부(`_shadow` · `_lastBz`) = 마지막 마디 것 · `err` = 처음 선 것.
//   (곁 장부는 관찰기가 앞 마디 끝에서 이어 받는다 — `t1385-observe.js` 머리)
const fs = require('fs'), path = require('path');
const [DIR, BASE] = process.argv.slice(2);
if (!DIR || !BASE) { console.error('쓰는 법: node scripts/t1385-segmerge.js <판 폴더> <태그-시드>'); process.exit(2); }
const segs = fs.readdirSync(DIR).map((f) => /^seg-(\d+)\.t1385\.json$/.exec(f)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b);
let acc = null;
for (const s of segs) {
  let o; try { o = JSON.parse(fs.readFileSync(path.join(DIR, `seg-${s}.t1385.json`), 'utf8')); } catch (e) { continue; }
  if (!acc) { acc = o; acc._segs = [s]; continue; }
  acc._segs.push(s);
  for (const k of ['days', 'k5', 'casts']) acc[k] = (acc[k] || []).concat(o[k] || []);
  Object.assign(acc.snaps || (acc.snaps = {}), o.snaps || {});
  for (const [g, h] of Object.entries(o.gHold || {})) { const a = acc.gHold[g] || (acc.gHold[g] = h.map(() => 0)); h.forEach((x, i) => { a[i] += x; }); }
  for (const [n, h] of Object.entries(o.gVill || {})) { const a = acc.gVill[n] || (acc.gVill[n] = h.map(() => 0)); h.forEach((x, i) => { a[i] += x; }); }
  acc._shadow = o._shadow; acc._lastBz = o._lastBz;
  acc.err = acc.err || o.err || null;
}
if (!acc) { console.log(`[t1385-segmerge] ${DIR} · 마디 없음`); process.exit(0); }
fs.writeFileSync(path.join(DIR, `${BASE}.t1385.json`), JSON.stringify(acc));
console.log(`[t1385-segmerge] ${DIR} · 마디 ${acc._segs.join(',')} → ${BASE}.t1385.json(날 ${acc.days.length})`);
