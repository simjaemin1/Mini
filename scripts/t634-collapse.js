#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T634 붕괴 셋 ⓑ 표 · 판정 줄 · 제품 무변)
// === scripts/t634-collapse.js — 서버 판 자 끔 ↔ 켬 판 JSON 을 읽어 **붕괴 판정 줄**을 낸다 ======================
//   쓰는 법: node scripts/t634-collapse.js <끔 판 dir> <켬 판 dir> [<끔 되풀이 dir> [<켬 되풀이 dir>]]
//     판 dir = `T577_DIR`(판 JSON `<tag>-<seed>.json` + 관찰자 `….t634.json` — `scripts/t634-collapse-probe.js`)
//     셋째·넷째 dir(있으면) = 같은 끔 · 켬 판을 한 번 더 돌린 것 — 서버 판은 바이트 결정론이 아니라(T577 머리) **같은 판끼리의 폭**을 옆에 둔다.
//   ★잰다(시드마다 · 판마다):
//     빈 마을 = 끝 날 인구 0 인 마을(한 번이라도 사람이 있던 곳 · t577 `empty` 와 같은 셈) · 해체 = 도적 해체 표가 선 마을(t577 `dissolved`)
//     첫해 겨울 굶음 = 달력 `[1년 12월 1일, 2년 3월 1일)` 의 기근 마을·일(정본 술어 `_dpDebug.hunger < 0`) · 그 창의 굶어 죽음(기근 날의 `_deadTot` 증분)
//     곳간 곡물 최저 = 마을마다 **첫 겨울 첫날(12/1)부터 판 끝까지** 곳간 곡물(밀·쌀·보리·조)의 최저 → 마을들의 p5(가까운 순위) · 최저 마을 · 가운데
//       (⚠판 내내로 재면 첫날 곳간이 0 에서 차오르는 몫이 최저를 다 먹는다 — 곡물은 0 에서 시작한다 · 그래서 창은 달력 정본 12/1 부터)
//       대상 = 12/1 에 사람이 있던 마을.
//   ★판정(카드 ③ · 새 수 0): 빈 마을 · 해체 · 첫해 굶음(마을·일) 셋 중 켬이 끔보다 **크면 빨강** — 그 마을과 사실 줄을 한 줄씩.
//     사실 줄 = 그 마을의 첫 기근 날 · 12월 1일 곳간 곡물 · 첫 겨울 인구(끔 ↔ 켬) + 세계 수준 한 줄(econ 이 작물 시계를 읽나 · 첫 갈림 날).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Cal = require(path.join(ROOT, 'server', 'calendar'));

const [dOff, dOn, dRep, dRep2] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!dOff || !dOn) { console.error('쓰는 법: node scripts/t634-collapse.js <끔 dir> <켬 dir> [<끔 되풀이 dir> [<켬 되풀이 dir>]]'); process.exit(2); }

const fmt = (d) => { if (d == null) return '—'; const t = Cal.dateOf(d); return `${t.year}년 ${t.month}/${t.dom}`; };
function load(dir) {
  const out = {};
  for (const f of fs.readdirSync(dir).filter((x) => /\.json$/.test(x) && !/\.t634\.json$/.test(x))) {
    const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    let p = null; try { p = JSON.parse(fs.readFileSync(path.join(dir, f + '.t634.json'), 'utf8')); } catch (e) { p = null; }
    out[o.seed] = { o, p };
  }
  return out;
}
function p5(a) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.max(0, Math.ceil(0.05 * s.length) - 1)] : null; }
function med(a) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; }

