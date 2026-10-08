// (@regress 없음 — 러너 밖 · T650 서버 판 자의 흔들림 계측기 · 제품 무변)
// === scripts/t650-print.js — 서버 판 자(`t577-server-run.js`)의 아이 존에 얹는 **날마다 지문 · 시간 읽기 셈** ==========
//   쓰는 법(서버 판 자의 아이 존이 env 를 물려받는다 — 자식에게만 켜진다):
//     NODE_OPTIONS="--require $PWD/scripts/t650-print.js" T400_BUILD_ACT=0 T577_DIR=<dir> T577_TAG=<판> node scripts/t577-server-run.js 30 1020
//     ⇒ `<T577_OUT>.t650.json` — 날마다 [econ 난수 상태 · 마을마다 지문(곳간 · 인구 · econ 주민 · 몸 좌표 합)] + 그날 시간 읽기 셈(부른 자리별)
//   ★재는 것(전부 읽기만 — 세계에 0):
//     · econ 난수 상태 `_seed`(`sim/economy-sim.js` 모듈 안 LCG — 적재 때 이 모듈 끝에 읽기 함수 한 줄을 덧붙여 꺼낸다 · 제품 파일 무변)
//     · 마을마다(econ `world.villages` · 서버 `state.villages` — `Winter.dailyExtra(day, state.villages)` 가 받는 그 배열):
//         곳간 = storage 전 칸(1e-6 반올림 · 해시와 칸 그대로) · 금고 = treasury 전 칸(그날 사본 — 객체를 참조로 담으면 끝날 값이 모든 날에 찍힌다) · 인구 = npcs.length · econ 주민 = 주민 칸 해시 · 몸 = 서버 마을의 몸 좌표 합(px) · 금고 · 교역 표 해시 · 마지막 교역일
//     · 그날 시간 읽기: Date.now · performance.now · process.hrtime · Math.random — 부른 자리(server/·sim/ 파일:줄 첫 프레임)별 셈
//       (Date.now 는 너무 잦아 1/64 표본으로 자리를 센다 · 총수는 전수)
//     · [T650_WRITES=1] econ 마을 곳간(storage)·국고(treasury) 쓰기 — 부른 자리 × 칸 × 키별 더해진 양(날마다 · Proxy · 새 세계 판만)
//   ★지문 시각 = 서버 장부 `scanDay` 문(econ 하루 끝 · t577 훅 · t634 관찰자와 같은 자리) — 원래 함수를 부르기 **전에** 적는다.
'use strict';
const OUT0 = process.env.T577_OUT || '';
if (OUT0) {
  const path = require('path');
  const fs = require('fs');
  const crypto = require('crypto');
  const Module = require('module');
  const ROOT = path.join(__dirname, '..');
  const OUT = OUT0 + '.t650.json';
  const ECON = path.join(ROOT, 'sim', 'economy-sim.js');
  // ── econ 난수 상태 꺼내기 — 적재 때 그 모듈 끝에 읽기 함수 한 줄(제품 파일 무변 · 읽기만)
  const _load = Module._extensions['.js'];
  // [T650_CUT=guard|repath|both] (계측 전용 — 제품 파일 무변 · 적재 때 이 프로세스 안 사본 글자만) 캐러밴 몸이 econ 도착을 미는 두 자리를 끈다:
  //   guard = 도착 임박 가드(villages.js `econ 도착 +N일 지연(잔여 …)` 줄) · repath = 로컬 재경로 연장 지연. 끈 자리는 econ 을 안 민다(몸은 그대로 걷는다).
  //   stamp = 캐러밴 몸의 길 답압(§16 `stampEntityPx`) — 몸이 지나간 셀이 길이 되지 않는다. 쉼표로 겹친다(`both,stamp`).
  const CUT = process.env.T650_CUT || '';
  const CUTS = new Set(CUT.split(',').flatMap((k) => (k === 'both' ? ['guard', 'repath'] : [k])).filter(Boolean));
  const VILL = path.join(ROOT, 'server', 'villages.js');
  Module._extensions['.js'] = function (m, filename) {
    if (filename === VILL && CUT) {
      let src = fs.readFileSync(filename, 'utf8'); let n = 0;
      if (CUTS.has('guard')) { const a = '    if (!body._xzSendWait && now >= body.arriveAt - state.dayMs * 0.02'; if (src.includes(a)) { src = src.replace(a, '    if (false && !body._xzSendWait && now >= body.arriveAt - state.dayMs * 0.02'); n++; } }
      if (CUTS.has('repath')) { const a = '      _clockPush(c, pushed, body.phase);   // ★[T60 ③] 세 값 동기(위 `_clockPush` 주석)'; if (src.includes(a)) { src = src.replace(a, '      pushed = 0; if (false) _clockPush(c, pushed, body.phase);'); n++; } }
      if (CUTS.has('stamp')) { const a = '    if (state.roads) state.roads.stampEntityPx(p, p.x, p.y);   // §16 답압(캐러밴'; if (src.includes(a)) { src = src.replace(a, '    if (false && state.roads) state.roads.stampEntityPx(p, p.x, p.y);   // §16 답압(캐러밴'); n++; } }
      console.log(`[t650] T650_CUT=${CUT} — 바꾼 자리 ${n}`);
      return m._compile(src, filename);
    }
    if (filename === ECON) {
      const src = fs.readFileSync(filename, 'utf8') + '\n;module.exports.__t650Seed = function () { return _seed; };\n';
      return m._compile(src, filename);
    }
    return _load(m, filename);
  };
  // ── 시간 읽기 셈 ──
  const SITE = (st) => {   // 첫 server/·sim/ 프레임(이 파일 · node 내부 제외)
    const L = String(st).split('\n');
    for (let i = 2; i < L.length; i++) { const m = L[i].match(/\((\/[^)]+):(\d+):\d+\)|at (\/[^ ]+):(\d+):\d+/); if (!m) continue;
      const f = m[1] || m[3], ln = m[2] || m[4]; if (f === __filename || f.indexOf('/node_modules/') >= 0) continue;
      if (f.indexOf(ROOT) === 0) return path.relative(ROOT, f) + ':' + ln; }
    return '(밖)';
  };
  const cnt = { now: 0, perf: 0, hr: 0, rnd: 0 }, sites = { now: {}, perf: {}, hr: {}, rnd: {} };
  const bump = (k, every) => { cnt[k]++; if (every <= 1 || cnt[k] % every === 0) { const s = SITE(new Error().stack); sites[k][s] = (sites[k][s] || 0) + 1; } };
  const _now = Date.now; Date.now = function () { bump('now', 64); return _now(); };
  const { performance } = require('perf_hooks');
  const _pn = performance.now.bind(performance); performance.now = function () { bump('perf', 64); return _pn(); };
  const _hr = process.hrtime; const hr = function (t) { bump('hr', 64); return _hr(t); }; hr.bigint = function () { bump('hr', 64); return _hr.bigint(); }; process.hrtime = hr;
  const _rnd = Math.random; Math.random = function () { bump('rnd', 1); return _rnd(); };
  // ── [T650_WRITES=1] econ 마을 곳간·국고 쓰기를 자리별로 센다(Proxy · 키마다 더해진 양의 합 · 날마다) — 누가 판마다 다르게 쓰나
  const WR = process.env.T650_WRITES === '1';
  const wr = {};   // site|칸|키 → 양 합(그날)
  let curWorld = null, wrapWorld = null;
  if (WR) {
    try {
      const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
      const cw = V2.createWorldV2;
      const MARK = Symbol('t650');
      wrapWorld = (w) => { for (const v of (w.villages || [])) { if (v.storage && !v.storage[MARK]) v.storage = wrap(v.storage, 'st'); if (v.treasury && !v.treasury[MARK]) v.treasury = wrap(v.treasury, 'tr'); } };
      const wrap = (obj, tag) => new Proxy(obj, { get(t, k) { return k === MARK ? true : t[k]; }, set(t, k, val) { const old = t[k]; t[k] = val;
        if (typeof val === 'number' && typeof k === 'string') { const dv = val - (typeof old === 'number' ? old : 0);
          if (dv !== 0) { const q = SITE(new Error().stack) + '|' + tag + '|' + k; wr[q] = (wr[q] || 0) + dv; } }
        return true; } });
      V2.createWorldV2 = function () { const w = cw.apply(this, arguments);
        try { curWorld = w; wrapWorld(w); } catch (e) {}
        return w; };
    } catch (e) {}
  }
  // ── 서버 마을 배열 잡기 — 겨울나기 날 문이 받는 그 배열(읽기만)
  let SV = null;
  try { const W = require(path.join(ROOT, 'server', 'winter.js')); const de = W.dailyExtra; W.dailyExtra = function (day, vils) { SV = vils; return de.apply(this, arguments); }; } catch (e) {}
  let Econ = null;
  const H = (x) => crypto.createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 12);
  const R6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
  const stor = (st) => { const o = {}; for (const k of Object.keys(st || {}).sort()) o[k] = R6(st[k]); return o; };
  const npcSig = (npcs) => (npcs || []).map((n) => n && typeof n === 'object' ? [n.id != null ? n.id : n.pid, R6(n.age), n.job || n.role || null, R6(n.hunger), R6(n.hp)] : n);
  const bodySum = (sv) => { if (!sv) return null; const arr = sv.npcs || sv.bodies || sv.members || []; let n = 0, sx = 0, sy = 0;
    for (const b of arr) { if (!b) continue; const x = b.x != null ? b.x : (b.pos && b.pos[0]), y = b.y != null ? b.y : (b.pos && b.pos[1]); if (typeof x === 'number' && typeof y === 'number') { n++; sx += x; sy += y; } }
    return [n, Math.round(sx), Math.round(sy)]; };
  const days = [];
  let last = -1, keys = null, tlLen = 0;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          last = d;
          if (!Econ) { try { Econ = require(ECON); } catch (e) { Econ = {}; } }
          if (WR && wrapWorld) { try { wrapWorld(world); } catch (e) {} }   // 장부가 받은 world(새로 지은 객체여도 여기서 다시 감싼다)
          const V = world.villages || [];
          if (!keys) keys = { econVillage: V[0] ? Object.keys(V[0]).slice(0, 80) : [], econNpc: V[0] && V[0].npcs && V[0].npcs[0] && typeof V[0].npcs[0] === 'object' ? Object.keys(V[0].npcs[0]) : [],
            serverVillage: SV && SV[0] ? Object.keys(SV[0]).slice(0, 80) : [], world: Object.keys(world).slice(0, 80) };
          const byName = new Map(); for (const sv of (SV || [])) if (sv && sv.name) byName.set(sv.name, sv);
          const vil = V.map((v) => { const sv = byName.get(v.name);
            return [v.name, H(stor(v.storage)), (v.npcs || []).length, H(npcSig(v.npcs)), bodySum(sv), R6(v.housing), v.expansions || 0, stor(v.storage), (v.treasury && typeof v.treasury === 'object') ? stor(v.treasury) : R6(v.treasury), v.tradeStats ? H(v.tradeStats) : null, v.lastTradeDay != null ? v.lastTradeDay : null,
              // ★[T661] 덧칸(끝에만 덧붙인다 — 비교기의 칸 번호 무변): 직업 수 · 어장 상한 · 어제 어획 · 잠재 어획
              v.counts ? stor(v.counts) : null, v.land ? R6(v.land.fishSustain) : null, R6(v._fishOutLast), R6(v._fishRawLast)]; });
          const wsnap = {}; for (const [q, x] of Object.entries(wr)) wsnap[q] = R6(x); for (const q of Object.keys(wr)) delete wr[q];
          days.push({ d, seed: Econ.__t650Seed ? Econ.__t650Seed() : null, wd: world.day, cnt: Object.assign({}, cnt), sites: JSON.parse(JSON.stringify(sites)), wr: WR ? wsnap : undefined,
            car: Array.isArray(world.caravans) ? world.caravans.length : null, vil,
            tl: Array.isArray(world.tradeLog) ? world.tradeLog.slice(Math.min(tlLen, world.tradeLog.length)).map((t) => JSON.stringify(t)) : null });
          if (Array.isArray(world.tradeLog)) tlLen = world.tradeLog.length;
          for (const k of Object.keys(cnt)) { cnt[k] = 0; sites[k] = {}; }
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
  process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify({ keys, days })); } catch (e) {} });
}
