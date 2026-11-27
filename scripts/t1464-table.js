#!/usr/bin/env node
// T1464 — 전투 코어 전수 표(판 자 `scripts/t1464-battle-sweep.js` 의 칸 csv 만 읽는다 · 손으로 센 칸 0).
//   node scripts/t1464-table.js --dir 계측/T1464/main [--json]
'use strict';
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const DIR = path.resolve(arg('--dir', path.join(__dirname, '..', '계측', 'T1464', 'main')));

function readCsv(f) {
  const L = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean); const H = L[0].split(',');
  return L.slice(1).map((l) => { const o = {}; const v = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { v.push(cur); cur = ''; } else cur += ch; }
    v.push(cur); H.forEach((k, i) => { const x = v[i]; o[k] = x === '' || x == null ? null : (isNaN(+x) || k === 'key' || k === 'A' || k === 'B' || k === 'openWhy' || k === 'digest' || k === 'g' ? x : +x); }); return o; });
}
const rows = []; for (const f of fs.readdirSync(DIR).filter((f) => /^g\d+\.csv$/.test(f)).sort()) rows.push(...readCsv(path.join(DIR, f)));
const by = (g) => rows.filter((r) => r.g === g);
const T8 = ['militia', 'dagger', 'spear', 'pike', 'greataxe', 'champion', 'archer', 'slinger'];
const KO = { militia: '민병', dagger: '석검', spear: '창', pike: '장창', greataxe: '도끼', champion: '정예', archer: '궁', slinger: '투석' };
const M5 = ['militia', 'dagger', 'spear', 'pike', 'greataxe'];
const FORMS = ['line', 'wall', 'open', 'column', 'circle'];
const FKO = { line: '선형', wall: '방패벽', open: '산개', column: '종대', circle: '원형' };
const MRLS = [0.4, 0.55, 0.7, 0.85, 1];
const ko = (s) => s.replace(/([a-z]+)(\d+)/g, (m, t, n) => (KO[t] || t) + ' ' + n).replace(/\+/g, ' + ').replace(/@(\w+)/, (m, f) => ' · ' + (FKO[f] || f));
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const wmean = (a, w) => { let s = 0, n = 0; a.forEach((x, i) => { if (x != null) { s += x * w[i]; n += w[i]; } }); return n ? s / n : null; };
const f1 = (x) => (x == null ? '—' : (+x).toFixed(1));
const find = (g, A, B, extra) => rows.find((r) => r.g === g && r.A === A && r.B === B && (!extra || Object.keys(extra).every((k) => r[k] === extra[k])));

const L = [];
const all = rows.filter((r) => r.g !== 'g8' && r.g !== 'g9');   // 본판(자리 꼴 · 서버 틱 견줌판 뺌)
const nB = rows.reduce((s, r) => s + r.n, 0);
L.push('# T1464 전투 코어 전수 표 — 판 자 csv 만 읽는다(`node scripts/t1464-table.js`)', '');
L.push(`· 칸 ${rows.length}(본판 ${all.length} · 자리 꼴 견줌 ${by('g8').length} · 서버 틱 견줌 ${by('g9').length}) · 판 ${nB}`);
L.push('· 끝: 한 편의 안 달아난 산 몸이 0 이 된 때가 **결판**(코어 `judge` 의 결판 줄 · 120초 줄은 안 씀). 그 뒤 진 편의 산 몸이 모두 죽거나, 달아나 안 달아난 적이 25 m 안에 없을 때까지 더 돌린다(**추격 꼬리**) — 표의 죽음 · 달아나 삶은 이 끝의 수다.');
L.push('· **들판 끝 꼴**(따로 칸): 위 끝 뒤에도 진 편이 다 죽거나 상한까지 그대로 돌린 수. 어댑터 없는 독립 실행은 달아난 몸이 x = −40 · 170 에서 맴돌고 이긴 편이 적 무게중심으로 걸어가 거기서 죽인다.');
L.push('· 상한 600 게임초 · 씨 1 … n · dt 0.05(전투실험실) — 서버 존 틱 1/30 은 g9 로 견줌.', '');

