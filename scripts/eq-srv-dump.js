// (@regress 없음 — 러너 밖 · T1426 ⑤ⓐ 서버 껐다 켬 갈림 주인 가르기 프리로드 · 제품 무변 · 읽기만)
// === scripts/eq-srv-dump.js — 서버 장부 `scanDay(world, day)`(econ 하루 끝 · `eq-srv-obs` 와 같은 문)에서 정한 날의 마을 칸 **값**을 통째로 쓴다 ==========
//   `T1426_SRV_DUMP=<파일 앞>` · `T1426_SRV_DUMP_DAYS=20,21,22` — 그 날마다 `<파일 앞>-d<날>.json` = { day, world: {칸: 값}, villages: [{칸: 값}] }.
//   값은 `lib-eq-lab.canon` 꼴(키 순서 · 숫자 꼴 정규화 · 남의 마을은 표지만) — 두 판 덤프를 칸 · 마을마다 견주면 "누가 먼저 다른가"가 나온다.
//   한 번에 돈 판과 끊고 이은 판에 같은 env 로 얹는다(t1308 `NODE_OPTIONS` — 마디마다 다시 실린다).
'use strict';
const path = require('path');
const fs = require('fs');
const OUT = process.env.T1426_SRV_DUMP || '';
const DAYS = new Set(String(process.env.T1426_SRV_DUMP_DAYS || '').split(',').map(Number).filter((x) => x > 0));
if (OUT && DAYS.size && /server[\\/]zone\.js$/.test(process.argv[1] || '')) {
  const ROOT = path.join(__dirname, '..');
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const Lq = require('./lib-eq-lab');
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try {
        if (DAYS.has(day)) {
          const stop = Lq._stops(world);
          const prev = (x) => { const seen = new WeakSet(); try { const t = JSON.stringify(x, (k, y) => { if (y && typeof y === 'object') { if (stop.has(y) && y !== x) return stop.get(y); if (seen.has(y)) return '@'; seen.add(y); } return typeof y === 'function' ? 'f' : y; }); return t == null ? String(t) : t.slice(0, 600); } catch (e) { return '!' + e.message; } };
          const one = (o) => { const x = {}; for (const k of Object.keys(o)) { if (typeof o[k] === 'function') continue; x[k] = [Lq._ch(o[k], 16, stop), prev(o[k])]; } return x; };
          const J = { day, world: {}, villages: world.villages.map((v) => one(v)) };
          for (const k of Object.keys(world)) if (k !== 'villages' && typeof world[k] !== 'function') J.world[k] = [Lq._ch(world[k], 16, stop), prev(world[k])];
          fs.writeFileSync(`${OUT}-d${day}.json`, JSON.stringify(J));
        }
      } catch (e) { try { fs.appendFileSync(`${OUT}.err`, String(e && e.stack) + '\n'); } catch (_) {} }
      return r;
    };
    return L;
  };
}
