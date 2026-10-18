// (@regress 없음 — 러너 밖 · T795 ③ 관찰기 · 읽기만 · 값 0 · 판정 0)
// === scripts/t795-two-clocks.js — 캐러밴 짐의 두 시계: 장부(기온 가중 노출) ↔ 길 위 날 수(달력 날 · T784 값) ===
//
// ★왜 [T784 회부 ④] T784 는 도착 매도 값에 **길 위 econ 날 수**(`arriveDay − departDay`)의 신선도를 곱한다(서버 = 랩 = CLI 한 식).
//   같은 짐이 T732 장부(켠 서버)에선 레코드째 몸에 지녀(자리 carry · seal 1 · damp 0) **기온 가중 노출**로 늙는다(`spoil.exposureAt`).
//   두 시계가 얼마나 갈리는지 — 품목 · 철 · 길 날 수마다 — 를 표로 낸다(다음 카드 재료).
//
// 쓰는 법(서버 판 프리로드 · 장부 켬):
//   T732_MOMENT_LOT=1 T795_OUT=/tmp/x NODE_OPTIONS="--require $PWD/scripts/t795-two-clocks.js" \
//     node scripts/server-baseline-check.js 계측/서버기준선_2026-10-14.json --plan 1020:400,7:400,42:400 --par 3
//   ⇒ 아이 판마다 `${T795_OUT}-<씨>.json`(도착 짐 칸마다 한 줄씩 모은 합).
//   `node scripts/t795-two-clocks.js report <파일…>` ⇒ 표(마크다운).
//
// ★읽기만 — econ 이 장부 훅으로 부르는 `unload`(도착 · 첫째 · 둘째 짐) 앞에서 그 짐 칸 레코드를 **복사본으로** 읽는다
//   (`granary-lots.cargoDump`). 훅 몸통 · 레코드 · econ 값은 그대로 지나간다.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

if (require.main === module && process.argv[2] === 'report') {
  const files = process.argv.slice(3);
  const tot = { all: z(), byCat: {}, bySeason: {}, bySeasonM: {}, byDays: {} };
  const seeds = [];
  for (const f of files) {
    const J = JSON.parse(fs.readFileSync(f, 'utf8')); seeds.push(`${J.seed}(${J.n}칸)`);
    add(tot.all, J.all);
    for (const k of ['byCat', 'bySeason', 'bySeasonM', 'byDays']) for (const [g, o] of Object.entries(J[k] || {})) { tot[k][g] = tot[k][g] || z(); add(tot[k][g], o); }
  }
  const row = (name, o) => `| ${name} | ${o.n} | ${Math.round(o.u)} | ${r2(o.dE / o.u)} | ${r2(o.dM / o.u)} | ${r2(o.dM / o.dE)} | ${r2(o.eR / o.u)} | ${r2(o.eR / o.dM)} | ${r3(o.fC / o.u)} | ${r3(o.fN / o.u)} | ${r3((o.fN - o.fC) / o.u)} | ${r3(o.fR / o.u)} | ${r3(o.fT / o.u)} |`;
  const head = '| 묶음 | 짐 칸 | 단위 | ⓐ econ 날(T784) | ⓑ 장부 순간 날 | ⓑ÷ⓐ 시계 비 | ⓒ 길 노출 | ⓒ÷ⓑ 기온 배율 | f ⓐ(T784 값) | f 기온 배율×ⓐ | 그 차 | f ⓒ(장부 길 · 벤치 시계) | f 장부 전체(출발 전 나이 포함) |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|';
  console.log(`시드 ${seeds.join(' · ')}\n\n${head}\n${row('전체', tot.all)}`);
  console.log(`\n**품목 묶음**\n\n${head}`); for (const [g, o] of Object.entries(tot.byCat).sort((a, b) => b[1].u - a[1].u)) console.log(row(g, o));
  console.log(`\n**도착 철(장부 시계의 달력 — 기온이 이 날로 매겨진다)**\n\n${head}`); for (const g of ['spring', 'summer', 'autumn', 'winter']) if (tot.bySeasonM[g]) console.log(row(g, tot.bySeasonM[g]));
  console.log(`\n**도착 철(econ 날 달력)**\n\n${head}`); for (const g of ['spring', 'summer', 'autumn', 'winter']) if (tot.bySeason[g]) console.log(row(g, tot.bySeason[g]));
  console.log(`\n**econ 길 날 수**\n\n${head}`); for (const g of Object.keys(tot.byDays).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))) console.log(row(g, tot.byDays[g]));
  process.exit(0);
}
function z() { return { n: 0, u: 0, dE: 0, dM: 0, eR: 0, fC: 0, fR: 0, fT: 0, fN: 0 }; }
function add(a, b) { for (const k of Object.keys(a)) a[k] += +b[k] || 0; }
function r2(x) { return Number.isFinite(x) ? x.toFixed(2) : '—'; }
function r3(x) { return Number.isFinite(x) ? x.toFixed(3) : '—'; }

