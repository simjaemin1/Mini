#!/usr/bin/env node
// @regress
// =============================================================================
// e2e — NPC 소체 시트 [재민 확정 2026-09-02 · T13]
//
// 무엇을 지키나:
//   ① 마을 NPC 가 **도형이 아니라 시트**로 그려진다(`__charDbg[pid].on === true`).
//   ② 직업 표식 — `simJob` 이 표에 있으면 그 소품 레이어가 실제로 그려진다.
//      ★표를 여기 **다시 적지 않는다** — `40-r2-sprites.js` 소스에서 읽는다(사본 금지).
//   ③ NPC 는 **걷기·서기 둘만** 쓴다(달리기 클램프) — clip ∈ {idle, walk}.
//   ④ 방향이 이동에서 나온다 — 여러 NPC 의 시트 행이 한 값으로 굳어 있지 않다.
//   ⑤ ★폴백 — 플래그를 끄면 시트로 안 그린다(도형 경로가 살아 있다).
//   ⑥ ★비용 — **NPC 가 화면에 있는 채로** 같은 순간 짝 비교. ON vs OFF 프레임 간격.
//   ⑦ 콘솔 오류 0.
//
// ★두 번 띄운다: 1차는 **어느 마을이 심겼는지 묻기 위해서만**(`/lifedbg`), 2차는 그 마을 광장에
//   `mainSquare` 를 붙여 놓고 판정한다. 마을 좌표를 하네스가 지어내지 않게 하는 값이다(족보 74).
// 포트 3010/3020 공용 — E2E 동시 실행 금지.
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const HEADED = process.argv.includes('--headed');
const SHOTS = '/tmp/e2e-npcsprite-shots';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
// ★인자 순서는 `e2e-charsprite` 와 **같다**(cond, name, detail).
//   ⚠첫 작성에서 이걸 반대로 적었다 — 그랬더니 **이름 문자열이 조건**이 돼
//   22개 판정이 전부 공짜로 통과했다(‘✓ false’ 가 두 줄 찍혔는데 그게 증거다).
//   ★이 레포가 금지하는 **자명 통과**를 하네스 자신이 범한 것이다. 기록으로 남긴다.
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); }
}
const procs = [];
function boot(tag, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/Error/i.test(s)) process.stdout.write(`  [${tag}] ` + s.slice(0, 140)); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }

// 존을 감싸 mainSquare 를 갈아 끼운다(e2e-mtfoot 과 같은 문법 — 자산·서버 무접촉).
const WRAP = '/tmp/zone-wrap-npcspr.js';
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