function measure(run) {
  const { o, p } = run;
  const names = o.names || [];
  const last = o.rows[o.rows.length - 1][1];
  const had = names.map((_, i) => o.rows.some((r) => r[1][i] > 0));
  const empty = names.filter((_, i) => had[i] && last[i] === 0);
  const dissolved = names.filter((_, i) => (o.bdtDay || [])[i] != null);
  const empty365 = names.filter((_, i) => (o.emptyDay || [])[i] != null && o.emptyDay[i] <= 365);
  const diss365 = names.filter((_, i) => (o.bdtDay || [])[i] != null && o.bdtDay[i] <= 365);
  const m = { seed: o.seed, days: o.days, pop: o.eight.pop, empty, dissolved, empty365, diss365, fw: null, grain: null, per: {} };
  if (p && p.v && p.days) {
    const [W0, W1] = p.firstWinter;
    let vd = 0, dead = 0, all = 0; const hungry = [];
    const gm = [];
    p.v.forEach((s, i) => {
      let fv = 0, fd = 0, first = null;
      p.days.forEach((d, k) => {
        if (s.famine[k]) { all++; if (first == null) first = d; }
        if (d >= W0 && d < W1) { if (s.famine[k]) { fv++; fd += s.dead[k]; } }
      });
      vd += fv; dead += fd; if (fv > 0) hungry.push(p.names[i]);
      const k0 = p.days.indexOf(W0), k1 = p.days.indexOf(W1 - 1);
      const alive = k0 >= 0 && s.pop[k0] > 0;
      const gmin = alive ? Math.min(...s.grain.slice(k0)) : null;
      if (gmin != null) gm.push([p.names[i], gmin]);
      m.per[p.names[i]] = { fv, fd, firstFamine: first, grainW0: k0 >= 0 ? s.grain[k0] : null, popW0: k0 >= 0 ? s.pop[k0] : null, popW1: k1 >= 0 ? s.pop[k1] : null, gmin };
    });
    m.fw = { vd, dead, hungry, allVD: all };
    const lo = gm.slice().sort((a, b) => a[1] - b[1])[0];
    m.grain = { p5: p5(gm.map((x) => x[1])), min: lo ? lo[1] : null, minAt: lo ? lo[0] : null, med: med(gm.map((x) => x[1])), zero: gm.filter((x) => x[1] === 0).length, n: gm.length };
  }
  return m;
}
// 두 판이 처음 갈린 날(세계 수준 — 인구 줄 · 곳간 곡물 줄 어느 하나라도)
function firstSplit(a, b) {
  if (!a.p || !b.p) return null;
  const n = Math.min(a.p.days.length, b.p.days.length);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < a.p.v.length; i++) {
      if (a.p.v[i].pop[k] !== b.p.v[i].pop[k] || a.p.v[i].grain[k] !== b.p.v[i].grain[k]) return { day: a.p.days[k], village: a.p.names[i] };
    }
  }
  return { day: null };
}

