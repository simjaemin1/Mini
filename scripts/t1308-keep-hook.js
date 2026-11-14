'use strict';
// (@regress 없음 — 러너 밖 · T1308 판 자 프리로드 · 제품 무변 — 계측 사본만)
// === scripts/t1308-keep-hook.js — 이어 도는 판 자(`t1308-long-run.js`)의 **판 자 쪽 잇기**: 제품 DB 가 안 싣는 메모리 칸을 마디 경계에서 넘긴다 ==========
//   제품은 재기동 때 DB(마을 행 · 메타 행[rng · 앵커 · 캐러밴 · 전쟁 · 몸 칸])로 세계를 되살린다. 그 밖에 메모리에만 사는 칸이 있다 —
//   그 칸이 다음 날들의 값을 바꾸면 끊고 이은 판이 한 번에 돈 판과 갈린다(보고 T1308 §2). 이 훅은 그 칸만 마디 끝 → 다음 마디 머리로 옮긴다.
//   옮기는 칸(재어서 고른 것 — 끊고 이은 30날 판의 첫 갈림에서 거꾸로):
//     ① `world._capTransit` — 포로 귀향 추상 이송 줄(war-core · "비영속: 재부팅 유실분은 다시 줄에 넣는다" — 다시 넣을 때 eta 가 그 날부터 새로 선다 ⇒ 귀향 날이 밀린다)
//     ② `world._effDemCache` — 유효 수요의 세계 재고 캐시(v2 `_worldStockOf` — **econ 날마다 처음 부를 때** 그 순간 곳간으로 선다). 재기동 뒤엔 비어
//        같은 날을 멈춘 순간(날 끝) 곳간으로 다시 세운다 ⇒ 다음 교역 목표가 갈린다(끊고 이은 30날 판 · 20날 멈춤 → 22날 캐러밴 50 : 51).
//     ③ `world._nevCache` — 같은 꼴의 그날 값 캐시(v2 · Map 둘 — 열쇠 · 값 쌍으로)
//     ④ 마을마다 `_near20` · `_near20N` — 교역 후보 가까운 20곳 캐시(v2 — **처음 부를 때** 그때의 거리로 선다 · 마을 수가 바뀌거나 거리 행렬이 다시 꽂힐 때만 비운다).
//        재기동 뒤엔 비어 다음 교역 때 지금 거리 행렬로 다시 선다 — 한 번에 돈 판의 목록(첫날 거리)과 달라 후보 · 캐러밴이 갈린다(20날 멈춤 → 22날 캐러밴 50 : 51 의 주인).
//     (교역 장부 `tradeLog` 는 제품이 날마다 비우니 옮기지 않는다 — 옮기면 지문만 갈린다)
//   T1308_KEEP_OUT=<파일> — 프로세스가 내려갈 때(멈춤 팔 SIGTERM 뒤 exit) 지금 값을 쓴다(사람 · 마을은 id · 이름으로).
//   T1308_KEEP_IN=<파일>  — 다시 뜬 판이 준비되는 순간(`state.ready` — 첫 econ 날 앞) 되돌린다.
//   T1308_KEEP=0 — 이 훅을 안 쓴다(대조).
//   T1308_BAIT_RNG=1 — (하네스 미끼) 되돌린 뒤 econ 난수 상태를 다른 값으로 덮는다 = "난수 상태를 안 잇는 사본" — 끊고 이은 판이 갈려야 한다(빨강).
const path = require('path');
const fs = require('fs');
if (process.env.T1308_KEEP === '0') return;
const KOUT = process.env.T1308_KEEP_OUT || '', KIN = process.env.T1308_KEEP_IN || '';
if (!KOUT && !KIN) return;
const ROOT = path.join(__dirname, '..');
const VILL = path.join(ROOT, 'server', 'villages.js');
const st = () => { try { const V = require(VILL); return V.__t740 ? V.__t740() : null; } catch (e) { return null; } };
const STAT = { out: null, in: null };
global.__t1308Keep = () => STAT;