const ZENV = {
  PORT: String(ZPORT), ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CPORT}`,
  CHAR_SPRITE: 'on', E2E_GIVE: '1',
  ENABLE_VILLAGES: '1', VILLAGE_MAX: '1', VILLAGE_DAY_MS: '500',
  ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
};

(async () => {
  console.log('\n=== NPC 소체 시트 실클라 E2E (Chromium) ===');
  // ★★DB 를 **매번 새로** 만든다. 안 그러면 판마다 세계가 달라진다 —
  //   실측: 남은 DB 로 돌린 판에서 마을 직업이 hunter 24명 → hunter·mason·forager → 0명으로 널뛰었고,
  //   그건 제품이 아니라 **하네스가 같은 세계를 안 세운 것**이었다(없는 결함을 세 번 보고할 뻔했다).
  for (const f of ['/tmp/npcspr-c.db', '/tmp/npcspr-z.db', '/tmp/npcspr-c2.db', '/tmp/npcspr-z2.db'])
    for (const s of ['', '-journal', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }

  // ── 1차 기동 — 심긴 마을과 그 주민 자리를 **서버에게 묻는다** ────────────────
  boot('central', path.join(ROOT, 'server', 'central.js'),
       { PORT: String(CPORT), DB_PATH: '/tmp/npcspr-c.db', PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone0', path.join(ROOT, 'server', 'zone.js'), { ...ZENV, DB_PATH: '/tmp/npcspr-z.db' });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동(1차 — 마을 묻기)');

  let vil = null;
  for (let i = 0; i < 90 && !vil; i++) {
    try {
      const j = await (await fetch(`http://localhost:${ZPORT}/lifedbg`)).json();
      const rows = Array.isArray(j) ? j : (j.villages || []);
      for (const r of rows) {
        const pts = (r.sample || []).filter((x) => x && typeof x.x === 'number');
        if (!pts.length) continue;
        // ★한 주민의 **지금 자리**가 아니라 표본의 **중앙값**을 쓴다 — 주민은 걸어 다니므로
        //   한 명을 집으면 판마다 광장이 수백 px 씩 옮겨 다닌다(그러면 화면에 아무도 없는 판이 나온다).
        const md = (a) => { const s2 = a.slice().sort((p, q2) => p - q2); return s2[s2.length >> 1]; };
        vil = { name: r.name || r.v || '?', x: Math.round(md(pts.map((p) => p.x))), y: Math.round(md(pts.map((p) => p.y))),
                pop: r.pop || pts.length, n: pts.length };
        break;
      }
    } catch (e) {}
    if (!vil) await sleep(2000);
  }
  ok(!!vil, '★서버가 심긴 마을과 주민 자리를 알려 준다(/lifedbg — 하네스가 좌표를 지어내지 않는다)',
     vil ? `${vil.name} @ (${vil.x},${vil.y})` : '못 받음');
  if (!vil) { killAll(); console.log(`\n=== e2e-npcsprite 결과: 통과 ${pass} · 실패 ${fail} ===`); process.exit(1); }
  killAll();
  await sleep(3000);

  // ── 2차 기동 — 그 자리를 광장으로 삼는다 ────────────────────────────────────
  boot('central', path.join(ROOT, 'server', 'central.js'),
       { PORT: String(CPORT), DB_PATH: '/tmp/npcspr-c2.db', PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', WRAP, { ...ZENV, DB_PATH: '/tmp/npcspr-z2.db',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: vil.x, y: vil.y, name: vil.name } }) });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동(2차)');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동(2차 — 마을 광장 스폰)');
  await sleep(6000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('button:has-text("월드 입장")');
  if (enter) await enter.click();
  for (let i = 0; i < 80 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  ok(!!(await page.evaluate(() => window.__getMyAbs && window.__getMyAbs())), '월드 입장');
  await sleep(6000);

  // ── ⓐ 화면 안 NPC 수 — 프레임 비용 예산의 분모 ─────────────────────────────
  console.log('\n=== ⓐ 화면 안 NPC 수 (비용 예산의 분모) ===');
  const npcCount = async () => page.evaluate(() => (window.__getNpcs ? window.__getNpcs().length : 0));
  const samples = [];
  for (let i = 0; i < 10; i++) { samples.push(await npcCount()); await sleep(600); }
  const nAvg = samples.reduce((a, b) => a + b, 0) / samples.length, nMax = Math.max(...samples);
  console.log(`    표본 ${samples.join(',')}  → 평균 ${nAvg.toFixed(1)} · 최대 ${nMax}`);
  ok(nMax >= 1, `마을 광장에 NPC 가 보인다 (평균 ${nAvg.toFixed(1)} · 최대 ${nMax})`, `${vil.name} pop=${vil.pop}`);

  // ── ① NPC 가 시트로 그려진다 ────────────────────────────────────────────────
  console.log('\n=== ① NPC 가 도형이 아니라 시트로 그려진다 ===');
  const dbgNpc = async () => page.evaluate(() =>
    Object.entries(window.__charDbg || {}).filter(([, v]) => v && v.job)
      .map(([pid, v]) => ({ pid, on: !!v.on, clip: v.clip, row: v.row, job: v.job, layers: (v.layers || []).slice() })));
  // ★한 번만 읽지 마라 — `__charDbg` 는 **그 프레임에 실제로 그린** NPC 만 채운다(시야·컬링).
  //   한 판 읽고 끝내면 화면에 24명인데 2명만 본 채로 판정하게 된다(1차 실행이 그랬다).
  //   ⇒ 여러 판을 **누적**해서 본다 — pid 로 합친다.
  const acc = new Map();
  for (let k = 0; k < 24; k++) { for (const s of await dbgNpc()) acc.set(s.pid, s); await sleep(300); }
  let seen = [...acc.values()];
  ok(seen.length >= 1, `NPC ${seen.length}명이 시트 경로를 탔다`, seen.slice(0, 3).map((s) => `${s.job}:${s.clip}`).join(' · '));
  ok(seen.length >= 1 && seen.every((s) => s.on), '★전원 `on:true` — 반쪽 합성·투명 NPC 없음',
     seen.filter((s) => !s.on).map((s) => s.job).join(',') || '실패 0');
  ok(seen.every((s) => s.layers[0] === 'body' && s.layers[1] === 'clothes_hemp'),
     '★몸+삼베가 언제나 앞 두 장 — 알몸 금지·순서 계약(몸→옷→도구)',
     seen[0] ? seen[0].layers.join('+') : '');

  // ── ② 직업 표식 — 표는 **소스에서 읽는다**(사본 금지) ───────────────────────
  console.log('\n=== ② 직업 표식 — 손에 든 것으로 가른다 ===');
  const src = fs.readFileSync(path.join(ROOT, 'public', 'client', '40-r2-sprites.js'), 'utf8');
  const tbl = {};
  {
    const m = /const NPC_JOB_TOOL = \{([\s\S]*?)\};/.exec(src);
    ok(!!m, '★표를 소스에서 읽었다 — 하네스가 표를 베끼지 않는다', m ? '' : '정규식 불일치(표가 옮겨졌나)');
    if (m) for (const line of m[1].split('\n')) {
      const mm = /^\s*(\w+)\s*:\s*'([\w_]+)'/.exec(line);
      if (mm) tbl[mm[1]] = mm[2];
    }
  }
  console.log(`    표: ${Object.entries(tbl).map(([k, v]) => k + '→' + v).join(' · ')}`);
  ok(Object.keys(tbl).length >= 3, `표에 직업 ${Object.keys(tbl).length}종`);

  // ★★전제부터 판정한다 — **마을에 표 직업이 있는가**(서버 진실 `__getNpcs`).
  //   없으면 아래 판정은 무엇을 해도 공짜다. 그리고 실제로 그런 판이 나온다:
  //   그리는 것은 화면 안 전원이 아니라 **시야에 든 몇 명**뿐이라(컬링), 어떤 직업이 눈에
  //   들어오느냐가 판마다 다르다(1차 실행 farmer 1명 · 2차 hunter·mason 뿐).
  const worldJobs = await page.evaluate(() => (window.__getNpcs ? window.__getNpcs().map((n) => n.job) : []));
  const worldTbl = worldJobs.filter((j) => tbl[j]);
  console.log(`    마을 직업 분포(서버): ${[...new Set(worldJobs)].join(', ')}  (표 직업 ${worldTbl.length}/${worldJobs.length}명)`);
  ok(worldTbl.length >= 1, '②-a ★전제 — 이 마을에 표 직업 NPC 가 실제로 산다',
     `표 직업 ${worldTbl.length}명 [${[...new Set(worldTbl)].join(',')}]`);

  // 그 직업이 **그려질 때까지** 기다린다(컬링 때문에 한 판만 보면 놓친다).
  let marked = [], plain = [];
  for (let k = 0; k < 90; k++) {
    for (const s of await dbgNpc()) acc.set(s.pid, s);
    const all = [...acc.values()];
    marked = all.filter((s) => tbl[s.job]);
    plain = all.filter((s) => !tbl[s.job]);
    if (marked.length >= 1) break;
    await sleep(400);
  }
  ok(marked.length >= 1, '②-b ★표 직업 NPC 가 실제로 그려지는 것을 봤다(위 판정이 공짜가 아니다)',
     `표 직업 ${marked.length}명 · 표 밖 ${plain.length}명 · 그린 직업 [${[...new Set([...acc.values()].map((s) => s.job))].join(',')}]`);
  ok(marked.length >= 1 && marked.every((s) => s.layers[2] === tbl[s.job]),
     `★표에 있는 직업은 그 소품을 든다 (${marked.length}명)`,
     marked.slice(0, 4).map((s) => `${s.job}=${s.layers[2] || '없음'}`).join(' · '));
  // ⚠"맨손"은 **그려진 것 중에** 표 밖 직업이 있으면 그것이 2장인지를 묻는 성질 판정이다.
  //   "표 밖 직업을 꼭 봐야 한다"로 만들면 안 된다 — 마을에 한 명뿐인 직업(실측: tailor 1/24)이
  //   그 판에 시야에 안 들어오는 것은 흔한 일이고, 그건 제품이 아니라 **표본**이다.
  //   ⇒ 이 절이 공짜가 아니라는 증명은 위 ②-b 가 이미 한다(표 직업이 실제로 그려지는 것을 봤다).
  const worldPlain = worldJobs.filter((j) => !tbl[j]);
  console.log(`    표 밖 직업 — 마을에 ${worldPlain.length}명 · 이번에 그려진 것 ${plain.length}명`);
  ok(plain.every((s) => s.layers.length === 2),
     `★표에 없는 직업은 맨손 (그린 ${plain.length}명 검사)`,
     plain.slice(0, 3).map((s) => `${s.job}:${s.layers.length}장`).join(' · ') || '이번 판에 표 밖 직업이 안 그려졌다(성질은 성립)');
  seen = [...acc.values()];

  // ── ③ 걷기·서기 둘만 ────────────────────────────────────────────────────────
  console.log('\n=== ③ NPC 는 걷기·서기 둘만 쓴다(달리기 클램프) ===');
  const clips = new Set();
  for (let k = 0; k < 24; k++) { for (const s of await dbgNpc()) clips.add(s.clip); await sleep(350); }
  console.log(`    본 클립: ${[...clips].join(', ')}`);
  ok([...clips].every((c) => c === 'idle' || c === 'walk'), '★clip ∈ {idle, walk}', [...clips].join(','));
  ok(clips.has('walk'), '★걷는 NPC 를 실제로 봤다(idle 만 보고 통과하지 않는다)');

  // ── ④ 방향이 이동에서 나온다 ────────────────────────────────────────────────
  console.log('\n=== ④ 방향 — 시트 행이 한 값에 굳어 있지 않다 ===');
  const rows = new Set();
  for (let k = 0; k < 20; k++) { for (const s of await dbgNpc()) rows.add(s.row); await sleep(400); }
  ok(rows.size >= 2, `시트 행 ${rows.size}종 관측 — 방향이 이동 벡터에서 나온다`, [...rows].sort().join(','));
  await page.screenshot({ path: path.join(SHOTS, 'npc-01-village.png') });

  // ── ⑥ 비용 — NPC 가 화면에 있는 채로 짝 비교 ────────────────────────────────
  console.log('\n=== ⑥ 비용 — 같은 순간 짝 비교(ON vs OFF · NPC 화면에 둔 채) ===');
  const measure = async (on) => page.evaluate(async (flag) => {
    if (window.__setCharSprite) window.__setCharSprite(flag);
    const t = [];
    await new Promise((res) => {
      let n = 0, last = performance.now();
      const step = () => { const now = performance.now(); t.push(now - last); last = now;
        if (++n >= 120) return res(); requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    t.sort((a, b) => a - b);
    return { med: +t[Math.floor(t.length / 2)].toFixed(2), p90: +t[Math.floor(t.length * 0.9)].toFixed(2) };
  }, on);
  const nAtPerf = await npcCount();
  const on1 = await measure(true), off1 = await measure(false);
  const on2 = await measure(true), off2 = await measure(false);
  await measure(true);
  const onMed = (on1.med + on2.med) / 2, offMed = (off1.med + off2.med) / 2;
  const pct = 100 * (onMed - offMed) / Math.max(0.01, offMed);
  console.log(`    NPC ${nAtPerf}명 · ON ${on1.med}/${on2.med}ms · OFF ${off1.med}/${off2.med}ms  (p90 ON ${on1.p90} · OFF ${off1.p90})`);
  console.log(`    ⇒ 평균 ON ${onMed.toFixed(2)}ms vs OFF ${offMed.toFixed(2)}ms = ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`);
  ok(pct <= 10, `★프레임 비용 증가 ${pct.toFixed(1)}% ≤ 10% (T13 카드 조건 · NPC ${nAtPerf}명)`,
     pct > 10 ? '넘었다 — 표시 거리/캐시로 줄이거나 값만 보고하고 회부' : '');

  // ── ⑤ 폴백 — 끄면 시트로 안 그린다 ─────────────────────────────────────────
  console.log('\n=== ⑤ 폴백 — 플래그를 끄면 도형 경로로 돌아간다 ===');
  // ⚠훅을 **비우고** 잰다 — 플래그가 꺼지면 `drawCharSprite` 는 첫 줄에서 false 를 내고
  //   훅을 갱신하지 않는다. 안 비우면 **낡은 on:true 가 남아** "폴백이 안 된다"고 거짓 보고한다
  //   (1차 실행에서 실제로 12명이 그렇게 읽혔다 — 제품이 아니라 관측이 틀린 것이었다).
  await page.evaluate(() => { window.__setCharSprite && window.__setCharSprite(false); window.__charDbg = {}; });
  await sleep(1500);
  const offSeen = await page.evaluate(() =>
    Object.values(window.__charDbg || {}).filter((v) => v && v.job && v.on === true).length);
  ok(offSeen === 0, '★OFF 에서 시트로 그린 NPC 0명 — 폴백이 살아 있다', `${offSeen}명`);
  await page.evaluate(() => { window.__setCharSprite && window.__setCharSprite(true); window.__charDbg = {}; });
  // ★여기도 폴링이다 — 훅은 **그린 프레임에만** 채워진다. 그리고 **NPC 로 재지 않는다**:
  //   이 지점은 하네스가 2분쯤 돈 뒤라 주민이 시야 밖으로 걸어 나갔을 수 있고(실측: 0명이 두 번),
  //   그러면 "손잡이가 안 돌아왔다"가 아니라 **아무도 안 보인다**를 재게 된다.
  //   ⇒ 플래그가 돌아왔는지는 **언제나 그려지는 본인**으로 잰다.
  let onAgain = 0;
  for (let k = 0; k < 30; k++) {
    onAgain = await page.evaluate(() => Object.values(window.__charDbg || {}).filter((v) => v && v.on).length);
    if (onAgain >= 1) break;
    await sleep(400);
  }
  ok(onAgain >= 1, '★다시 켜면 돌아온다(플래그가 진짜 손잡이다 — 본인으로 잰다)', `${onAgain}명`);

  console.log('\n=== ⑦ 콘솔 오류 ===');
  const real = errs.filter((x) => !/favicon|404 \(Not Found\)/.test(x));
  ok(real.length === 0, '페이지 오류 0 (favicon 404 제외)', real.slice(0, 2).join(' | '));

  await browser.close();
  killAll();
  console.log(`\n    스크린샷: ${SHOTS}`);
  console.log(`\n=== e2e-npcsprite 결과: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 예외:', e); killAll(); process.exit(1); });
