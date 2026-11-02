#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1056 계측기 · 판정 0 · 표만 낸다)
// === scripts/t1056-lab-html.js — 랩 HTML 둘(마을실험실 · 전쟁실험실)의 집 고리 = 서버 집 규칙(T1056) — 헤드리스 판 셋 ==========
//
// 판(빨리감기 — 랩 정본 `lifeDayAll(true)` · `Math.random` = mulberry32(시드) · `t641-lab-parity.js` 와 같은 처방):
//   ⓐ base — 이 카드 앞 랩(`git show <ref>:lab/<파일>` · 기본 ref = HEAD) · URL 칸 없음
//   ⓑ off  — 지금 랩 `?T1050_LAB_HOUSE=0`(손잡이 끔)            ⇒ 세계 지문이 ⓐ 와 **같아야**(끔 = 종전 바이트)
//   ⓒ on   — 지금 랩 · URL 칸 없음(번들 빈 env = 켬 · 랩 기본)  ⇒ 집 고리 = econ `labSiteCrewDay`(t17 · t176 과 같은 함수)
// 세계 지문 = 날마다 마을별 (econ 인구 · 몸 수 · 생활층 곳간 · econ 창고 0 아닌 칸 · 집 줄(층 · 단계 · 놓인 자재)) FNV-1a.
// 켬 판 셈(페이지 안에서 `EconEngine.labSiteCrewDay` 를 감싸 그 호출의 앞뒤를 적는다 — 값은 그대로 돌려준다):
//   크루-날 · 크루 수 = min(LIFE_CREW, 인구)인 날 · 오른 단계 · 시공 단계 넘침(오른 단계 > 크루 × LIFE_STAGE_PDAY) 0 · 곳간이 빈 날 · 꺼낸 목재 · 지은 채 ·
//   econ `_t400Live` 가 선 마을-날 · 주거 > 침상 마을-날(T958 — 0 이어야) · 크루 하루 재연(⑤)
//   ⑤ **랩 브라우저 = t17 자** — 켬 판의 크루-날마다 들어간 값(곳간 · 집터 단계 · 놓인 자재 · 인구 · 두 수)을 CLI econ(`sim/economy-sim.js` —
//      t17 · t176 이 부르는 그 모듈)의 같은 함수 `labSiteCrewDay` 에 다시 넣어 나온 값(꺼낸 양 · 오른 단계 · 단계 · 자재 · 곳간 · 완공)이 브라우저 값과 같은가.
//
// 실행: node scripts/t1056-lab-html.js [--lab war|village|both] [--days 300] [--seeds 7,42,1020] [--nvil 8] [--ref HEAD] [--json out.json]
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const E = require(path.join(ROOT, 'sim', 'economy-sim'));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const LABS = { war: '전쟁실험실.html', village: '마을실험실.html' };
const LABK = opt('lab', 'both');
const DAYS = parseInt(opt('days', '300'), 10);
const SEEDS = opt('seeds', '7,42,1020').split(',').map(Number);
const NVIL = opt('nvil', '8');
const REF = opt('ref', 'HEAD');
const JOUT = opt('json', '');
const PRNG_INIT = (seed) => `(() => {
  let s = ${seed} | 0;
  Math.random = function(){ s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();`;

