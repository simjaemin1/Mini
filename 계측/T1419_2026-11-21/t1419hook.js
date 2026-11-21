// T1419 판 계측(세계 0 · 읽기만) — 식량 30날치를 걷는 팔(끔 · 가 · 나)의 나무 · 식량 · 사람 (PM 훅 `계측/PM_2026-11-21_나무식량/wf-hook.js` · `wf2-hook.js` 를 한 벌로)
//   랩: `T1419_OUT=<json> node -r <이 파일> scripts/t17-metrics.js 800 <시드>`(`tickWorldV2` 뒤)
//   서버: 판 자 아이 존 프리로드(`NODE_OPTIONS=--require <이 파일>`) · `T577_OUT` 이 있을 때만 깬다 → `<T577_OUT>.t1419.json`(장부 `scanDay` 뒤 — T1405 훅 그 자리)
//   레포 뿌리 = `T1419_ROOT`(없으면 이 파일 두 칸 위)
//   하루: 마을-날 — 식량 날치(곳간 식량 환산 ÷ 사람) 띠(10 밑 · 30 밑 · 60 위) · 나무꾼 0 · 집 짓기 띠(식량 40날치 위 · 25 ~ 40 · 그 밑 — `houseDayBuild` 의 그 문) ·
//     지은 주거(`housing` 오른 몫) · 나무 교역(교역 장부 새 줄의 `wood` 짐 — PM 훅 그 셈) · (가)면 그날 버틸 날(`_t1419N` — 그날 판정이 셈한 값 · 없으면 정본 함수를 부르고 칸을 되돌린다)
//   100날마다 한 줄: 사람 · 산 마을 · 빈 마을 · 굶어 죽음(`_fdDeadTot` 합) · 떠난 사람(`_emigTot` 합) · 식량 날치 가운데 · 10 밑 · 60 위 마을 · 곳간 나무 1 밑 마을 ·
//     나무 값 가운데(`_priceCache.wood`) · 100날 나무 교역 · 나무꾼 0 마을-날 % · 주거 합 · 지은 주거 · 광산 일곱 사람 · 청동(`_bronzeWeaponMade` 합) · 일 수
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다(칸을 읽고 순수 함수 `totalFoodEquivalent` 만).
'use strict';
const _OUT = process.env.T1419_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t1419.json' : null);
if (_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1419_ROOT || path.resolve(__dirname, '..', '..'), OUT = _OUT, SERVER = !process.env.T1419_OUT;
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const Cal = require(path.join(ROOT, 'server', 'calendar'));
  const ARM = E.T1419_FOOD_NEED || 'off';
  const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const r2 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
  const typeOf = (nm) => String(nm || '').replace(/[0-9]+$/, '');
  const MINES = ['광산1', '광산2', '광산3', '광산4', '광산5', '광산6', '광산7'];
  const seen = new WeakSet(), hPrev = new WeakMap();
  const W = () => ({ vd: 0, lj0: 0, f10: 0, f30: 0, f60: 0, h40: 0, h25: 0, hLo: 0, wood: 0, woodRows: 0, built: 0 });
  let win = W(), n = 0, lastDay = null, err = null;
  const marks = [], need = {};   // need[꼴][철] = [날 …]
  const write = () => { try { fs.writeFileSync(OUT, JSON.stringify({ arm: ARM, server: SERVER, last: n, marks, err, need: Object.fromEntries(Object.entries(need).map(([t, o]) => [t, Object.fromEntries(Object.entries(o).map(([s, a]) => [s, { n: a.length, p10: r2(q(a, 0.1)), p50: r2(q(a, 0.5)), p90: r2(q(a, 0.9)), max: r2(a.length ? a.reduce((x, y) => Math.max(x, y), 0) : null) }]))])), stat: E.t1419Stat ? E.t1419Stat() : null })); } catch (e) { try { fs.writeFileSync(OUT + '.err', String(e && e.stack)); } catch (_) {} } };
  const vilsOf = (world) => (world.villages || []).filter((v) => v && !v.founder);
  const step = (world, day) => {
    n++;
    const TL = world.tradeLog || [];
    for (let i = TL.length - 1; i >= 0 && !seen.has(TL[i]); i--) { const t = TL[i]; seen.add(t); const its = [].concat(t.basket || (t.sent ? [t.sent] : []), t.retBasket || (t.bought ? [t.bought] : [])); let w = 0; for (const it of its) if (it && it.res === 'wood') w += +it.amt || 0; if (w > 0) { win.wood += w; win.woodRows++; } }
    const VS = vilsOf(world);
    for (const v of VS) {
      const N = (v.npcs || []).length; if (!(N > 0)) continue;
      const fd = E.totalFoodEquivalent(v) / N;
      win.vd++; if (!((v.counts && v.counts.lumberjack) > 0)) win.lj0++;
      if (fd < 10) win.f10++; if (fd < 30) win.f30++; if (fd > 60) win.f60++;
      if (fd > 40) win.h40++; else if (fd > 25) win.h25++; else win.hLo++;
      const h0 = hPrev.get(v), h1 = +v.housing || 0; if (h0 != null && h1 > h0) win.built += h1 - h0; hPrev.set(v, h1);
      if (ARM === 'harv') {
        let c = v._t1419N; if (!c) { const sv = v._t1419N; const dd = E.foodNeedDays(v, day); v._t1419N = sv; c = { day, d: dd }; }
        const t = typeOf(v.name), s2 = Cal.seasonOf(c.day); ((need[t] || (need[t] = {}))[s2] || (need[t][s2] = [])).push(c.d);
      }
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
