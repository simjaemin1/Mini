'use strict';
// (@regress 없음 — 러너 밖 · T1479 표 만들기 · 제품 무변 · 읽기만)
// === scripts/t1479-table.js — T1479 날것(관찰기 JSON · 지문) → 표.md · 요약.json · 날치 CSV · 그림 SVG [S13 · 2026-11-24] ======
//   쓰는 법: node scripts/t1479-table.js            (날것 = /dev/shm/t1479/keep/<태그>.t1479.json.gz · 지문 = 계측/T1479_2026-11-24/runs/<태그>.fp.json.gz)
//   ■ 쌓이기 시작한 날 S = T1475 의 멎는 날(광산5 가 주석 캐기를 멈춘 날 · 계측/T1475_2026-11-24/요약.json 의 S — 새 7 = 1349 · 새 42 = 1388 · 옛 7 = 237 · 옛 42 = 154).
//        그 날부터 캔 주석이 곳간에 안 쓰인 채 쌓인다. 이 카드 관찰기는 캔 양을 안 적으므로 S 는 T1475 날것에서 가져온다. S 가 1000~1450 창 밖이면 "창 밖"(표 없음).
//        곁들임: 창 안 마지막으로 주석 든 주조를 한 날(lastTinCast)도 적는다.
//   ■ 붓지 않은 날 = castN == 0. 까닭은 먼저 맞는 것 하나(순서): 대장장이 0 → 구리 0(meltOk=0) → 병기고 목표 참(full=1) → 일손이 제련으로(smelted>0) → 계측 없음.
//        값 문 · 숯 문은 주조 갈래에 없다(관찰기 머리말) — 몫 0 으로 적고 숯 0 이 같이 있던 날 수는 따로 센다. 곳간 숯이 null(재고 없음)이면 0 으로 센다.
//   ■ 그날 0 이 된 것: S-30~S-1 평균이 0 보다 큰데 S 날 값이 0 인 칸(대장장이 · 숯 · 구리 · 주석 · 광부) + S-1 → S 에 문 칸(구리문 · 목표참)이 막힘으로 바뀐 것. 없으면 "없음".
//   ■ 농촌18 끊은 마을 = 농촌18 곳간 식량(환산)이 0.5 이하가 된 첫 날 E 보다 앞서 마지막 먹을 것을 보낸 마을 가운데 1~372 날 가장 많이 보낸 마을(그 길이 곳간이 마르기 전에 끊겼다). 곳간이 안 마르면 없음.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, '계측', 'T1479_2026-11-24');
const KEEP = '/dev/shm/t1479/keep';
const rdz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f))); } catch (e) { return null; } };
const f0 = (x) => (x == null || !isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US'));
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(1));
const f2 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(2));
const f3 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(3));
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '—');
const MK = { old: '옛', new: '새' };
const fpOf = (tag) => rdz(path.join(DIR, 'runs', `${tag}.fp.json.gz`));
function vCmp(Ax, Bx) {   // t1456 · t1475 과 같다 — 마을 몫 `v` 만 견준다
  const m = new Map((Bx.fp || []).map((r) => [r.d, r])); let n = 0, same = 0, first = null;
  for (const r of Ax.fp || []) { const q = m.get(r.d); if (!q) continue; n++; if (r.v.join() === q.v.join()) same++; else if (first == null) first = r.d; }
  return { n, same, first };
}
const REASONS = ['대장장이 0', '숯 0', '구리 0', '목표 참', '값 문', '일손이 제련으로', '계측 없음'];
function reasonOf(o) {   // o = 칸 이름 → 값
  if (!(o.smith > 0)) return '대장장이 0';
  if (!(o.meltOk > 0)) return '구리 0';
  if (o.full > 0) return '목표 참';
  if (o.smelted > 0) return '일손이 제련으로';
  return '계측 없음';
}
function rowsOf(r, vil, d0, d1) {   // 날치 객체 줄 모음
  const C = {}; r.cols.forEach((c, i) => { C[c] = i; }); const out = [];
  for (let d = d0; d <= d1; d++) {
    const x = r.day[d] && r.day[d][vil]; if (!x) continue; const o = { d };
    for (const c of r.cols) o[c] = x[C[c]];
    o.charcoal0 = !(o.charcoal > 0);
    o.cast = o.castN > 0 ? (o.castBz > 0 ? '동검' : (o.castPureCu > 0 ? '구리' : (o.castOth > 0 ? '기타' : '부음'))) : (o.stoneMade > 0 ? '석검' : '');
    o.reason = o.castN > 0 ? '' : reasonOf(o);
    out.push(o);
  }
  return out;
}
const SUM = { nochange: {}, runs: {}, pile: {}, g1020: {}, feed: {}, notes: {} };
const out = [];
const T = (head, rows) => { out.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'); for (const r of rows) out.push('| ' + r.join(' | ') + ' |'); out.push(''); };
function csv(name, rows, cols) { fs.writeFileSync(path.join(DIR, name), [cols.join(',')].concat(rows.map((r) => cols.map((c) => (r[c] == null ? '' : r[c])).join(','))).join('\n') + '\n'); }
const CSVC = ['d', 'N', 'smith', 'miner', 'hunter', 'charcoal', 'copper', 'tin', 'oreTin', 'oreCu', 'castN', 'castBz', 'castTin', 'stoneMade', 'smelted', 'melee', 'cap', 'full', 'meltOk', 'cast', 'reason'];

out.push('# T1479 표 — 붓는 쪽 · 1020 광산5 · 농촌18', '', '모든 수는 `scripts/t1479-table.js` 가 날것에서 셈한 것. 행의 날 d = 그날 하루가 끝난 곳간 · 그날 부은 것.', '');

// ---------- ① 1000~1450 판 ----------
const TAGS = ['new-obs-7', 'new-obs-42', 'old-obs-7', 'old-obs-42'];
const T1475 = rdz(path.join(ROOT, '계측', 'T1475_2026-11-24', '요약.json')) || (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, '계측', 'T1475_2026-11-24', '요약.json'), 'utf8')); } catch (e) { return {}; } })();
function pileStart(rows, tag) {
  const S = T1475[tag] && T1475[tag].S; if (!(S >= 1000 && S <= 1450)) return null; return S;
}
function lastTinCast(rows) { let l = null; for (const x of rows) if (x.castTin > 0) l = x.d; return l; }
const mean = (xs, c) => (xs.length ? xs.reduce((p, q) => p + (q[c] == null ? 0 : q[c]), 0) / xs.length : null);
const POOL = { new: {}, old: {} };
for (const t of TAGS) {
  const r = rdz(path.join(KEEP, `${t}.t1479.json.gz`)); if (!r || !r.day) { SUM.runs[t] = { missing: true }; continue; }
  const [mp, , sd] = t.split('-'); const S = {};
  for (const vil of r.vils) {
    const rows = rowsOf(r, vil, 1000, 1450); csv(`일치_${t}_${vil}.csv`, rows, CSVC);
    const ps = pileStart(rows, t), res = { lastTinCast: lastTinCast(rows), T1475S: (T1475[t] && T1475[t].S) || null, days: rows.length, S: ps, castDays: rows.filter((x) => x.castN > 0).length };
    const cnt = (xs) => { const c = {}; REASONS.forEach((k) => { c[k] = 0; }); xs.forEach((x) => { c[x.reason] = (c[x.reason] || 0) + 1; }); return c; };
    const nc = rows.filter((x) => x.castN === 0); res.allNoCast = nc.length; res.allReasons = cnt(nc);
    if (ps != null) {
      const win = rows.filter((x) => x.d >= ps), wn = win.filter((x) => x.castN === 0);
      res.pileDays = win.length; res.pileNoCast = wn.length; res.pileReasons = cnt(wn);
      res.pileCharcoal0 = wn.filter((x) => x.charcoal0).length;
      res.pileCastN = win.filter((x) => x.castN > 0).length;
      const a = rows.find((x) => x.d === ps - 1), b = rows.find((x) => x.d === ps);
      res.before = a; res.at = b; res.around = rows.filter((x) => x.d >= ps - 3 && x.d <= ps + 3);
      const z = [], pre = rows.filter((x) => x.d >= ps - 30 && x.d < ps), post = rows.filter((x) => x.d >= ps && x.d < ps + 30);
      res.pre = { days: pre.length, castDays: pre.filter((x) => x.castN > 0).length, smith: mean(pre, 'smith'), copper: mean(pre, 'copper'), tin: mean(pre, 'tin'), charcoal: mean(pre, 'charcoal'), melee: mean(pre, 'melee'), cap: mean(pre, 'cap'), full: mean(pre, 'full'), miner: mean(pre, 'miner') };
      res.post = { days: post.length, castDays: post.filter((x) => x.castN > 0).length, smith: mean(post, 'smith'), copper: mean(post, 'copper'), tin: mean(post, 'tin'), charcoal: mean(post, 'charcoal'), melee: mean(post, 'melee'), cap: mean(post, 'cap'), full: mean(post, 'full'), miner: mean(post, 'miner') };
      if (a && b) {
        for (const [c, nm] of [['smith', '대장장이'], ['charcoal', '숯'], ['copper', '구리'], ['tin', '주석'], ['miner', '광부']]) if (res.pre[c] > 0 && !(b[c] > 0)) z.push(`${nm} ${f2(res.pre[c])}→${f2(b[c])}`);
        if (a.meltOk > 0 && !(b.meltOk > 0)) z.push('구리문 닫힘');
        if (!(a.full > 0) && b.full > 0) z.push('목표 참으로 바뀜');
      }
      res.zero = z;
      if (r.vils.indexOf(vil) >= 0 && mp === 'new' && vil === '광산5') { for (const k of REASONS) POOL.new[k] = (POOL.new[k] || 0) + (res.pileReasons[k] || 0); POOL.new._n = (POOL.new._n || 0) + wn.length; POOL.new._c0 = (POOL.new._c0 || 0) + res.pileCharcoal0; }
    }
    S[vil] = res;
  }
  SUM.runs[t] = { map: mp, seed: +sd, vils: S };
  out.push(`## 판 ${MK[mp]} · 시드 ${sd} — 1000~1450`, '');
  for (const vil of r.vils) {
    const q = S[vil];
    out.push(`### ${vil}: 쌓이기 시작한 날(T1475 S) ${q.S == null ? '창 밖(' + (q.T1475S || '없음') + ')' : q.S} · 창 안 마지막 주석 부은 날 ${q.lastTinCast == null ? '없음' : q.lastTinCast} · 부은 날 ${q.castDays}/${q.days} · 안 부은 날 ${q.allNoCast}`, '');
    T(['까닭'].concat(REASONS), [['1000~1450 안 부은 날 ' + q.allNoCast].concat(REASONS.map((k) => String(q.allReasons[k] || 0)))].concat(q.pileReasons ? [[`쌓임 창 ${q.S}~1450 안 부은 날 ${q.pileNoCast}`].concat(REASONS.map((k) => String(q.pileReasons[k] || 0)))] : []));
    if (q.S != null) {
      out.push(`쌓이기 시작한 날 그날 0 이 된 것: ${q.zero.length ? q.zero.join(' · ') : '없음 — 대장장이 · 숯 · 구리 · 주석 · 광부 어느 것도 0 이 되지 않았다'} · 같은 창 숯 0 이던 날 ${q.pileCharcoal0}/${q.pileNoCast}`, '');
      T(['창', '날', '부은 날', '대장장이 평균', '광부 평균', '숯 평균', '구리 평균', '주석 평균', '근접검 평균', '목표 평균', '목표참 날 몫'], [['S-30~S-1', q.pre.days, q.pre.castDays, f2(q.pre.smith), f2(q.pre.miner), f1(q.pre.charcoal), f2(q.pre.copper), f2(q.pre.tin), f1(q.pre.melee), f2(q.pre.cap), f2(q.pre.full)], ['S~S+29', q.post.days, q.post.castDays, f2(q.post.smith), f2(q.post.miner), f1(q.post.charcoal), f2(q.post.copper), f2(q.post.tin), f1(q.post.melee), f2(q.post.cap), f2(q.post.full)]]);
      T(['날', '대장장이', '광부', '숯', '구리', '주석', '주석 원석', '근접검', '목표', '구리문', '목표참', '부은 것', '까닭'],
        q.around.map((x) => [x.d, x.smith, x.miner, x.charcoal == null ? 'null' : f3(x.charcoal), f3(x.copper), f3(x.tin), f3(x.oreTin), f2(x.melee), f2(x.cap), x.meltOk, x.full, x.cast || '—', x.reason || '—']));
    }
  }
}
if (POOL.new._n) {
  const n = POOL.new._n, o = {}; REASONS.forEach((k) => { o[k] = +(100 * (POOL.new[k] || 0) / n).toFixed(1); });
  SUM.pile = { n, counts: REASONS.reduce((a, k) => { a[k] = POOL.new[k] || 0; return a; }, {}), pct: o, charcoal0: POOL.new._c0 };
  out.push('## 붓지 않은 까닭 몫 — 새 지도 · 광산5 · 시드 7 + 42 · 쌓임 창 합', '');
  T(['까닭', '날', '%'], REASONS.map((k) => [k, f0(POOL.new[k] || 0), pct(POOL.new[k] || 0, n)]).concat([['합', f0(n), '100.0']]));
  out.push(`숯 0 이 같이 있던 날 ${POOL.new._c0}/${n} (숯은 주조 문이 아니라 몫 0).`, '');
}