function pack(W) {
  const cap = (W._capTransit || []).map((t) => { const o = {}; for (const [k, v] of Object.entries(t)) {
    if (k === 'npc') o.npc = v && v.id != null ? v.id : null;
    else if (k === 'from' || k === 'to') o[k] = v && v.name != null ? v.name : null;
    else { try { JSON.stringify(v); o[k] = v; } catch (e) {} } } return o; });
  let ed = null; try { ed = W._effDemCache ? JSON.parse(JSON.stringify(W._effDemCache)) : null; } catch (e) { ed = null; }
  let nv = null; try { const C = W._nevCache; nv = C ? { day: C.day, px: C.px ? [...C.px.entries()] : null, val: C.val ? [...C.val.entries()] : null } : null; JSON.stringify(nv); } catch (e) { nv = null; }
  const near = {}; for (const v of W.villages || []) if (Array.isArray(v._near20)) near[v.name] = { l: v._near20.map((x) => x && x.name), n: v._near20N };
  return { day: W.day, cap, ed, nv, near };
}
if (KOUT) process.on('exit', () => {
  const s = st(); if (!s || !s.world) return;
  try { const P = pack(s.world); fs.writeFileSync(KOUT, JSON.stringify(P)); STAT.out = { day: P.day, cap: P.cap.length, ed: !!P.ed, nv: !!P.nv }; } catch (e) { console.error('[t1308-keep] 쓰기 실패:', e.message); }
});
if (KIN) {
  let K = null; try { K = JSON.parse(fs.readFileSync(KIN, 'utf8')); } catch (e) { K = null; }
  if (K) {
    const iv = setInterval(() => {
      const s = st(); if (!s || !s.ready || !s.world) return;
      clearInterval(iv);
      const W = s.world, byName = new Map(W.villages.map((v) => [v.name, v]));
      let miss = 0;
      const cap = [];
      for (const t of K.cap || []) {
        const from = byName.get(t.from), to = byName.get(t.to);
        let npc = null; if (t.npc != null) for (const v of W.villages) { npc = (v.npcs || []).find((n) => n && n.id === t.npc) || null; if (npc) break; }
        if (!npc || !to) { miss++; continue; }
        cap.push(Object.assign({}, t, { npc, from, to }));
      }
      W._capTransit = cap;
      if (K.ed) W._effDemCache = K.ed;
      if (K.nv) W._nevCache = { day: K.nv.day, px: K.nv.px ? new Map(K.nv.px) : new Map(), val: K.nv.val ? new Map(K.nv.val) : new Map() };
      let nn = 0, nm = 0;
      for (const [name, o] of Object.entries(K.near || {})) { const v = byName.get(name); if (!v) { nm++; continue; } const l = o.l.map((x) => byName.get(x)); if (l.some((x) => !x)) { nm++; continue; } v._near20 = l; v._near20N = o.n; nn++; }
      STAT.in = { day: W.day, cap: cap.length, miss, ed: K.ed ? K.ed.day : null, nv: K.nv ? K.nv.day : null, near: nn, nearMiss: nm };
      if (process.env.T1308_BAIT_RNG === '1') { try { const E = require(path.join(ROOT, 'sim', 'economy-sim')); if (E.__t722G) { const g = E.__t722G(); E.__t722G({ seed: (g.seed ^ 0x5bd1e995) >>> 0 }); STAT.in.bait = true; console.log('[t1308-keep] 미끼 — econ 난수 상태를 덮었다'); } } catch (e) {} }
      console.log(`[t1308-keep] 되돌림 — econ 날 ${W.day} · 포로 이송 ${cap.length}(못 맞춘 ${miss}) · 유효 수요 캐시 날 ${STAT.in.ed} · 값 캐시 날 ${STAT.in.nv} · 가까운 20곳 ${nn}(못 맞춘 ${nm})`);
    }, 1);
  }
}
