// (@regress 없음 — 러너 밖 · T1471 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1471-land-probe.js — 마을이 못 쓰는 칸(산 · 물 · 바위)에 얼마나 걸렸나: 마을마다 반경 안 몫 · 건물 · 영토 · 존 끝 ==========
//   쓰는 법: `NODE_OPTIONS="--require <t745-vclock> --require $PWD/scripts/t1471-land-probe.js" T1471_PROBE_OUT=<파일.json> [T1471_PROBE_DAYS=1,400] [T1471_PROBE_MAP=<마을 이름>]
//             [T577_ZONE=nippon] node scripts/t577-server-run.js <날> <시드>`
//   판정은 마을 지형 정본(`state.ta` — 존 `isTerrainBlockedLocal` · 바위 = 능선 · 이웃 존 능선 접합 포함 · 물 = 다리 칸 빼고)을 그대로 읽는다(사본 0).
//   날마다(고른 날) — 마을마다 { 가운데 · 반경 20 · 40칸 안 바위 · 물 · 막힘 % · 존 끝까지 · 가운데에서 바위까지 · 건물(마을 건물 행 — 집 · 곳간 · 마당 · 쉼터 · 밭 · 집터 …)
//   가운데 바위에 닿은(체비쇼프 1) 수 · 바위에서 가장 가까운 건물 칸 · 영토 칸 수 · 그 가운데 바위 · 물 · 막힘 }. `T1471_PROBE_MAP` 마을은 둘레 70칸 글자 지도를 같이 낸다.
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1471_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
require('./lib-port').noCentral();
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const VF = path.join(ROOT, 'server', 'villages.js');
const OUT = process.env.T1471_PROBE_OUT, DAYS = String(process.env.T1471_PROBE_DAYS || '1,400').split(',').map(Number), MAPV = process.env.T1471_PROBE_MAP || '';
const rec = { zone: process.env.ZONE_ID, days: {}, maps: {}, err: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1471v') < 0) src += '\n;module.exports.__t1471v = function () { return state; };\n'; return _c.call(this, src, fn); };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let lastDay = -1;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try { const st = m.exports.__t1471v(), d = (st.world && st.world.day) | 0; if (d !== lastDay) { lastDay = d; if (DAYS.indexOf(d) >= 0 && !rec.days[d]) { rec.days[d] = snap(st, d); save(); } } }
      catch (e) { rec.err = String(e && e.stack).slice(0, 600); save(); }
      return out;
    };
  }
  return r;
};
function snap(st, d) {
  const ta = st.ta; if (!ta) return { err: 'ta 없음' };
  const Z = require(path.join(ROOT, 'server', 'zone-config')).ZONES[st.zoneId] || {}, W = Math.ceil((Z.zoneWidth || 0) / 32), H = Math.ceil((Z.zoneHeight || 0) / 32);
  const memo = new Map();
  const kind = (x, y) => { const k = x + ',' + y; let v = memo.get(k); if (v === undefined) { v = ta.isRock(x, y) ? 'R' : (ta.isWater(x, y) ? (ta.isBlocked(x, y) ? 'W' : 'B') : (ta.isBlocked(x, y) ? 'X' : '.')); memo.set(k, v); } return v; };
  const bad = (v) => v === 'R' || v === 'W' || v === 'X';
  let rows = []; try { rows = st.db.db.prepare('SELECT village_id, type, cx, cy FROM village_buildings').all(); } catch (e) {}
  const byV = new Map(); for (const r of rows) { if (r.type === 'terr' || r.type === 'nongzone') continue; let a = byV.get(r.village_id); if (!a) byV.set(r.village_id, a = []); a.push(r); }
  const out = [];
  for (const vil of st.byDbId.values()) {
    if (!vil || vil.ccx == null) continue;
    const cx = vil.ccx, cy = vil.ccy, o = { id: vil.dbId, name: vil.name, type: vil.econ && vil.econ.type, pop: vil.econ && vil.econ.npcs ? vil.econ.npcs.length : null, ccx: cx, ccy: cy, edge: Math.min(cx, cy, W - 1 - cx, H - 1 - cy) };
    for (const R of [20, 40]) { let n = 0, r = 0, w = 0, b = 0; for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) { if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue; n++; const v = kind(x, y); if (v === 'R') r++; else if (v === 'W') w++; if (bad(v)) b++; } o['r' + R] = { n, rock: r, water: w, bad: b }; }
    let dr = null; for (let R = 0; R <= 80 && dr == null; R++) for (let y = cy - R; y <= cy + R && dr == null; y++) for (let x = cx - R; x <= cx + R; x++) { if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== R) continue; if (kind(x, y) === 'R') { dr = R; break; } }
    o.rockFromCenter = dr;
    const bs = byV.get(vil.dbId) || [];
    const tc = {}; let touch = 0, near = null;
    for (const b of bs) {
      tc[b.type] = (tc[b.type] || 0) + 1;
      let t = false; for (let dy = -1; dy <= 1 && !t; dy++) for (let dx = -1; dx <= 1; dx++) if (bad(kind(b.cx + dx, b.cy + dy))) { t = true; break; }
      if (t) touch++;
      for (let R = 0; R <= 12; R++) { let f = false; for (let y = b.cy - R; y <= b.cy + R && !f; y++) for (let x = b.cx - R; x <= b.cx + R; x++) { if (Math.max(Math.abs(x - b.cx), Math.abs(y - b.cy)) !== R) continue; if (kind(x, y) === 'R') { f = true; break; } } if (f) { if (near == null || R < near) near = R; break; } }
    }
    o.bld = { n: bs.length, types: tc, touchBad: touch, rockNear: near };
    const T = vil._terrSet; let tr = 0, tw = 0, tb = 0, tn = 0;
    if (T) for (const k of T) { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1); tn++; const v = kind(x, y); if (v === 'R') tr++; else if (v === 'W') tw++; if (bad(v)) tb++; }
    o.terr = { n: tn, rock: tr, water: tw, bad: tb };
    out.push(o);
    if (MAPV && (vil.name === MAPV || vil._seedName === MAPV)) rec.maps[d] = map(vil, bs, kind, cx, cy);
  }
  return { d, n: out.length, vils: out };
}
function map(vil, bs, kind, cx, cy) {
  const R = 70, B = new Map(); for (const b of bs) B.set(b.cx + ',' + b.cy, b.type[0].toUpperCase());
  const T = vil._terrSet || new Set(), lines = [];
  for (let y = cy - R; y <= cy + R; y++) {
    let s = '';
    for (let x = cx - R; x <= cx + R; x++) {
      const k = x + ',' + y, v = kind(x, y);
      if (x === cx && y === cy) s += '@';
      else if (B.has(k)) s += B.get(k);
      else if (v === 'R') s += T.has(k) ? '^' : '#';
      else if (v === 'W') s += '~';
      else if (v === 'X') s += 'x';
      else s += T.has(k) ? ',' : ' ';
    }
    lines.push(s);
  }
  return { legend: '@ 가운데 · 대문자 = 마을 건물 행 첫 글자(H 집 · G 곳간 · P 마당 · Y 마당(yard) · S 쉼터 · F 밭 · D 밭(dry) …) · # 바위(능선) · ^ 영토인 바위 · ~ 물 · x 그 밖 막힘 · , 영토 · 빈칸 들', x0: cx - R, y0: cy - R, lines };
}
process.on('exit', () => { try { rec.end = true; save(); } catch (e) {} });