// ---------- ② 1020 광산5 1~260 ----------
function cell1020() {
  const nw = rdz(path.join(KEEP, 'new-obs-1020.t1479.json.gz')), od = rdz(path.join(KEEP, 'old-obs-1020.t1479.json.gz')); if (!nw || !od) return;
  out.push('## 1020 — 광산5 가 처음부터 주석을 못 캐는 까닭 (1~260)', '');
  const G = {}; G.rows = {};
  for (const [mp, r] of [['new', nw], ['old', od]]) {
    const rows = rowsOf(r, '광산5', 1, 260); G.rows[mp] = rows; csv(`일치_${mp}-obs-1020_광산5.csv`, rows, CSVC);
    let rise = 0, minerDays = 0, firstMiner = null, hunterAll = 0; for (let i = 0; i < rows.length; i++) { if (rows[i].miner > 0) { minerDays++; if (firstMiner == null) firstMiner = rows[i].d; } if (i && rows[i].oreTin > rows[i - 1].oreTin + 1e-9) rise++; hunterAll += rows[i].hunter; }
    const stopped = rows.filter((x) => x.miner > 0); const lastMiner = stopped.length ? stopped[stopped.length - 1].d : null;
    const nc = rows.filter((x) => x.castN === 0), c = {}; REASONS.forEach((k) => { c[k] = 0; }); nc.forEach((x) => { c[x.reason]++; });
    G[mp] = { minerDays, firstMiner, lastMiner, oreTinRiseDays: rise, castDays: rows.filter((x) => x.castN > 0).length, noCast: nc.length, reasons: c, day1: rows[0], oreTin1: rows[0].oreTin, oreTinLast: rows[rows.length - 1].oreTin, hunterMean: +(hunterAll / rows.length).toFixed(1) };
    out.push(`### ${MK[mp]} 지도`, `광부가 있던 날 ${minerDays}/${rows.length} · 첫 광부 날 ${firstMiner == null ? '없음' : firstMiner} · 마지막 광부 날 ${lastMiner == null ? '없음' : lastMiner} · 주석 원석이 늘어난 날 ${rise} · 부은 날 ${G[mp].castDays} · 첫날 원석 ${f2(rows[0].oreTin)} → 260 날 ${f2(rows[rows.length - 1].oreTin)} · 사냥꾼 평균 ${G[mp].hunterMean}`, '');
    T(['까닭'].concat(REASONS), [['안 부은 날 ' + nc.length].concat(REASONS.map((k) => String(c[k])))]);
    const pick = rows.filter((x) => [1, 2, 3, 5, 8, 12, 20, 30, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 234, 240, 260].includes(x.d));
    T(['날', '인구', '대장장이', '광부', '사냥꾼', '숯', '구리', '주석', '주석 원석', '구리 원석', '제련 kg', '부은 것', '까닭'],
      pick.map((x) => [x.d, x.N, x.smith, x.miner, x.hunter, x.charcoal == null ? 'null' : f3(x.charcoal), f3(x.copper), f3(x.tin), f2(x.oreTin), f2(x.oreCu), f2(x.smelted), x.cast || '—', x.reason || '—']));
  }
  SUM.g1020 = G; delete SUM.g1020.rows;
}
cell1020();