const OFF = load(dOff), ON = load(dOn), REP = dRep ? load(dRep) : null, REP2 = dRep2 ? load(dRep2) : null;
const seeds = Object.keys(OFF).filter((s) => ON[s]).map(Number).sort((a, b) => [1020, 7, 42].indexOf(a) - [1020, 7, 42].indexOf(b));
const cropReads = (() => { try { return /if \(!T100_FIELD_YIELD\) return SEED_FOOD_DAYS_LEGACY;/.test(fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8')) && process.env.T100_FIELD_YIELD !== '1'; } catch (e) { return null; } })();

console.log('\n=== T634 ⓑ 서버 판 붕괴 셋 — 끔(T594_CROP_CAL=0) ↔ 켬(기본) ===');
const rowsMd = [];
const Z = () => ({ e: 0, d: 0, vd: 0, dead: 0 });
const tot = { off: Z(), on: Z(), rep: Z(), rep2: Z() };
const verdict = [];
const M = {};   // 시드 → { a, b, r, r2 }
for (const s of seeds) {
  const a = measure(OFF[s]), b = measure(ON[s]), r = REP && REP[s] ? measure(REP[s]) : null, r2 = REP2 && REP2[s] ? measure(REP2[s]) : null;
  M[s] = { a, b, r, r2 };
  for (const [k, m] of [['off', a], ['on', b], ['rep', r], ['rep2', r2]]) if (m) { tot[k].e += m.empty.length; tot[k].d += m.dissolved.length; if (m.fw) { tot[k].vd += m.fw.vd; tot[k].dead += m.fw.dead; } }
  const line = (lab, m) => `| ${lab} | ${s} | ${m.days} | ${m.pop} | ${m.empty.length}${m.empty.length ? ' (' + m.empty.join('·') + ')' : ''} | ${m.dissolved.length}${m.dissolved.length ? ' (' + m.dissolved.join('·') + ')' : ''} | ${m.empty365.length} · ${m.diss365.length}`
    + ` | ${m.fw ? m.fw.vd : '—'} | ${m.fw ? m.fw.hungry.length : '—'} | ${m.fw ? m.fw.dead : '—'} | ${m.fw ? m.fw.allVD : '—'}`
    + ` | ${m.grain ? m.grain.p5 : '—'} | ${m.grain ? `${m.grain.min} (${m.grain.minAt})` : '—'} | ${m.grain ? m.grain.med : '—'} | ${m.grain ? m.grain.zero + '/' + m.grain.n : '—'} |`;
  rowsMd.push(line('끔', a), line('**켬**', b));
  if (r) rowsMd.push(line('끔 되풀이', r));
  if (r2) rowsMd.push(line('**켬 되풀이**', r2));
  // ③ 판정 — 카드 규칙: 켬(첫 판)이 끔(첫 판)보다 크면 빨강. 되풀이 판은 옆에 둔다(흔들림 폭).
  const sp = firstSplit(OFF[s], ON[s]), spR = r ? firstSplit(OFF[s], REP[s]) : null;
  const world = `세계: econ 이 작물 시계를 ${cropReads ? '안 읽는다(`T100_FIELD_YIELD` 끔 — 곳간에 닿는 밭 0)' : '읽는다(?)'} · 끔↔켬 첫 갈림 ${sp && sp.day != null ? `${sp.day}일(${fmt(sp.day)} · ${sp.village})` : '없음'}`
    + (spR ? ` · 끔↔끔 되풀이 첫 갈림 ${spR.day != null ? `${spR.day}일(${fmt(spR.day)} · ${spR.village})` : '없음'}` : '');
  const fact = (nm) => { const x = a.per[nm] || {}, y = b.per[nm] || {}; return `${nm}: 첫 기근 ${fmt(x.firstFamine)} → ${fmt(y.firstFamine)} · 12/1 곳간 곡물 ${x.grainW0 ?? '—'} → ${y.grainW0 ?? '—'} · 첫 겨울 인구 ${x.popW0 ?? '—'}→${x.popW1 ?? '—'} / ${y.popW0 ?? '—'}→${y.popW1 ?? '—'} · 첫 겨울 기근 ${x.fv ?? '—'} → ${y.fv ?? '—'}일`; };
  const band = (xs) => { const v = xs.filter((x) => x != null); return v.length ? (Math.min(...v) === Math.max(...v) ? `${v[0]}` : `${Math.min(...v)}~${Math.max(...v)}`) : '—'; };
  const chk = (lab, key, villages, also) => {
    const x = key(a), y = key(b), rx = r ? key(r) : null, ry = r2 ? key(r2) : null;
    const red = y > x;
    verdict.push(`${red ? '🔴 빨강' : '🟢'} 시드 ${s} ${lab} 끔 ${x} → 켬 ${y}` + (r || r2 ? ` (되풀이 — 끔 ${rx ?? '—'} · 켬 ${ry ?? '—'})` : ''));
    if (!red) return;
    for (const nm of villages) verdict.push(`   · ${fact(nm)}${also ? also(nm) : ''}`);
    verdict.push(`   · ${world}`);
    if (r || r2) {
      const offB = [x, rx], onB = [y, ry];
      const lo = (v) => Math.min(...v.filter((q) => q != null)), hi = (v) => Math.max(...v.filter((q) => q != null));
      const over = lo(onB) > hi(offB) ? '**켬 판 모두가 끔 판 모두보다 크다**' : (hi(onB) < lo(offB) ? '켬 판 모두가 끔 판 모두보다 작다' : '켬 범위가 끔 범위와 **겹친다**');
      verdict.push(`   · 폭: 끔 두 판 ${band(offB)} · 켬 ${r2 ? '두 판' : '한 판'} ${band(onB)} — ${over}`);
    }
  };
  const repHas = (field) => (nm) => { const hits = []; for (const [lab, D] of [['끔 되풀이', REP], ['켬 되풀이', REP2]]) { if (!D) continue; for (const s2 of seeds) if (D[s2] && measure(D[s2])[field].includes(nm)) hits.push(`${lab} ${s2}`); } return hits.length ? ` · 되풀이에서도 ${hits.join(' · ')}` : ' · 되풀이에선 안 그렇다'; };
  chk('빈 마을', (m) => m.empty.length, b.empty.filter((n) => !a.empty.includes(n)), repHas('empty'));
  chk('해체', (m) => m.dissolved.length, b.dissolved.filter((n) => !a.dissolved.includes(n)), repHas('dissolved'));
  if (a.fw && b.fw) chk('첫해 겨울 굶음(마을·일)', (m) => (m.fw ? m.fw.vd : null), Object.keys(b.per).filter((n) => (b.per[n].fv || 0) > ((a.per[n] || {}).fv || 0)).sort((p, q) => (b.per[q].fv - ((a.per[q] || {}).fv || 0)) - (b.per[p].fv - ((a.per[p] || {}).fv || 0))).slice(0, 5));
}
console.log('\n| 판 | 시드 | 일 | 인구 | 빈 마을 | 해체 | 첫해 빈·해체(≤365일) | 첫 겨울 기근 마을·일 | 굶은 마을 | 첫 겨울 굶어 죽음 | 판 내내 기근 마을·일 | 곳간 곡물 최저(12/1~) 마을 p5 | 가장 낮은 마을 | 가운데 | 0 에 닿은 마을 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const l of rowsMd) console.log(l);
const T = (k) => `${tot[k].e} · ${tot[k].d} · ${tot[k].vd} · ${tot[k].dead}`;
console.log(`\n합(시드 ${seeds.length} · 빈 마을 · 해체 · 첫 겨울 기근 마을·일 · 첫 겨울 굶어 죽음) — 끔 ${T('off')} → 켬 ${T('on')}${REP ? ` · 끔 되풀이 ${T('rep')}` : ''}${REP2 ? ` · 켬 되풀이 ${T('rep2')}` : ''}`);
if (REP && REP2) {
  const two = (k1, k2, f) => tot[k1][f] + tot[k2][f];
  console.log(`2×2(판 둘씩 합) — 빈 마을 끔 ${two('off', 'rep', 'e')} · 켬 ${two('on', 'rep2', 'e')} · 해체 끔 ${two('off', 'rep', 'd')} · 켬 ${two('on', 'rep2', 'd')} · 첫 겨울 기근 마을·일 끔 ${two('off', 'rep', 'vd')} · 켬 ${two('on', 'rep2', 'vd')} · 첫 겨울 굶어 죽음 끔 ${two('off', 'rep', 'dead')} · 켬 ${two('on', 'rep2', 'dead')}`);
}
console.log('\n③ 붕괴 판정 줄(카드 규칙 — 켬이 끔보다 크면 빨강 · 새 수 0 · 되풀이 판은 흔들림 폭으로 옆에)');
for (const v of verdict) console.log(v);
const reds = verdict.filter((v) => v.startsWith('🔴')).length;
console.log(`\n=== 빨강 ${reds} / 판정 ${verdict.filter((v) => /^(🔴|🟢)/.test(v)).length} ===`);