// ── 아이 판(서버) 안 ──
if (process.env.T795_OUT && require.main !== module) {
  const Module = require('module');
  const V2 = path.join(ROOT, 'sim', 'economy-sim-v2.js');
  const seed = process.env.T577_SEED || 'x';   // 서버 판 자(t577)가 존 아이 판에 넘기는 시드
  const OUT = `${process.env.T795_OUT}-${seed}.json`;
  const S = { seed, n: 0, all: z(), byCat: {}, bySeason: {}, bySeasonM: {}, byDays: {} };
  let G = null, Lots = null, Spoil = null, Spec = null, E = null;
  const cat = (it) => {
    const sp = Spec && Spec.RESOURCES && Spec.RESOURCES[it];
    if (sp && sp.category) return sp.category;
    return Spoil.isPreserved(it) ? 'preserved' : (Spoil.Crops && Spoil.Crops.list().some((c) => c.id === it) ? 'crop' : it);
  };
  const put = (grp, key, o) => { grp[key] = grp[key] || z(); add(grp[key], o); };
  function observe(c, slot, res) {
    if (slot !== 'give' && slot !== 'give2') return;
    if (!c || c._xzHome) return;
    G = G || require(path.join(ROOT, 'server', 'granary-lots'));
    Lots = Lots || require(path.join(ROOT, 'server', 'lots'));
    Spoil = Spoil || require(path.join(ROOT, 'server', 'spoil'));
    try { Spec = Spec || require(path.join(ROOT, 'server', 'specialty')); } catch (e) {}
    const K = G.cargoDump(c), recs = K && K[slot];
    const nowMs = Lots.nowMs(), dayMs = Lots.dayMs();
    if (!recs || !recs.length || !(dayMs > 0)) return;
    const nf = nowMs / dayMs;
    const dE = Math.max(0, (+c.arriveDay || 0) - (+c.departDay || 0));
    const season = (E && E.seasonOf) ? E.seasonOf(+c.arriveDay || 0) : '?';
    for (const r of recs) {
      const u = +r.u || 0; if (!(u > 1e-9)) continue;
      const it = r.it != null ? r.it : res;
      const eAll = Spoil.exposureAt(r, nf, 0), eRoad = Math.max(0, eAll - (+r.e || 0));
      const dM = Math.max(0, nf - (r.t != null ? +r.t : nf));
      const fC = E._t784Probe.F(res, dE);
      const fR = Lots.isLot(it) ? Math.max(0, Spoil.freshnessOf(it, eRoad)) : 1;
      const fT = Lots.isLot(it) ? Math.max(0, Spoil.freshnessOf(it, eAll)) : 1;
      //   기온 배율 = 길 위 노출 ÷ 길 위 순간 날(장부 시계) — 그 배율을 econ 날에 얹은 신선도(fN)가 "장부 곡선 · econ 시계"다
      //   (벤치는 장부 시계가 벽시계라 econ 날보다 빨리 간다 — 아래 report 머리 주의).
      const wT = dM > 1e-9 ? eRoad / dM : 1;
      const fN = Lots.isLot(it) ? Math.max(0, Spoil.freshnessOf(it, wT * dE)) : 1;
      const o = { n: 1, u, dE: u * dE, dM: u * dM, eR: u * eRoad, fC: u * fC, fR: u * fR, fT: u * fT, fN: u * fN };
      S.n++; add(S.all, o);
      put(S.byCat, cat(it), o); put(S.bySeason, season, o); put(S.byDays, `${dE}일`, o);
      put(S.bySeasonM, (E && E.seasonOf) ? E.seasonOf(Math.floor(nf)) : '?', o);
    }
  }
  const wrapHook = (h) => (h && typeof h === 'object' && typeof h.unload === 'function')
    ? Object.assign({}, h, { unload(c, slot, v, res, amt) { try { observe(c, slot, res); } catch (e) { S.err = String(e && e.message).slice(0, 200); } return h.unload(c, slot, v, res, amt); } })
    : h;
  const load0 = Module._load;
  Module._load = function (req, parent, isMain) {
    const m = load0.apply(this, arguments);
    if (!E && m && typeof m.setLotHook === 'function' && typeof m.createWorldV2 === 'function') {
      try { if (Module._resolveFilename(req, parent, isMain) === V2) { E = m; const s0 = m.setLotHook; m.setLotHook = (h) => s0(wrapHook(h)); } } catch (e) {}
    }
    return m;
  };
  const dump = () => { if (!S.n) return; try { fs.writeFileSync(OUT, JSON.stringify(S)); } catch (e) {} };   // 짐을 본 판(존)만 적는다
  setInterval(dump, 30000).unref();
  process.on('exit', dump);
}
