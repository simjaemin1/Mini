'use strict';
// (@regress 없음 — 러너 밖 · T722 계측기 · 제품 무변)
// === scripts/t722-stop-hook.js — 서버 판 자(T577 · T650)의 아이 존에 얹는 **멈춤 · 다시 뜸** 팔 ==========================
//   `scripts/t722-stop-run.js` 가 NODE_OPTIONS 로 얹는다(t650-print 뒤). 제품 파일은 한 글자도 안 바뀐다 —
//   적재 때 이 프로세스 사본 글자만(t650-print 의 CUT 문법):
//     · villages.js 끝에 `state` 읽기 함수 한 줄(읽기 · 얼림 · 저장 큐 확인용).
//     · economy-sim.js 끝에 econ 모듈 전역 셋(`_seed` · `_nextNpcId` · `_nextVillageId`) 읽기/쓰기 한 줄.
//     · [T722_CATCH=k] 안 ⓐ 사본 — 부팅 앵커를 k 날 뒤로(`lastGameDay = 지금 날 − k`) · 밀린 동안은 경계마다 한 날씩(`+1`).
//   env:
//     T722_STOP_DAY=S    S 날 장부(econ 하루 끝)를 본 뒤 → 날 얼림 → 마감 · 저장 큐가 다 비면 → 세계 덤프 → SIGTERM(제품 종료 문 그대로)
//     T722_CRASH=1       (S 날 장부 문에서) 저장 큐를 기다리지 않고 바로 죽는다(`process.exit(1)` — 크래시 흉내)
//     T722_DUMP=<파일>   멈춤 덤프 / 다시 뜬 뒤 덤프(T722_RESUME 있으면 다시 뜬 쪽)
//     T722_RESUME=<멈춤 덤프>  다시 뜬 판 — 준비가 서는 순간 복원된 세계를 덤프해 멈춤 덤프와 견준다
//     T722_PERSIST=seed,ids    (안 사본) 멈춤 덤프의 econ 전역을 준비 순간에 되돌린다(DB 메타 행 흉내)
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const VILL = path.join(ROOT, 'server', 'villages.js');
const ECON = path.join(ROOT, 'sim', 'economy-sim.js');
const STOP = parseInt(process.env.T722_STOP_DAY || '', 10) || 0;
const DUMP = process.env.T722_DUMP || '';
const RESUME = process.env.T722_RESUME || '';
const CATCH = parseInt(process.env.T722_CATCH || '', 10) || 0;
const PERSIST = new Set(String(process.env.T722_PERSIST || '').split(',').filter(Boolean));
const CRASH = process.env.T722_CRASH === '1';

const _load = Module._extensions['.js'];
let cutN = 0;
Module._extensions['.js'] = function (m, filename) {
  if (filename === VILL) {
    let src = fs.readFileSync(filename, 'utf8');
    if (CATCH) {
      const a = '    state.lastGameDay = gameDayOf(Date.now()); // 다음 경계부터 틱 (재기동 따라잡기 없음 — 실시간 앵커)';
      if (src.includes(a)) { src = src.replace(a, `    state.lastGameDay = gameDayOf(Date.now()) - ${CATCH}; state._t722Back = ${CATCH}; state._t722T0 = Date.now();`); cutN++; }
      const b = '  state.lastGameDay = day;\n  _openDayJobs(now);';
      if (src.includes(b)) { src = src.replace(b, '  if (state._t722Back > 0) { state.lastGameDay++; state._t722Back--; if (!state._t722Back) state._t722T1 = Date.now(); } else state.lastGameDay = day;\n  _openDayJobs(now);'); cutN++; }
      console.log(`[t722] T722_CATCH=${CATCH} — 바꾼 자리 ${cutN}/2`);
    }
    if (process.env.T722_NOJUMP === '1') {   // ★[T728 ⑥] 계측 전용 — 다시 뜰 때 날 뜀을 끈다(빠른 시계 자에선 부팅 시간만으로 수백 날이 뛰어 영속 완전성을 econ 날로 못 견준다)
      const a = '  if (M.anchor && Number.isFinite(M.anchor.g) && M.anchor.dayMs === state.dayMs && M.anchor.epoch === state.epoch) {';
      if (src.includes(a)) { src = src.replace(a, '  if (false && M.anchor) {'); console.log('[t722] T722_NOJUMP — 날 뜀 끔(계측 사본)'); }
    }
    src += '\n;module.exports.__t722 = function () { return state; };\n';
    return m._compile(src, filename);
  }
  if (filename === path.join(ROOT, 'server', 'zone.js') && process.env.T722_MC === '1') {   // 광맥 셀 표를 읽기만(덤프용)
    let src = fs.readFileSync(filename, 'utf8');
    const a = 'const minedCells = new Map();';
    if (src.includes(a)) src = src.replace(a, a + ' global.__t722mc = minedCells;');
    return m._compile(src, filename);
  }
  return _load(m, filename);
};
// econ 전역 셋 읽기/쓰기 한 줄 — `_compile` 자리에서 덧붙인다(t650-print 가 먼저 적재돼 econ 을 제 손잡이로 읽어도 이 줄은 붙는다)
const ECON_LINE = '\n;module.exports.__t722G = function (o) { if (o) { if (o.seed != null) _seed = o.seed >>> 0; if (o.npc != null) _nextNpcId = o.npc; if (o.vil != null) _nextVillageId = o.vil; } return { seed: _seed, npc: _nextNpcId, vil: _nextVillageId }; };\n';
const _cmp = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename === ECON && content.indexOf('__t722G') < 0) {
    if (process.env.T577_OUT && content.indexOf('__t650Seed') < 0) content += '\n;module.exports.__t650Seed = function () { return _seed; };\n';   // t650-print 와 같은 줄
    content += ECON_LINE;
  }
  return _cmp.call(this, content, filename);
};

