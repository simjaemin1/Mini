#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-lon-day.js — 경도 하루 1단계: 시각 한 식 (T720) ==================
//
// ★재민 10-13(T712 판정): 경도 = 원통(세계 폭 = 360°) · 시계 = 실제 UTC × 60 · 날짜선 = 태평양 이음매(x 0 ↔ W) · 해 뜸 06:00 그대로.
//   정본 식은 `server/zone-config.js`(`lonOf` · `lonPhaseOff` · `localTod` · `localPhase` · `localDay` · `phaseAdd`) 하나다.
//
// ★이 하네스가 지키는 계약:
//   ① **원통** — λ(0) = −½ · λ(W/2) = 0 · λ(W) = +½ · 날짜선(x 0 ↔ W)에서 현지 시각이 **이어진다**(하루 몫이 같다).
//   ② **종전 시계와 한 점에서 만난다** — λ − 해 뜸 = 0 인 자리(x = ¾W)의 해 몫 = 종전 `worldPhase` · 현지 날 = 종전 게임일.
//   ③ **해 뜸은 06:00 이고 현지 날은 거기서 바뀐다** — 현지 시각 = 해 몫 + 해 뜸 · 해 몫이 0 을 지나는 순간 현지 날이 하나 는다.
//   ④ **존 경계에서 안 끊긴다**(미끼 — 종전 0.045 식은 한반도 → 닛폰 경계에서 65 게임분 뛴다 · 새 식은 0).
//   ⑤ **끔 = 아무도 안 부른다** — env 없으면 `T720_LON_DAY` 거짓 · `ABS_CLOCK_DESIGN.ADOPTED` 거짓 · 부르는 자리는 모두 손잡이 뒤(소스 검사).
//
// 실행: node scripts/test-lon-day.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const codeOnly = require('./code-only.js');

