#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T764 표 기계 · 판 JSON · 관찰자 JSON 만 읽는다 · 세계를 안 세운다)
// === scripts/t764-arms-table.js — 무기 반출 · 반납(T403) 끔 ↔ 켬 표 ==========
//   쓰는 법:
//     node scripts/t764-arms-table.js gate <끔 판 폴더> <켬 판 폴더> [--seeds 1020,7,42] [--json <경로>]   — 기준선 자(`server-baseline-check` 판 폴더 · `sbc-<시드>.json` + `.t764.json`)
//     node scripts/t764-arms-table.js war  <끔 폴더>:<태그> <켬 폴더>:<태그> [--seeds …] [--json <경로>]   — 전쟁 자(하루 10초 · `WAR_FIXTURE` · `<태그>-<시드>.json` + `.t764.json`)
//     node scripts/t764-arms-table.js real <.t764.json> [<.t764.json> …] [--json <경로>]                    — 실제 하루 판(T686 틀 · 몸 걸음 · 다시 뜸)
//   ★무기 칸(관찰자가 econ 날마다 적은 것): 곳간 `weapon` · 원정 짐(`w._arms` — 반출 · 지금 · 민병 · 반납) · 거울(`_warArmsOut`) · 몸 손의 무기 품목 수.
//   ★반납의 정본은 war-core 로그 줄이다(`귀환 — 무기 반납 a/b(민병 c)` — `warArmsReturn` 이 그날 쓴 수) — 관찰자 날 줄은 하루 마감 앞이라
//     귀환 날의 짐을 못 본다(전투 · 귀환이 그 뒤에 선다). 로그는 war-core 가 500줄까지만 싣는다(넘으면 "잘림").
//   ★몸 걸음: 병사 pid 마다 표본 사이 위치 차(px · 32px = 1m — `zone.js` "32px=1m") — 속도 문턱(관찰자 `T764_JUMP_PXS` · 기본 320px/s) 아래 = 걸음 · 위 = 튐.
//     지휘관 진척 `prog`/`len`(주둔 링 `campProg`) · 하루 몫 `pxPerDay`.
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const MODE = argv[0];
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = String(opt('--seeds', '1020,7,42')).split(',').map(Number);
const PXM = 32;
const rd = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const f = (x, d = 1) => (Number.isFinite(x) ? (Math.abs(x) >= 10000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d)) : '—');
const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? 100 * (a - b) / Math.abs(b) : NaN);
const EIGHT = [['pop', '인구', 0], ['dead', '소멸', 0], ['weapQ', '무기Q', 0], ['expand', '확장', 0], ['board', '게시', 0], ['toolQ', '도구Q', 1], ['preserve', '보존식', 1], ['grain', '생곡', 1]];
//   시드 규약(T252 — 3시드) — `t17-seeds.js` 의 함수를 소스 그대로 읽어 쓴다(사본 0)
const T17S = fs.readFileSync(path.join(__dirname, 't17-seeds.js'), 'utf8');
const fnSrc = (nm) => (T17S.match(new RegExp('function ' + nm + '\\(ds\\) \\{[\\s\\S]*?\\n\\}')) || [''])[0];
// eslint-disable-next-line no-new-func
const RULES = new Function(fnSrc('ruleT252') + '\nreturn { ruleT252 };')();
const RE_RET = /^D(\d+) (\S+) 귀환 — 무기 반납 ([\d.]+)\/(\d+)\(민병 (\d+)\)/;
const RE_REBOOT = /^D(\d+) (\S+) 다시 뜸 — 원정 짐 무기 ([\d.]+) 곳간에/;
const RE_BATTLE = /^D(\d+) 전투 (\S+) vs (\S+)\[[^\]]*\] → (공격승|방어승)/;

