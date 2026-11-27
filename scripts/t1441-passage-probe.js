// (@regress 없음 — 러너 밖 · T1441 ⑥ 새 통로 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1441-passage-probe.js — 낸 마을이 통로를 닫았다 연다: 헛걸음 · 닫힘을 아는 날 · 다시 지름길로 가는 날 · 교역량 ==========
//   쓰는 법: `NODE_OPTIONS="--require <t745-vclock> --require $PWD/scripts/t1441-passage-probe.js" T1441_PROBE_OUT=<파일.json> T1441_PASSAGE=1 T537_SHORTCUT=1
//             [T1441_PROBE_CLOSE=100] [T1441_PROBE_OPEN=200] [T1441_PROBE_SITE=0] node scripts/t577-server-run.js <날> <시드>` (판 자가 아이 존에 env 를 그대로 준다)
//   ⓐ 날 1 — 지름길 터 하나(`T1441_PROBE_SITE` — T537 후보 차례 = 교역 잠재 차례)가 아직 안 섰으면 그 자리에서 세운다(정본 `_t527Complete` · 낸 마을 = 후보 `v` 첫 마을 · 크루 손 0).
//   ⓑ 닫는 날 — 낸 마을 사람(가짜 · 소켓 0 · 그 마을 소속)이 다리 한 끝의 폭 전부에 문을 단다(정본 `_tryBuildAt` · 비용 0) — 문은 낸 마을의 마을 문(찍힘).
//   ⓒ 여는 날 — 같은 사람이 그 문들을 연다(정본 `doDoorToggle`).
//   ⓓ 날마다 — 통로 셈(`_t1441PS` — 지름길 · 옛길 · 헛걸음 · 소문 · 돌아와 앎) · 마을마다 아는 꼴 · 교역 기록 수(버린 것 · 그 날)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1441_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
require('./lib-port').noCentral();
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
const OUT = process.env.T1441_PROBE_OUT, CLOSE = +(process.env.T1441_PROBE_CLOSE || 100), OPEN = +(process.env.T1441_PROBE_OPEN || 200), SITE = +(process.env.T1441_PROBE_SITE || 0), SZ = 32;
const rec = { close: CLOSE, open: OPEN, site: null, forced: null, doors: [], opened: 0, days: [], know: {}, err: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
let H = null; const Hz = () => { if (H) return H; const m = require.cache[ZF] || require.main; H = (m && m.exports && m.exports.__testBind) ? m.exports.__testBind() : null; if (!H) rec.noH = (rec.noH | 0) + 1; return H; };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let lastDay = -1;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try { const st = m.exports.__t1441.state(), d = (st.world && st.world.day) | 0; if (d !== lastDay) { lastDay = d; day(st, m.exports, d); } }
      catch (e) { rec.err = String(e && e.stack).slice(0, 600); save(); }
      return out;
    };
  }
  return r;
};
let P = null, tr0 = 0;
function day(st, V, d) {
  const T = V.__t1441, sites = T.sites();
  if (!sites || !sites.length) return;
  const s = sites[SITE]; if (!s) return;
  if (!rec.site) {
    const vil = [...st.byDbId.values()].find((v) => v && (v.name === s.v[0] || v._seedName === s.v[0]));
    if (!vil) return;
    if (!s.done) { T.complete(s, d); rec.forced = d; }
    T.by(s, vil);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < s.cells.length; i += 2) { const x = s.cells[i], y = s.cells[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    rec.site = { i: s.i, v: s.v, span: s.span, n: s.cells.length / 2, by: vil.dbId, byName: vil.name, box: [x0, y0, x1, y1] };
    tr0 = (st.world.tradeLog || []).length; save();
  }
  const Hh = Hz(); if (!Hh) return;
  if (d === CLOSE && !rec.doors.length) {
    const [x0, y0, x1, y1] = rec.site.box, horiz = (x1 - x0) >= (y1 - y0);
    const msgs = [];
    P = { pid: 'p_t1441', playerId: 'p_t1441', name: '시험문지기', persistent: false, ws: { readyState: 1, send: (q) => { try { msgs.push(JSON.parse(q)); } catch (e) {} } }, x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { plank: 999, wood: 999 }, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, member: { zone: process.env.ZONE_ID || 'hanbando', vid: rec.site.by, name: rec.site.byName, since: d } };
    //   다리 서쪽(가로) · 북쪽(세로) 끝의 폭 전부 — 다리 칸과 그 바깥 칸 사이 변
    const cs = new Set(); for (let i = 0; i + 1 < s.cells.length; i += 2) cs.add(s.cells[i] + ',' + s.cells[i + 1]);
    const ends = [];
    if (horiz) { for (let y = y0; y <= y1; y++) if (cs.has(x0 + ',' + y)) ends.push({ cx: x0 - 1, cy: y, side: 'E', ax: (x0 - 1) * SZ + SZ - 6, ay: y * SZ + SZ / 2 }); }
    else { for (let x = x0; x <= x1; x++) if (cs.has(x + ',' + y0)) ends.push({ cx: x, cy: y0, side: 'N', ax: x * SZ + SZ / 2, ay: y0 * SZ + 6 }); }
    for (const e of ends) {
      P.x = e.ax; P.y = e.ay; msgs.length = 0;
      const ok = Hh._tryBuildAt(P, 'door', 0, e.side, null, { skipCost: true });
      const b = [...Hh.buildings.values()].find((q) => q.type === 'door' && Math.floor(q.x / SZ) === e.cx && Math.floor(q.y / SZ) === e.cy && q.ownerId === 'p_t1441');
      rec.doors.push({ cx: e.cx, cy: e.cy, side: e.side, ok: !!ok, id: b ? b.id : null, v: b && b.data ? b.data.t1441v : null, note: (msgs.filter((m) => m.type === 'notice').pop() || {}).text || '' });
    }
    save();
  }
  if (d === OPEN && rec.doors.length && !rec.opened) {
    for (const e of rec.doors) { const b = e.id && Hh.buildings.get(e.id); if (b) { P.x = b.x + 8; P.y = b.y + 8; if (!b.data.open) Hh.doDoorToggle(P, b.id); if (b.data.open) rec.opened++; } else if (e.id) {   // 잠든 칸 — 행을 연다(같은 칸)
      try { const row = Hh.db.db.prepare('SELECT data FROM buildings WHERE id = ?').get(+String(e.id).slice(1)); const dd = JSON.parse(row.data || '{}'); dd.open = true; Hh.db.updateBuildingData(+String(e.id).slice(1), JSON.stringify(dd)); rec.opened++; } catch (x) {} } }
    save();
  }
  const PS = Object.assign({}, T.PS); delete PS.log;
  const kn = { closed: 0, open: 0 }; for (const v of st.byDbId.values()) { if (!v || !v.econ) continue; kn[T.know(s, v.dbId)]++; }
  const tl = st.world.tradeLog || [], n = tl.length;
  const today = tl.filter((t) => (t.day | 0) === d), ab = today.filter((t) => t.abandoned).length, waste = today.filter((t) => /헛걸음/.test(t.note || '')).length;
  rec.days.push({ d, PS, kn, trade: today.length, ab, waste });
  if (d % 10 === 0 || d === CLOSE || d === OPEN) { rec.log = (T.PS.log || []).slice(-120); save(); }
}
process.on('exit', () => { try { rec.end = true; save(); } catch (e) {} });
