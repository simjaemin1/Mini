#!/usr/bin/env node
// === scripts/t815-table.js — T815 표 기계: `t815-observe.js` 가 남긴 `<판>-<시드>.t815.json` 을 읽어 줄로 (계측기 · 세계 안 만짐) ===
//   node scripts/t815-table.js <dir>                     # 판 셋(시드마다): 묶인 마을 · 몰사 · 빈 마을 · 인구 · 셈만 느는 죽음
//   node scripts/t815-table.js <dir> <시드> <마을이름>    # 그 마을의 하루표(묶임 30일 전 ~ 복귀 날)
// 묶임 = 자유민 0(전원 `_warDraft`) 이 10일 이상 이어진 마을(T796 §3-4 와 같은 잣대: 묶임 ≥ 10일 · 인구 ≥ 5).
// 셈만 느는 죽음 = 전날 끝에도 자유민 0 이던 날 세어진 `_deathsToday` 의 합(죽을 몸이 없는데 센 죽음 — 마지막 자유민이 죽은 그날은 몸이 죽은 날이라 뺀다).
// 몰사 = 묶임이 풀린 뒤 3일 안에 인구가 0 이 된 마을(전원 징발 → 복귀 날 한꺼번에 죽음).
'use strict';
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || '.';
const files = fs.readdirSync(dir).filter((f) => /-(\d+)\.t815\.json$/.test(f)).sort();
const C = {}; // 열 이름 → 번호
function load(f) { const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); o.cols.forEach((c, i) => { C[c] = i; }); return o; }
const seedOf = (f) => +/-(\d+)\.t815\.json$/.exec(f)[1];
function analyse(o) {
  const names = o.names, R = o.rows, out = { pins: [], phantom: 0, wipes: [], emptyEnd: 0, popEnd: 0, days: R.length ? R[R.length - 1][0] : 0 };
  for (let vi = 0; vi < names.length; vi++) {
    let i = 0;
    while (i < R.length) {
      const r = R[i][1][vi];
      if (r[C.free] === 0 && r[C.pop] >= 1) {
        let j = i; let ph = 0;
        while (j + 1 < R.length && R[j + 1][1][vi][C.free] === 0 && R[j + 1][1][vi][C.pop] >= 1) j++;
        for (let k = Math.max(i, 1); k <= j; k++) if (k > i || (R[k - 1] && R[k - 1][1][vi][C.free] === 0 && R[k - 1][1][vi][C.pop] >= 1)) ph += R[k][1][vi][C.deathsToday];   // 전날 끝에도 자유민 0 인 날만 센다(자유민 마지막 한 명이 죽은 날은 몸이 죽은 날이다)
        const len = j - i + 1;
        if (len >= 10 && r[C.pop] >= 5) {
          const after = R.slice(j + 1, j + 4).map((x) => x[1][vi][C.pop]);
          const wipe = after.length > 0 && after.some((p) => p === 0);
          const last = R[j][1][vi], first = r;
          out.pins.push({ name: names[vi], vi, from: R[i][0], to: R[j][0], len, pop: first[C.pop], phantom: ph, tfe0: first[C.tfe], tfe1: last[C.tfe], wipe });
          out.phantom += ph;
          if (wipe) out.wipes.push(names[vi]);
        } else out.phantom += ph;
        i = j + 1;
      } else i++;
    }
    const lastRow = R[R.length - 1] && R[R.length - 1][1][vi];
    if (lastRow) { out.popEnd += lastRow[C.pop]; if (lastRow[C.pop] === 0) out.emptyEnd++; }
  }
  return out;
}
if (process.argv[3] && process.argv[4]) {
  const f = files.find((x) => seedOf(x) === +process.argv[3]); if (!f) { console.error('시드 없음'); process.exit(1); }
  const o = load(f), vi = o.names.indexOf(process.argv[4]); if (vi < 0) { console.error('마을 없음'); process.exit(1); }
  const a = analyse(o).pins.filter((p) => p.name === process.argv[4]);
  const pin = a[0]; if (!pin) { console.log('묶임 없음'); process.exit(0); }
  const d0 = Math.max(0, pin.from - 30), d1 = pin.to + 3;
  console.log(`| 날 | 인구 | 곳간(식량 환산) | 곳간 Δ | 먹은 양 | 식량 일꾼 | 식량 흐름 EMA | K | 로지스틱 | 굶주림 | 건강 | 행복 | 그날 dP | 누적 압력 | 그날 죽음 | 죽음 누계 | 징발 | 자유민 |`);
  console.log('|' + '---|'.repeat(18));
  let prev = null;
  for (const row of o.rows) {
    if (row[0] < d0 || row[0] > d1) continue; const r = row[1][vi];
    console.log(`| ${row[0]} | ${r[C.pop]} | ${r[C.tfe]} | ${prev == null ? '' : (r[C.tfe] - prev).toFixed(1)} | ${r[C.eaten]} | ${r[C.foodWorkers]} | ${r[C.surplusFood]} | ${r[C.K]} | ${r[C.logi]} | ${r[C.hunger]} | ${r[C.health]} | ${r[C.happy]} | ${r[C.dP]} | ${r[C.dPAccum]} | ${r[C.deathsToday]} | ${r[C.deadTot]} | ${r[C.drafted]} | ${r[C.free]} |`);
    prev = r[C.tfe];
  }
} else {
  console.log('| 시드 | 일 | 묶인 마을(≥10일) | 묶인 날 합 | 셈만 느는 죽음 | 몰사 | 빈 마을(끝) | 끝 인구 |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const f of files) {
    const a = analyse(load(f));
    console.log(`| ${seedOf(f)} | ${a.days} | ${a.pins.length} | ${a.pins.reduce((s, p) => s + p.len, 0)} | ${a.phantom} | ${a.wipes.length}${a.wipes.length ? ' (' + a.wipes.join(' · ') + ')' : ''} | ${a.emptyEnd} | ${a.popEnd} |`);
  }
  console.log('\n묶인 마을 목록:');
  for (const f of files) { const a = analyse(load(f)); for (const p of a.pins) console.log(`  시드 ${seedOf(f)} ${p.name} ${p.from}~${p.to}일(${p.len}일) 인구 ${p.pop} · 셈만 ${p.phantom} · 곳간 ${p.tfe0} → ${p.tfe1}${p.wipe ? ' · 몰사' : ''}`); }
}