//   war-core 로그(500줄 상한)에서 반납 · 다시 뜸 · 전투
function logOf(pr) {
  const L = (pr && pr.log) || [];
  const ret = [], reboot = [], battle = [];
  for (const x of L) {
    let m = RE_RET.exec(x); if (m) { ret.push({ day: +m[1], vil: m[2], back: +m[3], out: +m[4], mil: +m[5] }); continue; }
    m = RE_REBOOT.exec(x); if (m) { reboot.push({ day: +m[1], vil: m[2], back: +m[3] }); continue; }
    m = RE_BATTLE.exec(x); if (m) battle.push({ day: +m[1], atk: m[2], def: m[3], atkWin: m[4] === '공격승' });
  }
  return { n: L.length, cut: L.length >= 500, ret, reboot, battle };
}
//   한 판의 무기 칸 요약
function armsOf(pr, fromDay) {
  if (!pr) return null;
  const L = pr.v.length ? pr.v[pr.v.length - 1] : null, ni = (pr.names || []).length;
  const sumCol = (row, c) => row.reduce((a, r) => a + (r && Number.isFinite(r[c]) ? r[c] : 0), 0);
  //   갈린 날(fromDay)부터 — 무기 생산(그날 몫의 합) · 봉헌검 매납(누계의 차) · 무기장(마을·날 평균) · 칸이 없는 옛 관찰자 판이면 null
  const has = !!(L && L.row[0] && L.row[0].length > 5);
  let prodW = null, rite = null, wsmith = null;
  if (has) {
    const k0 = Math.max(0, pr.days.findIndex((d) => d >= (fromDay == null ? -Infinity : fromDay)));
    prodW = 0; let ws = 0, wn = 0;
    for (let k = k0; k < pr.v.length; k++) { prodW += sumCol(pr.v[k].row, 5); ws += sumCol(pr.v[k].row, 7) + sumCol(pr.v[k].row, 8); wn++; }
    rite = sumCol(L.row, 6) - (k0 > 0 ? sumCol(pr.v[k0 - 1].row, 6) : 0); wsmith = wn ? ws / wn : null;
  }
  const wars = pr.wars || [], endDay = pr.days[pr.days.length - 1];
  let out = 0, mil = 0, force = 0, transit = 0, transitN = 0, gone = 0;
  for (const w of wars) {
    force += w.force || 0;
    if (w.arms0) { out += w.arms0.out; mil += w.arms0.militia; }
    const last = w.rows[w.rows.length - 1], a = last && last[4];
    if (last && last[0] === endDay) { if (a && !a[4]) { transit += a[1]; transitN++; } } else gone++;
  }
  const lg = logOf(pr);
  const retBack = lg.ret.reduce((s, r) => s + r.back, 0), retOut = lg.ret.reduce((s, r) => s + r.out, 0), retMil = lg.ret.reduce((s, r) => s + r.mil, 0);
  const ws = L && L.ws, B = pr.bodies || [];
  return { days: pr.days.length, end: endDay, wars: wars.length, armed: wars.filter((w) => w.arms0).length, force, out, mil, gone, transit, transitN,
    decl: ws ? ws[0] : null, battle: ws ? ws[1] : null, atkWin: ws ? ws[2] : null, defWin: ws ? ws[3] : null, active: ws ? ws[4] : null, withdraw: ws ? ws[5] : null,
    retN: lg.ret.length, retOut, retBack, retLost: retOut - retBack, retMil, rebootN: lg.reboot.length, rebootBack: lg.reboot.reduce((s, r) => s + r.back, 0), logN: lg.n, logCut: lg.cut,
    granEnd: L ? sumCol(L.row, 0) : null, mirrorEnd: L ? sumCol(L.row, 4) : null, draftEnd: L ? sumCol(L.row, 3) : null, ni,
    granPlus: L ? sumCol(L.row, 0) + transit : null, prodW, rite, wsmith,
    bodies: B.length, nMax: B.reduce((a, b) => a + (b.nMax != null ? b.nMax : Math.max(0, ...b.samples.map((x) => x[5]))), 0),
    walkers: B.reduce((a, b) => a + (b.walkers || 0), 0), walkM: B.reduce((a, b) => a + (b.walkSum || 0), 0) / PXM,
    jumpers: B.reduce((a, b) => a + (b.jumpers || 0), 0), jumpM: B.reduce((a, b) => a + (b.jumpSum || 0), 0) / PXM,
    hand: B.reduce((a, b) => Math.max(a, b.hand || 0), 0), boot: pr.boot || [] };
}
//   공격 마을(관찰자가 본 전쟁의 공격 마을) 곳간 무기 · 거울의 날 줄
function atkSeries(pr) {
  const atk = new Set((pr.wars || []).map((w) => w.atk)), idx = (pr.names || []).map((n, i) => (atk.has(n) ? i : -1)).filter((i) => i >= 0);
  return pr.v.map((r, k) => [pr.days[k], idx.reduce((a, i) => a + ((r.row[i] && r.row[i][0]) || 0), 0), idx.reduce((a, i) => a + ((r.row[i] && r.row[i][4]) || 0), 0)]);
}
function firstSplit(p0, p1) {
  const n = Math.min(p0.v.length, p1.v.length);
  for (let k = 0; k < n; k++) if (JSON.stringify(p0.v[k].row) !== JSON.stringify(p1.v[k].row)) return p0.days[k];
  return -1;
}
//   켬 판의 짐 항등 — 반출 = 반납 + 진 싸움에서 짐이 낸 몫(로그) · 판 끝 짐 = 거울
function ledgerCheck(a) { return { outEqRet: a.retOut, back: a.retBack, lost: a.retLost, transitEqMirror: Math.abs(a.transit - a.mirrorEnd) < 1e-6 }; }