const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
const W = ZC.WORLD.worldWidth, DAY = ZC.WORLD.dayLengthMs;
const frac = (v) => { const f = v % 1; return f < 0 ? f + 1 : f; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const cdist = (a, b) => { const d = Math.abs(frac(a) - frac(b)); return Math.min(d, 1 - d); };   // 하루 몫 원 위 거리
//   시각 표본 — 결정론(난수 0): 기점에서 하루를 소수 걸음으로 나눈 시각들
const T0 = Date.UTC(2026, 9, 13, 3, 17, 0);
const TS = []; for (let i = 0; i < 97; i++) TS.push(T0 + Math.round(i * DAY * 0.7317));

say('\n=== 경도 하루 1단계 — 시각 한 식 (T720) ===');

say('\n① 원통 — 경도 = x ÷ 세계 폭 − ½ · 날짜선에서 이어진다');
ok(near(ZC.lonOf(0), -0.5) && near(ZC.lonOf(W / 2), 0) && near(ZC.lonOf(W), 0.5), 'λ(0) = −½ · λ(W/2) = 0 · λ(W) = +½', `${ZC.lonOf(0)} · ${ZC.lonOf(W / 2)} · ${ZC.lonOf(W)}`);
{ let mx = 0; for (const t of TS) mx = Math.max(mx, cdist(ZC.localTod(0, t), ZC.localTod(W, t)));
  ok(mx < 1e-9, '★날짜선(x 0 ↔ W)에서 현지 시각이 같다(하루 몫)', `최대 차 ${mx}`); }
{ let mx = 0; for (const t of TS) for (let x = 0; x <= W; x += W / 64) mx = Math.max(mx, cdist(ZC.localTod(x, t), ZC.localTod(Math.min(W, x + 32), t)));
  ok(mx < 32 / W + 1e-9, '한 셀(32px) 옆의 현지 시각 차 ≤ 셀 ÷ 세계 폭(어디서도 안 뛴다)', `최대 ${mx.toExponential(3)} ≤ ${(32 / W).toExponential(3)}`); }

say('\n② 종전 시계와 한 점에서 만난다(x = ¾W)');
{ const x = 0.75 * W; let mp = 0, md = 0;
  for (const t of TS) { mp = Math.max(mp, cdist(ZC.localPhase(x, t), ZC.worldPhase(t))); if (ZC.localDay(x, t) !== Math.floor((t - ZC.WORLD.worldEpoch) / DAY)) md++; }
  ok(near(ZC.lonPhaseOff(x), 0), 'λ(¾W) − 해 뜸 = 0', ZC.lonPhaseOff(x));
  ok(mp < 1e-9, '★¾W 의 해 몫 = 종전 worldPhase', `최대 차 ${mp}`);
  ok(md === 0, '★¾W 의 현지 날 = 종전 게임일', `다름 ${md}/${TS.length}`);
  ok(ZC._T720_DAY_OK === true, '기점(REAL_EPOCH_UTC)이 하루(24분)의 배수 — UTC × 60 의 하루 몫이 종전 시계와 같은 자리에 선다'); }

say('\n③ 해 뜸 06:00 · 현지 날은 해 뜸에서 바뀐다');
ok(near(ZC.SUNRISE_FRAC * 24, 6), '해 뜸 = 06:00(종전 클라 +6 시간)', ZC.SUNRISE_FRAC * 24);
{ let mx = 0, hud = 0; for (const t of TS) for (const x of [0, W * 0.3, W * 0.672, W * 0.9]) {
    mx = Math.max(mx, cdist(ZC.localTod(x, t), ZC.localPhase(x, t) + ZC.SUNRISE_FRAC));
    const hClient = (((ZC.localPhase(x, t) + ZC.SUNRISE_FRAC) % 1) * 24), hTod = ZC.localTod(x, t) * 24;   // 클라 `gameTimeString` 켬 식 ↔ 현지 시각
    hud = Math.max(hud, Math.min(Math.abs(hClient - hTod), 24 - Math.abs(hClient - hTod))); }
  ok(mx < 1e-9, '현지 시각 = 해 몫 + 해 뜸', `최대 차 ${mx}`);
  ok(hud < 1e-6, '★HUD 시각(클라 켬 식) = 현지 시각의 시', `최대 ${hud} 시간`); }
{ //   해 몫이 0 을 지나는 순간을 1초 걸음으로 찾아 그 앞뒤 현지 날을 본다 — 자명 통과 금지: 실제로 지나는 순간을 찾았는지부터
  const x = W * 0.70; let t = T0, found = null;
  for (let i = 0; i < DAY / 1000 + 2; i++, t += 1000) { const a = ZC.localPhase(x, t), b = ZC.localPhase(x, t + 1000); if (b < a) { found = t; break; } }
  ok(found !== null, '[전제] 해 뜸(해 몫 0)을 지나는 1초 창을 찾았다', found);
  if (found !== null) { const d0 = ZC.localDay(x, found), d1 = ZC.localDay(x, found + 1000);
    ok(d1 === d0 + 1, '★현지 날은 해 뜸에서 하나 는다', `${d0} → ${d1}`);
    const mid = found - DAY / 2; ok(ZC.localDay(x, mid) === d0, '한낮 반대편(반나절 앞)은 같은 날', ZC.localDay(x, mid)); } }

say('\n④ 존 경계에서 안 끊긴다(미끼 — 종전 0.045 식)');
{ const H = ZC.ZONES.hanbando, N = ZC.ZONES.nippon, xe = H.worldOffsetX + H.zoneWidth;
  const oldEast = ((xe - 1 - H.worldOffsetX) / H.zoneWidth) * 0.045, oldWest = ((xe - N.worldOffsetX) / N.zoneWidth) * 0.045;   // 클라 `_lonView` 종전 식
  const jumpOld = Math.abs(oldEast - oldWest) * 1440, jumpNew = Math.abs(ZC.lonPhaseOff(xe - 1) - ZC.lonPhaseOff(xe)) * 1440;
  ok(N.worldOffsetX === xe, '[전제] 닛폰 존이 한반도 존 동쪽에 붙어 있다', `${xe} = ${N.worldOffsetX}`);
  ok(jumpOld > 60, '미끼 — 종전 식은 경계에서 뛴다(게임분)', jumpOld.toFixed(1));
  ok(jumpNew < 0.01, '★새 식은 경계에서 안 뛴다(게임분)', jumpNew.toFixed(4));
  const span = H.zoneWidth / W * DAY / 1000;
  ok(span > 160 && span < 170, '한반도 존 폭 = 하루의 존 폭 ÷ 세계 폭(실초 · T712 표 165초)', span.toFixed(1)); }

say('\n⑤ 끔 = 아무도 안 부른다');
{ const env0 = Object.assign({}, process.env); delete env0.T720_LON_DAY;
  const probe = (env) => JSON.parse(execFileSync(process.execPath, ['-e', `const Z=require(${JSON.stringify(path.join(ROOT, 'server', 'zone-config.js'))});console.log(JSON.stringify([Z.T720_LON_DAY,Z.ABS_CLOCK_DESIGN.ADOPTED]))`], { env, encoding: 'utf8' }).trim());
  const off = probe(env0), on = probe(Object.assign({}, env0, { T720_LON_DAY: '1' }));
  ok(off[0] === false && off[1] === false, '★env 없음 → 손잡이 끔 · 절대 시계 미채택', JSON.stringify(off));
  ok(on[0] === true && on[1] === true, '미끼 — `T720_LON_DAY=1` → 켬 · 채택(손잡이가 실제로 읽힌다)', JSON.stringify(on));
  //   부르는 자리는 손잡이 뒤 — 주석을 뺀 코드에서 새 식을 부르는 줄마다 같은 줄에 손잡이(또는 켬 판만 서는 칸)가 있다
  const V = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8')).split('\n');
  const Zs = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8')).split('\n');
  const gated = (L, re) => { const hit = L.filter((l) => re.test(l) && !/^\s*function /.test(l));   // 정의 줄은 뺀다(부르는 줄만)
  return [hit.length, hit.filter((l) => /T720_LON_DAY|worldClock\.lonDay/.test(l)).length]; };
  const v1 = gated(V, /_t720LonOff\(|_t720Step\(vil, npc, now, fv/), z1 = gated(Zs, /phaseAdd\(|lonDay: 1/);
  ok(v1[0] >= 3 && v1[0] === v1[1], 'villages — 새 식 · 해 질 녘 정산을 부르는 줄이 모두 손잡이 뒤', `${v1[1]}/${v1[0]}`);
  ok(z1[0] >= 5 && z1[0] === z1[1], 'zone — 새 식 · 클라 시계 칸을 내는 줄이 모두 손잡이 뒤', `${z1[1]}/${z1[0]}`);
  const C = fs.readFileSync(path.join(ROOT, 'public', 'client', '20-r2-visibility.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'public', 'client', '34-m-renderloop.js'), 'utf8');
  ok((C.match(/worldClock(?:\.|\s*&&\s*worldClock\.)lonDay/g) || []).length >= 3, '클라 — 켬 갈래 셋(경도 · 해 몫 · HUD)은 서버가 준 `lonDay` 칸 뒤'); }

say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