const H = (x) => crypto.createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 12);
function snap(tag) {
  const V = require(VILL), E = require(ECON);
  const st = V.__t722();
  const W = st.world;
  const vil = (st.villages || []).map((vl) => {
    const e = vl.econ || {};
    // econ 마을 행 = 저장 줄과 같은 직렬(제품 함수 · 사본 0)이 아니라 **메모리 그대로** 칸마다 해시(무엇이 저장에서 빠지나 보려고)
    const keys = Object.keys(e).filter((k) => typeof e[k] !== 'function' && k !== '_world').sort();
    const kh = {}; for (const k of keys) { try { kh[k] = H(e[k] === undefined ? 'u' : e[k]); } catch (x) { kh[k] = '(순환)'; } }
    const ids = (e.npcs || []).map((n) => n && n.id);
    const sh = {}; for (const k of Object.keys(vl).filter((k) => k !== 'econ' && typeof vl[k] !== 'function').sort()) { try { const x = vl[k];
      sh[k] = H(x === undefined ? 'u' : (x instanceof Map ? [...x.entries()] : x instanceof Set ? [...x] : x)); } catch (z) { sh[k] = '(순환)'; } }
    return { name: vl.name, dbId: vl.dbId, pop: (e.npcs || []).length, kh, sh, ids, crop: vl._crop ? H(vl._crop) : null, npcPids: (vl.npcPids || []).length };
  });
  const allIds = vil.flatMap((v) => v.ids);
  const dup = allIds.length - new Set(allIds).size;
  return {
    tag, at: Date.now(), epoch: st.epoch, dayMs: st.dayMs, lastGameDay: st.lastGameDay,
    gameDayNow: Math.floor((Date.now() - st.epoch) / st.dayMs), worldDay: W ? W.day : null,
    econG: E.__t722G ? E.__t722G() : null,
    caravans: W && Array.isArray(W.caravans) ? W.caravans.length : null,
    caravanGoods: W && Array.isArray(W.caravans) ? W.caravans.reduce((a, c) => a + Object.values(c.goods || c.cargo || {}).reduce((x, y) => x + (+y || 0), 0), 0) : null,
    events: W && Array.isArray(W.events) ? W.events.length : null,
    tradeLog: W && Array.isArray(W.tradeLog) ? W.tradeLog.length : null,
    worldKeys: W ? Object.keys(W).filter((k) => typeof W[k] !== 'function').sort() : [],
    worldH: W ? Object.fromEntries(Object.keys(W).filter((k) => typeof W[k] !== 'function' && k !== 'villages').map((k) => { try { return [k, H(W[k] === undefined ? 'u' : W[k])]; } catch (x) { return [k, '(순환)']; } })) : {},
    carSer: W && Array.isArray(W.caravans) ? W.caravans.map((c) => { const o = {}; for (const k of Object.keys(c)) { const x = c[k];
      if (k === 'from' || k === 'to') o[k] = x && x.name; else if (k === 'trader') o[k] = x && x.id; else o[k] = x; } return o; }) : null,
    carCounter: W ? W._caravanIdCounter : null,
    vilKeep: Object.fromEntries((st.villages || []).map((vl) => { const e = vl.econ || {}; let pc = null; try { pc = e._priceCache ? JSON.parse(JSON.stringify(e._priceCache)) : null; } catch (x) {}
      return [vl.name, { fa: Array.isArray(e._forageActItems) ? e._forageActItems.slice() : null, pc, pcd: e._priceCacheDay, ltd: e.lastTradeDay, bo: vl._baseOre, pb: e.dailyProductionBuf ? Object.assign({}, e.dailyProductionBuf) : null }]; })),
    mc: global.__t722mc ? Object.fromEntries([...global.__t722mc.entries()].map(([k, r]) => [k, [r.s, r.t, r.w, r.kg]])) : null,
    vil, dupIds: dup, bodies: st.deps && st.deps.players ? st.deps.players.size : null,
    side: global.__t740Side ? global.__t740Side(st) : undefined,
    bodyKeep: process.env.T722_BODY_SAVE === '1' ? (() => { const P = st.deps && st.deps.players, o = {}; if (!P) return null;   // ★[T740] 몸 영속 흉내(계측 사본) — 명부 자리마다 몸의 JSON 칸 통째
      for (const vl of st.villages || []) o[vl.name] = (vl.npcPids || []).map((pid) => { const b = P.get(pid); if (!b) return null; const r = {};
        for (const k of Object.keys(b)) { if (k === 'ws') continue; const x = b[k]; if (typeof x === 'function') continue; try { const j = JSON.stringify(x); if (j !== undefined && j.length < 200000) r[k] = j; } catch (e) {} } return [pid, r]; });
      return o; })() : undefined,   // ★[T740] 서버 마을 칸 — Map · Set 을 풀어 칸 값 통째(t740-side-hook 이 있을 때만)
    t722: { back: st._t722Back, t0: st._t722T0, t1: st._t722T1 },
  };
}

