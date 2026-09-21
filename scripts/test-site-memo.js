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
// ★★러너 안에서 `HeadersTimeoutError` 로 죽었다(같은 판에서 `test-route-persist` 도 같은 이유로 죽었다).
//   왜: 이 팔의 존 서버는 일틱이 초 단위로 루프를 막는다(대조군 OFF 는 매일 전수 탐색이다). 그러면
//   node http 의 keep-alive 시계(기본 5초)가 늦게 울려 **클라이언트가 막 쓴 소켓을 서버가 닫는다** —
//   그 요청은 답을 못 받고 undici 기본 300초를 기다리다 터진다. 서버가 죽은 게 아니다.
//   ⇒ 폴링은 소켓을 재사용하지 않는다(`connection: close`) + 상한 + 재시도. 판정은 그대로다
//     (진짜 안 오면 아래 `j.econTick.days >= DAYS` 가 못 차서 `부팅/수확 실패`로 떨어진다).
let _netRetry = 0;
async function jperf(u, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await (await fetch(u, { headers: { connection: 'close' }, signal: AbortSignal.timeout(30000) })).json(); }
    catch (e) { last = e; _netRetry++; await sleep(500); }
  }
  throw last;
}
const cp = (src, dst) => { for (const sfx of ['', '-wal', '-shm']) { try { fs.copyFileSync(src + sfx, dst + sfx); } catch (e) { try { fs.unlinkSync(dst + sfx); } catch (e2) {} } } };

