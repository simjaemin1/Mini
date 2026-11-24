// T1437 판 계측(세계 0 · 읽기만) — 식량 여유분 "겪은 만큼"의 자를 재는 마을 · 날 칸 + T1419 훅의 100날 줄(그 셈 그대로 옮김 — `계측/T1419_2026-11-21/t1419hook.js`)
//   랩: `T1437_OUT=<json> node -r <이 파일> scripts/t17-metrics.js 800 <시드>`(`tickWorldV2` 뒤 · 하루 한 번)
//   서버: 판 자 아이 존 프리로드(`NODE_OPTIONS=--require <이 파일>`) · `T577_OUT` 이 있을 때만 깬다 → `<T577_OUT>.t1437.json`(장부 `scanDay` 뒤 — T1419 · T1405 훅 그 자리)
//   레포 뿌리 = `T1437_ROOT`(없으면 이 파일 두 칸 위) — 베이스 판(끔 · (가))은 T1419 작업 트리를 뿌리로 준다
//   마을 · 날 칸(하루 끝 · 마을마다 배열 — 오프라인 자 셈은 `t1437_diag.py`):
//     S  곳간 식량 환산(`totalFoodEquivalent` — 순수 함수)   N  사람
//     sh 그날 못 먹은 몫 Σ 사람 `_fdS`(T1074 빚 장부 — 하루치 단위)   pr 그날 든 식량 환산(`totalFoodProductionEquivalent(dailyProductionBuf)` — 틱 머리에서 비운 그날 버퍼)
//     im 그날 들여온 식량(`tradeStats.foodImported` 차)   fd 그날 굶어 죽음(`_fdDeadTot` 차)   nd 그날 버틸 날(`_t1419N` — 그날 판정이 셈한 값만 · 없으면 null)
//     bf 겪은 만큼 여유분 날(`_t1437` 칸 — 'seen' 판만 · 없으면 null)   ex 비었다 다시 선 횟수(N 0 → 양)
//     wx 그날 날씨(D 가뭄 · S 폭풍 · A 풍요 · F 안개 · . 없음 — `_weather` 칸 읽기만)   ys 그날 풍흉(B 흉년 · G 풍년 · . — `_yearShock`)
//   100날 줄 = T1419 훅 그 열 그대로(사람 · 산 마을 · 빈 마을 · 굶어 죽음 누계 · 식량 날치 가운데 · 나무꾼 0 마을-날 % · 곳간 나무 1 밑 · 나무 값 가운데 · 광산 일곱 · 청동 · 일 수 …)
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다(칸을 읽고 순수 함수 둘만).
'use strict';
const _OUT = process.env.T1437_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t1437.json' : null);
if (_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1437_ROOT || path.resolve(__dirname, '..', '..'), OUT = _OUT, SERVER = !process.env.T1437_OUT;
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const ARM = E.T1419_FOOD_NEED || 'off';
  const ARM2 = process.env.T1437_ARM || '';
  const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const r2 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
  const r1 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 10) / 10;
  const r4 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 10000) / 10000;
  const MINES = ['광산1', '광산2', '광산3', '광산4', '광산5', '광산6', '광산7'];
  const seen = new WeakSet(), hPrev = new WeakMap();
  const W = () => ({ vd: 0, lj0: 0, f10: 0, f30: 0, f60: 0, h40: 0, h25: 0, hLo: 0, wood: 0, woodRows: 0, built: 0 });
  let win = W(), n = 0, lastDay = null, err = null;
  const marks = [];
  // 마을 칸 — 마을 객체마다 하나(이름이 같아도 다른 객체면 다른 칸)
  const vid = new WeakMap(), V = [];
  const prevImp = new WeakMap(), prevFd = new WeakMap(), prevN = new WeakMap();
  const colOf = (v) => {
    let k = vid.get(v);
    if (k == null) { k = V.length; vid.set(v, k); V.push({ name: v.name, d0: n, S: [], N: [], sh: [], pr: [], im: [], fd: [], nd: [], bf: [], ex: 0, wx: '', ys: '' }); }
    return V[k];
  };
  const write = () => { try { fs.writeFileSync(OUT, JSON.stringify({ arm: ARM, arm2: ARM2, server: SERVER, last: n, dfc: E.DAILY_FOOD_CONSUMPTION, marks, err, vil: V })); } catch (e) { } };
  const vilsOf = (world) => (world.villages || []).filter((v) => v && !v.founder);
  const step = (world, day) => {
    n++;
    const TL = world.tradeLog || [];
    for (let i = TL.length - 1; i >= 0 && !seen.has(TL[i]); i--) { const t = TL[i]; seen.add(t); const its = [].concat(t.basket || (t.sent ? [t.sent] : []), t.retBasket || (t.bought ? [t.bought] : [])); let w = 0; for (const it of its) if (it && it.res === 'wood') w += +it.amt || 0; if (w > 0) { win.wood += w; win.woodRows++; } }
    const VS = vilsOf(world);
    for (const v of VS) {
      const c = colOf(v);
      const N = (v.npcs || []).length;
      const n0 = prevN.get(v); if (n0 === 0 && N > 0) c.ex++; prevN.set(v, N);
      let sh = 0; for (const p of (v.npcs || [])) sh += +p._fdS || 0;
      const imp = (v.tradeStats && v.tradeStats.foodImported) || 0, i0 = prevImp.get(v); prevImp.set(v, imp);
      const fdt = v._fdDeadTot || 0, f0 = prevFd.get(v); prevFd.set(v, fdt);
      const nd = (v._t1419N && v._t1419N.day === day) ? v._t1419N.d : null;
      const bf = (v._t1437 && typeof v._t1437.b === 'number') ? v._t1437.b : null;
      c.S.push(r1(E.totalFoodEquivalent(v))); c.N.push(N); c.sh.push(r4(sh));
      c.pr.push(r2(E.totalFoodProductionEquivalent(v.dailyProductionBuf || {}, v)));
      c.im.push(r2(i0 == null ? 0 : imp - i0)); c.fd.push(f0 == null ? 0 : fdt - f0);
      c.nd.push(nd == null ? null : r2(nd)); c.bf.push(bf == null ? null : r2(bf));
      { const w = v._weather && v._weather.untilDay >= day ? String(v._weather.name || '') : '', y = v._yearShock && v._yearShock.untilDay >= day ? String(v._yearShock.name || '') : '';
        c.wx += w.indexOf('가뭄') >= 0 ? 'D' : w.indexOf('폭풍') >= 0 ? 'S' : w.indexOf('풍요') >= 0 ? 'A' : w.indexOf('안개') >= 0 ? 'F' : '.';
        c.ys += y.indexOf('흉년') >= 0 ? 'B' : y.indexOf('풍년') >= 0 ? 'G' : '.'; }
      if (!(N > 0)) continue;
      const fd = E.totalFoodEquivalent(v) / N;
      win.vd++; if (!((v.counts && v.counts.lumberjack) > 0)) win.lj0++;
      if (fd < 10) win.f10++; if (fd < 30) win.f30++; if (fd > 60) win.f60++;
      if (fd > 40) win.h40++; else if (fd > 25) win.h25++; else win.hLo++;
      const h0 = hPrev.get(v), h1 = +v.housing || 0; if (h0 != null && h1 > h0) win.built += h1 - h0; hPrev.set(v, h1);
    }
    if (n % 100 === 0) {
      const live = VS.filter((v) => (v.npcs || []).length > 0);
      const fd = live.map((v) => E.totalFoodEquivalent(v) / v.npcs.length);
      const px = live.map((v) => (v._priceCache && v._priceCache.wood)).filter((x) => Number.isFinite(x));
      const sum = (f) => VS.reduce((a, v) => a + (+f(v) || 0), 0);
      marks.push({ day: n, wday: day, pop: live.reduce((a, v) => a + v.npcs.length, 0), live: live.length, empty: VS.length - live.length,
        fdDead: sum((v) => v._fdDeadTot), emig: sum((v) => v._emigTot), dead: sum((v) => v._deadTot),
        fdMed: r2(q(fd, 0.5)), fd10: fd.filter((x) => x < 10).length, fd60: fd.filter((x) => x > 60).length, wood0: live.filter((v) => ((v.storage && v.storage.wood) || 0) < 1).length,
        woodPx: r2(q(px, 0.5)), woodTr: Math.round(win.wood), woodRows: win.woodRows, lj0: r2(100 * win.lj0 / Math.max(1, win.vd)), f10d: r2(100 * win.f10 / Math.max(1, win.vd)), f30d: r2(100 * win.f30 / Math.max(1, win.vd)), f60d: r2(100 * win.f60 / Math.max(1, win.vd)),
        h40: r2(100 * win.h40 / Math.max(1, win.vd)), h25: r2(100 * win.h25 / Math.max(1, win.vd)), hLo: r2(100 * win.hLo / Math.max(1, win.vd)),
        housing: Math.round(sum((v) => v.housing)), built: r2(win.built),
        mines: MINES.map((nm) => { const v = VS.find((x) => x.name === nm); return v ? (v.npcs || []).length : null; }),
        bronze: r2(sum((v) => v._bronzeWeaponMade)),
        jobs: ['farmer', 'fisher', 'hunter', 'forager', 'lumberjack', 'miner', 'mason', 'cook'].reduce((o, k) => (o[k] = live.reduce((a, v) => a + ((v.counts && v.counts[k]) || 0), 0), o), {}) });
      win = W(); write();
    }
  };
  if (!SERVER) {
    const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
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
