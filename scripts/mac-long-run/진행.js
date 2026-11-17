#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1335 맥 긴 판 러너 정본 · 읽기만)
// === scripts/mac-long-run/진행.js — 맥 긴 판(판.sh · T1308 판 폴더) 진행 한 화면 ===
//   쓰는 법: node 진행.js <판 폴더>        (판 폴더 = ~/Mini/_runs/<카드> — 그 밑에 progress.json 이 있는 폴더마다 한 판)
//   찍는 것(판마다): 상태(끝 · 도는 중 · 멈춤) · 체크포인트 날 · 지금 econ 날 · 마디 · 인구 · 몸 · 누적 CPU · 최근 하루 CPU · 남은 시간 어림
//            판이 둘 이상이면 같은 날의 인구 비(첫 판 = 기준 — 판목록의 첫 판).
//   관찰기 t1243(`seg-<날>.t1243.json` — 날 줄 `rows` · 날마다 CPU `cpu`)이 있으면 쓴다. 없으면 progress 만.
'use strict';
const fs = require('fs'), path = require('path');
const B = process.argv[2] || __dirname;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
// 살아 있나 — 같은 기계면 감독 pid 로, 다른 기계(맥 연결 VM 에서 맥 판을 볼 때 · pid 가 안 보인다)면 진행 줄(30초마다 쓰임)이 2분 안에 바뀌었는지로
const alive = (pf, d) => { try { process.kill(+fs.readFileSync(pf, 'utf8'), 0); return true; } catch (e) {} try { return Date.now() - fs.statSync(path.join(d, 'progress.txt')).mtimeMs < 120000; } catch (e) { return false; } };
let order = [];
try { order = fs.readFileSync(path.join(B, '판목록.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !/^[A-Z]+=/.test(l)).map((l) => l.split(/\s+/)[0]); } catch (e) {}
const dirs = fs.readdirSync(B).filter((n) => fs.existsSync(path.join(B, n, 'progress.json')));
dirs.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
if (!dirs.length) { console.log('아직 띄운 판이 없습니다.'); process.exit(0); }
const pops = {};
for (const n of dirs) {
  const d = path.join(B, n), P = rd(path.join(d, 'progress.json')) || {};
  let pt = ''; try { pt = fs.readFileSync(path.join(d, 'progress.txt'), 'utf8').trim(); } catch (e) {}
  const st = P.done ? '끝' : (alive(path.join(d, 'guard.pid'), d) ? '도는 중' : '멈춤(다시 더블클릭하면 이어 돕니다)');
  const rows = new Map(), cpu = new Map();
  for (const f of fs.readdirSync(d).filter((x) => /^seg-\d+\.t1243\.json$/.test(x)).sort((x, y) => parseInt(x.slice(4), 10) - parseInt(y.slice(4), 10))) {
    const o = rd(path.join(d, f)); if (!o) continue;
    for (const r of o.rows || []) rows.set(r[0], r);
    for (const c of o.cpu || []) cpu.set(c[0], c[1]);
  }
  const days = [...rows.keys()].sort((a, b) => a - b), D = days.length ? days[days.length - 1] : 0, last = D ? rows.get(D) : null;
  const cs = [...cpu.entries()].sort((a, b) => a[0] - b[0]), tot = cs.reduce((x, c) => x + c[1], 0);
  const rec = cs.slice(-10), avg = rec.length ? rec.reduce((x, c) => x + c[1], 0) / rec.length : 0;
  const segSec = (P.segs || []).reduce((x, s) => x + (s.sec || 0), 0);
  pops[n] = new Map(days.map((k) => [k, rows.get(k)[1]]));
  console.log(`[${n}] ${st} · ${P.days}날 · 시드 ${P.seed} · 마디 ${P.every}날 · 체크포인트 날 ${P.ck} · 마디 ${(P.segs || []).length}개 끝(${(segSec / 3600).toFixed(1)}시간)`);
  if (pt) console.log(`    ${pt}`);
  if (last) console.log(`    관찰 날 ${D} · 인구 ${last[1]} · 몸 ${last[10] != null ? last[10] : '—'} · 누적 CPU ${(tot / 3600).toFixed(1)}시간 · 최근 ${rec.length}날 하루 ${avg.toFixed(0)}초` +
    (P.done ? '' : ` · 남은 어림 ${((P.days - D) * avg / 3600).toFixed(1)}시간 이상(날이 갈수록 무거워진다)`));
}
if (dirs.length >= 2) {
  const [b0, ...rest] = dirs, m0 = pops[b0];
  for (const n of rest) {
    const m = pops[n], common = [...m.keys()].filter((k) => m0.has(k)).sort((a, b) => a - b);
    if (common.length) { const k = common[common.length - 1]; console.log(`인구 비 ${n} / ${b0} — 날 ${k}: ${m.get(k)} / ${m0.get(k)} = ${(m.get(k) / m0.get(k)).toFixed(3)}`); }
  }
}
