#!/usr/bin/env node
// === scripts/t619-h-audit.js — 길 칸 하나가 교역로 몇 쌍을 바꾸나 · 다시 파기 대상은 몇 쌍인가 [T619 ① · 2026-10-04] ===========
//
// ★묻는 것(T605 §2 의 그 판을 손잡이 두 팔로): 부팅이 판 교역로 전 쌍(도적 표본이 전 쌍을 판다) → 코스 칸 하나에 등급을 준다
//   (`roads.stampCell` 을 등급 문턱만큼 — 관측자가 붙어 몸이 밟는 일을 정본 문 그대로) → 정본 감사(`routeDebug({audit})` =
//   `computeRoutePts` 로 지금 길에서 다시 파 캐시와 비교)로 바이트가 바뀐 쌍을 센다. 칸을 하나 더(가운데 마을) 주고 한 번 더.
//   다시 파기 대상 = 끔이면 다닌 쌍 전부 · 켬이면 `_t619RedigKeep`(제품 거르개 그대로)이 남긴 쌍.
// ★T605 자(`t605-boot --observer --audit-at`)는 이 판에서 600초까지 코스 칸이 안 바뀌었다(관측자 둘레 몸이 등급까지 못 밟음) —
//   그래서 등급을 **정본 문으로 직접** 준다(몸이 밟는 것과 같은 `stampCell` · 사본 0).
// ★재기만 한다 — 제품 코드 0 · 러너 밖. 존을 이 프로세스 안에 띄운다(`test-regrow-block` bootZone 문법).
// 실행: node scripts/t619-h-audit.js [--out /tmp/t619/h-off.json]   (켬 팔: T619_LOCAL_H=1 node …)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const OUT = val('--out', `/tmp/t619-h-${process.env.T619_LOCAL_H === '1' ? 'on' : 'off'}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = console.log.bind(console);
(async () => {
  const DB = `/tmp/t619h-${process.pid}.db`;
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(42000 + (process.pid % 500)), DB_PATH: DB, ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    ENABLE_VILLAGES: '1', VILLAGE_ROUTE_WARM: '0' });
  const log = [];
  console.log = (...a) => log.push(a.join(' ')); console.warn = console.log; console.error = console.log;
  const t0 = Date.now();
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  for (let i = 0; i < 2400; i++) { let d = null; try { d = H.SimVillages.econDay(); } catch (e) {} if (d != null) break; await sleep(250); }
  const V = H.SimVillages, B = V.__p3Bind({}), S = B.state, RD = H.Roads;
  let mem = -1; for (let i = 0; i < 600; i++) { const m = V.routeDebug({}).mem; if (m === mem && m > 0) break; mem = m; await sleep(1000); }
  const bootS = (Date.now() - t0) / 1000;
  const out = { arm: process.env.T619_LOCAL_H === '1' ? 'on' : 'off', bootS, pairs: mem, roadsReady: RD.isReady(), steps: [] };
  const routeLines = log.filter((l) => /교역로 A\*: /.test(l)).length;
  out.bootRoutes = routeLines;
  const audit = () => { const t = Date.now(); const a = V.routeDebug({ audit: 100000 }).audit; return { n: a.n, mismatch: a.mismatch, ms: Date.now() - t }; };
  out.steps.push(Object.assign({ step: '등급 칸 0(대조)', coarse: RD._S.coarse.size }, audit()));
  const keys = [...S.routeCache.keys()];
  //   등급 1 이 될 때까지 밟는다(문턱 수를 안 적는다 — `stampCell` 이 돌려주는 등급이 증인)
  const gradeAt = (vil) => { let lv = 0, n = 0; while (lv < 1 && n < 1000) { lv = RD.stampCell(vil.ccx, vil.ccy); n++; } return lv; };
  const chg = [];
  for (const [label, vil] of [['첫 마을', S.villages[0]], ['가운데 마을', S.villages[Math.floor(S.villages.length / 2)]]]) {
    const lv = gradeAt(vil);
    chg.push([Math.floor(vil.ccx / 4), Math.floor(vil.ccy / 4)]);
    const keep = (B._t619RedigKeep) ? B._t619RedigKeep(keys, chg).length : null;
    out.steps.push(Object.assign({ step: `+${label} ${vil.name} 칸 등급 ${lv}`, coarse: RD._S.coarse.size, hMinGlobal: RD.courseCostMin(),
      redigAll: keys.length, redigKeep: keep }, audit()));
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  say(JSON.stringify(out));
  try { fs.unlinkSync(DB); } catch (e) {}
  process.exit(0);
})().catch((e) => { say(e && e.stack); process.exit(1); });
