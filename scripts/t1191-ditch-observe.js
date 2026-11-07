'use strict';
// (@regress 없음 — 러너 밖 · T1191 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1191-ditch-observe.js — 환호(시범 마을 도랑) 고리 · 영토 · 집 — 서버 판 자(`t577-server-run.js`) 곁 프리로드 ==========================
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1191-ditch-observe.js" node scripts/t577-server-run.js 800 1020   (판 JSON 곁 `<판>-<시드>.t1191.json`)
//   찍는 날 `T1191_SNAP`(기본 1,400,799 — 그 날을 지난 첫 econ 틱 앞에서 한 번).
//   마을마다(도랑이 있는 시범 마을만 — `vil._ditch`):
//     ⓐ 지금 고리 — 도랑 칸 수 · 영토 밖 칸 · 남의 영토 칸 · 고리 기하(장 · 단반경 — 같은 함수 `village-layout.ditchRing` 을 그 날의 집으로 다시 불러 잰다)
//     ⓑ 영토 — 안쪽 타원 안 · 고리 띠 · 바깥 타원 밖 칸 · 도랑 칸과 맞닿은 영토 칸(4방) · 출입구 칸이 영토인가
//     ⓒ 집 — 집 부지 중심이 안쪽 타원 안 · 밖(시딩 뒤 새 집이 고리 밖에 서나)
//     ⓓ 대안 꼴(찍을 때마다): ㄹ 핵심 구역 고리(회관 + 곳간만) · 섞기(+ 가까운 집 6/17 — 검단리) — 같은 함수 · 같은 축 — 도랑 칸 · 영토 밖 칸 · 남의 영토 칸
//   ⚠읽기만 — 세계에 안 쓴다(`ditchRing` 은 순수 함수 · 판 JSON 무변 — 보고 §0).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T1191_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1191.json' : '');
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const VL = require(path.join(ROOT, 'server', 'village-layout'));
const SNAP = String(process.env.T1191_SNAP || '1,400,799').split(',').map(Number).sort((a, b) => a - b);
const rec = { snap: SNAP, shots: [], err: null };
const done = new Set();
let VIL = null;
const K = (x, y) => x + ',' + y;
function frameOf(ta, vil) { return VL.axisAt(ta, vil.ccx, vil.ccy); }
function ellipse(r, vil) {
  const F = r.frame;
  return (x, y) => { const dx = x - vil.ccx, dy = y - vil.ccy, pu = dx * F.u.x + dy * F.u.y, pv = dx * F.v.x + dy * F.v.y;
    const inIn = (pu / r.a) ** 2 + (pv / r.b) ** 2 < 1, inOut = (pu / r.ao) ** 2 + (pv / r.bo) ** 2 <= 1;
    return inIn ? 'in' : (inOut ? 'band' : 'out'); };
}
function shoot(day) {
  const P = VIL.__labProbe._t569Probe.setup();
  const ta = P.ta, vils = P.villages || [];
  if (!ta) { rec.err = rec.err || 'ta 없음'; return; }
  const ownerOf = new Map();
  for (const v of vils) if (v._terrSet) for (const k of v._terrSet) if (!ownerOf.has(k)) ownerOf.set(k, v.name);
  //   도랑 칸은 지금 막힘(콜라이더)이다 — 같은 함수로 고리를 다시 잴 때는 도랑을 안 판 땅으로 본다(지형 막힘만 남긴다)
  const DALL = new Set(); for (const v of vils) for (const c of (v._ditch || [])) DALL.add(K(c.cx, c.cy));
  const ta0 = Object.assign({}, ta, { isBlocked: (x, y) => (DALL.has(K(x, y)) ? false : ta.isBlocked(x, y)) });
  const shot = { day, v: {} };
  for (const vil of vils) {
    if (!vil || !vil._ditch || !vil._ditch.length) continue;
    const own = vil._terrSet || new Set();
    const D = new Set(vil._ditch.map((c) => K(c.cx, c.cy)));
    let out = 0, other = 0;
    for (const k of D) { if (!own.has(k)) out++; const o = ownerOf.get(k); if (o && o !== vil.name) other++; }
    //   같은 함수로 그 날의 집을 품는 고리 기하(시딩 고리와 견줄 기준) — 지금 판 고리 그 자체는 `_ditch` 다
    const axis = frameOf(ta, vil);
    const houses = (vil._houseCells || []).map((h) => ({ cx: h.cx, cy: h.cy }));
    const now = VL.ditchRing(vil.ccx, vil.ccy, { houses, terrain: ta0, axis });
    //   시딩 고리 기하 — 첫 찍음 날 잰 것을 쓴다(그 뒤 집이 늘어도 고리는 그대로다)
    const base = (rec.geo && rec.geo[vil.name]) || (rec.geo = rec.geo || {}, rec.geo[vil.name] = { a: now.a, b: now.b, ao: now.ao, bo: now.bo, frame: now.frame, dayFirst: day });
    const where = ellipse(base, vil);
    const T = { in: 0, band: 0, out: 0 };
    let touch = 0;
    for (const k of own) { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1); T[where(x, y)]++;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (D.has(K(x + ax, y + ay))) { touch++; break; } }
    //   출입구 — 같은 함수의 출입구 칸(시딩 고리 기하) 중 영토인 칸
    const H = { in: 0, out: 0, band: 0 };
    for (const h of houses) H[where(h.cx, h.cy)]++;
    const o = { cells: D.size, out, other, geo: { a: base.a, b: base.b }, terr: own.size, T, touch, houses: houses.length, H,
      ringNow: (() => { let ou = 0, ot = 0; for (const c of now.cells) { const k = K(c.cx, c.cy); if (!own.has(k)) ou++; const w = ownerOf.get(k); if (w && w !== vil.name) ot++; } return { a: now.a, b: now.b, cells: now.cells.length, out: ou, other: ot }; })() };
    const NOWS = new Set(now.cells.map((c) => K(c.cx, c.cy)));
    //   ⓓ 대안 꼴(찍을 때마다) — 같은 함수 · 같은 축 · 도랑을 안 판 땅으로 본 지형(`ta0`)
    //     ㄹ = 회관 + 곳간만 품는 고리 · 섞기 = 회관 + 곳간 + 회관에 가까운 집 ⌈집 수 × 6/17⌉채(검단리 Ⅱ기 환호 안 6 · 17 — 보고 §1)
    //     칸마다: 도랑 칸 · 제 영토 밖 칸(ㄷ 이면 편입할 칸) · 남의 영토 칸(겹침) · 고리 안 집
    if (!shot.alt) shot.alt = {};
    const altOf = (pts) => {
      const r2 = VL.ditchRing(vil.ccx, vil.ccy, { houses: pts, terrain: ta0, axis });
      let o2 = 0, oth2 = 0, inH = 0;
      for (const c of r2.cells) { const k = K(c.cx, c.cy); if (!own.has(k)) o2++; const ow = ownerOf.get(k); if (ow && ow !== vil.name) oth2++; }
      const w2 = ellipse(r2, vil); for (const h of houses) if (w2(h.cx, h.cy) === 'in') inH++;
      return { a: r2.a, b: r2.b, cells: r2.cells.length, out: o2, other: oth2, housesIn: inH, terrBlocked: r2.skipTerr, _cells: new Set(r2.cells.map((c) => K(c.cx, c.cy))) };
    };
    const core = (vil._granList || []).map((g) => ({ cx: g.cx, cy: g.cy }));
    const F0 = now.frame, R0 = VL.DITCH_AXIS_RATIO;
    const rad = (h) => { const dx = h.cx - vil.ccx, dy = h.cy - vil.ccy, pu = dx * F0.u.x + dy * F0.u.y, pv = dx * F0.v.x + dy * F0.v.y; return Math.hypot(pu / R0, pv); };
    const nMix = Math.ceil(houses.length * 6 / 17);
    const near = houses.slice().sort((p, q) => rad(p) - rad(q) || p.cx - q.cx || p.cy - q.cy).slice(0, nMix);
    const rc = altOf(core), rm = altOf(core.concat(near));
    shot.alt[vil.name] = { core: rc, mix: Object.assign(rm, { nMix }), gran: core.length };
    //   그날 영토 밖 도랑 칸 중 제 영토와 맞닿은 칸(막혀서 못 넘는 경계) · 출입구 칸이 영토인가
    let outTouch = 0;
    for (const k of D) { if (own.has(k)) continue; const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (own.has(K(x + ax, y + ay))) { outTouch++; break; } }
    o.outTouch = outTouch;
    o.frame = { u: F0.u, v: F0.v };
    //   그림 — 고리 · 영토가 다 들어가는 상자(칸 글자: t 영토 · D 도랑(제 영토 안) · X 도랑(영토 밖) · Y 도랑(남의 영토) · c ㄹ 고리 · m 섞기 고리 · n 그날 집을 다 품는 고리(ㄷ 그날) · h 집 · H 회관 · g 곳간 · o 남의 영토 · # 지형 막힘 · . 빈 땅)
    {
      const CORE = (shot.alt && shot.alt[vil.name] && shot.alt[vil.name].core._cells) || null; const MIX = (shot.alt && shot.alt[vil.name] && shot.alt[vil.name].mix._cells) || null;
      let x0 = vil.ccx - base.ao - 4, x1 = vil.ccx + base.ao + 4, y0 = vil.ccy - base.ao - 4, y1 = vil.ccy + base.ao + 4;
      for (const k of own) { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      x0 -= 2; y0 -= 2; x1 += 2; y1 += 2;
      const HS = new Set(); for (const h of houses) HS.add(K(h.cx, h.cy));
      const GS = new Set(); for (const g of (vil._granList || [])) GS.add(K(g.cx, g.cy));
      const rows = [];
      for (let y = y0; y <= y1; y++) { let r = '';
        for (let x = x0; x <= x1; x++) { const k = K(x, y);
          r += (x === vil.ccx && y === vil.ccy) ? 'H' : HS.has(k) ? 'h' : GS.has(k) ? 'g' : D.has(k) ? (own.has(k) ? 'D' : (ownerOf.has(k) ? 'Y' : 'X')) : (CORE && CORE.has(k)) ? 'c' : (MIX && MIX.has(k)) ? 'm' : NOWS.has(k) ? 'n' : own.has(k) ? 't' : (ownerOf.has(k) ? 'o' : (ta0.isBlocked(x, y) ? '#' : '.')); }
        rows.push(r); }
      o.pic = { x0, y0, rows };
    }
    if (shot.alt && shot.alt[vil.name]) { delete shot.alt[vil.name].core._cells; delete shot.alt[vil.name].mix._cells; }
    shot.v[vil.name] = o;
  }
  rec.shots.push(shot);
}
const _tick = V1.tickVillage;
let lastDay = -1;
V1.tickVillage = function (v, day) {
  try {
    if (day !== lastDay) {
      lastDay = day;
      for (const s of SNAP) if (day >= s && !done.has(s)) {
        done.add(s);
        if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
        shoot(day);
        fs.writeFileSync(OUT, JSON.stringify(rec));
      }
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} }
  return _tick.apply(this, arguments);
};
