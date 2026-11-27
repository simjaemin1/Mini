// (@regress 없음 — 러너 밖 · `test-t1471-land-fit.js` 가 존에 싣는 프리로드 · 제품 무변)
// === scripts/t1471-fit-probe.js — 마을 적재 직후(경도 시차 줄) 마을 상태 지문 · 지형 정본으로 고른 칸 · [T1471] 로그 줄을 파일로 ==========
//   env: T1471_FIT_OUT(필수 · json) · T1471_FIT_SCOUT(1 = 마을마다 산 · 물 · 발자국 걸림 칸 후보를 싣는다)
//        T1471_FIT_MUT='["server/파일.js","바꿀 글자","새 글자"]'(또는 그런 셋의 배열) — 그 파일을 실을 때 그 자리(정확히 1곳씩 — 아니면 던진다)만 바꾼 사본으로(미끼 · 몸 심기 · 파일 무변)
'use strict';
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const _main = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (!process.env.T1471_FIT_OUT || !_main) return;
const OUT = process.env.T1471_FIT_OUT;
const rec = { dump: null, scout: null, stat: null, lines: [], mut: null };
const flush = () => { try { fs.writeFileSync(OUT + '.tmp', JSON.stringify(rec)); fs.renameSync(OUT + '.tmp', OUT); } catch (e) {} };
const Module = require('module'); const _c = Module.prototype._compile; const VJS = path.join('server', 'villages.js');
const MUT0 = process.env.T1471_FIT_MUT ? JSON.parse(process.env.T1471_FIT_MUT) : null;
const MUTS = !MUT0 ? [] : Array.isArray(MUT0[0]) ? MUT0 : [MUT0];   // 바꿀 자리 하나 · 또는 여럿([[파일, 글자, 새 글자], …])
Module.prototype._compile = function (content, filename) {
  for (const M of MUTS) if (filename.endsWith(path.join(...M[0].split('/')))) { const n = content.split(M[1]).length - 1; if (n !== 1) throw new Error(`T1471_FIT_MUT 자리 ${n}곳 — ${M[0]}`); content = content.replace(M[1], M[2]); rec.mut = { file: M[0], n: ((rec.mut && rec.mut.n) || 0) + n }; }
  if (filename.endsWith(VJS)) content += '\n;globalThis.__t1471f = { state, stat: (typeof t1471Stat === "function" ? t1471Stat : null), foot: _vbFootprint };\n';
  return _c.call(this, content, filename);
};
const hs = (arr) => crypto.createHash('sha256').update(arr.join('|')).digest('hex').slice(0, 16);
function dump(st) {
  const out = [];
  const keys = (s) => [...(s || [])].map(String).sort();
  const cells = (a) => (a || []).map((c) => c.cx + ',' + c.cy).sort();
  for (const v of st.villages || []) {
    const o = { id: v.dbId, name: v.name };
    for (const [k, s] of [['terr', v._terrSet], ['pot', v._potSet], ['farm', v._farmSet], ['dry', v._drySet]]) { const K = keys(s); o[k] = K.length; o[k + 'H'] = hs(K); o[k + 'O'] = hs([...(s || [])].map(String)); }
    for (const [k, a] of [['gran', v._granList], ['house', v._houseCells], ['ditch', v._ditch], ['phouse', v._pHouses], ['psite', v._pSiteRows]]) { const K = cells(a); o[k] = K.length; o[k + 'H'] = hs(K); }
    o.houseL = cells(v._houseCells); o.granL = cells(v._granList);
    o.housesPx = hs((v.housesPx || []).map((p) => p.x + ',' + p.y)); o.housesPxN = (v.housesPx || []).length;
    o.pend = v._pendSite ? v._pendSite.cx + ',' + v._pendSite.cy : null;
    o.shelter = v._shelter ? v._shelter.cx + ',' + v._shelter.cy : null;
    o.farmN = v._farmN; o.dryN = v._dryN; o.maxRPx = v._maxRPx;
    out.push(o);
  }
  return out;
}
function scout(st, foot) {
  const ta = st.ta, out = [];
  const bad = (x, y) => ta.isRock(x, y) || (ta.isWater(x, y) && ta.isBlocked(x, y));
  const fb = (cx, cy) => { const R = foot('house', cx, cy); for (let y = R[1]; y <= R[3]; y++) for (let x = R[0]; x <= R[2]; x++) if (bad(x, y)) return true; return false; };
  const taken = new Set(); for (const v of st.villages) { for (const k of v._terrSet || []) taken.add(k); for (const h of v._houseCells || []) taken.add(h.cx + ',' + h.cy); }
  for (const v of st.villages) {
    const o = { id: v.dbId, name: v.name, ccx: v.ccx, ccy: v.ccy, rock: [], water: [], foot: [], free: [] };
    for (let R = 12; R <= 45; R++) for (let y = v.ccy - R; y <= v.ccy + R; y++) for (let x = v.ccx - R; x <= v.ccx + R; x++) {
      if (Math.max(Math.abs(x - v.ccx), Math.abs(y - v.ccy)) !== R) continue;
      const k = x + ',' + y;
      if (ta.isRock(x, y)) { if (o.rock.length < 60) o.rock.push([x, y]); }
      else if (ta.isWater(x, y) && ta.isBlocked(x, y)) { if (o.water.length < 20) o.water.push([x, y]); }
      else if (!taken.has(k)) { if (o.foot.length < 5 && fb(x, y)) o.foot.push([x, y]); else if (o.free.length < 5 && !fb(x, y)) o.free.push([x, y]); }
    }
    out.push(o);
  }
  return out;
}
//   T1471_FIT_BODY=<마을 이름> — 부팅 몸 배치 뒤(4초) 그 마을 몸마다 집 자리 · 침대 · 일터가 산 · 물 칸인가
function bodies(st, name) {
  if (name === '*') { const all = {}; for (const q of st.villages) { const r = bodies(st, q.name); if (r.homeBad || r.bedBad || r.workBad || r.bodyBad) all[q.name] = { n: r.n, homeBad: r.homeBad, bedBad: r.bedBad, workBad: r.workBad, bodyBad: r.bodyBad }; } return { all, vils: st.villages.length, bodies: st.villages.reduce((s, q) => s + (q.npcPids || []).length, 0) }; }
  const ta = st.ta, v = st.villages.find((q) => q.name === name); if (!v) return { err: '마을 없음' };
  const bad = (px, py) => { if (px == null) return null; const x = Math.floor(px / 32), y = Math.floor(py / 32); return ta.isRock(x, y) || (ta.isWater(x, y) && ta.isBlocked(x, y)); };
  const P = st.deps && st.deps.players; let n = 0, home = 0, bed = 0, work = 0, body = 0; const rows = [];
  for (const pid of v.npcPids || []) { const p = P && P.get(pid); if (!p) continue; n++;
    const h = bad(p.npcHomeX, p.npcHomeY), b = bad(p.npcBedX, p.npcBedY), w = bad(p.npcWorkX, p.npcWorkY), q = bad(p.x, p.y);
    if (h) home++; if (b) bed++; if (w) work++; if (q) body++;
    if (rows.length < 200) rows.push([p.name || pid, Math.round(p.npcHomeX), Math.round(p.npcHomeY), h ? 1 : 0, b ? 1 : 0, w ? 1 : 0, Math.round(p.x), Math.round(p.y), q ? 1 : 0, p.npcState || p.state || null]); }
  return { n, homeBad: home, bedBad: bed, workBad: work, bodyBad: body, houses: (v._houseCells || []).length, rows };
}
const tap = (orig) => function (...a) {
  try {
    const line = a.map((x) => (typeof x === 'string' ? x : '')).join(' ');
    if (/\[T1471\]/.test(line)) { rec.lines.push(line.slice(0, 400)); flush(); }
    if (/🕐 경도 시차/.test(line) && globalThis.__t1471f && !rec.dump) {
      const G = globalThis.__t1471f;
      rec.dump = dump(G.state); rec.stat = G.stat ? G.stat() : null;
      if (process.env.T1471_FIT_SCOUT) rec.scout = scout(G.state, G.foot);
      flush();
      if (process.env.T1471_FIT_BODY) setTimeout(() => { try { rec.body = bodies(G.state, process.env.T1471_FIT_BODY); flush(); } catch (e) { rec.err = String(e && e.stack).slice(0, 600); flush(); } }, 4000).unref();
    }
  } catch (e) { rec.err = String(e && e.stack).slice(0, 600); flush(); }
  return orig.apply(this, a);
};
console.log = tap(console.log); console.warn = tap(console.warn); console.error = tap(console.error);
process.on('exit', flush);
