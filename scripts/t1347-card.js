'use strict';
// (@regress 없음 — 러너 밖 · T1347 표 자 · 읽기만)
// === scripts/t1347-card.js — T1347 판 칸(카드 ⑤) · 판정 표 칸(카드 ④) — t1333-arms · t1344-arms 의 `--json` 요약 + 판 곁 관찰기 ==========
//   쓰는 법: node scripts/t1347-card.js <묶음 이름> <t1333 요약.json> <t1344 요약.json> <팔=머리> [<팔=머리> …] [--json 요약.json] [--head]
//     요약의 팔 이름 = 여기 팔 이름(같은 차례 · 첫 팔 = 끔 — 끔비의 분모) · 머리 = 판 JSON 에서 `.json` 을 뗀 것
//     (곁: `.t1333.json` 장부 · `.t1344.json` 둘째 화물 · `.t1347.json` 받아 올 짐 · 발주 · 광산5 · `.fd-deaths.json` 굶음 — 큰 것은 `.json.gz`)
//   칸:
//     · 광산5 로 간 구리 짐 — 줄 · 양(t1333 ② 장부: 받은 쪽 = 광산5 · 보낸 짐 + 받아 온 짐) · 그 가운데 광산5 캐러밴이 받아 온 줄(귀로)
//     · 청동 무기 누계(t1333-arms — 판 마지막 날 머리 온 마을 합) · 끔비 · 광산5 청동
//     · 식량 교역량 = 보낸 식량 + 받아 온 식량(t1344 관찰기 — econ 식량 단위 · 끔비) · 먹을거리 첫째 화물 줄(t1344-food 셈 — t1333 품목 줄 − 둘째 화물 줄 · 끔비)
//     · 굶음(빚 죽음 누계 `fdDeadTot`) · 인구(끔비)
//     · 받아 올 짐(t1347 'ret' — 바뀐 도착 수 · 많은 품목 셋 · 광산5 가 받아 온 구리) · 갈아 탄 다리(t1347 'leg' — 목적지나 짐이 바뀐 출발 · 같은 다리 다시 고름은 안 센다)
//     · 섞어 실은 줄(t1344 mix · 그 가운데 먹을거리) · 발주 마을-날(t1347 orders — 많은 품목 셋) · (가) 먹인 식량(광산5 `_t1347Fed` — 판정 표 사본만)
//   `--at 날`: 그 날까지(장부 · 식량 · 섞어 실은 줄 · 받아 올 짐 · 굶음(fd-deaths 날 줄) · 인구(t1243 날 줄)) — 끝까지 못 간 판(서버 자 멈춤)과 같은 날로 견준다
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const A = process.argv.slice(2), opt = {}, arms = [];
for (let i = 0; i < A.length; i++) { if (A[i] === '--json') opt.json = A[++i]; else if (A[i] === '--at') opt.at = +A[++i]; else if (A[i] === '--head') opt.head = true; else arms.push(A[i]); }
const AT = opt.at > 0 ? opt.at : null;   // ★--at 날 — 그 날까지만 센다(멈춘 판과 같은 날로 견줄 때 · 요약은 t1333-arms 도 같은 --at 으로 낸 것) · 먹을거리 첫째 화물 줄(품목 줄 누계)은 날로 못 끊어 '—'
const [GROUP, P33, P44, ...AR] = arms;
if (!GROUP || !P33 || !P44 || !AR.length) { console.error('쓰는 법: node scripts/t1347-card.js <묶음> <t1333요약.json> <t1344요약.json> <팔=머리> … [--json 요약] [--head]'); process.exit(2); }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } catch (e2) { return null; } } };
const _l = console.log; console.log = () => {};
const V1 = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
console.log = _l;
const FP = new Map();
const fp = (r) => { if (!FP.has(r)) { let f = 0; try { f = V1.storageFoodPer({ storage: {}, npcs: [], counts: {} }, r); } catch (e) { f = 0; } FP.set(r, f > 0 ? f : 0); } return FP.get(r); };
const S33 = rd(P33) || {}, S44 = rd(P44) || {};
const K5 = '광산5';
const top = (o, n) => Object.entries(o).sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1)).slice(0, n);
const f0 = (x) => (x == null ? '—' : Math.round(+x).toLocaleString('en-US')), f1 = (x) => (x == null ? '—' : (+x).toFixed(1)), f2 = (x) => (x == null ? '—' : (+x).toFixed(2)), f3 = (x) => (x == null || !Number.isFinite(+x) ? '—' : (+x).toFixed(3));
const out = {};
for (const a of AR) {
  const k = a.indexOf('='), name = a.slice(0, k), h = a.slice(k + 1);
  const s = S33[name] || null, t = S44[name] || null;
  const O = rd(h + '.t1333.json'), X = rd(h + '.t1344.json'), T = rd(h + '.t1347.json'), FD = rd(h + '.fd-deaths.json');
  const L = AT || (s ? s.L : null);
  const o = { L, pop: s ? s.pop : null, bronze: s ? s.bronze : null, b5: s ? s.b5 : null, deaths: FD ? FD.fdDeadTot : null };
  if (AT) {
    let dd = null; if (FD && Array.isArray(FD.rows)) for (const r of FD.rows) if (r[0] <= AT) dd = r[1];
    o.deaths = dd;
    const C = rd(h + '.t1243.json'); let pp = null; if (C && Array.isArray(C.rows)) { const pi = C.cols.indexOf('pop'); for (const r of C.rows) if (r[0] <= AT) pp = r[pi]; }
    o.pop = pp;
  }
  // 광산5 로 간 구리 짐(장부 · 날 L 앞 — t1333-arms 와 같은 끝)
  const legs = O && O.legs ? O.legs.filter((x) => L == null || x[0] < L) : [];
  const cu5 = legs.filter((x) => x[3] === 'copper' && x[2] === K5);
  o.cu5n = cu5.length; o.cu5amt = +cu5.reduce((q, x) => q + (+x[4] || 0), 0).toFixed(2); o.cu5back = cu5.filter((x) => x[8] === 1).length; o.cu5backAmt = +cu5.filter((x) => x[8] === 1).reduce((q, x) => q + (+x[4] || 0), 0).toFixed(2);
  const tin5 = legs.filter((x) => x[3] === 'tin' && x[1] === K5);   // 광산5 가 내보낸 주석(보낸 짐 + 남이 받아 간 것)
  o.tinOut5 = tin5.length;
  // 식량 교역량 · 먹을거리 첫째 화물 줄(t1344-food 셈)
  if (X && X.trade) { let fo = 0, fb = 0; for (const [d, v] of Object.entries(X.trade)) { if (AT && +d > AT) continue; fo += v[1]; fb += v[2]; } o.fOut = +fo.toFixed(1); o.fBack = +fb.toFixed(1); o.food = +(fo + fb).toFixed(1); }
  let mixRows = 0, mixFood = 0; const mixKinds = {};
  for (const m of ((X && X.mix) || [])) { if (AT && m[0] > AT) continue; mixRows++; if (fp(m[5]) > 0) mixFood++; mixKinds[m[5]] = (mixKinds[m[5]] || 0) + 1; }
  o.mixRows = mixRows; o.mixFood = mixFood; o.mixTop = top(mixKinds, 3);
  if (O && O.resN && !AT) { let rows = 0, fr = 0; for (const [r, c] of Object.entries(O.resN)) { if (r[0] === '↩') continue; rows += c; if (fp(r) > 0) fr += c; } o.rows = rows - mixRows; o.foodRows = fr - mixFood; }
  // 받아 올 짐 · 다리(t1347)
  if (T) {
    const inAt = (x) => !AT || x[0] <= AT;
    const ret = (T.ret || []).filter((r) => inAt(r) && r[3] !== r[4]), leg = (T.leg || []).filter((l) => inAt(l) && (l[2] !== l[3] || l[4] !== l[5]));
    const it = {}; for (const r of ret) it[r[4]] = (it[r[4]] || 0) + 1;
    o.retN = (T.ret || []).filter(inAt).length; o.retReal = ret.length; o.retTop = top(it, 3);
    o.ret5cu = ret.filter((r) => r[1] === K5 && r[4] === 'copper').length;
    o.ret5 = ret.filter((r) => r[1] === K5).length;
    o.legN = (T.leg || []).filter(inAt).length; o.legReal = leg.length; o.leg5 = leg.filter((l) => l[1] === K5).length;
    const od = {}; for (const [dd, D] of Object.entries(T.orders || {})) { if (AT && +dd > AT) continue; for (const [r, c] of Object.entries(D)) od[r] = (od[r] || 0) + c; }
    o.orderTop = top(od, 3);
    o.fed5 = T.fedTot && T.fedTot[K5] != null ? T.fedTot[K5] : 0;
    const kd = Object.keys(T.k5 || {}).map(Number).filter((d) => !AT || d <= AT).sort((p, q) => p - q), last = kd.length ? T.k5[kd[kd.length - 1]] : null;
    o.k5 = last ? { day: kd[kd.length - 1], pop: last[0], warrior: last[1], smith: last[2], weapon: last[3], copper: last[6], tin: last[7], bronzeW: last[8], secF: last[5] } : null;
    o.knobs = T.knobs; o.err = T.err;
  }
  if (t) { o.t44 = { fOut: t.fOut, fBack: t.fBack, mixN: t.mixN }; }
  out[name] = o;
}
const names = Object.keys(out), b0 = out[names[0]] || {};
const ratio = (x, y) => (x != null && y ? x / y : null);
if (opt.head) {
  console.log('| 판 · 팔 | 광산5 로 간 구리 짐(줄 · 양 · 광산5 가 받아 온 줄) | **청동**(끔비) | 광산5 청동 | 식량 교역량(끔비) | 먹을거리 첫째 화물 줄(끔비) | 굶음 | 인구(끔비) | 받아 올 짐 바뀐 도착(많은 품목) · 광산5 구리 | 갈아 탄 다리 | 섞어 실은 줄(먹을거리) | (가) 먹인 식량 |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|');
}
for (const n of names) {
  const o = out[n];
  o.bronzeR = ratio(o.bronze, b0.bronze); o.foodR = ratio(o.food, b0.food); o.foodRowsR = ratio(o.foodRows, b0.foodRows); o.popR = ratio(o.pop, b0.pop);
  const rt = o.retReal == null ? '—' : `${o.retReal}(${(o.retTop || []).map(([r, c]) => `${r} ${c}`).join(' · ') || '—'}) · ${o.ret5cu}`;
  console.log(`| ${GROUP} · ${n} | ${o.cu5n} · ${f1(o.cu5amt)} · ${o.cu5back} | **${f2(o.bronze)}**(${f3(o.bronzeR)}) | ${f2(o.b5)} | ${f0(o.food)}(${f3(o.foodR)}) | ${f0(o.foodRows)}(${f3(o.foodRowsR)}) | ${f0(o.deaths)} | ${f0(o.pop)}(${f3(o.popR)}) | ${rt} | ${o.legReal == null ? '—' : o.legReal} | ${o.mixRows}(${o.mixFood}) | ${f0(o.fed5)} |`);
}
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(out));
