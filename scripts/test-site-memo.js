#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-site-memo.js — 집터 "못 찾음 기억" 검사 ==========================
//
// ★왜 [재민 확정 2026-09-01 · T41 ①]
//   T1 이 남긴 조각의 바닥은 `_lifeAddHouseSite` 였다 — 실측으로 **하루 20곳이 훑고 성공 0**,
//   그 헛수고가 일틱의 56%(1,170ms/일). 거부 사유의 92%가 `기존 집과 너무 가까움(<18)` 이라
//   **영토가 안 바뀌면 내일도 같은 답**이다. 그래서 빈손을 기억하고, 후보가 늘 수 있는
//   사건(영토 확장 · 의뢰 집터 소멸 · 지형 완화)에서만 다시 판다.
//
// ★★이 하네스가 지키는 것은 **"같은 답을 더 싸게"** 다. 그래서 두 가지를 잰다:
//   ⓐ **싸졌는가** — 같은 세계에서 `LIFE_SITE_MEMO=0`(종전 · 매일 전수)과 켠 판을 짝 비교.
//   ⓑ **같은 답인가** — 이게 이 하네스의 심장이다. 캐시로 건너뛴 셀을 `LIFE_SITE_AUDIT=1` 로
//      **실제로 다시 판정**해 단조성 논증(주석 참조)을 런타임에 증명한다. 위반이 하나라도 있으면
//      그 셀이 "어제는 안 됐는데 오늘은 되는" 자리이고, 곧 집이 안 지어지는 조용한 결함이다.
//      ⇒ 결과 로그(선택된 집터)만 비교하면 **성공이 0 인 세계에서 자명 통과**한다. 감사가 그 구멍을 막는다.
//   ⓒ **표지를 놓쳐도 회복하는가** — `LIFE_SITE_NODIRTY=1` 로 표지를 통째로 끄고,
//      N일 안전망이 여전히 전수 탐색을 일으키는지 본다(마을마다 다른 날에 흩어져서).
//
// ★왜 `test-tick-slicer` 에 안 붙였나: 그 하네스는 이미 세 팔(대조군·조각내기·A/A)을 돌린다.
//   여기 세 팔을 더하면 한 하네스가 12분을 먹고, **두 주제**(조각내기 구조 / 집터 기억)가 섞인다.
//   실패했을 때 무엇이 깨졌는지 이름으로 알 수 있게 나눴다.
//
// 실행: node scripts/test-site-memo.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const DAY_MS = parseInt(process.env.SITE_DAY_MS || '', 10) || 3500;
const DAYS = parseInt(process.env.SITE_DAYS || '', 10) || 9;
// ★[T49 2026-09-02] 씨앗 경로·시딩 절차는 `scripts/slicer-seed.js` 가 정본이다.
//   종전엔 씨앗이 없으면 "`test-tick-slicer` 를 먼저 돌려라"며 죽었는데, 러너는 **이름순**이라
//   이 파일이 `tick-slicer` 보다 **먼저** 돈다 ⇒ 신선한 러너에서는 영원히 못 통과했다.
const { seedPaths, ensureSeed } = require('./slicer-seed.js');
// ★[T49 2026-09-02] **자기 크기의 씨앗**을 쓴다. 기본 씨앗(20초 성장)은 이 하네스에 너무 어리다 —
//   "집터를 못 찾는 헛수고"를 재려면 마을이 제 땅을 거의 다 쓴 세계여야 하는데, 어린 세계에선
//   전수 훑기도 늘 성공해서 **빈손 0** 이 되고 ① 의 상황 선행 assert 가 옳게 거절한다.
const SITE_SEED_TAG = process.env.SITE_SEED_TAG || 'sitememo';
const SITE_SEED_GROW_MS = parseInt(process.env.SITE_SEED_GROW_MS || '', 10) || 150000;
const { c: SEED_C, z: SEED_Z } = seedPaths(SITE_SEED_TAG);

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const cp = (src, dst) => { for (const sfx of ['', '-wal', '-shm']) { try { fs.copyFileSync(src + sfx, dst + sfx); } catch (e) { try { fs.unlinkSync(dst + sfx); } catch (e2) {} } } };

