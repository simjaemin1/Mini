'use strict';
// (@regress 없음 — 러너 밖 · T1384 판 자 · 제품 무변 · 읽기만)
// === scripts/t1384-segmerge.js — 이어 도는 판(`t1308-long-run.js`)의 마디 `seg-<시작 날>.t1384.json` 을 판 하나 `<태그-시드>.t1384.json` 으로 묶는다 ==========
//   쓰는 법: node scripts/t1384-segmerge.js <판 폴더> <태그-시드>
//   잇는 법(칸마다): 날 열쇠 꾸러미(`day` · `own` · `sell`) = 덧붙인다(뒤 마디가 같은 날을 다시 적으면 뒤 것) · 교역 줄(`legs`) = 잇는다 ·
//   이름 열(`*cols` · `names`) · 상수 · 손잡이 = 첫 마디 것 · `err` = 처음 선 것.   (마디 첫 날은 그날 틱 흐름이 없다 — 관찰기가 새로 실린다)
const fs = require('fs'), path = require('path');
const [DIR, BASE] = process.argv.slice(2);
if (!DIR || !BASE) { console.error('쓰는 법: node scripts/t1384-segmerge.js <판 폴더> <태그-시드>'); process.exit(2); }
const segs = fs.readdirSync(DIR).map((f) => /^seg-(\d+)\.t1384\.json$/.exec(f)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b);
let acc = null;
for (const s of segs) {
  let o; try { o = JSON.parse(fs.readFileSync(path.join(DIR, `seg-${s}.t1384.json`), 'utf8')); } catch (e) { continue; }
  if (!acc) { acc = o; acc._segs = [s]; continue; }
  acc._segs.push(s);
  for (const k of ['day', 'own', 'sell']) Object.assign(acc[k] || (acc[k] = {}), o[k] || {});
  acc.legs = (acc.legs || []).concat(o.legs || []);
  acc.err = acc.err || o.err || null;
}
if (!acc) { console.log(`[t1384-segmerge] ${DIR} · 마디 없음`); process.exit(0); }
fs.writeFileSync(path.join(DIR, `${BASE}.t1384.json`), JSON.stringify(acc));
console.log(`[t1384-segmerge] ${DIR} · 마디 ${acc._segs.join(',')} → ${BASE}.t1384.json(날 ${Object.keys(acc.day).length} · 줄 ${acc.legs.length})`);
