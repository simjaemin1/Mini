// (@regress 없음 — 러너 밖 · T1053 계측기 · 제품 무변 · 읽기만 · 판정 0)
// === scripts/t1053-observe.js — **사냥 몫 · 고기 · 장부 관찰자**: 하루 경계마다 econ 마을 합(사냥 부존 `land.game` · 곳간 고기 · 사냥꾼 수) + 서버 사냥터 장부 칸 수 ===
//   쓰는 법(판 자 · 기준선 자): NODE_OPTIONS="--require <이 파일>" … (아이 존 · `T577_OUT` 이 있을 때만 · 주 스레드만)
//     ⇒ `${T1053_DIR || dirname(T577_OUT)}/${basename(T577_OUT, '.json')}.t1053.json` — days: [날 · Σ land.game · Σ 곳간 meat · 사냥꾼 · 장부 칸(`gameRichSize`) · T1053 지운 칸 · 지은 장부]
//   ★하루 경계 = 서버 장부 `scanDay`(t942-hp-probe 와 같은 문 — `createLedger` 만 감싼다) · 값 · 세계를 안 쓴다.
//   ★T1053 앞 트리(셈 칸 없음)에선 지운 칸 · 지은 장부 칸이 null 이다(장부 칸 수는 두 트리 다 있다).
'use strict';
const OUT0 = process.env.T577_OUT || '';
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT0 && MAIN) {
  const fs = require('fs'); const path = require('path'); const Module = require('module');
  const OUT = path.join(process.env.T1053_DIR || path.dirname(OUT0), path.basename(OUT0).replace(/\.json$/, '') + '.t1053.json');   // `T1053_DIR` — 판 자리가 지워지는 자(기준선 자 `/tmp/sbc-*`)에서 남길 곳
  const ROOT = path.join(__dirname, '..');
  let V = null;
  const days = [];
  const r2 = (x) => Math.round((+x || 0) * 100) / 100;
  const sample = (world) => {
    const vs = (world && world.villages) || [];
    let g = 0, meat = 0, hunters = 0, pop = 0;
    for (const v of vs) {
      if (!v) continue;
      if (v.land && Number.isFinite(v.land.game)) g += v.land.game;
      if (v.storage && Number.isFinite(v.storage.meat)) meat += v.storage.meat;
      if (v.npcs) { pop += v.npcs.length; for (const n of v.npcs) if (n && n.currentJob === 'hunter') hunters++; }
    }
    try { if (!V) V = require(path.join(ROOT, 'server', 'villages.js')); } catch (e) {}
    const cells = V && V.gameRichSize ? V.gameRichSize() : null;
    const st = V && V.t1053Stat ? V.t1053Stat() : null;
    days.push([world && world.day != null ? world.day : days.length, r2(g), r2(meat), hunters, pop, cells, st ? st.cells : null, st ? st.built : null]);
  };
  const dump = () => { try { fs.writeFileSync(OUT, JSON.stringify({ at: Date.now(), days })); } catch (e) {} };
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && typeof m.createLedger === 'function' && !m.__t1053o) {
        m.__t1053o = true; const mk = m.createLedger;
        m.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay; L.scanDay = function (world) { try { sample(world); } catch (e) {} return sd.apply(this, arguments); }; return L; };
      }
    } catch (e) {}
    return m;
  };
  process.on('exit', dump);
  setInterval(dump, 30000).unref();
}
