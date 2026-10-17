// (@regress 없음 — 러너 밖 · T737 계측기 · 제품 무변)
// === scripts/t737-probe.js — 해 질 녘 곳간 정산(T720 ③) 셈: `T686_PATCH` 로 t686 자 사본(git worktree)에만 박는다 ==========
//   쓰는 법: T686_PATCH=$PWD/scripts/t737-probe.js node scripts/t686-spike.js run <판>     (판 끝 `t686` fin 줄과 같은 때 `<DIR>/<판>.t737.json`)
//   ★무엇 — 부른 수 · 합 ms(포함 값): `_t720Held` · `_t720Step` · `_t720Settle` · `_lifeGoHome` · `npcLifeTick`(생활 층 결정 문 전체)
//     · `_t720Step` 갈래(해 질 녘 전 · 이미 나선 날 · 빈손 · 새로 나섬 · 운반 중 · 저장 중 · 넣음 · 하루 문 놓음)
//     · 해 질 녘 운반 몸의 길 묻기(`computeNpcPath` — 존 사본 · `npc._t720.k` 인 몸) 수 · ms.
//   (세계에 0 — 읽기만 · 감싸기 비용은 판 전체에 얹힌다 · 같은 자로 끔/켬/고친 켬을 견준다)
'use strict';
const fs = require('fs');
const path = require('path');

