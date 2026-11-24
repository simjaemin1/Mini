// T1452 판 계측(세계 0 · 읽기만) — 곳간 곡선 · 지금 식 셋((가) · 겪은 낙폭 · 한 해 율)이 날마다 말한 값 · 앞날 장부 칸(켠 판)
//   랩: `T1452_OUT=<json> node -r <이 파일> scripts/t17-metrics.js 800 <시드>`(`tickWorldV2` 뒤 · 하루 한 번)
//   서버: 판 자 아이 존 프리로드(`NODE_OPTIONS=--require <이 파일>`) · `T577_OUT` 이 있을 때만 깬다 → `<T577_OUT>.t1452.json`(장부 `scanDay` 뒤)
//   레포 뿌리 = `T1452_ROOT`(없으면 이 파일 두 칸 위)
//   마을 · 날 칸(하루 끝):
//     S  곳간 식량 환산(`totalFoodEquivalent`)   N  사람   sh 그날 못 먹은 몫 Σ 사람 `_fdS`(빚 장부 — 하루치 단위)   fd 그날 굶어 죽음
//     hv 그날 밭에서 곳간에 든 식량(`_t368FoodTot` 차 — 거둠)   ga (가) 버틸 날(`foodNeedDays` — 철 배수 표를 건네고 순수하게 부른다 · 칸 캐시만 쓴다)
//     yf 한 해 율(`t1421YearFood` — 하루치/날)   nx 다음 거둠까지 날(`_t1374Next − 날` · 없으면 null)   st 선 작물이 낼 식량(`_t1276Stand`)
//     nd 그날 판정이 쓴 버틸 날(`_t1419N` · 켠 판만)   ah 앞날 장부(`_t1452` 칸 · 켠 판만 — [골 날치, 골까지 날, 여유분, 비상, 버틸 날, 30 · 90 · 180날 예상 곳간, 창 안 골 날치, 0 밑 첫날, 창 끝])
//     im 그날 들여온 식량(`tradeStats.foodImported` 차)   wx 그날 날씨(D 가뭄 · S 폭풍 · A 풍요 · F 안개 · . 없음)
//   날 칸(모든 마을): se 철 한 글자(봄 s · 여름 u · 가을 a · 겨울 w)
'use strict';
const _OUT = process.env.T1452_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t1452.json' : null);
if (_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1452_ROOT || path.resolve(__dirname, '..', '..'), OUT = _OUT, SERVER = !process.env.T1452_OUT;
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  let V2 = null; try { V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2')); } catch (e) { V2 = null; }
  const ARM = E.T1419_FOOD_NEED || 'off';
  const r2 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
  const r1 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 10) / 10;
  const r4 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 10000) / 10000;
  let seasonSet = false;
  const vid = new WeakMap(), V = [];
  const prevFd = new WeakMap(), prevHv = new WeakMap(), prevImp = new WeakMap();
  let n = 0, lastDay = null, err = null, se = '';
  const colOf = (v) => {
    let k = vid.get(v);
    if (k == null) { k = V.length; vid.set(v, k); V.push({ name: v.name, d0: n, S: [], N: [], sh: [], fd: [], hv: [], ga: [], yf: [], nx: [], st: [], nd: [], ah: [], im: [], wx: '' }); }
    return V[k];
  };
  const write = () => { try { fs.writeFileSync(OUT, JSON.stringify({ arm: ARM, server: SERVER, last: n, dfc: E.DAILY_FOOD_CONSUMPTION, se, err, stat: E.t1452Stat ? E.t1452Stat() : null, vil: V })); } catch (e) { } };   // stat = 장부 셈 횟수 · µs 합 · 가장 긴 µs · 쓴 칸 · 날(판 끝 · 06:00 UTC 뒤 판부터)
  const step = (world, day) => {
    if (!seasonSet && V2 && V2.SEASON_MULT && typeof E.t1419Season === 'function' && !E.T1419_FOOD_NEED) { E.t1419Season(V2.SEASON_MULT); seasonSet = true; }   // 끈 판 — (가)가 켠 판과 같은 철 배수를 보게(그 함수만 읽는 표)
    n++;
    { const s = V2 && V2.seasonOf ? String(V2.seasonOf(day)) : ''; se += s === 'spring' ? 's' : s === 'summer' ? 'u' : s === 'autumn' ? 'a' : s === 'winter' ? 'w' : '.'; }
    for (const v of (world.villages || [])) {
      if (!v || v.founder) continue;
      const c = colOf(v);
      const N = (v.npcs || []).length;
      let sh = 0; for (const p of (v.npcs || [])) sh += +p._fdS || 0;
      const fdt = v._fdDeadTot || 0, f0 = prevFd.get(v); prevFd.set(v, fdt);
      const hvt = v._t368FoodTot || 0, h0 = prevHv.get(v); prevHv.set(v, hvt);
      let ga = null; if (N > 0 && typeof E.foodNeedDays === 'function') { const keep = v._t1419N; try { ga = E.foodNeedDays(v, day); } catch (e) { ga = null; } if (E.T1419_FOOD_NEED) v._t1419N = keep; }
      const yf = (N > 0 && typeof E.t1421YearFood === 'function') ? E.t1421YearFood(v) : null;
      const nd = (v._t1419N && v._t1419N.day === day) ? v._t1419N.d : null;
      const A = (E.T1452_LEDGER && v._t1452) ? E.t1452Ahead(v, day) : null;   // 장부 판(켬 · 재는 판 SHADOW) — 그날 장부(값 함수 아님 · 장부 칸 캐시만)
      c.S.push(r1(E.totalFoodEquivalent(v))); c.N.push(N); c.sh.push(r4(sh)); c.fd.push(f0 == null ? 0 : fdt - f0);
      c.hv.push(r2(h0 == null ? 0 : hvt - h0)); c.ga.push(r2(ga)); c.yf.push(r2(yf));
      c.nx.push(typeof v._t1374Next === 'number' ? v._t1374Next - day : null); c.st.push(r1(v._t1276Stand));
      c.nd.push(nd == null ? null : r2(nd)); c.ah.push(A ? [r2(A.depth), A.toTrough, r2(A.buf), A.emerg ? 1 : 0, r2(A.need), r1(A.p30), r1(A.p90), r1(A.p180), r2(A.minW), A.k0, A.rel] : null);
      { const imp = (v.tradeStats && v.tradeStats.foodImported) || 0, i0 = prevImp.get(v); prevImp.set(v, imp); c.im.push(r2(i0 == null ? 0 : imp - i0)); }
      { const w = v._weather && v._weather.untilDay >= day ? String(v._weather.name || '') : ''; c.wx += w.indexOf('가뭄') >= 0 ? 'D' : w.indexOf('폭풍') >= 0 ? 'S' : w.indexOf('풍요') >= 0 ? 'A' : w.indexOf('안개') >= 0 ? 'F' : '.'; }
    }
    if (n % 50 === 0) write();
  };
  if (!SERVER) {
    const orig = V2.tickWorldV2;
    V2.tickWorldV2 = function (world) { const r = orig.apply(this, arguments); try { step(world, world.day); } catch (e) { if (!err) err = String(e && e.stack || e); } return r; };
  } else {
    const Ev = require(path.join(ROOT, 'server', 'events'));
    const mk = Ev.createLedger;
    Ev.createLedger = function () {
      const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
      Lg.scanDay = function (world, day) {
        const r = sd.apply(this, arguments);
        try { if ((day | 0) !== lastDay) { lastDay = day | 0; step(world, day | 0); } } catch (e) { if (!err) err = String(e && e.stack || e); }
        return r;
      };
      return Lg;
    };
  }
  process.on('exit', write);
}