// ── 멈춤: S 날 장부 문 → 얼림 → 마감 · 저장 큐 비면 → 덤프 → SIGTERM ─────────────────────────────
if (STOP) {
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    let armed = false;
    L.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      if (!armed && (day | 0) >= STOP) {
        armed = true;
        const st = require(VILL).__t722();
        if (process.env.T722_RAWTERM === '1') {   // ★[T728] 제품 종료 문 그대로 — 얼림·드레인 없이 S 날 장부 문(마감 한가운데)에서 SIGTERM
          try { if (DUMP) fs.writeFileSync(DUMP, JSON.stringify(Object.assign(snap('rawterm'), { rawterm: true }))); } catch (e) {}
          console.log(`[t722] SIGTERM(마감 중 · 얼림 없음) — econ day ${st.world.day}`);
          process.kill(process.pid, 'SIGTERM'); return r;
        }
        if (CRASH) { try { if (DUMP) fs.writeFileSync(DUMP, JSON.stringify(Object.assign(snap('crash'), { crash: true }))); } catch (e) {} process.exit(1); }
        st.dayFreeze = true;   // 다음 날을 열지 않는다(마감 · 저장 큐 드레인은 얼림 앞에 있다 — villages.js onGameTick)
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (st.tickJobs || (st.saveQueue && st.saveQueue.length)) return;
          clearInterval(iv);
          if (global.__t740Pause) global.__t740Pause();   // ★[T740] 덤프 동안 벽시계를 세운다(대조 판이 같은 순간에서 이어 가게)
          try { if (DUMP) fs.writeFileSync(DUMP, JSON.stringify(Object.assign(snap('stop'), { drainMs: Date.now() - t0 }))); } catch (e) { console.error('[t722] 덤프 실패', e.message); }
          if (process.env.T722_CONT === '1' && global.__t740Cont) { console.log(`[t722] 멈춤 없이 이어감(T740 대조) — econ day ${st.world.day} · 드레인 ${Date.now() - t0}ms`); global.__t740Cont(st); return; }   // ★[T740] 재기동 없는 대조 판
          console.log(`[t722] 멈춤 — econ day ${st.world.day} · 마감·저장 드레인 ${Date.now() - t0}ms · SIGTERM`);
          process.kill(process.pid, 'SIGTERM');
        }, 5);
      }
      return r;
    };
    return L;
  };
}

