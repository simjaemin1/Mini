#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T938 계측 도구 · 제품 0 · 랩 파일 무접촉 · `test-lab-psite.js` 를 **읽어서** 같은 판에 계측만 얹는다)
// === scripts/t938-psite8-probe.js — psite ⑧ 빨강 행을 날별 · 크루별로 가르는 탐침 + 3시드 판 =======================================
//
// ★왜 — T882 뒤 `test-lab-psite` ⑧ 이 `B 17/18` 로 빨강이었다(회부). 그 빨강 한 행이 "예비 크루를 플레이어 집에 빼앗겼다"(⑧ 이 지키는 인과)인지
//   아닌지는 숫자 하나(포화 17/18)로는 못 가른다 → 그날 **누가 어느 집터로 붙었는지**(pickBuildSite 호출 하나하나)와
//   **그날 의뢰 집이 서 있었는지**를 찍는다.
//
// ★사본 0 — `test-lab-psite.js` 의 `runOnce`(시계 · 지정 · 표본 · 칠하기 끔)를 **글자 그대로** 읽어 와서 앵커 몇 군데에만 계측을 얹어 한 모듈로 컴파일한다.
//   앵커가 한 곳이라도 안 맞으면(하네스가 바뀌면) **던진다** — 조용히 다른 판을 재지 않는다.
//   계측은 `pickBuildSite`·`lifeDay` 를 감싸 **기록만** 한다(되돌려주는 값 그대로) → 날별 지문이 하네스 판과 바이트 같다
//   (T938 실측: B 00a08dc9 · A f4b81a61 · 미끼 4d5b4a64 — `node scripts/test-lab-psite.js` 의 지문 줄과 같음).
//
// 쓰는 법 (랩 파일은 `LAB_FILE` 환경변수 · 기본 `lab/전쟁실험실.html` — psite 와 같음):
//   node scripts/t938-psite8-probe.js probe <B|A|D> <out.json>
//        B = 의뢰 집 지정 판 · A = 지정 없음 · D = 미끼 판(예비 크루를 일부러 빼앗는다) — 판 세 개는 psite 의 B · A · B′ 와 같은 판
//   node scripts/t938-psite8-probe.js seeds <꼬리표> <시드> <날수> <난수씨앗> <out.json>
//        의뢰 집 없는 판(psite 의 A 꼴 · 마을 2 · 인구 40)을 **시드 · 날수만 바꿔** 돌려 날별 표본(인구 · 식량 · 마을 완공층 · 집터별 하루 진척)을 쓴다.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const SRC = path.join(__dirname, 'test-lab-psite.js');
const src = fs.readFileSync(SRC, 'utf8');
const CUT = '(async () => {\n  let fail = 0;';
const cut = src.indexOf(CUT);
if (cut < 0) throw new Error('앵커 없음: 하네스 본문 시작');
let head = src.slice(0, cut);
const swap = (a, b) => { if (head.split(a).length !== 2) throw new Error('앵커가 정확히 한 곳이 아니다: ' + a.slice(0, 60)); head = head.replace(a, () => b); };

swap('const NVIL = 2, POP = 40, SEED = 7;', "const NVIL = 2, POP = 40, SEED = process.argv[2] === 'seeds' ? +process.argv[4] : 7;");
swap('const RUN_DAYS = 18; ', "const RUN_DAYS = process.argv[2] === 'seeds' ? +process.argv[5] : 18; ");
swap('  if (decoy) await page.evaluate(DECOY);\n', '  if (decoy) await page.evaluate(DECOY);\n  await page.evaluate(PROBE);\n');
swap('  const endFrame = await page.evaluate(() => window.__frame());', '  const px = await page.evaluate(() => ({ picks: window.__PICKS, days: window.__DAYS }));\n  const endFrame = await page.evaluate(() => window.__frame());');
swap('return { placed, placeFrame,', 'return { px, placed, placeFrame,');

const PROBE = `
// ★기록만 한다 — pickBuildSite 는 원 함수가 낸 값을 그대로 돌려주고, lifeDay 는 부르기 전에 집터별 상태를 읽을 뿐이다.
const PROBE = \`(() => {
  window.__PICKS = []; window.__DAYS = [];
  const orig = pickBuildSite;
  window.pickBuildSite = function (a) {
    const r = orig(a), s = life;
    if (s && s === VILS[0]) {
      const idx = (h) => s.houses.indexOf(h);
      const on = {};
      for (const b of s.agents) if (b !== a && b._site && b.state === 'build') { const k = idx(b._site); on[k] = (on[k] || 0) + 1; }
      window.__PICKS.push({ day: s.day, f: +(((lifeGM % L_MINDAY) / L_MINDAY)).toFixed(4), a: s.agents.indexOf(a), to: r ? idx(r) : -1, toP: !!(r && r.player), on });
    }
    return r;
  };
  const od = window.lifeDay;
  window.lifeDay = function (b) {
    const s = life;
    if (s && s === VILS[0] && s.houses) {
      const rows = [];
      s.houses.forEach((h, i) => { if ((h.builtFloors || 0) < (h.floors || 1)) rows.push({ i, p: !!h.player, cx: h.cx, cy: h.cy, built: +(h.built || 0).toFixed(3), crewD: Math.round(h._crewD || 0) }); });
      window.__DAYS.push({ closing: s.day, rows, pop: Math.round(s.pop), nAg: s.agents.length });
    }
    return od.apply(this, arguments);
  };
})(); true\`;
`;

const TAIL = `
(async () => {
  const [mode, ...a] = process.argv.slice(2);
  const wr = (f, o) => require('fs').writeFileSync(f, JSON.stringify(o));
  if (mode === 'probe') {
    const [which, out] = a;
    if (!['B', 'A', 'D'].includes(which) || !out) throw new Error('쓰는 법: probe <B|A|D> <out.json>');
    const r = which === 'A' ? await runOnce(false, '0x9e3779b9') : which === 'D' ? await runOnce(true, undefined, true) : await runOnce(true);
    wr(out, { which, startDay: r.startDay, placed: r.placed && { cx: r.placed.cx, cy: r.placed.cy, day: r.placed.day },
      series: r.series.map(([d, s]) => [d, s.bld, s.pop, s.pDone]), px: r.px, fps: r.fps, errs: r.errs.length, cerrs: r.cerrs.length });
    console.log('done', which, r.fps.length, LC.fold(r.fps), r.fps[r.fps.length - 1]);
  } else if (mode === 'seeds') {
    const [tag, seed, days, prng, out] = a;
    if (!out) throw new Error('쓰는 법: seeds <꼬리표> <시드> <날수> <난수씨앗> <out.json>');
    const r = await runOnce(false, prng);
    const rows = r.series.map(([d, s]) => ({ d, pop: s.pop, food: s.food, vFloors: s.vFloors, vHouses: s.vHouses, vSites: s.vSites, mapBeds: s.mapBeds, bld: s.bld }));
    wr(out, { tag, seed: SEED, days: RUN_DAYS, prng, lab: LAB, rows, errs: r.errs.length, cerrs: r.cerrs.length, fps: r.fps });
    console.log('done', tag, SEED, rows.length, LC.fold(r.fps), r.fps[r.fps.length - 1], 'errs', r.errs.length);
  } else throw new Error('방식: probe | seeds');
})().catch((e) => { console.error('탐침 오류:', e && e.stack || e); process.exit(2); });
`;

const m = new Module(SRC, module);
m.filename = SRC; m.paths = Module._nodeModulePaths(__dirname);
m._compile(head + PROBE + TAIL, SRC);
