#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1418 흔들림 전수 둘째 표 · 제품 무변 · 판정 0)
// === scripts/t1418-table.js — 러너 로그만 읽어 판 표 · 빨강 표 · T1364 맞대기 · 상시 목록 줄마다를 만든다 [T1418 · 재민 11-21] ====
//   읽는 것
//     · `run-regress.sh` 로그(판 하나당 한 파일): `##### <하네스> #####` 머리 · `[소요] N초` · `✓ RC=0` / `✗ RC=<n>` / `⚠ RC=75 · 유보`
//       · 덩어리 속 실패 줄(`  ✗ …`) · 판 끝 요약 `  통과 N:` · `  실패 N:` · `  유보 N:` · 몰이가 붙인 `rc=<n> 벽 N초`
//     · 몰이의 `leftover.tsv`(판 · 갈래 · TMPDIR 파일 수 · 바이트 · /tmp 새 것 수 · 바이트) · `dead.txt`(판 · 죽은 때 · 하네스 몇째 · 까닭)
//     · 앞 전수(T1364)의 로그 — 같은 자로 다시 가른다(손으로 옮긴 칸 0)
//   가름(카드 T1418 ②): 늘 빨강 = 혼자 5/5 · 혼자도 흔들림 = 혼자 1 ~ 4/5 · 나란히만 = -j 4 에서 빨강 · 혼자 0/5 · 초록 = -j 4 모두 초록
//   쓰는 법: node scripts/t1418-table.js --par J1.log,… --solo S1.log,… --leftover leftover.tsv [--dead dead.txt]
//            [--prev-par A.log,… --prev-solo S1.log,…] [--known scripts/nightly-known.txt] [--json]
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const list = (s) => (s ? s.split(',').filter(Boolean) : []);
const read = (f) => (f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');

// 로그 하나 → { rows: [{ f, rc, sec, fail }], green, red, held, wall }
function readLog(file) {
  const rows = []; let cur = null;
  const txt = read(file);
  for (const line of txt.split('\n')) {
    const h = /^##### (\S+\.js) #####$/.exec(line);
    if (h) { cur = { f: h[1], rc: null, sec: null, fail: null }; rows.push(cur); continue; }
    if (!cur) continue;
    const s = /^\s+\[소요\] (\d+)초$/.exec(line);
    if (s) { cur.sec = +s[1]; continue; }
    if (/^\s+✓ RC=0\b/.test(line)) { cur.rc = 0; continue; }
    if (/^\s+⚠ RC=75\b/.test(line)) { cur.rc = 75; continue; }
    const r = /^\s+✗ RC=(\d+)/.exec(line);
    if (r) { cur.rc = +r[1]; if (!cur.fail) cur.fail = cur.rc === 124 ? `상한 넘김(RC=124 · ${cur.sec ?? '?'}초)` : `RC=${cur.rc} · 실패 줄 없음`; continue; }
    if (cur.rc == null && !cur.fail && /^\s*✗ /.test(line)) cur.fail = line.trim().replace(/\s+/g, ' ').slice(0, 160);
  }
  const n = (k) => { const m = new RegExp(`^  ${k} (\\d+)`, 'm').exec(txt); return m ? +m[1] : null; };
  const w = /^rc=\d+ 벽 (\d+)초/m.exec(txt);
  return { rows: rows.filter((x) => x.rc != null), green: n('통과'), red: n('실패'), held: n('유보') ?? 0, wall: w ? +w[1] : null };
}
function readKnown(file) {
  const m = new Map();
  for (const l of read(file).split('\n')) {
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const [nm, why] = l.split('|').map((x) => x.trim());
    if (nm) m.set(nm.endsWith('.js') ? nm : nm + '.js', why || '');
  }
  return m;
}
const tsv = (f) => read(f).split('\n').filter(Boolean).map((l) => l.split('\t'));

// 판들 → 하네스마다 가름(같은 자를 앞 전수에도 쓴다)
function classify(parFiles, soloFiles) {
  const par = parFiles.map(readLog), solo = soloFiles.map(readLog), H = new Map();
  const get = (f) => { if (!H.has(f)) H.set(f, { f, par: [], solo: [], fail: null, soloFail: null }); return H.get(f); };
  par.forEach((run) => run.rows.forEach((x) => { const r = get(x.f); r.par.push(x.rc); if (x.fail && !r.fail) r.fail = x.fail; }));
  solo.forEach((run) => run.rows.forEach((x) => { const r = get(x.f); r.solo.push(x.rc); if (x.fail && !r.soloFail) r.soloFail = x.fail; }));
  const red = (rc) => rc !== 0 && rc !== 75;   // 유보(75)는 빨강 아님(러너 규약 T1339)
  const rows = [...H.values()].map((r) => {
    const pr = r.par.filter(red).length, sr = r.solo.filter(red).length, sn = r.solo.length;
    const kind = !pr && !sr ? 'D' : !sn ? 'X' : sr === sn ? 'A' : sr > 0 ? 'B' : 'C';
    return { f: r.f, parRed: pr, parN: r.par.length, parRc: r.par, soloRed: sr, soloN: sn, soloRc: r.solo, kind, fail: r.soloFail || r.fail };
  });
  return { par, solo, rows, byF: new Map(rows.map((r) => [r.f, r])) };
}
const KIND = { A: '늘 빨강', B: '혼자도 흔들림', C: '나란히만', D: '초록', X: '가름 못 함' };
const ORDER = { A: 0, B: 1, C: 2, X: 3, D: 4 };

const PAR = list(arg('--par')), SOLO = list(arg('--solo'));
if (!PAR.length) { console.error('쓰는 법: --par J1.log,… --solo S1.log,… --leftover leftover.tsv [--dead dead.txt] [--prev-par …] [--prev-solo …] [--known …] [--json]'); process.exitCode = 2; return; }
const cur = classify(PAR, SOLO);
const prevPar = list(arg('--prev-par')), prev = prevPar.length ? classify(prevPar, list(arg('--prev-solo'))) : null;
const KNOWN = readKnown(arg('--known', path.join(__dirname, 'nightly-known.txt')));
const LEFT = new Map(tsv(arg('--leftover')).map(([n, kind, tn, tb, sn, sb]) => [n, { kind, tn: +tn, tb: +tb, sn: +sn, sb: +sb }]));
const DEAD = tsv(arg('--dead')).map(([n, at, hs, why]) => ({ n, at, hs: +hs, why }));

const nonGreen = cur.rows.filter((r) => r.kind !== 'D').sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.parRed - a.parRed || a.f.localeCompare(b.f));
const cnt = (k) => cur.rows.filter((r) => r.kind === k).length;
const runRow = (file, i, kind) => { const L = readLog(file), n = path.basename(file, '.log'), t = LEFT.get(n) || {}; return { n, kind, green: L.green, red: L.red, held: L.held, wall: L.wall, ...t }; };
const runs = PAR.map((f, i) => runRow(f, i, 'par')).concat(SOLO.map((f, i) => runRow(f, i, 'solo')));
const parRuns = runs.filter((r) => r.kind === 'par');
const leftPar = parRuns.map((r) => (r.tn || 0) + (r.sn || 0)), leftParB = parRuns.map((r) => (r.tb || 0) + (r.sb || 0));
const wallH = +(runs.reduce((s, r) => s + (r.wall || 0), 0) / 3600).toFixed(1);

