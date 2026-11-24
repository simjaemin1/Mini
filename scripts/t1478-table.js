#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1478 흔들림 전수 셋째 표 · 제품 무변 · 판정 0)
// === scripts/t1478-table.js — `t1418-table.js` 의 표(가름 · 판 · 상시 목록)에 T1478 몫을 붙인다 ===
//   붙이는 것: ① T1418 에서 초록이었거나 없던 "새로 생긴" 빨강 표(하네스 · 첫 ✗ 줄 · 하네스를 마지막으로 만진 카드 · 그 하네스가 무는 제품 파일을 마지막으로 만진 카드)
//             ② rack-age 혼자 스무 번 · 서버 잡 2/2 차례 다섯 번(몰이의 rack-solo.tsv · rack-ci.tsv) ③ 사유지 끔 전제 하네스 목록 ④ 머리 한 줄 수
//   쓰는 법: node scripts/t1478-table.js --par J1.log,.. --solo S1.log,.. --leftover leftover.tsv [--dead dead.txt] --prev-par A.log,.. --prev-solo S1.log,..
//            --known scripts/nightly-known.txt --dir <몰이 폴더(rack-*.tsv · off-strict.txt)> [--head]
const fs = require('fs'), path = require('path'), cp = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ROOT = path.join(__dirname, '..'), DIR = arg('--dir', '.');
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const passArgs = [];
for (const k of ['--par', '--solo', '--leftover', '--dead', '--prev-par', '--prev-solo', '--known']) { const v = arg(k); if (v) passArgs.push(k, v); }
const T = path.join(__dirname, 't1418-table.js');
const jsn = JSON.parse(cp.execFileSync('node', [T, ...passArgs, '--json'], { maxBuffer: 1 << 28 }).toString());
const txt = cp.execFileSync('node', [T, ...passArgs], { maxBuffer: 1 << 28 }).toString();
const git = (a) => { try { return cp.execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim(); } catch (e) { return ''; } };
const card = (p) => { const s = git(['log', '--no-merges', '-1', '--format=%s', '--', p]); const m = /T\d{3,4}/.exec(s); return p && s ? `${m ? m[0] : '카드 표지 없음'} (${s.slice(0, 40).replace(/\|/g, '¦')})` : '—'; };
// 하네스가 무는 제품 파일: 글자에 나온 server|sim|public 경로 가운데 가장 자주 나온 것
const product = (f) => {
  const t = read(path.join(ROOT, 'scripts', f)), c = new Map();
  for (const m of t.matchAll(/\b(server|sim|public)\/[\w.\-\/]+\.(?:js|json|html)\b/g)) c.set(m[0], (c.get(m[0]) || 0) + 1);
  return [...c.entries()].filter(([p]) => fs.existsSync(path.join(ROOT, p))).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};
const KIND = { A: '늘 빨강', B: '혼자도 흔들림', C: '나란히만' };
const fresh = jsn.cmp ? jsn.cmp.fresh : [];
const freshRows = jsn.rows.filter((r) => fresh.some((x) => x.f === r.f));
const out = [txt, '', '## 6. T1418 에 없던 새 빨강(T1418 에서 초록이거나 판에 없던 것)', ''];
const nk = { A: 0, B: 0, C: 0 };
out.push('| 가름 | 하네스 | 첫 ✗ 줄 | 하네스를 마지막으로 만진 카드 | 무는 제품 파일 | 그 제품 파일을 마지막으로 만진 카드 |', '|---|---|---|---|---|---|');
for (const r of freshRows) { nk[r.kind]++; const p = product(r.f);
  out.push(`| ${KIND[r.kind]} | \`${r.f}\` | ${(r.fail || '').replace(/\|/g, '¦')} | ${card('scripts/' + r.f)} | ${p ? '`' + p + '`' : '글자에 없음'} | ${p ? card(p) : '—'} |`); }
if (!freshRows.length) out.push('| 없음 | | | | | |');
// 상시 밖 늘 빨강 · 상시 목록 밖/안
const known = new Set(read(arg('--known', path.join(__dirname, 'nightly-known.txt'))).split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).map((l) => l.split('|')[0].trim().replace(/(?<!\.js)$/, (m, o, s) => (s.endsWith('.js') ? '' : '.js'))));
const redA = jsn.rows.filter((r) => r.kind === 'A');
out.push('', '· 상시 목록 안 늘 빨강: ' + (redA.filter((r) => known.has(r.f)).map((r) => '`' + r.f + '`').join(' · ') || '없음'));
out.push('· 상시 목록 밖 늘 빨강: ' + (redA.filter((r) => !known.has(r.f)).map((r) => '`' + r.f + '`').join(' · ') || '없음'));
// rack-age
const tsv = (f) => read(path.join(DIR, f)).split('\n').filter(Boolean).map((l) => l.split('\t'));
const rs = tsv('rack-solo.tsv'), rc = tsv('rack-ci.tsv');
const rsRed = rs.filter((x) => x[1] !== 'rc=0').length, rcRed = rc.filter((x) => !/RC=0/.test(x[3] || '')).length;
out.push('', '## 7. test-t1118-rack-age', '', `· 혼자 \`node scripts/test-t1118-rack-age.js\` ${rs.length}번 가운데 빨강 **${rsRed}** · 서버 잡 2/2 차례 그대로(\`run-regress.sh\` -j 1 · TIDE_FREEZE_MS=372603 · DRAIN_SEC=3 · TIMEOUT_SEC=180 · 25종) ${rc.length}번 가운데 rack-age 빨강 **${rcRed}**`);
out.push('', '| 판 | 결과 | 벽 | 비고 |', '|---|---|---|---|');
for (const x of rs) out.push(`| 혼자 ${x[0].slice(1)} | ${x[1] === 'rc=0' ? '○' : '✗ ' + x[1]} | ${x[2]} | |`);
for (const x of rc) out.push(`| 차례 ${x[0].slice(1)} | ${/RC=0/.test(x[3] || '') ? '○' : '✗'} (러너 ${x[1]}) | ${x[2]} | ${x[3] || ''} |`);
const offs = read(path.join(DIR, 'off-strict.txt')).split('\n').filter(Boolean);
out.push('', `## 8. 사유지 끔 전제 하네스(글자 훑기 · 돌리기 전) — ${offs.length}종`, '', '· 가름: `@regress` 전수 가운데 글자에 사유지 · deeds 가 나오는데 `T1305_DEEDS` 를 박지 않은 것(켬 기본에서 끔 쪽 가정이 남았을 수 있는 후보 · 글자 훑기이지 판정 아님).', '', offs.map((f) => '`' + f + '`').join(' · '));
console.log(out.join('\n'));
