#!/usr/bin/env node
// === scripts/lab-farm-shape.js — 랩에서 경작지 1.3×·1.5× 의 모양 (T138) =========
//
// ★재민(2026-09-06): *"경작지를 1.3~1.5배 늘리면서 수확량을 같이 올려 맞추고 싶다 — 그런데
//   무작정 늘리면 마을 영토 안 경작지 모양이 더러워질 수 있다. 전쟁실험실의 인구 슬라이더로
//   경작지가 생겼다 줄었다 하는 그걸로 보고 싶다."*
//   경작칸 = `인구 × landNeedPer(비옥도, L_LANDNEED)` · 1.3× · 1.5× = **8 → 10.4 · 12**.
//
// ⚠계측기다 — 러너 등재 표(`// @regress`)가 **없다**. 판정하지 않고 그림과 수치를 낸다.
// ★[T100 4판 ② 2026-09-06] **이제 복제본이 필요 없다.** 랩에 배수 토글(`setLandMul`)이 들어갔다
//   (`L_LAND_BASE` 정본 × 배수 — 4판에서 그 정본이 8 → **12** 로 갔다). 그래서 `/tmp` 에 값을 박은 판을 만들지 않고 **랩 원본을 그대로 열어**
//   적재 전에 `window.L_LANDNEED` 를 심는다. T138 1판의 복제본 경로는 지운다 — 그때 남긴 표는 그대로 선다
//   (토글로 다시 재면 같은 수가 나온다: 농촌1 인구80 = 414 / 538 / 621칸 · 실측 대조 완료).
// ⚠엔진 코드 0.
// 그림은 랩 자신의 `gen()` → `draw()` 가 그린 것을 그대로 찍는다(렌더를 다시 짜지 않는다 — 사본 0).
//
// 실행: node scripts/lab-farm-shape.js [outdir=/tmp/t138]
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t138';
const LAB = path.join(ROOT, 'lab', '전쟁실험실.html');

// 지도 실마을의 `fert·water` — `/tmp/farm-seeds.json`(시딩 캐시)의 `lp` 값 그대로
const VILLS = [
  { name: '광산3',  fert: 0.32, water: 0.08 },
  { name: '농촌20', fert: 0.42, water: 0.35 },
  { name: '임업4',  fert: 0.53, water: 0.08 },
  { name: '농촌1',  fert: 0.85, water: 0.69 },
  { name: '농촌7',  fert: 0.96, water: 1.13 },
  { name: '어촌3',  fert: 1.12, water: 1.57 },
];
const POPS = [30, 80, 150];
const LANDS = [{ v: 8, tag: '8' }, { v: 10.4, tag: '10.4' }, { v: 12, tag: '12' }];