// ① 상성 8 × 8 (수 20)
L.push('## ① 병종 상성 8 × 8 — 수 20 ↔ 20 · A(줄) 이긴 % (칸 100판)', '');
L.push('| A ＼ B | ' + T8.map((t) => KO[t]).join(' | ') + ' |', '|---|' + T8.map(() => '---:').join('|') + '|');
for (const a of T8) L.push(`| **${KO[a]}** | ` + T8.map((b) => { const r = find('g1', a + 20, b + 20); return r ? f1(r.winA) : '—'; }).join(' | ') + ' |');
L.push('', '진 편 죽음 % (수 20 · 같은 칸)', '', '| A ＼ B | ' + T8.map((t) => KO[t]).join(' | ') + ' |', '|---|' + T8.map(() => '---:').join('|') + '|');
for (const a of T8) L.push(`| **${KO[a]}** | ` + T8.map((b) => { const r = find('g1', a + 20, b + 20); return r ? f1(r.loserDead) : '—'; }).join(' | ') + ' |');

// ② 수가 작을 때
const SZ = [1, 2, 3, 5, 10, 20, 40];
L.push('', '## ② 수가 작을수록 무엇이 달라지나 — 같은 수 맞대결(g1) · 64 짝의 가운데', '');
L.push('| 수 | 진 편 죽음 % | 결판 때 진 편 죽음 % | 들판 끝 꼴 진 편 죽음 % | 이긴 편 죽음 % | 붙기 전 달아난 판 % | 달아나기 시작(치던 중 · 안 치던 중) | 다시 돌아섬 | 달아난 몸이 쫓겨 죽은 % | 싸움 길이 가운데(초) | 첫 대 → 첫 죽음(초) |', '|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|');
for (const k of SZ) { const R = by('g1').filter((r) => r.A.endsWith('' + k) && r.A.replace(/\D/g, '') === '' + k);
  L.push(`| ${k} | ${f1(med(R.map((r) => r.loserDead)))} | ${f1(med(R.map((r) => r.loserDeadAtDec)))} | ${f1(med(R.map((r) => r.loserDeadEdge)))} | ${f1(med(R.map((r) => r.winnerDead)))} | ${f1(med(R.map((r) => r.preContactRout)))} | ${f1(med(R.map((r) => r.routFight)))} · ${f1(med(R.map((r) => r.routIdle)))} | ${f1(med(R.map((r) => r.rally)))} | ${f1(med(R.map((r) => r.chasedShare)))} | ${f1(med(R.map((r) => r.lenMed)))} | ${f1(med(R.map((r) => r.hitToDeathMed)))} |`); }
const flips = [];
for (const a of T8) for (const b of T8) { if (a >= b) continue; const big = find('g1', a + 20, b + 20); if (!big) continue;
  for (const k of [1, 2, 3, 5]) { const s = find('g1', a + k, b + k); if (!s) continue; if ((big.winA - 50) * (s.winA - 50) < 0 && Math.abs(big.winA - s.winA) >= 30) flips.push(`${KO[a]} ↔ ${KO[b]} 수 ${k}: A ${f1(s.winA)} % ↔ 수 20: ${f1(big.winA)} %`); } }
L.push('', `수 1 · 2 · 3 · 5 에서 이긴 편이 수 20 과 뒤집힌 짝(차 30 %p 넘음) ${flips.length}:`, '', ...(flips.length ? flips.map((x) => '* ' + x) : ['* 없음']));
L.push('', '수 1 ↔ 1 상성(A 이긴 %)', '', '| A ＼ B | ' + T8.map((t) => KO[t]).join(' | ') + ' |', '|---|' + T8.map(() => '---:').join('|') + '|');
for (const a of T8) L.push(`| **${KO[a]}** | ` + T8.map((b) => { const r = find('g1', a + 1, b + 1); return r ? f1(r.winA) : '—'; }).join(' | ') + ' |');

// ③ 원정 사기
L.push('', '## ③ 원정 사기 5 × 5 — A 이긴 % / A 가 붙기 전 달아난 판 % / 진 편 죽음 %', '');
const shapes = [...new Set(by('g3').map((r) => r.A + '|' + r.B))];
for (const sh of shapes) { const [A, B] = sh.split('|');
  L.push(`**${ko(A)} ↔ ${ko(B)}** (줄 = A 사기 · 칸 = B 사기 · 칸 100판)`, '', '| A ＼ B | ' + MRLS.join(' | ') + ' |', '|---|' + MRLS.map(() => '---|').join('') );
  for (const mA of MRLS) L.push(`| ${mA} | ` + MRLS.map((mB) => { const r = find('g3', A, B, { mA, mB }); return r ? `${f1(r.winA)} / ${f1(r.preRoutA)} / ${f1(r.loserDead)}` : '—'; }).join(' | ') + ' |');
  L.push(''); }
