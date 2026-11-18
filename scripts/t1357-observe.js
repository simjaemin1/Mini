'use strict';
// (@regress 없음 — 러너 밖 · T1357 관찰기 · 제품 무변 · 읽기만 · ★결과만 읽는다 — 묶음 갈래 함수 · 칸을 부르지 않는다)
// === scripts/t1357-observe.js — 묶음 켬 기본 검사(T1357 · 구현을 안 본 세션)의 판 결과 줄 — econ `tickVillage` 곁 ===
//   서버 판 자: NODE_OPTIONS="--require $PWD/scripts/t1357-observe.js" node scripts/server-baseline-check.js --make <판.json> --days 800 --seeds 1020 --vclock --side off
//     (아이 존 안 · `T577_OUT` 곁 `<…>.t1357.json`) · 몸 판(t1308): 같은 프리로드 · 마디마다 `seg-<날>.t1357.json`
//   랩 자: T1357_OUT=<파일> NODE_OPTIONS="--require $PWD/scripts/t1357-observe.js" node scripts/t176-ab.js 400 1020
//   읽는 것(플레이어 · 화면이 보는 결과와 같은 층): 마을 사람(`v.npcs`) · 직업(`currentJob`) · 나이 · 곳간 식량 합계(`totalFoodEquivalent`) ·
//     죽음 누계(`_deadTot` · 굶어 죽음 `_fdDeadTot`) · 떠남 누계(`_emigTot`) · 마을 이름. 묶음 손잡이 · 갈래 칸은 안 읽는다.
//   날 줄(세계 합): day · vil(틱 마을) · pop · empty(사람 0 마을) · newP(새로 선 사람 — 난 사람 + 들어온 사람 · econ 의 새 사람은 16 살로 서므로 나이로 못 가른다) ·
//     dead(죽음 누계 차) · fd(굶어 죽음 차) · emig(떠남 차) · low10(곳간 < 사람 × 10 마을) · minPop(사람 > 0 마을 중 가장 적은 사람)
//   마을 줄(10날마다): [날, [[이름, 사람, 곳간 ÷ 사람, 굶어 죽음 누계, 죽음 누계, 새 사람 누계, 떠남 누계, 직업 수(간추린 {직업: 사람})], …]]
//   주사위 0 · 캐시 0 · 세계에 아무것도 안 쓴다.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = process.env.T1357_OUT || (SERVER && process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1357.json' : '');
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const COLS = ['day', 'vil', 'pop', 'empty', 'newP', 'dead', 'fd', 'emig', 'low10', 'minPop'];
const rec = { cols: COLS, rows: [], vcols: ['name', 'pop', 'foodPer', 'fdTot', 'deadTot', 'bornTot', 'emigTot', 'jobs'], vrows: [], err: null, server: SERVER };
let cur = null, lastWrite = -1;
const seen = new WeakSet();
const last = new WeakMap();   // v → { dead, fd, emig, born }
const vrow = new Map();       // 이름 → 마지막 줄(그날 마을 줄 모음)
function flush() {
  if (!cur) return;
  if (cur.minPop === Infinity) cur.minPop = 0;
  rec.rows.push(COLS.map((k) => cur[k]));
  if (cur.day % 10 === 0 && vrow.size) rec.vrows.push([cur.day, [...vrow.values()]]);
  vrow.clear();
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try {
    if (!cur || cur.day !== day) {
      flush();
      cur = { day, minPop: Infinity }; for (const k of COLS) if (k !== 'day' && k !== 'minPop') cur[k] = 0;
      if (day % 10 === 0 && day !== lastWrite) { lastWrite = day; try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  const r = _t.apply(this, arguments);
  try {
    const npcs = v.npcs || [];
    const N = npcs.length;
    const L = last.get(v) || { dead: v._deadTot || 0, fd: v._fdDeadTot || 0, emig: v._emigTot || 0, born: 0, first: true };
    let born = 0;
    for (const p of npcs) {
      if (seen.has(p)) continue; seen.add(p);
      if (L.first) continue;   // 처음 본 날 = 시작 사람(난 사람 아님)
      born++;
    }
    const dead = v._deadTot || 0, fd = v._fdDeadTot || 0, emig = v._emigTot || 0;
    cur.vil++; cur.pop += N; if (N === 0) cur.empty++; else if (N < cur.minPop) cur.minPop = N;
    cur.newP += born; cur.dead += dead - L.dead; cur.fd += fd - L.fd; cur.emig += emig - L.emig;
    let fe = 0; try { fe = V1.totalFoodEquivalent(v); } catch (e) {}
    if (N > 0 && fe < N * 10) cur.low10++;
    const B = L.born + born;
    last.set(v, { dead, fd, emig, born: B, first: false });
    if (day % 10 === 0) {
      const jobs = {}; for (const p of npcs) { const j = p.currentJob || '-'; jobs[j] = (jobs[j] || 0) + 1; }
      vrow.set(v.name || String(vrow.size), [v.name || '', N, N ? +(fe / N).toFixed(2) : 0, fd, dead, B, emig, jobs]);
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return r;
};
process.on('exit', () => { try { flush(); cur = null; fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
