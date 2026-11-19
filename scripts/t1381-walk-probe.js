// (@regress 없음 — 러너 밖 · T1381 계측기 · 제품 무변 · 읽기만)
// === scripts/t1381-walk-probe.js — 걸음 재개형 탐색(T821 `localPathBegin` · `pathStep`)의 힙 몫: 날마다 ⓐ 산 탐색 수 · 꺼냄 · 열린 목록 · 닫힌 칸 어림
//     ⓑ 끝난 까닭(찾음 · 다 뒤짐 = 닫힌 덩이 · 상한) · 버려진 채 산 탐색(하루 넘게 안 밀렸는데 GC 에 안 걷힘) · 걷힘(끝나기 전에 GC) ===
//   쓰는 법: `NODE_OPTIONS="-r $PWD/scripts/t1381-walk-probe.js" T1381_WALK_OUT=<파일.json>` (T1308 이어 도는 판 자 · t1338-march-probe 꼴).
//   감싸는 것: path-core `localPathBegin` · `pathStep`(같은 인수 · 같은 반환) — 값은 안 바꾼다. 막힘 술어(`_warBlockedCell`)는 안 부른다(그 메모를 미리 채우면 판이 바뀐다).
//   산 탐색은 약한 참조로 센다(이 자가 붙들면 그 자체가 힙을 키운다). 닫힌 칸 어림 = 꺼냄 + 열린 목록(같은 칸 두 번은 안 뺀다 — 위 어림).
'use strict';
const OUT = process.env.T1381_WALK_OUT;
if (OUT && process.env.T577_SEED) {
  const fs = require('fs'), path = require('path');
  const PC = require(path.join(process.env.T1381_TREE || path.join(__dirname, '..'), 'sim', 'path-core.js'));
  const Module = require('module'), load0 = Module._load; let VIL = null;
  Module._load = function (req) { const m = load0.apply(this, arguments); if (!VIL && /villages(\.js)?$/.test(req) && m && m.__p3Bind) VIL = m; return m; };
  const day = () => { try { return VIL.__p3Bind({}).state.world.day | 0; } catch (e) { return -1; } };
  const live = new Set(), meta = new WeakMap();
  let rec = { days: {}, big: [] };   // 마디(프로세스)를 넘어 날 열쇠로 잇는다 — 이어 돌 땐 부르는 쪽이 체크포인트 날 뒤를 먼저 잘라 둔다(두 번 세지 않게)
  try { const o = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (o && o.days) rec = { days: o.days, big: o.big || [] }; } catch (e) {}
  const D = (d) => rec.days[d] || (rec.days[d] = { begin: 0, rep: 0, repFar: 0, repPops: 0, found: 0, failEx: 0, failCap: 0, pops: 0, maxPops: 0, maxLive: 0, maxLivePops: 0, maxLiveOpen: 0, stale: 0, stalePops: 0, dropped: 0, heapMax: 0 });
  let fr = null; try { fr = new FinalizationRegistry((d) => { D(d).dropped++; }); } catch (e) {}
  let lastD = -1;
  const scan = (d) => {   // 산 탐색 훑기 — 수 · 꺼냄 합 · 열린 목록 합 · 버려짐(하루 넘게 안 밀림)
    let n = 0, pops = 0, open = 0, stale = 0, stalePops = 0;
    for (const w of live) { const S = w.deref(); if (!S || S.done) { live.delete(w); continue; }
      n++; pops += S.pops; const o = S.open; open += o ? (typeof o.n === 'number' ? o.n : o.size) : 0;
      const m = meta.get(S); if (m && m.last < d - 1) { stale++; stalePops += S.pops; } }
    const r = D(d); if (n > r.maxLive) r.maxLive = n; if (pops > r.maxLivePops) r.maxLivePops = pops; if (open > r.maxLiveOpen) r.maxLiveOpen = open;
    if (stale > r.stale) { r.stale = stale; r.stalePops = stalePops; }
    const h = Math.round(process.memoryUsage().heapUsed / 1048576); if (h > r.heapMax) r.heapMax = h;
  };
  //   ⓒ 같은 물음 되풀이 — 막힘 술어 세대(`state._warRectCells` 객체 · 읽기만) 안에서 같은 (시작 · 목표) 칸 물음이 다시 섰는가 · 앞 물음이 첫 몫(16,384)을 넘겼는가 · 그 꺼냄
  const genId = new WeakMap(); let genN = 0, genCur = null, seen = new Map();
  const gen = () => { let g = null; try { g = VIL.__p3Bind({}).state._warRectCells; } catch (e) {} if (!g) return 0; let id = genId.get(g); if (!id) { id = ++genN; genId.set(g, id); } if (id !== genCur) { genCur = id; seen = new Map(); } return id; };
  const b0 = PC.localPathBegin, s0 = PC.pathStep;
  PC.localPathBegin = function (sx, sy, gx, gy) {
    const S = b0.apply(this, arguments); const d = day(); const x = D(d); x.begin++;
    if (S) { const k = gen() + ':' + S.sx + ',' + S.sy + '>' + S.gx + ',' + S.gy, prev = seen.get(k);
      const m = { first: d, last: d, live: true, k }; if (prev) { x.rep++; m.rep = true; } seen.set(k, m);
      live.add(new WeakRef(S)); meta.set(S, m); if (fr) fr.register(S, d, S); }
    return S;
  };
  let calls = 0, lastW = 0; const cpu = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
  PC.pathStep = function (S, budget) {
    const r = s0.apply(this, arguments);
    const m = meta.get(S);
    if (m && m.live) { const d = day(); m.last = d;
      if (r.done) { m.live = false; if (fr) fr.unregister(S); const x = D(d); x.pops += S.pops; if (S.pops > x.maxPops) x.maxPops = S.pops;
        if (m.rep) { if (S.pops > 16384) x.repFar++; x.repPops += S.pops; }
        if (r.path) x.found++; else if (S.pops > S.maxPops) x.failCap++; else x.failEx++;
        if (S.pops > 100000 && rec.big.length < 2000) rec.big.push({ day: d, pops: S.pops, found: !!r.path, cap: S.pops > S.maxPops, s: [S.sx, S.sy], g: [S.gx, S.gy], age: d - m.first }); }
      if (d !== lastD || (++calls & 1023) === 0) { lastD = d; scan(d); const c = cpu(); if (c - lastW > 5000) flush(); } }
    return r;
  };
  //   쓰기 — 실제 타이머 5초마다 + 감싼 문 안에서 CPU 5초마다(가상 시계 판은 존이 한 콜백에 갇히면 타이머가 안 돈다 · 힙 죽음은 exit 를 안 부른다)
  function flush() { lastW = cpu(); try { scan(day()); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
  const RT = (global.__t745Ctl && global.__t745Ctl.rt) || { setInterval };   // 실제 타이머(가상 줄에 안 낀다)
  const iv = RT.setInterval.call(global, flush, 5000); if (iv.unref) iv.unref();
  process.on('exit', flush);
}