const g3 = by('g3'); const lowA = g3.filter((r) => r.mA === 0.4), lowB = g3.filter((r) => r.mB === 0.4);
const pre04 = wmean(lowA.map((r) => r.preRoutA).concat(lowB.map((r) => r.preRoutB)), lowA.map((r) => r.n).concat(lowB.map((r) => r.n)));
const pre10 = wmean(g3.filter((r) => r.mA === 1).map((r) => r.preRoutA).concat(g3.filter((r) => r.mB === 1).map((r) => r.preRoutB)), g3.filter((r) => r.mA === 1).map((r) => r.n).concat(g3.filter((r) => r.mB === 1).map((r) => r.n)));
L.push(`* 사기 0.4 인 편이 붙기 전에 달아난 판: **${f1(pre04)} %**(꼴 여섯 · 맞은편 사기 다섯 고르게) · 사기 1.0 인 편: ${f1(pre10)} %`);

// ④ 진 편 죽음 분포
const ld = all.filter((r) => r.loserDead != null);
const lo = ld.slice().sort((a, b) => a.loserDead - b.loserDead);
const bins = Array(10).fill(0); for (const r of ld) bins[Math.min(9, Math.floor(r.loserDead / 10))]++;
L.push('', '## ④ 진 편 죽음 % 의 분포 — 본판 전 칸(결판 난 판이 있는 칸)', '');
L.push(`* 칸 ${ld.length} · 가운데 **${f1(med(ld.map((r) => r.loserDead)))} %** · 가장 낮은 칸 ${f1(lo[0] && lo[0].loserDead)} %(${lo[0] ? lo[0].g + ' ' + ko(lo[0].A) + ' ↔ ' + ko(lo[0].B) + (lo[0].mA !== 1 || lo[0].mB !== 1 ? ` · 사기 ${lo[0].mA}/${lo[0].mB}` : '') : ''}) · 가장 높은 칸 ${f1(lo.length && lo[lo.length - 1].loserDead)} % · **50 % 밑 ${ld.filter((r) => r.loserDead < 50).length}칸**`);
L.push(`* 결판 때(추격 전) 가운데 ${f1(med(ld.map((r) => r.loserDeadAtDec)))} % · 들판 끝 꼴 가운데 ${f1(med(ld.map((r) => r.loserDeadEdge)))} %`);
L.push(`* 이긴 편 죽음 가운데 ${f1(med(all.map((r) => r.winnerDead)))} %`);
L.push('', '| 진 편 죽음 % | ' + bins.map((_, i) => `${i * 10}~${i * 10 + 10}`).join(' | ') + ' |', '|---|' + bins.map(() => '---:').join('|') + '|', '| 칸 수 | ' + bins.join(' | ') + ' |');
L.push('', '가장 낮은 열 칸', '', '| 무리 | A | B | 사기 A/B | 진 편 죽음 % | 진 편 달아나 삶 % | 붙기 전 달아난 판 % | A 이긴 % |', '|---|---|---|---|---:|---:|---:|---:|');
for (const r of lo.slice(0, 10)) L.push(`| ${r.g} | ${ko(r.A)} | ${ko(r.B)} | ${r.mA}/${r.mB} | ${f1(r.loserDead)} | ${f1(r.loserFled)} | ${f1(r.preContactRout)} | ${f1(r.winA)} |`);

// 수의 비 · 대형 · 정예 · 원거리 · 코너
L.push('', '## ⑤ 수의 비(g2) — A = 적은 쪽 · 25 짝의 A 이긴 % 가운데', '', '| 적은 쪽 | 1 : 1 | 1 : 1.5 | 1 : 2 | 1 : 3 |', '|---:|---:|---:|---:|---:|');
for (const k of [5, 20]) L.push(`| ${k} | ` + [1, 1.5, 2, 3].map((r) => f1(med(M5.flatMap((a) => M5.map((b) => find('g2', a + k, b + Math.round(k * r)))).filter(Boolean).map((x) => x.winA)))).join(' | ') + ' |');
L.push('', '## ⑥ 대형(g4) — A 이긴 % (줄 = A 대형 · 칸 = B 대형 · 칸 60판)', '');
for (const [A0, B0] of [['spear20', 'spear20'], ['spear20', 'dagger20'], ['spear20+archer10', 'dagger30']]) {
  L.push(`**${ko(A0)} ↔ ${ko(B0)}**`, '', '| A ＼ B | ' + FORMS.map((f) => FKO[f]).join(' | ') + ' |', '|---|' + FORMS.map(() => '---:').join('|') + '|');
  for (const fa of FORMS) L.push(`| ${FKO[fa]} | ` + FORMS.map((fb) => { const r = find('g4', A0 + (fa === 'line' ? '' : '@' + fa), B0 + (fb === 'line' ? '' : '@' + fb)); return r ? f1(r.winA) + (r.open ? ` (안 끝남 ${f1(r.open)})` : '') : '—'; }).join(' | ') + ' |');
  L.push(''); }
