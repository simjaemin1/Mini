#!/usr/bin/env node
// === scripts/t1435-table.js — T1435 e2e 한 종마다 스무 판(혼자) + 둘씩 나란히 한 바퀴 표(러너 밖 · 로그만 읽는다) [T1435 · S11 · 2026-11-23] ===
// (@regress 없음 — 판 도구 · 코드 · 하네스 손 0 · 판정 0)
//
// ★바탕: `scripts/t1366-table.js` 의 꼴(첫 ✗ 줄 · 숫자를 # 로 바꾼 "같은 줄" · 러너 판정 줄 `✗ RC=n` 은 첫 ✗ 줄로 안 친다).
// 읽는 것: $W/pool.txt("이름 판 결과(G/R/Y) rc 초" — scripts/t1435-run.sh 가 쓴다) · $W/logs/<이름>.<판>.log
//          $W/pair.log(`run-regress.sh -j 2` 한 바퀴 — `##### f #####` 덩어리마다 `✓ RC=0` / `✗ RC=n` / `⚠ RC=75`)
//          scripts/nightly-known.txt(상시 빨강 목록 — 읽기만)
// 내는 것: 종마다 통과 ○/n · 걸린 초(중앙 · 최대) · 다른 실패 줄 수 · 가름(늘 초록 / 늘 빨강 / 흔들림)
//          흔들림 종마다 한 줄 어림(같은 줄인가 · 느린 판이 빨간가 · 포트 · 시간 · 화면 냄새) — 글자로 센 것뿐 · 판정 아님
//          known 견줌(내릴 후보 = known 에 있는데 스무 판 늘 초록 · 올릴 후보 = 늘 빨강인데 known 에 없음)
//          나란히만 빨강(혼자 빨강 0 인데 -j 2 판에서 빨강)
// ★따로 두는 종(SEP): `e2e-membership` — PM 덧붙임(11-22) "스무 판 표에는 20/20 빨강으로 적고 흔들림과 따로 둔다". 잰 수는 곁에 적는다.
//
//   W=/home/user/t1435w node scripts/t1435-table.js [--json out.json] [--md out.md]
'use strict';
const fs = require('fs');
const path = require('path');

const W = process.env.W || '/home/user/t1435w';
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const SEP = { 'e2e-membership': 'PM 덧붙임 11-22 — 결정적 빨강(⑦ · 이분 첫 빨강 5296e08da) · 표에는 20/20 빨강으로 적고 흔들림과 따로 둔다' };

const rows = fs.readFileSync(path.join(W, 'pool.txt'), 'utf8').split('\n').filter(Boolean)
  .map((l) => l.trim().split(/\s+/)).filter((a) => a.length >= 5)
  .map(([name, run, res, rc, sec]) => ({ name, run: +run, res, rc: +rc, sec: +sec }));

// rc 는 러너 판정 줄(`✗ RC=n`)의 값이 먼저다(그 판 하네스의 종료 코드 — 124 = `timeout` 이 끊음) · 없으면 받은 값.
const rcOf = (text, rc) => { const m = text.match(/✗ RC=(\d+)/); return m ? +m[1] : rc; };
const firstXOf = (text, rc) => {
  const hit = text.split('\n').find((l) => /^\s*(✗|❌)/.test(l) && !/✗ RC=\d+/.test(l));
  const r = rcOf(text, rc);
  return hit ? hit.trim().slice(0, 160) : `(하네스 ✗ 줄 없음 · RC=${r}${r === 124 ? ' · 시간 한도에 끊김' : ''})`;
};
const firstX = (name, run, rc) => {
  const f = path.join(W, 'logs', `${name}.${run}.log`);
  return fs.existsSync(f) ? firstXOf(fs.readFileSync(f, 'utf8'), rc) : `(로그 없음 · RC=${rc})`;
};
const norm = (s) => s.replace(/-?\d+(\.\d+)?/g, '#');
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const smell = (line, rc) => {
  const k = [];
  if (/EADDRINUSE|포트|port\b|ECONNREFUSED|소켓/i.test(line)) k.push('포트·소켓');
  if (rc === 124 || /시간 넘|timeout|타임아웃|\bms\b|[0-9]초|기다/i.test(line)) k.push('시간');
  if (/화소|px|프레임|스크린|screenshot|획|화면|픽셀/i.test(line)) k.push('화면');
  if (/잡음비|비율|배 안|×/.test(line)) k.push('잡음·비율');
  return k;
};