// T1364 맞대기
let cmp = null;
if (prev) {
  const prevNG = prev.rows.filter((r) => r.kind !== 'D');
  const was = (k) => prevNG.filter((r) => r.kind === k);
  const now = (f) => cur.byF.get(f);
  cmp = {
    prevC: was('C').map((r) => ({ f: r.f, prev: r, now: now(r.f) })),
    prevA: was('A').map((r) => ({ f: r.f, prev: r, now: now(r.f) })),
    fresh: nonGreen.filter((r) => { const p = prev.byF.get(r.f); return !p || p.kind === 'D'; }),
  };
  cmp.stillC = cmp.prevC.filter((x) => x.now && x.now.kind !== 'D');
  cmp.goneC = cmp.prevC.filter((x) => !x.now || x.now.kind === 'D');
}
const sum = { kinds: cur.rows.length, parRuns: PAR.length, soloRuns: SOLO.length, A: cnt('A'), B: cnt('B'), C: cnt('C'), D: cnt('D'), X: cnt('X'),
  wallH, dead: DEAD.length, leftParFiles: leftPar, leftParGB: leftParB.map((b) => +(b / 2 ** 30).toFixed(2)),
  stillC: cmp ? cmp.stillC.length : null, prevC: cmp ? cmp.prevC.length : null };
if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify({ sum, runs, dead: DEAD, rows: nonGreen, cmp }) + '\n'); return; }

