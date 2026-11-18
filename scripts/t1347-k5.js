'use strict';
// (@regress 없음 — 러너 밖 · T1347 표 자 · 읽기만)
// === scripts/t1347-k5.js — 광산5 한 줄: 발주가 서는가 · 받아 올 짐이 설 수 있는가(판 곁 관찰기만 읽는다) ==========
//   쓰는 법: node scripts/t1347-k5.js <이름=머리> [<이름=머리> …]   (머리 = 판 JSON 에서 `.json` 을 뗀 것 · 곁 `.t1333.json(.gz)` · `.t1347.json`)
//   칸(날 = t1333 ① 날 머리 · 판 끝까지):
//     · 구리 · 주석 발주 날(t1333 ① 금속 칸 `derivT`(파생수요 — 정본 함수 · 순수) > 곳간 — 엔진 `_t1347Orders` 와 같은 비교)
//     · 대장장이 · 석공이 있는 날 · 주석 ≥ 0.12 인 날(청동 제작 문 — econ `_bronzeNow` 의 주석 문턱) · 구리 ≥ 0.3 인 날(같은 문의 구리 문턱)
//     · 식량 안보(t1347 광산5 줄 `_foodSecF` — 가운데 · 0.45 넘은 날 = 잘 먹는 갈래) · 사람(처음 → 끝)
//     · 광산5 캐러밴이 받아 온 짐을 바꾼 도착(t1347 'ret' · 품목) · 갈아 탄 다리 · (가) 먹인 식량
const fs = require('fs'), zlib = require('zlib');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } catch (e2) { return null; } } };
const K5 = '광산5';
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((p, q) => p - q); return s[(s.length - 1) >> 1]; };
console.log('| 판 | 날 | 구리 · 주석 발주 날 | 대장장이 · 석공 날 | 주석 ≥ 0.12 · 구리 ≥ 0.3 날 | 식량 안보 가운데 · 0.45 넘은 날 | 사람 처음 → 끝 | 받아 온 짐 바꾼 도착(품목) · 갈아 탄 다리 | (가) 먹인 식량 |');
console.log('|---|---:|---:|---:|---:|---:|---:|---|---:|');
for (const a of process.argv.slice(2)) {
  const k = a.indexOf('='), n = a.slice(0, k), h = a.slice(k + 1);
  const O = rd(h + '.t1333.json'), T = rd(h + '.t1347.json');
  if (!O) { console.log(`| ${n} | (t1333 없음) ||||||||`); continue; }
  const days = Object.keys(O.met || {}).map(Number).sort((p, q) => p - q);
  let cuO = 0, snO = 0, sm = 0, ms = 0, snOk = 0, cuOk = 0, p0 = null, p1 = null;
  const VI = (c) => O.vcols.indexOf(c);
  for (const d of days) {
    const m = O.met[d] && O.met[d][K5], v = O.day[d] && O.day[d][K5];
    if (m) {
      const cu = m.copper, sn = m.tin;
      if (cu && cu[2] > (cu[0] || 0)) cuO++;
      if (sn && sn[2] > (sn[0] || 0)) snO++;
      if (sn && (sn[0] || 0) >= 0.12) snOk++;
      if (cu && (cu[0] || 0) >= 0.3) cuOk++;
    }
    if (v) { if (v[VI('smith')] > 0) sm++; if (v[VI('mason')] > 0) ms++; if (p0 == null) p0 = v[VI('pop')]; p1 = v[VI('pop')]; }
  }
  let sec = '—', ret = '—', fed = '—';
  if (T) {
    const kd = Object.keys(T.k5 || {}).map(Number).sort((p, q) => p - q), si = T.vcols.indexOf('secF');
    const sv = kd.map((d) => T.k5[d][si]).filter((x) => x != null);
    sec = `${med(sv) == null ? '—' : med(sv).toFixed(3)} · ${sv.filter((x) => x > 0.45).length}`;
    const rr = (T.ret || []).filter((r) => r[1] === K5 && r[3] !== r[4]), it = {};
    for (const r of rr) it[r[4]] = (it[r[4]] || 0) + 1;
    const ll = (T.leg || []).filter((l) => l[1] === K5 && (l[2] !== l[3] || l[4] !== l[5]));
    ret = `${rr.length}(${Object.entries(it).map(([r, c]) => `${r} ${c}`).join(' · ') || '—'}) · ${ll.length}`;
    fed = T.fedTot && T.fedTot[K5] ? Math.round(T.fedTot[K5]).toLocaleString('en-US') : '0';
  }
  console.log(`| ${n} | ${days.length} | ${cuO} · ${snO} | ${sm} · ${ms} | ${snOk} · ${cuOk} | ${sec} | ${p0} → ${p1} | ${ret} | ${fed} |`);
}
