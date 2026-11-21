// (@regress 없음 — 러너 밖 · T1406 ㉯ 재현 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1406-block-probe.js — 플레이어가 교역로가 지나는 다리 양끝을 울타리로 막으면 지금 무슨 일이 생기나 ==========
//   쓰는 법: `NODE_OPTIONS="-r $PWD/scripts/t1406-block-probe.js" T1406_BLOCK_DAY=<econ 날> T1406_BLOCK_OUT=<파일.json> node scripts/t1308-long-run.js …`
//   ⓐ 그날 한 번: 교역로(`state.routeCache`)가 가장 많이 지나는 다리 묶음(존 설정 `bridges` 4방 덩이)을 고른다
//   ⓑ 가짜 플레이어(`p_t1406` · 소켓 없음 · players 표에 안 넣는다 = 보는 사람 0)가 **제품 건축 길 그대로**(`_tryBuildAt` · 비용 0) 그 다리의 양끝 뭍 착지 칸에 울타리를 놓는다
//      — 다리 폭 2칸이라 끝마다 2개 · 다리 위 물 칸에도 하나 놓아 본다(물 위에 서는가)
//   ⓒ 날마다: 그 다리를 지나는 교역로 수 · 막힌 칸의 `isBlockedByWall` · 캐러밴 몸이 그 다리 칸을 밟은 수(막힌 뒤) · 울타리가 서 있는가(부서졌나)
//   로그 줄(차단 · 재경로 · 고립 · 지연 · 울타리 허묾)은 판 출력에서 grep 한다(이 자는 안 센다).
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1406_BLOCK_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
const DAY = +(process.env.T1406_BLOCK_DAY || 10), OUT = process.env.T1406_BLOCK_OUT, SZ = 32;
let rec = { day: DAY, pick: null, placed: [], days: {} };
try { const o = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (o && o.days) rec = o; } catch (e) {}
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec, null, 1)); } catch (e) {} };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === ZF || filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) {
      if (filename === ZF && src.indexOf('__t1406z') < 0) src += '\n;globalThis.__t1406z = { tryBuildAt: (...a) => _tryBuildAt(...a), buildings, isBlockedByWall: (...a) => isBlockedByWall(...a) };\n';
      if (filename === VF && src.indexOf('__t1406v') < 0) src += '\n;module.exports.__t1406v = function () { return state; };\n';
      return _c.call(this, src, fn);
    };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let lastDay = -1;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try {
        const st = m.exports.__t1406v(), d = (st.world && st.world.day) | 0, Z = globalThis.__t1406z;
        if (!Z) return out;
        if (rec.pick && st.caravanBodies && st.deps && st.deps.players) {   // 틱마다 — 캐러밴 몸이 막힌 끝 칸을 밟았나(몸 · 날 열쇠)
          const Lt = rec._L || (rec._L = rec.pick.land.map(([x, y]) => x + ',' + y)); const D = rec.days[d] || (rec.days[d] = {});
          for (const [cid, bd] of st.caravanBodies) { const pp = st.deps.players.get(bd.pid); if (!pp) continue; if (Lt.includes(Math.floor(pp.x / SZ) + ',' + Math.floor(pp.y / SZ))) { D.onEnd = D.onEnd || {}; D.onEnd[cid] = (D.onEnd[cid] || 0) + 1; } }
        }
        if (d === lastDay) return out;
        lastDay = d;
        const Zc = require(path.join(ROOT, 'server', 'zone-config')).ZONES[st.zoneId] || {}, b = Zc.bridges || [];
        const isW = (x, y) => !!(st.ta && st.ta.isWater(x, y));
        if (!rec.pick && d >= DAY && st.routeCache && st.routeCache.size) {
          //   다리 묶음(4방) · 묶음마다 지나는 교역로 수
          const cells = []; for (let i = 0; i + 1 < b.length; i += 2) cells.push([b[i], b[i + 1]]);
          const idx = new Map(cells.map(([x, y], n) => [x + ',' + y, n])), gid = new Int32Array(cells.length).fill(-1), groups = [];
          for (let n = 0; n < cells.length; n++) { if (gid[n] >= 0) continue; const gr = [], stk = [n]; gid[n] = groups.length;
            while (stk.length) { const q = stk.pop(); gr.push(q); const [x, y] = cells[q]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = idx.get((x + dx) + ',' + (y + dy)); if (j != null && gid[j] < 0) { gid[j] = groups.length; stk.push(j); } } }
            groups.push(gr); }
          const hit = new Map();
          for (const [key, pts] of st.routeCache) { if (!pts || pts.length < 2) continue; const seen = new Set();
            for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], c = pts[k], L = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / SZ));
              for (let s = 0; s <= L; s++) { const j = idx.get(Math.floor((a.x + (c.x - a.x) * s / L) / SZ) + ',' + Math.floor((a.y + (c.y - a.y) * s / L) / SZ)); if (j != null) seen.add(gid[j]); } }
            for (const gi of seen) (hit.get(gi) || hit.set(gi, []).get(gi)).push(key); }
          let best = -1, bn = 0; for (const [gi, ks] of hit) if (ks.length > bn) { bn = ks.length; best = gi; }
          if (best >= 0) {
            const gr = groups[best].map((q) => cells[q]), land = gr.filter(([x, y]) => !isW(x, y)), wat = gr.filter(([x, y]) => isW(x, y));
            rec.pick = { day: d, group: best, cells: gr.length, land: land, water: wat.length, routes: hit.get(best).length, routeKeys: hit.get(best).slice(0, 40), groupsOnRoutes: hit.size };
            const P = { playerId: 'p_t1406', name: '길막이', inventory: {}, ws: null, x: 0, y: 0 };
            const put = (x, y, tag) => { P.x = x * SZ + SZ / 2; P.y = y * SZ + SZ / 2; let ok = false, err = null; try { ok = !!Z.tryBuildAt(P, 'fence', 0, null, null, { skipCost: true }); } catch (e) { err = String(e && e.message).slice(0, 120); }
              rec.placed.push({ x, y, tag, ok, err, wallNow: (() => { try { return !!Z.isBlockedByWall(P.x, P.y); } catch (e) { return null; } })() }); };
            for (const [x, y] of land) put(x, y, '끝 뭍');
            if (wat.length) put(wat[0][0], wat[0][1], '다리 위 물');
          }
          save();
        }
        if (rec.pick) {
          const L = new Set(rec.pick.land.map(([x, y]) => x + ',' + y));
          let standing = 0; for (const bd of Z.buildings.values()) if (bd.type === 'fence' && bd.ownerId === 'p_t1406') standing++;
          let onRoutes = 0; for (const pts of (st.routeCache || new Map()).values()) { if (!pts) continue; let h = false; for (let k = 1; k < pts.length && !h; k++) { const a = pts[k - 1], c = pts[k], Ls = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / SZ)); for (let s = 0; s <= Ls; s++) if (L.has(Math.floor((a.x + (c.x - a.x) * s / Ls) / SZ) + ',' + Math.floor((a.y + (c.y - a.y) * s / Ls) / SZ))) { h = true; break; } } if (h) onRoutes++; }
          let bodiesOn = 0, bodies = 0; const PL = st.deps && st.deps.players; if (st.caravanBodies && PL) for (const bd of st.caravanBodies.values()) { const pp = PL.get(bd.pid); if (!pp) continue; bodies++; const x = Math.floor(pp.x / SZ), y = Math.floor(pp.y / SZ); if (L.has(x + ',' + y)) bodiesOn++; }
          rec.days[d] = Object.assign(rec.days[d] || {}, { standing, routesThrough: onRoutes, bodies, bodiesOnEndsNow: bodiesOn });
          save();
        }
      } catch (e) { rec.err = String(e && e.stack).slice(0, 400); save(); }
      return out;
    };
  }
  return r;
};
