// (@regress 없음 — 러너 밖 · T1381 계측기 · 제품 무변 · 읽기만)
// === scripts/t1381-walk-probe.js — 걸음 재개형 탐색(T821 `localPathBegin` · `pathStep`)의 힙 몫: 날마다 ⓐ 산 탐색 수 · 꺼냄 · 열린 목록
//     ⓑ 끝난 까닭(찾음 · 다 뒤짐 = 닫힌 덩이 · 상한) · 버려진 채 산 탐색(하루 넘게 안 밀렸는데 GC 에 안 걷힘) · 걷힘(끝나기 전에 GC) ⓒ 같은 물음 되풀이 ===
//   쓰는 법: `NODE_OPTIONS="-r $PWD/scripts/t1381-walk-probe.js" T1381_WALK_OUT=<파일.json>` (T1308 이어 도는 판 자 · 마디를 넘어 날 열쇠로 잇는다).
//   감싸는 것: path-core `localPathBegin` · `pathStep`(같은 인수 · 같은 반환) — 값은 안 바꾼다. 막힘 술어(`_warBlockedCell`)는 안 부른다(그 메모를 미리 채우면 판이 바뀐다).
//   ★★탐색 객체를 붙잡지 않는다 — `WeakRef.deref()` 도 안 쓴다: deref 한 객체는 V8 이 **그 동기 작업이 끝날 때까지** 살려 둔다(KeepDuringJob).
//     가상 시계 판은 하루 전쟁 걸음(`_t681Flush`)이 한 작업이라 deref 한 탐색이 그날 내내 힙에 남는다(T1338 march 탐침이 W42x 날 629 에 그렇게 힙을 채웠다 — 보고 T1381 §1 ⓓ).
//     그래서 탐색마다 작은 기록(꺼냄 · 열린 목록 · 마지막 민 날)만 쥐고, 걷힘은 FinalizationRegistry(기록을 손에 쥔 값으로)로 센다.
'use strict';
const OUT = process.env.T1381_WALK_OUT;
if (OUT && process.env.T577_SEED) {
  const fs = require('fs'), path = require('path');
  const PC = require(path.join(process.env.T1381_TREE || path.join(__dirname, '..'), 'sim', 'path-core.js'));
  const Module = require('module'), load0 = Module._load; let VIL = null;
  Module._load = function (req) { const m = load0.apply(this, arguments); if (!VIL && /villages(\.js)?$/.test(req) && m && m.__p3Bind) VIL = m; return m; };
  const day = () => { try { return VIL.__p3Bind({}).state.world.day | 0; } catch (e) { return -1; } };
  let rec = { days: {}, big: [] };   // 마디(프로세스)를 넘어 날 열쇠로 잇는다 — 이어 돌 땐 부르는 쪽이 체크포인트 날 뒤를 먼저 잘라 둔다(두 번 세지 않게)
  try { const o = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (o && o.days) rec = { days: o.days, big: o.big || [] }; } catch (e) {}
  const D = (d) => rec.days[d] || (rec.days[d] = { begin: 0, rep: 0, repFar: 0, repPops: 0, found: 0, failEx: 0, failCap: 0, pops: 0, maxPops: 0, maxLive: 0, maxLivePops: 0, maxLiveOpen: 0, stale: 0, stalePops: 0, dropped: 0, heapMax: 0 });
  const live = new Set();   // 산 탐색의 기록(탐색 객체가 아니다 — { first, last, pops, open, rep })
  const meta = new WeakMap();   // 탐색 → 기록(약한 열쇠 — 탐색을 안 살린다 · get 은 deref 가 아니다)
  let fr = null; try { fr = new FinalizationRegistry((m) => { if (live.delete(m)) D(m.last).dropped++; }); } catch (e) {}
  const scan = (d) => {
    let n = 0, pops = 0, open = 0, stale = 0, stalePops = 0;
    for (const m of live) { n++; pops += m.pops; open += m.open; if (m.first >= 0 && m.last < d - 1) { stale++; stalePops += m.pops; } }
    const r = D(d); if (n > r.maxLive) r.maxLive = n; if (pops > r.maxLivePops) r.maxLivePops = pops; if (open > r.maxLiveOpen) r.maxLiveOpen = open;
    if (stale > r.stale) { r.stale = stale; r.stalePops = stalePops; }
    const h = Math.round(process.memoryUsage().heapUsed / 1048576); if (h > r.heapMax) r.heapMax = h;
  };
  //   ⓒ 같은 물음 되풀이 — 막힘 술어 세대(`state._warRectCells` 객체 · 읽기만) 안에서 같은 (시작 · 목표) 칸 물음이 다시 섰는가 · 그 꺼냄
  const genId = new WeakMap(); let genN = 0, genCur = null, seen = new Set();
  const gen = () => { let g = null; try { g = VIL.__p3Bind({}).state._warRectCells; } catch (e) {} if (!g) return 0; let id = genId.get(g); if (!id) { id = ++genN; genId.set(g, id); } if (id !== genCur) { genCur = id; seen = new Set(); } return id; };
  const b0 = PC.localPathBegin, s0 = PC.pathStep;
  PC.localPathBegin = function () {
    const S = b0.apply(this, arguments); const d = day(); const x = D(d); x.begin++;
    if (S) { const k = gen() + ':' + S.sx + ',' + S.sy + '>' + S.gx + ',' + S.gy; const m = { first: d, last: d, pops: 0, open: 0, rep: seen.has(k) };
      if (m.rep) x.rep++; seen.add(k); live.add(m); meta.set(S, m); if (fr) fr.register(S, m, m); }
    return S;
  };
  let calls = 0, lastW = 0, lastD = -1; const cpu = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
  //   쓰기 — 실제 타이머 5초마다 + 감싼 문 안에서 CPU 5초마다(가상 시계 판은 존이 한 콜백에 갇히면 타이머가 안 돈다 · 힙 죽음은 exit 를 안 부른다)
  function flush() { lastW = cpu(); try { scan(day()); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
  PC.pathStep = function (S, budget) {
    const r = s0.apply(this, arguments);
    const m = meta.get(S);
    if (m && live.has(m)) { const d = day(); m.last = d; m.pops = S.pops; const o = S.open; m.open = o ? (typeof o.n === 'number' ? o.n : o.size) : 0;
      if (r.done) { live.delete(m); if (fr) fr.unregister(m); const x = D(d); x.pops += S.pops; if (S.pops > x.maxPops) x.maxPops = S.pops;
        if (m.rep) { if (S.pops > 16384) x.repFar++; x.repPops += S.pops; }
        if (r.path) x.found++; else if (S.pops > S.maxPops) x.failCap++; else x.failEx++;
        if (S.pops > 100000 && rec.big.length < 2000) rec.big.push({ day: d, pops: S.pops, found: !!r.path, cap: S.pops > S.maxPops, s: [S.sx, S.sy], g: [S.gx, S.gy], age: d - m.first }); }
      if (d !== lastD || (++calls & 1023) === 0) { lastD = d; scan(d); if (cpu() - lastW > 5000) flush(); } }
    return r;
  };
  const RT = (global.__t745Ctl && global.__t745Ctl.rt) || { setInterval };   // 실제 타이머(가상 줄에 안 낀다)
  const iv = RT.setInterval.call(global, flush, 5000); if (iv.unref) iv.unref();
  process.on('exit', flush);
}
