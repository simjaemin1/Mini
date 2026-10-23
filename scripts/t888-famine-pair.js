#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T888 표 기계 · 세계 안 만짐)
// === scripts/t888-famine-pair.js — 첫해 기근 켬/끔 견줌(T858 표 기계 `t858-table.js --json` 의 판 수 · 띠를 그대로 읽는다) ===
//   node scripts/t888-famine-pair.js <t858-table json> [x=off] [y=on]
//   칸은 T858 견줌 표와 같다: 판끼리 차(y − x) · 두 띠 폭 · 띠 평균 차 · 띠 겹침 · |차| > 큰 띠 폭(T837 `diverge-table` 과 같은 칸 · 판정 0).
//   ⚠셈 이름표는 `t858-table.js` 의 `KEYS` 와 같은 차례 · 같은 글자다(그 파일은 모듈이 아니라 읽어 온다 — 사본 0).
'use strict';
const fs = require('fs');
const path = require('path');
const [F, X = 'off', Y = 'on'] = process.argv.slice(2);
if (!F) { console.error('쓰는 법: node scripts/t888-famine-pair.js <json> [x] [y]'); process.exit(2); }
const doc = JSON.parse(fs.readFileSync(F, 'utf8'));
const src = fs.readFileSync(path.join(__dirname, 't858-table.js'), 'utf8');
const m = /const KEYS = (\[[\s\S]*?\]\]);/.exec(src);
// eslint-disable-next-line no-new-func
const KEYS = m ? Function(`return ${m[1]};`)() : [];
if (!KEYS.length) { console.error('t858-table.js 의 KEYS 를 못 읽었다'); process.exit(2); }
const r1 = (x) => Math.round(x * 10) / 10;
const fmt = (x) => (x == null ? '—' : (typeof x === 'number' ? (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : String(r1(x))) : String(x)));
const sx = doc.server[X], sy = doc.server[Y];
if (!sx || !sy) { console.error(`서버 판 ${X} · ${Y} 가 없다 — 있는 판: ${Object.keys(doc.server).join(' ')}`); process.exit(2); }
const bx = doc.bands[X], by = doc.bands[Y];
console.log(`\n#### 몸 걸음 켬 − 끔(${Y} − ${X}) · 서버 400날 3시드 합 · 띠 = 그 판 + 갈림 대조(${X} ${bx ? bx.n : 1}판 · ${Y} ${by ? by.n : 1}판)\n`);
console.log(`| 셈 | ${X} | ${Y} | 차(${Y} − ${X}) | ${X} 띠 폭 · ${Y} 띠 폭 | 띠 평균 차 | 띠 겹침 | |차| > 큰 띠 폭 |`);
console.log('|---|---|---|---|---|---|---|---|');
for (const [k, nm] of KEYS) {
  const a = sx.sum[k], b = sy.sum[k], d = b - a, ba = bx && bx.by[k], bb = by && by.by[k];
  const ov = ba && bb ? !(ba.hi < bb.lo || bb.hi < ba.lo) : null, big = ba && bb ? Math.abs(d) > Math.max(ba.w, bb.w) : null;
  const dm = ba && bb ? bb.mean - ba.mean : null;
  console.log(`| ${nm} | ${fmt(a)} | ${fmt(b)} | ${d > 0 ? '+' : ''}${fmt(d)} | ${ba ? fmt(ba.w) : '—'} · ${bb ? fmt(bb.w) : '—'} | ${dm == null ? '—' : (dm > 0 ? '+' : '') + fmt(dm)} | ${ov == null ? '—' : ov ? '겹침' : '**띠 밖**'} | ${big == null ? '—' : big ? '**예**' : '아니오'} |`);
}
//   첫해(365일 앞) 굶어 죽음 · 굶는 마을-날 — 서버 판 · 랩 판
const first = (s) => `${fmt(s.famine[0])} · ${fmt(s.starve[0])}`;
console.log('\n| 판 | 첫해(365일 앞) 굶어 죽음 · 굶는 마을-날 | 빈 마을(365일 앞) | 끝 인구 |');
console.log('|---|---|---|---|');
for (const [k, g] of Object.entries(doc.lab || {})) console.log(`| 랩 ${k} | ${first(g.sum)} | ${g.sum.empty}(${g.sum.emptyBefore365}) | ${fmt(g.sum.popEnd)} |`);
for (const [k, g] of Object.entries(doc.server || {})) console.log(`| 서버 ${k} | ${first(g.sum)} | ${g.sum.empty}(${g.sum.emptyBefore365}) | ${fmt(g.sum.popEnd)} |`);
