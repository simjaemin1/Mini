// (@regress 없음 — 러너 밖 계측 훅 · T1353 ① 진단 · 세계에 0)
// === scripts/t1353-board-hook.js — 사람 0 판의 게시판: 의뢰가 걸린 마을 · 보상으로 잠긴 품목 · 못 갚아 안 건 수 ====================
//
// ★쓰는 법: 서버 판(`server-baseline-check.js` · `t577-server-run.js`) 아이 존에 `--require` 로 싣는다 — 판 env 에 그대로:
//   T1353_BOARD_OUT=/tmp/x.json NODE_OPTIONS="--require $(pwd)/scripts/t1353-board-hook.js" node scripts/server-baseline-check.js … --plan 1020:400
// ★무엇: 장부(`events.createLedger`)의 게시 · 철회 훅(`onRequest`)을 곁에서 듣고(원래 훅은 그대로 부른다), 하루 끝(`scanDay`)마다
//   ⓐ 의뢰가 하나라도 걸린 마을 수 ⓑ 걸린 의뢰 수 ⓒ 보상으로 잠긴 품목 수(마을마다 걸린 의뢰의 `rewItem` 종류 합 — 거래소 `lockedRewards` 와 같은 뜻)
//   ⓓ 장부 수(`stats` — 게시 · 철회 · 축소 · 못갚아미게시 · 재검증) 를 적는다. 읽기만 — 세계 · 장부 값에 0.
'use strict';
if (!process.env.T1353_BOARD_OUT) return;
const path = require('path');
const fs = require('fs');
const Ev = require(path.join(__dirname, '..', 'server', 'events'));
const mk = Ev.createLedger;
const days = [];
let L0 = null;
const NB_ECON = process.env.T1368_NB_ECON ? new Set(process.env.T1368_NB_ECON.split(',')) : null;   // [T1368] 옛 코드 재기용
const open = new Map();   // vid → Map(item → rewItem)
const arr = [];          // [날, 도착 지점 수, 영토 안, 안일 때 밖까지 셀(중앙값), 최대]
Ev.createLedger = function (o) {
  const oo = Object.assign({}, o || {});
  const onR = oo.onRequest;
  oo.onRequest = (r, kind) => {
    try {
      let m = open.get(r.vid); if (!m) open.set(r.vid, m = new Map());
      if (kind === 'open') m.set(r.item, r.rewItem || null); else m.delete(r.item);
    } catch (e) {}
    if (onR) return onR(r, kind);
  };
  const L = mk.call(this, oo);
  L0 = L;
  const sd = L.scanDay;
  let last = -1;
  L.scanDay = function (world, day) {
    const ret = sd.apply(this, arguments);
    try {
      const d = day | 0;
      if (d !== last) {
        last = d;
        let vils = 0, reqs = 0, locked = 0, unpaid = 0;
        for (const m of open.values()) {
          if (!m.size) continue;
          vils++; reqs += m.size;
          const rw = new Set(); for (const x of m.values()) { if (x) rw.add(x); else unpaid++; }
          locked += rw.size;
        }
        const S = L.stats || {};
        //   ★[T1368] 새 사람이 낼 수 있는 의뢰(장부 `newbieHas` — 켬만 참)가 걸린 마을 수 · 그중 "날마다 쓰는 것" 의뢰(`daily`) 수
        //     옛 코드(장부에 `newbieHas` 없음)를 같은 자로 재려면 econ 품목 목록을 env 로 준다(`T1368_NB_ECON=fruit,herb,wood,stone` — 켬 장부가 내는 목록 그대로).
        let nbV = 0, daily = 0;
        const nbHas = NB_ECON ? (it) => NB_ECON.has(it) : (typeof L.newbieHas === 'function' ? L.newbieHas : null);
        if (nbHas) for (const vid of open.keys()) {
          const rows = (L.board(vid) || []); if (rows.some((q) => nbHas(q.item))) nbV++; daily += rows.filter((q) => q.fit === 'daily').length;
        }
        days.push([d, vils, reqs, locked, unpaid, S.reqOpened | 0, S.reqClosed | 0, S.reqShrunk | 0, S.reqNoPay | 0, S.reqRevalidated | 0, (world.villages || []).length, nbV, daily]);
        //   ★도착 지점이 영토 안인가(25날마다) — 온보딩 도착 표(부팅 때 굽는다) × 마을 영토 칸(`villageOfCell` 정본) · 안이면 바깥(마을을 등진 쪽)으로 몇 셀 가야 영토 밖인가
        if (d % 25 === 0) {
          try {
            const Onb = require(path.join(__dirname, '..', 'server', 'onboarding')), SV = require(path.join(__dirname, '..', 'server', 'villages'));
            const A = Onb.arrivals ? Onb.arrivals() : null;
            if (A && A.size && SV.villageOfCell) {
              let inside = 0; const steps = [];
              for (const a of A.values()) {
                if (!SV.villageOfCell(a.cx, a.cy)) continue;
                inside++;
                const fl = Math.hypot(a.faceX, a.faceY) || 1; let k = 1;
                for (; k <= 120; k++) if (!SV.villageOfCell(Math.round(a.cx - a.faceX / fl * k), Math.round(a.cy - a.faceY / fl * k))) break;
                steps.push(k);
              }
              steps.sort((x, y) => x - y);
              arr.push([d, A.size, inside, steps.length ? steps[Math.floor(steps.length / 2)] : 0, steps.length ? steps[steps.length - 1] : 0]);
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
    return ret;
  };
  return L;
};
process.on('exit', () => {
  try {
    const tag = process.env.T577_OUT ? path.basename(process.env.T577_OUT) : String(process.pid);
    fs.writeFileSync(process.env.T1353_BOARD_OUT.replace(/\.json$/, '') + '-' + tag + '.json',
      JSON.stringify({ knob: !!Ev.T1341_OWN_HOUSE, cols: ['day', 'vilsWithReq', 'openReqs', 'lockedRewItems', 'openNoRew', 'opened', 'closed', 'shrunk', 'noPay', 'revalidated', 'villages', 'vilsWithNewbieReq', 'dailyReqs'], days, arrCols: ['day', 'arrivals', 'insideTerritory', 'cellsOutMedian', 'cellsOutMax'], arr }));
  } catch (e) {}
});
