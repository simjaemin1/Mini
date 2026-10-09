#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T661 계측 · 제품 무변)
// === scripts/t661-arrive.js — 서버 판 자 한 판의 **캐러밴 도착일 분포 · 가드 발동 수**를 낸다 ==========
//   쓰는 법: node scripts/t661-arrive.js <판 디렉터리>/<TAG>-<시드>.log [<같은 판>.json.t650.json] [--upto N]
//   ★읽는 것(전부 읽기만):
//     · 아이 존 로그 — 가드 줄(`econ 도착 +N일 지연(잔여 …)` · 켬이면 끝에 `T661 장부`) · 재경로 연장 줄 · 출발 줄(`econ dA→dB`)
//     · [있으면] `t650-print.js` 날 지문의 교역 기록(`tl` — 도착한 날 · `travelDays`) — 도착일 − 출발일 분포
//   ★낸다: 가드 발동 수 · 민 날 합 · 한 번에 민 날 분포 · 출발 줄 수 · 교역 기록 수 · travelDays 평균/중앙/90%/최대 · 날마다 도착 수 합(첫 N 일)
'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
const upto = args.includes('--upto') ? +args[args.indexOf('--upto') + 1] : Infinity;
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--upto');
const [logF, fpF] = files;
const log = fs.readFileSync(logF, 'utf8').split('\n');
const guard = [], repath = [];
let dep = 0, back = 0;
for (const L of log) {
  let m = L.match(/캐러밴#(\d+) econ 도착 \+(\d+)일 지연\(잔여 (\d+)px/);
  if (m) { guard.push({ id: +m[1], n: +m[2], px: +m[3], t661: L.includes('T661 장부') }); continue; }
  m = L.match(/캐러밴#(\d+) 차단 감지 → 로컬 재경로 성공\(연장 (\d+)px(?:, econ 도착 \+(\d+)일 지연)?/);
  if (m) { repath.push({ id: +m[1], n: +(m[3] || 0) }); continue; }
  if (/캐러밴#\d+ 출발: /.test(L)) dep++;
  else if (/캐러밴#\d+ 귀환 출발: /.test(L)) back++;
}
const hist = (xs) => { const h = {}; for (const x of xs) h[x] = (h[x] || 0) + 1; return Object.keys(h).map(Number).sort((a, b) => a - b).map((k) => `${k}:${h[k]}`).join(' '); };
const q = (xs, p) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const out = {
  log: logF,
  departures: dep, returnLegs: back,
  guard: { fires: guard.length, daysPushed: guard.reduce((s, g) => s + g.n, 0), perFire: hist(guard.map((g) => g.n)), fullRoute: guard.filter((g) => g.px > 15000).length, t661: guard.filter((g) => g.t661).length },
  repath: { fires: repath.length, daysPushed: repath.reduce((s, g) => s + g.n, 0) },
};
if (fpF && fs.existsSync(fpF)) {
  const F = JSON.parse(fs.readFileSync(fpF, 'utf8'));
  const td = [], perDay = [];
  for (const r of F.days) {
    if (r.d > upto) break;
    let n = 0;
    for (const s of (r.tl || [])) { let t; try { t = JSON.parse(s); } catch (e) { continue; } if (Number.isFinite(t.travelDays)) td.push(t.travelDays); n++; }
    perDay.push(n);
  }
  out.trades = { n: td.length, travelDays: { mean: td.length ? +(td.reduce((a, b) => a + b, 0) / td.length).toFixed(3) : null, p50: q(td, 0.5), p90: q(td, 0.9), max: td.length ? Math.max(...td) : null, hist: hist(td) },
    days: perDay.length };
}
console.log(JSON.stringify(out, null, 1));
