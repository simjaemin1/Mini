#!/usr/bin/env node
// === scripts/t758-probe.js — T758 랩 탐침(계측 · 랩 파일 무접촉) ==============================================
//
// ★왜 [T758 ①] `test-lab-mining` 과 **같은 부팅**(시계 정본 `fixture-lab-clock` · 씨 0x9e3779b9 · 마을 3 · 인구 40 · 시드 7 · 119×)으로
//   랩 판 하나를 날마다 찍는다 — 두 랩 파일(커밋 둘 · 고친 것 ↔ 안 고친 것)을 같은 탐침으로 돌려 **첫 갈린 날**과 그 날의 칸을 가른다.
//   찍는 것(날마다 첫 프레임 · 하네스 SNAP 과 같은 자리):
//     · 대상 마을(광산촌) 광부 수 · 마을마다 광부 수
//     · 지문 — 마을마다 주민 몸(제 칸 중 수 · 글 · 참거짓만 · 순서 그대로)과 econ 곳간 · 인구 · 금고 · 캐러밴(제 칸)을 FNV 로
//   `T758_MKTLOG=1` 이면 랩 `openMarket`(장마당 — 교역 NPC 가 상대 마당에 닿으면 부른다)을 감싸 부를 때마다 적는다:
//     날 · 마을 · 주민 수 · 시작점(T707 얼굴 돌리기 식 · 종전 = 0) · 그 장에 실제로 모인 사람(번호) · 배열 앞부터 골랐다면 모였을 사람(같은 거름 · 길은 안 본다).
//   감싸개는 값을 안 바꾼다(원래 함수를 그대로 부르고 앞뒤만 읽는다).
//
// 쓰는 법: LAB_FILE=<html> [LAB_QS='T707_MARKET=0'] [T758_DAYS=60] [T758_STOP=1(첫 광부에서 멈춤)] [T758_MKTLOG=1] T758_OUT=<json> node scripts/t758-probe.js
// 결정론 — 시계 · 씨는 정본 그대로(새 수 0).
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const LC = require('./fixture-lab-clock');
const FILE = process.env.LAB_FILE || path.resolve(__dirname, '..', 'lab', '전쟁실험실.html');
const QS = process.env.LAB_QS || '';
const LAB = 'file://' + FILE + (QS ? '?' + QS : '');
const DAYS = parseInt(process.env.T758_DAYS || '60', 10);
const STOP = process.env.T758_STOP === '1';
const MKTLOG = process.env.T758_MKTLOG === '1';
const OUT = process.env.T758_OUT || '';
const CHROME = process.env.CHROME_PATH || undefined;
const NVIL = 3, POP = 40, SEED = 7, SPEED = 119;

