#!/usr/bin/env node
// (@regress 없음 — 러너 밖 표 입 · T1458)
// =============================================================================
// scripts/t1458-table.js — 봇 판(`e2e-first30 --own --guide`) 결과 JSON 들을 읽어 스무 판 표를 낸다(T1458).
//
// ★읽기만 한다 — 세계를 안 띄운다 · 제품 코드 · 자(e2e-first30)를 안 부른다. 입력은 판 JSON(`--out` 이 남긴 것)과
//   그 옆의 `<이름>.done`(`EXIT <rc>` — 줄이 남긴 끝 rc · 없으면 rc 를 모른다고 적는다)뿐이다.
// ★판마다: 마을 · 갈래(이름 머리 — 농촌 · 어촌 · 임업 · 광산) · 철 · 집터 분 · ① 굴착 분 · 완공 분 · 아홉 칸 막힘(자의 글 "아홉 칸 막힘")
//   · 막힌 뒤 집터까지 든 분 · 막힌 자리(사유지 · 선포 쪽 / 늘 보던 것) · 오류 · 끝 rc.
// ★가르기(판정이 아니라 셈 — 글자 그대로 읽는다):
//   · 사유지 · 선포 쪽 = 자의 글 "아홉 칸 막힘" · "영토 밖"(선포 거절로 영토 밖으로 걸음) · 막힘 [집터] · 아홉 칸 막힘으로 집터가 늦어 움집 미완
//   · 집터는 섰는데 아홉 칸 막힘 없이 움집 미완 = 사유지 밖(움집 재료 · 물 · 열매 쪽)
//   · 늘 보던 것 = 막힘 [첫 도구] · [첫 불] · [열매] · [첫 잠자리] · [첫 열매/갈대] — 따로 센다(사유지 쪽 수에 안 섞는다)
//   · 집터 못 간 판: 재료(첫 돌 · 첫 통나무)도 못 모았으면 "사유지 밖 막힘" · 겨울 판이면 "철 탓" · 선포를 눌러 봤으면 "사유지 쪽"
//
// 실행: node scripts/t1458-table.js [--md <out.md>] [--json <out.json>] <json…|디렉터리…>
//   판 JSON 이름이 `<id>-t<n>.json` 이면 같은 id 의 가장 늦은 t 만 표에 넣는다(앞 판은 '다시 돌림' 칸에 적는다).
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const MD = val('--md'), JS = val('--json');
const ins = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && (argv[i - 1] === '--md' || argv[i - 1] === '--json')));
if (!ins.length) { console.log('쓰는 법: node scripts/t1458-table.js [--md out.md] [--json out.json] <json…|디렉터리…>'); process.exit(2); }

const files = [];
for (const f of ins) {
  if (fs.statSync(f).isDirectory()) { for (const g of fs.readdirSync(f).sort()) if (/\.json(\.gz)?$/.test(g)) files.push(path.join(f, g)); } else files.push(f);
}
const readJ = (f) => JSON.parse(/\.gz$/.test(f) ? require('zlib').gunzipSync(fs.readFileSync(f)).toString('utf8') : fs.readFileSync(f, 'utf8'));
const KIND = { 농촌: '농촌', 어촌: '어촌', 임업: '임업', 광산: '광산' };
const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
const USUAL = ['첫 도구', '첫 불', '열매', '첫 잠자리', '첫 열매/갈대', '물', '첫 밥'];
const ms = (r, k) => (r.milestones && r.milestones[k] ? r.milestones[k].min : null);
const r2 = (x) => (x == null ? null : +x.toFixed(2));

// id 묶기 — `<id>-t<n>` 의 가장 늦은 t 가 표에 든다
const byId = new Map();
for (const f of files) {
  const base = path.basename(f).replace(/\.json(\.gz)?$/, '');
  const m = /^(.*)-t(\d+)$/.exec(base);
  const id = m ? m[1] : base, t = m ? +m[2] : 1;
  const e = byId.get(id) || { id, tries: [] };
  e.tries.push({ t, f, base });
  byId.set(id, e);
}

function rcOf(f) {
  const d = f.replace(/\.json(\.gz)?$/, '.done');
  try { const m = /EXIT\s+(-?\d+)/.exec(fs.readFileSync(d, 'utf8')); return m ? +m[1] : null; } catch (e) { return null; }
}