async function arm(label, extraEnv) {
  const CDB = `/tmp/sitememo-${label}-c.db`, ZDB = `/tmp/sitememo-${label}-z.db`;
  cp(SEED_C, CDB); cp(SEED_Z, ZDB);
  boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  if (!await waitHttp(`http://localhost:${CPORT}/zones`, 120)) { killAll(); return null; }
  boot('zone.js', Object.assign({
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_DAY_MS: String(DAY_MS), ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    // ★★[T342] **영토가 자라지 않는 세계에서 잰다 — 그게 기억의 계약이기 때문이다.**
    //   T342 전까지 `_terrGrow` 는 영토를 넓힌 뒤 표지만 세우고 거부 캐시를 남겼다. 그 단조성 논증이
    //   `마을 영토 밖` 에서 깨진다는 것을 T335 가 감사문으로 쟀고(캐시된 거부의 10%가 오늘은 통과),
    //   T342 가 `lifeSiteReset` 으로 고쳤다 ⇒ **영토가 자라는 날에는 기억이 (옳게) 아무것도 안 아낀다.**
    //   그래서 성장 중인 세계에서 이 하네스를 돌리면 ①③ 이 재는 "싸짐" 이 **구조적으로 0** 이고,
    //   그건 결함이 아니라 계약이다. 기억이 실제로 일하는 구간은 **영토가 다 자란 뒤**다.
    //   그 구간을 결정적으로 만들려면 영토 목표를 종전(`land.size × 25`)으로 되돌리면 된다 —
    //   T219 §0 실측에서 그 목표는 이미 붙어 있어 200일에 50마을 합쳐 63셀만 자랐다(= 사실상 정지).
    //   ⇒ 손잡이 하나(`T230_TERR_HOUSING=0`)로 **기억이 적용되는 세계**를 고정한다. 제품 기본값은 안 건드린다.
    //   (T342 의 계약 자체는 아래 ⑤ 절이 소스로 건다 — 세계를 안 돌리고도 되돌림을 잡는다.)
    T230_TERR_HOUSING: '0',
  }, extraEnv || {}));
  if (!await waitHttp(`http://localhost:${ZPORT}/health`, 600)) { killAll(); return null; }
  let j = null;
  for (let i = 0; i < 300; i++) {
    await sleep(2000);
    j = await jperf(`http://localhost:${ZPORT}/perf`);
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
  console.log(`  폴링 재시도 ${_netRetry}회 (끊긴 소켓 재접속 — 0이 정상, 러너 부하에서만 는다)\n`);

  // ① ★상황 선행 — 종전 판이 정말 매일 헛되이 훑는가(아니면 이 하네스는 아무것도 안 잰다)
  ok(pa.siteCall >= A.days * 5, '① [상황] 종전 판이 하루 5회 이상 집터를 훑는다', `${pa.siteCall}회 / ${A.days}일`);
  ok(pa.siteSkip === 0, '① [상황] 종전 판은 한 번도 안 건너뛴다(대조군이 맞다)', `스킵 ${pa.siteSkip}`);
  ok(pa.siteHit === 0 || pa.siteCall > pa.siteHit, '① [상황] 헛수고(빈손)가 실제로 있다', `빈손 ${pa.siteCall - pa.siteHit}`);
  // ★★[T342] **절대 문턱 `100ms` 를 뺐다 — 죽은 세계의 수였다.**
  //   이 수는 T41(2026-09-01) 이 잰 세계의 것이다: 그때 집터 단계는 **하루 1,170ms** 였고 거부의 92%가
  //   `기존 집과 너무 가까움(<18)` 이었다. 그 뒤 T298(영토·방아쇠 켬) · T326(간격 15 · `_mapBeds`)이
  //   집터를 **성사시키는** 세계로 바꿨고, 같은 단계가 지금 **55ms** 다(21배 싸졌다).
  //   ⇒ 일이 늘어난 게 아니라 **줄었다**. 그런데 문턱만 옛 세계에 묶여 있어 빨강이 됐다.
  //   이 절이 정말 물어야 하는 것은 "아낄 것이 있나" 다 ⇒ **대조군이 채택본보다 무거운가**로 묻는다(수 0).
  ok(st(A, 'life:site').p50 > st(B, 'life:site').p50,
    '① [상황] 그 헛수고가 **잴 만큼 있다** — 대조군 집터 단계가 채택본보다 무겁다(T342: 절대 문턱 폐지)',
    `종전 ${st(A, 'life:site').p50}ms > 채택 ${st(B, 'life:site').p50}ms`);

  // ② ★★같은 답인가 — 단조성 감사(이 하네스의 심장)
  ok(pd.auditN >= 1000, '② [전제] 감사가 실제로 돌았다 — 건너뛴 셀을 다시 판정한 횟수', `${pd.auditN}회`);
  ok(pd.auditBad === 0, '② ★★건너뛴 셀 중 **지금은 통과할 자리가 하나도 없다**(단조성 성립)', pd.auditBad ? `위반 ${pd.auditBad} · 첫 사례 ${pd.auditFirst}` : `위반 0 / ${pd.auditN}`);
  // ★★[T214 2026-09-12] **공통 날 창**에서만 견준다 — 두 팔은 같은 게임일에 안 멈춘다.
  //   `arm()` 은 2초마다 `/perf` 를 보고 `days >= DAYS` 면 멈추는데 하루가 3.5초다. 러너 부하에서
  //   한 폴링이 여러 날을 건너뛰면 팔마다 **끝난 날이 다르다**(실측: 러너 "1건 vs 2건" · 단독 "1건 vs 1건").
  //   로그는 누적이라 더 오래 산 팔이 한 줄 더 갖는다 — 그건 **다른 답**이 아니라 **다른 길이**다.
  //   ⇒ 문턱을 안 고른다. 줄마다 **날이 박혀 있으므로**(`day:vil:x,y:s|l`) 두 팔이 **둘 다 산 날**까지만
  //     자른다. 자르는 수는 세계가 말한 `E.days` 둘의 최소값이다 — 새 수 0.
  const _cut = Math.min(A.days | 0, B.days | 0);
  const _upto = (log) => (log || []).filter((t) => (parseInt(String(t).split(':')[0], 10) | 0) <= _cut);
  const la = _upto(pa.siteLog), lb = _upto(pb.siteLog);
  ok(_cut > 0, '② [전제] 두 팔이 둘 다 산 날이 있다(0이면 아래가 자명 통과다)', `공통 ${_cut}일 (종전 ${A.days}일 · 채택 ${B.days}일)`);
  ok(JSON.stringify(la) === JSON.stringify(lb), '② 선택된 집터 로그가 두 판에서 같다(공통 날 창)',
    `${la.length}건 vs ${lb.length}건 · 공통 ${_cut}일까지 (자르기 전 ${pa.siteLog.length} vs ${pb.siteLog.length})`
    + `${la.length ? '' : ' (이 세계는 성공 0 — ②의 감사가 본검사다)'}`);

  // ③ 싸졌는가
  ok(pb.siteSkip > 0, '③ [전제] 실제로 건너뛰었다', `스킵 ${pb.siteSkip}`);
  // ★★[T342] **비율 문턱(½ · ⅕)도 옛 세계의 수였다.** 그 둘은 T41 이 실제로 본 이득이고,
  //   그때는 건너뛰는 비율이 압도적이었다(하루 20곳 훑고 성공 0). 지금은 성사가 흔해 건너뛸 일 자체가 줄었다
  //   (이 판: 46회 중 21회 스킵 = 46%). 이득이 스킵 비율을 따라가는 것은 **옳은 동작**이지 회귀가 아니다.
  //   ⇒ 기억의 계약을 **수 없이** 그대로 쓴다: "**한 번의 훑기 값은 그대로 두고, 훑기 자체를 줄인다**".
  //     ⓐ 총량은 확실히 줄었다  ⓑ **훑기 한 번당 셀 수는 안 늘었다**(= 아낀 것은 건너뛴 호출뿐 · 새 수 0)
  ok(pb.siteScan < pa.siteScan, '③ ★훑은 셀이 종전보다 **줄었다**', `${pb.siteScan} < ${pa.siteScan}`);
  ok(pb.siteCall > 0 && pa.siteCall > 0 && (pb.siteScan / pb.siteCall) <= (pa.siteScan / pa.siteCall),
    '③ ★★그리고 **훑기 한 번당 셀 수는 안 늘었다** — 아낀 것은 건너뛴 호출이다(같은 답을 더 싸게)',
    `채택 ${Math.round(pb.siteScan / pb.siteCall)}셀/회 ≤ 종전 ${Math.round(pa.siteScan / pa.siteCall)}셀/회`);
  ok(st(B, 'life:site').p50 < st(A, 'life:site').p50, '③ 집터 단계 중앙값도 종전보다 낮다',
    `${st(B, 'life:site').p50}ms < ${st(A, 'life:site').p50}ms`);
  ok(st(B, '1마을:site').p50 <= Math.max(20, st(A, '1마을:site').p50 / 5), '③ 마을 한 곳의 집터 조각 중앙값도 1/5 이하',
    `${st(B, '1마을:site').p50}ms ≤ ${Math.max(20, Math.round(st(A, '1마을:site').p50 / 5))}ms`);

  // ⑤ ★★[T342] **영토가 자라면 거부 캐시를 버린다** — 이 계약이 이 하네스의 전제다(세계를 안 돌리고 건다).
  //   이게 깨지면 ②의 감사가 다시 위반을 내기 시작한다(T335 실측: 캐시된 거부의 10%가 거짓).
  {
    const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
    const i0 = VS.indexOf('function _terrGrow');
    const body = i0 < 0 ? '' : VS.slice(i0, VS.indexOf('\nfunction ', i0 + 10));
    ok(i0 > 0 && /lifeSiteReset\(vil\)/.test(body),
      '⑤ ★`_terrGrow` 가 영토를 넓힌 뒤 **`lifeSiteReset`**(표지 + 거부 캐시 파기)을 부른다 — T342 의 계약');
    ok(!/lifeSiteDirty\(vil\)/.test(body),
      '⑤ 그 자리에 표지만 세우는 옛 호출(`lifeSiteDirty`)이 **없다** — 있으면 캐시가 영토 성장을 못 본다');
    ok(/function lifeSiteReset\(vil\) \{ if \(vil\) \{ lifeSiteDirty\(vil\);/.test(VS),
      '⑤ `lifeSiteReset` 의 표지는 **`lifeSiteDirty` 를 통해** 선다 — 픽스처 손잡이(`LIFE_SITE_NODIRTY`)를 안 몰래 무시한다(사본 0)');
  }

  // ④ 표지를 놓쳐도 회복하는가 — 안전망 픽스처
  ok(pc.siteCall > 0, '④ [픽스처] 표지를 통째로 껐는데도 안전망이 탐색을 일으킨다', `${pc.siteCall}회 / ${C.days}일`);
  ok(pc.siteSkip > 0, '④ [픽스처] 그러면서도 대부분은 건너뛴다(안전망이지 전수 복귀가 아니다)', `스킵 ${pc.siteSkip}`);
  const perDay = pc.siteCall / Math.max(1, C.days);
  ok(perDay <= (B.last.villages || 50) / 2, '④ [픽스처] 안전망이 **흩어져** 돈다(하루에 몰리지 않는다)', `하루 ${perDay.toFixed(1)}곳 ≤ ${((B.last.villages || 50) / 2).toFixed(0)}곳`);

  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