const VTAIL = `
;(function () {   // [T737 탐침 · 계측기가 박았다 · 제품엔 없다]
  const OUT = process.env.T737_OUT; if (!OUT) return;
  const fs = require('fs'), pf = require('perf_hooks').performance, now = () => pf.now();
  const C = globalThis.__T737C = { fn: {}, br: {} };
  const W = (k, f0) => { if (typeof f0 !== 'function') return f0; const x = C.fn[k] = [0, 0]; return function () { const t = now(); try { return f0.apply(this, arguments); } finally { x[0]++; x[1] += now() - t; } }; };
  try { _t720Held = W('_t720Held', _t720Held); } catch (e) {}
  //   ★[T737 견줌] T737_VERIFY=1 — 부를 때마다 종전 글자(손 이름을 그 자리에서 짓는 줄)로 한 번 더 세어 같은 수인가(Object.is · 계측 · 세계는 앞 답)
  if (process.env.T737_VERIFY === '1') try { const f0 = _t720Held; const V = C.verify = { n: 0, diff: 0, pos: 0, ex: [] };
    _t720Held = function (vil, npc) { const a = f0(vil, npc);
      let u = 0; if (vil.econ) { const E = _lifeEcon(), inv = npc.inventory || {};
        if (E.fishActOn(vil.econ)) u += npc._t312U || 0;
        if (_t368ItemsOn() && npc._t368H) for (const c in npc._t368H) u += npc._t368H[c] || 0;
        if (E.T325_WOOD_ACT && E.woodActOn(vil.econ) && _t720Logger(vil, npc)) u += inv.wood || 0;
        if (E.T347_FORAGE_ACT && E.forageActOn(vil.econ)) { for (const k of (_t347KeepOf(vil) || [])) for (const h of _t347HandsOf(k)) u += inv[h] || 0; } }
      V.n++; if (a > 0) V.pos++; if (!Object.is(a, u)) { V.diff++; if (V.ex.length < 5) V.ex.push([npc.pid, a, u]); }
      //   지어낸 손(채집 손 이름마다 다른 값 · 겹친 이름도) — 빈손 몸만 보는 판에서도 채집 절의 합을 견준다(같은 차례 · 같은 합)
      if (vil.econ && (V.syn = V.syn || { n: 0, diff: 0 }).n < 200000) { const E = _lifeEcon(); if (E.T347_FORAGE_ACT && E.forageActOn(vil.econ)) {
        const keep = _t347KeepOf(vil) || [], inv2 = {}; let i = 0; for (const k of keep) for (const h of _t347HandsOf(k)) inv2[h] = 0.1 + (i++) * 0.37;
        let o = 0; for (const k of keep) for (const h of _t347HandsOf(k)) o += inv2[h] || 0;
        let c = 0; if (typeof _t737Hands === 'function') { const hs = _t737Hands(vil, _t347KeepOf(vil)); for (let j = 0; j < hs.length; j++) c += inv2[hs[j]] || 0; } else c = o;
        V.syn.n++; if (!Object.is(o, c)) V.syn.diff++; } }
      //   지어낸 몸(손 넷 다 양수 · 볏단 칸 둘 · 나무꾼이면 통나무) — 손잡이 뒤 꼴(_t737Held)과 종전 글자를 같은 몸으로 견준다(양수 갈래)
      if (typeof _t737Held === 'function' && (V.fake = V.fake || { n: 0, diff: 0, pos: 0 }).n < 200000) {
        const inv2 = Object.assign({}, npc.inventory || {}, { wood: 2.5 + (V.fake.n % 7) * 0.13 });
        try { for (const k of (_t347KeepOf(vil) || [])) for (const h of _t347HandsOf(k)) inv2[h] = 0.3 + (V.fake.n % 5) * 0.11; } catch (e) {}
        const F = Object.assign(Object.create(Object.getPrototypeOf(npc)), npc, { _t312U: 1.3 + (V.fake.n % 3) * 0.07, _t368H: { a: 0.2, b: 0.7 + (V.fake.n % 4) * 0.01 }, inventory: inv2 });
        const x = _t737Held(vil, F);
        let y = 0; { const E = _lifeEcon(), inv = F.inventory || {};
          if (E.fishActOn(vil.econ)) y += F._t312U || 0;
          if (_t368ItemsOn() && F._t368H) for (const c in F._t368H) y += F._t368H[c] || 0;
          if (E.T325_WOOD_ACT && E.woodActOn(vil.econ) && _t720Logger(vil, F)) y += inv.wood || 0;
          if (E.T347_FORAGE_ACT && E.forageActOn(vil.econ)) { for (const k of (_t347KeepOf(vil) || [])) for (const h of _t347HandsOf(k)) y += inv[h] || 0; } }
        V.fake.n++; if (y > 0) V.fake.pos++; if (!Object.is(x, y)) V.fake.diff++; }
      return a; }; } catch (e) {}
  try { _t720Settle = W('_t720Settle', _t720Settle); } catch (e) {}
  try { _lifeGoHome = W('_lifeGoHome', _lifeGoHome); } catch (e) {}
  try { if (typeof _t737Held === 'function') _t737Held = W('_t737Held', _t737Held); } catch (e) {}
  try { const f0 = _t720Step; const x = C.fn._t720Step = [0, 0];
    _t720Step = function (vil, npc, nw, fv, dayR, day) { const S0 = npc._t720, k0 = S0 && S0.k; const t = now(); let r; try { return (r = f0.apply(this, arguments)); } finally { x[0]++; x[1] += now() - t;
      const S = npc._t720; let b;
      if (!k0) b = !(fv >= dayR) ? '해 질 녘 전' : (S0 && S0.dd === day) ? '이미 나선 날' : (S && S.k) ? '새로 나섬' : (S && S.dd === day) ? '빈손 · 날 도장' : '빈손';
      else b = (S && S.k) ? (r ? (Math.hypot(npc.x - S.tx, npc.y - S.ty) > 44 ? '운반 중' : '저장 중') : '?') : (S && S.dd === S.d0 ? '넣음 · 놓음' : '?');
      C.br[b] = (C.br[b] || 0) + 1; } }; } catch (e) {}
  process.on('SIGUSR2', () => { try { const z = globalThis.__T737Z || null; fs.writeFileSync(OUT, JSON.stringify(Object.assign({}, C, { zone: z }))); } catch (e) {} });
  process.on('SIGHUP', () => { for (const k in C.fn) { C.fn[k][0] = 0; C.fn[k][1] = 0; } for (const k in C.br) C.br[k] = 0; if (C.verify) { C.verify.n = 0; C.verify.diff = 0; C.verify.pos = 0; } if (globalThis.__T737Z) { const z = globalThis.__T737Z; z.n = 0; z.ms = 0; z.astar = 0; z.lt = [0, 0]; } });
})();
`;
const ZTAIL = `
;(function () {   // [T737 탐침 · 존 사본]
  if (!process.env.T737_OUT) return;
  const pf = require('perf_hooks').performance, now = () => pf.now();
  const Z = globalThis.__T737Z = { n: 0, ms: 0, lt: [0, 0] };
  { const f0 = computeNpcPath; computeNpcPath = function (npc, t) { if (!(npc._t720 && npc._t720.k)) return f0(npc, t); const a = now(); try { return f0(npc, t); } finally { Z.n++; Z.ms += now() - a; } }; }
  try { if (SimVillages && SimVillages.npcLifeTick) { const f0 = SimVillages.npcLifeTick; SimVillages.npcLifeTick = function () { const a = now(); try { return f0.apply(this, arguments); } finally { Z.lt[0]++; Z.lt[1] += now() - a; } }; } } catch (e) {}
})();
`;
module.exports = function (dir) {
  const vp = path.join(dir, 'server', 'villages.js'); fs.appendFileSync(vp, VTAIL);
  const zp = path.join(dir, 'server', 'zone.js'); fs.appendFileSync(zp, ZTAIL);
  for (const p of [vp, zp]) require('child_process').execFileSync(process.execPath, ['--check', p]);
};
