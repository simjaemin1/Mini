#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-thirst.js — 물 안 마시면 죽는다 (실클라 E2E) ====================
//
// ★★[캐논 변경 2026-09-01 재민 확정 · T44 · §12]
//   *"허기·갈증·극한 추위는 **극단에 닿기 전엔 디버프만**, 극단에 닿으면 HP 가 아주 천천히 깎인다.
//     **고증 최우선 — 물 안 마셔도 사는 세계는 없다.**"*
//
// ★왜 이 하네스가 따로 있나 — `test-body ⑰` 은 **식이 맞는가**를 잰다. 이 레포가 배치 5 에서 배운 것은
//   계약도 역학도 멀쩡한데 **화면에 도달하지 못하는 층**이 하나 더 있다는 것이다. 캐논이 바뀌었는데
//   실제 서버에서 HP 가 안 깎이면 그건 캐논이 아니라 문서다. 그래서 진짜 Chromium 을 띄우고 확인한다.
//
// ★★시간: 갈증 극단 → HP 0 은 **게임 1.5일 = 실시간 36분**이다. 하네스가 그걸 기다릴 수는 없다.
//   ⇒ 픽스처로 **갈증만 0 으로 세우고**(`__e2e_body`), 그 뒤의 역학은 **서버가 돌린다**.
//     그리고 "36분이면 0" 이라는 주장은 **측정한 초당 속도에서 외삽**해 대조한다(기다리지 않고 검증).
//
// ★HP 는 클라 훅을 새로 만들지 않고 **화면이 말하는 값**(`#hpText`)으로 읽는다(클라 무접촉 카드).
//
// 실행: node scripts/e2e-thirst.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-thirst-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-thirst-central-${process.pid}.db`, ZDB = `/tmp/e2e-thirst-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 600) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