const AR = [['wars', '선포(관찰자가 본 전쟁)'], ['battle', '끝난 전투(war-core 셈)'], ['atkWin', '  공격 승'], ['defWin', '  방어 승'], ['withdraw', '  철수'], ['gone', '귀환해 목록에서 빠진 전쟁'], ['active', '판 끝 진행 중'],
  ['force', '병력 합'], ['out', '반출 합(곳간 → 짐)'], ['mil', '민병 합(병력 − 반출 · 장부만)'],
  ['retN', '반납 줄(로그 · 귀환)'], ['retOut', '  그 전쟁들의 반출'], ['retBack', '  반납(곳간에 되돌림)'], ['retLost', '  진 싸움에서 짐이 낸 몫(반출 − 반납)'],
  ['transit', '판 끝 짐에 든 무기'], ['mirrorEnd', '판 끝 거울 합(`_warArmsOut`)'], ['granEnd', '판 끝 곳간 무기 합(51마을)'], ['granPlus', '판 끝 곳간 + 짐'],
  ['prodW', '갈린 날부터 무기 생산 합(세금 앞)'], ['rite', '갈린 날부터 봉헌검 매납 합'], ['wsmith', '갈린 날부터 대장장이 + 석공(마을 합 · 날 평균)'], ['draftEnd', '판 끝 징발 표 수'],
  ['bodies', '전쟁 몸'], ['nMax', '  병사 pid(몸마다 최대의 합)'], ['walkers', '  걸은 병사 몸'], ['walkM', '  걸은 거리 합(m)'], ['jumpers', '  튄 병사 몸'], ['jumpM', '  튄 거리 합(m)'], ['hand', '몸 손의 무기 품목(최대)'], ['logN', 'war-core 로그 줄(500 상한)']];
const DEC1 = new Set(['walkM', 'jumpM', 'transit', 'retBack', 'retLost', 'granEnd', 'mirrorEnd', 'granPlus', 'prodW', 'rite', 'wsmith']);

