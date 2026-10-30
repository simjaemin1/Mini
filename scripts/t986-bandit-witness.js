'use strict';
// (@regress 없음 — 러너 밖 · T986 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t986-bandit-witness.js — 도적 하루가 **어떤 마을 상태를 보고** 돌았나(서버 판 자 곁 프리로드) ==========================
//
// ★[T986 2026-10-28] 손잡이 `T986_BANDIT_DAY`(bandits.js `dayTick` 머리 주석)의 증인. 아이 존 안에서(`T577_SEED`) 두 지문을 날마다 남긴다:
//   ① 머리 뒤 결산 수 — econ 정본 조각(`tickWorldV2Parts`)의 날 올림(`head`) 뒤 도적 하루까지 결산한 마을 수(`village`)
//   ② 도적 지문 — 도적 하루(`_dayRun`)가 **돌기 바로 앞**의 econ 마을 상태 · 어느 길로 불렸나(`tick` = 존 틱 `onGameTick` · `day` = 하루 마감 `dayTick`)
//   ③ 장부 지문 — 사건 장부 `scanDay`(econ 하루 끝 · 서버 기준선 자가 지문을 뜨는 그 문) 때의 같은 상태(곁 증인)
//   상태 = 마을마다 곳간 전 칸 · 금고 · 사람 수(1e-6 · 서버 기준선 지문 st · tr · 사람 수와 같은 꼴) → sha1 앞 12자리.
//   켬이면 ① = 0(날을 올린 머리 바로 뒤 · 마을 조각 앞)이 날마다 두 시계 같다 · 끔이면 머리가 든 틱의 끝이라 그 틱에 든 마을 수만큼(> 0).
//   도적 하루가 돌지 이번 부름에서 돌지는 `Bandits.t986().lastDay` 가 날과 다른지로 안다(그 함수의 첫 줄과 같은 술어).
// 쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t986-bandit-witness.js [-r $PWD/scripts/t745-vclock.js]" node scripts/t577-server-run.js 40 42
// 출력: `<판>.t986.json`(T577_OUT 곁 · `T986_OUT` 로 바꿀 수 있다)
if (!process.env.T577_SEED) return;
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.T986_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t986.json' : '');
const R6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const stor = (o) => { if (!o || typeof o !== 'object') return R6(o); const r = {}; for (const k of Object.keys(o).sort()) r[k] = R6(o[k]); return r; };
const digest = (world) => crypto.createHash('sha1').update(JSON.stringify((world.villages || []).map((v) => [v.name, stor(v.storage), stor(v.treasury), (v.npcs || []).length]))).digest('hex').slice(0, 12);
const rec = { scan: {}, bandit: {} };
let W = null, sinceHead = 0;
const E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const mkP = E2.tickWorldV2Parts;
if (typeof mkP === 'function') E2.tickWorldV2Parts = function () {
  const P = mkP.apply(this, arguments);
  if (P && typeof P.head === 'function') { const h = P.head; P.head = function () { const r = h.apply(this, arguments); sinceHead = 0; return r; }; }
  if (P && typeof P.village === 'function') { const v = P.village; P.village = function () { sinceHead++; return v.apply(this, arguments); }; }
  return P;
};
const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments); const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { W = world; const d = day | 0; if (!(d in rec.scan)) rec.scan[d] = digest(world); } catch (e) { /* 관찰 실패는 세계에 0 */ }
    return sd.apply(this, arguments);
  };
  return L;
};
const B = require(path.join(ROOT, 'server', 'bandits'));
const wrap = (name, via) => {
  const f = B[name]; if (typeof f !== 'function') return;
  B[name] = function () {
    let pre = null;
    try {
      const t = B.t986 ? B.t986() : null, w = W;
      if (t && w && (w.day | 0) !== t.lastDay && !((w.day | 0) in rec.bandit)) pre = [w.day | 0, digest(w), sinceHead];   // 이번 부름에서 하루가 돌 수 있다 — 그 앞 상태
    } catch (e) { /* 관찰 실패는 세계에 0 */ }
    const r = f.apply(this, arguments);
    try { if (pre && B.t986().lastDay === pre[0]) rec.bandit[pre[0]] = [pre[1], via, pre[2]]; } catch (e) { }   // 실제로 이 부름에서 돌았을 때만 적는다
    return r;
  };
};
wrap('onGameTick', 'tick');
wrap('dayTick', 'day');
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