const PROBE = () => {
  const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const prim = (o) => { let s = ''; for (const k in o) { const x = o[k]; const t = typeof x; if (t === 'number') s += k + ':' + (Number.isFinite(x) ? x.toPrecision(12) : String(x)) + ';'; else if (t === 'string' || t === 'boolean') s += k + ':' + x + ';'; } return s; };
  const mv = VILS.find((q) => q.role === 'mining') || VILS[0];
  const out = { d: mv.day, miners: mv.agents.filter((a) => a.job === 'miner').length, vm: [], fp: [], efp: [] };
  for (const v of VILS) {
    out.vm.push(v.agents.filter((a) => a.job === 'miner').length);
    let s = ''; for (const a of v.agents) s += prim(a) + '|';
    out.fp.push(fnv(s));
    const e = v.econ; let es = '';
    if (e) { es += prim(e.storage || {}) + '#' + (e.npcs ? e.npcs.length : '') + '#' + prim(e.treasury || {}); }
    out.efp.push(fnv(es));
  }
  if (typeof ECON_WORLD !== 'undefined' && ECON_WORLD) { let cs = ''; for (const c of (ECON_WORLD.caravans || [])) cs += prim(c) + '|'; out.cfp = fnv(cs); out.car = (ECON_WORLD.caravans || []).length; }
  return out;
};

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));
  await page.addInitScript(LC.init('0x9e3779b9'));
  await page.goto(LAB);
  await page.waitForFunction(() => typeof window.lifeToggle === 'function' && typeof VILS !== 'undefined', null, { timeout: 60000 });
  const env = await page.evaluate(() => ({ labEnv: typeof window.LAB_ENV !== 'undefined' ? window.LAB_ENV : null,
    t707: (typeof EconEngine !== 'undefined') ? EconEngine.T707_MARKET : null }));
  if (MKTLOG) await page.evaluate(() => {
    const orig = window.openMarket; if (typeof orig !== 'function') return;
    window.__t758Mkt = [];
    window.openMarket = function (vil) {
      const rec = { d: vil && vil.day, vi: VILS.indexOf(vil), n: vil && vil.agents ? vil.agents.length : 0 };
      if (vil && vil.agents) {
        const A = vil.agents, NA = A.length;
        rec.s0 = NA ? ((((VILS.indexOf(vil) | 0) + (vil.day | 0)) % NA) + NA) % NA : 0;
        const want = Math.max(1, Math.round(NA * L_MKT_FRAC)) - A.filter((a) => a._mkt).length;
        const okA = (a) => !(a._muster || a.rest || a._mkt) && !(a.state === 'trading' || a.state === 'build' || a.state === 'gran' || a.state === 'toGran');
        const head = []; for (let i = 0; i < NA && head.length < want; i++) if (okA(A[i])) head.push(i);
        rec.want = want; rec.head = head;
        const before = A.map((a) => !!a._mkt);
        const r = orig.apply(this, arguments);
        rec.got = []; A.forEach((a, i) => { if (a._mkt && !before[i]) rec.got.push(i); });
        rec.r = r;
        window.__t758Mkt.push(rec);
        return r;
      }
      return orig.apply(this, arguments);
    };
  });
  await page.evaluate(({ nv, pop, seed, sp }) => {
    document.getElementById('nvil').value = String(nv);
    document.getElementById('pop').value = String(pop);
    document.getElementById('seed').value = String(seed);
    const sel = document.getElementById('simSpeed');
    if (![...sel.options].some((o) => o.value === String(sp))) sel.add(new Option(sp + '×(하네스)', String(sp)));
    sel.value = String(sp);
    lifeToggle();
  }, { nv: NVIL, pop: POP, seed: SEED, sp: SPEED });
  const T = { meta: { file: FILE, qs: QS, env, days: DAYS, stop: STOP }, day: [], firstMiner: null, mkt: null, errs };
  const t0 = Date.now();
  let s = await page.evaluate(PROBE); s.frame = 0; T.day.push(s);
  const start = s.d;
  const flush = () => { if (OUT) fs.writeFileSync(OUT, JSON.stringify(T)); };
  for (;;) {
    if (s.miners > 0 && T.firstMiner == null) { T.firstMiner = s.d - start; if (STOP) break; }
    if (s.d >= start + DAYS) break;
    const frame = await LC.untilDay(page, s.d + 1);
    s = await page.evaluate(PROBE); s.frame = frame; T.day.push(s);
    if ((s.d - start) % 5 === 0) { process.stdout.write(`day ${s.d - start} miners ${s.miners} frame ${frame} ${Math.round((Date.now() - t0) / 1000)}s\n`); if (MKTLOG) T.mkt = await page.evaluate(() => window.__t758Mkt || null); flush(); }
  }
  if (MKTLOG) T.mkt = await page.evaluate(() => window.__t758Mkt || null);
  T.meta.sec = Math.round((Date.now() - t0) / 1000);
  flush();
  console.log(`끝 — 첫 광부 ${T.firstMiner == null ? '없음' : T.firstMiner + '일'} · 날 ${s.d - start} · ${T.meta.sec}s · pageerror ${errs.length}`);
  await browser.close();
})().catch((e) => { console.error('탐침 예외:', e); process.exit(2); });
