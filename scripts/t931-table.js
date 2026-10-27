#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T931 표 기계 · 읽기만 · 판정 0)
// === scripts/t931-table.js — 식량 자리 K 관성(`T931_SLOTK_EMA`) 끔 ↔ 켬 표 — `scripts/t931-observe.js` 가 적은 판들을 읽는다 ===
//   node scripts/t931-table.js [--srv <띠 뿌리>] [--lab <랩 뿌리>] [--json <파일>]
//     서버 판 = <띠 뿌리>/run-<갈래>[~<대조>]/base-<시드>.t931.json(T837 띠 꼴 — `~raidN` 이 붙은 판은 그 갈래의 갈림 대조)
//     랩 판   = <랩 뿌리>/<자>-<갈래>-<시드>.t931.json(자 = t17 · t176 · 갈래 = A 끔 · K 켬)
//   셈(판 하나 = 시드 하나 · 갈래 = 3시드 합):
//     dAll 죽음 전부(`_deathsToday` 합) · fam365 = 365일 앞 죽음(첫해 · t875 `fam365` 와 같은 잣대) · d366 = 366일~ 죽음
//     win = 366일~ 죽음 중 12 · 1 · 2월(정본 달력 `dateOf`) · dec = 그중 12월 · winAll = 모든 날 죽음 중 12 · 1 · 2월
//     h0 = 366일~ 죽음 중 그날 굶주림 항 0(`_dpDebug.hunger === 0`) · full = 366일~ 죽음 중 곳간 찬 날(곳간 식량 환산 ≥ 틱 머리 인구 × 10 — T924 ②-b 잣대)
//     bind = 366일~ 죽음의 K 를 묶은 칸(K 에 든 식량 자리 · 식량 흐름 · 땔감 중 가장 작은 칸) · step = 366일~ 죽음 중 그날 자리(관성 앞)가 전날보다 준 날
//     pop400 · popEnd = 그날 인구 합 · empty = 끝 날 빈 마을(한 번이라도 사람이 있었고 끝 날 0) · month = 366일~ 죽음 달별
//   띠(서버) = 그 갈래의 판 넷(갈래 판 + 대조 셋) 최소 ~ 최대 — T837 `diverge-table` 과 같은 잣대(겹침 · 갈래 판끼리 차 · 차 > 큰 띠 폭)
//   ★[T943 2026-10-27] 그날 죽음 칸 바로잡기 — 옛 관찰기(T931 판 · `deathsSrc` 없음)는 틱 뒤 `_deathsToday` 를 적었다. 그 칸은 틱이 기근 고리 앞
//     `v._deathsToday = 0` 줄까지 닿아야 다시 선다 — 빈 마을(틱 첫 줄 `if (v.npcs.length === 0) return;`) · T932 끔 판(열셋째 판까지)의 제련 날 `return` 은
//     전날 값이 남아 없는 죽음을 날마다 다시 셌다. 이 표는 죽음을 이렇게 센다(`fix` 에 옛 셈 · 고친 셈 · 바꾼 줄 수):
//       고친 관찰기(`deathsSrc: 'deadTot'` — 틱 앞뒤 `_deadTot` 차) = 그대로
//       서버 판 = 판 JSON `rows` 의 마을 × 날 `_deadTot`(정본 판 자 칸 · 누계) 증분 — 판 끝 `deadTot` 와 맞는지 `fix.end` 로 본다
//       옛 랩 판 = 틱 머리 인구 0 인 줄은 0 · `--stale same`(T932 끔 판) 이면 틱 뒤 인구 = 틱 머리 · 죽음 · econ 칸 여덟이 전날 줄과 똑같은 줄(틱이 econ 칸 앞에서 끝난 날)도 0
//       (두 잣대를 서버 판 60개의 `_deadTot` 증분에 대 봤다 — 열넷째 판 24개는 인구 0 줄만 지우면 마을 × 날 다 같다 · 열셋째 판 36개는 `same` 까지 지우면 다 같다)
'use strict';
const fs = require('fs');
const path = require('path');
const CAL = require(path.join(__dirname, '..', 'server', 'calendar.js'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRV = arg('--srv', null), LAB = arg('--lab', null), OUTJ = arg('--json', null), STALE = arg('--stale', 'n0');
const ECON = ['K', 'slot', 'prod', 'fuel', 'logi', 'hunger', 'healthT', 'happyT'];
const SEEDS = [1020, 7, 42];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const MO = new Map();
const monthOf = (d) => { let m = MO.get(d); if (m == null) { m = CAL.dateOf(d).month; MO.set(d, m); } return m; };
const KEYS = [['dAll', '죽음 전부'], ['fam365', '첫해(365일 앞) 죽음'], ['d366', '366일~ 죽음'], ['bAll', '출생 전부(틱 안 — 틱 뒤 − 틱 머리 + 그날 죽음)'], ['b365', '첫해 출생'], ['win', '366일~ 12 · 1 · 2월 죽음'], ['dec', '366일~ 12월 죽음'],
  ['h0', '366일~ 그날 굶주림 0 인 죽음'], ['full', '366일~ 곳간 찬 날 죽음'], ['step', '366일~ 그날 자리가 준 날 죽음'], ['bSlot', '366일~ K = 식량 자리'], ['bProd', '366일~ K = 식량 흐름'], ['bFuel', '366일~ K = 땔감'],
  ['pop400', '400날 인구'], ['popEnd', '끝 날 인구'], ['empty', '끝 날 빈 마을'], ['expand', '확장 셀(판 끝 누계)'], ['dissolved', '해체(서버 도적 층 · 판 끝)'], ['days', '날']];

function perRun(o, rj) {
  if (!o || !o.v || !o.cols) return null;
  const C = {}; o.cols.forEach((k, i) => { C[k] = i; });
  const s = { dAll: 0, fam365: 0, d366: 0, bAll: 0, b365: 0, expand: 0, dissolved: 0, win: 0, dec: 0, winAll: 0, h0: 0, full: 0, step: 0, bSlot: 0, bProd: 0, bFuel: 0, pop400: 0, popEnd: 0, empty: 0, days: 0, month: {}, monthAll: {}, vil: 0,
    fh0: 0, fh0b: { slot: 0, prod: 0, fuel: 0 }, fh0d: { '10~30': 0, '30~100': 0, '100~': 0 }, fh0w: 0 };
  //   ★[T943] 그날 죽음의 출처(머리 주석) — 서버 판 JSON 의 마을 × 날 `_deadTot`
  const DT = (o.deathsSrc !== 'deadTot' && rj && Array.isArray(rj.rows) && Array.isArray(rj.names)) ? new Map(rj.names.map((n, i) => [n, new Map(rj.rows.map((x) => [x[0], x[3][i]]))])) : null;
  const SRC = o.deathsSrc === 'deadTot' ? 'deadTot' : DT ? 'hook' : STALE === 'same' ? 'n0same' : 'n0';
  s.fix = { src: SRC, raw: 0, used: 0, rows: 0, end: (rj && rj.deadTot != null) ? rj.deadTot : null };
  let maxDay = 0;
  for (const rows of Object.values(o.v)) for (const r of rows) if (r[C.day] > maxDay) maxDay = r[C.day];
  s.days = maxDay;
  for (const [name, rows] of Object.entries(o.v)) {
    s.vil++;
    let had = false, prevRaw = null, p400 = null, last = null, prev = null;
    const M = DT ? DT.get(name) : null;
    for (const r of rows) {
      const d = r[C.day], n0 = r[C.pop0], d0 = r[C.deaths] || 0;
      const dd = SRC === 'deadTot' ? d0
        : (M && M.has(d)) ? M.get(d) - (M.get(d - 1) || 0)
        : (n0 === 0 || (SRC === 'n0same' && prev && r[C.pop] === n0 && d0 === (prev[C.deaths] || 0) && ECON.every((k) => r[C[k]] === prev[C[k]]))) ? 0 : d0;
      s.fix.raw += d0; s.fix.used += dd; if (dd !== d0) s.fix.rows++;
      prev = r;
      if (r[C.pop] > 0 || n0 > 0) had = true;
      { const b = r[C.pop] - n0 + dd; if (b > 0) { s.bAll += b; if (d < 365) s.b365 += b; } }   // 틱 안 출생(틱 안에서 인구를 바꾸는 것은 출생 · 기근 죽음 둘뿐)
      const raw = r[C.slotRaw];
      if (d <= 400) p400 = r[C.pop];
      last = r;
      if (dd > 0) {
        const mo = monthOf(d);
        s.dAll += dd; s.monthAll[mo] = (s.monthAll[mo] || 0) + dd;
        if (mo === 12 || mo === 1 || mo === 2) s.winAll += dd;
        if (d < 365) s.fam365 += dd;
        if (d >= 366) {
          s.d366 += dd; s.month[mo] = (s.month[mo] || 0) + dd;
          if (mo === 12 || mo === 1 || mo === 2) s.win += dd;
          if (mo === 12) s.dec += dd;
          if (r[C.hunger] === 0) s.h0 += dd;
          if (r[C.tfe] >= n0 * 10) s.full += dd;
          if (prevRaw != null && raw != null && raw < prevRaw) s.step += dd;
          const sl = r[C.slot], pr = r[C.prod], fu = r[C.fuel];
          let bk = null;
          if (sl != null && pr != null && fu != null) { const m = Math.min(sl, pr, fu); bk = m === sl ? 'slot' : m === pr ? 'prod' : 'fuel'; if (bk === 'slot') s.bSlot += dd; else if (bk === 'prod') s.bProd += dd; else s.bFuel += dd; }
          //   ⓑ 의 대상 — 곳간 찬 날(≥ 10일치)이고 그날 굶주림 항 0 인 죽음: K 를 묶은 칸 · 곳간 일수(곳간 식량 환산 ÷ 틱 머리 인구) · 겨울
          if (r[C.tfe] >= n0 * 10 && r[C.hunger] === 0) {
            s.fh0 += dd; if (bk) s.fh0b[bk] += dd; const dy = r[C.tfe] / Math.max(1, n0);
            s.fh0d[dy < 30 ? '10~30' : dy < 100 ? '30~100' : '100~'] += dd; if (mo === 12 || mo === 1 || mo === 2) s.fh0w += dd;
          }
        }
      }
      if (raw != null) prevRaw = raw;
    }
    if (p400 != null) s.pop400 += p400;
    if (last) { s.popEnd += last[C.pop]; if (had && last[C.pop] === 0) s.empty++; }
  }
  return s;
}
const sum = (list) => {
  const t = {}; for (const [k] of KEYS) t[k] = 0; t.winAll = 0; t.month = {}; t.monthAll = {}; t.days = 0; t.n = 0;
  t.fh0 = 0; t.fh0w = 0; t.fh0b = { slot: 0, prod: 0, fuel: 0 }; t.fh0d = { '10~30': 0, '30~100': 0, '100~': 0 };
  t.fix = { src: [], raw: 0, used: 0, rows: 0, endEq: 0, endN: 0 };
  for (const s of list) { if (!s) continue; t.n++; for (const [k] of KEYS) if (k !== 'days') t[k] += s[k]; t.winAll += s.winAll; t.days = Math.max(t.days, s.days);
    if (!t.fix.src.includes(s.fix.src)) t.fix.src.push(s.fix.src); t.fix.raw += s.fix.raw; t.fix.used += s.fix.used; t.fix.rows += s.fix.rows;
    if (s.fix.end != null) { t.fix.endN++; if (s.fix.end === s.fix.used) t.fix.endEq++; }
    t.fh0 += s.fh0; t.fh0w += s.fh0w; for (const k in s.fh0b) t.fh0b[k] += s.fh0b[k]; for (const k in s.fh0d) t.fh0d[k] += s.fh0d[k];
    for (const m in s.month) t.month[m] = (t.month[m] || 0) + s.month[m]; for (const m in s.monthAll) t.monthAll[m] = (t.monthAll[m] || 0) + s.monthAll[m]; }
  return t;
};
const pc = (a, b) => b > 0 ? (100 * a / b).toFixed(1) + '%' : '—';
const nf = (x) => x == null ? '—' : Number(x).toLocaleString('en-US');
const out = { srv: null, lab: null };
const P = (s) => console.log(s);

if (SRV) {
  const runs = {};
  for (const x of fs.readdirSync(SRV)) {
    const p = path.join(SRV, x); if (!/^run-/.test(x) || !fs.statSync(p).isDirectory()) continue;
    const [arm, ctl] = x.slice(4).split('~');
    const seeds = {};
    for (const sd of SEEDS) {
      const rj = J(path.join(p, `base-${sd}.json`));
      const s = perRun(J(path.join(p, `base-${sd}.t931.json`)), rj);
      //   인구 · 빈 마을은 판 자의 정본 칸으로 바꿔 적는다 — 400날 = 갈림 대조 장부(`dctl.days` · 장부 하루 끝) · 끝 날 = 판 JSON 여덟 수 · 빈 마을 = 판 JSON `empty`
      if (s) {
        const dc = J(path.join(p, `base-${sd}.dctl.json`));
        const d4 = dc && dc.days ? dc.days.find((x) => x[0] === 400) : null;
        if (d4) s.pop400 = d4[1].reduce((a, c) => a + (c[0] || 0), 0);
        if (rj && rj.eight) { s.popEnd = rj.eight.pop; s.expand = rj.eight.expand || 0; if (rj.empty != null) s.empty = rj.empty; if (rj.dissolved != null) s.dissolved = rj.dissolved; }
      }
      seeds[sd] = s;
    }
    (runs[arm] || (runs[arm] = [])).push({ ctl: ctl || null, seeds, tot: sum(Object.values(seeds)) });
  }
  out.srv = runs;
  const arms = Object.keys(runs).sort();
  P(`## 서버 판 자 — T837 띠(갈래마다 판 ${arms.map((a) => `${a} ${runs[a].length}`).join(' · ')} · 3시드 합)`);
  P('');
  const others = arms.filter((a) => a !== 'a'), A0 = arms.includes('a') ? 'a' : arms[0];
  P('| 셈 | ' + arms.map((a) => `${a} 갈래 판`).join(' | ') + ' | ' + arms.map((a) => `${a} 띠(최소 ~ 최대 · 폭)`).join(' | ') + ' | ' + others.map((x) => `${x} − ${A0}(갈래 판) · 겹침 · 차 > 큰 띠 폭`).join(' | ') + ' |');
  P('|---|' + arms.map(() => '---:|').join('') + arms.map(() => '---|').join('') + others.map(() => '---|').join(''));
  const band = (a, k) => { const v = runs[a].filter((r) => r.tot.n === 3).map((r) => r.tot[k]); if (!v.length) return null; const lo = Math.min(...v), hi = Math.max(...v); return { lo, hi, w: hi - lo, n: v.length }; };
  const base = (a, k) => { const r = runs[a].find((r) => r.ctl == null && r.tot.n === 3); return r ? r.tot[k] : null; };
  for (const [k, nm] of KEYS) {
    if (k === 'days') continue;
    const B = {}; for (const a of arms) B[a] = band(a, k);
    const cmp = (x) => {
      const d = (base(x, k) != null && base(A0, k) != null) ? base(x, k) - base(A0, k) : null;
      const ov = (B[A0] && B[x]) ? (B[x].lo <= B[A0].hi && B[A0].lo <= B[x].hi ? '겹침' : '**안 겹침**') : '—';
      const big = (B[A0] && B[x] && d != null) ? (Math.abs(d) > Math.max(B[A0].w, B[x].w) ? '**예**' : '아니오') : '—';
      return `${d == null ? '—' : (d > 0 ? '+' : '') + nf(d)} · ${ov} · ${big}`;
    };
    P(`| ${nm} | ${arms.map((a) => nf(base(a, k))).join(' | ')} | ${arms.map((a) => B[a] ? `${nf(B[a].lo)} ~ ${nf(B[a].hi)} · ${nf(B[a].w)}` : '—').join(' | ')} | ${others.map(cmp).join(' | ')} |`);
  }
  P('');
  P('몫(갈래 판 · 3시드 합 — 띠 = 판 넷의 최소 ~ 최대):');
  P('');
  P('| 몫 | ' + arms.map((a) => `${a} 갈래 판`).join(' | ') + ' | ' + arms.map((a) => `${a} 띠`).join(' | ') + ' |');
  P('|---|' + arms.map(() => '---:|').join('') + arms.map(() => '---|').join(''));
  const SH = [['win', 'd366', '366일~ 죽음 중 12 · 1 · 2월'], ['dec', 'd366', '366일~ 죽음 중 12월'], ['winAll', 'dAll', '모든 날 죽음 중 12 · 1 · 2월'], ['h0', 'd366', '366일~ 죽음 중 그날 굶주림 0'],
    ['full', 'd366', '366일~ 죽음 중 곳간 찬 날'], ['step', 'd366', '366일~ 죽음 중 그날 자리가 준 날'], ['bSlot', 'd366', '366일~ 죽음 중 K = 식량 자리'], ['bProd', 'd366', '366일~ 죽음 중 K = 식량 흐름'], ['bFuel', 'd366', '366일~ 죽음 중 K = 땔감']];
  for (const [a, b, nm] of SH) {
    const bs = (arm) => { const r = runs[arm].find((r) => r.ctl == null && r.tot.n === 3); return r ? pc(r.tot[a], r.tot[b]) : '—'; };
    const bd = (arm) => { const v = runs[arm].filter((r) => r.tot.n === 3 && r.tot[b] > 0).map((r) => 100 * r.tot[a] / r.tot[b]); return v.length ? `${Math.min(...v).toFixed(1)} ~ ${Math.max(...v).toFixed(1)}%` : '—'; };
    P(`| ${nm} | ${arms.map(bs).join(' | ')} | ${arms.map(bd).join(' | ')} |`);
  }
  P('');
  P('시드마다(갈래 판):');
  P('');
  P('| 갈래 · 시드 | 죽음 전부 | 첫해 | 366일~ | 12~2월 몫 | 굶주림 0 몫 | 곳간 찬 날 몫 | K = 자리 몫 | 400날 인구 | 끝 날 인구 | 빈 마을 |');
  P('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const a of arms) { const r = runs[a].find((x) => x.ctl == null); if (!r) continue; for (const sd of SEEDS) { const s = r.seeds[sd]; if (!s) continue;
    P(`| ${a} · ${sd} | ${nf(s.dAll)} | ${nf(s.fam365)} | ${nf(s.d366)} | ${pc(s.win, s.d366)} | ${pc(s.h0, s.d366)} | ${pc(s.full, s.d366)} | ${pc(s.bSlot, s.d366)} | ${nf(s.pop400)} | ${nf(s.popEnd)} | ${s.empty} |`); } }
  P('');
  P('366일~ 죽음 달별(갈래 판 · 3시드 합 · 3월 ~ 2월):');
  P('');
  const MS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
  P('| 갈래 | ' + MS.map((m) => `${m}월`).join(' | ') + ' |');
  P('|---|' + MS.map(() => '---:|').join(''));
  for (const a of arms) { const r = runs[a].find((x) => x.ctl == null && x.tot.n === 3); if (r) P(`| ${a} | ${MS.map((m) => nf(r.tot.month[m] || 0)).join(' | ')} |`); }
  P('');
  P('ⓑ 의 대상 — 366일~ 곳간 찬 날(≥ 10일치) · 그날 굶주림 항 0 인 죽음(갈래 판 · 3시드 합 · 판정 0):');
  P('');
  P('| 갈래 | 죽음 | 366일~ 죽음 중 몫 | K = 식량 자리 · 식량 흐름 · 땔감 | 곳간 10~30 · 30~100 · 100일치~ | 12~2월 |');
  P('|---|---:|---:|---|---|---:|');
  for (const a of arms) { const r = runs[a].find((x) => x.ctl == null && x.tot.n === 3); if (!r) continue; const T = r.tot;
    P(`| ${a} | ${nf(T.fh0)} | ${pc(T.fh0, T.d366)} | ${nf(T.fh0b.slot)} · ${nf(T.fh0b.prod)} · ${nf(T.fh0b.fuel)} | ${nf(T.fh0d['10~30'])} · ${nf(T.fh0d['30~100'])} · ${nf(T.fh0d['100~'])} | ${pc(T.fh0w, T.fh0)} |`); }
  P('');
  P('★[T943] 그날 죽음 칸 — 판마다 출처 · 관찰기 옛 셈(틱 뒤 `_deathsToday`) → 이 표의 셈 · 바꾼 마을 × 날 줄 · 판 끝 `deadTot`(판 JSON) 와 같은 판:');
  P('');
  P('| 판(갈래 · 대조) | 출처 | 옛 셈 | 이 표 | 바꾼 줄 | 판 끝 deadTot 같음 |');
  P('|---|---|---:|---:|---:|---:|');
  for (const a of arms) for (const r of runs[a]) { const F = r.tot.fix; P(`| ${a}${r.ctl ? ' ~' + r.ctl : ''} | ${F.src.join(' · ')} | ${nf(F.raw)} | ${nf(F.used)} | ${nf(F.rows)} | ${F.endEq}/${F.endN} |`); }
  P('');
}

if (LAB) {
  //   갈래: A 끔 · K `'1'` · S `'season'`(있는 것만) · 자: t17 · t176(있는 것만 — 두 자는 econ 이 같다 · 같은 수면 한 열로 줄인다)
  const ARMS = [['A', '끔'], ['K', "'1'"], ['S', "'season'"]], lab = {};
  for (const r of ['t17', 't176']) for (const [a] of ARMS) {
    const seeds = {};
    for (const sd of SEEDS) {
      const s = perRun(J(path.join(LAB, `${r}-${a}-${sd}.t931.json`)), null), rj = J(path.join(LAB, `${r}-${a}-${sd}.json`));
      if (s && rj && rj.base) { s.popEnd = rj.base.pop; s.empty = rj.base.dead; s.expand = rj.base.expand; }   // 끝 날 인구 · 소멸 · 확장 셀 = 랩 자 판 JSON(여덟 수 `base`)
      seeds[sd] = s;
    }
    const tot = sum(Object.values(seeds));
    (lab[r] || (lab[r] = {}))[a] = { seeds, tot };
  }
  out.lab = lab;
  const cols = []; for (const r of ['t17', 't176']) for (const [a, nm] of ARMS) if (lab[r][a].tot.n === 3) cols.push([r, a, `${r} ${nm}`]);
  //   t176 가 t17 과 셈이 다 같으면 t176 열은 접는다(같은 econ — 보고에 한 번 적는다)
  const same = (a) => lab.t176[a].tot.n === 3 && lab.t17[a].tot.n === 3 && KEYS.every(([k]) => lab.t176[a].tot[k] === lab.t17[a].tot[k]);
  const shown = cols.filter(([r, a]) => !(r === 't176' && same(a)));
  const folded = cols.filter(([r, a]) => r === 't176' && same(a)).map(([, a]) => a);
  P(`## 랩 두 자(800날 · 3시드 합${folded.length ? ` · t176 = t17 셈 다 같음(${folded.join(' · ')}) — 접음` : ''})`);
  P('');
  P('| 셈 | ' + shown.map((c) => c[2]).join(' | ') + ' |');
  P('|---|' + shown.map(() => '---:|').join(''));
  for (const [k, nm] of KEYS) { if (k === 'days' || k === 'dissolved') continue; P(`| ${nm} | ${shown.map(([r, a]) => nf(lab[r][a].tot[k])).join(' | ')} |`); }
  P('');
  P('| 몫 | ' + shown.map((c) => c[2]).join(' | ') + ' |');
  P('|---|' + shown.map(() => '---:|').join(''));
  for (const [a, b, nm] of [['win', 'd366', '366일~ 죽음 중 12 · 1 · 2월'], ['dec', 'd366', '366일~ 죽음 중 12월'], ['winAll', 'dAll', '모든 날 죽음 중 12 · 1 · 2월'], ['h0', 'd366', '366일~ 죽음 중 그날 굶주림 0'], ['full', 'd366', '366일~ 죽음 중 곳간 찬 날'], ['step', 'd366', '366일~ 죽음 중 그날 자리가 준 날'], ['bSlot', 'd366', '366일~ 죽음 중 K = 식량 자리'], ['bProd', 'd366', '366일~ 죽음 중 K = 식량 흐름'], ['bFuel', 'd366', '366일~ 죽음 중 K = 땔감']]) {
    P(`| ${nm} | ${shown.map(([r, x]) => pc(lab[r][x].tot[a], lab[r][x].tot[b])).join(' | ')} |`);
  }
  P('');
  P('ⓑ 의 대상 — 366일~ 곳간 찬 날 · 그날 굶주림 0 인 죽음:');
  P('');
  P('| 자 · 갈래 | 죽음 | 366일~ 죽음 중 몫 | K = 식량 자리 · 식량 흐름 · 땔감 | 곳간 10~30 · 30~100 · 100일치~ | 12~2월 |');
  P('|---|---:|---:|---|---|---:|');
  for (const [r, a, nm] of shown) { const T = lab[r][a].tot;
    P(`| ${nm} | ${nf(T.fh0)} | ${pc(T.fh0, T.d366)} | ${nf(T.fh0b.slot)} · ${nf(T.fh0b.prod)} · ${nf(T.fh0b.fuel)} | ${nf(T.fh0d['10~30'])} · ${nf(T.fh0d['30~100'])} · ${nf(T.fh0d['100~'])} | ${pc(T.fh0w, T.fh0)} |`); }
  P('');
  P('시드마다(랩 t17):');
  P('');
  P('| 갈래 · 시드 | 죽음 전부 | 첫해 | 366일~ | 12~2월 몫 | 굶주림 0 몫 | 곳간 찬 날 몫 | K = 자리 몫 | 출생 | 400날 인구 | 800날 인구 | 소멸 | 확장 셀 |');
  P('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [a, nm] of ARMS) for (const sd of SEEDS) { const s = lab.t17[a].seeds[sd]; if (!s) continue;
    P(`| ${nm} · ${sd} | ${nf(s.dAll)} | ${nf(s.fam365)} | ${nf(s.d366)} | ${pc(s.win, s.d366)} | ${pc(s.h0, s.d366)} | ${pc(s.full, s.d366)} | ${pc(s.bSlot, s.d366)} | ${nf(s.bAll)} | ${nf(s.pop400)} | ${nf(s.popEnd)} | ${s.empty} | ${nf(s.expand)} |`); }
  P('');
  P('366일~ 죽음 달별(랩 t17 · 3시드 합 · 3월 ~ 2월):');
  P('');
  const MS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
  P('| 갈래 | ' + MS.map((m) => `${m}월`).join(' | ') + ' |');
  P('|---|' + MS.map(() => '---:|').join(''));
  for (const [a, nm] of ARMS) { const T = lab.t17[a].tot; if (T.n === 3) P(`| ${nm} | ${MS.map((m) => nf(T.month[m] || 0)).join(' | ')} |`); }
  P('');
  P(`★[T943] 그날 죽음 칸 — 자 · 갈래마다 출처(\`--stale ${STALE}\`) · 관찰기 옛 셈 → 이 표의 셈 · 바꾼 마을 × 날 줄:`);
  P('');
  P('| 자 · 갈래 | 출처 | 옛 셈 | 이 표 | 바꾼 줄 |');
  P('|---|---|---:|---:|---:|');
  for (const [r, a, nm] of cols) { const F = lab[r][a].tot.fix; P(`| ${nm} | ${F.src.join(' · ')} | ${nf(F.raw)} | ${nf(F.used)} | ${nf(F.rows)} |`); }
  P('');
}
if (OUTJ) fs.writeFileSync(OUTJ, JSON.stringify(out, null, 1) + '\n');
