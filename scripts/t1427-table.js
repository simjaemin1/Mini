#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1427 표 · 계측 JSON 만 읽는다 · 판을 돌리거나 수를 제품에 되먹이지 않는다)
// === scripts/t1427-table.js — 옛 지도(main) ↔ 새 지도(큰 주석 둘) 같은 판 견주기 ==========
//   쓰는 법: node scripts/t1427-table.js <판 뿌리> <계측 폴더> [--json <비교.json>]
//     판 뿌리 = `<지도>-<꼴>-<팔>-<시드>/`(지도 old · new — `계측/T1427_2026-11-22/run27.sh`) · 계측 폴더 = 지도마다 t1407-table 요약(`요약-<지도>.json`)이 있는 곳
//   두 해 랩 수(캔 · 녹인 주석 · 동검 · 석검 : 동검 · 쥔 마을 · 청동 몫)는 `t1407-table.js` 요약 그대로(같은 정의 · 사본 0) ·
//   t17 여덟 수는 그 판 로그의 "여덟 수" 줄 그대로 · 마을 칸(사람 · 광부 · 대장장이 · 굶어 죽음 · 캔 주석 · 부은 청동)은 t1407 관찰기 마을 줄 ·
//   병기고 청동 몫(임업2 — T1407 회부 3)은 t1385 관찰기 마지막 꾸러미(근접검 · 청동 근접검).
const fs = require('fs'), path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const W = require(path.join(ROOT, 'server', 'weights.js'));
const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
const KG = { tin: W.kgOf('tin'), ore: W.kgOf('ore_tin') };
const SY = E.SMELT_YIELD != null ? E.SMELT_YIELD : E._SMELT_YIELD;
const [SRC, DST] = process.argv.slice(2);
if (!SRC || !DST) throw Error('쓰는 법: t1427-table.js <판 뿌리> <계측 폴더>');
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const read = (p) => { if (!fs.existsSync(p) && fs.existsSync(p + '.gz')) p += '.gz'; if (!fs.existsSync(p)) return null; const b = fs.readFileSync(p); return JSON.parse(p.endsWith('.gz') ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8')); };
const readTxt = (p) => { if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8'); if (fs.existsSync(p + '.gz')) return zlib.gunzipSync(fs.readFileSync(p + '.gz')).toString('utf8'); return null; };
const f0 = (x) => (x == null || !isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US'));
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(1));
const f2 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(2));
const SEEDS = ['1020', '7', '42'], MAPS = ['old', 'new'], ARMS = ['off', 'bundle'];
const MK = { old: '옛 지도', new: '새 지도' };
const done = fs.existsSync(path.join(SRC, 'done.txt')) ? fs.readFileSync(path.join(SRC, 'done.txt'), 'utf8') : '';
const isDone = (dir) => new RegExp(' ' + dir + ' rc=0 ').test(done);
const sum = {}; for (const m of MAPS) { const s = read(path.join(DST, `요약-${m}.json`)); sum[m] = Array.isArray(s) ? s : []; }
const S = (m, arm, seed) => sum[m].find((x) => x.kind === 'lab' && x.arm === arm && String(x.seed) === seed) || null;
const table = (h, rows) => '| ' + h.join(' | ') + ' |\n|' + h.map(() => '---').join('|') + '|\n' + rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
const three = (fn) => SEEDS.map((sd) => fn(sd)).join(' · ');
const out = [];
const J = { seeds: SEEDS, lab: {}, t17: {}, vil: {}, armory: {} };

// ① 두 해 랩 — 지도 × 팔
{
  const rows = [];
  for (const arm of ARMS) for (const m of MAPS) {
    const g = (fn) => three((sd) => { const s = S(m, arm, sd); return s ? fn(s) : '—'; });
    const tinPer = (s) => (s.tot.castBz > 0 ? s.tot.castTin * KG.tin / s.tot.castBz : null);
    const can = (s) => { const t = tinPer(s); return t ? s.tot.minedTin * SY * KG.tin * s.yr / t : null; };
    rows.push([`${arm === 'off' ? '끔' : '묶음'} · ${MK[m]}`,
      g((s) => f0(s.tot.minedTin * s.yr * KG.ore)), g((s) => f0(s.tot.smeltTin * s.yr * KG.tin)), g((s) => f0(s.tot.castBz * s.yr)),
      g((s) => f0(can(s))),
      g((s) => (s.probe && s.probe.bzMade > 0 ? f1(s.probe.stoneMade / s.probe.bzMade) : '—')),
      g((s) => (s.probe ? String(s.probe.holders) : '—')), g((s) => (s.probe && s.probe.holdBz != null ? f0(100 * s.probe.holdBz) + '%' : '—')),
      g((s) => (s.probe ? String(s.probe.half) : '—')),
      g((s) => f0(s.pop)), g((s) => String(s.emptyNames.length)), g((s) => f0(s.dead))]);
    for (const sd of SEEDS) { const s = S(m, arm, sd); if (!s) continue; (J.lab[`${m}-${arm}`] = J.lab[`${m}-${arm}`] || {})[sd] = {
      minedKg: s.tot.minedTin * s.yr * KG.ore, smeltKg: s.tot.smeltTin * s.yr * KG.tin, bz: s.tot.castBz * s.yr, can: can(s),
      stoneBz: s.probe && s.probe.bzMade > 0 ? s.probe.stoneMade / s.probe.bzMade : null, holders: s.probe ? s.probe.holders : null,
      holdBz: s.probe ? s.probe.holdBz : null, half: s.probe ? s.probe.half : null, pop: s.pop, empty: s.emptyNames, dead: s.dead }; }
  }
  out.push('### ① 두 해 랩(800날 · 시드 1020 · 7 · 42) — 옛 지도(main · 큰 주석 여섯) ↔ 새 지도(큰 주석 둘)\n');
  out.push(table(['판', '캔 주석 원석 kg/해', '녹인 주석 kg/해', '부은 동검 자루/해', '한 해 캔 주석으로 만들 수 있는 동검', '석검 : 동검(부은 것)', '쥔 마을 /51', '쥔 마을 병기고 청동 몫', '절반 넘는 마을', '인구', '빈 마을', '굶어 죽음'], rows));
  out.push(`한 해 = 판 날 수로 나눈 365날 몫 · kg = \`server/weights.js\`(주석 ${KG.tin} · 원석 ${KG.ore}) · 녹임 수율 ${SY} · 쥔 마을 · 청동 몫 = T1385 · T1398 · T1407 표의 그 정의(\`t1407-table.js\`).\n`);
}
// ② t17 여덟 수
{
  const rows = [];
  for (const m of MAPS) for (const sd of SEEDS) {
    const dir = `${m}-t17-off-${sd}`; if (!isDone(dir)) { rows.push([`${MK[m]} · ${sd}`, '(안 끝남)']); continue; }
    const log = readTxt(path.join(SRC, dir, 'run.log')) || '';
    const line = (log.match(/여덟 수\s+(.*)/) || [])[1] || '—';
    const t = read(path.join(SRC, dir, 't17.json'));
    J.t17[`${m}-${sd}`] = { line, base: t && t.base, vpop: t && t.vpop, fdDeadTot: t && t.fdDeadTot };
    rows.push([`${MK[m]} · ${sd}`, line.replace(/\s+$/, '')]);
  }
  out.push('### ② 랩 기준선 자 t17(800날 · 손잡이 없음) — 여덟 수\n');
  out.push(table(['판', '여덟 수'], rows));
}
// ③ 마을 칸 — 주석을 잃는 마을 셋 · 쥔 마을 둘
{
  const VIL = ['광산4', '어촌1', '어촌11', '광산5', '임업2'];
  const vrow = (m, arm, sd, name) => {
    const dir = `${m}-lab-${arm}-${sd}`; if (!isDone(dir)) return null;
    const r = read(path.join(SRC, dir, 't1407.json')); if (!r) return null;
    const C = (c) => r.vcols.indexOf(c), i = r.names.indexOf(name); if (i < 0) return null;
    const days = Object.keys(r.day).map(Number).sort((a, b) => a - b);
    let n = 0, mi = 0, sm = 0, mined = 0, bz = 0, maxN = 0, endN = null, dead = 0, crisis = 0;
    for (const d of days) { const row = r.day[d][i]; if (!row) continue; n++; mi += row[C('miner')] || 0; sm += row[C('smith')] || 0; mined += row[C('minedTin')] || 0; bz += row[C('castBz')] || 0; maxN = Math.max(maxN, row[C('N')] || 0); crisis += row[C('crisis')] || 0; dead = row[C('fdDead')] || 0; }
    const last = r.day[days[days.length - 1]][i]; endN = last ? last[C('N')] : 0;
    const yr = 365 / (days[days.length - 1] - days[0] + 1);
    // 주석 짐 줄(관찰기 교역 줄 — 주석 · 주석 원석): 낸 줄 · 받은 줄
    const L = (c) => r.lcols.indexOf(c); let tOut = 0, tIn = 0;
    for (const g of r.legs || []) { const res = g[L('res')]; if (res !== 'tin' && res !== 'ore_tin') continue; if (g[L('giver')] === name) tOut++; if (g[L('taker')] === name) tIn++; }
    return { endN, maxN, miner: n ? mi / n : 0, smith: n ? sm / n : 0, minedKgYr: mined * yr * KG.ore, bzYr: bz * yr, dead, crisisDays: crisis, tOut, tIn, mix: (r.deposits.find((x) => x[0] === name) || [])[3] || null };
  };
  const rows = [];
  for (const name of VIL) for (const arm of ARMS) {
    const cell = (m, fn) => three((sd) => { const v = vrow(m, arm, sd, name); return v ? fn(v) : '—'; });
    const both = (fn) => `${cell('old', fn)} → ${cell('new', fn)}`;
    rows.push([`${name} · ${arm === 'off' ? '끔' : '묶음'}`, both((v) => f0(v.endN)), both((v) => f1(v.miner)), both((v) => f1(v.smith)), both((v) => f0(v.minedKgYr)), both((v) => f0(v.bzYr)), both((v) => `${v.tOut}/${v.tIn}`), both((v) => f0(v.dead))]);
    for (const m of MAPS) for (const sd of SEEDS) { const v = vrow(m, arm, sd, name); if (v) ((J.vil[name] = J.vil[name] || {})[`${m}-${arm}`] = J.vil[name][`${m}-${arm}`] || {})[sd] = v; }
  }
  // t17(기준선 자) 그 마을 끝 사람
  for (const name of VIL) rows.push([`${name} · t17`, `${three((sd) => { const t = J.t17[`old-${sd}`]; const v = t && t.vpop && t.vpop.find((x) => x.name === name); return v ? f0(v.pop) : '—'; })} → ${three((sd) => { const t = J.t17[`new-${sd}`]; const v = t && t.vpop && t.vpop.find((x) => x.name === name); return v ? f0(v.pop) : '—'; })}`, '', '', '', '', '', '']);
  out.push('### ③ 마을 — 큰 주석을 잃는 셋(광산4 · 어촌1 · 어촌11) · 쥔 둘(광산5 · 임업2) — 옛 → 새(시드 1020 · 7 · 42)\n');
  out.push(table(['마을 · 팔', '끝 사람', '광부(날 평균)', '대장장이(날 평균)', '캔 주석 원석 kg/해', '부은 동검 자루/해', '주석 짐 줄(낸/받은 · 판 내내)', '굶어 죽음(누계)'], rows));
}
// ④ 병기고 청동 몫 — 임업2(T1407 회부 3 "병기고를 청동으로 다 채우는 문")
{
  const rows = [];
  for (const arm of ARMS) for (const m of MAPS) {
    rows.push([`${arm === 'off' ? '끔' : '묶음'} · ${MK[m]}`, three((sd) => {
      const dir = `${m}-lab-${arm}-${sd}`; if (!isDone(dir)) return '—';
      const p = read(path.join(SRC, dir, 'probe.json')); if (!p || !p.snaps) return '—';
      const sd2 = Object.keys(p.snaps).map(Number).sort((a, b) => a - b), last = p.snaps[sd2[sd2.length - 1]] || [];
      const v = last.find((x) => x[0] === '임업2'); if (!v) return '빔';
      (J.armory[`${m}-${arm}`] = J.armory[`${m}-${arm}`] || {})[sd] = { melee: v[2], bronze: v[3] };
      return `${f0(v[3])}/${f0(v[2])} = ${v[2] > 0 ? f0(100 * v[3] / v[2]) : '—'}%`;
    })]);
  }
  out.push('### ④ 임업2 병기고 — 청동 근접검 / 근접검(판 끝 꾸러미 · T1407 회부 3)\n');
  out.push(table(['판', '임업2 청동 / 근접검(시드 1020 · 7 · 42)'], rows));
}
process.stdout.write(out.join('\n'));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(J, null, 1) + '\n');
