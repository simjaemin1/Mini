// (@regress 없음 — 러너 밖 · T1495 갈래 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1495-why-probe.js — 짐승이 보는 사람 없이도 사람을 치게 하면(T1461_BEAST_UNSEEN) 왜 사람이 느는가 — 마을마다 날마다 잰다 ==========
//   쓰는 법: `T1495_PROBE_OUT=<파일.jsonl> NODE_OPTIONS="--require $PWD/scripts/t1495-why-probe.js" node scripts/t1331-run.js …`(존 아이에서만 돈다)
//   날마다 한 줄(마을 칸은 마을 차례 배열):
//     · 사냥 — 사냥꾼 몸 수 · 사냥 나간 몸-날(`_huntOn` 표본) · 판이 쥔 몸-날(`_t1393Own`) · 곳간에 든 마리(`_t1195Got` 차) · 든 고기 econ 단위(`huntToGranary` 'meat')
//     · 다침 — 야생 타(사냥꾼 · 그 밖) · 피해 · 요양한 몸-날(`_rest` 또는 HP < 60% 표본 · 사냥꾼 · 그 밖) · 마을 밖에 선 몸-날
//     · 사람 — 인구 · 태어남(처음 보는 신원) · 들어옴(다른 마을에서) · 떠남(다른 마을로) · 사라짐(죽음) · 죽음 까닭 누계 차(굶음 `_fdDeadTot` · 자연사 `_natDeadTot` · 그 밖)
//     · 곳간 — 식량 · 고기 · 사냥꾼 수(econ 직업)
//     · 지문 — 마을마다 econ 지문(신원 · 곳간) · NPC 몸 지문(자리 · HP) · 짐승 몸 지문(자리 · 종) — 끔 ↔ 켬이 처음 갈리는 날과 갈린 곳을 찾는다
//     · 짐승 — 종별 몸 수 · 가장 가까운 마을(영토 칸 무게중심)에서의 거리 띠(잠든 몸 spN · band / 깬 몸까지 spA · bandA · 깬 몸 spM) · 사냥판 셈(깨움 · 잡음 · 상한)
//   `T1495_EPS=<날>` — 흔들림 대조: 그날 첫 야생 굴림 하나를 버린다(호스트 흐름 `rng` 한 번 더 굴림 — 규칙 · 수 무변 · 세계에 든 것은 굴림 차례 한 칸뿐).
//   ⚠읽기만(EPS 끔) — 세계에 아무것도 안 쓴다.
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module'), crypto = require('crypto');
if (!process.env.T1495_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const ROOT = path.join(__dirname, '..');
const VF = path.join(ROOT, 'server', 'villages.js'), WF = path.join(ROOT, 'server', 'wildlife.js'), BF = path.join(ROOT, 'server', 'beast-body.js'), EF = path.join(ROOT, 'sim', 'economy-sim.js');
const OUT = process.env.T1495_PROBE_OUT, EPS = process.env.T1495_EPS ? parseInt(process.env.T1495_EPS, 10) : null;
try { fs.unlinkSync(OUT); } catch (e) {}
const h8 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
const pc = { cpu: 0 };   // 계측기 자신의 CPU(µs)
let curDay = -1, epsFired = null, SV = null, vIdx = new Map(), eIdx = new Map();
let acc = null;   // 그날 쌓는 칸
const newAcc = (n) => ({ n, samp: 0, hunters: new Array(n).fill(0), hOn: new Array(n).fill(0), hOwn: new Array(n).fill(0), restH: new Array(n).fill(0), restO: new Array(n).fill(0), outB: new Array(n).fill(0),
  hitH: new Array(n).fill(0), hitO: new Array(n).fill(0), dmgH: new Array(n).fill(0), dmgO: new Array(n).fill(0), meatU: new Array(n).fill(0), hitX: 0, hitSrc: {} });
function vidxOf(p) { if (!SV || p.simVillageId == null) return -1; const st = SV.__t1495v(); const vil = st.byDbId && st.byDbId.get(p.simVillageId | 0); const i = vil ? vIdx.get(vil) : undefined; return i == null ? -1 : i; }
// econ — 사냥 고기 입구
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1495v') < 0) src += '\n;module.exports.__t1495v = function () { return state; };\n'; return _c.call(this, src, fn); };
  }
  const r = _p(m, filename);
  if (filename === EF && typeof m.exports.huntToGranary === 'function') {
    const h0 = m.exports.huntToGranary;
    m.exports.huntToGranary = function (v, item, units) { const g = h0.apply(this, arguments); if (item === 'meat' && g > 0 && acc) { const i = eIdx.get(v); if (i != null) acc.meatU[i] += g; } return g; };
  }
  if (filename === WF && typeof m.exports.init === 'function') {
    const i0 = m.exports.init;
    m.exports.init = function (H) {
      if (H && typeof H.damagePlayer === 'function') {
        const d0 = H.damagePlayer;
        H.damagePlayer = function (p, d, src) {
          try { if (acc && p && p.isNpc && d > 0) { const i = vidxOf(p); const hu = p.simJob === 'hunter'; if (i < 0) acc.hitX++; else if (hu) { acc.hitH[i]++; acc.dmgH[i] += d; } else { acc.hitO[i]++; acc.dmgO[i] += d; } const k = (hu ? 'H:' : 'O:') + String(src || '').slice(0, 10); acc.hitSrc[k] = (acc.hitSrc[k] || 0) + 1; } } catch (e) {}
          return d0.apply(this, arguments);
        };
      }
      if (EPS != null && H && typeof H.rng === 'function') {
        const r0 = H.rng;
        H.rng = function () { if (epsFired == null && curDay >= EPS) { epsFired = curDay; r0.apply(this, arguments); } return r0.apply(this, arguments); };
      }
      return i0.apply(this, arguments);
    };
  }
  if (filename === VF) {
    SV = m.exports;
    const g = m.exports.onGameTick;
    let calls = 0, prevCalls = 0, sinceS = 0, prev = null, seen = new Set(), cent = null, centDay = -99;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      const u0 = process.cpuUsage();
      try {
        const st = m.exports.__t1495v(), d = (st.world && st.world.day) | 0;
        if (!st.ready) return out;
        calls++; sinceS++;
        if (d !== curDay) {
          if (acc && curDay >= 0) dayEnd(st, curDay);
          curDay = d; prevCalls = calls; calls = 0; sinceS = 0;
          vIdx = new Map(); eIdx = new Map(); (st.villages || []).forEach((vil, i) => { vIdx.set(vil, i); if (vil.econ) eIdx.set(vil.econ, i); });
          acc = newAcc((st.villages || []).length);
        }
        const stride = Math.max(1, Math.floor(prevCalls / 48));
        if (sinceS >= stride) { sinceS = 0; sample(st); }
      } catch (e) { try { fs.appendFileSync(OUT, JSON.stringify({ err: String(e && e.stack).slice(0, 600) }) + '\n'); } catch (e2) {} }
      const u = process.cpuUsage(u0); pc.cpu += u.user + u.system;
      return out;
    };
    function sample(st) {
      acc.samp++;
      for (const p of (st.deps && st.deps.players ? st.deps.players.values() : [])) {
        if (!p.isNpc || p.simWar || p._bxExit || !(p.hp > 0)) continue;
        const i = vidxOf(p); if (i < 0) continue;
        const hu = p.simJob === 'hunter';
        if (hu) { acc.hunters[i]++; if (p._huntOn) acc.hOn[i]++; if (p._t1393Own) acc.hOwn[i]++; }
        if (p._rest || p.hp < (p.maxHp || 100) * 0.6) { if (hu) acc.restH[i]++; else acc.restO[i]++; }
        const vil = st.villages[i]; const cx = Math.floor(p.x / 32), cy = Math.floor(p.y / 32);
        if (p.simCaravan || !vil._terrSet || !vil._terrSet.has(cx + ',' + cy)) acc.outB[i]++;
      }
    }
    function dayEnd(st, day) {
      const V = st.villages || [], n = V.length, S = Math.max(1, acc.samp);
      const r = (a) => a.map((x) => +(x / S).toFixed(3));
      const pop = [], born = new Array(n).fill(0), inn = new Array(n).fill(0), left = new Array(n).fill(0), gone = new Array(n).fill(0), fd = [], nat = [], dead = [], emig = [], got = [], food = [], meat = [], hj = [], hE = [];
      const now = new Map();
      V.forEach((vil, i) => { const v = vil.econ; if (!v) return; for (const q of (v.npcs || [])) now.set(q.id, i); });
      for (const [id, i] of now) { if (!prev) continue; const j = prev.get(id); if (j == null) { if (seen.has(id)) inn[i]++; else born[i]++; } else if (j !== i) { inn[i]++; left[j]++; } }
      if (prev) for (const [id, j] of prev) if (!now.has(id)) gone[j]++;
      for (const id of now.keys()) seen.add(id);
      V.forEach((vil, i) => {
        const v = vil.econ || {}; const s = v.storage || {};
        pop.push((v.npcs && v.npcs.length) || 0); fd.push(v._fdDeadTot || 0); nat.push(v._natDeadTot || 0); dead.push(v._deadTot || 0); emig.push(v._emigTot || 0); got.push(vil._t1195Got || 0);
        food.push(+(+s.food || 0).toFixed(2)); meat.push(+(+s.meat || 0).toFixed(2));
        let k = 0; for (const q of (v.npcs || [])) if (q.currentJob === 'hunter') k++; hj.push(k);
        hE.push(h8(JSON.stringify([(v.npcs || []).map((q) => q.id), s])));
      });
      // 몸 지문
      const P = []; for (const p of (st.deps && st.deps.players ? st.deps.players.values() : [])) if (p.isNpc) P.push(p.pid + ':' + Math.round(p.x * 100) + ':' + Math.round(p.y * 100) + ':' + Math.round((p.hp || 0) * 100));
      P.sort();
      const Bm = require.cache[BF] && require.cache[BF].exports, B = Bm && Bm.current;
      const spN = {}, band = {}, BB = [], spA = {}, bandA = {}, spM = {};
      if (B) {
        if (day - centDay >= 10 || !cent) { centDay = day; cent = []; for (const vil of V) { if (!vil._terrSet || !vil._terrSet.size) continue; let sx = 0, sy = 0, c = 0; for (const k of vil._terrSet) { const j = k.indexOf(','); sx += +k.slice(0, j); sy += +k.slice(j + 1); c++; } cent.push([sx / c, sy / c]); } }
        for (const [id, b] of B.W.bodies) {
          BB.push(id + ':' + b.sp + ':' + b.cx + ':' + b.cy + ':' + (b.mat ? 1 : 0));
          let md = 1e9; for (const c of cent) { const dd = (b.cx - c[0]) ** 2 + (b.cy - c[1]) ** 2; if (dd < md) md = dd; }
          md = Math.sqrt(md); const bi = md < 50 ? 0 : md < 100 ? 1 : md < 200 ? 2 : md < 400 ? 3 : 4;
          spA[b.sp] = (spA[b.sp] || 0) + 1; (bandA[b.sp] || (bandA[b.sp] = [0, 0, 0, 0, 0]))[bi]++;   // 깬 몸(mat · 자리 = 깨움 틱의 몸 표 자리)까지 — 종별 전체
          if (b.mat) { spM[b.sp] = (spM[b.sp] || 0) + 1; continue; }
          spN[b.sp] = (spN[b.sp] || 0) + 1;
          (band[b.sp] || (band[b.sp] = [0, 0, 0, 0, 0]))[bi]++;
        }
        BB.sort();
      }
      const W = require.cache[WF] && require.cache[WF].exports, ws = W && W.t1393Stat ? W.t1393Stat() : null;
      const s32 = SV.t1432Stat ? SV.t1432Stat() : null;
      const rec = { d: day, samp: acc.samp, pop, born, inn, left, gone, fd, nat, dead, emig, got, meatU: acc.meatU.map((x) => +x.toFixed(3)), food, meat, hj,
        hunters: r(acc.hunters), hOn: r(acc.hOn), hOwn: r(acc.hOwn), restH: r(acc.restH), restO: r(acc.restO), outB: r(acc.outB),
        hitH: acc.hitH, hitO: acc.hitO, dmgH: acc.dmgH.map(Math.round), dmgO: acc.dmgO.map(Math.round), hitX: acc.hitX, hitSrc: acc.hitSrc,
        spN, band, spA, bandA, spM, ws: ws ? { wake: ws.wake, sleep: ws.sleep, hunt: ws.hunt, cap: ws.cap, butch: ws.butch, carcLost: ws.carcLost, huntMin: Math.round(ws.huntMin) } : null,
        w32: s32 ? { died: s32.died, wild: s32.wild, other: s32.other } : null,
        hE, hEall: h8(hE.join('')), hN: h8(P.join('|')), hB: h8(BB.join('|')), eps: epsFired, probeCpuMs: Math.round(pc.cpu / 1000) };
      fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
      prev = now;
    }
  }
  return r;
};