const rows = [];
for (const e of [...byId.values()]) {
  e.tries.sort((a, b) => a.t - b.t);
  const last = e.tries[e.tries.length - 1];
  let r; try { r = readJ(last.f); } catch (err) { rows.push({ id: e.id, bad: String(err.message).slice(0, 80) }); continue; }
  const name = (r.village && r.village.name) || '?';
  const kind = KIND[name.replace(/\d+$/, '')] || '?';
  const notes = r.notes || [];
  const nine = notes.filter((n) => /아홉 칸 막힘/.test(n)).map((n) => +(parseFloat(n) / 60).toFixed(2));
  const away = notes.filter((n) => /\[자\] 영토 밖/.test(n)).map((n) => +(parseFloat(n) / 60).toFixed(2));
  const lotLegs = (r.legs || []).filter((l) => l.kind === 'lot-preview-blocked').map((l) => +(l.t / 60).toFixed(2));
  const lot = ms(r, '집터'), dig = ms(r, '움집터(① 굴착)'), done = ms(r, '움집 완공');
  const firstTry = [...lotLegs, ...away].sort((a, b) => a - b)[0];
  const blockers = (r.blockers || []).map((b) => ({ need: b.need, reason: String(b.reason).slice(0, 60), min: +(b.t / 60).toFixed(2) }));
  const usual = blockers.filter((b) => USUAL.includes(b.need));
  const deedsB = blockers.filter((b) => !USUAL.includes(b.need));
  const lastPanel = (r.panelSeq || []).length ? String(r.panelSeq[r.panelSeq.length - 1].ps || '') : null;   // 「지금 할 일」 칸이 끝에 말한 한 수(읽기만)
  // 막힌 자리 — 셈만
  let stuck;
  if (done != null) stuck = '완공';
  else if (lot != null && nine.length) stuck = `사유지 쪽(아홉 칸 막힘 뒤 집터 늦음 → 움집 미완 · 도달 ${r.hutReach || '?'})`;
  else if (lot != null) stuck = `움집 미완(집터 뒤 · 사유지 밖 — 도달 ${r.hutReach || '?'}${usual.filter((b) => !/30분 안 미도달/.test(b.reason) && b.need !== '첫 잠자리').map((b) => ' · ' + b.need + ' 못 찾음').join('')}${lastPanel ? ' · 끝 칸 ' + lastPanel : ''})`;
  else if (r.fatal) stuck = '판 죽음';
  else if (lotLegs.length || away.length || deedsB.length) stuck = '사유지 · 선포 쪽(집터 못 섬)';
  else if (r.season === 'winter') stuck = '철 탓(집터까지 못 감 · 겨울)';
  else stuck = `사유지 밖 막힘(재료 · ${ms(r, '첫 돌') == null ? '첫 돌 없음' : ''}${ms(r, '첫 통나무') == null ? ' 첫 통나무 없음' : ''})`;
  rows.push({
    id: e.id, tries: e.tries.length, retried: e.tries.length > 1 ? e.tries.slice(0, -1).map((x) => x.base) : [],
    vid: r.village ? r.village.vid : r.pickVid, village: name, kind, ch: (r.village && r.village.ch) || null,
    season: r.season, seasonKo: SEASON_KO[r.season] || r.season, seasonDay: r.seasonDay,
    lot: r2(lot), dig: r2(dig), done: r2(done),
    firstStone: r2(ms(r, '첫 돌')), firstLog: r2(ms(r, '첫 통나무')), firstFood: r2(ms(r, '첫 밥')),
    nine: nine.length, nineFirst: nine.length ? nine[0] : null, nineToLot: nine.length && lot != null ? r2(lot - nine[0]) : null,
    lastNineToLot: (() => { const b = nine.filter((x) => lot == null || x <= lot); return b.length && lot != null ? r2(lot - b[b.length - 1]) : null; })(),
    awayN: away.length, lotTries: lotLegs.length, firstTryToLot: firstTry != null && lot != null ? r2(lot - firstTry) : null,
    stuck, usual: usual.map((b) => `${b.need}@${b.min}`), deedsBlockers: deedsB.map((b) => `${b.need}@${b.min}: ${b.reason}`),
    errors: (r.errors || []).length, errorFirst: (r.errors || [])[0] ? String(r.errors[0]).slice(0, 100) : null,
    fatal: r.fatal || null, rc: rcOf(last.f), fps: r.fps ? r.fps.med : null,
  });
}
rows.sort((a, b) => String(a.id).localeCompare(String(b.id), 'ko'));