L.push('## ⑦ 정예 곁(g5) · 원거리(g6) · 코너(g7)', '', '| 무리 | A | B | A 이긴 % | B 이긴 % | 안 끝남 % | 진 편 죽음 % | 이긴 편 죽음 % | 붙기 전 달아난 판 % | 판당 ms |', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|');
for (const r of [...by('g5'), ...by('g6'), ...by('g7')]) L.push(`| ${r.g} | ${ko(r.A)} | ${ko(r.B)} | ${f1(r.winA)} | ${f1(r.winB)} | ${f1(r.open)}${r.openWhy ? ' ' + r.openWhy : ''} | ${f1(r.loserDead)} | ${f1(r.winnerDead)} | ${f1(r.preContactRout)} | ${f1(r.msPerBattle)} |`);

// 견줌: 자리 꼴(g8) · 서버 틱(g9)
const g8 = by('g8'); let injSame = 0; const injDiff = [];
for (const r of g8) { const c = find('g1', r.A, r.B); if (!c) continue; if (c.digest === r.digest) injSame++; else injDiff.push(`${ko(r.A)} ↔ ${ko(r.B)}: 수 꼴 A ${f1(c.winA)} % · 자리 꼴 A ${f1(r.winA)} %`); }
const g9 = by('g9'); const dtD = []; let dtFlip = 0;
for (const r of g9) { const c = find('g1', r.A, r.B); if (!c) continue; const d = r.winA - c.winA; dtD.push({ r, c, d }); if ((r.winA - 50) * (c.winA - 50) < 0 && Math.abs(d) >= 30) dtFlip++; }
const bigDt = dtD.filter((x) => Math.abs(x.d) > 15).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
L.push('', '## ⑧ 견줌 — 수로 주는 꼴 ↔ 자리로 주는 꼴(수 1 ~ 3) · 틱 0.05 ↔ 1/30', '');
L.push(`* 자리 꼴(\`units:[{type,x,y}]\`): ${g8.length}칸 가운데 **판 줄이 바이트 같은 칸 ${injSame}**${injDiff.length ? ' · 다른 칸 ' + injDiff.length : ''}`);
for (const x of injDiff.slice(0, 10)) L.push('  * ' + x);
L.push(`* 틱 1/30(서버 존): ${dtD.length}칸 · A 이긴 % 차 가운데 ${f1(med(dtD.map((x) => Math.abs(x.d))))} %p · 15 %p 넘는 칸 ${bigDt.length} · 이긴 편이 뒤집힌 칸(차 30 %p 넘음) ${dtFlip}`);
for (const x of bigDt.slice(0, 12)) L.push(`  * ${ko(x.r.A)} ↔ ${ko(x.r.B)}: 0.05 → ${f1(x.c.winA)} % · 1/30 → ${f1(x.r.winA)} % · 진 편 죽음 ${f1(x.c.loserDead)} → ${f1(x.r.loserDead)}`);

// 이상한 칸
const odd = [];
for (const t of T8) for (const k of SZ) { const r = find('g1', t + k, t + k); if (r && Math.abs(r.winA - r.winB) > 30) odd.push(['자리 쏠림', `${KO[t]} ${k} ↔ ${KO[t]} ${k}: A ${f1(r.winA)} % · B ${f1(r.winB)} %`]); }
for (const r of by('g2')) { const na = +r.A.replace(/\D/g, ''), nb = +r.B.replace(/\D/g, ''); if (nb >= na * 1.5 && r.winA > 50) odd.push(['많은 편이 짐', `${ko(r.A)} ↔ ${ko(r.B)}: 적은 A 가 ${f1(r.winA)} % 이김`]); }
for (const sh of shapes) { const [A, B] = sh.split('|');
  for (const mB of MRLS) for (let i = 1; i < MRLS.length; i++) { const lo1 = find('g3', A, B, { mA: MRLS[i - 1], mB }), hi = find('g3', A, B, { mA: MRLS[i], mB }); if (lo1 && hi && lo1.winA - hi.winA > 15) odd.push(['사기 낮은 편이 더 잘 싸움', `${ko(A)} ↔ ${ko(B)} · B 사기 ${mB}: A 사기 ${MRLS[i - 1]} → ${f1(lo1.winA)} % · ${MRLS[i]} → ${f1(hi.winA)} %`]); } }
for (const r of rows) { if (r.open > 0) odd.push(['안 끝남', `${r.g} ${ko(r.A)} ↔ ${ko(r.B)}${r.mA !== 1 || r.mB !== 1 ? ' · 사기 ' + r.mA + '/' + r.mB : ''}${r.dt !== 0.05 ? ' · dt ' + r.dt : ''}: ${f1(r.open)} % (${r.openWhy})`]);
  if (r.nan) odd.push(['NaN', `${r.key}: ${r.nan}`]); if (r.mrlOut) odd.push(['사기 0 ~ 1 밖', `${r.key}: ${r.mrlOut}`]); if (r.sumBad) odd.push(['죽은 수 + 산 수 ≠ 처음 수', `${r.key}: ${r.sumBad}`]); }
const oddK = {}; for (const [k] of odd) oddK[k] = (oddK[k] || 0) + 1;
L.push('', `## ⑨ 이상한 칸 ${odd.length}(회부 후보 — 고침 0)`, '', Object.keys(oddK).map((k) => `* ${k} ${oddK[k]}`).join('\n'), '');
for (const [k, x] of odd.slice(0, 80)) L.push(`* [${k}] ${x}`);
if (odd.length > 80) L.push(`* … 더 ${odd.length - 80}`);

// 걸린 시간
const ms = (g, k) => { const r = by(g).filter((x) => +x.A.replace(/\D/g, '') === k && /^[a-z]+\d+$/.test(x.A)); return med(r.map((x) => x.msPerBattle)); };
const totMs = rows.reduce((s, r) => s + r.msPerBattle * r.n, 0);
L.push('', '## ⑩ 걸린 시간 — 판 자 셋을 한꺼번에(4코어 상자 · 판당 ms 는 셋이 같이 돈 값)', '');
L.push('| 무리 | 칸 | 판 | 판 합 ms(벽 아님 · 판당 ms × 판) |', '|---|---:|---:|---:|');
for (const g of [...new Set(rows.map((r) => r.g))]) { const R = by(g); L.push(`| ${g} | ${R.length} | ${R.reduce((s, r) => s + r.n, 0)} | ${(R.reduce((s, r) => s + r.msPerBattle * r.n, 0) / 60000).toFixed(1)}분 |`); }
L.push(`| 합 | ${rows.length} | ${nB} | ${(totMs / 60000).toFixed(1)}분 |`);
const m80 = med(by('g7').filter((r) => /80$/.test(r.A) && /80$/.test(r.B)).map((r) => r.msPerBattle));
L.push('', `* 판당 ms(같은 수 맞대결 64 짝 가운데): 수 1 ${f1(ms('g1', 1))} · 수 20 ${f1(ms('g1', 20))} · 수 40 ${f1(ms('g1', 40))} · 수 80(g7 둘) ${f1(m80)}`);

const S = { cells: rows.length, battles: nB, loserDeadMed: med(ld.map((r) => r.loserDead)), loserDeadMin: lo[0] && lo[0].loserDead, loserDeadMinCell: lo[0] && `${ko(lo[0].A)} ↔ ${ko(lo[0].B)}${lo[0].mA !== 1 || lo[0].mB !== 1 ? ` · 사기 ${lo[0].mA}/${lo[0].mB}` : ''}`, under50: ld.filter((r) => r.loserDead < 50).length,
  winnerDeadMed: med(all.map((r) => r.winnerDead)), preRout: wmean(all.map((r) => r.preContactRout), all.map((r) => r.n)), preRout04: pre04, chased: wmean(all.map((r) => r.chasedShare), all.map((r) => r.n)),
  flips: flips.length, odd: odd.length, oddK, open: rows.reduce((s, r) => s + Math.round((r.open || 0) * r.n / 100), 0), injSame, injN: g8.length, dtFlip, dtBig: bigDt.length,
  ms1: ms('g1', 1), ms20: ms('g1', 20), ms40: ms('g1', 40), ms80: m80, totMin: totMs / 60000 };
if (argv.includes('--json')) process.stdout.write(JSON.stringify(S) + '\n'); else process.stdout.write(L.join('\n') + '\n');
