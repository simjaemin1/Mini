#!/usr/bin/env node
// === scripts/t1379-table.js — DB 가 어디서 자라는가: 100날마다 표별 행 · 바이트 · 새 행 · 자라기만 하는 표 [T1379 · S11 · 2026-11-21] ======
// (@regress 없음 — 러너 밖 · 표 도구 · sqlite 를 읽기만 한다 — 손으로 세지 않는다)
//
// 쓰는 법: node scripts/t1379-table.js --w /tmp/t1379 --out 계측/T1379_<날짜>
// 입력: `<w>/<판>/snaps/d<N>.db` · `dEnd.db` · `snaps.json`(t1379-snap.js) · `<out>/boot.json`(t1379-boot.js · 있으면)
// 출력: `<out>/표.md` · `<out>/rows.json`(사본마다 표별 행 · 바이트) · 표준 출력에 보고 첫 줄의 수
// ★자라기만 하는 표 = 기본 판 100날 사본 차례에서 행 수가 한 번도 줄지 않고(같거나 늘고) 끝이 처음보다 큰 표.
// ★한 해 뒤 어림 = 마지막 400날 기울기(행 · 바이트 / 날)를 곧게 늘인 값 — 게임 한 해(365날) · 운영 한 해(하루 24분 = 진짜 하루 60날 → 21,900날). 곧은 줄 가정(판정 아님).
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const W = arg('w', '/tmp/t1379'), OUT = arg('out');
const MB = (b) => (b / 1048576).toFixed(1);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
function readDb(f) {
  const db = new DatabaseSync(f, { readOnly: true });
  try {
    const tabs = db.prepare("select name from sqlite_schema where type='table' and name not like 'sqlite_%'").all().map((r) => r.name);
    const bytes = {}; for (const r of db.prepare('select name, sum(pgsize) b from dbstat group by name').all()) bytes[r.name] = Number(r.b);
    const idx = {}; for (const r of db.prepare("select name, tbl_name from sqlite_schema where type='index'").all()) idx[r.name] = r.tbl_name;
    const T = {};
    for (const t of tabs) { const n = Number(db.prepare(`select count(*) n from "${t.replace(/"/g, '""')}"`).get().n); T[t] = { rows: n, bytes: bytes[t] || 0, idxBytes: 0 }; }
    for (const [i, t] of Object.entries(idx)) if (T[t]) T[t].idxBytes += bytes[i] || 0;
    return T;
  } finally { db.close(); }
}
function runOf(tag) {
  const dir = path.join(W, tag, 'snaps'); if (!fs.existsSync(dir)) return null;
  const meta = fs.existsSync(path.join(dir, 'snaps.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'snaps.json'), 'utf8')) : [];
  const S = meta.filter((m) => fs.existsSync(path.join(dir, m.name + '.db'))).map((m) => ({ ...m, file: fs.statSync(path.join(dir, m.name + '.db')).size, T: readDb(path.join(dir, m.name + '.db')) }));
  const seen = new Set(); const uniq = []; for (const s of S.sort((a, b) => a.day - b.day)) { if (seen.has(s.day)) continue; seen.add(s.day); uniq.push(s); }
  return uniq;
}
const base = runOf('base') || [], beast = runOf('beast') || [], farm = runOf('farm') || [];
const boot = OUT && fs.existsSync(path.join(OUT, 'boot.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'boot.json'), 'utf8')) : [];
const L = [];
L.push('# T1379 — DB 가 어디서 자라는가 · 부팅이 얼마나 느려지는가', '');
L.push('자: `scripts/t1379-run.sh`(판 셋) · `t1379-snap.js`(100날마다 온라인 백업) · `t1379-boot.js`(부팅) · `t1379-table.js`(이 표). 시드 1020 · 가상 시계 · 그 밖 제품 기본.', '');
L.push('## 1. 기본 판 — 사본마다', '', '| 사본 | 날 | DB 파일 | 표 합 행 | 가장 큰 표(바이트 · 색인 포함) |', '|---|---:|---:|---:|---|');
const tot = (T) => Object.values(T).reduce((a, x) => a + x.rows, 0);
const big = (T) => Object.entries(T).sort((a, b) => (b[1].bytes + b[1].idxBytes) - (a[1].bytes + a[1].idxBytes))[0];
for (const s of base) { const b = big(s.T); L.push(`| ${s.name} | ${s.day} | ${MB(s.file)} MB | ${fmt(tot(s.T))} | ${b ? `${b[0]} ${MB(b[1].bytes + b[1].idxBytes)} MB(${fmt(b[1].rows)}행)` : '—'} |`); }
const last = base[base.length - 1], first = base[0];
const names = last ? Object.keys(last.T).sort((a, b) => (last.T[b].bytes + last.T[b].idxBytes) - (last.T[a].bytes + last.T[a].idxBytes)) : [];
L.push('', '## 2. 표별 — 행(100날마다) · 마지막 사본 바이트', '');
L.push(`| 표 | ${base.map((s) => 'd' + s.day).join(' | ')} | 마지막 MB(색인) | 100날 새 행(마지막 구간) | 자라기만 |`, `|---|${base.map(() => '---:').join('|')}|---:|---:|---|`);
const mono = [];
for (const t of names) {
  const rs = base.map((s) => (s.T[t] ? s.T[t].rows : 0));
  const grows = rs.length >= 2 && rs.every((v, i) => i === 0 || v >= rs[i - 1]) && rs[rs.length - 1] > rs[0];
  if (grows) mono.push(t);
  const k = rs.length; const lastStep = k >= 2 ? (rs[k - 1] - rs[k - 2]) / Math.max(1, base[k - 1].day - base[k - 2].day) * 100 : 0;
  if (rs.every((v) => v === 0)) continue;
  L.push(`| ${t} | ${rs.map(fmt).join(' | ')} | ${MB(last.T[t].bytes)}(${MB(last.T[t].idxBytes)}) | ${fmt(lastStep)} | ${grows ? '○' : ''} |`);
}
L.push('', `## 3. 자라기만 하는 표 ${mono.length}개 — 한 해 뒤 어림(마지막 400날 기울기 · 곧은 줄)`, '');
const ref = base.filter((s) => s.day <= (last ? last.day - 400 : 0)).pop() || first;
L.push('| 표 | 마지막 행 | 날마다 새 행 | 게임 +365날 행 | 운영 한 해(+21,900날) 행 | 운영 한 해 MB(같은 행 크기) |', '|---|---:|---:|---:|---:|---:|');
for (const t of mono) {
  const r1 = last.T[t].rows, r0 = ref.T[t] ? ref.T[t].rows : 0, dd = Math.max(1, last.day - ref.day), slope = (r1 - r0) / dd;
  const bpr = r1 ? (last.T[t].bytes + last.T[t].idxBytes) / r1 : 0;
  L.push(`| ${t} | ${fmt(r1)} | ${slope.toFixed(1)} | ${fmt(r1 + slope * 365)} | ${fmt(r1 + slope * 21900)} | ${MB((r1 + slope * 21900) * bpr)} |`);
}
L.push('', '## 4. 켬 판 둘 — 400날(한 줄씩)', '', '| 판 | 날 | DB 파일 | 표 합 행 | 가장 큰 표 | 기본 판 같은 날 대비 |', '|---|---:|---:|---:|---|---:|');
const at = (S, d) => S.filter((s) => s.day <= d + 5).pop();
for (const [tag, S] of [['짐승 몸 켬(T1331_BEAST_BODY=1)', beast], ['밭 켬(T1243_FARM_ON=1)', farm]]) {
  const s = S[S.length - 1]; if (!s) { L.push(`| ${tag} | — | — | — | — | — |`); continue; }
  const b0 = at(base, s.day); const b = big(s.T);
  L.push(`| ${tag} | ${s.day} | ${MB(s.file)} MB | ${fmt(tot(s.T))} | ${b[0]} ${MB(b[1].bytes + b[1].idxBytes)} MB | ${b0 ? `기본 d${b0.day} ${MB(b0.file)} MB → ×${(s.file / b0.file).toFixed(2)}` : '—'} |`);
}
L.push('', '## 5. 부팅(사본으로 존 하나 · 벽시계 · 판 자 훅 · 가상 시계 없음)', '', '| 사본 | 사본 MB | 부팅 초 | RSS 꼭대기 MB | 첫 틱 ms(n) |', '|---|---:|---:|---:|---|');
for (const r of boot) L.push(`| ${r.name} | ${MB(r.srcBytes)} | ${r.up ? r.bootSec : '못 뜸 ' + r.why} | ${r.rssPeakMB ?? '—'} | ${r.firstTick ? `${r.firstTick.ms}(${r.firstTick.n})` : '—'} |`);
const rowsOut = { base: base.map((s) => ({ name: s.name, day: s.day, file: s.file, T: s.T })), beast: beast.map((s) => ({ name: s.name, day: s.day, file: s.file })), farm: farm.map((s) => ({ name: s.name, day: s.day, file: s.file })) };
if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, '표.md'), L.join('\n') + '\n'); fs.writeFileSync(path.join(OUT, 'rows.json'), JSON.stringify(rowsOut)); }
const bt = (n) => { const r = boot.find((x) => x.name === n); return r && r.up ? r.bootSec : '—'; };
const bigL = last ? big(last.T) : null;
console.log(`${last ? last.day : '—'}날 DB ${last ? MB(last.file) : '—'}MB · 가장 큰 표 ${bigL ? `${bigL[0]}(${fmt(bigL[1].rows)}행)` : '—'} · 자라기만 하는 표 ${mono.length}개(${mono.join(', ')}) · 부팅 ${boot.map((r) => r.name + ' ' + (r.up ? r.bootSec : '—')).join(' · ')}초 · RSS ${boot.map((r) => r.rssPeakMB).join('/')}MB · 짐승 몸 켬 ${beast.length ? MB(beast[beast.length - 1].file) : '—'}MB · 밭 켬 ${farm.length ? MB(farm[farm.length - 1].file) : '—'}MB`);