async function arm(label, extraEnv) {
  const CDB = `/tmp/sitememo-${label}-c.db`, ZDB = `/tmp/sitememo-${label}-z.db`;
  cp(SEED_C, CDB); cp(SEED_Z, ZDB);
  boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  if (!await waitHttp(`http://localhost:${CPORT}/zones`, 120)) { killAll(); return null; }
  boot('zone.js', Object.assign({
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_DAY_MS: String(DAY_MS), ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
  }, extraEnv || {}));
  if (!await waitHttp(`http://localhost:${ZPORT}/health`, 600)) { killAll(); return null; }
  let j = null;
  for (let i = 0; i < 300; i++) {
    await sleep(2000);
    j = await (await fetch(`http://localhost:${ZPORT}/perf`)).json();
    if (j.econTick && j.econTick.days >= DAYS) break;
  }
  killAll();
  await sleep(4000);   // 포트 반납
  return j;
}
const st = (E, k) => (E && E.stages && E.stages[k]) ? E.stages[k] : { p50: 0, p95: 0, max: 0 };

(async () => {
  console.log('\n=== 집터 "못 찾음 기억" — 짝 비교 + 단조성 감사 ===');
  // 씨앗이 없으면 **스스로 만든다**(앞 하네스가 남긴 것에 기대지 않는다 — 족보 ㊾ 의 러너판).
  { const r = await ensureSeed({ tag: SITE_SEED_TAG, growMs: SITE_SEED_GROW_MS });
    if (!r.ok) { console.log(`  ✗ 씨앗 준비 실패 — ${r.why}`); process.exit(1); }
    if (r.built) console.log('  (이 판이 씨앗을 만들었다 — 다음 실행부터는 곧바로 시작한다)'); }

  // ★팔이 넷인 이유: **감사 팔은 느리다**(건너뛴 셀마다 `reject` 를 다시 부른다 — 그게 감사다).
  //   첫 판에서 그 팔로 비용을 재고 "1/5 로 못 줄었다"는 **가짜 실패**를 냈다.
  //   ⇒ 비용은 감사 없는 팔(ON)로, 정확성은 감사 팔(AU)로 잰다. 하나로 겸하면 둘 다 틀린다.
  const OFF = await arm('off', { LIFE_SITE_MEMO: '0' });                       // 종전 동작(매일 전수) — 대조군
  const ON = await arm('on', {});                                              // 채택본 그대로 — **비용**을 잰다
  const AU = await arm('au', { LIFE_SITE_AUDIT: '1' });                        // 채택본 + 단조성 감사 — **정확성**을 잰다
  const FX = await arm('fx', { LIFE_SITE_NODIRTY: '1', LIFE_SITE_RESCAN_DAYS: '3' });  // 표지 고장 픽스처
  if (!OFF || !ON || !AU || !FX || !OFF.econTick || !ON.econTick || !AU.econTick || !FX.econTick) { console.log('  ✗ 부팅/수확 실패'); process.exit(1); }
  const A = OFF.econTick, B = ON.econTick, D = AU.econTick, C = FX.econTick;
  const pa = A.probe, pb = B.probe, pd = D.probe, pc = C.probe;
  const rep = (t, E, p) => `${t} ${E.days}일 · 집터 호출 ${p.siteCall}(성공 ${p.siteHit} · 스킵 ${p.siteSkip}) · 스캔셀 ${p.siteScan}`
    + ` · life:site 중앙 ${st(E, 'life:site').p50}ms(p95 ${st(E, 'life:site').p95}) · 1마을:site 중앙 ${st(E, '1마을:site').p50}ms(최대 ${st(E, '1마을:site').max})`
    + `\n      ↳ 일틱 총 중앙 ${E.total.p50}ms(p95 ${E.total.p95}) · life 중앙 ${st(E, 'life').p50}ms · **한 프레임 최대 ${E.last.frameMax}ms** · 최대 조각 ${E.last.maxChunk}ms(${E.last.maxChunkAt})`;
  console.log('\n  ' + rep('종전(MEMO=0)', A, pa));
  console.log('  ' + rep('채택(기억 ON)', B, pb));
  console.log('  ' + rep('감사(AUDIT=1)', D, pd));
  console.log('  ' + rep('픽스처(표지 OFF·N=3)', C, pc) + '\n');

  // ① ★상황 선행 — 종전 판이 정말 매일 헛되이 훑는가(아니면 이 하네스는 아무것도 안 잰다)
  ok(pa.siteCall >= A.days * 5, '① [상황] 종전 판이 하루 5회 이상 집터를 훑는다', `${pa.siteCall}회 / ${A.days}일`);
  ok(pa.siteSkip === 0, '① [상황] 종전 판은 한 번도 안 건너뛴다(대조군이 맞다)', `스킵 ${pa.siteSkip}`);
  ok(pa.siteHit === 0 || pa.siteCall > pa.siteHit, '① [상황] 헛수고(빈손)가 실제로 있다', `빈손 ${pa.siteCall - pa.siteHit}`);
  ok(st(A, 'life:site').p50 >= 100, '① [상황] 그 헛수고가 잴 만큼 무겁다(중앙 ≥100ms/일)', `${st(A, 'life:site').p50}ms`);

  // ② ★★같은 답인가 — 단조성 감사(이 하네스의 심장)
  ok(pd.auditN >= 1000, '② [전제] 감사가 실제로 돌았다 — 건너뛴 셀을 다시 판정한 횟수', `${pd.auditN}회`);
  ok(pd.auditBad === 0, '② ★★건너뛴 셀 중 **지금은 통과할 자리가 하나도 없다**(단조성 성립)', pd.auditBad ? `위반 ${pd.auditBad} · 첫 사례 ${pd.auditFirst}` : `위반 0 / ${pd.auditN}`);
  ok(JSON.stringify(pa.siteLog) === JSON.stringify(pb.siteLog), '② 선택된 집터 로그가 두 판에서 같다',
    `${pa.siteLog.length}건 vs ${pb.siteLog.length}건${pa.siteLog.length ? '' : ' (이 세계는 성공 0 — ②의 감사가 본검사다)'}`);

  // ③ 싸졌는가
  ok(pb.siteSkip > 0, '③ [전제] 실제로 건너뛰었다', `스킵 ${pb.siteSkip}`);
  ok(pb.siteScan <= pa.siteScan / 2, '③ ★훑은 셀이 종전의 절반 이하', `${pb.siteScan} ≤ ${Math.round(pa.siteScan / 2)}`);
  ok(st(B, 'life:site').p50 <= Math.max(20, st(A, 'life:site').p50 / 5), '③ ★★집터 단계 중앙값이 종전의 1/5 이하',
    `${st(B, 'life:site').p50}ms ≤ ${Math.max(20, Math.round(st(A, 'life:site').p50 / 5))}ms`);
  ok(st(B, '1마을:site').p50 <= Math.max(20, st(A, '1마을:site').p50 / 5), '③ 마을 한 곳의 집터 조각 중앙값도 1/5 이하',
    `${st(B, '1마을:site').p50}ms ≤ ${Math.max(20, Math.round(st(A, '1마을:site').p50 / 5))}ms`);

  // ④ 표지를 놓쳐도 회복하는가 — 안전망 픽스처
  ok(pc.siteCall > 0, '④ [픽스처] 표지를 통째로 껐는데도 안전망이 탐색을 일으킨다', `${pc.siteCall}회 / ${C.days}일`);
  ok(pc.siteSkip > 0, '④ [픽스처] 그러면서도 대부분은 건너뛴다(안전망이지 전수 복귀가 아니다)', `스킵 ${pc.siteSkip}`);
  const perDay = pc.siteCall / Math.max(1, C.days);
  ok(perDay <= (B.last.villages || 50) / 2, '④ [픽스처] 안전망이 **흩어져** 돈다(하루에 몰리지 않는다)', `하루 ${perDay.toFixed(1)}곳 ≤ ${((B.last.villages || 50) / 2).toFixed(0)}곳`);

  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