// ── 다시 뜸: 준비 순간 덤프(+ 안 사본 영속 되돌림) ────────────────────────────────────────────────
if (RESUME) {
  const iv = setInterval(() => {
    let st; try { st = require(VILL).__t722(); } catch (e) { return; }
    if (!st || !st.ready) return;
    clearInterval(iv);
    const pre = snap('resume');
    if (PERSIST.size) {
      try {
        const S0 = JSON.parse(fs.readFileSync(RESUME, 'utf8'));
        const o = {}; if (PERSIST.has('seed')) o.seed = S0.econG.seed; if (PERSIST.has('ids')) { o.npc = S0.econG.npc; o.vil = S0.econG.vil; }
        require(ECON).__t722G(o);
        if (S0.vilKeep) for (const vl of st.villages) { const k = S0.vilKeep[vl.name], e = vl.econ; if (!k || !e) continue;
          if (PERSIST.has('fa')) { if (k.fa) e._forageActItems = k.fa.slice(); else delete e._forageActItems; }
          if (PERSIST.has('pc')) { if (k.pc) e._priceCache = k.pc; else delete e._priceCache; if (k.pcd !== undefined) e._priceCacheDay = k.pcd; else delete e._priceCacheDay; }
          if (PERSIST.has('ltd')) e.lastTradeDay = k.ltd;
          if (PERSIST.has('pb') && k.pb) e.dailyProductionBuf = Object.assign({}, k.pb);
          if (PERSIST.has('bo')) { if (k.bo != null) vl._baseOre = k.bo; else delete vl._baseOre; } }
        if (PERSIST.has('body') && S0.bodyKeep) {   // ★[T740] 몸 영속 흉내 — 같은 명부 자리 · 같은 pid 몸에 JSON 칸을 되돌린다(T728 회부 2 의 크기 재기 · 제품 무변)
          const P = st.deps.players; let n = 0, miss = 0;
          for (const vl of st.villages) { const L = S0.bodyKeep[vl.name] || []; for (let i = 0; i < L.length; i++) { const e = L[i]; if (!e) continue; const b = P.get(vl.npcPids[i]);
            if (!b || vl.npcPids[i] !== e[0]) { miss++; continue; } for (const [k, j] of Object.entries(e[1])) { try { b[k] = JSON.parse(j); } catch (x) {} } n++; } }
          console.log(`[t722] 몸 영속 흉내 — 몸 ${n} 되돌림 · 못 맞춘 ${miss}`);
        }
        if (PERSIST.has('car') && Array.isArray(S0.carSer)) {   // 길 위 캐러밴 — 이름 · 주민 번호로 다시 잇는다(DB 행 흉내)
          const W = st.world, byName = new Map(W.villages.map((v) => [v.name, v]));
          W.caravans = S0.carSer.map((c) => { const o = Object.assign({}, c); o.from = byName.get(c.from); o.to = byName.get(c.to);
            o.trader = c.trader != null && o.from ? (o.from.npcs || []).find((n) => n.id === c.trader) || null : null; return o; }).filter((c) => c.from && c.to);
          W._caravanIdCounter = S0.carCounter;
          console.log(`[t722] 영속 흉내 — 캐러밴 ${W.caravans.length}/${S0.carSer.length} 되돌림 · 주인 잃은 ${W.caravans.filter((c) => c.trader == null).length}`);
        }
        console.log(`[t722] 영속 흉내 — ${[...PERSIST].join(',')} 되돌림`, JSON.stringify(o));
      } catch (e) { console.error('[t722] 영속 흉내 실패', e.message); }
    }
    try { if (DUMP) fs.writeFileSync(DUMP, JSON.stringify(Object.assign(pre, { persist: [...PERSIST], catchDays: CATCH }))); } catch (e) {}
    console.log(`[t722] 다시 뜸 — econ day ${st.world.day} · 앵커 ${st.lastGameDay} · 지금 날 ${pre.gameDayNow} · 밀린 날 따라잡기 ${CATCH}`);
  }, 2);
  // 따라잡기 끝 시각 — 덤프 파일 옆에 한 줄
  if (CATCH && DUMP) {
    const iv2 = setInterval(() => { let st; try { st = require(VILL).__t722(); } catch (e) { return; }
      if (st && st._t722T1 && !st.tickJobs) { clearInterval(iv2); const t2 = Date.now(); try { fs.writeFileSync(DUMP + '.catch', JSON.stringify({ t0: st._t722T0, lastOpen: st._t722T1, done: t2, ms: t2 - st._t722T0, day: st.world.day })); } catch (e) {} } }, 5);
  }
}