// 합계
const ok = rows.filter((x) => !x.bad);
const q = (arr, p) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.max(0, Math.ceil(p * s.length) - 1)]; };   // 가까운 순위(nearest-rank)
const doneMins = ok.filter((x) => x.done != null).map((x) => x.done);
const bySeason = {}; for (const x of ok) { const s = bySeason[x.seasonKo] || (bySeason[x.seasonKo] = { n: 0, lot: 0, done: 0 }); s.n++; if (x.lot != null) s.lot++; if (x.done != null) s.done++; }
const byKind = {}; for (const x of ok) { const s = byKind[x.kind] || (byKind[x.kind] = { n: 0, lot: 0, done: 0, nine: 0 }); s.n++; if (x.lot != null) s.lot++; if (x.done != null) s.done++; if (x.nine) s.nine++; }
const nineRuns = ok.filter((x) => x.nine > 0);
const sum = {
  n: ok.length, lot: ok.filter((x) => x.lot != null).length, done: doneMins.length,
  doneMedian: q(doneMins, 0.5), doneP90: q(doneMins, 0.9),
  nineRuns: nineRuns.length, nineVillages: nineRuns.map((x) => x.village),
  nineToLot: nineRuns.map((x) => ({ village: x.village, firstNineToLot: x.nineToLot, lastNineToLot: x.lastNineToLot })),
  bySeason, byKind,
  deedsSide: ok.filter((x) => /^사유지 쪽|사유지 · 선포/.test(x.stuck)).map((x) => x.id),
  nonDeeds: ok.filter((x) => /사유지 밖/.test(x.stuck)).map((x) => x.id),
  seasonBlame: ok.filter((x) => /철 탓/.test(x.stuck)).map((x) => x.id),
  dead: ok.filter((x) => x.fatal || (x.rc != null && x.rc !== 0)).map((x) => x.id),
  retried: ok.filter((x) => x.tries > 1).map((x) => x.id),
  bad: rows.filter((x) => x.bad),
};

const f = (v) => (v == null ? '—' : String(v));
const L = [];
L.push('| 판 | vid | 마을 | 철 | 집터 | ① 굴착 | 완공 | 아홉 칸 막힘(첫 분 · 수) | 막힘→집터 | 영토 밖 걸음 | 막힌 자리 | 늘 보던 막힘 | 오류 | rc |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const x of ok) {
  L.push(`| ${x.id}${x.tries > 1 ? ` (다시 ${x.tries - 1})` : ''} | ${f(x.vid)} | ${x.village} | ${x.seasonKo} | ${f(x.lot)} | ${f(x.dig)} | ${f(x.done)} | ${x.nine ? `${x.nineFirst} · ${x.nine}` : '—'} | ${f(x.nineToLot)} | ${x.awayN} | ${x.stuck} | ${x.usual.join(' ') || '—'} | ${x.errors}${x.errorFirst ? ' (' + x.errorFirst.replace(/\|/g, '/') + ')' : ''} | ${f(x.rc)} |`);
}
L.push('');
L.push(`집터 ${sum.lot}/${sum.n} · 완공 ${sum.done}/${sum.n} · 완공 분 가운데 ${f(sum.doneMedian)} · 열에 아홉 ${f(sum.doneP90)}(완공한 판만 · 가까운 순위) · 아홉 칸 막힘 ${sum.nineRuns}판(${sum.nineVillages.join(' · ') || '—'})`);
L.push(`철마다(집터/완공/판): ${Object.entries(sum.bySeason).map(([k, s]) => `${k} ${s.lot}/${s.done}/${s.n}`).join(' · ')}`);
L.push(`갈래마다(집터/완공/아홉 칸 막힘/판): ${Object.entries(sum.byKind).map(([k, s]) => `${k} ${s.lot}/${s.done}/${s.nine}/${s.n}`).join(' · ')}`);
L.push(`사유지 쪽 막힘 판 ${sum.deedsSide.length}(${sum.deedsSide.join(' · ') || '—'}) · 사유지 밖 막힘 판 ${sum.nonDeeds.length}(${sum.nonDeeds.join(' · ') || '—'}) · 철 탓 ${sum.seasonBlame.length}(${sum.seasonBlame.join(' · ') || '—'}) · 죽은 판 ${sum.dead.length}(${sum.dead.join(' · ') || '—'}) · 다시 돌린 판 ${sum.retried.length}(${sum.retried.join(' · ') || '—'})`);
if (sum.bad.length) L.push(`읽지 못한 판: ${sum.bad.map((x) => x.id + ' ' + x.bad).join(' · ')}`);
const md = L.join('\n') + '\n';
process.stdout.write(md);
if (MD) fs.writeFileSync(MD, md);
if (JS) fs.writeFileSync(JS, JSON.stringify({ summary: sum, runs: rows }, null, 1) + '\n');