// ---------- ③ 1020 농촌18 ----------
function cellFeed() {
  const nw = rdz(path.join(KEEP, 'new-obs-1020.t1479.json.gz')), od = rdz(path.join(KEEP, 'old-obs-1020.t1479.json.gz')); if (!nw) return;
  out.push('## 1020 — 농촌18 에 먹을 것을 보낸 마을 (1~372)', '');
  const D1 = 372;
  for (const [mp, r] of [['new', nw], ['old', od]]) {
    if (!r) continue; const L = {}; r.lcols.forEach((c, i) => { L[c] = i; });
    const S = {};
    for (const dk of Object.keys(r.feedIn)) { const d = +dk; if (d > D1) continue; for (const s of Object.keys(r.feedIn[dk])) { const x = S[s] || (S[s] = { food: 0, legs: 0, first: d, last: d, days: 0 }); x.food += r.feedIn[dk][s][0]; x.legs += r.feedIn[dk][s][1]; x.last = Math.max(x.last, d); x.first = Math.min(x.first, d); x.days++; } }
    for (const s of Object.keys(S)) { let lg = 0, ab = 0, last = 0; for (const dk of Object.keys(r.legs)) { const d = +dk; if (d > D1) continue; const q = r.legs[dk][s]; if (q) { lg += q[0] + q[1]; ab += q[2]; if (q[0] + q[1] > 0) last = Math.max(last, d); } } S[s].allLegs = lg; S[s].abandoned = ab; S[s].lastLeg = last; }
    const lt = (d, s) => { const x = r.light[d] && r.light[d][s]; if (!x) return null; const o = {}; r.lcols.forEach((c, i) => { o[c] = x[i]; }); return o; };
    const list = Object.keys(S).map((s) => Object.assign({ s }, S[s])).sort((a, b) => b.food - a.food);
    const tot = list.reduce((p, x) => p + x.food, 0);
    for (const x of list) {
      const a = lt(x.last, x.s), b = lt(x.last + 1, x.s), ch = [];
      if (a && b) for (const c of r.lcols) { if (c === 'foodStock' || c === 'foodDays' || c === 'copper' || c === 'tin' || c === 'weapon' || c === 'secF') { if (Math.abs((a[c] || 0) - (b[c] || 0)) > (c === 'foodStock' ? 5 : 0.05)) ch.push(`${c} ${f2(a[c])}→${f2(b[c])}`); } else if (a[c] !== b[c]) ch.push(`${c} ${a[c]}→${b[c]}`); }
      x.change = ch; x.stopDay = x.last + 1; x.before = a; x.after = b;
    }
    let E = null; for (let d = 1; d <= D1; d++) { const q = lt(d, '농촌18'); if (q && q.foodStock != null && q.foodStock <= 0.5 && d > 5) { E = d; break; } }
    const cut = E == null ? null : (list.filter((x) => x.last < E).sort((a, b) => b.food - a.food)[0] || null);
    SUM.feed[mp] = { total: +tot.toFixed(2), senders: list.map((x) => ({ s: x.s, food: +x.food.toFixed(2), legs: x.legs, first: x.first, last: x.last, stopDay: x.stopDay, allLegs: x.allLegs, lastLeg: x.lastLeg, abandoned: x.abandoned, change: x.change })), cut: cut ? cut.s : null, cutDay: cut ? cut.stopDay : null, emptyDay: E };
    out.push(`### ${MK[mp]} 지도 — 1~${D1} 날 받은 먹을 것 합 ${f0(tot)} (곳간 환산) · 보낸 마을 ${list.length}`, '');
    T(['마을', '보낸 양', '%', '줄', '첫 닿은 날', '마지막 닿은 날', '끊긴 날', '닿은 날 수', '장부 줄(품목 무관) 합', '마지막 장부 줄 날', '그날 그 마을에서 바뀐 것(마지막 닿은 날 → 이튿날 끝)'],
      list.map((x) => [x.s, f0(x.food), pct(x.food, tot), x.legs, x.first, x.last, x.stopDay, x.days, x.allLegs, x.lastLeg, x.change.length ? x.change.join(' · ') : '바뀐 칸 없음']));
    const self = []; for (let d = 1; d <= D1; d += 1) { const a = lt(d, '농촌18'); if (a) self.push({ d, foodDays: a.foodDays, foodStock: a.foodStock, N: a.N, fdDead: a.fdDead, farmer: a.farmer, fisher: a.fisher, hunter: a.hunter }); }
    const empty = self.find((x) => x.foodStock != null && x.foodStock <= 0.5) || null;
    SUM.feed[mp].self = { emptyDay: empty ? empty.d : null, rows: self.filter((x) => x.d % 12 === 0 || x.d === D1).map((x) => x) };
    out.push(`농촌18 곳간 식량이 0.5 이하가 된 첫 날: ${empty ? empty.d : '없음'} (${MK[mp]} 지도).`, '');
    T(['날', '인구', '곳간 식량 환산', '날치', '농사', '고기잡이', '사냥', '굶어 죽음 누계'], self.filter((x) => x.d % 24 === 0 || x.d === D1 || (empty && x.d === empty.d)).map((x) => [x.d, x.N, f1(x.foodStock), f2(x.foodDays), x.farmer, x.fisher, x.hunter, x.fdDead]));
    // 날치 줄(농촌18 으로 가는 먹을 것) CSV
    const rows = []; for (const dk of Object.keys(r.feedIn).map(Number).sort((a, b) => a - b)) for (const s of Object.keys(r.feedIn[dk])) rows.push({ d: dk, s, food: +r.feedIn[dk][s][0].toFixed(3), legs: r.feedIn[dk][s][1] });
    csv(`농촌18_먹을것_${mp}.csv`, rows, ['d', 's', 'food', 'legs']);
  }
}
cellFeed();

