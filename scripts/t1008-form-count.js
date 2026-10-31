#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1008 표 기계 · 판 관찰 JSON(`t956-war-probe`)만 읽는다 · 세계 안 만짐 · 판정 0)
// === scripts/t1008-form-count.js — 판 자 띠의 전쟁 꼴 셈: T956 ⓑ(맞붙은 채 춤) · T995 ⓒ(건물 칸 안 갇힌 방어 몸) · ⓓ(사거리 끝 한 대 돌격 되풀이) ===
//   node scripts/t1008-form-count.js <판 뿌리> [--json out.json]
//     판 뿌리 아래 `run-<갈래>[~raidN]/base-<시드>.t956.json`(관찰기 판 — T995 덤프와 같은 칸)
//   걸러 내는 글(꼴마다 기계 문턱 — 보고 T995 §1 · §3 의 덤프에서 그대로 옮긴 꼴 · 세계 수 아님):
//     교전 날 = 그날 `fight.steps > 0`
//     ⓑ 날 = 교전이 그날 몸 하루를 다 쓰고(`steps` = 하루 걸음 · 43,200) 걸음마다 접촉(`cSteps = steps`) · 대치 0 · 두 편 hp 그대로(그날 첫 표본 = 끝 표본) ·
//            맞선 두 몸 최소(`mcMin`) < 3.6m(T956 §2-3 의 3.44 ~ 3.53m 춤)
//     ⓒ 날 = 그날 맞선 두 몸(관찰기 `cen.pair` — 그날 첫 표본 · 그날 대치 순간의 앞 걸음 표본(`so[].before`) 어느 쪽이든)의 방어 몸이 건물 발자국 칸(`R`)에 서 있고 · 방어 편 제자리 몸(`still`) ≥ 1 이며 ·
//            그 몸이 움직이려는 상태다('adv' · 또는 'melee' 인데 두 몸 거리 > 그 병종 손 `reach` — battle-core UNITS 그대로 읽음)
//     ⓓ 날 = 그날 결단이 돌격(`post.op = 'assault'`)이고 · 접촉 ≥ 1 걸음 · 대치 ≥ 1 · 두 편 hp 그대로 · 맞선 두 몸 최소 ≥ 30m(사거리 끝 — 궁수 40m) ·
//            공 편에 탄(화살 + 돌 > 0 · 첫 표본)
//       ⓓ 되풀이 = 한 전쟁 안에서 이어진 ⓓ 날 둘 이상(날 차 1)
//   낸다: 판마다 시드마다 전쟁 · 교전 날 · ⓑ 날(전쟁) · ⓒ 날(전쟁) · ⓓ 날 · ⓓ 되풀이(묶음 · 가장 긴 묶음 날) · 꼴이 선 전쟁 목록(id:공→방:첫날~끝날)
//   ★[T1019] `--holder` — ⓒ′ 칸을 더한다: ⓒ 중 **지키는 쪽(holder = B)의 'adv'** 를 뺀 것(그 몸은 world.advance 가 null — 제자리가 제 뜻이다 ·
//     움직이려는데 막힌 몸만 남는다). 그 표본의 `holder` 칸(stepFight 앞 표본 · 관찰기 그대로)을 읽는다. 없을 땐 종전 표 그대로.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const D = process.argv[2];
if (!D) { console.error('쓰는 법: node scripts/t1008-form-count.js <판 뿌리> [--json out.json]'); process.exit(2); }
const JOUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const HOLDM = process.argv.includes('--holder');   // ★[T1019] ⓒ′(지키는 쪽 'adv' 뺀 ⓒ)
const SEEDS = [1020, 7, 42];
const UNITS = require(path.join(ROOT, 'sim', 'battle-core.js')).UNITS;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const hpSame = (a, b) => a && b && a.hp != null && b.hp != null && a.hp === b.hp;
function moveWant(e, d) {   // 움직이려는 상태인가 — 'adv' 는 늘 · 'melee' 는 손 밖일 때(사수의 물러섬 · 탄 없는 다가섬)
  if (!e) return false;
  if (e.st === 'adv') return true;
  if (e.st === 'melee') { const U = UNITS[e.ty]; return !!(U && d != null && d > U.reach); }
  return false;
}
function count(R) {
  const out = { wars: 0, fightDays: 0, b: { days: 0, wars: [] }, c: { days: 0, wars: [] }, c2: { days: 0, wars: [] }, d: { days: 0, runs: 0, longest: 0, wars: [] } };
  for (const o of Object.values(R.wars || {})) {
    out.wars++;
    const days = Object.keys(o.days || {}).map(Number).sort((a, b) => a - b);
    const soBy = new Map(); for (const z of (o.so || [])) { if (z && z.before && z.day != null) { const L = soBy.get(z.day) || []; L.push(z.before); soBy.set(z.day, L); } }   // 대치 앞 걸음 표본(그날)
    let nb = 0, nc = 0, nc2 = 0, dRun = 0, prevD = null, dRuns = 0, dLong = 0, nd = 0, f1 = null, f2 = null;
    for (const d of days) {
      const x = o.days[d], f = x.fight; if (!f || !(f.steps > 0)) { if (dRun) { if (dRun >= 2) dRuns++; dLong = Math.max(dLong, dRun); } dRun = 0; prevD = null; continue; }
      out.fightDays++;
      const fa = f.first || {}, la = f.last || {};
      const same = hpSame(fa.A, la.A) && hpSame(fa.B, la.B);
      //   ⓑ
      if (f.steps >= 43200 && f.cSteps === f.steps && !(f.so > 0) && same && f.mcMin != null && f.mcMin < 3.6) nb++;
      //   ⓒ
      let isC = false, isC2 = false;
      for (const sm of [fa, la, ...(soBy.get(d) || [])]) { const p = sm.cen && sm.cen.pair; if (!p || !p.e) continue;
        if (p.e.cell === 'R' && sm.B && sm.B.still >= 1 && moveWant(p.e, p.d)) { isC = true; if (!(p.e.st === 'adv' && sm.holder === 'B')) isC2 = true; } }   // ★[T1019] ⓒ′ = 지키는 쪽 'adv' 뺌
      if (isC) nc++;
      if (isC2) nc2++;
      //   ⓓ
      const post = x.post || {}, ammo = fa.A ? ((fa.A.ar | 0) + (fa.A.sn | 0)) : 0;
      const isD = post.op === 'assault' && f.cSteps >= 1 && f.so >= 1 && same && f.mcMin != null && f.mcMin >= 30 && ammo > 0;
      if (isD) { nd++; if (prevD != null && d === prevD + 1 && dRun) dRun++; else { if (dRun >= 2) dRuns++; dLong = Math.max(dLong, dRun); dRun = 1; } prevD = d; if (f1 == null) f1 = d; f2 = d; }
      else { if (dRun >= 2) dRuns++; dLong = Math.max(dLong, dRun); dRun = 0; prevD = null; }
    }
    if (dRun >= 2) dRuns++; dLong = Math.max(dLong, dRun);
    const tag = `${o.id}:${o.atk}→${o.def}:${o.first}~${o.end != null ? o.end : '끝까지'}`;
    if (nb) { out.b.days += nb; out.b.wars.push(`${tag}(${nb}날)`); }
    if (nc) { out.c.days += nc; out.c.wars.push(`${tag}(${nc}날)`); }
    if (nc2) { out.c2.days += nc2; out.c2.wars.push(`${tag}(${nc2}날)`); }
    if (nd) { out.d.days += nd; out.d.runs += dRuns; out.d.longest = Math.max(out.d.longest, dLong); out.d.wars.push(`${tag}(${nd}날 · 되풀이 ${dRuns} · ${f1}~${f2})`); }
  }
  return out;
}
const OUT = {};
const dirs = fs.readdirSync(D).filter((x) => /^run-/.test(x) && fs.statSync(path.join(D, x)).isDirectory()).sort();
console.log('\n## 판마다 시드마다 꼴 셈(관찰기 t956 · 판정 0)\n');
console.log('| 판 | 시드 | 전쟁 | 교전 날 | ⓑ 날(전쟁) | ⓒ 날(전쟁) |' + (HOLDM ? ' ⓒ′ 날(전쟁) |' : '') + ' ⓓ 날 | ⓓ 되풀이(묶음 · 가장 긴) | 꼴이 선 전쟁 |');
console.log('|---|---:|---:|---:|---:|---:|' + (HOLDM ? '---:|' : '') + '---:|---:|---|');
const SUM = {};
for (const x of dirs) { OUT[x] = {};
  const arm = x.slice(4).split('~')[0]; const S = SUM[arm] || (SUM[arm] = { runs: 0, wars: 0, fightDays: 0, b: 0, bw: 0, c: 0, cw: 0, c2: 0, c2w: 0, d: 0, dr: 0, dl: 0, miss: 0 });
  let any = false;
  for (const s of SEEDS) { const R = rd(path.join(D, x, `base-${s}.t956.json`)); if (!R) { OUT[x][s] = null; S.miss++; continue; } any = true;
    const c = count(R); OUT[x][s] = c;
    S.wars += c.wars; S.fightDays += c.fightDays; S.b += c.b.days; S.bw += c.b.wars.length; S.c += c.c.days; S.cw += c.c.wars.length; S.c2 += c.c2.days; S.c2w += c.c2.wars.length; S.d += c.d.days; S.dr += c.d.runs; S.dl = Math.max(S.dl, c.d.longest);
    const list = [...c.b.wars.map((w) => 'ⓑ ' + w), ...(HOLDM ? c.c2.wars.map((w) => 'ⓒ′ ' + w) : c.c.wars.map((w) => 'ⓒ ' + w)), ...c.d.wars.map((w) => 'ⓓ ' + w)].join(' · ') || '—';
    console.log(`| ${x.slice(4)} | ${s} | ${c.wars} | ${c.fightDays} | ${c.b.days}(${c.b.wars.length}) | ${c.c.days}(${c.c.wars.length}) |` + (HOLDM ? ` ${c.c2.days}(${c.c2.wars.length}) |` : '') + ` ${c.d.days} | ${c.d.runs} · ${c.d.longest} | ${list} |`); }
  if (any) S.runs++;
}
console.log('\n## 갈래마다 합(판 · 시드 다)\n');
console.log('| 갈래 | 판 | 전쟁 | 교전 날 | ⓑ 날(전쟁) | ⓒ 날(전쟁) |' + (HOLDM ? ' ⓒ′ 날(전쟁) |' : '') + ' ⓓ 날 | ⓓ 되풀이 묶음 · 가장 긴 | 관찰 JSON 없는 시드 |');
console.log('|---|---:|---:|---:|---:|---:|' + (HOLDM ? '---:|' : '') + '---:|---:|---:|');
for (const [arm, S] of Object.entries(SUM).sort()) console.log(`| ${arm} | ${S.runs} | ${S.wars} | ${S.fightDays} | ${S.b}(${S.bw}) | ${S.c}(${S.cw}) |` + (HOLDM ? ` ${S.c2}(${S.c2w}) |` : '') + ` ${S.d} | ${S.dr} · ${S.dl} | ${S.miss} |`);
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ per: OUT, sum: SUM }));