(async () => {
  fs.mkdirSync(path.join(OUT, 'panels'), { recursive: true });
  const browser = await chromium.launch();
  const rows = [];
  for (const L of LANDS) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    page.on('pageerror', (e) => console.error(`  [page] ${L.tag}: ${String(e).slice(0, 120)}`));
    await page.addInitScript((v) => { window.L_LANDNEED = v; }, L.v);   // 적재 전 주입(랩이 이 값을 받는다)
    await page.goto('file://' + LAB, { waitUntil: 'load' });
    // ⚠랩의 `VillageLayout`·`V` 는 최상위 `let/const` 라 **`window` 에 안 붙는다** — 맨이름으로 읽는다.
    await page.waitForFunction(() => typeof gen === 'function' && typeof VillageLayout !== 'undefined', null, { timeout: 60000 });
    // 상수가 실제로 갈렸는지 — 자명 통과 금지
    const seen = await page.evaluate(() => (typeof L_LANDNEED !== 'undefined') ? L_LANDNEED : null);
    console.log(`L_LANDNEED = ${seen} (요청 ${L.v})`);
    if (Math.abs((seen || 0) - L.v) > 1e-9) { console.error('  ✗ 주입 실패'); process.exit(1); }
    for (const vl of VILLS) for (const pop of POPS) {
      const m = await page.evaluate(({ pop, fert, water }) => {
        const set = (id, val) => { const el = document.getElementById(id);
          if (+el.max < val) el.max = String(Math.ceil(val * 10) / 10);      // 슬라이더 상한만 넓힌다(실마을 값이 1을 넘는다)
          el.value = String(val); };
        set('pop', pop); set('fertV', fert); set('waterV', water);
        gen();
        if (typeof V === 'undefined' || !V) return null;
        // ★카메라 — 마을이 화면에 차게 **영토 bbox** 에 맞춘다. 영토는 `L_LANDNEED` 와 무관하므로
        //   (실측: 18쌍 전부 동일) 세 열(8·10.4·12)이 **같은 배율·같은 자리**로 찍힌다 — 눈으로 견줄 수 있다.
        {
          const T2 = V.territory || []; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (const c of T2) { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; }
          const pad = 4, w = (x1 - x0) + pad * 2, h = (y1 - y0) + pad * 2;
          const z = Math.min(760 / (w * CELL), 760 / (h * CELL));
          view.z = z; view.ox = 380 - ((x0 + x1) / 2) * CELL * z; view.oy = 380 - ((y0 + y1) / 2) * CELL * z;
          draw();
        }
        const cells = [].concat(V.farmland || [], V.dryfield || []).map((c) => [c.cx, c.cy]);
        const key = (x, y) => x + ',' + y;
        const S = new Set(cells.map((c) => key(c[0], c[1])));
        // ① 조각 수 — 4이웃 연결 성분
        const seenC = new Set(); let comp = 0; const sizes = [];
        for (const k of S) { if (seenC.has(k)) continue; comp++; let n = 0; const st = [k]; seenC.add(k);
          while (st.length) { const cur = st.pop(); n++; const i = cur.indexOf(','), x = +cur.slice(0, i), y = +cur.slice(i + 1);
            for (const d of [[1,0],[-1,0],[0,1],[0,-1]]) { const nk = key(x + d[0], y + d[1]);
              if (S.has(nk) && !seenC.has(nk)) { seenC.add(nk); st.push(nk); } } }
          sizes.push(n); }
        sizes.sort((a, b) => b - a);
        // ② 영토 밖 비율
        const T = new Set((V.territory || []).map((c) => key(c[0], c[1])));
        const outN = cells.filter((c) => !T.has(key(c[0], c[1]))).length;
        // ③ 집·회관에 **붙은** 경작칸 — 완충(FARM_GAP)을 갓 벗어난 첫 띠
        //   ⚠"부지 원판 안"으로 재면 **구조적으로 0** 이다: 레이아웃이 `houseFarmBlock`(부지+2)·
        //     `hallFarmBlock`(마당+2)으로 그 안을 이미 금지한다. 그래서 **완충 바로 바깥 한 칸**을 잰다
        //     — 재민이 걱정하는 "밭이 집 코앞까지 온다"가 바로 이 띠다.
        const VL = VillageLayout;
        const R_H = VL.LOT_R + VL.FARM_GAP + 1, R_A = VL.HALL_YARD + VL.FARM_GAP + 1;
        const near = cells.filter((c) => {
          if (VL.inDisc(V.hall.cx, V.hall.cy, R_A, c[0], c[1])) return true;
          for (const h of (V.houses || [])) if (VL.inDisc(h.cx, h.cy, R_H, c[0], c[1])) return true;
          return false;
        }).length;
        // ④ 둘레 ÷ 칸 — 모양이 얼마나 너덜너덜한가(낮을수록 덩어리 · 높을수록 실처럼 갈라짐)
        let peri = 0;
        for (const c of cells) for (const d of [[1,0],[-1,0],[0,1],[0,-1]]) if (!S.has(key(c[0]+d[0], c[1]+d[1]))) peri++;
        return { n: cells.length, nong: (V.farmland || []).length, bat: (V.dryfield || []).length,
          comp, big: sizes[0] || 0, singles: sizes.filter((s) => s === 1).length,
          outN, near, peri, terr: (V.territory || []).length, houses: (V.houses || []).length,
          type: V.type || '', fertOut: V.fert, waterOut: V.water };
      }, { pop, fert: vl.fert, water: vl.water });
      if (!m) { console.error(`  ✗ ${vl.name} pop${pop} L${L.tag} — V 없음`); continue; }
      await page.waitForTimeout(120);
      // ⓐ 랩이 그린 그대로(정본 그림)
      await page.locator('#cv').screenshot({ path: path.join(OUT, 'panels', `p${pop}_${vl.name}_L${L.tag}.png`) });
      // ⓑ 같은 프레임 + **계측 오버레이** — 논 색(슬레이트블루)이 강가에서 물빛에 묻혀 모양이 안 보인다.
      //   그래서 경작칸만 자홍으로 덧칠한 판을 하나 더 찍는다. 덧칠은 **화면에만** 한다(랩·데이터 무접촉).
      await page.evaluate(() => {
        ctx.setTransform(view.z, 0, 0, view.z, view.ox, view.oy);
        ctx.fillStyle = 'rgba(226,0,122,0.85)';
        for (const f of (V.dryfield || [])) ctx.fillRect(f.cx * CELL, f.cy * CELL, CELL, CELL);
        ctx.fillStyle = 'rgba(0,190,255,0.85)';
        for (const f of (V.farmland || [])) ctx.fillRect(f.cx * CELL, f.cy * CELL, CELL, CELL);
      });
      await page.locator('#cv').screenshot({ path: path.join(OUT, 'panels', `hi_p${pop}_${vl.name}_L${L.tag}.png`) });
      rows.push(Object.assign({ vill: vl.name, fert: vl.fert, water: vl.water, pop, land: L.v }, m));
      console.log(`  ${vl.name.padEnd(6)} pop${String(pop).padStart(3)} L${L.tag.padStart(4)} — 칸 ${String(m.n).padStart(4)} · 조각 ${String(m.comp).padStart(3)} · 최대조각 ${(m.big / m.n * 100).toFixed(0)}% · 영토밖 ${m.outN} · 붙은 ${(m.near / m.n * 100).toFixed(0)}% · 둘레/칸 ${(m.peri / m.n).toFixed(2)}`);
    }
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'shape.json'), JSON.stringify({ vills: VILLS, pops: POPS, lands: LANDS.map((l) => l.v), rows }, null, 1));
  console.log(`\n  → ${path.join(OUT, 'shape.json')} · 판 ${rows.length}장`);
})();

// ═══════════════════════════════════════════════════════════════════════════
// ⓒ 개간 뒤 모양 — `node scripts/lab-farm-shape.js <outdir> --cleared`
//   랩은 **시딩 균형해**를 그린다. 실제 세계는 개간이 800일 돌아 그 위에 얹힌다(T100 3판 37,440칸).
//   그래서 헤드리스로 800일 돌린 뒤의 `_farmSet` 을 셀 그림으로 낸다(정본 `_clearProbe` 그대로).