(async () => {
  console.log('\n=== 물 안 마시면 죽는다 — 갈증 극단 HP 감소 실클라 E2E (Chromium) ===');
  const B = require(path.join(ROOT, 'server', 'body.js'));
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    E2E_GIVE: '1',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  await sleep(6000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); return f; };

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  const enterBtn = await page.$('#enter');
  if (enterBtn) await enterBtn.click();
  // ★[T140] 30초로 자르지 않는다 — 부하가 있으면 그 안에 못 들어온다(픽스처 정본 · 판정은 그대로).
  const FX = require('./fixture-clock.js');   // ★[T140] 앵커·기대값·얼림·참을성이 전부 이 한 자리다(사본 0)
  const enter = await FX.waitInWorld(page);
  await sleep(1800);
  ok(enter.ok && await page.evaluate(() => !!(window.__inWorld && window.__inWorld())),
     '존 입장 — 월드 안이다', `${enter.waited}ms 기다림`);

  // ★화면이 말하는 HP — 새 훅을 안 만든다(클라 무접촉)
  const hpNow = async () => page.evaluate(() => {
    const el = document.getElementById('hpText');
    if (!el) return null;
    const m = String(el.textContent).match(/(\d+)\s*\/\s*(\d+)/);
    return m ? +m[1] : null;
  });
  const thirstNow = async () => page.evaluate(() => (window.__getGauges ? window.__getGauges().thirst : null));
  // ★★[이 하네스가 먼저 틀린 자리 · 족보 ㊻] 초안이 낡은 값을 기준선으로 삼아
  //   "마을에서 3HP 가 **찼다**"는 없는 결함을 냈다.
  //   ⇒ 기준선을 믿지 말고 **연속 관측의 단조 감소**로 판정한다. 그 판정은 지금도 옳다.
  // ⚠[T131 2026-09-06 주석 정정] 여기 있던 이유 설명은 **더는 사실이 아니다.**
  //   종전 주석: "서버는 `player_damaged` 로만 hp 를 보내고 자연 회복은 브로드캐스트가 없다 ·
  //   `self.hp` 는 welcome 때 한 번뿐". **T61 이 `gauges` 에 `hp`·`maxHp` 를 실으면서 닫혔다** —
  //   지금은 초당 하나 나가는 그 메시지가 회복을 나르고, 창구 이름도 `hp_changed` 다(T131 개명).
  //   판정(단조 감소)은 그대로 두고 **이유만** 고친다 — 다음 사람이 없는 결함을 좇지 않게.
  const watchHp = async (secs, stepMs) => {
    const out = [];
    const step = stepMs || 5000;
    for (let t = 0; t < secs * 1000; t += step) { out.push(await hpNow()); await sleep(step); }
    out.push(await hpNow());
    return out;
  };
  //   ★첫 표본은 **낡았을 수 있다** ⇒ 기준선을 "처음으로 신선해진 지점"(=최댓값)으로 잡는다.
  const strictlyDrained = (seq) => {
    const v = seq.filter((x) => x !== null);
    if (v.length < 2) return false;
    let i0 = 0; for (let i = 1; i < v.length; i++) if (v[i] > v[i0]) i0 = i;
    if (i0 >= v.length - 1) return false;
    for (let i = i0 + 1; i < v.length; i++) if (v[i] > v[i - 1]) return false;   // 오르면 감소가 아니다
    return v[v.length - 1] < v[i0];
  };

  // ── ① 여름 낮으로 시계를 세운다 — **추위를 변수에서 뺀다** ─────────────────
  //   갈증만 재는 자리라 추위가 끼면 두 축이 섞인다(그러면 무엇을 쟀는지 알 수 없다).
  // ★★[T140 2026-09-06] 여기 있던 `sleep(2000)` 이 이 하네스를 여섯 번 빨갛게 만든 자리다.
  //   클라의 `__wx` 는 **초당 하나 오는 `gauges`** 로만 갱신된다 — 존 틱이 밀리면 2초 안에 안 오고
  //   하네스는 **얼기 전의 값**을 읽는다(0.5634 = day 0·낮 · 0.8647 = day 0·밤 — 부하가 밤낮을 갈랐다).
  //   ⇒ 정해진 초를 자지 않는다. **세계가 그 시계를 말할 때까지 기다린다**(픽스처 정본 · 사본 0).
  const SUMMER = FX.anchorDays().summer;
  const fx1 = await FX.setClock(page, { day: SUMMER, night: false });
  ok(fx1.ok, '★★① (픽스처) **시계가 실제로 얼었다** — 세계가 그 날·그 밤을 말한다(부하와 무관)',
    `day ${SUMMER} · 기대 ${fx1.want.tempC}℃ · 실측 ${fx1.got ? fx1.got.tempC : 'null'}℃ · ${fx1.waited}ms`);
  const wx0 = fx1.got;
  ok(wx0 && wx0.cold < 0.2, '★① (상황) 한여름 낮이다 — 추위 축이 변수에서 빠졌다(갈증만 남는다)',
    wx0 ? `추위 ${wx0.cold} · ${wx0.ko}` : 'null');

  // ── ② 목이 말라도 **극단 전엔** 안 깎인다 ──────────────────────────────────
  const gate = B.extremeAt('thirst');
  const preGauge = Math.round((1 - (gate - 0.05)) * 100);   // 문턱보다 5%p 위(=덜 심각)
  await page.evaluate((t) => window.__sendPrimary({ type: '__e2e_body', hunger: 100, thirst: t, cold: 0, quiet: true }), preGauge);
  await sleep(1500);
  const hpPre0 = await hpNow();
  ok(hpPre0 !== null, '★② 화면이 HP 를 말한다(`#hpText`)', `${hpPre0}`);
  await sleep(9000);
  const hpPre1 = await hpNow();
  ok(hpPre0 !== null && hpPre1 === hpPre0,
    '★★② **극단 이전엔 한 점도 안 깎인다** — 이 카드는 극단 이후만 더한다',
    `${hpPre0} → ${hpPre1} (갈증 ${preGauge})`);

  // ── ③ 갈증이 바닥나면 HP 가 **천천히** 깎인다 ──────────────────────────────
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 100, thirst: 0, cold: 0, quiet: true }));
  await sleep(1500);
  const t0 = Date.now();
  const hpA = await hpNow();
  ok((await thirstNow()) === 0, '★③ (상황) 갈증이 실제로 0 이다 — 자명 통과 금지', `${await thirstNow()}`);
  // ★★[T148 2026-09-07] **벽시계로 외삽하지 않는다 — 게임분으로 잰다**(T140 회부 1 ⓐ).
  //   T140 부하 판에서 이 절이 "50.7분 vs 표 36.0분"으로 빨갰다. 결함이 아니라 **세계가 느리게 돈 것**이다:
  //   `zone.js:10556` 이 `dt = Math.min(0.2, …)` 로 한 틱을 **0.2초에서 자르고 따라잡지 않는다**.
  //   코어가 눌려 틱이 200ms 를 넘으면 적분된 게임분이 벽시계보다 **영구히** 뒤진다.
  //   ⇒ "게임 1.5일에 HP 100" 은 **게임분에 대한 주장**이다. 벽시계를 대입한 것이 틀렸다.
  //
  //   ★★[T153 2026-09-07 전제 정정] T148-A 는 증인으로 **허기**를 골랐다 — "소수 둘째 자리까지 온다"고
  //     적었는데 **틀렸다**: 선에 나가는 것은 `hunger: Math.round(player.hunger)` 로 **정수**다
  //     (`zone.js:4266` 등 · `Body.selfPayload` 가 아니라 `gauges` 페이로드가 반올림한다).
  //     ⇒ 한 점이 **19.2초**라 ±16% 짜리 자다. 그 자로 6.00 점을 읽어 115.2초가 나온 것이고,
  //       ±40% 문턱 덕에 통과했을 뿐이다(자가 굵어서 통과한 것은 통과가 아니다).
  //   ⇒ 증인을 **서버의 틱 시계**로 바꾼다(`/perf.tick.sim` — 세계가 실제로 적분한 초 · ms 해상도).
  //     T153 이 그 계측을 세웠고, 그건 **관측자**라 동작을 안 바꾼다. 허기는 **교차 검사**로 남긴다.
  const tickStat = async () => { try { return (await (await fetch(`http://localhost:${ZPORT}/perf`)).json()).tick; } catch (e) { return null; } };
  const hunNow = async () => page.evaluate(() => (window.__getGauges ? window.__getGauges().hunger : null));
  const coldNow = async () => page.evaluate(() => ((window.__bodyState || {}).cold));
  const hunA = await hunNow();
  //   window 양끝을 같은 자리에서 잡는다. t0 는 위 읽기 넷보다 앞이라 벽시계가 그만큼 더 길게 잡히고,
  //   부하 판에서 그 1~1.5초가 곧 "1.2% 뒤짐" 으로 보였다(세계가 아니라 자의 눈금이 어긋난 것).
  const tkA = await tickStat();
  const wA = Date.now();
  const cold0 = await coldNow();
  //   ★추우면 허기가 빨리 준다(`cm = 1 + COLD_HUNGER_EXTRA·cold`). ①이 여름 낮을 얼려 뒀으니 0 이어야 한다 —
  //     그걸 **전제로 못 박고** 나서 cm = 1 을 쓴다(가정이 아니라 검사다).
  ok(cold0 !== undefined && cold0 <= 0.01,
    '★③ (상황) 추위가 0 이다 — 허기 환산의 곱이 1 이다(자명 통과 금지)', `추위 ${cold0}`);
  await sleep(120000);         // 2분 — 표대로면 100/2160×120 ≈ 5.6HP(세계가 제 속도로 돌 때)
  const hpB = await hpNow();
  const hunB = await hunNow();
  const wB = Date.now();
  const tkB = await tickStat();
  const secs = (Date.now() - t0) / 1000;                                   // 벽시계(HP 창 · 표시용)
  const wallWin = (wB - wA) / 1000;      // 시계 충실도를 재는 창 — 틱 시계 두 읽기 사이만 센다
  // ★★적분된 게임분 = **세계가 실제로 적분한 초**(서버 틱 시계). ms 해상도라 자가 굵지 않다.
  const gsec = (tkA && tkB) ? (tkB.sim - tkA.sim) : 0;
  // ★교차 검사(굵은 자) — 허기는 정수라 한 점이 19.2초다. 방향과 크기만 본다.
  const rate = B.decayRate(hunA, B.CFG.HUNGER_SEC);                        // ★정본 함수(사본 0)
  const gsecHun = (hunA !== null && hunB !== null && rate > 0) ? (hunA - hunB) / rate : 0;
  const lost = hpA - hpB;
  ok(hunB > B.CFG.DECAY_SPLIT * 100,
    '★③ (상황) 허기가 감쇠율이 꺾이는 문턱 위에 있다 — 환산이 한 구간 안이다',
    `허기 ${hunA} → ${hunB} (문턱 ${B.CFG.DECAY_SPLIT * 100})`);
  ok(gsec > 0, '★★③ (상황) 세계가 실제로 게임분을 적분했다 — 환산의 분모가 0 이 아니다',
    `게임분 ${gsec.toFixed(1)} · 벽시계 ${secs.toFixed(1)}초 (뒤진 몫 ${(secs - gsec).toFixed(2)}초)`);
  //   ★굵은 자로도 같은 말을 하는가 — 허기 한 점이 19.2초이므로 그 폭 안이면 어긋난 게 아니다.
  ok(Math.abs(gsecHun - gsec) <= (1 / rate) + 1,
    '★③ (교차) 허기로 재도 같은 말을 한다(정수 자 · 한 점 = 19.2초)',
    `허기자 ${gsecHun.toFixed(1)}초 vs 틱시계 ${gsec.toFixed(1)}초 (허용 ±${(1 / rate).toFixed(1)}초)`);
  // ★★[T153 2026-09-07] **시계가 하나다.** 종전엔 잘라 낸 몫을 버려서 부하 0 에서도 5.3% 가 뒤졌다
  //   (하루 경계는 벽시계인데 몸은 5% 느린 **두 번째 시계** — T108 족보의 서버 판).
  //   이제 빚을 이월하므로 **적분된 게임분 = 벽시계 ±1%** 여야 한다.
  //   ⚠이 절은 하네스가 잰 두 수만 쓴다 — 서버 계측을 안 믿어도 성립한다(아래 ③-틱이 그걸 따로 본다).
  //   ⚠**적분된 것**과 **셈이 된 것**은 다르다. 창이 닫히는 순간 세계가 아직 못 갚은 빚이 남아 있을 수 있다
  //     (부하 판 실측: 한 틱이 15초 넘게 밀린다). 그 몫은 **잃은 게 아니라 곧 갚을 것**이다.
  //     ⇒ 시계 충실도는 `적분 + 남은 빚` 으로 본다. 그리고 **버린 몫이 0** 이어야 그 말이 참이다(아래 ③-틱).
  //     HP 속도는 위처럼 **적분된 몫**으로만 잰다 — 안 돈 시간에 HP 가 깎일 리 없다.
  const acc = (tkA && tkB) ? ((tkB.sim + tkB.debt) - (tkA.sim + tkA.debt)) : 0;
  const lagPct = 100 * (wallWin - acc) / wallWin;
  ok(Math.abs(lagPct) <= 1.0,
    '★★★③ **세계의 시계가 벽시계와 같이 간다**(틱 빚 이월 — 종전 5.3%)',
    `뒤진 몫 ${lagPct.toFixed(2)}% (셈 ${acc.toFixed(2)}초 = 적분 ${gsec.toFixed(2)} + 남은 빚 ${(tkB ? tkB.debt : 0).toFixed(2)} vs 벽시계 ${wallWin.toFixed(2)}초)`);
  // ★서버 계측(관측자)도 같이 본다 — 하네스의 산수와 세계의 셈이 어긋나면 그게 신호다.
  {
    const tk = tkB;   // ★위에서 이미 읽은 그 값 — 두 번 묻지 않는다(같은 창 안이어야 한다)
    ok(!!tk, '★③-틱 서버가 틱 시계를 내준다(`/perf.tick` · 관측자)', tk ? JSON.stringify({ on: tk.on, dtMax: tk.dtMax, debtMax: tk.debtMax }) : 'null');
    ok(tk && tk.on === true && tk.dtMax === 0.2,
      '★★③-틱 **상한은 그대로 0.2 다** — 이월이 곧 분할 스텝이라 어떤 계도 종전보다 큰 dt 를 안 본다',
      tk ? `dtMax ${tk.dtMax} · 이월 ${tk.on}` : '');
    ok(tk && tk.lagPct !== null && Math.abs(tk.lagPct) <= 1.0,
      '★★③-틱 서버가 센 뒤진 몫도 ±1% 안이다(부팅부터 누적)', tk ? `${tk.lagPct}%` : '');
    ok(tk && tk.clip > 0,
      '★③-틱 (상황) 실제로 **절단이 일어난 판**이다 — 안 그러면 위가 자명 통과다',
      tk ? `절단 ${tk.clip}회 · 잘린 몫 ${(+tk.clipped).toFixed(2)}초 · 최악 간격 ${(+tk.maxGap).toFixed(2)}초` : '');
    ok(tk && tk.dropN === 0,
      '★③-틱 그리고 상한을 넘겨 **버린 몫이 없다**(있으면 로그로 남는다 · `tick_debt_drop`)',
      tk ? `버림 ${tk.dropN}회 · ${(+tk.dropped).toFixed(2)}초` : '');
  }
  ok(lost > 0, '★★③ **물 안 마시면 HP 가 실제로 깎인다**(캐논 변경 — 화면이 그렇게 말한다)',
    `${hpA} → ${hpB} (게임분 ${gsec.toFixed(1)} 에 ${lost}HP)`);
  // ★기대치는 손으로 정하지 않는다 — 역산 표(HP/게임분)에서 그대로 나온다.
  const expect = B.CFG.EXTREME_HP_THIRST * gsec;      // ★게임분 × (HP/게임분)
  ok(Math.abs(lost - expect) <= 2,
    '★★③ 속도가 **역산 표 그대로**다(갈증 극단 최심 = 게임 1.5일에 HP 100)',
    `실측 ${lost}HP vs 표 ${expect.toFixed(2)}HP (게임분 ${gsec.toFixed(1)})`);
  ok(lost <= 9, '★③ 그리고 **아주 천천히**다 — 2분에 몇 점(즉사가 아니다)', `${lost}HP/2분`);
  // 외삽 — 기다리지 않고 "게임 2160분이면 0" 을 확인한다(벽시계가 아니라 **게임분**이 눈금이다)
  const toZeroG = (lost > 0) ? (100 / (lost / gsec)) : Infinity;
  ok(Math.abs(toZeroG - 2160) < 2160 * 0.4,
    '★★③ 외삽하면 **게임 2160분(= 1.5 게임일)**에 HP 100 이 빈다(기다리지 않고 대조)',
    `외삽 ${toZeroG.toFixed(0)} 게임분 vs 표 2160 · 세계가 제 속도로 돌면 실시간 ${(toZeroG / 60).toFixed(1)}분`);
  await snap('thirst-01-drain');

  // ── ④ 물을 마시면 **즉시** 멎는다 · 그리고 다시 아문다 ────────────────────
  const hpBefore = await hpNow();
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 100, thirst: 100, cold: 0, quiet: true }));
  await sleep(2000);
  const stopSeq = await watchHp(12);
  ok(stopSeq.every((x) => x === stopSeq[0]),
    '★★④ 갈증이 채워지면 **감소가 멎는다**(벗어나면 즉시 0 · 이월분도 안 남는다)', JSON.stringify(stopSeq));
  //   ★회복은 화면이 **말하지 않는다**(위 주석) — 그래서 "다시 아물었나"는 **다음 피해 보고**로 읽는다:
  //     아물었다면 다시 목마르게 했을 때 처음 보고되는 HP 가 아까보다 **높아야** 한다.
  await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 100, thirst: 0, cold: 0, quiet: true }));
  let hpAfterHeal = null;
  for (let i = 0; i < 12; i++) { await sleep(5000); const h = await hpNow(); if (h !== null && h !== hpBefore) { hpAfterHeal = h; break; } }
  ok(hpAfterHeal !== null && hpAfterHeal > hpBefore,
    '★★④ 그리고 다시 **아문다** — 무너지는 중에만 회복이 멈춘다(다음 피해 보고가 그걸 말한다)',
    `${hpBefore} → (회복) → ${hpAfterHeal}`);

  // ── ⑤ 마을 안이라고 봐주지 않는다 [§12 · §0-ⓓ] ────────────────────────────
  //   §12 의 "마을 안 불사"는 **쓰러진 뒤** 마을 사람이 옮긴다는 뜻이지 HP 가 안 깎인다는 뜻이 아니다.
  // ★[T140] 같은 픽스처 정본 — 마을이 심길 때까지 기다린다(사본 0).
  const { rows, waited: vWait } = await FX.waitVillages(ZDB);
  ok(rows.length > 0, `마을이 시딩됐다 (${rows.length}곳)`, `${vWait}ms 기다림`);
  if (rows.length) {
    const V = rows[0], vx = V.cx * 32 + 16, vy = V.cy * 32 + 16;
    for (let i = 0; i < 12; i++) {
      await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [vx, vy]);
      await sleep(1200);
      const w = await page.evaluate(() => (window.__wx ? window.__wx() : null));
      if (w && (w.shelter || 0) > 0.5) break;
    }
    const wxV = await page.evaluate(() => (window.__wx ? window.__wx() : null));
    ok(wxV && (wxV.shelter || 0) > 0.5, '★⑤ (상황) 마을 한복판이다 — 완충이 붙었다', `shelter ${wxV && wxV.shelter}`);
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 100, thirst: 0, cold: 0, quiet: true }));
    await sleep(1500);
    const vSeq = await watchHp(75);
    ok(strictlyDrained(vSeq), '★★⑤ **마을 안에서도 목마르면 깎인다** — 불사는 쓰러진 뒤의 이야기다(§12)',
      JSON.stringify(vSeq));
    await snap('thirst-02-village');
  }

  // ── ⑥ 셋 다 극단이면 **쓰러진다** — 현행 downed 경로 진입만 확인(규약은 T43) ──
  //   ★새 픽스처를 만들지 않았다. HP 를 손으로 낮추는 대신 **세 축을 극단으로 두고 실제로 기다린다** —
  //     초당 0.347HP 라 100HP 는 289초다(표에서 나온다). 그게 곧 이 카드의 끝단 실증이다.
  //   ★쓰러짐은 클라 훅이 아니라 **화면**(`#downPanel` 이 열리는가)으로 읽는다(클라 무접촉).
  {
    //   ★★초안이 여기서 틀렸다(족보 ㊻): ① 에서 **한여름 낮**으로 시계를 세워 놨는데 `cold:1` 만
    //     찍어 두고 5분을 기다렸다. 추위는 평형 수렴이라 여름 목표점(≈0)으로 **곧장 내려가** 셋이
    //     아니라 둘만 극단이었고, 그래서 예상보다 한참 덜 깎였다(예상 100HP · 실측 24HP).
    //     ⇒ 세 축을 정말 극단으로 두려면 **가장 추운 해의 한겨울 밤 · 야생 · 맨몸**이어야 한다.
    const WINTER = FX.anchorDays().winter;
    let coldestDay = WINTER, best = -1;
    for (let k = 0; k < 24; k++) {
      const d = WINTER + 365 * k;
      const t = B.coldTarget({ day: d, night: true, warmth: 0, villageShelter: 0 });
      if (t > best) { best = t; coldestDay = d; }
    }
    ok(best > 1, '★⑥ (상황) 24년 중 **목표점이 1 을 넘는 밤**을 골랐다 — 추위가 극단에 머문다',
      `day ${coldestDay} · 목표점 ${best}`);
    const fx6 = await FX.setClock(page, { day: coldestDay, night: true });   // ★[T140] 같은 정본
    ok(fx6.ok, '★⑥ (픽스처) 그 밤으로 시계가 얼었다',
      `day ${coldestDay} · 기대 ${fx6.want.tempC}℃ · 실측 ${fx6.got ? fx6.got.tempC : 'null'}℃ · ${fx6.waited}ms`);
    // 야생으로 — 마을 완충이 있으면 추위가 극단에 못 간다
    let wildOk = false;
    outerWild:
    for (const r of [3000, 8000, 16000, 30000, 60000]) {
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const tx = rows[0].cx * 32 + 16 + dx * r, ty = rows[0].cy * 32 + 16 + dy * r;
        if (tx < 200 || ty < 200) continue;
        await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [tx, ty]);
        await sleep(1200);
        const w = await page.evaluate(() => (window.__wx ? window.__wx() : null));
        if (w && (w.shelter || 0) < 0.01) { wildOk = true; break outerWild; }
      }
    }
    ok(wildOk, '★⑥ (상황) 완충 0 인 야생이다 — 추위가 극단까지 간다');
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_body', hunger: 0, thirst: 0, cold: 1, quiet: true }));
    await sleep(1200);
    const rateAll = B.CFG.EXTREME_HP_HUNGER + B.CFG.EXTREME_HP_THIRST + B.CFG.EXTREME_HP_COLD;
    const hp0 = await hpNow();
    const budget = Math.ceil(hp0 / rateAll) + 45;
    ok(hp0 > 0, '★⑥ (상황) 아직 살아 있다 — 여기서부터 잰다', `HP ${hp0} · 예상 ${Math.round(hp0 / rateAll)}초`);
    let downed = false, hpMin = hp0;
    for (let i = 0; i < budget; i += 3) {
      await sleep(3000);
      const hp = await hpNow();
      if (hp !== null && hp < hpMin) hpMin = hp;
      downed = await page.evaluate(() => {
        const el = document.getElementById('downPanel');
        return !!(el && !el.classList.contains('hidden'));
      });
      if (downed) break;
    }
    ok(downed, '★★⑥ 셋 다 극단이면 **쓰러진다** — HP 0 이 현행 쓰러짐 경로로 이어진다(규약 정리는 T43)',
      `최저 HP ${hpMin} · 쓰러짐 패널 ${downed}`);
    await snap('thirst-03-downed');
  }

  ok(errs.length === 0, '★⑦ 페이지 에러 0', errs.slice(0, 3).join(' | ') || '없음');

  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  console.log(`    스크린샷: ${SHOTS}`);
  await browser.close();
  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
