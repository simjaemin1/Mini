#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T972 다시 셈 표 기계 · 판 JSON 만 읽는다 · 세계 안 만짐)
// === scripts/t972-recount.js — 같은 판에 건 옛 칸 관찰기 ↔ 새 칸 관찰기 줄 대조 (T963 죽음 칸 구멍 · 옛 보고 다시 셈) ===
//   옛 판(그 보고의 커밋 작업 트리)에서 그 보고의 관찰기를 그대로 두고, 같은 관찰기의 새 칸 본(`<이름>n-observe.js`)을 한 판에 같이 건다:
//     sed -e "s#^const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));#&\nconst DD = require('./lib-day-deaths'); DD.install(V1);#" \
//         -e "s#v\._deathsToday || 0#DD.deathsToday(v)#" -e "s#\.t934\.json#.t934n.json#g" -e "s#T934_OUT#T934N_OUT#g" scripts/t934-observe.js > scripts/t934n-observe.js
//     (+ `scripts/lib-day-deaths.js` 를 그 트리에 복사 · t875 는 팔(`T875_ARM`)을 새 칸 본에서 끈다 — 팔은 옛 본 하나만 건다)
//   두 관찰기는 같은 판 · 같은 장부 `scanDay` 에서 같은 마을을 읽는다 ⇒ 다른 칸은 다 같고 그날 죽음 칸만 갈린다.
//
//   node scripts/t972-recount.js pair <옛.json> <새.json> [칸=deaths]     # 줄 대조: 첫해(날 < 365) · 판 전체 죽음 합 · 어긋난 마을-날 · 그중 인구 0
//   node scripts/t972-recount.js shield <켬 틀> <끔 틀> <확장자>          # T934 §1-3 꼴: 켬 판 첫해 보호막이 선 마을의 첫해 죽음(켬 · 끔) · 틀의 %s = 시드
'use strict';
const fs = require('fs');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const SEEDS = [1020, 7, 42];
const [mode, ...a] = process.argv.slice(2);

function pair(fa, fb, col) {
  const A = J(fa), B = J(fb);
  const ci = A.cols.indexOf(col), pi = A.cols.indexOf('pop');
  if (ci < 0) throw new Error(`칸 ${col} 없음 — ${A.cols.join(' ')}`);
  if (A.rows.length !== B.rows.length) throw new Error('줄 수가 다르다 — 같은 판이 아니다');
  const r = { o365: 0, n365: 0, o: 0, n: 0, bad: 0, badEmpty: 0, ex: [] };
  A.rows.forEach(([day, row], k) => {
    const [dayB, rowB] = B.rows[k];
    if (dayB !== day) throw new Error(`날 어긋남 ${day} ↔ ${dayB}`);
    row.forEach((x, i) => {
      if (!x) return;
      const y = rowB[i];
      for (let c = 0; c < x.length; c++) if (c !== ci && JSON.stringify(x[c]) !== JSON.stringify(y[c])) throw new Error(`죽음 칸 밖이 다르다 ${day} ${A.names[i]} ${A.cols[c]}`);
      r.o += x[ci]; r.n += y[ci];
      if (day < 365) { r.o365 += x[ci]; r.n365 += y[ci]; }
      if (x[ci] !== y[ci]) { r.bad++; if (x[pi] === 0) r.badEmpty++; if (r.ex.length < 3) r.ex.push(`${day}:${A.names[i]}:N${x[pi]}:${x[ci]}→${y[ci]}`); }
    });
  });
  return r;
}

function shield(onT, offT, ext) {
  const t = { villages: 0, shielded: 0, onSh: 0, offSh: 0, onRest: 0, offRest: 0 };
  for (const s of SEEDS) {
    const A = J(onT.replace('%s', s) + ext), C = J(offT.replace('%s', s) + ext);
    const ci = A.cols.indexOf('deaths'), si = A.cols.indexOf('shieldAte');
    const sh = new Set();
    for (const [d, row] of A.rows) { if (d >= 365) break; row.forEach((x, i) => { if (x && (+x[si] || 0) > 0) sh.add(A.names[i]); }); }
    const sum = (O, inSh) => { let n = 0; for (const [d, row] of O.rows) { if (d >= 365) break; row.forEach((x, i) => { if (x && sh.has(O.names[i]) === inSh) n += x[ci]; }); } return n; };
    t.villages += A.names.length; t.shielded += sh.size;
    t.onSh += sum(A, true); t.offSh += sum(C, true); t.onRest += sum(A, false); t.offRest += sum(C, false);
  }
  t.ratio = +(t.offSh / t.onSh).toFixed(2);
  return t;
}

if (mode === 'pair') console.log(JSON.stringify(pair(a[0], a[1], a[2] || 'deaths')));
else if (mode === 'shield') console.log(JSON.stringify(shield(a[0], a[1], a[2])));
else { console.error('쓰는 법: pair <옛> <새> [칸] | shield <켬 틀> <끔 틀> <확장자>'); process.exit(2); }
