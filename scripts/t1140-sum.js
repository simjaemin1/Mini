#!/usr/bin/env node
// === scripts/t1140-sum.js — T1140 판 표(러너 밖 · 계측기) — `t646-anatomy table` 의 table.json 을 사람당 µs 표로 =========================
//   판 하나 = `t646-anatomy run inf <tag> --seg --lines --ref <커밋>`(구간 시계 혼자 판 · V8 표본 250 µs · 낮 · 밤 창).
//   칸(µs/사람 · 창마다):
//     사람당 전체 = 틱 본문(구간 사슬 합) ÷ 몸 · 결정 문 = 구간 '결정 문(순회)' · 이동 문 = 구간 '이동 문(순회)'
//     npcStep = 결정 문 × (npcStep 표본 ÷ 결정 문 고리 표본)(T677 · T791 환산) · 몸통 자기 = npcStep × 몸통 자기 표본 몫
//     결정 · 생활 층 · 길 묻기 · A* = npcStep × (그 함수가 사슬에 있는 표본 ÷ npcStep 표본)(포함 · 인라인된 함수는 부른 쪽에 묻힌다)
//     틱 p50 · p99 = 조각마다 구간 시계 틱 본문 분위의 중앙(ms) · 0.3 까지 남은 몫 = npcStep − 0.3
//   팔 = tag 의 머리 글자(H 오늘 main · O 10-18 · K 깎기 셋 켬 · M… 이분 점) — 팔마다 판 중앙 · 범위.
// 실행: T646_DIR=<판 폴더> node scripts/t1140-sum.js [out.json] [out.txt]
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const fs = require('fs');
const path = require('path');
const DIR = process.env.T646_DIR || '/tmp/t646';
const T = JSON.parse(fs.readFileSync(path.join(DIR, 'table.json'), 'utf8'));
const med = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); const n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; };
const r3 = (x) => (x == null ? null : +x.toFixed(3));
// 첫 짚기 줄 셋(그 판 글자의 줄 번호) — 막힘 서 있음 판정(`detectStuck` · 켬이면 `_t1140Detect`) · 결정 문 · 도착 뒤 첫 줄
const { execFileSync } = require('child_process');
const _src = {}; const srcOf = (ref) => _src[ref] || (_src[ref] = execFileSync('git', ['show', `${ref}:server/zone.js`], { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n'));
function hotLines(ref) {
  const L = srcOf(ref), find = (fn, pre) => { const i = L.findIndex((x) => x.startsWith(`function ${fn}(`)); if (i < 0) return []; for (let j = i; j < Math.min(L.length, i + 260); j++) if (L[j].startsWith(pre)) return [j + 1]; return []; };
  return { stuck: [...find('detectStuck', '      && (!npc.path || npc.pathIndex >= '), ...find('_t1140Detect', '      && (!npc.path || npc.pathIndex >= '), ...find('_t1145Detect', '      && (!npc.path || npc.pathIndex >= ')],   // ★[T1145] 켬이면 `_t1145Detect`
    gate: find('npcStep', '  if (!(T670_SKIP_IDLE && !npc.canadiaVillage'), arrive: find('npcStep', "    if (npc.behavior === 'gather' && npc.gatherTarget)").length ? find('npcStep', "    if (npc.behavior === 'gather' && npc.gatherTarget)") : [] };
}
// 대조 = 손 안 댄 구간 합 · 비 = npcStep ÷ 대조(상자 흐름 보정)
const CTRL = ['몹 AI', '델타·방송(AOI)', '꼬리(어로·저장·쓰러짐·계측)', '계단·낙하·게이지·HP', '청크', '공간 색인·입력 시한'];   // ★대조 구간(T780 회부 2 읽기)
const rows = [];
for (const r of T.runs) {
  const L = r.lines || {}, inc = Object.fromEntries((L.incl || []).map(([k, n]) => [k, n])), ns = L.stepSamples || 0;
  const u = (k) => (ns && inc[k] ? L.stepUs * inc[k] / ns : 0);
  const reqN = Object.entries(inc).filter(([k]) => /^(require|wrapModuleLoad)@/.test(k)).reduce((m, [, n]) => Math.max(m, n), 0);
  rows.push({ tag: r.tag, arm: /^[MR]/.test(r.tag) ? r.tag : r.tag.replace(/\d+$/, ''),   // M · R 은 판 하나짜리 점(이분 · 손잡이 탐침)
    ref: r.ref, W: r.W, pop: r.pop, ticks: r.ticks,
    totUs: r.totUs, decGate: r.segUs['결정 문(순회)'], moveGate: r.segUs['이동 문(순회)'], walkPre: r.segUs['화살·걸음 커널 준비'],
    npcStep: r3(L.stepUs), self: r3(L.selfUs), dec: r3(u('decideNpcBehavior@zone.js')), life: r3(u('npcLifeTick@villages.js')),
    path: r3(u('computeNpcPath@zone.js')), astar: r3(u('findPath@pathfind.js')), stuck: r3(u('detectStuck@zone.js')),
    req: r3(ns ? L.stepUs * reqN / ns : 0),
    ...(() => { const H = hotLines(r.ref), S = new Map((L.selfAll || []).map(([ln, n, us]) => [ln, us])), sum = (a) => r3(a.reduce((t, ln) => t + (S.get(ln) || 0), 0));
      return { lnStuck: r3(sum(H.stuck) + u('detectStuck@zone.js') + u('_t1140Detect@zone.js') + u('_t1145Detect@zone.js')), lnGate: sum(H.gate), lnArrive: sum(H.arrive), lines3: H }; })(),   // 막힘 = 인라인된 줄 + 안 인라인된 판의 부름(포함)
    p50: r.tq ? r3(r.tq.p50) : null, p95: r.tq ? r3(r.tq.p95) : null, p99: r.tq ? r3(r.tq.p99) : null, perfP50: r.tickP50, perfP95: r.tickP95,
    rem: L.stepUs != null ? r3(L.stepUs - 0.3) : null,
    pre: r.pre ? r3(r.pre.stepUs) : null, nsDec: L.decSamples ? r3(L.stepSamples / L.decSamples) : null, flags: (r.flags || []).slice(), sliceLines: r.sliceLines || null,   // ★[T1219] 밤 닫힘 앞 · 환산 비 · 자가 표시
    live: r.live ? r3(r.live.stepUs) : null, dead: r.live ? r.live.dead : null, sliceDec: r.sliceDec || null,   // ★[T1219 ⓑ'] 결정 표본이 빠진 조각 뺀 셈
    ctrl: r3(CTRL.reduce((t, k) => t + (r.segUs[k] || 0), 0)), ratio: r3(L.stepUs / CTRL.reduce((t, k) => t + (r.segUs[k] || 0), 0)), samples: ns, chunks: L.chunks, reqBy: L.reqBy || null, groups: L.groups || null, selfTop: (L.selfTop || []).slice(0, 8) });
}
//   ★[T1219] 자가 표시(상대) — 같은 창 판들의 환산 비(npcStep 표본 ÷ 결정 표본) 중앙보다 0.07 넘게 크면 '결정표본?'(고리 틀이 표본에서 빠지기 시작한 판)
for (const W of ['day', 'night']) { const xs = rows.filter((x) => x.W === W && x.nsDec != null), m = med(xs.map((x) => x.nsDec)); for (const x of xs) if (m != null && x.nsDec > m + 0.07 && !x.flags.includes('결정표본')) x.flags.push('결정표본?'); }
const COLS = ['npcStep', 'live', 'pre', 'nsDec', 'rem', 'totUs', 'moveGate', 'decGate', 'dec', 'life', 'path', 'astar', 'self', 'lnStuck', 'lnGate', 'lnArrive', 'req', 'p50', 'p99', 'ctrl', 'ratio'];
const arms = {};
for (const x of rows) { const k = x.arm + '|' + x.W; (arms[k] = arms[k] || []).push(x); }
const armRows = Object.entries(arms).map(([k, xs]) => { const [arm, W] = k.split('|'); const o = { arm, W, n: xs.length, tags: xs.map((x) => x.tag) };
  for (const c of COLS) { const v = xs.map((x) => x[c]); o[c] = r3(med(v)); { const vv = v.filter((y) => y != null); o[c + 'Lo'] = vv.length ? r3(Math.min(...vv)) : null; o[c + 'Hi'] = vv.length ? r3(Math.max(...vv)) : null; } } return o; });
const out = { at: new Date().toISOString(), dir: DIR, rule: 'inf · --seg --lines · 구간 시계 혼자 판 · 틀 tpl-t100(오늘 main 200날)', rows, arms: armRows };
const pad = (s, n) => String(s == null ? '—' : s).padStart(n);
let txt = '판 · 창 · ' + COLS.join(' · ') + ' (µs/사람 · p50/p99 ms)\n';
for (const x of rows.sort((a, b) => (a.tag + a.W).localeCompare(b.tag + b.W))) txt += pad(x.tag, 4) + pad(x.W, 6) + COLS.map((c) => pad(x[c], 8)).join('') + '\n';
{ const fl = rows.filter((x) => x.flags && x.flags.length); txt += '\n자가 표시(T1219) — 줄맞춤 = 조각마다 [T646] 줄 수가 1 이 아님(밤 = 하루 닫힘 조각) · 결정표본 = 환산 비 ≥ 0.86 · 결정표본? = 같은 창 중앙 + 0.07 넘음 · 결정표본 빠짐 = 결정 표본 0 인 조각이 있음(live = 그 조각 뺀 npcStep) · pre = 밤 닫힘 앞 조각만 다시 센 npcStep\n';
  txt += fl.length ? fl.map((x) => `  ${x.tag} ${x.W} — ${x.flags.join(' · ')} · 조각 줄 ${JSON.stringify(x.sliceLines)} · 환산 비 ${x.nsDec}${x.dead ? ' · 결정 표본 0 조각 ' + JSON.stringify(x.dead) + ' · 조각 결정 표본 ' + JSON.stringify(x.sliceDec) + ' · live ' + x.live : ''}${x.pre != null ? ' · pre ' + x.pre : ''}`).join('\n') + '\n' : '  (없음)\n'; }
txt += '\n팔 중앙(범위)\n';
for (const a of armRows.sort((p, q) => (p.arm + p.W).localeCompare(q.arm + q.W))) txt += pad(a.arm, 4) + pad(a.W, 6) + ' n' + a.n + ' ' + COLS.map((c) => `${c} ${a[c]}[${a[c + 'Lo']}~${a[c + 'Hi']}]`).join(' · ') + '\n';
// 마크다운 표(보고에 붙인다) — 팔마다 중앙 [범위]
const NAME = { live: '└ npcStep 결정 표본 선 조각만(T1219)', pre: '└ npcStep 밤 닫힘 앞(T1219)', nsDec: 'npcStep 표본 ÷ 결정 표본', npcStep: '`npcStep`', rem: '0.3 까지 남은 몫', totUs: '사람당 전체', moveGate: '이동 문', decGate: '결정 문', dec: '└ 결정(포함)', life: '└ └ 생활 층', path: '└ 길 묻기(`computeNpcPath`)', astar: '└ └ A*(`findPath`)', self: '└ 걸음 몸통 자기', lnStuck: '└ └ 막힘 서 있음 판정(줄 · 안 인라인이면 부름)', lnGate: '└ └ 결정 문 줄', lnArrive: '└ └ 도착 뒤 첫 줄', req: '└ require()', p50: '틱 p50 ms', p99: '틱 p99 ms', ctrl: '대조(손 안 댄 구간 합)', ratio: '`npcStep` ÷ 대조' };
const cell = (a, c) => (a ? (a.n > 1 ? `${a[c]} [${a[c + 'Lo']}~${a[c + 'Hi']}]` : `${a[c]}`) : '—');
function md(armList) {
  const A = (arm, W) => armRows.find((x) => x.arm === arm && x.W === W);
  let t = '| µs/사람 | ' + armList.map((a) => `${a} 낮 | ${a} 밤`).join(' | ') + ' |\n|---|' + armList.map(() => '---:|---:').join('|') + '|\n';
  for (const c of COLS) t += `| ${NAME[c]} | ` + armList.map((a) => `${cell(A(a, 'day'), c)} | ${cell(A(a, 'night'), c)}`).join(' | ') + ' |\n';
  return t;
}
const has = (a) => armRows.some((x) => x.arm === a);
out.md = { H: md(['H']), OHM: md(['O', 'M2', 'M1', 'H'].filter(has)), HK: md(['H', 'K']), HR: md(['H', 'R1'].filter(has)) };
if (process.argv[4]) fs.writeFileSync(process.argv[4], '## H\n' + out.md.H + '\n## O M H\n' + out.md.OHM + '\n## H K\n' + out.md.HK + '\n## H R\n' + out.md.HR);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
if (process.argv[3]) fs.writeFileSync(process.argv[3], txt);
console.log(txt);