if (MODE === 'gate' || MODE === 'war') {
  const [d0, t0] = String(argv[1]).split(':'), [d1, t1] = String(argv[2]).split(':');
  const file = (d, t, s) => path.join(d, `${MODE === 'gate' ? 'sbc' : t}-${s}.json`);
  const rows = [];
  for (const s of SEEDS) {
    const r0 = rd(file(d0, t0, s)), r1 = rd(file(d1, t1, s)), p0 = rd(file(d0, t0, s) + '.t764.json'), p1 = rd(file(d1, t1, s) + '.t764.json');
    if (!r0 || !r1 || !p0 || !p1) { console.log(`  시드 ${s}: 판 없음`); continue; }
    const split = firstSplit(p0, p1);
    rows.push({ s, e0: r0.eight, e1: r1.eight, a0: armsOf(p0, split), a1: armsOf(p1, split), split, ser0: atkSeries(p0), ser1: atkSeries(p1), p0, p1 });
  }
  console.log(`\n=== ${MODE === 'gate' ? '기준선 자(400날 · 하루 250ms)' : '전쟁 자(하루 10초 · WAR_FIXTURE)'} — 끔 ↔ 켬(T403_ARMS_LEDGER=1) ===`);
  const R3 = rows.length === 3;
  console.log('| 여덟 수 | ' + rows.map((r) => `시드 ${r.s} 끔 → 켬`).join(' | ') + (R3 ? ' | 3시드 규약(T252) |' : ' |') + '\n|---|' + rows.map(() => '---').join('|') + (R3 ? '|---|' : '|'));
  const rule8 = {};
  for (const [k, nm, d] of EIGHT) {
    const ds = rows.map((r) => pct(r.e1[k], r.e0[k])).filter((x) => Number.isFinite(x));
    const ru = R3 && ds.length === 3 ? RULES.ruleT252(ds) : null; rule8[k] = ru;
    console.log(`| ${nm} | ` + rows.map((r) => { const a = r.e0[k], b = r.e1[k], dp = pct(b, a); return `${f(a, d)} → ${f(b, d)}${a !== b && Number.isFinite(dp) ? ` (${dp >= 0 ? '+' : ''}${dp.toFixed(1)}%)` : ''}`; }).join(' | ') + (R3 ? ` | ${ru ? `${ru.verdict}${ru.why ? ' — ' + ru.why.replace(/\|/g, '\\|') : ''}` : '—'}` : '') + ' |');
  }
  rows.rule8 = rule8;
  console.log('\n| 무기 칸 · 전쟁 | ' + rows.map((r) => `시드 ${r.s} 끔 → 켬`).join(' | ') + ' |\n|---|' + rows.map(() => '---').join('|') + '|');
  for (const [k, nm] of AR) console.log(`| ${nm} | ` + rows.map((r) => `${f(r.a0[k], DEC1.has(k) ? 1 : 0)} → ${f(r.a1[k], DEC1.has(k) ? 1 : 0)}${k === 'logN' && (r.a0.logCut || r.a1.logCut) ? ' (잘림)' : ''}`).join(' | ') + ' |');
  console.log('\n관찰자 칸이 처음 갈린 날(끔 ↔ 켬): ' + rows.map((r) => `${r.s} D${r.split}`).join(' / '));
  console.log('켬 짐 항등(판 끝 짐 = 거울): ' + rows.map((r) => `${r.s} ${ledgerCheck(r.a1).transitEqMirror ? '같음' : '다름'}`).join(' / '));
  if (MODE === 'war') {
    console.log('\n전쟁마다(켬 — 공격 → 방어 · 병력 · 반출 · 민병 · 선포 → 마지막 본 날 국면/작전 · 마지막 짐 [반출 · 지금 · 민병 · 반납 · 끝]):');
    for (const r of rows) for (const w of r.p1.wars) { const last = w.rows[w.rows.length - 1]; console.log(`  시드 ${r.s} W${w.id} ${w.atk}→${w.def} 병력 ${w.force} · 반출 ${w.arms0 ? w.arms0.out : '—'} · 민병 ${w.arms0 ? w.arms0.militia : '—'} · D${w.born}→D${last[0]} ${last[1]}/${last[2]} · 짐 ${last[4] ? JSON.stringify(last[4]) : '—'}`); }
    console.log('\n반납 줄(켬 — war-core 로그):');
    for (const r of rows) console.log(`  시드 ${r.s}: ` + logOf(r.p1).ret.map((x) => `D${x.day} ${x.vil} ${x.back}/${x.out}`).join(' · '));
  }
  const J = opt('--json', '');
  if (J) fs.writeFileSync(J, JSON.stringify({ rule8: rows.rule8, seeds: rows.map((r) => ({ s: r.s, e0: r.e0, e1: r.e1, a0: r.a0, a1: r.a1, split: r.split, ret1: logOf(r.p1).ret, ser0: r.ser0, ser1: r.ser1 })) }));
} else if (MODE === 'real') {
  const files = argv.slice(1).filter((x, i, A) => !x.startsWith('--') && A[i - 1] !== '--json');
  const P = files.map(rd), out = [];
  console.log('\n=== 실제 하루 판(T686 틀 · 하루 24분 · WAR_FIXTURE) — 무기 칸 · 전쟁 몸 걸음 · 다시 뜸 ===');
  console.log('| 판 | 손잡이 | econ 날 | 다시 뜸: 곳간 무기 앞 → 뒤 · 거울 앞 → 뒤(마을) | 전쟁 | 반출 · 민병 | 반납 줄 | 판 끝 짐 · 거울 | 판 끝 곳간 무기 합 |\n|---|---|---|---|---|---|---|---|---|');
  P.forEach((pr, i) => {
    const nm = path.basename(files[i]).replace('.t764.json', '');
    if (!pr) { console.log(`| ${nm} | 판 없음 |`); return; }
    const a = armsOf(pr), b0 = a.boot[0];
    console.log(`| ${nm} | ${pr.knobs.T403_ARMS_LEDGER || '끔'} | ${pr.days.length ? `D${pr.days[0]}~D${pr.days[pr.days.length - 1]}` : '—'} | ${b0 ? `${f(b0.pre[0])} → ${f(b0.post[0])} · ${f(b0.pre[1])}(${b0.pre[2]}) → ${f(b0.post[1])}(${b0.post[2]})` : '—'} | ${a.wars} | ${a.out} · ${a.mil} | ${a.retN}(${f(a.retBack)}/${a.retOut}) | ${f(a.transit)} · ${f(a.mirrorEnd)} | ${f(a.granEnd)} |`);
    out.push({ nm, knobs: pr.knobs, days: pr.days, a, wars: pr.wars, log: logOf(pr), bodies: pr.bodies || [] });
  });
  console.log('\n| 판 | 전쟁 몸 | 표본 | 국면/모드(처음 → 끝) | 병사 pid | 걸은 병사 몸 | 걸은 거리 합 · 몸 최대(m) | 튄 몸 · 튄 거리(m) | 지휘관 진척(처음 → 끝 m / 주둔 링 m / 길 m) | 하루 몫(m) | 몸 손 무기 품목 |\n|---|---|---|---|---|---|---|---|---|---|---|');
  P.forEach((pr, i) => {
    if (!pr) return;
    const nm = path.basename(files[i]).replace('.t764.json', '');
    for (const b of (pr.bodies || [])) {
      const s0 = b.samples[0], s1 = b.samples[b.samples.length - 1];
      console.log(`| ${nm} | W${b.id} ${b.atk}→${b.def} | ${b.samples.length} | ${s0 ? `${s0[2]}/${s0[3]}` : '—'} → ${s1 ? `${s1[2]}/${s1[3]}` : '—'} | ${b.nMax != null ? b.nMax : '—'} | ${b.walkers} | ${f(b.walkSum / PXM)} · ${f(b.walkMax / PXM)} | ${b.jumpers != null ? b.jumpers : '—'} · ${f((b.jumpSum || 0) / PXM)} | ${f(s0 && s0[4] / PXM)} → ${f(s1 && s1[4] / PXM)} / ${f(b.campProg / PXM)} / ${f(b.len / PXM)} | ${f(b.pxPerDay / PXM)} | ${b.hand} |`);
    }
    if (!(pr.bodies || []).length) console.log(`| ${nm} | 몸 0 |`);
  });
  console.log('\n전쟁마다(공격 → 방어 · 병력 · 짐 처음 [반출 · 지금 · 민병 · 반납 · 끝] · 날 줄 [날 · 국면 · 작전 · 도착 날 · 짐]):');
  P.forEach((pr, i) => { if (!pr) return; const nm = path.basename(files[i]).replace('.t764.json', '');
    for (const w of (pr.wars || [])) console.log(`  ${nm} W${w.id} ${w.atk}→${w.def} 병력 ${w.force} · 짐 ${w.arms0 ? JSON.stringify([w.arms0.out, w.arms0.weapon, w.arms0.militia, w.arms0.back, w.arms0.done ? 1 : 0]) : '—'} · ` + w.rows.map((r) => `[D${r[0]} ${r[1]} ${r[2] || '-'} eta${r[3]} ${r[4] ? JSON.stringify(r[4]) : '-'}]`).join(' ')); });
  console.log('\n로그 줄(반납 · 다시 뜸 · 전투):');
  out.forEach((o) => console.log(`  ${o.nm}: 반납 ${o.log.ret.map((x) => `D${x.day} ${x.vil} ${x.back}/${x.out}`).join(' · ') || '0'} | 다시 뜸 ${o.log.reboot.map((x) => `D${x.day} ${x.vil} ${x.back}`).join(' · ') || '0'} | 전투 ${o.log.battle.map((x) => `D${x.day} ${x.atk}→${x.def} ${x.atkWin ? '공승' : '방승'}`).join(' · ') || '0'} | 로그 ${o.log.n}줄${o.log.cut ? '(잘림)' : ''}`));
  const J = opt('--json', '');
  if (J) fs.writeFileSync(J, JSON.stringify(out.map((o) => ({ nm: o.nm, knobs: o.knobs, days: o.days, a: o.a, wars: o.wars, log: o.log, bodies: o.bodies.map((b) => Object.assign({}, b, { samples: b.samples.length > 200 ? b.samples.filter((x, k) => k % Math.ceil(b.samples.length / 200) === 0 || k === b.samples.length - 1) : b.samples })) }))));
} else {
  console.log('쓰는 법: gate <끔 폴더> <켬 폴더> | war <끔 폴더>:<태그> <켬 폴더>:<태그> | real <.t764.json> …');
}
