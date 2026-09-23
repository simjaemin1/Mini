#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-nippon-boot.js — 둘째 존이 실제로 산다 (T343·T348·T351·T360·T373) ===
//
// ★왜 [T343 2026-09-21]
//   T336 이 잰 것: `ZONE_ID=nippon` 은 **오류 0 으로 뜨는데 아무 일도 안 났다**
//   (`/health` 가 `villages: null` · `[seed]` 줄조차 없다). 막던 것은 `villages.js` 의
//   `if (ZONE_ID !== 'hanbando') return;` 한 줄이었다. **오류를 안 내는 결함**이라
//   부팅 로그를 아무리 봐도 안 보인다 — 그래서 자가 필요하다(족보 130).
//
// ★이 자가 재는 것은 **둘**이고, 둘을 섞지 않는다:
//   ⓐ~ⓓ **후보 정본** — 값싸다(부팅 0). "한반도가 한 칸도 안 바뀐다"를 **같은 배열 객체**로 증명한다.
//   ⓔ~ⓗ **실서버** — 비싸다(존 하나 부팅). 계약이 있는지가 아니라 **도는지**를 본다
//         (`test-psite-server ⑨` 와 같은 문법: 소스 검사와 실행 검사는 다른 것을 잰다).
//
// ★[T348 추가] ⓕ 다리 · ⓖ 광맥 — T343 이 "결손"으로 적은 둘.
//   ⓕ 의 본선은 "다리를 놓았다"가 아니라 **"교역 격자가 그 다리를 본다"**(`다리구제 > 0`)다.
//   T348 1차 판이 정확히 그 자리에서 틀렸다: 계획기가 서버와 다른 물을 보고 뽑은 다리를 놓았더니
//   셀은 선언됐는데 `다리구제 0` 이고 도달 쌍이 **한 쌍도 안 늘었다**. 선언은 판정이 아니다.
//
// ★[T351] 닛폰 후보가 **정본 칸에 적혔다**(16곳) — 그래서 ⓑ 가 재는 것이 바뀌었다:
//   닛폰은 이제 한반도와 **같은 갈래**(정본 칸을 그대로)고, 둘째 갈래(절차 배치기)는
//   **아직 빈 존**으로 잰다. 둘 다 살아 있어야 다음 존이 같은 길로 선다.
//   ⓘ 가 "적어도 세계가 안 바뀐다"를 실서버 수로 잰다(적는 일이 세계를 움직이면 그건 옮겨 적기가 아니다).
//
// ★[T360] ⓙ — **닛폰이 한 덩어리다.** T348 이 "대양 분리"라 부른 것은 바다가 아니라
//   계획기의 **탐색 모양**이었다(본토 직행 광선만 봤다). 사람이 안 사는 뭍을 디딤돌로 쓰면
//   16+5+11칸이면 닿는다 — 다리 셋을 놓아 도달불능 12쌍 → **0쌍**.
//
// ★★자명 통과 금지 — 이 자는 "마을이 0곳인데 오류도 0" 을 **초록으로 읽지 않는다.**
//   전제를 먼저 건다: 시딩 줄이 실제로 찍혔나 · econ 인구가 0보다 큰가 · 후보가 실제로 있었나.
//   그게 없으면 아래 판정은 아무것도 안 잰 것이다(T336 이 잡은 그 상태가 정확히 "조용한 0" 이었다).
//
// 실행: node scripts/test-nippon-boot.js
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const ZID = 'nippon';

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ★고정 포트를 안 쓴다 — 앞 하네스가 쥐고 있으면 자식이 조용히 죽고 **남의 서버**를 재게 된다
//   (`test-guest-rejoin` 머리의 T10-① 가 그 병을 값비싸게 배웠다. 같은 처방을 그대로 쓴다.)
function portFree(port) {
  return new Promise((res) => {
    const s = net.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function pickPorts() {
  const base = 36000 + ((process.pid * 2) % 6000);
  for (let i = 0; i < 500; i++) {
    const c = base + i * 2, z = c + 1;
    if (await portFree(c) && await portFree(z)) return [c, z];
  }
  throw new Error('빈 포트 쌍을 못 찾았다');
}

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  // ★로그를 **버리지 않고 모은다** — 이 자의 판정 절반이 로그에서 나온다(오류 0 · 시딩 줄).
  p._name = name; p._out = ''; p._err = ''; p._died = null;
  p.stdout.on('data', (b) => { p._out += String(b); });
  p.stderr.on('data', (b) => { p._err += String(b); });
  p.on('exit', (code, sig) => { p._died = `code=${code} sig=${sig}`; });
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);

async function waitUp(p, url, tries = 300) {
  for (let i = 0; i < tries; i++) {
    if (p._died) {
      console.log(`      [${p._name}] 떠보지도 못하고 죽었다 (${p._died})`);
      const tail = (p._err || '').trim().split('\n').filter(Boolean).slice(-4).join(' | ');
      if (tail) console.log(`      stderr: ${tail.slice(0, 300)}`);
      return false;
    }
    try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch (e) {}
    await sleep(1000);
  }
  return false;
}

(async () => {
  console.log('\n=== 둘째 존이 실제로 산다 — 닛폰 부팅 (T343) ===');

  // ── ⓐ 후보 정본은 문 하나다 · 한반도는 한 칸도 안 바뀐다 ─────────────────────
  console.log('\n[ⓐ 후보 정본 — terrain.siteCandidates]');
  const T = require(path.join(ROOT, 'server', 'terrain'));
  const ZONES0 = require(path.join(ROOT, 'server', 'zone-config')).ZONES;
  const hbHard = T.getZoneVillages('hanbando');
  const hbCand = T.siteCandidates('hanbando');
  ok(Array.isArray(hbHard) && hbHard.length > 0, 'ⓐ0 전제: 한반도는 정본 json 에 찍어 둔 마을 칸이 있다(자명 통과 방지)',
    `${(hbHard || []).length}곳`);
  // ★**같은 배열 객체**여야 한다. "길이가 같다"로는 부족하다 — 베껴서 같은 수를 내는 것도 통과한다(사본 0).
  ok(hbCand === hbHard, 'ⓐ ★한반도 후보는 **그 칸 그대로**다 — 사본도 재계산도 아니다(같은 배열 객체)',
    hbCand === hbHard ? `${hbCand.length}곳 · 동일 객체` : '다른 객체');

  // ★★[T351] 닛폰은 이제 **첫 갈래**다 — 후보가 정본 칸에 적혔다(종전엔 0곳이라 둘째 갈래로 돌았다).
  //   그래서 이 절이 재는 것이 바뀐다: "둘째 갈래가 산다"는 **아직 빈 존**으로 재고,
  //   닛폰은 "정본 칸을 그대로 돌려준다"로 잰다(한반도와 같은 판정 · ⓐ 와 같은 `===`).
  console.log('\n[ⓑ 후보 문 두 갈래 — 적힌 존 · 아직 빈 존]');
  const npHard = T.getZoneVillages(ZID);
  const npCand = T.siteCandidates(ZID);
  ok(Array.isArray(npHard) && npHard.length > 0, 'ⓑ0 ★닛폰 후보가 **정본 칸에 적혀 있다**(T351 — 종전 0곳)',
    `${(npHard || []).length}곳`);
  ok(npCand === npHard, 'ⓑ0b ★그 칸을 **그대로** 돌려준다(사본도 재계산도 아니다 · 한반도와 같은 갈래)',
    npCand === npHard ? `${(npCand || []).length}곳 · 동일 객체` : '다른 객체');
  // ★둘째 갈래(절차 배치기)는 **아직 빈 존**으로 잰다 — 살아 있어야 다음 존이 같은 길로 선다.
  const emptyZ = Object.keys(ZONES0).find((z) => !ZONES0[z].isOcean && !(T.getZoneVillages(z) || []).length);
  ok(!!emptyZ, 'ⓑ0c 전제: 정본 칸이 아직 빈 육지 존이 있다(없으면 아래가 자명 통과다)', emptyZ || '(없음)');
  const emptyCand = emptyZ ? (T.siteCandidates(emptyZ) || []) : [];
  ok(emptyCand.length > 0, 'ⓑ0d ★둘째 갈래가 살아 있다 — 빈 존도 절차 배치기가 후보를 낸다',
    emptyZ ? `${emptyZ} ${emptyCand.length}곳` : '-');
  ok(Array.isArray(npCand) && npCand.length > 0, 'ⓑ 닛폰에도 후보가 선다', `${(npCand || []).length}곳`);
  // ★꼴이 같아야 고르는 자(pickSeedVillages)·세우는 자(seedVillages)가 갈래를 모른다.
  const TYPES = new Set(['plain', 'riverside', 'forest', 'mining']);
  const shapeBad = (npCand || []).filter((v) => !(v && typeof v.name === 'string' && Number.isFinite(v.x) && Number.isFinite(v.y) && TYPES.has(v.type)));
  ok(shapeBad.length === 0, 'ⓑ2 두 길의 **꼴이 같다** — {name,x,y,type} · 타입은 한반도가 쓰는 넷 안',
    shapeBad.length ? JSON.stringify(shapeBad[0]) : `${npCand.length}곳 전부`);
  // ★결정론 — 같은 존을 두 번 물으면 같은 답이다(존 하나당 villageSeed).
  const npCand2 = T.siteCandidates(ZID);
  ok(JSON.stringify(npCand) === JSON.stringify(npCand2), 'ⓑ3 두 번 물어도 같은 답이다(존 하나당 결정론 · 판마다 다른 세계 0)');

  console.log('\n[ⓚ 섬 수가 정직하다 — T373]');
  // ★★T348·T360 이 닛폰을 "대양 분리 4섬"이라 보고했는데 그 넷은 **플러드 0셀**이었다 —
  //   후보가 물(또는 바위) 위에 앉아 설 자리가 한 칸도 없는 것이지 **섬이 아니다**.
  //   세계엔 무해하다(`findOpenCenter` 가 스킵한다). 거짓말을 하는 것은 **보고 수**뿐이고,
  //   그래서 사람이 없는 바다를 걱정하게 된다. ⇒ 계획기가 그것을 섬에서 뺀다.
  const PBV = fs.readFileSync(path.join(ROOT, 'scripts', 'plan-bridges-v2.js'), 'utf8');
  ok(/if \(!f\.n\) \{\s*drySkip\.push/.test(PBV),
    'ⓚ 계획기가 **플러드 0셀 후보를 섬에서 뺀다**(0셀은 섬이 아니라 설 자리가 없는 곳)');
  ok(/drySkip\.length \? /.test(PBV), 'ⓚ2 그 수를 **따로 센다**(조용히 지우지 않는다 — 없앤 게 아니라 이름이 다른 것이다)');
  // ★말만 보지 않는다 — 그런 자리가 **실재하는지** 정본 술어로 직접 잰다(자명 통과 방지).
  const noStand = (npCand || []).filter((v) => {
    try { return T.isWaterCellLocal(ZID, v.x, v.y) || T.isRockCellLocal(ZID, v.x, v.y); } catch (e) { return false; }
  });
  ok(noStand.length > 0, 'ⓚ3 전제: 닛폰에 **설 자리가 없는 후보가 실제로 있다**(0이면 위가 자명 통과다)',
    `${noStand.length}곳 — ${noStand.map((v) => v.name).join(', ')}`);

  console.log('\n[ⓒ 바다 존은 스스로 빠진다 — 새 게이트 0]');
  const ZONES = ZONES0;
  const oceans = Object.keys(ZONES).filter((z) => ZONES[z].isOcean);
  ok(oceans.length > 0, 'ⓒ0 전제: 바다 존이 실제로 있다', `${oceans.length}개`);
  const oceanNonZero = oceans.filter((z) => (T.siteCandidates(z) || []).length > 0);
  ok(oceanNonZero.length === 0, 'ⓒ 바다 존 후보는 전부 0곳 — 존 이름 조건을 새로 안 써도 빠진다',
    oceanNonZero.length ? oceanNonZero.join(',') : `${oceans.length}개 전부 0`);

  console.log('\n[ⓓ 존 이름 게이트가 사라졌다]');
  const VIL = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  // 주석이 아닌 줄에서만 찾는다 — 주석은 왜 지웠는지를 적어 두는 자리다(족보 207).
  const codeLines = VIL.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
  const gate = codeLines.filter((l) => /ZONE_ID\s*!==\s*['"]hanbando['"]/.test(l));
  ok(gate.length === 0, 'ⓓ `ZONE_ID !== \'hanbando\'` 조기 반환이 코드에 없다', gate.length ? gate[0].trim().slice(0, 80) : '0건');
  ok(/terrain\.siteCandidates\(/.test(VIL), 'ⓓ2 시딩이 후보를 **정본 문**으로 묻는다(사본 0)');

  // ── ⓔ 실서버 — 계약이 아니라 **도는지** ─────────────────────────────────────
  console.log('\n[ⓔ 실서버 — ZONE_ID=nippon 으로 실제로 띄운다]');
  const [CPORT, ZPORT] = await pickPorts();
  const CDB = `/tmp/nb-central-${process.pid}.db`, ZDB = `/tmp/nb-zone-${process.pid}.db`;
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

  const cp = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZID });
  // ★★[T349 2026-09-21] **여기는 맹목 잠이 아니었다 — 지역 사본이었다**(T344 의 린트 표가 잘못 묶었다).
  //   이 파일들엔 `waitUp(child, url)` 이라는 **같은 이름의 다른 함수**가 있었다. 아이의 죽음(`_died`)을
  //   보는 점은 정본과 같지만 **성공 판정은 여전히 포트 응답**이라 경주가 남는다:
  //   한 바퀴 안에서 `_died` 는 아직 안 찍혔는데(exit 이벤트가 다음 틱) `fetch` 가 **앞 판 central** 에게
  //   200 을 받으면 "떴다"가 된다. ⇒ 정본 하나로 모은다(사본 0 · 증인은 아이가 제 입으로 찍는 줄).
  //   ⚠듣기는 **띄운 그 틱에** 시작한다 — `await` 만 아래로 내린다.
  const _upP = FB.waitUp(cp, /central server up on/, { name: 'central' });
  const _up = await _upP;
  const cUp = _up.ok;
  ok(cUp, 'ⓔ0 central 기동', cUp ? `${_up.ms}ms · 아이가 제 입으로 말했다` : _up.why);
  const zp = boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: ZID, DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
  });
  ok(await waitUp(zp, `http://localhost:${ZPORT}/health`), 'ⓔ1 닛폰 존 기동');

  // ★생활층은 기동 **뒤에** 선다(시딩 → 장부 → 거리행렬 → 시뮬 준비). 그 마지막 줄을 기다린다 —
  //   고정 sleep 으로 읽으면 느린 상자에서 "안 섰다"는 **없는 결함**을 보고한다(족보 ㊽).
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) { ready = /마을 시뮬 준비/.test(zp._out) || /시뮬 비활성/.test(zp._out); await sleep(1000); }
  const LOG = zp._out;

  // 전제 셋 — 이게 거짓이면 아래는 아무것도 안 잰다
  ok(/마을 시딩 시작 — 후보 (\d+)/.test(LOG), 'ⓔ2 전제: 시딩이 **실제로 돌았다**(종전엔 이 줄이 아예 없었다)',
    (LOG.match(/마을 시딩 시작 — [^\n]*/) || [''])[0]);
  const mSeeded = LOG.match(/마을 시딩 완료 — 후보 (\d+) → 선별 (\d+) → \*\*시딩 (\d+)\*\*/);
  ok(!!mSeeded, 'ⓔ3 전제: 시딩 완료 줄이 찍혔다', mSeeded ? mSeeded[0] : '(없음)');
  const mSim = LOG.match(/마을 시뮬 준비: 마을 (\d+), econ 인구 (\d+)/);
  ok(!!mSim, 'ⓔ4 전제: 생활층이 깨어났다(마을 시뮬 준비)', mSim ? mSim[0] : '(없음 — 조용한 0)');

  // 본 판정
  const h = await (await fetch(`http://localhost:${ZPORT}/health`)).json();
  ok(typeof h.villages === 'number' && h.villages >= 1,
    'ⓔ ★★닛폰에 마을이 **선다** — `/health villages ≥ 1`(T336 엔 `null` 이었다)', `villages=${h.villages}`);
  ok(!!mSim && (+mSim[2]) > 0, 'ⓔ5 econ 인구가 0보다 크다(마을이 이름만 있는 게 아니다)', mSim ? `${mSim[2]}명` : '-');
  ok(/사건 장부/.test(LOG), 'ⓔ6 사건 장부가 섰다(소문·게시판이 먹고 사는 것)',
    (LOG.match(/사건 장부[^\n]*/) || [''])[0].slice(0, 90));
  ok(/교역 BFS 거리행렬/.test(LOG), 'ⓔ7 교역 거리행렬이 섰다',
    (LOG.match(/교역 BFS 거리행렬[^\n]*/) || [''])[0].slice(0, 120));

  // ★오류 0 — 부팅 전체를 본다. 이 자가 지키는 본선이다.
  const errLines = LOG.split('\n').filter((l) => /(^|\s)(Error|TypeError|ReferenceError)\b|\bfatal\b|Cannot read|is not a function/.test(l));
  ok(errLines.length === 0, 'ⓔ8 ★부팅 로그 오류 0', errLines.length ? errLines.slice(0, 2).join(' | ').slice(0, 200) : '');
  // ★★[이 자의 1차 판이 스스로 틀렸다 — 적어 둔다] 종전엔 "stderr 가 비어 있다"를 걸었다.
  //   그런데 stderr 는 예외만 오는 관이 아니다 — `console.warn` 이 거기로 간다. 그래서
  //   **제품이 옳게 일한 줄**이 빨강이 됐다: `[이즈사키] 주변 24셀 내 뭍 없음 — 스킵`.
  //   그건 품질 기준이 아니라 **물리**다(물 위엔 마을을 못 세운다 · 한반도도 어촌6 을 그렇게 건너뛴다).
  //   ⇒ 재는 것을 바로 잡는다: stderr 에서 보는 것은 **예외의 자취**(스택 프레임·Error 꼴)뿐이다.
  //   (족보 156/170 — 빨강을 보면 자를 먼저 의심하라.)
  const errTail = (zp._err || '').split('\n');
  const errReal = errTail.filter((l) => /^\s+at\s+\S/.test(l) || /(^|\s)(Error|TypeError|ReferenceError)\b|Cannot read|is not a function/.test(l));
  ok(errReal.length === 0, 'ⓔ9 stderr 에 예외 자취(스택 프레임·Error)가 없다', errReal.slice(0, 2).join(' | ').slice(0, 200));
  // ★물 위 스킵은 **결함이 아니라 물리**다 — 났다면 났다고 세고, 안 났어도 통과다(각본 0).
  const skips = LOG.split('\n').concat(errTail).filter((l) => /주변 24셀 내 뭍 없음 — 스킵/.test(l));
  ok(!mSeeded || (+mSeeded[2] - +mSeeded[3]) === skips.length,
    'ⓔ10 선별−시딩 차이가 **물 위 스킵 수와 맞는다**(조용히 사라진 마을 0)',
    mSeeded ? `선별 ${mSeeded[2]} − 시딩 ${mSeeded[3]} = ${+mSeeded[2] - +mSeeded[3]} · 스킵 줄 ${skips.length}` : '-');

  // ── ★[T348] ⓕ 다리 · ⓖ 광맥 — T343 이 "결손"으로 적은 둘 ───────────────────
  //   ★자명 통과 금지: 두 절 다 **전제를 먼저 건다**. 쌍이 0 이거나 마을이 0 이면
  //     "도달불능 0" 도 "광맥 바닥 0곳" 도 초록이 되는데, 그건 아무것도 안 잰 것이다.
  console.log('\n[ⓕ 다리 — 교역이 실제로 이어지나]');
  const mDist = LOG.match(/교역 BFS 거리행렬: (\d+)마을 (\d+)쌍[^\n]*다리구제 (\d+)\)[^\n]*도달불능 (\d+)쌍/);
  ok(!!mDist, 'ⓕ0 전제: 교역 거리행렬 줄이 찍혔다', mDist ? mDist[0].slice(0, 110) : '(없음)');
  const pairs = mDist ? +mDist[2] : 0, unreach = mDist ? +mDist[4] : 0, saved = mDist ? +mDist[3] : 0;
  ok(pairs > 0, 'ⓕ1 전제: 마을 쌍이 실제로 있다(1마을이면 아래가 자명 통과다)', `${pairs}쌍`);
  // 닛폰에 다리가 선언돼 있다 — 없으면 아래 '구제'가 0 인 게 당연하다
  const nb = ((ZONES[ZID] && ZONES[ZID].bridges) || []).length / 2;
  ok(nb > 0, 'ⓕ2 전제: 존 설정에 다리 셀이 있다', `${nb}셀`);
  // ★★**다리가 교역 격자에 실제로 보인다.** `다리구제 > 0` 이 그 증거다 —
  //   T348 1차 판은 다리를 놓았는데 이 수가 0 이었고, 도달 쌍이 한 쌍도 안 늘었다.
  ok(saved > 0, 'ⓕ ★다리가 교역 격자에 **보인다**(코스 셀 구제 > 0 — 놓았는데 안 보이면 교역은 안 열린다)', `다리구제 ${saved}칸`);
  ok(pairs - unreach >= 1, 'ⓕ3 서로 갈 수 있는 마을 쌍이 하나 이상 있다(교역이 아예 없는 세계가 아니다)',
    `도달 ${pairs - unreach}/${pairs}쌍 · 불능 ${unreach}`);

  console.log('\n[ⓖ 광맥 — 바닥(0.1)이 아닌 마을이 있나]');
  const lands = [...LOG.matchAll(/\[([^\]]+)\] 시딩: 중심[^\n]*land\(F([\d.]+)\/W([\d.]+)\/S([\d.]+)\/O([\d.]+)\//g)]
    .map((m) => ({ name: m[1], ore: +m[5] }));
  ok(lands.length > 0, 'ⓖ0 전제: 시딩 줄에서 땅 파라미터를 실제로 읽었다(0이면 아래가 자명 통과다)', `${lands.length}곳`);
  const oreOk = lands.filter((v) => v.ore > 0.1);
  ok(oreOk.length >= 1, 'ⓖ ★광맥이 바닥(0.1)을 넘는 마을이 **하나 이상** 있다(T343 엔 8/8 이 바닥이었다)',
    `${oreOk.length}/${lands.length}곳 — ${oreOk.map((v) => `${v.name} O${v.ore}`).join(' · ') || '(없음)'}`);
  // ★한반도도 같은 비율이다(T348 §0-ⓒ 실측 16%) — "전 마을에 광맥"은 이 세계의 규약이 아니다.
  //   그래서 상한이 아니라 **하한 1곳**만 건다. 전부 바닥이면 그건 광맥 정본이 없다는 뜻이다.
  ok(lands.every((v) => v.ore >= 0.1), 'ⓖ2 광맥 값이 바닥 아래로는 안 내려간다(0.1 = 바닥)',
    lands.map((v) => v.ore).sort((a, b) => a - b)[0] + ' ~ ' + lands.map((v) => v.ore).sort((a, b) => b - a)[0]);

  console.log('\n[ⓘ 정본으로 옮겨 적어도 세계가 같다 — T351]');
  // ★옮겨 적기는 **값을 안 바꾸는 일**이다. 그러니 부팅이 낸 수가 T348 과 같아야 한다.
  //   다르면 그건 옮겨 적기가 아니라 **세계를 바꾼 것**이다(그래도 초록이면 자가 아무것도 안 잰 것이다).
  ok(!!mSeeded && +mSeeded[1] === (npHard || []).length,
    'ⓘ 부팅이 읽은 후보 수 = 정본 칸 수(절차 배치기를 다시 안 돈다)',
    mSeeded ? `부팅 후보 ${mSeeded[1]} · 정본 ${(npHard || []).length}` : '-');
  ok(!!mSeeded && +mSeeded[3] === 7, 'ⓘ2 ★시딩 마을 수가 T348 과 같다(옮겨 적기가 세계를 안 움직였다)',
    mSeeded ? `시딩 ${mSeeded[3]}곳` : '-');
  ok(pairs === 21, 'ⓘ3 교역 쌍 수가 T348·T351 과 같다(마을 수가 안 움직였다)', `${pairs}쌍`);

  console.log('\n[ⓙ 닛폰이 한 덩어리다 — T360]');
  // ★★T348 계획기는 최대 덩어리를 "대양 분리(항해 층 필요)"라 답했다. T360 이 실측해 보니
  //   **바다가 아니라 탐색 모양**이었다 — 사람이 안 사는 뭍(디딤돌)을 거치면 16+5+11칸이면 닿는다.
  //   다리 셋을 놓고 나서 이 수가 0 이 아니면, 놓은 것이 세계에 안 닿은 것이다(T348 의 교훈).
  ok(unreach === 0, 'ⓙ ★★서로 못 가는 마을 쌍이 **없다**(T348 12쌍 · T351 12쌍 → T360 0쌍)',
    `도달 ${pairs - unreach}/${pairs}쌍 · 불능 ${unreach}`);

  console.log('\n[ⓗ 한반도 무변 — 자료 쪽]');
  const hbOres = ((require(path.join(ROOT, 'server', 'hanbando-terrain.json')).hanbando || {}).ores || []).length;
  ok(hbOres === 787, 'ⓗ 한반도 정본 광맥 수가 그대로다', `${hbOres}개`);
  const hbBr = ((ZONES.hanbando && ZONES.hanbando.bridges) || []).length / 2;
  ok(hbBr === 836, 'ⓗ2 한반도 다리 셀 수가 그대로다', `${hbBr}셀`);

  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); shutdown(); process.exit(1); });
