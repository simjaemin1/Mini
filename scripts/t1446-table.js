#!/usr/bin/env node
// === scripts/t1446-table.js — T1446 재현 틀 결과를 보고 표로(@regress 없음 · 표 기계) ==========================
//   읽는 것: `<dir>/repro.json`(t1446-view-repro 판들) · `<dir>/scan.json`(같은 자 `--scan-table`) — 없으면 그 표는 건너뛴다.
//   내는 것: ① 판 표(프레임 · 렌더 · 쪼갠 층) ② 끔 → 켬 짝 표 ③ 접속 짐 표(welcome 풀기 · 처리 · 첫 그림 · 접속 뒤 핑) ④ 전수 표.
// 실행: node scripts/t1446-table.js 계측/T1446_<날짜>/repro [--md 표.md]
'use strict';
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
if (!dir) { console.error('쓰는 법: node scripts/t1446-table.js <dir> [--md out.md]'); process.exit(2); }
const mdI = process.argv.indexOf('--md'), MD = mdI > 0 ? process.argv[mdI + 1] : null;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return null; } };
const R = rd('repro.json'), S = rd('scan.json');
const L = [];
const f1 = (x) => (x == null ? '-' : (+x).toFixed(1)), f2 = (x) => (x == null ? '-' : (+x).toFixed(2));
const BN = { webkit: 'WebKit(Safari 엔진)', chromium: 'Chromium' }, SP = { dense: '마을 가운데(촘촘)', sparse: '교역로 가(성김)' };
const split = (r, k) => { const x = (r.rep.split || []).find((y) => y['층'] === k); return x ? x['프레임당 ms'] : null; };
const share = (r, k) => { const x = (r.rep.table || []).find((y) => y['층'] === k); return x ? x['몫 %'] : null; };
const stage = (r, k) => { const x = (r.load && r.load.stages || []).find((y) => y['갈래'].startsWith(k)); return x ? x.ms : null; };
const pings = (r, sec) => { if (!r.ping || !r.ping.s || r.ping.welcomeRx == null) return null; const t0 = r.ping.welcomeRx;
  const a = r.ping.s.filter(([t, v]) => t >= t0 && t <= t0 + sec * 1000 && v > 0).map(([, v]) => v); return a.length ? { max: Math.max(...a), over1s: a.filter((v) => v > 1000).length, n: a.length } : { max: null, over1s: 0, n: 0 }; };
if (R) {
  const rows = R.rows.filter((r) => !r.err);
  L.push(`### ① 판 표 — ${R.synth.roads.toLocaleString()}칸 · 건물 ${R.synth.buildings.toLocaleString()} · ${R.sec}초 · 화면 ${R.view.width}×${R.view.height} ×2 · 물 ${R.water}`);
  L.push('');
  L.push('| 브라우저 | 자리 | t1193 | 색인 | 프레임 p50 · p95 ms | fps | 렌더 p50 ms | 길 훑기 ms/판 | 건물 훑기 | 그 밖 목록 | 안개 | 그 밖 렌더 몫 % | 브라우저 몫 % | 화면 안 길 · 건물 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) L.push(`| ${BN[r.bn] || r.bn} | ${SP[r.spot] || r.spot} | ${r.t1193 ? '켬' : '끔'} | ${r.knob ? '**켬**' : '끔'} | ${r.rep.frames.p50} · ${r.rep.frames.p95} | ${r.rep.frames.fps} | ${r.rep.frames.per ? r.rep.frames.per.r : '-'} | ${f2(split(r, '길 훑기'))} | ${f2(split(r, '건물 훑기'))} | ${f2(split(r, '그 밖 목록'))} | ${f2(split(r, '안개'))} | ${share(r, '그 밖 렌더')} | ${share(r, '브라우저(그리기·GC·대기)')} | ${r.inView.roads} · ${r.inView.blds} |`);
  L.push('');
  L.push('### ② 끔 → 켬 짝(같은 브라우저 · 자리 · t1193)');
  L.push('');
  L.push('| 브라우저 | 자리 | t1193 | 길 훑기 ms/판 | 건물 훑기 | 렌더 p50 ms | 프레임 p50 ms | 그 밖 렌더 몫 % |');
  L.push('|---|---|---|---|---|---|---|---|');
  const pairs = {};
  for (const r of rows) (pairs[`${r.bn}|${r.spot}|${r.t1193}`] = pairs[`${r.bn}|${r.spot}|${r.t1193}`] || {})[r.knob] = r;
  for (const [k, p] of Object.entries(pairs)) {
    if (!p[0] || !p[1]) continue;
    const [bn, spot, t] = k.split('|');
    L.push(`| ${BN[bn] || bn} | ${SP[spot] || spot} | ${t === '1' ? '켬' : '끔'} | ${f2(split(p[0], '길 훑기'))} → **${f2(split(p[1], '길 훑기'))}** | ${f2(split(p[0], '건물 훑기'))} → ${f2(split(p[1], '건물 훑기'))} | ${p[0].rep.frames.per.r} → ${p[1].rep.frames.per.r} | ${p[0].rep.frames.p50} → ${p[1].rep.frames.p50} | ${share(p[0], '그 밖 렌더')} → ${share(p[1], '그 밖 렌더')} |`);
  }
  L.push('');
  L.push('### ③ 접속 짐 — 첫 접속 표(`__loadReport`) · 접속 뒤 화면 핑(`lastRttMs` 0.1초 표본)');
  L.push('');
  L.push('| 브라우저 | 자리 | t1193 | 색인 | welcome 풀기 ms | welcome 처리 ms | 첫 그림 ms | 첫 입력 ms | 첫 그림 뒤 긴 프레임(판 · 막은 ms) | 접속 뒤 6초 핑 최대 ms(1초 넘은 표본) | 10초 핑 최대 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const p6 = pings(r, 6), p10 = pings(r, 10);
    L.push(`| ${BN[r.bn] || r.bn} | ${SP[r.spot] || r.spot} | ${r.t1193 ? '켬' : '끔'} | ${r.knob ? '켬' : '끔'} | ${stage(r, 'welcome 풀기')} | ${stage(r, 'welcome 처리')} | ${stage(r, '첫 그림')} | ${stage(r, '첫 입력')} | ${r.load && r.load.long ? `${r.load.long.n} · ${r.load.long.ms}` : '-'} | ${p6 ? `${p6.max == null ? '-' : Math.round(p6.max)}(${p6.over1s}/${p6.n})` : '-'} | ${p10 && p10.max != null ? Math.round(p10.max) : '-'} |`);
  }
  L.push('');
}
if (S) {
  for (const [bn, rows] of Object.entries(S.res)) {
    L.push(`### ④ 전수 표 — ${BN[bn] || bn} · 마을 가운데 · 켬 판 페이지(같은 자리 21번 중앙값)`);
    L.push('');
    L.push('| 목록 | 크기 | 크기 출처 | ms(프레임당 · 한 번) | 부르는 때 · 화면 밖도 도나 |');
    L.push('|---|---|---|---|---|');
    for (const r of rows) L.push(`| ${r.list} | ${(r.n || 0).toLocaleString()} | ${r.src || '이 판'} | ${r.ms} | ${r.once ? r.when : (r.note || '프레임마다 · 화면 밖도 돈다')} |`);
    L.push('');
  }
}
const out = L.join('\n');
console.log(out);
if (MD) fs.writeFileSync(MD, out + '\n');
