#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1031 표 기계 · 판정 0)
// === scripts/t1031-table.js — 서버 판 전쟁(관찰기 t1031) ↔ 전쟁실험실 다시 치기(t1031-lab-replay) 잇기 → 표 · 축마다 갈림 ===
//   쓰는 법: node scripts/t1031-table.js --obs <a.t1031.json,b.t1031.json,…> --replay <replay.json> [--band <판 로그,…>] [--json out.json] [--md out.md]
//     --band — 같은 세계 다른 판(T837 갈림 대조 `DCTL_SKIP=raid:n` 등)의 존 로그 · 마지막 `전쟁 day N: 선포 …` 줄(누계: 선포 · 전투 · 공승/방승 · 사상)로 판-판 띠를 세운다
//   축(전쟁 하나 = 한 줄 · 랩은 그 전쟁의 첫 교전 훅에서 친 k 판 — 랩 전쟁은 첫 교전에서 결판이 난다: 랩 warResolveBattle 은 언제나 승자를 낸다):
//     사상(측마다 죽음 · 시작 대비 비율 · 교환비) · 승패 · 전투 길이(초 — 서버 = 맞붙은 걸음 ÷ 틱 Hz · 랩 = battle-core tick) ·
//     전쟁 길이(날 — 첫 교전 → 정산 · 랩 = 0) · 교전 수 · 궤주(정산 계기 · 궤주 중 산 몸) · 함락(무저항) · 포로(데려간 수)
//   띠: 전쟁마다 랩 k 판의 [최소, 최대] — 서버 값이 그 밖이면 "띠 밖". 판-판 띠는 --band 로.
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const OBS = String(opt('obs', '')).split(',').filter(Boolean);
const REP = opt('replay', '');
const BAND = String(opt('band', '')).split(',').filter(Boolean);
const JOUT = opt('json', ''), MOUT = opt('md', '');
const rp = REP ? JSON.parse(fs.readFileSync(REP, 'utf8')) : { runs: [] };
const med = (a) => { const b = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const mean = (a) => { const b = a.filter((x) => x != null && Number.isFinite(x)); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : null; };
const sum = (a) => a.filter((x) => x != null && Number.isFinite(x)).reduce((s, x) => s + x, 0);
const mn = (a) => { const b = a.filter((x) => x != null && Number.isFinite(x)); return b.length ? Math.min(...b) : null; };
const mx = (a) => { const b = a.filter((x) => x != null && Number.isFinite(x)); return b.length ? Math.max(...b) : null; };
const f1 = (x) => x == null ? '—' : (Math.round(x * 10) / 10).toString();
const f2 = (x) => x == null ? '—' : (Math.round(x * 100) / 100).toString();
const pc = (x) => x == null ? '—' : Math.round(x * 100) + '%';
const COMP_K = ['champion', 'greataxe', 'spear', 'pike', 'dagger', 'archer', 'slinger', 'militia'];
const KO = { champion: '청동', greataxe: '도끼', spear: '창방', pike: '장창', dagger: '석검', archer: '궁', slinger: '투석', militia: '민병' };
const tot = (c) => c ? COMP_K.reduce((a, k) => a + (+c[k] || 0), 0) : 0;
const cstr = (c) => { if (!c) return '—'; const s = COMP_K.filter((k) => c[k]).map((k) => KO[k] + (c[k] > 1 ? c[k] : '')).join('·'); return s || '0'; };
const tstr = (T) => { if (!T) return '—'; const o = {}; for (const [k, v] of Object.entries(T)) o[k] = typeof v === 'object' ? v.n : v; return cstr(o); };
const outside = (v, lo, hi) => (v == null || lo == null || hi == null) ? null : (v < lo || v > hi);

function endKind(o) {
  const s = o.set && o.set[0];
  if (s) return s.why;
  const L = (o.logs || []).join('\n');
  if (o.hook.length && o.hook.some((h) => h.took) && !(o.seg || []).length && o.end != null) return 'noArmy';   // 교전 훅이 받았는데 마디가 없다 = 공격 마을 몸 0(villages `_warEngage` noArmy → `_warNoArmy` 철수)
  if (/무저항 함락/.test(L)) return 'walkover-core';
  if (/무혈 항복/.test(L)) return 'surrender';
  if (/철수/.test(L)) return o.hook.length ? 'withdrawQuiet' : 'withdraw-noeng';
  if (o.end == null) return 'open';
  return 'none';
}
function warRow(o, hz, R) {
  const s = o.set && o.set[0];
  const res = (o.res || []).find((r) => r.path === 'body') || (o.res || [])[0] || null;
  const engS = sum((o.seg || []).map((g) => g.engSteps)) / (hz || 30);
  const durS = sum((o.seg || []).map((g) => g.dur));
  const h0 = o.hook[0] || null;
  const engDays = (h0 && s) ? s.day - h0.day : (h0 && o.end != null ? o.end - h0.day : null);
  const row = {
    id: o.id, atk: o.atk, def: o.def, den: o.den, casus: o.casus, born: o.born, arrive: o.arrive, eng0: h0 ? h0.day : null, end: o.end, kind: endKind(o),
    econA: o.comp, force: o.force, hooks: o.hook.length, segs: (o.seg || []).length, standoffs: (o.seg || []).filter((g) => g.end === 'standoff').length,
    aPop: h0 ? h0.aPop : null, dPop: h0 ? h0.dPop : null, J: h0 ? h0.J : null, dcs: (o.dcs || [])[0] || null,
    srv: s ? {
      why: s.why, winner: s.winner, A: s.types.A, B: s.types.B, aS: s.start.A, bS: s.start.B, aD: s.dead.A, bD: s.dead.B,
      rA: Object.values(s.types.A).reduce((a, v) => a + v.rout, 0), rB: Object.values(s.types.B).reduce((a, v) => a + v.rout, 0),
      engSec: Math.round(engS * 10) / 10, fightSec: Math.round(durS * 10) / 10, engDays, day: s.day,
      atkCas: res && res.ret ? res.ret.atkCas : null, defCas: res && res.ret ? res.ret.defCas : null, cap: res && res.cap ? res.cap.take : (res ? 0 : null), capN: res ? res.capN : null,
      world: s.world,
    } : null,
    engDays,
  };
  // 랩
  const rw = R ? R.wars.find((w) => w.id === o.id) : null;
  const L0 = rw && rw.hooks[0] ? rw.hooks[0].L : null;
  if (L0 && L0.runs) {
    const r = L0.runs;
    row.lab = { A: L0.A, B: L0.B, aS: r[0].aS, bS: r[0].dS, ex: L0.ex, k: r.length,
      winA: r.filter((x) => x.w === 'A').length / r.length,
      aD: med(r.map((x) => x.aD)), bD: med(r.map((x) => x.dD)), aDlo: mn(r.map((x) => x.aD)), aDhi: mx(r.map((x) => x.aD)), bDlo: mn(r.map((x) => x.dD)), bDhi: mx(r.map((x) => x.dD)),
      t: med(r.map((x) => x.t)), tlo: mn(r.map((x) => x.t)), thi: mx(r.map((x) => x.t)), capT: r.filter((x) => x.t > 120).length / r.length,
      rA: med(r.map((x) => x.rA)), rB: med(r.map((x) => x.rB)),
      cap: med(r.map((x) => x.cap ? x.cap.take : 0)), caplo: mn(r.map((x) => x.cap ? x.cap.take : 0)), caphi: mx(r.map((x) => x.cap ? x.cap.take : 0)) };
  } else if (L0 && L0.walkover) row.lab = { walkover: true };
  else if (L0 && L0.err) row.lab = { err: L0.err };
  if (rw && rw.B) {
    const r = rw.B.runs;
    row.labB = { A: rw.B.A, B: rw.B.B, winA: r.filter((x) => x.w === 'A').length / r.length, aD: med(r.map((x) => x.aD)), bD: med(r.map((x) => x.dD)),
      aDlo: mn(r.map((x) => x.aD)), aDhi: mx(r.map((x) => x.aD)), bDlo: mn(r.map((x) => x.dD)), bDhi: mx(r.map((x) => x.dD)),
      t: med(r.map((x) => x.t)), tlo: mn(r.map((x) => x.t)), thi: mx(r.map((x) => x.t)), capT: r.filter((x) => x.t > 120).length / r.length };
  }
  return row;
}
// 판 로그 마지막 전쟁 줄
function bandOf(logf) {
  // 존 하루 전쟁 요약 줄 — 글자만으로 찾는다(머리 기호로 안 가른다 · T84)
  let last = null; try { for (const ln of fs.readFileSync(logf, 'utf8').split('\n')) if (/전쟁 day \d+: 선포 \d+/.test(ln)) last = ln; } catch (e) { return null; }
  if (!last) return null;
  const m = /day (\d+): 선포 (\d+)\[[^\]]*\] 전투 (\d+)\(공승(\d+)\/방승(\d+)\) 사상 (\d+)/.exec(last);
  return m ? { file: logf, day: +m[1], decl: +m[2], battle: +m[3], atkWin: +m[4], defWin: +m[5], cas: +m[6] } : null;
}
const out = { made: new Date().toISOString().slice(0, 10), parity: rp.parity || null, pulled: rp.pulled || null, k: rp.k || null, seeds: [], band: [] };
const md = [];
const lab = (S) => S.seed + (S.cap == null || S.cap === 'Infinity' ? ' 몸∞' : '') + (S.lastDay != null && S.lastDay < 799 ? `(부분 ${S.lastDay}날)` : '');   // 판 자는 `VILLAGE_NPC_CAP=Infinity` 면 아이 env 에서 그 칸을 뺀다(t577 T864) — 관찰기가 적은 칸이 없으면 몸 상한 없음(운영 기본)
for (const f of OBS) {
  const O = JSON.parse(fs.readFileSync(f, 'utf8'));
  const R = rp.runs.find((r) => r.file === path.basename(path.dirname(f)) + '/' + path.basename(f) || r.file === path.basename(f));
  const rows = Object.values(O.wars).sort((a, b) => a.id - b.id).map((o) => warRow(o, O.tickHz, R));
  const logf = f.replace(/\.t1031\.json$/, '.log');
  const own = fs.existsSync(logf) ? bandOf(logf) : null;
  const war = rows.filter((r) => !r.den), den = rows.filter((r) => r.den);
  const fought = war.filter((r) => r.srv && r.srv.why === 'rout' || (r.srv && r.srv.why === 'withdraw'));
  const withLab = war.filter((r) => r.lab && r.lab.k);
  const kinds = {}; for (const r of war) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  const S = {
    seed: O.seed, file: path.basename(path.dirname(f)) + '/' + path.basename(f), cap: O.knob && O.knob.VILLAGE_NPC_CAP, errs: O.errs, err0: O.err0, hooked: O.hooked, lastDay: O.lastDay, own,
    wars: war.length, den: den.length, hooked1: war.filter((r) => r.hooks > 0).length, kinds,
    // 서버(몸 정산이 있는 전쟁 = 궤주 · 철수(교전 있음) — war-live settle 이 warResolveBattle 을 부른 것)
    srv: {
      n: fought.length, aS: sum(fought.map((r) => r.srv.aS)), bS: sum(fought.map((r) => r.srv.bS)), aD: sum(fought.map((r) => r.srv.aD)), bD: sum(fought.map((r) => r.srv.bD)),
      atkCas: sum(fought.map((r) => r.srv.atkCas)), defCas: sum(fought.map((r) => r.srv.defCas)), cap: sum(fought.map((r) => r.srv.cap)),
      winA: fought.length ? fought.filter((r) => r.srv.winner === 'A').length / fought.length : null,
      rout: fought.filter((r) => r.srv.why === 'rout').length, withdraw: fought.filter((r) => r.srv.why === 'withdraw').length,
      engSecMed: med(fought.map((r) => r.srv.engSec)), engSecMax: mx(fought.map((r) => r.srv.engSec)), fightSecMed: med(fought.map((r) => r.srv.fightSec)),
      engDaysMed: med(war.filter((r) => r.engDays != null).map((r) => r.engDays)), engDaysMax: mx(war.filter((r) => r.engDays != null).map((r) => r.engDays)),
      hooksMean: mean(war.filter((r) => r.hooks > 0).map((r) => r.hooks)), hooksMax: mx(war.map((r) => r.hooks)),
      walk: war.filter((r) => r.kind === 'walkover' || r.kind === 'walkover-core').length, surr: war.filter((r) => r.kind === 'surrender').length,
      bodies1: fought.filter((r) => r.srv.aS <= 1 && r.srv.bS <= 1).length,
    },
    lab: withLab.length ? {
      n: withLab.length, aS: sum(withLab.map((r) => r.lab.aS)), bS: sum(withLab.map((r) => r.lab.bS)), aD: sum(withLab.map((r) => r.lab.aD)), bD: sum(withLab.map((r) => r.lab.bD)),
      winA: mean(withLab.map((r) => r.lab.winA)), tMed: med(withLab.map((r) => r.lab.t)), tMax: mx(withLab.map((r) => r.lab.thi)), capT: mean(withLab.map((r) => r.lab.capT)),
      rA: sum(withLab.map((r) => r.lab.rA)), rB: sum(withLab.map((r) => r.lab.rB)), cap: sum(withLab.map((r) => r.lab.cap)), walk: war.filter((r) => r.lab && r.lab.walkover).length,
    } : null,
    // 몸 층 · 지형 층 셈(정산 전쟁 합) — 대치로만 끝난 돌격(교전 없음)의 풀림 · 방어 몸 · 세계 어댑터 답
    body: (() => {
      const q = war.filter((r) => r.kind === 'withdrawQuiet');
      const segs = q.flatMap((r) => (O.wars[r.id].seg || []));
      const W0 = { los: 0, losB: 0, blk: 0, blkB: 0, cov: 0, covB: 0, adv: 0, advN: 0 };
      for (const r of fought) if (r.srv.world) for (const k of Object.keys(W0)) W0[k] += r.srv.world[k] || 0;
      return { quiet: q.length, quietSegs: segs.length, quietNoRel: segs.filter((g) => g.rel == null).length, quietNoDef: segs.filter((g) => !g.typesAt0 || !Object.keys(g.typesAt0.B || {}).length).length,
        quietSecMed: med(segs.map((g) => g.dur)), routAlive: fought.filter((r) => r.srv.why === 'rout' && r.srv.aD + r.srv.bD === 0).length, routDeath: fought.filter((r) => r.srv.why === 'rout' && r.srv.aD + r.srv.bD > 0).length,
        world: W0, fightSecMed: med(fought.map((r) => r.srv.fightSec)) };
    })(),
    labB: (() => { const b = fought.filter((r) => r.labB); return b.length ? { n: b.length, aD: sum(b.map((r) => r.labB.aD)), bD: sum(b.map((r) => r.labB.bD)), winA: mean(b.map((r) => r.labB.winA)), tMed: med(b.map((r) => r.labB.t)), capT: mean(b.map((r) => r.labB.capT)), sameWin: b.filter((r) => (r.labB.winA >= 0.5) === (r.srv.winner === 'A')).length, inBandA: b.filter((r) => !outside(r.srv.aD, r.labB.aDlo, r.labB.aDhi)).length, inBandB: b.filter((r) => !outside(r.srv.bD, r.labB.bDlo, r.labB.bDhi)).length } : null; })(),
    rows,
  };
  // 축마다 띠 밖(전쟁마다 서버 값 ↔ 랩 L k 판 [최소, 최대] · 같은 전쟁 몸 정산 + 랩 L 둘 다 있는 것)
  const both = war.filter((r) => r.srv && (r.srv.why === 'rout' || r.srv.why === 'withdraw') && r.lab && r.lab.k);
  const ax = (name, fn) => { let o = 0, n = 0; for (const r of both) { const v = fn(r); if (v == null) continue; n++; if (v) o++; } return { axis: name, out: o, n }; };
  S.axes = [
    ax('공 사상(몸)', (r) => outside(r.srv.aD, r.lab.aDlo, r.lab.aDhi)),
    ax('방 사상(몸)', (r) => outside(r.srv.bD, r.lab.bDlo, r.lab.bDhi)),
    ax('공 사상 비율', (r) => outside(r.srv.aS ? r.srv.aD / r.srv.aS : null, r.lab.aS ? r.lab.aDlo / r.lab.aS : null, r.lab.aS ? r.lab.aDhi / r.lab.aS : null)),
    ax('방 사상 비율', (r) => outside(r.srv.bS ? r.srv.bD / r.srv.bS : null, r.lab.bS ? r.lab.bDlo / r.lab.bS : null, r.lab.bS ? r.lab.bDhi / r.lab.bS : null)),
    ax('전투 길이(초 · 전진 → 정산 ↔ 랩 tick — 둘 다 다가섬 포함)', (r) => outside(r.srv.fightSec, r.lab.tlo, r.lab.thi)),
    ax('  그중 서버가 긴 쪽', (r) => r.srv.fightSec > r.lab.thi),
    ax('맞붙은 초(참고 · 첫 접촉 뒤만 ↔ 랩 tick)', (r) => outside(r.srv.engSec, r.lab.tlo, r.lab.thi)),
    ax('전쟁 길이(날 · 첫 교전→정산 · 랩 0)', (r) => r.engDays == null ? null : r.engDays > 0),
    ax('교전 수(랩 1)', (r) => r.hooks > 1),
    ax('결말(승자)', (r) => r.lab.winA === 0 ? r.srv.winner !== 'B' : r.lab.winA === 1 ? r.srv.winner !== 'A' : false),
    ax('궤주(정산 계기 · 랩 궤주 결판 몫)', (r) => (r.srv.why === 'rout') !== (r.lab.capT < 0.5)),
    ax('포로', (r) => outside(r.srv.cap, r.lab.caplo, r.lab.caphi)),
  ];
  out.seeds.push(S);
}
for (const b of BAND) { const x = bandOf(b); if (x) out.band.push(x); }
// ── 글 ──
md.push('| 시드 | 전쟁(소굴) | 교전 훅 있는 전쟁 | 끝 꼴 | 몸 정산 전쟁 | 서버 몸 시작 공·방 | 서버 죽음 공·방 | econ 사상 공·방 | 서버 포로 | 서버 공승 | 랩 L 시작 공·방 | 랩 L 죽음 공·방(중앙 합) | 랩 L 포로 | 랩 L 공승 | 랩 B 죽음 공·방 |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const S of out.seeds) {
  const k = Object.entries(S.kinds).map(([a, b]) => a + ' ' + b).join(' · ');
  md.push(`| ${lab(S)} | ${S.wars}(${S.den}) | ${S.hooked1} | ${k} | ${S.srv.n} | ${S.srv.aS} · ${S.srv.bS} | ${S.srv.aD} · ${S.srv.bD} | ${S.srv.atkCas} · ${S.srv.defCas} | ${S.srv.cap} | ${pc(S.srv.winA)} | ${S.lab ? S.lab.aS + ' · ' + S.lab.bS : '—'} | ${S.lab ? f1(S.lab.aD) + ' · ' + f1(S.lab.bD) : '—'} | ${S.lab ? f1(S.lab.cap) : '—'} | ${S.lab ? pc(S.lab.winA) : '—'} | ${S.labB ? f1(S.labB.aD) + ' · ' + f1(S.labB.bD) : '—'} |`);
}
md.push('');
md.push('| 시드 | 서버 맞붙은 초(중앙 · 최대) | 서버 첫 교전→정산 날(중앙 · 최대) | 교전 훅/전쟁(평균 · 최대) | 정산 궤주 · 철수 | 무저항 함락 · 항복 | 랩 L 전투 초(중앙 · 최대) | 랩 L 120초 상한 결판 몫 | 랩 L 궤주 중 산 몸(공 · 방 합) | 랩 B 전투 초(중앙) | 랩 무저항(방어 주민<2) |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const S of out.seeds) {
  md.push(`| ${lab(S)} | ${f1(S.srv.engSecMed)} · ${f1(S.srv.engSecMax)} | ${f1(S.srv.engDaysMed)} · ${f1(S.srv.engDaysMax)} | ${f2(S.srv.hooksMean)} · ${S.srv.hooksMax} | ${S.srv.rout} · ${S.srv.withdraw} | ${S.srv.walk} · ${S.srv.surr} | ${S.lab ? f1(S.lab.tMed) + ' · ' + f1(S.lab.tMax) : '—'} | ${S.lab ? pc(S.lab.capT) : '—'} | ${S.lab ? S.lab.rA + ' · ' + S.lab.rB : '—'} | ${S.labB ? f1(S.labB.tMed) : '—'} | ${S.lab ? S.lab.walk : '—'} |`);
}
md.push('');
md.push('| 시드 | 교전 없이 철수(돌격 닿지 못함) 전쟁 · 그 마디 | 그 마디 중 공격 대형 안 풀림 · 방어 몸 없음 | 그 마디 길이(초 · 중앙) | 서버 정산 궤주 = 죽음 · 산 채 궤주 | 서버 전진→정산 초(중앙) | 시야 막힘/물음 | 몸 클램프/물음 | 엄폐/물음 | 랩 B 승자 같음 · 죽음 띠 안(공 · 방) |');
md.push('|---|---|---|---|---|---|---|---|---|---|');
for (const S of out.seeds) { const b = S.body, w = b.world; md.push(`| ${lab(S)} | ${b.quiet} · ${b.quietSegs} | ${b.quietNoRel} · ${b.quietNoDef} | ${f1(b.quietSecMed)} | ${b.routDeath} · ${b.routAlive} | ${f1(b.fightSecMed)} | ${w.losB}/${w.los} | ${w.blkB}/${w.blk} | ${w.covB}/${w.cov} | ${S.labB ? S.labB.sameWin + '/' + S.labB.n + ' · ' + S.labB.inBandA + ' · ' + S.labB.inBandB : '—'} |`); }
md.push('');
md.push('| 축(전쟁마다 서버 ↔ 랩 L k판 [최소, 최대]) | ' + out.seeds.map((S) => lab(S)).join(' | ') + ' |');
md.push('|---|' + out.seeds.map(() => '---').join('|') + '|');
const axN = out.seeds.length ? out.seeds[0].axes.map((a) => a.axis) : [];
for (let i = 0; i < axN.length; i++) md.push(`| ${axN[i]} | ` + out.seeds.map((S) => `${S.axes[i].out}/${S.axes[i].n}`).join(' | ') + ' |');
md.push('');
for (const S of out.seeds) {
  md.push(`#### 시드 ${lab(S)} — 전쟁마다`);
  md.push('| 전쟁 | 공 → 방 | 명분 | 선포 · 첫 교전 · 끝 | 끝 꼴 | econ 편성 공(병력) | 랩 L 편성 공 → 방 | 싸운 몸 공 → 방 | 서버 승 · 죽음 공·방 · 포로 | 서버 맞붙은 초 · 교전 훅 · 대치 | 랩 L 공승 · 죽음 공·방 중앙[최소~최대] · 초 중앙 · 포로 | 랩 B 공승 · 죽음 · 초 |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of S.rows) {
    const sv = r.srv ? `${r.srv.winner || '—'} · ${r.srv.aD}·${r.srv.bD} · ${r.srv.cap == null ? '—' : r.srv.cap}` : '—';
    const sl = r.srv ? `${f1(r.srv.engSec)} · ${r.hooks} · ${r.standoffs}` : `— · ${r.hooks} · ${r.standoffs}`;
    const L = r.lab ? (r.lab.walkover ? '무저항(주민<2)' : r.lab.err ? '오류' : `${pc(r.lab.winA)} · ${f1(r.lab.aD)}[${r.lab.aDlo}~${r.lab.aDhi}]·${f1(r.lab.bD)}[${r.lab.bDlo}~${r.lab.bDhi}] · ${f1(r.lab.t)} · ${f1(r.lab.cap)}`) : '—';
    const B = r.labB ? `${pc(r.labB.winA)} · ${f1(r.labB.aD)}·${f1(r.labB.bD)} · ${f1(r.labB.t)}` : '—';
    md.push(`| ${r.id}${r.den ? '(소굴)' : ''} | ${r.atk} → ${r.def} | ${r.casus || '—'} | ${r.born} · ${r.eng0 == null ? '—' : r.eng0} · ${r.end == null ? '(진행)' : r.end} | ${r.kind} | ${cstr(r.econA)}(${r.force}) | ${r.lab && r.lab.A ? cstr(r.lab.A) + ' → ' + cstr(r.lab.B) : '—'} | ${r.srv ? tstr(r.srv.A) + ' → ' + tstr(r.srv.B) : '—'} | ${sv} | ${sl} | ${L} | ${B} |`);
  }
  md.push('');
}
if (out.band.length) {
  md.push('| 판(존 로그) | 날 | 선포 | 전투 | 공승 · 방승 | 사상 |'); md.push('|---|---|---|---|---|---|');
  for (const b of out.band) md.push(`| ${b.file.split('/').slice(-2).join('/')} | ${b.day} | ${b.decl} | ${b.battle} | ${b.atkWin} · ${b.defWin} | ${b.cas} |`);
}
const text = md.join('\n');
if (MOUT) fs.writeFileSync(MOUT, text + '\n');
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 0));
console.log(text);