// ── 혼자 스무 판 ──
const by = new Map();
for (const r of rows) { if (!by.has(r.name)) by.set(r.name, []); by.get(r.name).push(r); }
const out = [];
for (const [name, rs] of [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  rs.sort((a, b) => a.run - b.run);
  const n = rs.length;
  const red = rs.filter((r) => r.res === 'R');
  const yubo = rs.filter((r) => r.res === 'Y').length;
  const green = rs.filter((r) => r.res === 'G').length;
  const xs = red.map((r) => {
    const f = path.join(W, 'logs', `${name}.${r.run}.log`);
    const rc = fs.existsSync(f) ? rcOf(fs.readFileSync(f, 'utf8'), r.rc) : r.rc;
    return { run: r.run, rc, sec: r.sec, line: firstX(name, r.run, r.rc) };
  });
  const kinds = [...new Set(xs.map((x) => norm(x.line)))];
  let cls;
  if (SEP[name]) cls = '따로';
  else if (red.length === 0) cls = '늘 초록';
  else if (red.length === n - yubo) cls = '늘 빨강';
  else cls = '흔들림';
  const secs = rs.map((r) => r.sec);
  const o = { name, n, red: red.length, yubo, green, secMed: med(secs), secMax: Math.max(...secs), cls, kinds: kinds.length, xs };
  if (cls === '흔들림') {
    const gSec = med(rs.filter((r) => r.res === 'G').map((r) => r.sec));
    const rSec = med(red.map((r) => r.sec));
    const sm = [...new Set(xs.flatMap((x) => smell(x.line, x.rc)))];
    o.guess = `${kinds.length === 1 ? '같은 줄' : `다른 줄 ${kinds.length}가지`} · 느린 판 빨강 ${rSec > gSec * 1.1 ? '예' : '아니오'}(빨강 중앙 ${rSec}초 · 초록 중앙 ${gSec}초) · 냄새 ${sm.length ? sm.join('·') : '없음'}`;
  }
  out.push(o);
}

// ── 둘씩 나란히 한 바퀴 ──
const pair = new Map();
const pf = path.join(W, 'pair.log');
if (fs.existsSync(pf)) {
  const t = fs.readFileSync(pf, 'utf8');
  const parts = t.split(/^##### (.+?) #####$/m);
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const f = parts[i].replace(/\.js$/, ''); const body = parts[i + 1];
    const rcm = body.match(/✗ RC=(\d+)/);
    const res = /^ {2}✓ RC=0$/m.test(body) ? 'G' : /^ {2}⚠ RC=75/m.test(body) ? 'Y' : 'R';
    const sec = +((body.match(/\[소요\] (\d+)초/) || [])[1] || 0);
    pair.set(f, { res, sec, rc: rcm ? +rcm[1] : 0, line: res === 'R' ? firstXOf(body, rcm ? rcm[1] : '?') : '' });
  }
}
for (const o of out) o.pair = pair.get(o.name) || null;
const pairOnlyRed = out.filter((o) => o.red === 0 && o.pair && o.pair.res === 'R');

// ── known 견줌 ──
const known = fs.readFileSync(path.join(ROOT, 'scripts', 'nightly-known.txt'), 'utf8').split('\n')
  .filter((l) => l.trim() && !l.trim().startsWith('#')).map((l) => l.split('|')[0].trim().replace(/\.js$/, ''));
const knownE2e = known.filter((k) => k.startsWith('e2e-'));
const down = out.filter((o) => knownE2e.includes(o.name) && o.cls === '늘 초록');
const up = out.filter((o) => (o.cls === '늘 빨강' || o.cls === '따로') && !knownE2e.includes(o.name));

// ── 글 ──
const cnt = (c) => out.filter((o) => o.cls === c).length;
const totSec = rows.reduce((s, r) => s + r.sec, 0);
const flaky = out.filter((o) => o.cls === '흔들림').sort((a, b) => (a.green / a.n) - (b.green / b.n));
const worst = flaky[0];
const L = [];
L.push(`# T1435 e2e 한 종마다 스무 판 — ${out.length}종 · ${rows.length}판 · 걸린 시간 ${(totSec / 3600).toFixed(1)}시간(하네스 판 합)`);
L.push('');
L.push(`가름: 늘 초록 ${cnt('늘 초록')} · 늘 빨강 ${cnt('늘 빨강')} · 흔들림 ${cnt('흔들림')}${worst ? `(가장 나쁜 ${worst.name} ${worst.green}/${worst.n})` : ''} · 따로 ${cnt('따로')}(${out.filter((o) => o.cls === '따로').map((o) => o.name).join(' · ')}) · 유보 판 합 ${out.reduce((s, o) => s + o.yubo, 0)}`);
L.push(`나란히(-j 2 한 바퀴): ${pair.size}종 · 빨강 ${[...pair.values()].filter((p) => p.res === 'R').length} · 나란히만 빨강 ${pairOnlyRed.length}${pairOnlyRed.length ? `(${pairOnlyRed.map((o) => o.name).join(' · ')})` : ''}`);
L.push(`known(nightly-known.txt) e2e 줄 ${knownE2e.length} · 내릴 후보 ${down.length} · 올릴 후보 ${up.length}${up.length ? `(${up.map((o) => o.name).join(' · ')})` : ''}`);
L.push('');
L.push('## 1. 종마다(혼자)');
L.push('');
L.push('| 종 | 판 | 통과 | 유보 | 초(중앙 · 최대) | 다른 실패 줄 | 가름 | 나란히 | 첫 ✗ 줄(빨강 판) |');
L.push('|---|---:|---:|---:|---|---:|---|---|---|');
const order = ['늘 빨강', '따로', '흔들림', '늘 초록'];
for (const o of [...out].sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls) || (a.green / a.n) - (b.green / b.n) || a.name.localeCompare(b.name))) {
  const pass = o.cls === '따로' ? `0/20(잰 수 ${o.green}/${o.n})` : `${o.green}/${o.n}`;
  const x = o.xs.length ? o.xs[0].line.replace(/\|/g, '\\|') : '—';
  const p = o.pair ? `${o.pair.res}·${o.pair.sec}초` : '—';
  L.push(`| ${o.name} | ${o.n} | ${pass} | ${o.yubo} | ${o.secMed} · ${o.secMax} | ${o.kinds} | ${o.cls} | ${p} | ${x} |`);
}
L.push('');
L.push('## 2. 흔들림 한 줄 어림(글자로 센 것 — 판정 아님)');
L.push('');
for (const o of flaky) L.push(`- **${o.name}** ${o.green}/${o.n} — ${o.guess}`);
L.push('');
L.push('## 3. 따로 둔 종');
L.push('');
for (const o of out.filter((o) => o.cls === '따로')) L.push(`- **${o.name}** — ${SEP[o.name]} · 잰 수 통과 ${o.green}/${o.n} · 빨강 ${o.red}`);
L.push('');
L.push('## 4. 나란히(-j 2) 빨강');
L.push('');
for (const [f, p] of pair) if (p.res === 'R') { const o = out.find((x) => x.name === f); L.push(`- **${f}** — 혼자 ${o ? `${o.green}/${o.n} (${o.cls})` : '?'} · 나란히 RC=${p.rc} · ${p.sec}초 · ${p.line}`); }
L.push('');
L.push('## 5. 빨강 판마다 첫 ✗ 줄');
for (const o of out.filter((o) => o.red)) {
  L.push(`- **${o.name}** (${o.cls} · 빨강 ${o.red}/${o.n})`);
  for (const x of o.xs) L.push(`  - 판 ${x.run} · RC=${x.rc} · ${x.sec}초 · ${x.line}`);
}
const md = L.join('\n') + '\n';
if (opt('--md')) fs.writeFileSync(opt('--md'), md); else process.stdout.write(md);
if (opt('--json')) {
  fs.writeFileSync(opt('--json'), JSON.stringify({
    species: out, runs: rows.length, totSec, knownE2e, down: down.map((o) => o.name), up: up.map((o) => o.name),
    pairOnlyRed: pairOnlyRed.map((o) => o.name), counts: Object.fromEntries(order.map((c) => [c, cnt(c)])),
  }, null, 1));
}
