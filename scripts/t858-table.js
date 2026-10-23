#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T858 표 기계 · 세계 안 만짐 · 판 JSON 만 읽는다)
// === scripts/t858-table.js — 보호막 있음/끔 × 도적 켬/끔 네 판 표 + 갈림 대조 띠(T837 `diverge-ctl.js` 대조 판) ===
//   node scripts/t858-table.js [--lab <랩 뿌리>] [--server <서버 뿌리>] [--json <파일>]
//     랩 뿌리   아래 `<판>/<자>-<시드>.json`(t17 `T17_JSON` · t176 `T176_JSON`) + `<판>/<자>-<시드>.t858.json` — 판 = A · C(랩엔 도적이 없다: 도적 훅은 서버 호스트만 단다)
//     서버 뿌리 아래 `run-<판>[~<대조>]/base-<시드>.json`(t577) + `base-<시드>.t858.json` — 판 = A · B · C · D(+ 대조 `~raid1..3` · 그 밖 이름은 그대로 싣는다)
//   셈(판마다 · 3시드 합 — 칸은 산수뿐 · 판정 0):
//     빈 마을(끝 날 인구 0) · 그중 해체 없이(서버 `bdtDay` 없음) · 소멸(자의 여덟 수 `dead`) · 끝 인구 · 최저 인구(365일 뒤 · 날 — 첫날 8명 × 51 은 빼려고) ·
//     365일 → 400일(그사이 최저 = 보호막 끝 낙차) ·
//     굶는 마을-날(인구 > 0 이고 곳간 식량 환산 < 인구 — T837 잣대 · 365 앞 / 365~400 / 400 뒤) · 굶어 죽음(`_deathsToday` 합 · 같은 셋) · 보호막이 지운 압력(`_shieldAte` 합 — 끈 판은 0 이어야 한다) ·
//     습격(서버 `bandit.loot`) · 행상 피살(`tradersKilled`) · 해체(`dissolved`) · 징발 묶임(자유민 0 이 10일 이상 · 첫날 인구 ≥ 5) · 그 뒤 3일 안 몰사(T815 잣대 — 도적 무관 몫)
//   첫해 인구 곡선: 시드 1020 의 T796 대상 셋(농촌13 · 농촌16 · 농촌18 — 해체 없이 굶어 빈 마을) · 정한 날들.
//   띠(서버): 그 판 + 대조 판들(`~raid1..3`)의 최소 ~ 최대 · 폭 · 평균. 견줌(B−A · D−C · C−A · D−B): 판끼리 차 · 띠 평균 차 · 띠 겹침 · |차| > 큰 띠 폭(T837 `diverge-table` 과 같은 칸).
'use strict';
const fs = require('fs');
const path = require('path');
const A = process.argv.slice(2);
const opt = (k) => (A.includes(k) ? A[A.indexOf(k) + 1] : null);
const LAB = opt('--lab'), SRV = opt('--server'), JOUT = opt('--json');
const SEEDS = [1020, 7, 42];
const CURVE = { seed: 1020, names: ['농촌13', '농촌16', '농촌18'], days: [1, 60, 120, 180, 240, 300, 330, 350, 365, 370, 380, 390, 400, 500, 600, 700, 800] };
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const r1 = (x) => Math.round(x * 10) / 10;
// 판 하나(시드 하나): 자 JSON(o) + 관찰 줄(t) → 셈
function one(o, t, kind) {
  const C = {}; t.cols.forEach((c, i) => { C[c] = i; });
  const R = t.rows, names = t.names, nV = names.length;
  const m = { days: R.length ? R[R.length - 1][0] : 0, empty: 0, emptyNoBdt: 0, dead: 0, popEnd: 0, popMin: Infinity, popMinDay: null, pop365: null, pop400: null, dipMin: Infinity, dipDay: null,
    starve: [0, 0, 0], famine: [0, 0, 0], shieldAte: 0, raids: 0, peddler: 0, dissolved: 0, pins: 0, pinDays: 0, wipes: 0, wipeNames: [], curve: null };
  const per = (d) => (d < 365 ? 0 : d <= 400 ? 1 : 2);
  for (const [d, V] of R) {
    let s = 0;
    for (const x of V) { s += x[C.pop]; if (x[C.pop] > 0 && x[C.tfe] < x[C.pop]) m.starve[per(d)]++; m.famine[per(d)] += x[C.deathsToday] || 0; m.shieldAte += x[C.shieldAte] || 0; }
    if (d >= 365 && s < m.popMin) { m.popMin = s; m.popMinDay = d; }
    if (d >= 365 && d <= 400 && s < m.dipMin) { m.dipMin = s; m.dipDay = d; }
    if (d === 365) m.pop365 = s; if (d === 400) m.pop400 = s;
  }
  const last = R[R.length - 1][1];
  m.emptyDays = [];
  for (let vi = 0; vi < nV; vi++) if (last[vi][C.pop] === 0) { let k = R.length - 1; while (k > 0 && R[k - 1][1][vi][C.pop] === 0) k--; m.emptyDays.push(R[k][0]); }
  m.emptyDays.sort((p, q) => p - q);
  for (let vi = 0; vi < nV; vi++) if (last[vi][C.pop] === 0) { m.empty++; if (!(kind === 'server' && o && o.bdtDay && o.bdtDay[vi] != null)) m.emptyNoBdt++; }
  m.popEnd = last.reduce((a, x) => a + x[C.pop], 0);
  if (kind === 'server') { m.dead = o.eight ? o.eight.dead : 0; m.raids = (o.bandit && o.bandit.loot) || 0; m.peddler = o.tradersKilled || 0; m.dissolved = o.dissolved || 0; }
  else m.dead = o.base ? o.base.dead : (o.dead != null ? o.dead : 0);
  //   징발 묶임 · 몰사(T815 잣대 그대로)
  for (let vi = 0; vi < nV; vi++) {
    let i = 0;
    while (i < R.length) {
      const x = R[i][1][vi];
      if (x[C.free] === 0 && x[C.pop] >= 1) {
        let j = i; while (j + 1 < R.length && R[j + 1][1][vi][C.free] === 0 && R[j + 1][1][vi][C.pop] >= 1) j++;
        if (j - i + 1 >= 10 && x[C.pop] >= 5) { m.pins++; m.pinDays += j - i + 1; const after = R.slice(j + 1, j + 4).map((y) => y[1][vi][C.pop]); if (after.some((p) => p === 0)) { m.wipes++; m.wipeNames.push(names[vi]); } }
        i = j + 1;
      } else i++;
    }
  }
  m.shieldAte = r1(m.shieldAte);
  return m;
}
function curveOf(t) {
  const C = {}; t.cols.forEach((c, i) => { C[c] = i; });
  const idx = CURVE.names.map((n) => t.names.indexOf(n));
  const at = new Map(t.rows.map((r) => [r[0], r[1]]));
  return CURVE.names.map((n, k) => [n, CURVE.days.filter((d) => at.has(d)).map((d) => [d, idx[k] >= 0 ? at.get(d)[idx[k]][C.pop] : null])]);
}
const SUMK = ['empty', 'emptyNoBdt', 'dead', 'popEnd', 'raids', 'peddler', 'dissolved', 'pins', 'pinDays', 'wipes', 'shieldAte'];
function sum(ms) {
  const s = { seeds: ms.length, starve: [0, 0, 0], famine: [0, 0, 0], popMin: 0, pop365: 0, pop400: 0, dipMin: 0, wipeNames: [], emptyDays: [] };
  for (const k of SUMK) s[k] = 0;
  //   최저 인구는 3시드 합 곡선의 최저가 아니라 시드마다 최저의 합이다(날이 시드마다 다르다 — 표에 그렇게 적는다)
  for (const m of ms) { for (const k of SUMK) s[k] += m[k]; for (let p = 0; p < 3; p++) { s.starve[p] += m.starve[p]; s.famine[p] += m.famine[p]; } s.popMin += m.popMin; s.pop365 += m.pop365 || 0; s.pop400 += m.pop400 || 0; s.dipMin += m.dipMin; s.wipeNames.push(...m.wipeNames); s.emptyDays.push(...m.emptyDays); }
  s.emptyDays.sort((p, q) => p - q); s.emptyBefore365 = s.emptyDays.filter((d) => d < 365).length;
  s.emptyDayMed = s.emptyDays.length ? s.emptyDays[Math.floor(s.emptyDays.length / 2)] : null;
  s.shieldAte = r1(s.shieldAte); s.starveAll = s.starve[0] + s.starve[1] + s.starve[2]; s.famineAll = s.famine[0] + s.famine[1] + s.famine[2]; s.drop = s.pop365 - s.dipMin;   // 보호막 끝 낙차 = 365일 인구 − 365~400 최저(시드마다 최저의 합 · 오르기만 했으면 0)
  return s;
}
function loadDir(dir, kind, pre) {
  const per = {}, ms = []; let curve = null;
  for (const sd of SEEDS) {
    const o = rd(path.join(dir, `${pre}-${sd}.json`)), t = rd(path.join(dir, `${pre}-${sd}.t858.json`));
    if (!o || !t || !t.rows || !t.rows.length) continue;
    const m = one(o, t, kind); per[sd] = m; ms.push(m);
    if (sd === CURVE.seed) curve = curveOf(t);
  }
  return ms.length ? { per, sum: sum(ms), curve, knob: null } : null;
}
const doc = { lab: {}, server: {}, bands: {}, pairs: [] };
if (LAB) for (const arm of fs.readdirSync(LAB).filter((x) => fs.statSync(path.join(LAB, x)).isDirectory()).sort())
  for (const ruler of ['t17', 't176']) { const r = loadDir(path.join(LAB, arm), 'lab', ruler); if (r) doc.lab[`${ruler}:${arm}`] = r; }