const L = [];
const rcs = (a) => a.map((x) => (x === 0 ? '○' : x === 124 ? '⏱' : x === 75 ? '△' : '✗')).join('') || '—';
const mb = (b) => (b == null ? '?' : b >= 2 ** 30 ? (b / 2 ** 30).toFixed(2) + ' GB' : (b / 2 ** 20).toFixed(0) + ' MB');
const h = (s) => (s == null ? '?' : (s / 3600).toFixed(2) + '시간');
L.push('# T1418 흔들림 전수 둘째 — 러너 로그만 읽는다(`node scripts/t1418-table.js`)', '');
L.push(`· 하네스 ${sum.kinds}종 · -j 4 판 ${PAR.length} · 혼자 판(-j 4 에서 한 번이라도 빨강인 것만) ${SOLO.length} · 죽은 · 무효 판 ${DEAD.length} · 판 벽 합 **${wallH}시간**`);
L.push(`· 늘 빨강 **${sum.A}** · 혼자도 흔들림 **${sum.B}** · 나란히만 **${sum.C}** · 초록 **${sum.D}**${sum.X ? ` · 가름 못 함 ${sum.X}` : ''}`);
L.push('· 칸: ○ 초록 · ✗ 빨강 · ⏱ 상한 넘김(RC=124) · △ 유보(RC=75 — 빨강 아님) · 찌꺼기 = 판 뒤 그 판의 TMPDIR 에 남은 것 + /tmp 에 새로 선 것(박힌 `/tmp/` 경로 몫)', '');
L.push('## 1. 판', '', '| 판 | 갈래 | 초록 | 빨강 | 건너뜀(유보) | 벽 | 찌꺼기 TMPDIR | 찌꺼기 /tmp | 찌꺼기 합 |', '|---|---|---:|---:|---:|---|---|---|---|');
for (const r of runs) L.push(`| ${r.n} | ${r.kind === 'par' ? '-j 4' : '-j 1'} | ${r.green ?? '?'} | ${r.red ?? '?'} | ${r.held} | ${h(r.wall)} | ${r.tn ?? '?'}개 · ${mb(r.tb)} | ${r.sn ?? '?'}개 · ${mb(r.sb)} | ${(r.tn ?? 0) + (r.sn ?? 0)}개 · ${mb((r.tb ?? 0) + (r.sb ?? 0))} |`);
if (DEAD.length) {
  L.push('', '죽은 판 · 무효 판(덮지 않음 — 다음 번호로 새 판을 띄웠다)', '', '| 판 | 죽은 때(로그 마지막 쓰기 · UTC) | 하네스 몇째 | 까닭 | 찌꺼기(치움) |', '|---|---|---:|---|---|');
  for (const d of DEAD) { const t = LEFT.get(d.n) || {}; L.push(`| ${d.n} | ${d.at} | ${d.hs} | ${d.why} | ${(t.tn ?? 0) + (t.sn ?? 0)}개 · ${mb((t.tb ?? 0) + (t.sb ?? 0))} |`); }
}
L.push('', '## 2. 빨강 표(-j 4 에서 한 번이라도 빨강)', '', '| 가름 | 하네스 | -j 4 빨강 | -j 4 판 | 혼자 빨강 | 혼자 판 | 첫 실패 줄(혼자 판 먼저) |', '|---|---|---:|---|---:|---|---|');
for (const r of nonGreen) L.push(`| ${KIND[r.kind]} | \`${r.f}\` | ${r.parRed}/${r.parN} | ${rcs(r.parRc)} | ${r.soloN ? `${r.soloRed}/${r.soloN}` : '—'} | ${rcs(r.soloRc)} | ${(r.fail || '').replace(/\|/g, '¦')} |`);
if (cmp) {
  const st = (x) => (x.now ? `${KIND[x.now.kind]}(-j 4 ${x.now.parRed}/${x.now.parN}${x.now.soloN ? ` · 혼자 ${x.now.soloRed}/${x.now.soloN}` : ''})` : '판에 없음');
  L.push('', '## 3. T1364 맞대기(앞 전수 로그를 같은 자로 다시 가름)', '');
  L.push(`* T1364 나란히만 ${cmp.prevC.length} 가운데 **아직 흔들림 ${cmp.stillC.length}** · 사라짐 ${cmp.goneC.length}`, '', '| T1364 | 하네스 | T1364 -j 4 | 이번 |', '|---|---|---|---|');
  for (const x of cmp.prevC.concat(cmp.prevA)) L.push(`| ${KIND[x.prev.kind]} | \`${x.f}\` | ${x.prev.parRed}/${x.prev.parN} | ${st(x)} |`);
  L.push('', `* 새로 흔들림(T1364 에서 초록이거나 없던 것) ${cmp.fresh.length}: ${cmp.fresh.map((r) => `\`${r.f}\`(${KIND[r.kind]})`).join(' · ') || '없음'}`);
}
L.push('', '## 4. 상시 목록(`scripts/nightly-known.txt`) 줄마다 — 편집은 PM', '', '| 줄 | 이번 -j 4 | 이번 혼자 | 이번 가름 | 내릴 후보 |', '|---|---|---|---|---|');
for (const [f] of KNOWN) { const r = cur.byF.get(f); L.push(`| \`${f}\` | ${r ? rcs(r.parRc) : '판에 없음'} | ${r && r.soloN ? rcs(r.soloRc) : '—'} | ${r ? KIND[r.kind] : '—'} | ${r && r.kind === 'A' ? '' : '후보(늘 빨강 아님)'} |`); }
L.push('', `## 5. 초록 ${sum.D}`, '', cur.rows.filter((r) => r.kind === 'D').map((r) => `\`${r.f}\``).sort().join(' · ') || '없음');
console.log(L.join('\n'));