async function runOne(browser, file, query, seed) {
  const page = await browser.newPage();
  await page.addInitScript(PRNG_INIT(seed));
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 160)); });
  await page.goto('file://' + file + (query ? '?' + query : ''), { waitUntil: 'load', timeout: 600000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(({ days, seed, nvil }) => {
    const out = { err: null };
    try {
      const EE = window.EconEngine;
      out.knob = { T1050_LAB_HOUSE: !!EE.T1050_LAB_HOUSE, T400_BUILD_ACT: !!EE.T400_BUILD_ACT, LifeCrew: EE.LifeCrew || null, has: typeof EE.labSiteCrewDay === 'function' };
      // 켬 판 셈 — 감싼 문(값은 그대로)
      const C = { calls: 0, crewOk: 0, adv: 0, over: 0, stall: 0, took: 0, built: 0, replay: [] };
      const cut = (o) => JSON.parse(JSON.stringify(o || {}));
      if (typeof EE.labSiteCrewDay === 'function') {
        const orig = EE.labSiteCrewDay;
        EE.labSiteCrewDay = function (v, s2, crewMax, pday, dbg, done) {
          const st = (v && v.storage) || {};
          const pre = { wood: +st.wood || 0, stone: +st.stone || 0, N: (v.npcs && v.npcs.length) || 0, stage: s2.stage, mat: cut(s2.mat), crewMax, pday };
          let fin = 0;
          const r2 = orig.call(this, v, s2, crewMax, pday, dbg, () => { fin = 1; return done(); });
          C.calls++; if (r2.crew === Math.min(crewMax, pre.N)) C.crewOk++;
          C.adv += r2.adv; if (r2.adv > r2.crew * pday) C.over++; C.stall += r2.stall; C.took += r2.took; C.built += fin;
          if (C.replay.length < 4000) C.replay.push({ pre, post: { wood: +st.wood || 0, stone: +st.stone || 0, stage: s2.stage, mat: cut(s2.mat), fin, crew: r2.crew, adv: r2.adv, took: r2.took, stall: r2.stall } });
          return r2;
        };
      }
      document.getElementById('seed').value = String(seed);
      const nv = document.getElementById('nvil'); if (nv) nv.value = String(nvil);
      reseed(); lifeInit();
      let h = 0x811c9dc5 >>> 0;
      const mix = (str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
      const snap = () => {
        const parts = [String(ECON_WORLD.day), String(VILS.length)];
        for (const v of VILS) {
          const e = v.econ; if (!e) { parts.push('x'); continue; }
          const st = e.storage || {};
          const ks = Object.keys(st).sort().filter((k) => (+st[k] || 0) !== 0);
          const hs = (v.houses || []).map((q) => (q.builtFloors | 0) + '/' + (q.floors | 0) + '/' + (+q.built || 0).toFixed(4) + (q.stage != null ? 's' + q.stage + JSON.stringify(q.mat || {}) : '')).join(';');
          parts.push(e.npcs.length + ':' + (v.agents ? v.agents.length : -1) + ':' + (+v.food || 0).toFixed(4) + ':' + ks.map((k) => k + '=' + (+st[k]).toFixed(6)).join(',') + ':' + hs);
        }
        return parts.join('|');
      };
      let live = 0, vd = 0, hOverB = 0;
      const traj = [];
      const t0 = performance.now();
      for (let d = 0; d < days; d++) {
        lifeDayAll(true);
        mix(snap());
        for (const v of VILS) { const e = v.econ; if (!e || !e.npcs.length) continue; vd++; if (e._t400Live) live++; if (e._mapBeds !== undefined && (+e.housing || 0) > (+e._mapBeds || 0) + 1e-9) hOverB++; }
        if ((d + 1) % 50 === 0) traj.push(VILS.reduce((t, v) => t + (v.econ ? v.econ.npcs.length : 0), 0));
      }
      out.ms = Math.round(performance.now() - t0);
      out.fp = (h >>> 0).toString(16).padStart(8, '0');
      out.traj = traj;
      out.pop = VILS.reduce((t, v) => t + (v.econ ? v.econ.npcs.length : 0), 0);
      out.alive = VILS.filter((v) => v.econ && v.econ.npcs.length > 0).length;
      out.floors = VILS.reduce((t, v) => t + (v.houses || []).reduce((a, q) => a + (q.player ? 0 : (q.builtFloors | 0)), 0), 0);
      out.sites = VILS.reduce((t, v) => t + (v.houses || []).filter((q) => !q.player && (q.builtFloors | 0) < (q.floors || 1)).length, 0);
      out.wood = +VILS.reduce((t, v) => t + ((v.econ && v.econ.storage && +v.econ.storage.wood) || 0), 0).toFixed(2);
      out.housing = +VILS.reduce((t, v) => t + ((v.econ && +v.econ.housing) || 0), 0).toFixed(2);
      out.beds = VILS.reduce((t, v) => t + ((v.econ && +v.econ._mapBeds) || 0), 0);
      out.vd = vd; out.live = live; out.hOverB = hOverB;
      out.C = C;
    } catch (e) { out.err = String(e && e.stack || e).slice(0, 600); }
    return out;
  }, { days: DAYS, seed, nvil: NVIL });
  r.pageErrors = errs.length; r.pageErr0 = errs[0] || null;
  await page.close();
  return r;
}

// ⑤ 재연 — 브라우저 크루-날의 들어간 값을 CLI econ 의 같은 함수에 넣는다
function replay(rows) {
  let same = 0, diff = 0, first = null;
  for (const { pre, post } of rows) {
    const v = { storage: { wood: pre.wood, stone: pre.stone }, npcs: { length: pre.N } };
    const s2 = { stage: pre.stage, mat: JSON.parse(JSON.stringify(pre.mat || {})) };
    if (pre.stage == null) delete s2.stage;
    let fin = 0;
    const d = E.labSiteCrewDay(v, s2, pre.crewMax, pre.pday, E.labCrewDbg(), () => { fin = 1; });
    const got = { wood: v.storage.wood, stone: v.storage.stone, stage: s2.stage, mat: s2.mat, fin, crew: d.crew, adv: d.adv, took: d.took, stall: d.stall };
    const a = JSON.stringify(got), b = JSON.stringify(post);
    if (a === b) same++; else { diff++; if (!first) first = { pre, browser: post, cli: got }; }
  }
  return { same, diff, first };
}

(async () => {
  const labs = LABK === 'both' ? ['village', 'war'] : [LABK];
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const res = {};
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 't1056-base-'));
  console.log(`=== T1056 랩 HTML 집 고리 — base(${REF}) · off(?T1050_LAB_HOUSE=0) · on(기본) · ${DAYS}날 · 시드 ${SEEDS.join('·')} · 마을 ${NVIL} ===`);
  for (const k of labs) {
    const FILE = LABS[k], HEADF = path.join(ROOT, 'lab', FILE), BASE = path.join(baseDir, FILE);
    fs.writeFileSync(BASE, execFileSync('git', ['show', `${REF}:lab/${FILE}`], { cwd: ROOT, maxBuffer: 256 << 20 }));
    for (const seed of SEEDS) {
      const a = await runOne(browser, BASE, '', seed);
      const b = await runOne(browser, HEADF, 'T1050_LAB_HOUSE=0', seed);
      const c = await runOne(browser, HEADF, '', seed);
      const rp = c.C ? replay(c.C.replay) : null;
      res[`${k}:${seed}`] = { base: a, off: b, on: c, replay: rp };
      const line = (n, x) => `    ${n.padEnd(4)} 지문 ${x.fp} · 인구 ${x.pop}(살아본 ${x.alive}) · 50날마다 ${JSON.stringify(x.traj)} · 집 층 ${x.floors} · 집터 ${x.sites} · 주거 ${x.housing} · 침상 ${x.beds} · 곳간 목재 ${x.wood} · _t400Live 마을-날 ${x.live}/${x.vd} · 주거>침상 ${x.hOverB} · 오류 ${x.pageErrors}${x.err ? ' · ' + x.err : ''} · ${x.ms}ms`;
      console.log(`\n  [${FILE} · 시드 ${seed}]  손잡이 on=${JSON.stringify(c.knob)} · off=${b.knob && b.knob.T1050_LAB_HOUSE}`);
      console.log(line('base', a)); console.log(line('off', b)); console.log(line('on', c));
      console.log(`    ⓑ off 지문 = base 지문: ${a.fp === b.fp ? '같음' : '**다름**'} · ⓒ on 지문 ≠ base: ${c.fp !== a.fp ? '다름(집 규칙이 바뀌었다)' : '**같음**'}`);
      if (c.C) {
        const C = c.C;
        console.log(`    on 크루-날 ${C.calls} · 크루 = min(LIFE_CREW ${c.knob.LifeCrew && c.knob.LifeCrew.crew}, 인구) ${C.crewOk}/${C.calls} · 오른 단계 ${C.adv} · 시공 넘침 ${C.over} · 곳간 빈 날 ${C.stall} · 꺼낸 목재 ${C.took.toFixed(2)} · 지은 채 ${C.built}${C.built ? ` · 채당 목재 ${(C.took / C.built).toFixed(3)}` : ''}`);
        console.log(`    ⑤ 크루-날 재연(브라우저 ↔ CLI econ \`labSiteCrewDay\` — t17 · t176 그 함수): 같음 ${rp.same} · 다름 ${rp.diff}${rp.first ? ' · 첫 다름 ' + JSON.stringify(rp.first).slice(0, 400) : ''}`);
      }
    }
  }
  await browser.close();
  if (JOUT) { for (const v of Object.values(res)) if (v.on && v.on.C) v.on.C.replay = v.on.C.replay.length; fs.writeFileSync(JOUT, JSON.stringify(res, null, 1)); console.log(`\n  JSON: ${JOUT}`); }
})().catch((e) => { console.error(e); process.exit(1); });