if (SRV) for (const x of fs.readdirSync(SRV).filter((y) => /^run-/.test(y) && fs.statSync(path.join(SRV, y)).isDirectory()).sort()) {
  const r = loadDir(path.join(SRV, x), 'server', 'base'); if (r) doc.server[x.slice(4)] = r;
}
//   띠 — 서버 판 X 와 그 대조 `X~*`
const KEYS = [['empty', '빈 마을'], ['emptyBefore365', '365일 앞에 빈 마을'], ['emptyNoBdt', '해체 없이 빔'], ['dead', '소멸'], ['popEnd', '끝 인구'], ['popMin', '365일 뒤 최저 인구(시드 합)'], ['drop', '365 → 400 낙차(365일 − 그사이 최저)'],
  ['starveAll', '굶는 마을-날'], ['famineAll', '굶어 죽음'], ['raids', '습격'], ['peddler', '행상 피살'], ['dissolved', '해체'], ['wipes', '징발 몰사']];
const armsOf = Object.keys(doc.server).filter((k) => !k.includes('~'));
for (const a of armsOf) {
  const runs = [a, ...Object.keys(doc.server).filter((k) => k.startsWith(a + '~'))].map((k) => doc.server[k].sum);
  doc.bands[a] = { n: runs.length, ctl: Object.keys(doc.server).filter((k) => k.startsWith(a + '~')), by: Object.fromEntries(KEYS.map(([k]) => { const xs = runs.map((s) => s[k]); return [k, { lo: Math.min(...xs), hi: Math.max(...xs), w: Math.max(...xs) - Math.min(...xs), mean: xs.reduce((p, q) => p + q, 0) / xs.length }]; })) };
}
const fmt = (x) => (x == null ? '—' : (typeof x === 'number' ? (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : String(r1(x))) : String(x)));
const out = [];
const P = (s) => out.push(s);
//   ① 판마다(3시드 합)
for (const [title, G] of [['랩(800날)', doc.lab], ['서버(400날)', doc.server]]) {
  const ks = Object.keys(G); if (!ks.length) continue;
  P(`\n### ${title} — 판마다 3시드 합\n`);
  P('| 판 | 빈 마을(해체 없이 · 365일 앞 · 빈 날 가운데) | 소멸 | 끝 인구 | 365일 뒤 최저 인구(시드 합) | 365일 → 400일(그사이 최저 · 낙차) | 굶는 마을-날(365 앞 · 365~400 · 400 뒤) | 굶어 죽음(같은 셋) | 보호막이 지운 압력 | 습격 | 행상 피살 | 해체 | 징발 묶임 · 몰사 |');
  P('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const k of ks) { const s = G[k].sum;
    P(`| ${k} | ${s.empty} (${s.emptyNoBdt} · ${s.emptyBefore365} · ${s.emptyDayMed ?? '—'}) | ${s.dead} | ${fmt(s.popEnd)} | ${fmt(s.popMin)} | ${fmt(s.pop365)} → ${fmt(s.pop400)}(${fmt(s.dipMin)} · ${s.drop > 0 ? '−' + fmt(s.drop) : '0'}) | ${fmt(s.starveAll)} (${fmt(s.starve[0])} · ${fmt(s.starve[1])} · ${fmt(s.starve[2])}) | ${fmt(s.famineAll)} (${fmt(s.famine[0])} · ${fmt(s.famine[1])} · ${fmt(s.famine[2])}) | ${fmt(s.shieldAte)} | ${s.raids} | ${s.peddler} | ${s.dissolved} | ${s.pins} · ${s.wipes}${s.wipeNames.length ? '(' + s.wipeNames.join('·') + ')' : ''} |`); }
}
//   ② 띠와 견줌(서버)
if (armsOf.length) {
  P('\n### 서버 — 판마다 띠(그 판 + 갈림 대조 판 · 최소 ~ 최대 · 폭)\n');
  P('| 셈 | ' + armsOf.map((a) => `${a}(${doc.bands[a].n}판)`).join(' | ') + ' |');
  P('|---|' + armsOf.map(() => '---').join('|') + '|');
  for (const [k, nm] of KEYS) P(`| ${nm} | ` + armsOf.map((a) => { const b = doc.bands[a].by[k]; return `${fmt(b.lo)} ~ ${fmt(b.hi)} · ${fmt(b.w)}`; }).join(' | ') + ' |');
  for (const [x, y, nm] of [['A', 'B', '보호막 있음 — 도적 끔 − 켬(B − A)'], ['C', 'D', '보호막 끔 — 도적 끔 − 켬(D − C)'], ['A', 'C', '도적 켬 — 보호막 끔 − 있음(C − A)'], ['B', 'D', '도적 끔 — 보호막 끔 − 있음(D − B)']]) {
    if (!doc.server[x] || !doc.server[y]) continue;
    const rows = [];
    P(`\n#### ${nm}\n`);
    P(`| 셈 | ${x} | ${y} | 차(${y} − ${x}) | ${x} 띠 폭 · ${y} 띠 폭 | 띠 평균 차 | 띠 겹침 | |차| > 큰 띠 폭 |`);
    P('|---|---|---|---|---|---|---|---|');
    for (const [k, nm2] of KEYS) {
      const a = doc.server[x].sum[k], b = doc.server[y].sum[k], d = b - a, ba = doc.bands[x] && doc.bands[x].by[k], bb = doc.bands[y] && doc.bands[y].by[k];
      const ov = ba && bb ? !(ba.hi < bb.lo || bb.hi < ba.lo) : null, big = ba && bb ? Math.abs(d) > Math.max(ba.w, bb.w) : null;
      const dm = ba && bb ? bb.mean - ba.mean : null;
      rows.push({ k, a, b, d, wa: ba ? ba.w : null, wb: bb ? bb.w : null, dm, na: ba ? doc.bands[x].n : 0, nb: bb ? doc.bands[y].n : 0, ov, big });
      P(`| ${nm2} | ${fmt(a)} | ${fmt(b)} | ${d > 0 ? '+' : ''}${fmt(d)} | ${ba ? fmt(ba.w) : '—'} · ${bb ? fmt(bb.w) : '—'} | ${dm == null ? '—' : (dm > 0 ? '+' : '') + fmt(dm)} | ${ov == null ? '—' : ov ? '겹침' : '안 겹침'} | ${big == null ? '—' : big ? '예' : '아니오'} |`);
    }
    doc.pairs.push({ x, y, nm, rows });
  }
}
//   ③ 시드마다(주 판만)
for (const [title, G] of [['랩', doc.lab], ['서버', doc.server]]) {
  const ks = Object.keys(G).filter((k) => !k.includes('~')); if (!ks.length) continue;
  P(`\n### ${title} — 시드마다(빈 마을 · 끝 인구 · 365일 뒤 최저 인구(날) · 굶는 마을-날 · 굶어 죽음)\n`);
  P('| 판 | ' + SEEDS.join(' | ') + ' |'); P('|---|' + SEEDS.map(() => '---').join('|') + '|');
  for (const k of ks) P(`| ${k} | ` + SEEDS.map((sd) => { const m = G[k].per[sd]; return m ? `${m.empty} · ${fmt(m.popEnd)} · ${fmt(m.popMin)}(${m.popMinDay}) · ${fmt(m.starve[0] + m.starve[1] + m.starve[2])} · ${fmt(m.famine[0] + m.famine[1] + m.famine[2])}` : '—'; }).join(' | ') + ' |');
}
//   ④ 첫해 인구 곡선(시드 1020 · T796 대상 셋)
for (const [title, G] of [['랩', doc.lab], ['서버', doc.server]]) {
  const ks = Object.keys(G).filter((k) => !k.includes('~') && G[k].curve); if (!ks.length) continue;
  const days = G[ks[0]].curve[0][1].map((x) => x[0]);
  P(`\n### ${title} — 첫해 인구 곡선(시드 ${CURVE.seed} · ${CURVE.names.join(' · ')})\n`);
  P('| 판 · 마을 | ' + days.join(' | ') + ' |'); P('|---|' + days.map(() => '---').join('|') + '|');
  for (const k of ks) for (const [nm, pts] of G[k].curve) P(`| ${k} · ${nm} | ` + pts.map((x) => fmt(x[1])).join(' | ') + ' |');
}
console.log(out.join('\n'));
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(doc, null, 1));
