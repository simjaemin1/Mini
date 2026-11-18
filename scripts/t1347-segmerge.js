'use strict';
// (@regress 없음 — 러너 밖 · T1347 판 자 · 제품 무변 · 읽기만)
// === scripts/t1347-segmerge.js — 이어 도는 판(`t1308-long-run.js`)의 마디 관찰기 조각을 판 하나로 묶는다(t1256 · t1313 · t1333 · t1344 · t1347) ==========
//   쓰는 법: node scripts/t1347-segmerge.js <판 폴더> <태그-시드>   → <판 폴더>/<태그-시드>.<꼴>.json (마디 차례 `seg-<시작 날>.<꼴>.json` 을 잇는다)
//   ★왜: t1308 묶음(`merge()`)은 {cols, rows} · {days} 두 꼴만 잇는다 — 이 관찰기들은 날 열쇠 꾸러미 · 사건 줄 · 누계 칸이 섞여 있어 건너뛴다.
//     마디마다 관찰기는 새 프로세스에서 0 부터 센다(사건 줄 · 누계는 그 마디 몫) — 그래서 잇는 법이 칸마다 다르다:
//   · 날 열쇠 꾸러미(열쇠가 다 숫자 — `day` · `met` · `trade` · `g` · `orders` · `k5` …) = 덧붙인다(마디가 날을 안 겹친다)
//   · 사건 줄 배열(`legs` · `leg` · `ret` · `mix` · `casts` …) = 잇는다 · 이름 열 · 마을 목록(`*cols` · `mines` · `seed` …) = 첫 마디 것
//   · 누계 칸 — 수 `rows` 는 더한다 · 품목 줄 수 `resN` 은 품목마다 더한다 · t1344 `noAg` 는 (주조 줄 번호 · 값) 짝이라 번호에 앞 마디 주조 줄 수를 더한다
//   · 그 밖(손잡이 · 상수 · 마지막 값 꾸러미 `dist` · `flow` · `fedTot`) = 마지막 마디 것 · `err` = 처음 선 것
//   판 JSON · fd-deaths 는 t1308 이 끝 마디 것(판 자 누계를 이어 받은 것)을 이미 묶는다 — 손대지 않는다.
const fs = require('fs'), path = require('path');
const [DIR, BASE] = process.argv.slice(2);
if (!DIR || !BASE) { console.error('쓰는 법: node scripts/t1347-segmerge.js <판 폴더> <태그-시드>'); process.exit(2); }
const KINDS = ['t1256', 't1313', 't1333', 't1344', 't1347'];
const FIRST_ARR = new Set(['dcols', 'vcols', 'mcols', 'acols', 'ccols', 'xcols', 'lcols', 'cols', 'rcols', 'mines', 'seed', 'crops', 'ten', 'lifePids', 'lifeSwap', 'shots', 'jobs']);
const SUM_NUM = new Set(['rows', 'wrapped', 'noWs', 'noU']);
const SUM_DICT = new Set(['resN']);
const LAST_DICT = new Set(['dist', 'flow', 'fedTot', 'consts', 'knobs', 'stat']);
const isDay = (o) => { const ks = Object.keys(o); return ks.length > 0 && ks.every((k) => /^-?\d+$/.test(k)); };
const segs = fs.readdirSync(DIR).map((f) => /^seg-(\d+)\.json$/.exec(f)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b);
const pj = path.join(DIR, 'progress.json');
let order = segs;
try { const P = JSON.parse(fs.readFileSync(pj, 'utf8')); if (Array.isArray(P.segs) && P.segs.length) order = P.segs.map((s) => s.from).sort((a, b) => a - b); } catch (e) { /* 마디 판 JSON 차례 */ }
const out = [];
for (const k of KINDS) {
  let acc = null, n = 0;
  for (const s of order) {
    let o; try { o = JSON.parse(fs.readFileSync(path.join(DIR, `seg-${s}.${k}.json`), 'utf8')); } catch (e) { continue; }
    n++;
    if (!acc) { acc = JSON.parse(JSON.stringify(o)); continue; }
    const castsOff = Array.isArray(acc.casts) ? acc.casts.length : 0;
    for (const [key, v] of Object.entries(o)) {
      if (acc[key] === undefined || acc[key] === null) { acc[key] = JSON.parse(JSON.stringify(v)); continue; }
      if (key === 'err') { acc.err = acc.err || v; continue; }
      if (Array.isArray(v)) {
        if (FIRST_ARR.has(key) || (v.length && v.every((x) => typeof x === 'string'))) continue;
        if (key === 'noAg' && k === 't1344') { const w = v.map((x, i) => (i % 2 === 0 && typeof x === 'number' ? x + castsOff : x)); acc.noAg = acc.noAg.concat(w); continue; }
        acc[key] = acc[key].concat(v);
      } else if (v && typeof v === 'object') {
        if (SUM_DICT.has(key)) { for (const [kk, x] of Object.entries(v)) acc[key][kk] = (acc[key][kk] || 0) + x; }
        else if (LAST_DICT.has(key)) acc[key] = v;
        else if (isDay(v) || isDay(acc[key]) || !Object.keys(v).length) Object.assign(acc[key], v);
        else acc[key] = v;
      } else if (typeof v === 'number' && SUM_NUM.has(key)) acc[key] += v;
      else acc[key] = v;
    }
  }
  if (acc) { acc._segs = n; fs.writeFileSync(path.join(DIR, `${BASE}.${k}.json`), JSON.stringify(acc)); out.push(`${k}(${n})`); }
}
console.log(`[segmerge] ${DIR} · 마디 ${order.join(',')} → ${out.join(' · ') || '없음'}`);