// ---------- ④ 관찰기 무변 ----------
out.push('## 관찰기 무변', '');
{
  const rows = [];
  for (const [a, b, lab] of [['new-obs-1020', 'new-ctl-1020', '새 · 1020 · 1~400'], ['new-obs-7', 'new-ctl-7', '새 · 시드 7 · 1351~1450']]) {
    const A = fpOf(a), B = fpOf(b); if (!A || !B) { rows.push([lab, '판 없음', '—']); continue; }
    const q = vCmp(A, B); SUM.nochange[a] = q; rows.push([lab, `${q.same}/${q.n}`, q.first == null ? '모두 같음' : '처음 다른 날 ' + q.first]);
  }
  T(['견줌', '마을 지문 같은 날 / 견준 날', '처음 다른 날'], rows);
  out.push('저장본에서 이어 돈 판: 이 카드에선 저장본을 안 만들었다 — T1456 보고의 되살림 100/100 × 세 시드를 인용.', '');
}
fs.writeFileSync(path.join(DIR, '표.md'), out.join('\n'));
fs.writeFileSync(path.join(DIR, '요약.json'), JSON.stringify(SUM, null, 1));

// ---------- 그림(SVG · 새 의존 0) ----------
const PAL = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#555555'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function panel(o) {
  const { x, y, w, h } = o, ml = 46, mb = 22, mt = 20, pw = w - ml - 8, ph = h - mt - mb; let xs = [], ys = [];
  for (const s of o.series) for (const p of s.pts) { if (p[1] != null && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); } }
  if (!xs.length) return `<text x="${x}" y="${y + 14}" font-size="12">${esc(o.title)} — 자료 없음</text>`;
  const x0 = o.x0 != null ? o.x0 : Math.min(...xs), x1 = o.x1 != null ? o.x1 : Math.max(...xs); let y0 = o.y0 != null ? o.y0 : Math.min(0, ...ys), y1 = o.y1 != null ? o.y1 : Math.max(...ys) * 1.08 || 1;
  if (y1 === y0) y1 = y0 + 1;
  const X = (v) => x + ml + (v - x0) / (x1 - x0 || 1) * pw, Y = (v) => y + mt + ph - (v - y0) / (y1 - y0) * ph;
  let g = `<text x="${x}" y="${y + 12}" font-size="12" font-weight="600">${esc(o.title)}</text><rect x="${x + ml}" y="${y + mt}" width="${pw}" height="${ph}" fill="none" stroke="#bbb"/>`;
  for (let k = 0; k <= 3; k++) { const v = y0 + (y1 - y0) * k / 3; g += `<line x1="${x + ml}" x2="${x + ml + pw}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eee"/><text x="${x + ml - 4}" y="${Y(v) + 3}" font-size="10" text-anchor="end">${+v.toPrecision(3)}</text>`; }
  for (let k = 0; k <= 4; k++) { const v = Math.round(x0 + (x1 - x0) * k / 4); g += `<text x="${X(v)}" y="${y + h - 8}" font-size="10" text-anchor="middle">${v}</text>`; }
  if (o.vline != null) g += `<line x1="${X(o.vline)}" x2="${X(o.vline)}" y1="${y + mt}" y2="${y + mt + ph}" stroke="#999" stroke-dasharray="4 3"/>`;
  o.series.forEach((s, i) => {
    const c = s.color || PAL[i % PAL.length]; let d = '', prev = null;
    for (const p of s.pts) { if (p[1] == null || !isFinite(p[1])) { prev = null; continue; } d += prev == null ? `M${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}` : (s.step ? `H${X(p[0]).toFixed(1)}V${Y(p[1]).toFixed(1)}` : `L${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`); prev = p; }
    g += `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.6"${s.dash ? ' stroke-dasharray="5 3"' : ''}/><text x="${x + ml + 6 + i * 118}" y="${y + mt + 11}" font-size="10" fill="${c}">${esc(s.name)}</text>`;
  });
  return g;
}
function svg(file, W_, H_, title, body) { fs.writeFileSync(path.join(DIR, file), `<svg xmlns="http://www.w3.org/2000/svg" width="${W_}" height="${H_}" viewBox="0 0 ${W_} ${H_}" font-family="sans-serif"><rect width="100%" height="100%" fill="#fff"/><text x="12" y="18" font-size="14" font-weight="700">${esc(title)}</text>${body}</svg>`); }
function fig1() {   // 쌓이기 시작한 날 앞뒤 광산5
  let body = '', n = 0;
  for (const t of ['new-obs-7', 'new-obs-42']) {
    const q = SUM.runs[t] && SUM.runs[t].vils && SUM.runs[t].vils['광산5']; const r = rdz(path.join(KEEP, `${t}.t1479.json.gz`)); if (!q || q.S == null || !r) continue;
    const rows = rowsOf(r, '광산5', 1000, 1450), S = q.S, X0 = 12 + n * 560; n++;
    const R = (c) => rows.map((x) => [x.d - S, x[c]]);
    body += panel({ x: X0, y: 30, w: 540, h: 150, title: `새 · 시드 ${t.split('-')[2]} — 광산5 대장장이 · 부은 횟수 (S=${S})`, series: [{ name: '대장장이', pts: R('smith'), step: true }, { name: '부은 횟수', pts: R('castN'), step: true, color: PAL[1] }], x0: -60, x1: 40, y0: 0, vline: 0 });
    body += panel({ x: X0, y: 190, w: 540, h: 150, title: '곳간: 구리 · 주석 · 주석 원석', series: [{ name: '구리', pts: R('copper') }, { name: '주석', pts: R('tin'), color: PAL[1] }, { name: '주석 원석', pts: R('oreTin'), color: PAL[2] }], x0: -60, x1: 40, y0: 0, vline: 0 });
    body += panel({ x: X0, y: 350, w: 540, h: 150, title: '병기고: 근접검 ↔ 목표', series: [{ name: '근접검', pts: R('melee') }, { name: '목표', pts: R('cap'), color: PAL[4], dash: true }], x0: -60, x1: 40, y0: 0, vline: 0 });
  }
  if (n) svg('그림1_쌓이기_앞뒤_광산5.svg', 1132, 515, 'T1479 그림 1 — 쌓이기 시작한 날 앞뒤 광산5 (x = S 기준 날수)', body);
}
function fig2() {   // 1020 광산5
  const nw = rdz(path.join(KEEP, 'new-obs-1020.t1479.json.gz')), od = rdz(path.join(KEEP, 'old-obs-1020.t1479.json.gz')); if (!nw || !od) return;
  const A = rowsOf(nw, '광산5', 1, 260), B = rowsOf(od, '광산5', 1, 260); let body = '';
  [['miner', '광부 수'], ['hunter', '사냥꾼 수'], ['oreTin', '주석 원석(곳간)'], ['copper', '구리(곳간)']].forEach(([c, nm], i) => {
    body += panel({ x: 12 + (i % 2) * 560, y: 30 + Math.floor(i / 2) * 200, w: 540, h: 190, title: `1020 광산5 — ${nm}`, series: [{ name: '새', pts: A.map((x) => [x.d, x[c]]), step: c === 'miner' || c === 'hunter' }, { name: '옛', pts: B.map((x) => [x.d, x[c]]), color: PAL[1], dash: true, step: c === 'miner' || c === 'hunter' }], x0: 1, x1: 260, y0: 0 });
  });
  svg('그림2_1020_광산5_1_260.svg', 1132, 430, 'T1479 그림 2 — 1020 광산5 날 1 ~ 260 (새 ↔ 옛)', body);
}
function fig3() {   // 농촌18 곳간 · 보낸 마을 누계
  const nw = rdz(path.join(KEEP, 'new-obs-1020.t1479.json.gz')); if (!nw || !SUM.feed.new) return;
  const L = {}; nw.lcols.forEach((c, i) => { L[c] = i; });
  const pts = []; for (let d = 1; d <= 372; d++) { const x = nw.light[d] && nw.light[d]['농촌18']; if (x) pts.push([d, x[L.foodStock]]); }
  const top = SUM.feed.new.senders.slice(0, 4), ser = top.map((s, i) => { let c = 0; const p = []; for (let d = 1; d <= 372; d++) { const q = nw.feedIn[d] && nw.feedIn[d][s.s]; if (q) c += q[0]; p.push([d, c]); } return { name: s.s, pts: p, step: true, color: PAL[i % PAL.length] }; });
  let body = panel({ x: 12, y: 30, w: 1100, h: 190, title: '농촌18 곳간 식량(환산)', series: [{ name: '곳간', pts }], x0: 1, x1: 372, y0: 0 });
  body += panel({ x: 12, y: 230, w: 1100, h: 220, title: '보낸 마을별 닿은 먹을 것 누계(환산) — 위 4 마을', series: ser, x0: 1, x1: 372, y0: 0 });
  svg('그림3_농촌18_보낸마을.svg', 1132, 470, 'T1479 그림 3 — 1020 새 지도 농촌18 날 1 ~ 372', body);
}
fig1(); fig2(); fig3();
console.log('표 · 요약 · 그림 씀', DIR);
