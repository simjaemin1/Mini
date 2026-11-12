#!/usr/bin/env node
// (@regress 없음 — 러너 밖 실기 자 · T511)
// =============================================================================
// scripts/e2e-first30.js — **촌장 없이 첫 30분** 실기 자 (T511 · 2026-09-29)
//
// ★왜 [재민 확정 "촌장은 보조 · 없어도 돌아야 한다" · 캐논 §9.5]
//   빈손 시작(B-1)의 첫 식량은 첫 의뢰 보상이다 — 그런데 촌장을 **안 만나면**?
//   이 자는 진짜 Chromium 을 도착 지점에 내려놓고 **촌장 문(`EV_BRIEF_PX`) 밖에서만** 산다:
//     물(민물 E) → 첫 열매/갈대(E) → 첫 도구(손 제작) → 첫 밥 · 첫 불 · 첫 잠자리
//   그리고 그게 **실시간 몇 분**인지(하루 24분 · 몸 시계 실초), 어디서 길이 끊기는지를 JSON 표로 남긴다.
//   `--chief` 판은 같은 몸·같은 손으로 촌장에게 **먼저** 간다(인사 → 첫 의뢰 → 납품 → 밥 → 쉼터) — 카드 ② 나란히.
//
// ★재기만 한다 — 제품 코드 0 · 규칙은 전부 정본에게 묻는다(사본 0):
//   · 통행·물·바다 = 존 정본 술어(`zone.__testBind()` — `isTerrainBlockedLocal`·`isWaterTileLocal`·`isSeaTileLocal`)
//   · 줍기 자리 = `server/forage.js sourceAt`(존 `_forageCtx` 와 **같은 술어**를 주입 — 숲 배율은 같은 `terrain`)
//   · 길 = `sim/path-core.js routePath`(경로 정본 · 8방 · 코너컷 금지)
//   · 콜라이더 반경·채집 거리·걸음 = `server/zone.js` 소스에서 **읽는다**(`PLAYER_BODY_R`·`TRUNK_COLLIDER_MAX`·`ROCK_COLLIDER_R`·`GATHER_RANGE`·`MOVE_SPEED`)
//   · 촌장 문 = `server/villages.js EV_BRIEF_PX`(소스에서 읽는다 · 클라 발신 게이트도 같은 260)
//   · 계절 = `server/events.js seasonOf`(그 계절 한가운데 날) · 낮밤 = `zone-config worldPhase/isNight`(세계 시계 **그대로**)
//   · 몸 = 서버가 보낸 `gauges.body`(무들 단계 · **문턱 무변** — ×3 폐지)
// ★눈은 화면이다 — 목표는 **1280×800 화면 안에 보이는 것**만 고른다(`__w2s`·`__s2w` 사영). 안 보이면 걸어서 찾는다(탐색 다리).
//   물만 예외 — 화면에 없으면 지도(M)를 연다(상세 지도가 강·호수를 그린다).
// ★손은 사람 손이다 — 걷기 = WASD(8방 · `31-m-move worldKeysDir` 의 그 매핑) · 채집 = E 키 / 우클릭 메뉴가 보내는 그 메시지(`gather{resId}`) ·
//   모닥불 = J 키 · 제작·먹기 = 제작 창·HUD 가 보내는 그 메시지(`craft`·`craft_item`·`eat`·`equip`) · 움집 = 커서 배치의 그 메시지(`hut_start`·`hut_advance`).
//   ⚠텔레포트 0 · 지급(`__e2e_give`) 0 · 몸 세우기(`__e2e_body`) 0. 테스트 문은 **계절 시계 하나**(`__e2e_clock {day}`) —
//     `night` 를 안 주므로 몸·날씨의 낮밤은 세계 시계 그대로 돈다(기온은 그날 정오/자정 두 점 — 얼린 시계의 옛 규약 · 보고에 적는다).
// ★세계는 `e2e-onboarding` 과 같은 판이다(VILLAGE_MAX 4 · 야생·도적·길 끔) — 단 **하루를 줄이지 않는다**(VILLAGE_DAY_MS 없음).
// ★★[T1093 2026-11-03] land1038 실기 막힘 셋(17.7분 [잠자리] · 29.8분 [움집] "화면에 안 보여" · 30분 [첫 잠자리] "쉼터를 봤으나 못 감(stuck×8)")의 **자 몫** 고침:
//   ⓐ 도구 문 사다리 — 맨손으로 못 따는 돌 · 나무가 모자라면 급조 돌괭이 · 돌도끼부터(`toolFirst` · 레시피는 존 정본)
//   ⓑ 이름 바로 — 도구 문에 걸려 고르지 않은 소스가 화면에 있으면 "화면엔 있으나 도구 문에 걸림(…)" · 찾으면 탐색 누적 0부터
//   ⓒ 벽 = 변 표(경로 정본 `stepBlocked` 간선 술어) · 도랑 = 안 푸는 칸 · 갇힘 풀기는 걸려 본 칸만(진짜 막힘을 풀어 stuck×8 을 돌던 고리)
//   ⓓ 쉼터 길 한 번 실패 = 영영 포기 → 3분 쉬고 다시(걸려 본 칸 비움) · 실패마다 걸린 자리 · 벽 변 · 도랑을 적는다
//   ⓔ 입 셋 — `--shots <dir>`(막힘 순간 사람 창 한 장 + 「지금 할 일」 글자) · `--reach <px,…>`(쉼터 길 시험) · `--old-bot`(T1093 앞 손으로 실기 막힘 다시 세우기)
//   서버 손잡이 `T1093_SHELTER_ROOF`(쉼터 지붕 선언)는 자의 "쉼터를 알아본 길"(지붕 선언 · 이름표만)로 잰다.
// ★★[T1120 2026-11-03] `--panel-bot` — 「지금 할 일」을 읽는 손(서버 손잡이 `T1120_NEXT_TOOL` 끔 ↔ 켬을 재는 자):
//   T1093 새 손에서 **사다리(`toolFirst` — 급조 돌괭이 · 돌도끼 먼저)만 뺐다** — 그 앎을 이제 칸이 준다(켬). 칸이 다음 막힘(`stage: 'tool'`)을 말하면
//   그 한 칸(읽기 훅 `__t1064Next().step` — 만들기 · 손에 들기 · 맨손 줍기 · 캐기)을 그대로 한다. 알림 글자는 안 읽는다(끔 ↔ 켬 차이가 칸에서만 나게).
//   맨손으로 못 따는 소스(도구 문에 걸린 바위 · 나무)만 화면에 있으면 **한 번** 눌러 본다(사람이 바위를 우클릭 채굴해 보는 그 한 번 — 서버 거절이 칸에 막힘을 싣는다).
//   `--shots` 면 칸이 새 막힘 한 칸을 처음 말한 순간도 찍는다.
// ★[T1126 2026-11-04] 캐기는 **모자란 만큼만** — 서버 손잡이 `T1126_ROCK_YIELD` 켬이면 바위가 칠 때마다 돌을 낸다(바위 하나 = 돌 수백 · 부서지기 전에도 손에 든다).
//   종전 손은 소스가 사라질 때까지(상한 14타) 쳤다 — 켬 판에서는 쓸 데 없는 돌을 짐 상한 넘게 지고 걷는다. 사람은 「지금 할 일」의 "지금 돌 n개"가
//   찬 그 타에 멈춘다 ⇒ `gatherRes(r, want)` 는 짐이 `want`({품목: 수} — 모자란 재료 · 칸이 말한 만들 것의 레시피)를 채우면 멈춘다.
//   끔 판은 전리품이 부서질 때만 나오므로 멈추는 타가 종전과 같다(쓸 데 있는 셈 한 번이 타마다 붙을 뿐).
// ★[T1146 2026-11-04] 바위 한 타가 돌 한 개가 안 되는 세계(서버 `T1146_STONE_RULE` 켬 — 한 타 kg = 도구 배수 × 금 간 돌 한 타 kg)에선
//   서버가 칠 때마다 "바위 깎는 중 x/4kg · 남은 돌 n" 을 말한다 — 사람은 그 말을 보고 계속 친다. ⇒ `gatherRes` 는 그 말을 한 번이라도 들으면
//   14타 상한 대신 "말도 짐도 없이 14타"에 멈춘다(모자란 것을 모르는 손은 짐이 하나 들면 멈춘다 · 손의 돌괭이가 닳아 없어지면 가방의 다음 것을 든다).
//   그 말을 들은 바위는 짐이 안 늘었어도 못 가는 바위로 치지 않는다(깎인 몫이 바위 장부에 남아 다음 돌괭이가 잇는다). 끔 판은 그 말이 안 와 종전 차례 그대로다.
//
// 실행: node scripts/e2e-first30.js --season spring|summer|winter --start day|night [--cap 30] [--out /tmp/t511/x.json]
//          [--chief] [--quest-fixture] [--warm-db <초>] [--vid <n>] [--econ-days <n>] [--no-align] [--headed]
//          [--shots <디렉터리>] [--shot-size 1280x800] [--old-bot] [--panel-bot]
//        node scripts/e2e-first30.js --no-align --reach 448,704,960 [--reach-dirs 8] [--shots <dir>]   (쉼터 길 시험 — 본판 대신 · T1093)
//        node scripts/e2e-first30.js --table <json…|디렉터리>        (표 입 — 세계를 안 띄운다)
//        node scripts/e2e-first30.js --shelters                     (쉼터 입 — 한 존 전수 50곳의 쉼터↔도착점 거리 표 · 걷지 않는다)
//   ⚠포트는 정본(central 3010 · 존 3020)이어야 한다 — central 은 존의 **설정 포트**를 로비에 광고한다(`zone-config publicZoneMap`).
//     두 판을 같이 돌리려면 판마다 네트워크 이름공간을 따로 준다(`unshare -n` + 루프백 켜기 · 보고 §5).
// =============================================================================
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const ENV0 = Object.assign({}, process.env);   // ★아이(central·zone)는 **이 스냅샷**을 받는다 — 아래 안쪽 존 적재가 env 를 건드린다
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');           // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const SEASON = val('--season', 'spring');
const START = val('--start', 'day');
const CHIEF = argv.includes('--chief');
// ★`--quest-fixture` (촌장 판만) — 새로 띄운 세계는 econ 첫날이라 게시판이 **빈 판**이다(실측: 촌장 "지금은 급한 일이 없네").
//   살아 있는 서버의 마을엔 의뢰가 걸려 있다 ⇒ 그 판을 흉내 내려면 `e2e-onboarding` 이 쓰는 **그 문**(`__e2e_village_short`)으로
//   도착 직후 마을 하나에 부족을 세운다(게시판이 스스로 의뢰를 낸다 · 촌장은 그 게시판에서 첫 의뢰를 고른다 — 사본 0).
//   ⚠세계를 세우는 픽스처다 — 보고에 **픽스처 판**이라고 적는다(자연 판과 나란히).
const QFIX = argv.includes('--quest-fixture');
// ⚠데우기(`VILLAGE_DAY_MS=500` 으로 n 일 돌리고 `__e2e_day_freeze`)는 **버렸다** — 실측: 그 판에선 열매가 "+허기 0" 이다
//   (날을 줄인 시계와 얼린 시계가 로트 나이를 갈라 방금 딴 열매가 상한 것으로 읽힌다 · 계측기가 세계를 망가뜨린다).
//   ⇒ 하루를 **실제로 넘긴** 세계를 쓴다(`--econ-days` · 아래).
// ★`--econ-days <n>` — 기동 뒤 **econ 하루 경계를 n 번 넘긴 다음** 도착한다(하루를 줄이지 않는다 · 경계는 세계 시계 24분 눈금).
//   새로 띄운 세계는 econ 첫날이라 소비 흐름이 비어 게시판·픽스처가 설 자리가 없다 — 하루를 **실제로 산** 세계에서 촌장을 만난다.
const ECON_DAYS = +val('--econ-days', '0');
// ★`--vid <n>` — 시작 화면 **지도에서 고르기**(`__onbPick` → 「나루터로 간다」 · §9.1 의 다른 문). 기본은 "아무 곳이나(추천)" 원클릭.
//   촌장 판을 촌장 없는 판과 **같은 마을**에 세우려고 쓴다(추천은 세계가 고르므로 하루 뒤엔 바뀔 수 있다).
const PICK = val('--vid', null) == null ? null : +val('--vid', null);
// ★`--warm-db <초>` — **산 세계** 흉내(촌장의 첫 의뢰가 설 자리). 새 세계는 econ 첫날이라 게시판이 비고 픽스처조차
//   "갚을 잉여가 있는 소비 품목이 없다(econ day 1)"로 거절된다(실측). ⇒ 두 번 띄운다:
//   ① 같은 DB 로 존을 `VILLAGE_DAY_MS=500` 으로 n 초 돌려 마을 살림만 산다(econ 이 마을 행에 제 상태를 저장한다 — `econ_state`)
//   ② 그 존을 내리고 **같은 DB 로 보통 존**(하루 24분)을 다시 띄운다 — 재부팅 복원이 산 살림을 되살린다(`restoreEcon`).
//   ②의 30분은 보통 시계 그대로다(로트·열매 무사 — 줄인 시계와 얼린 시계를 섞은 옛 데우기의 함정을 안 밟는다).
const WARMDB = +val('--warm-db', '0');
const CAP_MIN = +val('--cap', '30');
const PB = +val('--port', '3010');
const OUT = val('--out', null);
const ALIGN = !argv.includes('--no-align');
const HEADED = argv.includes('--headed');
// ★창은 작게, 눈은 크게 — 헤드리스 렌더(SwiftShader)는 물가에서 1280×800 에 **3fps** 까지 떨어진다(실측 · 보고 §자).
//   클라 이동은 프레임 dt 를 0.1초로 자르므로(`31-m-move loop`) 그 fps 면 걸음이 1/3 로 깎인다 — 세계가 아니라 계측기의 사실이다.
//   ⇒ 창은 320×200 으로 두고(물가 40fps · 걸음 64px/s 실측), '보이는 것'은 **1280×800 화면과 같은 넓이**로 계산한다
//     (줌 1 · 같은 사영식 `__s2w`/`__w2s` — 화면 중심 ±640×±400). 사람의 눈은 그대로, 계측기의 붓만 가볍게.
const VW = +val('--vw', '320'), VH = +val('--vh', '200');
const SIGHT = String(val('--sight', '1280x800')).split('x').map(Number);
// ★[T1093 ④] `--shots <디렉터리>` — 막힘이 적히는 그 순간(그리고 쉼터 길이 끊긴 순간) 화면을 사람 창 크기로 한 장 찍고
//   「지금 할 일」 칸이 그때 한 말(자리 · 할 일 · 설명)을 그대로 적는다(읽기만 · 창은 찍는 동안만 `--shot-size` 로 키운다).
//   기본 크기 = 자의 눈 넓이(`--sight` · 1280×800) — 1280×720 이면 "화면엔 있으나" 바위가 위아래 40px 띠 · 패널 밑에 숨는다(T1093 실측).
const SHOTS = val('--shots', null);
const SHOT = String(val('--shot-size', SIGHT.join('x'))).split('x').map(Number);
// ★[T1093 ①-ⓒ] `--reach <px,…>` — 쉼터 길 시험(본판 대신): 마을마다 쉼터 문 앞 둘레 `--reach-dirs` 방향 × 그 거리에서 문까지 걷는다(아래 판 머리)
const REACH_D = val('--reach', null) == null ? [] : String(val('--reach', '384')).split(',').map(Number).filter((n) => n > 0);
const REACH_K = +val('--reach-dirs', '16');
// ★[T1093] `--old-bot` — T1093 앞 손(돌괭이 사다리 0 · 쉼터 한 번 실패 = 영영 포기)으로 돈다. 눈 · 이름표 · 사진은 새 것 그대로 —
//   land1038 실기 막힘을 **같은 손으로 다시 세우고** 그 순간을 찍어 귀속하는 판(보고 ① · ④). 기본은 새 손.
const OLDBOT = argv.includes('--old-bot');
const PANELBOT = argv.includes('--panel-bot');   // ★[T1120] 「지금 할 일」을 읽는 손(머리 주석)
const CPORT = PB, ZPORT = PB + 10, IPORT = PB + 47;
const TAG = `${SEASON}-${START}${PANELBOT ? '-panel' : ''}${CHIEF ? '-chief' : ''}${QFIX ? 'Q' : ''}${ECON_DAYS ? 'E' + ECON_DAYS : ''}${WARMDB ? 'L' + WARMDB : ''}`;
const say = (s) => process.stdout.write(s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!['spring', 'summer', 'winter', 'autumn'].includes(SEASON) || !['day', 'night'].includes(START)) { say('인자 오류'); process.exit(2); }

// ── 표 모드 — 판 JSON 들을 읽어 보고 표를 낸다(세계를 안 띄운다 · 같은 자의 다른 입) ─────────────
//   node scripts/e2e-first30.js --table /tmp/t511/A1-spring-day.json … (또는 디렉터리)
if (argv.includes('--table')) {
  const ins = argv.slice(argv.indexOf('--table') + 1).filter((x) => !x.startsWith('--'));
  const files = [];
  for (const f of ins) { if (fs.statSync(f).isDirectory()) { for (const g of fs.readdirSync(f).sort()) if (/\.json$/.test(g)) files.push(path.join(f, g)); } else files.push(f); }
  const runs = files.map((f) => Object.assign(JSON.parse(fs.readFileSync(f, 'utf8')), { _f: path.basename(f) }));
  const KO = { spring: '봄', summer: '여름', winter: '겨울', autumn: '가을' }, ST = { day: '낮(새벽)', night: '밤(해질녘)' };
  const m = (r, k) => (r.milestones && r.milestones[k]) ? r.milestones[k].min.toFixed(1) : '—';
  const nm = (r) => `${r.warmDbSec ? '산 세계 ' : ''}${KO[r.season]}·${ST[r.start]}${r.chief ? ' **촌장**' : ''}${r.questFixture ? ((r.fixture || []).some((x) => /→/.test(x)) ? '(의뢰 세움)' : '(의뢰 세움 실패)') : ''}${r.econDays ? `(econ ${r.econDays}일 산 뒤)` : ''}${r.capMin && r.capMin !== 30 ? `(${r.capMin}분)` : ''}`;
  const KOI = { wood: '나무', food: '곡식', berry: '열매', stone: '돌', fiber: '풀' };
  const ko = (s) => String(s).replace(/\b(wood|food|berry|stone|fiber)\b/g, (w) => KOI[w] || w);
  const COLS = ['물', '첫 갈대', '첫 열매', '첫 도구', '첫 밥', '첫 불', '첫 잠자리', '곡괭이(손 제작)', '움집터(① 굴착)', '도끼(손 제작)', '움집 ② 단계', '움집 ③ 단계', '움집 완공'];
  say('| 판 | 도착 phase | ' + COLS.join(' | ') + ' |');
  say('|---|---|' + COLS.map(() => '---').join('|') + '|');
  for (const r of runs) say(`| ${nm(r)} | ${r.arrival ? r.arrival.phase : '?'} | ` + COLS.map((k) => m(r, k)).join(' | ') + ' |');
  say('\n| 판 | 첫 밥은 무엇 | 첫 잠자리는 어디 | 쉼터 알아본 길 | 걸음 px/s | 탐색 다리·초 | 렌더 fps 최저·중앙 | 문 침범 | 문에서 최소 px |');
  say('|---|---|---|---|---|---|---|---|---|');
  for (const r of runs) {
    const ml = r.milestones || {};
    say(`| ${nm(r)} | ${ml['첫 밥'] ? `${ko(ml['첫 밥'].how)} (${ml['첫 밥'].hunger})` : '—'} | ${ml['첫 잠자리'] ? ml['첫 잠자리'].how : '—'} | ${r.shelterSeen ? `${r.shelterSeen.by === 'flag' ? '지붕 표지' : '이름표만'} · ${(r.shelterSeen.t / 60).toFixed(1)}분에 봄` : '—'} | ${r.walk ? r.walk.pxPerSec : '?'} | ${r.explore ? `${r.explore.legs}·${Math.round(r.explore.sec)}` : '?'} | ${r.fps ? `${r.fps.min}·${r.fps.med}` : '?'} | ${r.chief ? '— (촌장 판)' : (r.breaches || []).length} | ${r.chief ? '—' : r.keepMin} |`);
  }
  say('\n| 판 | 막힘(일감 · 이유) |');
  say('|---|---|');
  for (const r of runs) say(`| ${nm(r)} | ${(r.blockers || []).map((b) => `[${ko(b.need)}] ${ko(b.reason)} (${(b.t / 60).toFixed(1)}분)`).join(' · ') || '없음'}${r.hutReach ? ` · 움집 도달 ${r.hutReach}` : ''} |`);
  //   촌장 판이 섞이면 — 촌장 칸(카드 ② 나란히): 인사 · 첫 의뢰(무엇 → 보상) · 납품 · 첫 밥 · 첫 잠자리
  if (runs.some((r) => r.chief)) {
    const mm = (r, k) => (r.milestones && r.milestones[k]) ? r.milestones[k].min.toFixed(2) : '—';
    say('\n| 판 | 촌장 인사 | 첫 의뢰(무엇 → 보상) | 첫 납품 | 첫 밥(무엇 · 허기) | 첫 잠자리(어디) |');
    say('|---|---|---|---|---|---|');
    for (const r of runs) {
      const ml = r.milestones || {}, q = ml['첫 의뢰 받음'];
      const qs = q ? `${q.min.toFixed(2)} · ${ko(r.quest ? `${r.quest.item} ${r.quest.qty}` : q.item)} → ${ko(q.rew)}` : (r.chief ? '없음(게시판이 비었다)' : '—');
      say(`| ${nm(r)} | ${mm(r, '촌장 인사')} | ${qs} | ${mm(r, '첫 납품')} | ${ml['첫 밥'] ? `${ml['첫 밥'].min.toFixed(2)} · ${ko(ml['첫 밥'].how)} ${ml['첫 밥'].hunger}` : '—'} | ${ml['첫 잠자리'] ? `${ml['첫 잠자리'].min.toFixed(2)} · ${ml['첫 잠자리'].how}` : '30분 안 없음'} |`);
    }
  }
  const AX = [['hunger', '허기'], ['thirst', '갈증'], ['cold', '추위'], ['fatigue', '피로']];
  say('\n| 판 | 도착 허기·갈증 | ' + AX.map(([, k]) => `${k} 1단계`).join(' | ') + ' |');
  say('|---|---|' + AX.map(() => '---').join('|') + '|');
  //   칸 = 1단계 첫 넘김(분) · 최고 단계 · 1단계 이상 머문 시간(표본 5초 합 · 분) · 30분 끝의 단계
  const stayMin = (r, ax) => { const S = r.samples || []; let t = 0; for (let i = 1; i < S.length; i++) if (((S[i - 1].mood || {})[ax] | 0) >= 1) t += S[i].t - S[i - 1].t; return (t / 60).toFixed(1); };
  const lastSt = (r, ax) => { const S = r.samples || []; return S.length ? ((S[S.length - 1].mood || {})[ax] | 0) : '?'; };
  const f1 = (r, ax) => { const a = r.stage1 && r.stage1[ax]; if (!a || a.first === null) return '안 넘음'; return `${(a.first / 60).toFixed(1)}분 · 최고 ${a.max} · 머묾 ${stayMin(r, ax)}분 · 끝 ${lastSt(r, ax)}`; };
  for (const r of runs) say(`| ${nm(r)} | ${r.arrival ? `${Math.round(r.arrival.hunger)}·${Math.round(r.arrival.thirst)}` : '?'} | ` + AX.map(([ax]) => f1(r, ax)).join(' | ') + ' |');
  process.exit(0);
}

// ── 쉼터 입 — 한 존 전수(라이브와 같은 전수 시딩 · `VILLAGE_MAX` 없음)의 쉼터↔도착점 거리 표 ─────────────
//   node scripts/e2e-first30.js --shelters        (정본 포트 3010/3020 — 이름공간 하나)
//   ★자리는 서버가 말한 것만 쓴다(`/shelterdbg` 가 쉼터 문 앞·도착점을 같이 낸다 · `/startinfo` 가 중심 칸을 낸다).
//   '첫 화면에 보이나'는 1280×800 화면 사영(아이소 2:1 · 줌 1 · `00-const screenToWorldAbs`: ix = x−y · iy = (x+y)/2)의 월드 넓이로 판정한다 —
//   도착점 둘레 **|dx−dy| ≤ 640 · |dx+dy| ≤ 800**(e2e 판에서 잰 화면 네 모서리 (−720,−80)·(−80,−720)·(720,80)·(80,720) 가 그 평행사변형이다).
const C0GATE = +((fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8').match(/const EV_BRIEF_PX = Math\.max\(32, parseInt\(process\.env\.EV_BRIEF_PX \|\| '(\d+)'/) || [])[1]);
if (argv.includes('--shelters')) {
  (async () => {
    const CDB2 = `/tmp/t511-shc-${process.pid}.db`, ZDB2 = `/tmp/t511-shz-${process.pid}.db`;
    const kids = [];
    const b2 = (file, env) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, ENV0, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); kids.push(p); return p; };
    const bye = () => { for (const p of kids) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of [CDB2, ZDB2]) for (const x of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + x); } catch (e) {} } };
    process.on('exit', bye);
    const c = b2('central.js', { PORT: '3010', DB_PATH: CDB2, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
    const z = b2('zone.js', { PORT: '3020', ZONE_ID: 'hanbando', DB_PATH: ZDB2, CENTRAL_URL: 'http://localhost:3010', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
    const u = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 600000 }); void c;
    if (!u.ok) { say('존 기동 실패'); process.exit(1); }
    const jg = async (url) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
    let info = null, sh = null;
    for (let i = 0; i < 90; i++) {
      info = await jg('http://localhost:3020/startinfo');
      sh = await jg('http://localhost:3020/shelterdbg');
      const ready = info && info.ok && !info.warming && sh && sh.rows && sh.rows.length && sh.rows.filter((r) => !r.player).every((r) => r.shelter && r.arrive);
      if (ready) break;
      await sleep(10000);
    }
    const byVid = new Map(((info && info.villages) || []).map((v) => [v.vid, v]));
    const rows = [];
    for (const r of (sh && sh.rows) || []) {
      const v = byVid.get(r.vid); if (!v || !r.shelter || !r.arrive) continue;
      const ax = v.cx * 32 + 16, ay = v.cy * 32 + 16;
      const dx = r.shelter.x - r.arrive.x, dy = r.shelter.y - r.arrive.y;
      rows.push({ vid: r.vid, name: r.name, ch: v.chKo || v.ch || '', arrKind: (v.arrive && v.arrive.kind) || '', arrAnc: Math.round(Math.hypot(r.arrive.x - ax, r.arrive.y - ay)),
        shAnc: Math.round(Math.hypot(r.shelter.x - ax, r.shelter.y - ay)), shArr: Math.round(Math.hypot(dx, dy)),
        seen: Math.abs(dx + dy) <= 800 && Math.abs(dx - dy) <= 640 });
    }
    rows.sort((p, q) => p.shArr - q.shArr);
    say(`| 마을 | 성격 | 도착 | 도착→중심 | 쉼터→중심 | **쉼터→도착** | 첫 화면 | 촌장 문(${C0GATE}) 밖 |`);
    say('|---|---|---|---|---|---|---|---|');
    for (const r of rows) say(`| ${r.name} | ${r.ch} | ${r.arrKind} | ${r.arrAnc} | ${r.shAnc} | **${r.shArr}** | ${r.seen ? '보임' : '—'} | ${r.shAnc > C0GATE ? '밖' : '안'} |`);
    const q = (a, f) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : null;
    const d = rows.map((r) => r.shArr).sort((x, y) => x - y);
    say(`\n마을 ${rows.length}곳 · 쉼터→도착 p10/p50/p90/최대 ${q(d, 0.1)}/${q(d, 0.5)}/${q(d, 0.9)}/${d[d.length - 1]}px · 첫 화면에 보임 ${rows.filter((r) => r.seen).length}곳 · 쉼터가 촌장 문 안 ${rows.filter((r) => r.shAnc <= C0GATE).length}곳`);
    bye(); process.exit(0);
  })().catch((e) => { say('예외: ' + (e && e.stack || e)); process.exit(1); });
  return;
}

// ── 정본 적재(조용히) ───────────────────────────────────────────────────────────
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const readNum = (src, re, what) => { const m = src.match(re); if (!m) throw new Error(`정본 수를 못 읽었다: ${what}`); return +m[1]; };
const C = {
  BODY_R: readNum(ZSRC, /const PLAYER_BODY_R = (\d+);/, 'PLAYER_BODY_R'),
  TRUNK_MAX: readNum(ZSRC, /const TRUNK_COLLIDER_MAX = (\d+);/, 'TRUNK_COLLIDER_MAX'),
  ROCK_R: readNum(ZSRC, /const ROCK_COLLIDER_R = (\d+);/, 'ROCK_COLLIDER_R'),
  GATHER: readNum(ZSRC, /const GATHER_RANGE = (\d+);/, 'GATHER_RANGE'),
  SPEED: readNum(ZSRC, /const MOVE_SPEED = (\d+);/, 'MOVE_SPEED'),
  GATE: readNum(VSRC, /const EV_BRIEF_PX = Math\.max\(32, parseInt\(process\.env\.EV_BRIEF_PX \|\| '(\d+)'/, 'EV_BRIEF_PX'),
};
const CELL = 32;
const KEEP = C.GATE + 64;          // 촌장 문 + 두 칸 여유 — 셀 중심 경로가 몸을 ±16px 흔들어도 문 안에 안 든다
const STAND = C.GATHER - 8;        // 서는 자리 = 채집 거리 안쪽(권위·예측 차 여유)

process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(IPORT); process.env.DB_PATH = `/tmp/t511-inproc-${process.pid}.db`;
process.env.CENTRAL_URL = 'http://127.0.0.1:9';
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
console.log = console.warn = console.error = console.info = () => {};   // ★안쪽 존의 말은 끝까지 막는다(우리 말은 `say`)
const Z = require(path.join(ROOT, 'server', 'zone.js')).__testBind();
const Forage = require(path.join(ROOT, 'server', 'forage'));
const PathCore = require(path.join(ROOT, 'sim', 'path-core'));
const ZC = require(path.join(ROOT, 'server', 'zone-config'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const ZM = ZC.ZONES.hanbando;
const WOX = ZM.worldOffsetX || 0, WOY = ZM.worldOffsetY || 0;
const T = Z.terrain;
const fctx = (hasVessel) => ({                    // ★존 `_forageCtx` 와 같은 술어(주입만 · 사본 0)
  forestMult: (x, y) => (T.getForestMultiplier ? T.getForestMultiplier('hanbando', x, y) : 1),
  isRock: (x, y) => Z.isRockTileLocal(x, y), isWater: (x, y) => Z.isWaterTileLocal(x, y),
  isSea: (x, y) => Z.isSeaTileLocal(x, y), hasVessel: !!hasVessel,
  // ★[T1065] 켬이면 존이 `rockNear` 를 준다(바위 개체 둘레 자갈 ③′) — 자는 화면에 보이는 바위로 같은 술어를 준다(끔 = 없음 = 종전)
  rockNear: GATE ? (x, y, rad) => RES.some((r) => r.on && r.t === 'rock' && Math.hypot(r.x - x, r.y - y) <= rad) : undefined });
// ★[T1065] 도구 문(존 `T1065_TOOL_GATE` 그대로 읽는다) — 켬이면 맞는 도구가 없을 때 나무 · 바위를 고르지 않는다(사람도 맨손이면 거절 이유를 보고 줍기로 간다)
const GATE = !!Z.T1065_TOOL_GATE;
let _tools = [];   // 마지막 `state()` 가 본 손 도구
const _has = (types) => _tools.some((t) => t && types.includes(t.type) && t.d > 0);
const gatedOut = (r) => GATE && ((r.t === 'tree' || r.t === 'sapling') ? !_has(['axe', 'crude_axe']) : (['rock', 'ore', 'meteorite'].includes(r.t) ? !_has(['pickaxe', 'crude_pick']) : false));
// 계절 한가운데 날 — `seasonOf` 가 정본(달력·기온·열매가 전부 이 함수를 본다)
function seasonMidDay(se) { const Y = (Ev.calendarOf(0) || {}).yearDays || 365; const ds = []; for (let d = 0; d < Y; d++) if (Ev.seasonOf(d) === se) ds.push(d); return ds.length ? ds[Math.floor(ds.length / 2)] : 0; }   // 첫 해 안에서
const SDAY = seasonMidDay(SEASON);
const FOOD = Z.FOOD_EFFECTS;

// ── 칸·지형 메모 ───────────────────────────────────────────────────────────────
const ck = (cx, cy) => cx + ',' + cy;
const cellOf = (p) => ({ x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) });
const ctr = (cx, cy) => ({ x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 });
const _terr = new Map();
function terrBlocked(cx, cy) { const k = ck(cx, cy); let v = _terr.get(k); if (v === undefined) { const c = ctr(cx, cy); v = !!Z.isTerrainBlockedLocal(c.x, c.y); _terr.set(k, v); } return v; }
const _water = new Map();   // 0 뭍 · 1 민물 · 2 바다
function waterKind(cx, cy) { const k = ck(cx, cy); let v = _water.get(k); if (v === undefined) { const c = ctr(cx, cy); v = Z.isWaterTileLocal(c.x, c.y) ? (Z.isSeaTileLocal(c.x, c.y) ? 2 : 1) : 0; _water.set(k, v); } return v; }
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // ★`tryGather` 가 물을 보는 순서 그대로(+x, −x, +y, −y)

// ── 결과 그릇 ─────────────────────────────────────────────────────────────────
const R = { tag: TAG, oldBot: OLDBOT, panelBot: PANELBOT, season: SEASON, seasonDay: SDAY, start: START, chief: CHIEF, questFixture: QFIX, econDays: ECON_DAYS, warmDbSec: WARMDB, pickVid: PICK, capMin: CAP_MIN, gate: C.GATE, keep: KEEP,
  consts: C, milestones: {}, blockers: [], breaches: [], samples: [], stage1: {}, legs: [], notes: [], errors: [], explore: { legs: 0, sec: 0 }, shots: [] };
let T0 = 0;                                   // 도착 순간(실시각 ms)
const tSec = () => (T0 ? +((Date.now() - T0) / 1000).toFixed(1) : 0);
const timeUp = () => T0 && (Date.now() - T0) >= CAP_MIN * 60000;
function mark(name, extra) {
  if (R.milestones[name]) return false;
  R.milestones[name] = Object.assign({ t: tSec(), min: +(tSec() / 60).toFixed(2) }, extra || {});
  say(`  ◆ ${String(R.milestones[name].min).padStart(5)}분  ${name}${extra ? '  ' + JSON.stringify(extra).slice(0, 140) : ''}`);
  return true;
}
const _shotQ = [];   // ★[T1093 ④] 찍을 차례(막힘 · 쉼터 길 끊김) — 손이 비면 `flushShots` 가 찍는다
function block(need, reason, extra) {
  const k = need + '|' + reason;
  if (R.blockers.some((b) => b.k === k)) return;
  R.blockers.push(Object.assign({ k, need, reason, t: tSec() }, extra || {}));
  say(`  ✗ ${(tSec() / 60).toFixed(2)}분  막힘 [${need}] ${reason}`);
  if (SHOTS) _shotQ.push({ label: `막힘-${need}`, need, reason });
}

// ── 아이 띄우기 ───────────────────────────────────────────────────────────────
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, ENV0, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
const CDB = `/tmp/t511-central-${process.pid}.db`, ZDB = `/tmp/t511-zone-${process.pid}.db`;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const f of [CDB, ZDB, process.env.DB_PATH]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
}
process.on('exit', cleanup);
async function jget(url) { try { const r = await fetch(url, { signal: AbortSignal.timeout(6000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } }

// ── 브라우저 손 ───────────────────────────────────────────────────────────────
let page = null;
const ev = (fn, arg) => page.evaluate(fn, arg);
const send = (msg) => ev((m) => window.__sendPrimary(m), msg);
const A2L = (p) => (p ? { x: p.x - WOX, y: p.y - WOY } : null);
async function meL() { return A2L(await ev(() => { const m = window.__getMyAbs(); return { x: m.x, y: m.y }; })); }
async function srvL() { return A2L(await ev(() => (window.__getSrvAbs ? window.__getSrvAbs() : null))); }
async function state() {
  const _s = await ev(() => ({ inv: window.__getInv(), tools: window.__getTools(), eq: window.__getEquipped ? window.__getEquipped() : null,
    g: window.__getGauges(), body: window.__bodyState || null, near: window.__evNearVid == null ? null : window.__evNearVid,
    greet: window.__onbGreet || null, quest: window.__onbQuest || null }));
  if (_s && Array.isArray(_s.tools)) _tools = _s.tools;   // ★[T1065] 손 도구 메모(동기 고르기가 읽는다)
  return _s;
}
const KEYSET = { E: ['KeyS', 'KeyD'], W: ['KeyW', 'KeyA'], N: ['KeyW', 'KeyD'], S: ['KeyS', 'KeyA'], NE: ['KeyD'], SE: ['KeyS'], SW: ['KeyA'], NW: ['KeyW'] };
const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];   // atan2(y 아래) 45° 칸 — `31-m-move worldKeysDir` 의 W=NW·D=NE·S=SE·A=SW 와 두 키 조합
const dirOf = (dx, dy) => DIRS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
const held = new Set();
async function setKeys(want) {
  for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
async function press(k, n = 1, gap = 0) { for (let i = 0; i < n; i++) { await page.keyboard.press(k); if (gap) await sleep(gap); } }
let walkedPx = 0, walkedSec = 0;
// ★[T1093 ④] 찍기 — 창을 사람 크기로 잠깐 키워 한 장 · 「지금 할 일」 칸의 글자(자리 · 할 일 · 설명) · 몸 자리 · 그때의 낮밤을 적는다(읽기만)
async function flushShots() {
  if (!SHOTS || !_shotQ.length || !page) return;
  const q = _shotQ.splice(0);
  await setKeys(new Set()).catch(() => {});
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: SHOT[0], height: SHOT[1] });
    await sleep(1200);
    for (const it of q) {
      const panel = await ev(() => {
        const g = (id) => { const e = document.getElementById(id); return e ? String(e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() : null; };
        const el = document.getElementById('onbNext');
        return { shown: !!(el && !el.classList.contains('hidden')), place: g('onbNextPlace'), item: g('onbNextItem'), guide: g('onbNextGuide') };
      }).catch(() => null);
      const f = path.join(SHOTS, `${TAG}-${String(R.shots.length + 1).padStart(2, '0')}-${it.label.replace(/[^\w가-힣-]+/g, '_')}.png`);
      await page.screenshot({ path: f });
      const at = await meL().catch(() => null);
      R.shots.push({ t: tSec(), label: it.label, need: it.need || null, reason: it.reason || null, file: path.basename(f), panel,
        at: at ? { x: Math.round(at.x), y: Math.round(at.y) } : null, night: ZC.isNight(Date.now()), phase: +ZC.worldPhase(Date.now()).toFixed(3) });
      say(`  ▣ ${(tSec() / 60).toFixed(2)}분  사진 ${path.basename(f)} — 칸 ${panel && panel.shown ? `「${panel.item}」 ${panel.guide}` : '안 보임'}`);
    }
  } catch (e) { R.errors.push('shot: ' + String(e && e.message || e).slice(0, 120)); }
  await page.setViewportSize({ width: VW, height: VH }).catch(() => {});
  await sleep(400);
}

// ── 눈: 화면에 보이는 것 ───────────────────────────────────────────────────────
let RES = [];            // 알려진 자연물 전부(클라가 받은 것) — {id,t,x,y,r,on}
let POLY = null;         // 화면 네 모서리(존 로컬)
const seen = new Set();  // 본 굵은 칸(256px)
const unreach = new Set();
async function look() {
  const o = await ev(([SW, SH]) => {
    const c = (typeof conns !== 'undefined') ? conns.get(window.__getPrimaryZoneId()) : null;
    if (!c) return null;
    const ox = (c.meta && c.meta.worldOffsetX) || 0, oy = (c.meta && c.meta.worldOffsetY) || 0;
    const cv = document.getElementById('canvas');
    const W = (typeof W0 !== 'undefined') ? W0 : cv.width, H = (typeof H0 !== 'undefined') ? H0 : cv.height;   // 논리 캔버스(`00-const` W0·H0)
    const res = [];
    for (const r of c.resources.values()) {
      const p = window.__w2s(ox + r.x, oy + r.y);
      res.push({ id: r.id, t: r.type, x: r.x, y: r.y, r: r.r || 0, on: Math.abs(p.px - W / 2) <= SW / 2 && Math.abs(p.py - H / 2) <= SH / 2, fn: !!r.fruitNow });
    }
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const w = window.__s2w(W / 2 + a * SW / 2, H / 2 + b * SH / 2); return { x: w.wx - ox, y: w.wy - oy }; });
    const blds = [];
    for (const b of c.buildings.values()) blds.push({ id: b.id, type: b.type, x: b.x, y: b.y, stage: (b.data && b.data.stage) | 0, owner: (b.data && b.data.owner) || b.ownerId || null,
      sh: (b.data && b.data.hut && (b.data.shelter || /쉼터$/.test(b.ownerName || ''))) ? b.data.hut : null,
      shBy: (b.data && b.data.shelter) ? 'flag' : (/쉼터$/.test(b.ownerName || '') ? 'name' : null) });
    //   ★공용 쉼터 = `hut` 발자국 + (`shelter:1` 선언(T136 지붕 열쇠) **또는** 이름 "○○ 쉼터"). 백필로 선 쉼터(`_liveHut6x4`)는
    //     선언 칸이 없다(실측 — 첫 부팅 세계) ⇒ 이름표(`ownerName` · 커서 이름표가 보여 줄 그 말)로도 알아본다. 어느 쪽이었는지 적는다.
    const m = window.__getMyAbs();
    // ★벽·문·울타리 — 클라 콜라이더 미러(`clEdgeBlockedStep`·`clHasFenceAt` = 서버 `isBlockedByWall` 미러)를 **그대로 부른다**(사본 0).
    //   내 둘레 ±40칸만(마을 집채·울타리가 있는 곳에서만 1 이 된다). 칸은 절대 → 존 로컬로 돌려준다.
    const walls = [];
    if (typeof clEdgeBlockedStep === 'function') {
      const B = 40, c0x = Math.floor(m.x / 32), c0y = Math.floor(m.y / 32), oxc = Math.round(ox / 32), oyc = Math.round(oy / 32);
      for (let y = c0y - B; y <= c0y + B; y++) for (let x = c0x - B; x <= c0x + B; x++) {
        let f = 0;
        if (clEdgeBlockedStep(x, y, 1, 0, 0)) f |= 1;
        if (clEdgeBlockedStep(x, y, 0, 1, 0)) f |= 2;
        if (typeof clHasFenceAt === 'function' && clHasFenceAt(x, y, 0)) f |= 4;
        if (f) walls.push(x - oxc, y - oyc, f);
      }
    }
    // ★환호(도랑) — 클라 미러 `_ditchAbs`(서버 `DITCH_CELLS` 를 welcome 으로 받은 것 · 절대 칸). 안쪽 존은 마을을 안 켜서 모른다.
    const ditch = (typeof _ditchAbs !== 'undefined' && !window.__t511DitchSent) ? [..._ditchAbs] : null;
    if (ditch && ditch.length) window.__t511DitchSent = true;
    const B0 = 40, w0x = Math.floor(m.x / 32) - Math.round(ox / 32), w0y = Math.floor(m.y / 32) - Math.round(oy / 32);
    return { res, corners, blds, walls, ditch, oxc: Math.round(ox / 32), oyc: Math.round(oy / 32), me: { x: m.x - ox, y: m.y - oy }, win: [w0x - B0, w0y - B0, w0x + B0, w0y + B0] };
  }, SIGHT);
  if (!o) return null;
  RES = o.res; POLY = o.corners; BLDS = o.blds;
  if (o.ditch) for (const k of o.ditch) { const [ax, ay] = k.split(',').map(Number); (OLDBOT ? WALLC : HARDC).add(ck(ax - o.oxc, ay - o.oyc)); R.ditchCells = (R.ditchCells || 0) + 1; }
  if (OLDBOT) {
    for (let i = 0; i + 2 < o.walls.length; i += 3) {   // 벽 변의 양쪽 칸 · 울타리 칸을 막는다(보수적 — 집 안으로는 안 들어간다)
      const x = o.walls[i], y = o.walls[i + 1], f = o.walls[i + 2];
      WALLC.add(ck(x, y)); if (f & 1) WALLC.add(ck(x + 1, y)); if (f & 2) WALLC.add(ck(x, y + 1));
    }
  } else {
    // ★[T1093 ①-ⓒ] 벽은 **변**이다 — 본 창(±40칸)의 변 표 · 울타리 칸을 지금 것으로 갈아 끼운다(지어지고 헐리는 것을 따라간다)
    const [x0, y0, x1, y1] = o.win;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = ck(x, y); EDGE_E.delete(k); EDGE_S.delete(k); FENCEC.delete(k); }
    for (let i = 0; i + 2 < o.walls.length; i += 3) {
      const k = ck(o.walls[i], o.walls[i + 1]), f = o.walls[i + 2];
      if (f & 1) EDGE_E.add(k); if (f & 2) EDGE_S.add(k); if (f & 4) FENCEC.add(k);
    }
  }
  keepPrep(o.me);
  if (!shelterSeen && T0) for (const b of BLDS) {   // 한 번 본 쉼터는 기억한다(사람이 그렇듯)
    if (!b.sh || !inPoly(b.x, b.y)) continue;
    //   발자국 [cx-5..cx]×[cy-5..cy-2] · 남벽 문(cx-3·cx-2) ⇒ 문 앞 = ((cx−2.5)·32, (cy−0.5)·32) — `villages.shelterOf` 의 그 식을 발자국에서 되짚는다
    const cx = b.sh[2], cy = b.sh[3] + 2, door = { x: (cx - 2.5) * CELL, y: (cy - 0.5) * CELL };
    shelterSeen = { x: door.x, y: door.y, t: tSec(), keep: keepHit(door.x, door.y), by: b.shBy };
    R.shelterSeen = shelterSeen;
    R.notes.push(`${tSec()}s 공용 쉼터가 화면에 보였다 — 문 앞 (${Math.round(door.x)},${Math.round(door.y)}) 문 곁=${shelterSeen.keep} · 알아본 길=${b.shBy === 'flag' ? '쉼터 지붕(shelter:1)' : '이름표만(지붕 표지 없음)'}`);
    break;
  }
  const bb = polyBox();
  for (let gy = Math.floor(bb.y0 / 256); gy <= Math.floor(bb.y1 / 256); gy++)
    for (let gx = Math.floor(bb.x0 / 256); gx <= Math.floor(bb.x1 / 256); gx++)
      if (inPoly(gx * 256 + 128, gy * 256 + 128)) seen.add(gx + ',' + gy);
  return o;
}
let BLDS = [];
let shelterSeen = null;   // 처음 화면에 보인 공용 쉼터 {x,y,t,keep}
const WALLC = new Set();   // 벽·울타리로 막힌 칸(존 로컬 · 누적 — 벽은 30분 안에 안 사라진다) — ★[T1093] `--old-bot` 만 쓴다
// ★★[T1093 ①-ⓒ 2026-11-03] 벽은 **변**이다(서버 `isBlockedByWall` = 변 · `findCellFence` = 칸 · 도랑 = 지형 `_terrBlocked0`).
//   종전 자는 벽 변의 양쪽 칸을 통째로 막고(보수적), 길이 없으면 둘레 3칸의 막힌 칸을 **진짜 막힘까지** 풀었다(`갇힘 풀기`) —
//   그래서 도랑 · 문 없는 곳간 벽 앞에서 "풀고 → 걸리고 → 또 풀고"를 여덟 번 돌아 stuck×8 을 냈다(T1093 쉼터 길 시험 — 종전 손 167회 중 2회 ·
//   걸린 자리 x 가 칸 경계 1px 앞에 박힘 · 도랑 칸 곁). land1038 실기 "쉼터를 봤으나 못 감(stuck×8)" 의 한 길이다.
//   새 손: 벽 변은 변 표(EDGE_E = 그 칸 동쪽 변 · EDGE_S = 그 칸 남쪽 변)로 길찾기 간선 술어(`stepBlocked`)에 넣고,
//   도랑 칸은 안 푸는 칸(HARDC) · 울타리 칸은 창마다 갈아 끼우는 칸(FENCEC), 갇힘 풀기는 걸려 본 칸(`dyn`)만 푼다.
const EDGE_E = new Set(), EDGE_S = new Set(), HARDC = new Set(), FENCEC = new Set();
function edgeHit(fx, fy, tx, ty) {   // 직교 한 칸 걸음의 변이 벽인가(클라 `clEdgeBlockedStep` 미러를 읽은 변 표 · 서버 `edgeBlockedStep` 과 같은 뜻)
  if (tx === fx + 1) return EDGE_E.has(ck(fx, fy));
  if (tx === fx - 1) return EDGE_E.has(ck(tx, ty));
  if (ty === fy + 1) return EDGE_S.has(ck(fx, fy));
  if (ty === fy - 1) return EDGE_S.has(ck(tx, ty));
  return false;
}
function stepEdge(fx, fy, tx, ty) {   // 한 칸 걸음(8방) — 대각은 두 L 길이 **둘 다** 열려야(서버는 하나면 통과 · 자는 몸 반경 모서리 긁힘을 피해 보수적으로)
  const dx = tx - fx, dy = ty - fy;
  if (dx && dy) return edgeHit(fx, fy, fx + dx, fy) || edgeHit(fx + dx, fy, tx, ty) || edgeHit(fx, fy, fx, fy + dy) || edgeHit(fx, fy + dy, tx, ty);
  return edgeHit(fx, fy, tx, ty);
}
function polyBox() { const xs = POLY.map((p) => p.x), ys = POLY.map((p) => p.y); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; }
function inPoly(x, y) {   // 볼록 사각형(화면 → 월드 사영) — 부호 일관
  let s = 0;
  for (let i = 0; i < 4; i++) { const a = POLY[i], b = POLY[(i + 1) % 4]; const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); if (c !== 0) { if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; } }
  return true;
}

// ── 촌장 문 ────────────────────────────────────────────────────────────────────
//   두 고리 — 굳은 고리(문 + 24px: 절대 안 든다 · 이미 안이면 **지금보다 더 들어가지 않는다**) ·
//   무른 고리(`KEEP` = 문 + 64px: 목표로 안 고르고 길은 비싸게 · 셀 중심 경로의 흔들림 여유).
//   촌장 판은 고리가 없다(어디든 간다).
let VILS = [];           // [{vid,name,ax,ay}] 존 로컬 앵커
let keepCtx = [];
let startInKeep = false;
function keepPrep(from) {
  keepCtx = CHIEF ? [] : VILS.map((v) => { const d = Math.hypot(from.x - v.ax, from.y - v.ay); return { vid: v.vid, ax: v.ax, ay: v.ay, hard: Math.min(C.GATE + 24, d - 8), soft: KEEP }; });
  startInKeep = keepState(from.x, from.y) >= 1;
}
function keepState(x, y) { let st = 0; for (const v of keepCtx) { const d = Math.hypot(x - v.ax, y - v.ay); if (d < v.hard) return 2; if (d < v.soft) st = 1; } return st; }
const keepHit = (x, y) => keepState(x, y) >= 1;

// ── 발: 길찾기 + 따라가기 ──────────────────────────────────────────────────────
const dyn = new Set();   // 걸려 본 칸
function obstacleCells() {
  const s = new Set();
  for (const r of RES) {
    let rad = 0;
    if (r.t === 'tree' && r.r) rad = Math.min(r.r, C.TRUNK_MAX) + C.BODY_R;
    else if (r.t === 'rock' || r.t === 'ore') rad = C.ROCK_R + C.BODY_R;
    if (!rad) continue;
    const c0 = cellOf(r);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = ctr(c0.x + dx, c0.y + dy);
      if (Math.hypot(c.x - r.x, c.y - r.y) < rad + 10) s.add(ck(c0.x + dx, c0.y + dy));   // 줄기가 칸 모서리에 서면 옆 칸 복도까지 먹는다
    }
  }
  return s;
}
let OBS = new Set();
function blockedCell(cx, cy) {
  const k0 = ck(cx, cy);
  if (terrBlocked(cx, cy) || OBS.has(k0) || dyn.has(k0) || WALLC.has(k0) || HARDC.has(k0) || FENCEC.has(k0)) return true;   // ★[T1093] HARDC(도랑) · FENCEC(울타리) — 새 손만 찬다
  const c = ctr(cx, cy), k = keepState(c.x, c.y);
  if (k === 2 || (k === 1 && !startInKeep)) return true;
  return false;
}
function planTo(from, goals) {
  const s = cellOf(from);
  const cand = goals.filter((g) => !blockedCell(g.x, g.y)).map((g) => ({ g, d: Math.hypot(g.x - s.x, g.y - s.y) })).sort((a, b) => a.d - b.d).slice(0, 5);
  let best = null;
  const nb = (x, y) => (x === s.x && y === s.y) ? false : blockedCell(x, y);
  for (const { g } of cand) {
    if (g.x === s.x && g.y === s.y) return [s];
    const p = PathCore.routePath(s.x, s.y, g.x, g.y, {
      blocked: nb,
      stepBlocked: OLDBOT ? undefined : (fx, fy, tx, ty) => nb(tx, ty) || stepEdge(fx, fy, tx, ty),   // ★[T1093] 벽 변 = 간선 술어(경로 정본 `stepBlocked` 문)
      costMul: (x, y) => { const c = ctr(x, y); return keepState(c.x, c.y) === 1 ? 40 : 1; },
      maxPops: 120000 });
    if (p && (!best || p.length < best.length)) best = p;
  }
  return best;
}
async function follow(pathCells, tol) {
  const pts = pathCells.map((c) => ctr(c.x, c.y));
  let i = Math.min(1, pts.length - 1);
  let p = await meL(); let last = p, lastProg = Date.now();
  let plen = Math.hypot(pts[0].x - p.x, pts[0].y - p.y); for (let k = 1; k < pts.length; k++) plen += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
  const t0 = Date.now(), budget = (plen / C.SPEED) * 2200 + 8000;   // 길 길이 ÷ 정본 걸음 × 2.2 + 8초
  for (;;) {
    if (timeUp()) { await setKeys(new Set()); return { ok: false, reason: 'time' }; }
    p = await meL();
    while (i < pts.length - 1 && Math.hypot(pts[i].x - p.x, pts[i].y - p.y) < 14) i++;
    const tg = pts[i];
    const d = Math.hypot(tg.x - p.x, tg.y - p.y);
    if (i === pts.length - 1 && d <= tol) { await setKeys(new Set()); walkedSec += (Date.now() - t0) / 1000; return { ok: true }; }
    await setKeys(new Set(KEYSET[dirOf(tg.x - p.x, tg.y - p.y)]));
    const mv = Math.hypot(p.x - last.x, p.y - last.y);
    if (mv > 10) { walkedPx += mv; last = p; lastProg = Date.now(); }
    else if (Date.now() - lastProg > 1600) {
      await setKeys(new Set()); walkedSec += (Date.now() - t0) / 1000;
      const dd = Math.hypot(tg.x - p.x, tg.y - p.y) || 1, nx = p.x + (tg.x - p.x) / dd * 24, ny = p.y + (tg.y - p.y) / dd * 24;   // 막힌 것은 몸 바로 앞 칸이다
      return { ok: false, reason: 'stuck', cell: cellOf({ x: nx, y: ny }), at: p };
    }
    if (Date.now() - t0 > budget) { await setKeys(new Set()); walkedSec += (Date.now() - t0) / 1000; return { ok: false, reason: 'slow' }; }
    await guard();
    await sleep(90);
  }
}
// 직선으로 가도 되나 — 선분을 8px 마다 짚고, 몸 반경(±8px) 네 귀퉁이 칸이 전부 열려 있어야 한다
function canPass(ax, ay, bx, by) {
  const A = ctr(ax, ay), B = ctr(bx, by), L = Math.hypot(B.x - A.x, B.y - A.y), n = Math.max(1, Math.ceil(L / 8));
  const prev = [null, null, null, null];   // ★[T1093] 새 손 — 네 귀퉁이 선이 칸을 넘을 때마다 그 변(또는 대각 L 길)이 벽이 아닌가
  for (let i = 0; i <= n; i++) {
    const x = A.x + (B.x - A.x) * i / n, y = A.y + (B.y - A.y) * i / n;
    const OFF = [[-8, -8], [8, -8], [-8, 8], [8, 8]];
    for (let j = 0; j < 4; j++) {
      const c = cellOf({ x: x + OFF[j][0], y: y + OFF[j][1] });
      if (blockedCell(c.x, c.y) && !(c.x === ax && c.y === ay)) return false;
      if (!OLDBOT) { const q = prev[j]; if (q && (q.x !== c.x || q.y !== c.y) && stepEdge(q.x, q.y, c.x, c.y)) return false; prev[j] = c; }
    }
  }
  return true;
}
async function walkTo(goals, tol = 10) {
  for (let a = 0; a < 8; a++) {
    await look(); OBS = obstacleCells();
    const from = await meL();
    keepPrep(from);
    let pth = planTo(from, goals);
    if (!pth) {   // ★갇힘 풀기 — 벽 곁 칸은 양쪽을 다 막아 두었다(보수적) · 제 움집 안에 서면 그 둘레가 전부 막힌 칸이 된다.
      //   몸 둘레 3칸의 벽 칸·걸려 본 칸만 한 번 풀고 다시 묻는다(문간은 실제로 열려 있다 — 콜라이더가 판정한다).
      //   ★[T1093] 새 손은 벽을 변 표로 들고 도랑은 HARDC 라 **걸려 본 칸(dyn)만** 푼다 — 진짜 막힘(도랑 · 닫힌 벽)은 안 푼다.
      const c0 = cellOf(from), freed = [];
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const k = ck(c0.x + dx, c0.y + dy); if (OLDBOT && WALLC.delete(k)) freed.push(['w', k]); if (dyn.delete(k)) freed.push(['d', k]); }
      pth = planTo(from, goals);
      if (!pth) { for (const [t, k] of freed) (t === 'w' ? WALLC : dyn).add(k); return { ok: false, reason: 'nopath' }; }
      R.notes.push(`${tSec()}s 갇힘 풀기 — 둘레 ${freed.length}칸`);
    }
    if (pth.length > 2) pth = PathCore.smoothPath(pth, canPass);   // ★경로 정본의 끈당기기(직선 편향 복도 그대로)
    const r = await follow(pth, tol);
    if (r.ok) return r;
    if (r.reason === 'stuck' && r.cell) {
      R.stucks = R.stucks || [];
      if (R.stucks.length < 60) {
        // ★[T1093] 걸린 자리의 진짜 막힘 — 몸 칸 둘레 3×3 의 벽 변(E/S) · 울타리 · 도랑(클라 미러 그대로 · 읽기만)
        const wl = await ev(([ax, ay]) => {
          const out = []; const bx = Math.floor(ax / 32), by = Math.floor(ay / 32);
          for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) {
            let f = '';
            if (typeof clEdgeBlockedStep === 'function') { if (clEdgeBlockedStep(x, y, 1, 0, 0)) f += 'E'; if (clEdgeBlockedStep(x, y, 0, 1, 0)) f += 'S'; }
            if (typeof clHasFenceAt === 'function' && clHasFenceAt(x, y, 0)) f += 'F';
            if (typeof _ditchAbs !== 'undefined' && _ditchAbs.has(x + ',' + y)) f += 'D';
            if (f) out.push(`${x - bx},${y - by}:${f}`);
          }
          return out.join(' ');
        }, [r.at.x + WOX, r.at.y + WOY]).catch(() => '?');
        R.stucks.push({ t: tSec(), at: { x: Math.round(r.at.x), y: Math.round(r.at.y) }, cell: r.cell,
          near: RES.filter((q) => Math.hypot(q.x - r.at.x, q.y - r.at.y) < 48).map((q) => `${q.t}@${Math.round(q.x - r.at.x)},${Math.round(q.y - r.at.y)}`).slice(0, 4),
          terr: terrBlocked(r.cell.x, r.cell.y), wall: wl });
      }
      dyn.add(ck(r.cell.x, r.cell.y));
      const c = cellOf(r.at); dyn.delete(ck(c.x, c.y));
      continue;
    }
    return r;
  }
  return { ok: false, reason: 'stuck×8' };
}
const standAround = (x, y, rad) => {   // 그 점에서 rad 안의 셀 중심들
  const out = [], c0 = cellOf({ x, y }), n = Math.ceil(rad / CELL) + 1;
  for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) { const c = ctr(c0.x + dx, c0.y + dy); if (Math.hypot(c.x - x, c.y - y) <= rad) out.push({ x: c0.x + dx, y: c0.y + dy }); }
  return out;
};

// ── 문 지키기(촌장 없는 판) ────────────────────────────────────────────────────
let _gAt = 0;
async function guard() {
  if (Date.now() - _gAt < 700) return; _gAt = Date.now();
  const s = await ev(() => ({ near: window.__evNearVid == null ? null : window.__evNearVid, greet: !!(window.__onbGreet), dbg: window.__evDbg || null }));
  if (CHIEF) return;
  if (s.near != null || s.greet) {
    if (!R.breaches.length || tSec() - R.breaches[R.breaches.length - 1].t > 30) {
      R.breaches.push({ t: tSec(), near: s.near, greet: s.greet, minD: s.dbg && s.dbg.minD });
      say(`  ⚠ ${(tSec() / 60).toFixed(2)}분  촌장 문 안 — near=${s.near} greet=${s.greet} minD=${s.dbg && s.dbg.minD}`);
    }
  }
}

// ── 손: 채집·제작·먹기·짓기 ────────────────────────────────────────────────────
const diffInv = (a, b) => { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = (b[k] || 0) - (a[k] || 0); if (d && typeof d === 'number' && !['floor'].includes(k)) o[k] = d; } return o; };
const hasRes = (id) => ev((i) => { const c = conns.get(window.__getPrimaryZoneId()); return !!(c && c.resources && c.resources.has(i)); }, id);
async function equipFor(t) {
  const s = await state();
  const pick = (types) => (s.tools || []).find((x) => types.includes(x.type) && x.d > 0);
  const want = t === 'tree' ? pick(['axe', 'crude_axe']) : (t === 'rock' ? pick(['pickaxe', 'crude_pick']) : null);
  if (want && s.eq !== want.id) { await send({ type: 'equip', toolItemId: want.id }); await sleep(250); }
}
const wantMet = (inv, want) => !!want && Object.keys(want).length > 0 && Object.entries(want).every(([k, v]) => (inv[k] || 0) >= v);   // ★[T1126] 모자란 것이 다 찼나
// ★[T1146] 바위를 깎기만 한 타 — 그 타 뒤 서버가 "바위 깎는 중 x/4kg · 남은 돌 n" · "바위 — 돌 n개 떼어 냄 …"을 말했나(공지 기록 `__t511Log` · 읽기만). 사람은 이 말을 보고 계속 친다.
const chipSaid = (t0) => ev((t) => (window.__t511Log || []).some((n) => n.t >= t && /^바위 (깎는 중|— 돌)/.test(n.x)), t0).catch(() => false);
async function gatherRes(r, want) {   // ★[T1126] want = {품목: 수} — 짐이 채우면 그 타에 멈춘다(없으면 종전 — 소스가 사라질 때까지 · 14타)
  const w = await walkTo(standAround(r.x, r.y, STAND).filter((g) => !blockedCell(g.x, g.y)), 10);
  if (!w.ok) { unreach.add(r.id); return { ok: false, reason: w.reason }; }
  await equipFor(r.t);
  const inv0 = (await state()).inv;
  //   ★[T1146] chip = 깎인 kg 말을 들은 타 수 · stall = 짐도 그 말도 없이 친 타 — 그 말이 한 번이라도 오면 14타 상한 대신 "말도 짐도 없이 14타"에 멈춘다
  //     (한 타에 돌 한 개가 안 되는 세계 · 끔 판은 그 말이 안 와 종전 14타 그대로). 모자란 것을 모르는 손(want 없음)은 짐이 하나 들면 멈춘다.
  let n = 0, chip = 0, stall = 0, last = inv0;
  for (; (chip ? stall < 14 : n < 14) && !timeUp(); n++) {
    const t0 = await ev(() => Date.now());
    await send({ type: 'gather', resId: r.id });   // ★우클릭 메뉴가 보내는 그 한 줄(T90 지목) — 1초 간격도 메뉴 반복과 같다
    await sleep(1000);
    if (!(await hasRes(r.id))) { await sleep(150); break; }
    const s = (want || chip) ? await state() : null;
    if (want && wantMet(s.inv, want)) break;   // ★[T1126] 칠 때마다 손에 드는 돌 — 찼으면 멈춘다(사람이 칸의 "지금 돌 n개"를 보고 멈추는 그 타)
    const said = await chipSaid(t0);
    if (said) chip++;
    if (chip) {
      const s1 = s || await state();
      const got = Object.keys(diffInv(last, s1.inv)).length > 0; last = s1.inv;
      stall = (said || got) ? 0 : stall + 1;
      if (!want && Object.keys(diffInv(inv0, s1.inv)).length) break;
      if (!s1.eq) await equipFor(r.t);   // 손의 돌괭이가 닳아 없어졌다 — 가방에 남은 것을 든다(사람이 하는 그 한 번 · 없으면 그대로)
    }
  }
  const d = diffInv(inv0, (await state()).inv);
  if (!Object.keys(d).length && !chip) unreach.add(r.id);   // ★[T1146] 깎인 kg 말을 들은 바위는 못 가는 바위가 아니다(깎인 몫이 그 바위 장부에 남는다 — 다음 돌괭이로 잇는다)
  noteGains(d, r.t);
  return { ok: true, d, hits: n + 1, chip };
}
async function craft(type, recipe, check) {
  await send({ type, recipe });
  for (let i = 0; i < 12; i++) { await sleep(250); const s = await state(); if (check(s)) return true; }
  return false;
}
async function eatOne(item) {
  const h0 = (await state()).g.hunger;
  await send({ type: 'eat', item });              // ★HUD 음식 칸·인벤 메뉴 '먹기'가 보내는 그 한 줄
  for (let i = 0; i < 10; i++) { await sleep(200); const s = await state(); if ((s.inv[item] || 0) === 0 || s.g.hunger > h0 + 0.5) return { h0, h1: s.g.hunger }; }
  return { h0, h1: (await state()).g.hunger };
}

// ── 목표 찾기(보이는 것만) ─────────────────────────────────────────────────────
function visRes(types) {
  return RES.filter((r) => r.on && types.includes(r.t) && !gatedOut(r) && !unreach.has(r.id) && !keepHitStand(r));   // ★[T1065] 맨손이면 나무 · 바위는 고르지 않는다
}
function keepHitStand(r) { return keepHit(r.x, r.y); }
function visCells(pred) {
  if (!POLY) return [];
  const bb = polyBox(), out = [];
  for (let cy = Math.floor(bb.y0 / CELL); cy <= Math.floor(bb.y1 / CELL); cy++)
    for (let cx = Math.floor(bb.x0 / CELL); cx <= Math.floor(bb.x1 / CELL); cx++) {
      const c = ctr(cx, cy);
      if (!inPoly(c.x, c.y) || blockedCell(cx, cy)) continue;
      if (keepHit(c.x, c.y)) continue;
      if (pred(cx, cy, c)) out.push({ x: cx, y: cy });
    }
  return out;
}
const freshEdge = (cx, cy) => { let f = false; for (const [dx, dy] of N4) { const k = waterKind(cx + dx, cy + dy); if (k === 2) return false; if (k === 1) f = true; } return f; };
const nearAnyRes = (c) => RES.some((r) => !gatedOut(r) && Math.hypot(r.x - c.x, r.y - c.y) < C.GATHER);   // ★[T1065] E 최근접이 건너뛰는 것(맨손 나무 · 바위)은 줍기를 안 가린다(존 `tryGather` 고르기와 같은 뜻)
const nearWater = (cx, cy) => N4.some(([dx, dy]) => waterKind(cx + dx, cy + dy) > 0);
const forDepleted = new Map();   // 셀 → 다 훑은 시각
function forageCells(kind) {
  return visCells((cx, cy, c) => {
    const k = ck(cx, cy); const t = forDepleted.get(k); if (t && Date.now() - t < 180000) return false;
    if (kind === 'fiber') return freshEdge(cx, cy) && !nearAnyRes(c);
    if (nearWater(cx, cy) || nearAnyRes(c)) return false;
    const s = Forage.sourceAt(c.x, c.y, fctx(false));
    return !!(s && s.kind === kind);
  });
}
const MAP_R = 4000;
function mapWater(me) {   // 반경 MAP_R 안 가장 가까운 민물 가(설 수 있는 칸) — 64px 격자로 훑고 그 둘레를 다듬는다
  const c0 = cellOf(me); let best = null;
  const n = Math.ceil(MAP_R / CELL);
  for (let dy = -n; dy <= n; dy += 2) for (let dx = -n; dx <= n; dx += 2) {
    const cx = c0.x + dx, cy = c0.y + dy, c = ctr(cx, cy);
    const d = Math.hypot(c.x - me.x, c.y - me.y); if (d > MAP_R || (best && d >= best.d)) continue;
    if (waterKind(cx, cy) !== 1) continue;
    for (const [ex, ey] of N4) { const gx = cx + ex, gy = cy + ey; if (blockedCell(gx, gy) || keepHit(ctr(gx, gy).x, ctr(gx, gy).y) || !freshEdge(gx, gy)) continue; const gd = Math.hypot(ctr(gx, gy).x - me.x, ctr(gx, gy).y - me.y); if (!best || gd < best.d) best = { x: gx, y: gy, d: gd }; }
  }
  return best;
}
const byDist = (me, arr, f) => arr.map((a) => ({ a, d: Math.hypot(f(a).x - me.x, f(a).y - me.y) })).sort((x, y) => x.d - y.d);

// ── 탐색 다리 — 안 보이면 걸어서 찾는다 ─────────────────────────────────────────
//   ★예산은 **일감마다 누적 6분**이다(자 안의 약속). 넘으면 그 일감은 막힘으로 적고 3분 쉬었다 다시 본다.
//   ★[T1093] 단 **찾으면 0부터** — 그 일감이 탐색해 찾던 것(`need` 의 품목)을 손에 넣으면 누적을 비운다. 종전은 찾은 뒤에도 쌓여서
//     돌을 셋 찾은 판도 "못 찾음(stone)" 으로 적혔다(T1093 실측 · 돌괭이 뒤 돌 3/5 · 20.5분). 끔 판 자(`--old-bot`)는 종전 그대로 쌓는다.
let CUR = '시작';
const exploreSec = {}, skipUntil = {};
const exploreFor = {};   // ★[T1093] 일감 → 지금 탐색해 찾는 품목들(마지막 `explore(need)` 의 need)
async function explore(need) {
  const cat = CUR;
  if ((exploreSec[cat] || 0) > 360) {
    // ★[T1093 ①] "화면에 안 보여"는 **화면에 그 소스가 하나도 없을 때만** 맞는 말이다 — 도구 문(T1065)에 걸려 고르지 않은 소스가
    //   화면에 있으면 그 수를 같이 적는다(보이는데 손에 맞는 도구가 없다 · 같은 6분 막힘의 다른 까닭).
    const types = new Set(String(need).split('+').flatMap((it) => (SRC[it] ? SRC[it].res : [])));
    const gv = {}; for (const r of RES) if (r.on && types.has(r.t) && gatedOut(r)) gv[r.t] = (gv[r.t] || 0) + 1;
    const gs = Object.entries(gv).map(([t, n]) => `${t} ${n}`).join(' · ');
    block(cat, `화면에 안 보여 탐색 누적 6분 — 못 찾음(${need})${gs ? ` · 화면엔 있으나 도구 문에 걸림(${gs})` : ''}`, gs ? { gatedVisible: gv } : undefined);
    skipUntil[cat] = Date.now() + 180000; return false;
  }
  const t0 = Date.now();
  exploreFor[cat] = new Set(String(need).split('+'));
  {   // ★[T1093 ①] 탐색을 떠나는 순간 — 찾는 품목의 소스가 화면에 있는데 도구 문에 걸려 안 고른 것이 몇이었나(다리마다 · 막힘 귀속의 증인)
    const types = new Set(String(need).split('+').flatMap((it) => (SRC[it] ? SRC[it].res : [])));
    let g = 0; for (const r of RES) if (r.on && types.has(r.t) && gatedOut(r)) g++;
    const G = R.gatedSeen || (R.gatedSeen = {}); const e = G[need] || (G[need] = { legs: 0, legsWithGated: 0, maxGated: 0 });
    e.legs++; if (g) { e.legsWithGated++; e.maxGated = Math.max(e.maxGated, g); }
  }
  const me = await meL();
  let best = null;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = me.x + Math.cos(a) * 640, y = me.y + Math.sin(a) * 640;
    const c = cellOf({ x, y });
    if (blockedCell(c.x, c.y) || keepHit(x, y)) continue;
    let unseen = 0;
    for (let gy = Math.floor((y - 512) / 256); gy <= Math.floor((y + 512) / 256); gy++)
      for (let gx = Math.floor((x - 512) / 256); gx <= Math.floor((x + 512) / 256); gx++) if (!seen.has(gx + ',' + gy)) unseen++;
    if (!best || unseen > best.unseen) best = { c, unseen, a };
  }
  if (!best) { block(cat, `탐색할 방향이 없다(물·바위·문으로 막힘 · ${need})`); skipUntil[cat] = Date.now() + 180000; return false; }
  const w = await walkTo(standAround(ctr(best.c.x, best.c.y).x, ctr(best.c.x, best.c.y).y, 48), 24);
  R.explore.legs++; R.explore.sec += (Date.now() - t0) / 1000; exploreSec[cat] = (exploreSec[cat] || 0) + (Date.now() - t0) / 1000;
  R.legs.push({ t: tSec(), kind: 'explore', need, ok: w.ok, reason: w.reason || null, sec: +((Date.now() - t0) / 1000).toFixed(1) });
  if (!w.ok) { dyn.add(ck(best.c.x, best.c.y)); }
  return true;
}

// ── 일 하나씩 ─────────────────────────────────────────────────────────────────
// 처음 손에 든 것 — 어느 갈래로 들어왔든(덤불·갈대·바위·나무·줍기) 그 순간을 적는다
function noteGains(d, how) {
  if (!d) return;
  // ★[T1093] 찾으면 0부터 — 지금 일감이 탐색해 찾던 품목을 얻었으면 그 일감의 탐색 누적을 비운다(`--old-bot` = 종전)
  if (!OLDBOT && exploreFor[CUR] && Object.entries(d).some(([k, v]) => v > 0 && exploreFor[CUR].has(k))) { if ((exploreSec[CUR] || 0) > 0) R.notes.push(`${tSec()}s [${CUR}] 찾음(${Object.keys(d).filter((k) => d[k] > 0 && exploreFor[CUR].has(k)).join('+')}) — 탐색 누적 ${Math.round(exploreSec[CUR])}초 → 0`); exploreSec[CUR] = 0; }
  if (d.berry > 0) mark('첫 열매', { how, berry: d.berry });
  if (d.fiber > 0 && how === '갈대') mark('첫 갈대', { fiber: d.fiber });
  if (d.fiber > 0) mark('첫 섬유', { how });
  if (d.wood > 0) mark('첫 통나무', { how, wood: d.wood });
  if (d.stone > 0) mark('첫 돌', { how });
}
async function goDrink(first) {
  await look(); OBS = obstacleCells();
  const me = await meL();
  const cells = visCells((cx, cy) => freshEdge(cx, cy));
  const pools = visRes(['water_pool']);
  let opts = byDist(me, cells.map((c) => ({ kind: 'edge', c, p: ctr(c.x, c.y) })).concat(pools.map((r) => ({ kind: 'pool', r, p: r }))), (o) => o.p);
  if (!opts.length) {
    // ★화면에 물이 없으면 **지도(M)** 를 연다 — 상세 지도는 강·호수를 그린다(`80-bigmap` · 바다와 같은 색이지만 모양으로 가른다).
    //   지도가 그리는 그 지형은 존 정본 술어다 ⇒ 가장 가까운 민물 가를 정본으로 찾는다(반경 `MAP_R`).
    const m = mapWater(me);
    if (m) { opts = [{ a: { kind: 'map', c: m, p: ctr(m.x, m.y) }, d: Math.hypot(ctr(m.x, m.y).x - me.x, ctr(m.x, m.y).y - me.y) }]; R.notes.push(`${tSec()}s 지도(M)로 물 — ${Math.round(opts[0].d)}px`); }
  }
  if (!opts.length) return explore('물');
  const o = opts[0].a;
  const t0 = Date.now();
  if (o.kind === 'map') { await press('KeyM'); await sleep(600); await press('KeyM'); }   // 지도를 한 번 열어 보고 닫는다(사람 손)
  const w = o.kind !== 'pool' ? await walkTo(o.kind === 'map' ? standAround(ctr(o.c.x, o.c.y).x, ctr(o.c.x, o.c.y).y, 40).filter((g) => freshEdge(g.x, g.y)) : [o.c], 8)
    : await walkTo(standAround(o.r.x, o.r.y, STAND), 10);
  R.legs.push({ t: tSec(), kind: 'drink', how: o.kind, ok: w.ok, reason: w.reason || null, sec: +((Date.now() - t0) / 1000).toFixed(1) });
  if (!w.ok) { if (o.kind !== 'pool') dyn.add(ck(o.c.x, o.c.y)); else unreach.add(o.r.id); return true; }
  if (o.kind === 'pool') {   // 둠벙 — 개체라 **지목**해서 마신다(우클릭 메뉴가 보내는 그 한 줄) · E 는 곁의 나무를 먼저 칠 수 있다
    for (let i = 0; i < 6 && !timeUp(); i++) {
      const s0 = await state(); if (s0.g.thirst >= 94) break;
      await send({ type: 'gather', resId: o.r.id }); await sleep(900);
      const s1 = await state();
      if (s1.g.thirst > s0.g.thirst + 1) mark('물', { thirst: `${Math.round(s0.g.thirst)}→${Math.round(s1.g.thirst)}`, how: '둠벙' }); else { unreach.add(o.r.id); break; }
    }
    return true;
  }
  // 물가에서 E — 목이 마르면 마시고(<95%), 아니면 갈대를 벤다(`tryGather` 그 갈래)
  for (let i = 0; i < 70 && !timeUp(); i++) {
    const s0 = await state();
    await press('KeyE');
    await sleep(1000);
    const s1 = await state();
    if (s1.g.thirst > s0.g.thirst + 1) { mark('물', { thirst: `${Math.round(s0.g.thirst)}→${Math.round(s1.g.thirst)}`, how: o.kind }); if (s1.g.thirst >= 94) break; continue; }
    if ((s1.inv.fiber || 0) > (s0.inv.fiber || 0)) { noteGains({ fiber: 1 }, '갈대'); if (!first || R.milestones['물']) break; continue; }
    // 마르지도 늘지도 않았다 — 다 훑었거나 안 되는 자리
    if (o.kind === 'edge') forDepleted.set(ck(o.c.x, o.c.y), Date.now());
    break;
  }
  return true;
}
async function goReeds(want) {   // 섬유 — 민물 가에서 E(목이 차 있을 때)
  await look(); OBS = obstacleCells();
  const me = await meL();
  const cells = forageCells('fiber');
  if (!cells.length) return false;
  const o = byDist(me, cells, (c) => ctr(c.x, c.y))[0].a;
  const w = await walkTo([o], 8);
  if (!w.ok) { dyn.add(ck(o.x, o.y)); return true; }
  for (let i = 0; i < 6 && !timeUp(); i++) {
    const s0 = await state(); if ((s0.inv.fiber || 0) >= want) break;
    await press('KeyE'); await sleep(1000);
    const s1 = await state();
    if ((s1.inv.fiber || 0) > (s0.inv.fiber || 0)) { noteGains({ fiber: 1 }, '갈대'); continue; }
    if (s1.g.thirst > s0.g.thirst + 1) { mark('물', { thirst: `${Math.round(s0.g.thirst)}→${Math.round(s1.g.thirst)}`, how: 'edge' }); continue; }
    forDepleted.set(ck(o.x, o.y), Date.now()); break;
  }
  return true;
}
async function goForage(kind) {  // 잔가지(숲 바닥)·자갈(자갈 지형) — 맨땅 E
  const me = await meL();
  const cells = forageCells(kind);
  if (!cells.length) return false;
  const o = byDist(me, cells, (c) => ctr(c.x, c.y))[0].a;
  const w = await walkTo([o], 8);
  if (!w.ok) { dyn.add(ck(o.x, o.y)); return true; }
  for (let i = 0; i < 5 && !timeUp(); i++) {
    const s0 = await state();
    await press('KeyE'); await sleep(1000);
    const s1 = await state();
    if ((s1.inv[kind] || 0) <= (s0.inv[kind] || 0)) { forDepleted.set(ck(o.x, o.y), Date.now()); break; }
    noteGains({ [kind]: 1 }, '줍기');
  }
  return true;
}
// 재료 하나를 얻는 가장 가까운 길 — 개체(덤불·바위·나무) 또는 줍기 자리
const SRC = {
  berry: { res: ['berry_bush'], forage: null },
  fiber: { res: ['berry_bush'], forage: 'fiber' },
  twig: { res: ['berry_bush', 'tree'], forage: 'twig' },
  pebble: { res: ['rock'], forage: 'pebble' },
  stone: { res: ['rock'], forage: null },
  wood: { res: ['tree'], forage: null },
  herb: { res: ['herb'], forage: null },
};
async function fetchOne(item, want) {   // ★[T1126] want — 칸이 말한 만들 것의 레시피(그만큼 차면 캐기를 멈춘다 · 없으면 종전)
  await look(); OBS = obstacleCells();
  const me = await meL();
  const src = SRC[item];
  const rs = visRes(src.res);
  const fc = src.forage ? forageCells(src.forage) : [];
  const cand = byDist(me, rs.map((r) => ({ r, p: r })).concat(fc.map((c) => ({ c, p: ctr(c.x, c.y) }))), (o) => o.p);
  if (!cand.length) { if (PANELBOT && await tryGated([item])) return true; return explore(item); }   // ★[T1120] 맨손으로 못 따는 소스만 있으면 한 번 눌러 본다
  const o = cand[0].a;
  if (o.r) {
    const t0 = Date.now();
    const g = await gatherRes(o.r, want);
    R.legs.push({ t: tSec(), kind: 'gather', item, res: o.r.t, ok: g.ok, d: g.d || null, reason: g.reason || null, hits: g.hits || 0, chip: g.chip || 0, sec: +((Date.now() - t0) / 1000).toFixed(1) });   // ★[T1146] 친 타 수 · 깎인 kg 말을 들은 타(읽기만 · 표가 센다)
    return true;
  }
  if (src.forage === 'fiber') return goReeds(99);
  return goForage(src.forage);
}
// ★[T1093 ①-ⓑ] 도구 문 사다리 — 맨손으로 못 따는 재료(나무 · 돌)가 모자라고 그 도구가 없으면 **급조 도구부터** 만든다.
//   사람은 맨손 채석 거절 한 줄("조잡한 돌괭이가 있어야 돌을 캘 수 있습니다. 자갈 3개, 잔가지 1개, 풀 2개로 제작 창에서 …
//   자갈은 바위 곁에서 맨손으로 주울 수 있습니다." — 존 `_t1065Gate` 정본)을 읽고 이 일을 한다. 종전 자는 바위를 목표에서
//   빼기만 하고(T1065) 돌괭이를 몰라 화면의 바위를 두고 "화면에 안 보여"로 6분을 걸었다(land1038 실기 17.7분 [잠자리] · 29.8분 [움집]).
//   레시피 · 도구 이름은 존 정본(`RECIPES` · `T1065_NEED` 와 같은 짝)에서 읽는다 — 사본 0. 끔(`T1065_TOOL_GATE=0`)이면 무동작(null).
const LADDER = { wood: { has: ['axe', 'crude_axe'], make: 'crude_axe' }, stone: { has: ['pickaxe', 'crude_pick'], make: 'crude_pick' } };
async function toolFirst(miss) {   // → null(사다리 몫 없음) | true/false(한 걸음 했다/못 했다)
  if (!GATE || OLDBOT || PANELBOT) return null;   // ★[T1120] 칸을 읽는 손은 사다리를 모른다(칸이 말해야 안다)
  for (const it of miss) {
    const L = LADDER[it]; if (!L || _has(L.has)) continue;
    const rc = Z.RECIPES[L.make] && Z.RECIPES[L.make].cost; if (!rc) continue;
    const s = await state();
    if (Object.entries(rc).every(([k, n]) => (s.inv[k] || 0) >= n)) {
      if (await craft('craft', L.make, (q) => toolHas(q, L.make))) mark(`${Z.RECIPES[L.make].label || L.make}(손 제작 · ${it})`);
      else block(CUR, `craft ${L.make} 가 안 됐다`);
      return true;
    }
    return fetchMissing(rc);   // 재료(자갈 · 잔가지 · 풀)는 맨손으로 딴다 — 사다리 칸이 아니라 무한 되부름 0
  }
  return null;
}
async function fetchMissing(need) {   // need = {item: n} — 모자란 것 중 가장 가까운 것 하나를 딴다
  const s = await state();
  const miss = Object.entries(need).filter(([k, n]) => (s.inv[k] || 0) < n).map(([k]) => k);
  if (!miss.length) return false;
  { const tf = await toolFirst(miss); if (tf !== null) return tf; }   // ★[T1093 ①-ⓑ] 도구 문 사다리(맨손으로 못 따는 재료면 급조 도구부터)
  await look(); OBS = obstacleCells();
  const me = await meL();
  let best = null;
  for (const it of miss) {
    const src = SRC[it]; if (!src) continue;
    for (const r of visRes(src.res)) { const d = Math.hypot(r.x - me.x, r.y - me.y); if (!best || d < best.d) best = { it, r, d }; }
    if (src.forage) for (const c of forageCells(src.forage)) { const p = ctr(c.x, c.y); const d = Math.hypot(p.x - me.x, p.y - me.y) + 64; if (!best || d < best.d) best = { it, c, d }; }
  }
  if (!best) { if (PANELBOT && await tryGated(miss)) return true; return explore(miss.join('+')); }   // ★[T1120] 맨손으로 못 따는 소스만 있으면 한 번 눌러 본다
  if (best.r) {
    const t0 = Date.now();
    const g = await gatherRes(best.r, { [best.it]: need[best.it] });   // ★[T1126] 이 소스에서 따는 그 품목이 모자란 만큼만
    R.legs.push({ t: tSec(), kind: 'gather', item: best.it, res: best.r.t, ok: g.ok, d: g.d || null, reason: g.reason || null, hits: g.hits || 0, chip: g.chip || 0, sec: +((Date.now() - t0) / 1000).toFixed(1) });   // ★[T1146] 친 타 수 · 깎인 kg 말을 들은 타(읽기만)
    return true;
  }
  if (SRC[best.it].forage === 'fiber') return goReeds(need.fiber || 99);
  return goForage(SRC[best.it].forage);
}

// ★[T1120] 「지금 할 일」 읽기(훅 `__t1064Next` — 칸이 마지막에 그린 것 · 읽기만)
async function panelNow() { return ev(() => (window.__t1064Next ? window.__t1064Next() : null)).catch(() => null); }
// ★[T1120] 맨손으로 못 따는 소스(도구 문에 걸린 바위 · 나무)만 화면에 있으면 **한 번** 눌러 본다 — 사람이 바위를 우클릭해 "채굴"을 눌러 보는 그 한 번.
//   서버가 거절하며 알림에 막힘을 싣는다(켬) — 칸이 그걸 잇는다. 품목마다 한 판에 한 번(끔 판도 같은 한 번 · 칸이 무엇을 말하나만 다르다).
const triedGate = new Set();
async function tryGated(items) {
  const me = await meL();
  let best = null;
  for (const it of items) {
    if (triedGate.has(it) || !SRC[it]) continue;
    for (const r of RES) {
      if (!r.on || !SRC[it].res.includes(r.t) || !gatedOut(r) || unreach.has(r.id) || keepHitStand(r)) continue;
      const d = Math.hypot(r.x - me.x, r.y - me.y); if (!best || d < best.d) best = { it, r, d };
    }
  }
  if (!best) return false;
  triedGate.add(best.it);
  const t0 = Date.now();
  const w = await walkTo(standAround(best.r.x, best.r.y, STAND).filter((g) => !blockedCell(g.x, g.y)), 10);
  if (w.ok) { await send({ type: 'gather', resId: best.r.id }); await sleep(1200); }   // ★우클릭 메뉴 "채굴"이 보내는 그 한 줄(맨손 — 서버가 거절한다)
  const n = await panelNow();
  R.legs.push({ t: tSec(), kind: 'try-gated', item: best.it, res: best.r.t, ok: w.ok, reason: w.reason || null, sec: +((Date.now() - t0) / 1000).toFixed(1), panel: n ? `${n.stage}:${n.item}` : null });
  R.notes.push(`${tSec()}s [${CUR}] 맨손으로 ${best.r.t} 눌러 봄(${best.it}) — 칸 ${n ? `「${n.item}」` : '없음'}`);
  return true;
}
// ★[T1120] 칸이 말한 한 칸을 한다 — 만들기 · 손에 들기 · 맨손 줍기 · 캐기(무엇을 = 칸의 `step` · 글자는 안 읽는다)
async function followPanel(n) {
  const st = n && n.step; if (!st) return false;
  (R.panel || (R.panel = [])).push({ t: tSec(), item: n.item, do: st.do, what: st.what });
  if (st.do === 'craft') {
    if (await craft('craft', st.what, (q) => toolHas(q, st.what))) mark(st.what === 'pickaxe' ? '곡괭이(손 제작)' : `${(Z.RECIPES[st.what] && Z.RECIPES[st.what].label) || st.what}(칸 따라 손 제작)`);
    else block(CUR, `칸이 말한 craft ${st.what} 가 안 됐다`);
    return true;
  }
  if (st.do === 'equip') {
    const s = await state();
    const inst = (s.tools || []).find((x) => x.type === st.what && x.d > 0);
    if (inst) { await send({ type: 'equip', toolItemId: inst.id }); await sleep(300); }   // ★가방에서 골라 손에 드는 그 한 줄
    return true;
  }
  const mk = st.make && Z.RECIPES[st.make] && Z.RECIPES[st.make].cost;   // ★[T1126] 칸이 말한 만들 것의 레시피 — 그만큼 차면 멈춘다
  return fetchOne(st.what, mk ? { [st.what]: mk[st.what] || 1 } : null);   // fetch(맨손 줍기) · gather(손에 든 도구로 캐기) — 그 품목을 가장 가까운 소스에서
}

// ── 불·쉼·집 ─────────────────────────────────────────────────────────────────
let fire = null;   // {x,y} 존 로컬
async function makeFire() {
  const s = await state();
  if ((s.inv.wood || 0) < 3) return fetchMissing({ wood: 3 });
  const me = await meL();
  const n0 = BLDS.filter((b) => b.type === 'campfire').length;
  await press('KeyJ');                             // ★J = 모닥불(`99-main` 키 — 발밑에 짓는다)
  for (let i = 0; i < 10; i++) {
    await sleep(300); await look();
    const f = BLDS.find((b) => b.type === 'campfire' && Math.hypot(b.x - me.x, b.y - me.y) < 48);
    if (f) { fire = { x: f.x, y: f.y }; mark('첫 불', { how: 'J 모닥불(통나무 3)' }); return true; }
  }
  if (BLDS.filter((b) => b.type === 'campfire').length === n0) { dyn.add(ck(cellOf(me).x, cellOf(me).y)); R.notes.push(`${tSec()}s 모닥불 J 실패 — 자리 옮김`); }
  const w = await walkTo(standAround(me.x + 64, me.y, 40), 10);
  void w; return true;
}
async function warmUp(sev) {
  if (!fire) return false;
  const t0 = Date.now();
  const w = await walkTo(standAround(fire.x, fire.y, 56).filter((g) => !(g.x === cellOf(fire).x && g.y === cellOf(fire).y)), 10);
  if (!w.ok) return false;
  for (let i = 0; i < 60 && !timeUp(); i++) { const s = await state(); const c = s.body ? s.body.cold : 0; if (c < sev - 0.15 || c < 0.3) break; await sleep(2000); }
  R.legs.push({ t: tSec(), kind: 'warm', sec: +((Date.now() - t0) / 1000).toFixed(1) });
  return true;
}
// 잠자리 첫 단 — **보이는** 공용 쉼터(마을 건물 `shelter`)가 문 밖이면 걸어간다. 안 보이거나 문 안이면 내 움집 사다리로.
//   ⚠이름표 없이 그 집이 쉼터인지 알아보는가는 이 자가 못 잰다(T507 ③ 커서 이름표 몫) — 자는 "길이 있나"만 잰다.
async function sleepStep() {
  await look();
  // ★[T1093 ①-ⓒ] 쉼터 길이 한 번 끊겼다고 영영 버리지 않는다 — 사람은 둘러 가서 다시 가 본다.
  //   종전 자는 첫 실패(stuck×8 등) 한 번에 `fail` 을 박고 30분 끝까지 쉼터를 다시 안 봤다(land1038 실기 "쉼터를 봤으나 못 감(stuck×8)" ·
  //   그 뒤 잠자리 일감이 움집 사다리로 떨어져 "[잠자리] … 못 찾음" 이 된다). ⇒ 탐색 막힘과 같은 쉼(3분 · `skipUntil` 의 그 수) 뒤 다시 간다 —
  //   그때 걸려 본 칸(`dyn` · 30분 내내 쌓이기만 했다)을 비우고 새로 본다. 실패마다 걸린 자리(문 앞 기준)를 다리에 적는다.
  if (!OLDBOT && shelterSeen && shelterSeen.fail && shelterSeen.retryAt && Date.now() >= shelterSeen.retryAt) { shelterSeen.fail = null; dyn.clear(); }
  if (shelterSeen && !shelterSeen.keep && !shelterSeen.fail) {
    const t0 = Date.now(); R.stucks = R.stucks || []; const st0 = R.stucks.length;
    const w = await walkTo(standAround(shelterSeen.x, shelterSeen.y, 40).filter((g) => !blockedCell(g.x, g.y)), 14);
    const st = R.stucks.slice(st0).map((q) => ({ t: q.t, at: { x: q.at.x - Math.round(shelterSeen.x), y: q.at.y - Math.round(shelterSeen.y) }, near: q.near, terr: q.terr, wall: q.wall }));
    R.legs.push({ t: tSec(), kind: 'shelter', ok: w.ok, reason: w.reason || null, sec: +((Date.now() - t0) / 1000).toFixed(1), try: (shelterSeen.tries || 0) + 1, stucks: st });
    if (w.ok) { mark('첫 잠자리', { how: '공용 쉼터(보고 찾음 · 촌장 문 밖)', try: (shelterSeen.tries || 0) + 1 }); return true; }
    shelterSeen.fail = w.reason; shelterSeen.tries = (shelterSeen.tries || 0) + 1; shelterSeen.retryAt = Date.now() + 180000;
    if (SHOTS) _shotQ.push({ label: '쉼터-못감', need: '첫 잠자리', reason: w.reason });   // ★[T1093 ④] 길이 끊긴 그 자리
    return true;
  }
  return hutStep();
}
// 움집 사다리 — 곡괭이(손 제작) → 터파기 → 도끼 → 기둥 6 → 서까래 8·풀 6 → 이엉 8
let site = null;   // {id,x,y}
const toolHas = (s, t) => (s.tools || []).some((x) => x.type === t && x.d > 0);
// ★[T1186] 곡괭이 · 도끼 재료는 서버 레시피 표(`Z.RECIPES` — 같은 손잡이 env 로 읽은 같은 정본)에서 — 손으로 적은 돌 5 · 2 를 걷었다(끔이면 그 값 그대로)
const PICK_COST = Object.assign({}, Z.RECIPES.pickaxe.cost), AXE_COST = Object.assign({}, Z.RECIPES.axe.cost);
const haveAll = (s, c) => Object.entries(c).every(([k, v]) => (s.inv[k] || 0) >= v);
async function hutStep() {
  const s = await state();
  if (!toolHas(s, 'pickaxe') && !site) {
    if (haveAll(s, PICK_COST)) { if (await craft('craft', 'pickaxe', (q) => toolHas(q, 'pickaxe'))) mark('곡괭이(손 제작)'); return true; }   // ★[T1186] 레시피 표 그대로(돌 규칙 켬 = 날 kg 을 담는 덩이 · 끔 = 종전 돌 5)
    return fetchMissing(PICK_COST);
  }
  if (!site) {
    await look();
    const me = await meL(); const c0 = cellOf(me);
    let pick = null;
    for (let r = 0; r <= 5 && !pick; r++) for (let dy = -r; dy <= r && !pick; dy++) for (let dx = -r; dx <= r && !pick; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const cx = c0.x + dx, cy = c0.y + dy, cc = ctr(cx, cy);
      if (Math.hypot(cc.x - me.x, cc.y - me.y) > 180 || keepHit(cc.x, cc.y)) continue;
      let okk = true;
      for (let x = cx - 4; x <= cx + 3 && okk; x++) for (let y = cy - 3; y <= cy + 2 && okk; y++) if (terrBlocked(x, y)) okk = false;
      for (const b of BLDS) { const bc = cellOf(b); if (bc.x >= cx - 4 && bc.x <= cx + 3 && bc.y >= cy - 3 && bc.y <= cy + 2) okk = false; }
      if (okk) pick = { cx, cy, cc };
    }
    if (!pick) { const w = await walkTo(standAround(me.x + 160, me.y + 96, 48), 20); void w; return true; }
    await send({ type: 'hut_start', atX: pick.cc.x, atY: pick.cc.y });   // ★건축 모드 커서 배치가 보내는 그 한 줄(존 로컬)
    for (let i = 0; i < 10 && !site; i++) { await sleep(300); await look(); const b = BLDS.find((q) => q.type === 'hut_site' && Math.hypot(q.x - pick.cc.x, q.y - pick.cc.y) < 96); if (b) site = { id: b.id, x: b.x, y: b.y }; }
    if (site) mark('움집터(① 굴착)'); else { R.notes.push(`${tSec()}s hut_start 실패`); dyn.add(ck(pick.cx, pick.cy)); }
    return true;
  }
  const b = BLDS.find((q) => q.id === site.id) || (await look(), BLDS.find((q) => q.id === site.id));
  if (!b) {   // ★터가 안 보인다 = 청크가 꺼졌다(클라는 켜진 청크의 건물만 든다) — 잃은 게 아니다. 터 곁으로 돌아가면 다시 뜬다.
    if (BLDS.some((q) => q.type === 'hut' && Math.hypot(q.x - site.x, q.y - site.y) < 96)) { site.done = true; return true; }
    const w = await walkTo(standAround(site.x, site.y, 100).filter((g) => !blockedCell(g.x, g.y)), 16);
    if (!w.ok) R.notes.push(`${tSec()}s 움집터에 못 돌아감 ${w.reason}`);
    return true;
  }
  const stage = b.stage | 0;
  let need = null;
  if (stage === 1) {
    if (!toolHas(s, 'axe')) { if (haveAll(s, AXE_COST)) { if (await craft('craft', 'axe', (q) => toolHas(q, 'axe'))) mark('도끼(손 제작)'); return true; } return fetchMissing(AXE_COST); }
    if ((s.inv.pillar || 0) < 6) { if ((s.inv.wood || 0) >= 3) { await craft('craft_item', 'pillar', (q) => (q.inv.pillar || 0) > (s.inv.pillar || 0)); return true; } return fetchMissing({ wood: 3 }); }
    need = 'pillar';
  } else if (stage === 2) {
    if ((s.inv.rafter || 0) < 8) { if (!toolHas(s, 'axe')) return fetchMissing(AXE_COST); if ((s.inv.wood || 0) >= 1) { await craft('craft_item', 'rafter', (q) => (q.inv.rafter || 0) > (s.inv.rafter || 0)); return true; } return fetchMissing({ wood: 1 }); }
    if ((s.inv.fiber || 0) < 6) return fetchMissing({ fiber: 6 });
    need = 'rafter';
  } else if (stage === 3) {
    if ((s.inv.thatch || 0) < 8) { if ((s.inv.fiber || 0) >= 4) { await craft('craft_item', 'thatch', (q) => (q.inv.thatch || 0) > (s.inv.thatch || 0)); return true; } return fetchMissing({ fiber: 4 }); }
    need = 'thatch';
  }
  if (need) {
    const w = await walkTo(standAround(b.x, b.y, 100).filter((g) => !blockedCell(g.x, g.y)), 12);
    if (!w.ok) { R.notes.push(`${tSec()}s 움집터에 못 감 ${w.reason}`); return true; }
    await send({ type: 'hut_advance', buildingId: site.id });   // ★움집터 클릭이 보내는 그 한 줄
    for (let i = 0; i < 10; i++) {
      await sleep(300); await look();
      const nb = BLDS.find((q) => q.id === site.id);
      if (!nb) { if (BLDS.some((q) => q.type === 'hut' && Math.hypot(q.x - site.x, q.y - site.y) < 96)) { mark('움집 완공'); site.done = true; if (!R.milestones['첫 잠자리']) mark('첫 잠자리', { how: '내 움집(완공)' }); } break; }
      if ((nb.stage | 0) > stage) { mark(`움집 ${['', '①', '②', '③', '④'][stage + 1]} 단계`); break; }
    }
  }
  return true;
}

// ── 몸 표본(5초) · 1단계 넘김 ───────────────────────────────────────────────────
let _sampling = false, _frPrev = null;
async function sampleOnce() {
  if (_sampling || !T0) return; _sampling = true;
  try {
    const now = Date.now();
    const fr = await ev(() => window.__t511Fr | 0);
    const fps = _frPrev ? +((fr - _frPrev.n) / ((now - _frPrev.t) / 1000)).toFixed(1) : null; _frPrev = { n: fr, t: now };
    const s = await state(); const p = await meL();
    const b = s.body || {};
    const mood = {}; for (const m of (b.moodles || [])) mood[m.axis] = m.stage;
    const row = { t: tSec(), ph: +ZC.worldPhase(now).toFixed(3), night: ZC.isNight(now), x: Math.round(p.x), y: Math.round(p.y),
      hunger: +(+s.g.hunger).toFixed(1), thirst: +(+s.g.thirst).toFixed(1), cold: b.cold, fatigue: b.fatigue, wet: b.wet, mood, fps, mm: b.moveMult };
    R.samples.push(row);
    for (const ax of ['hunger', 'thirst', 'cold', 'fatigue', 'injury']) {
      const st = mood[ax] | 0;
      const a = R.stage1[ax] || (R.stage1[ax] = { first: null, max: 0, maxAt: null, out: null });
      if (st >= 1 && a.first === null) a.first = row.t;
      if (st > a.max) { a.max = st; a.maxAt = row.t; }
      if (st === 0 && a.first !== null && a.out === null) a.out = row.t;
    }
  } catch (e) { R.errors.push('sample: ' + String(e.message).slice(0, 120)); }
  _sampling = false;
}

// ── 판 ────────────────────────────────────────────────────────────────────────
(async () => {
  R.bootAt = Date.now();
  say(`\n=== T511 첫 30분 실기 자 — ${TAG} (계절 ${SEASON} = 게임일 ${SDAY} · 시작 ${START} · 상한 ${CAP_MIN}분 · 문 ${C.GATE}px/지킴 ${KEEP}px) ===`);
  const cen = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const upC = FB.waitUp(cen, /central server up on/, { name: 'central' });
  if (WARMDB) {   // ① 산 세계 — 줄인 하루로 n 초 돌리고 내린다(같은 DB)
    const z1 = boot('zone-warm', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
      VILLAGE_MAX: '4', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_DAY_MS: '500' });
    const u1 = await FB.waitUp(z1, /zone server up on/, { name: 'zone-warm', capMs: 300000 });
    if (!u1.ok) { say('데우기 존 기동 실패'); process.exit(1); }
    await sleep(WARMDB * 1000);
    await new Promise((res) => { z1.once('exit', res); try { z1.kill('SIGTERM'); } catch (e) { res(); } setTimeout(res, 8000); });
    await sleep(1500);
    say(`  산 세계 — 줄인 하루(0.5초)로 ${WARMDB}초 살고 내렸다(같은 DB로 보통 존을 다시 띄운다)`);
  }
  const zon = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '4', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' });
  const upZ = FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 300000 });
  const a = await upC, b = await upZ;
  if (!a.ok || !b.ok) { say(`기동 실패 central=${a.ok} zone=${b.ok} ${a.why || ''} ${b.why || ''}`); process.exit(1); }
  say(`  기동 — central ${a.ms}ms · zone ${b.ms}ms`);
  let info = null;
  for (let i = 0; i < 120 && !info; i++) { const j = await jget(`http://localhost:${ZPORT}/startinfo`); if (j && j.ok && j.villages && j.villages.length && j.villages.every((v) => v.arrive)) info = j; else await sleep(2000); }
  if (!info) { say('startinfo 없음'); process.exit(1); }
  VILS = info.villages.map((v) => ({ vid: v.vid, name: v.name, ax: v.cx * CELL + 16, ay: v.cy * CELL + 16, arrive: v.arrive }));
  let V = info.villages.find((v) => v.vid === info.recommend) || info.villages[0];
  R.village = { vid: V.vid, name: V.name, ch: V.ch || null, anchor: { x: V.cx * CELL + 16, y: V.cy * CELL + 16 }, arrive: V.arrive,
    arriveToAnchor: Math.round(Math.hypot(V.arrive.x - (V.cx * CELL + 16), V.arrive.y - (V.cy * CELL + 16))) };
  R.villages = VILS.map((v) => ({ vid: v.vid, name: v.name, ax: v.ax, ay: v.ay }));
  const sh = await jget(`http://localhost:${ZPORT}/shelterdbg`);
  const shRow = sh && sh.rows ? sh.rows.find((r) => r.vid === V.vid) : null;
  R.shelter = shRow && shRow.shelter ? { x: shRow.shelter.x, y: shRow.shelter.y, toAnchor: Math.round(Math.hypot(shRow.shelter.x - R.village.anchor.x, shRow.shelter.y - R.village.anchor.y)) } : null;
  say(`  마을 ${V.name}(vid ${V.vid}) · 도착점→중심 ${R.village.arriveToAnchor}px · 쉼터→중심 ${R.shelter ? R.shelter.toAnchor + 'px' : '없음(아직)'}`);
  const perf0 = await jget(`http://localhost:${ZPORT}/perf?reset=1`); void perf0;

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: process.env.MINI_CHROMIUM_EXECUTABLE || require('playwright').chromium.executablePath() });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => R.errors.push('page: ' + String(e.message).slice(0, 140)));
  await page.addInitScript(() => {   // 프레임 수(렌더가 걸음을 깎지 않는지 표본마다 본다) — 읽기만
    window.__t511Fr = 0; const f = () => { window.__t511Fr++; requestAnimationFrame(f); }; requestAnimationFrame(f);
  });
  await page.addInitScript(() => {   // 공지 전부를 시각과 함께(40칸 고리 밖) — 읽기만
    const a = []; a.push = function (...xs) { for (const x of xs) (window.__t511Log || (window.__t511Log = [])).push({ t: Date.now(), x: String(x) }); return Array.prototype.push.apply(this, xs); };
    window.__notices = a;
  });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  let lobbyOk = false;
  //   ★시작 지역 칸(`#startZone`)이 차야 「나루터로 간다」가 산다 — central 이 존을 재고(RTT) 칸을 채우기 전 클릭은 헛클릭이다
  for (let i = 0; i < 90 && !lobbyOk; i++) { lobbyOk = await ev(() => { const z = document.getElementById('startZone'); return !!(document.getElementById('onbAny') && window.__onbInfo && window.__onbInfo() && z && z.value); }); if (!lobbyOk) await sleep(700); }
  if (!lobbyOk) { await page.screenshot({ path: `/tmp/t511/${TAG}-lobby.png` }).catch(() => {}); throw new Error('로비 시작 화면이 안 섰다'); }
  // ★낮/밤 시작 맞추기 — 세계 시계(정본 `worldPhase`)의 새벽(0) 또는 해질녘(dayPhaseRatio)에 도착하도록 기다린다
  const W = ZC.WORLD;
  const target = START === 'day' ? 0 : W.dayPhaseRatio;
  if (ALIGN) {
    const now = Date.now(), ph = ZC.worldPhase(now);
    let waitMs = ((target - ph + 1) % 1) * W.dayLengthMs + 1000;   // 경계 1초 뒤에 누른다(입장 1~3초 — 도착이 경계 **뒤**에 떨어지게)
    if (waitMs > W.dayLengthMs) waitMs -= W.dayLengthMs;
    if (ECON_DAYS > 0) {   // econ 하루 경계(= 세계 phase 0 · 24분 눈금)를 n 번, 그리고 마지막 경계에서 **1분 이상** 지난 뒤의 목표 phase 로 민다
      const bootAt = R.bootAt, L = W.dayLengthMs;
      const nthBoundary = (Math.floor((bootAt - (W.worldEpoch || 0)) / L) + ECON_DAYS) * L + (W.worldEpoch || 0);
      while (now + waitMs < nthBoundary + 60000) waitMs += L;
      R.econBoundary = nthBoundary;
    }
    say(`  낮밤 맞추기 — 지금 phase ${ph.toFixed(3)} → ${target} 까지 ${(waitMs / 60000).toFixed(1)}분 기다림`);
    while (waitMs > 0) { const st = Math.min(waitMs, 30000); await sleep(st); waitMs -= st; await ev(() => 1).catch(() => {}); }
  } else if (ECON_DAYS > 0) {   // 맞추기 없이 — econ 경계 n 번 + 1분만 기다린다(점검용)
    const L = W.dayLengthMs, nth = (Math.floor((R.bootAt - (W.worldEpoch || 0)) / L) + ECON_DAYS) * L + (W.worldEpoch || 0);
    R.econBoundary = nth;
    say(`  econ 하루 경계 ${ECON_DAYS}번 기다림 — ${((nth + 60000 - Date.now()) / 60000).toFixed(1)}분`);
    while (Date.now() < nth + 60000) await sleep(Math.min(30000, nth + 60000 - Date.now()));
  }
  let pickVid = null, arr = null;
  for (let k = 0; k < 6 && !arr; k++) {
    if (PICK != null) { pickVid = await ev((v) => window.__onbPick(v), PICK); await ev(() => document.getElementById('enter').click()); }   // 지도에서 고르기 → 「나루터로 간다」
    else pickVid = await ev(() => window.__onbAny());   // ★"아무 곳이나(추천)" 원클릭 — 새 사람의 기본 동선(§9.1)
    for (let i = 0; i < 60 && !arr; i++) { arr = await srvL(); if (!arr) await sleep(250); }
  }
  if (!arr) { await page.screenshot({ path: `/tmp/t511/${TAG}-enter.png` }).catch(() => {}); throw new Error(`입장 못 함(추천 vid=${pickVid})`); }
  T0 = Date.now();
  if (pickVid != null && pickVid !== V.vid) {   // ★추천은 세계가 고른다 — 입장 순간의 추천(`__onbAny` 가 돌려준 vid)이 도착 마을이다
    const info2 = await jget(`http://localhost:${ZPORT}/startinfo`);
    const V2 = info2 && info2.villages ? info2.villages.find((v) => v.vid === pickVid) : null;
    if (V2) { R.notes.push(`도착 마을이 기동 때 추천과 다르다 — ${V.name} → ${V2.name}`); V = V2;
      R.village = { vid: V.vid, name: V.name, ch: V.ch || null, anchor: { x: V.cx * CELL + 16, y: V.cy * CELL + 16 }, arrive: V.arrive,
        arriveToAnchor: Math.round(Math.hypot(V.arrive.x - (V.cx * CELL + 16), V.arrive.y - (V.cy * CELL + 16))) }; }
  }
  R.arrival = { at: T0, phase: +ZC.worldPhase(T0).toFixed(4), night: ZC.isNight(T0), x: Math.round(arr.x), y: Math.round(arr.y),
    toArrive: Math.round(Math.hypot(arr.x - V.arrive.x, arr.y - V.arrive.y)) };
  await send({ type: '__e2e_clock', day: SDAY });   // ★계절만 세운다(낮밤은 세계 시계 그대로)
  await sleep(1500);
  const s0 = await state();
  R.arrival.hunger = s0.g.hunger; R.arrival.thirst = s0.g.thirst; R.arrival.inv = s0.inv; R.arrival.cal = await ev(() => (window.__calendar ? window.__calendar() : null));
  R.arrival.wx = await ev(() => (window.__wx ? window.__wx() : null));
  say(`  도착 ${new Date(T0).toISOString().slice(11, 19)} · ${V.name}(vid ${V.vid}) · phase ${R.arrival.phase} (${R.arrival.night ? '밤' : '낮'}) · 도착점과 ${R.arrival.toArrive}px · 허기 ${Math.round(s0.g.hunger)} 갈증 ${Math.round(s0.g.thirst)} · 달력 ${R.arrival.cal ? R.arrival.cal.seasonKo + ' ' + R.arrival.cal.dayOfSeason + '일' : '?'} · 바깥 ${R.arrival.wx ? JSON.stringify(R.arrival.wx).slice(0, 80) : '?'}`);
  const sampler = setInterval(() => { sampleOnce(); }, 5000);
  await sampleOnce();
  await look();
  R.view = POLY ? { corners: POLY.map((p) => ({ x: Math.round(p.x - arr.x), y: Math.round(p.y - arr.y) })) } : null;

  // ── ★[T1093 ①-ⓒ] 쉼터 길 시험(`--reach`) — 본판 대신. 마을마다 쉼터 문 앞(서버 `shelterOf`) 둘레 여러 자리에서 그 문까지 걷는다 ──
  //   "쉼터를 봤으나 못 감(stuck×8)" 이 **어디서 · 왜** 나는지를 30분 판을 기다리지 않고 잰다. 시작 자리만 디버그 문(`teleport_debug` ·
  //   물 · 바위 위는 서버가 거절)으로 놓고, 걷기는 본판 그 `walkTo`(같은 눈 · 같은 길찾기 · WASD · 존 콜라이더)다. 촌장 문 고리 안 시작은 건너뛴다.
  if (REACH_D.length) {
    const want = new Set(VILS.map((v) => v.vid));
    let rows = [];
    for (let i = 0; i < 120; i++) { const sh = await jget(`http://localhost:${ZPORT}/shelterdbg`); rows = sh && sh.rows ? sh.rows.filter((r) => want.has(r.vid) && r.shelter) : []; if (rows.length === want.size) break; await sleep(5000); }
    R.reach = []; R.roof = [];
    for (const row of rows) {
      const door = { x: row.shelter.x, y: row.shelter.y };
      // ★[T1093 ②] 사람 눈의 쉼터 — `--shots` 면 문 앞 남쪽 여섯 칸에 서서 사람 창 한 장(지붕 그림이 쉼터 것인가) · 클라가 받은 선언 칸을 같이 적는다
      if (SHOTS) {
        await send({ type: 'teleport_debug', x: Math.round(door.x), y: Math.round(door.y + 6 * CELL) });
        await sleep(2500); await look();
        const hb = BLDS.filter((b) => b.sh && Math.abs(b.sh[2] - (Math.round(door.x / CELL + 2.5))) <= 0 && b.sh[3] + 2 === Math.round(door.y / CELL + 0.5));
        R.roof.push({ vid: row.vid, name: row.name, parts: hb.length, flag: hb.filter((b) => b.shBy === 'flag').length, byName: hb.filter((b) => b.shBy === 'name').length });
        _shotQ.push({ label: `쉼터-${row.name}`, need: '쉼터 지붕', reason: `선언 ${hb.filter((b) => b.shBy === 'flag').length}/${hb.length}` });
        await flushShots();
      }
      for (const dist of REACH_D) for (let k = 0; k < REACH_K; k++) {
        const a = (k / REACH_K) * Math.PI * 2, sx = door.x + Math.cos(a) * dist, sy = door.y + Math.sin(a) * dist;
        const sc = cellOf({ x: sx, y: sy });
        const base = { vid: row.vid, name: row.name, k, deg: +(k * 360 / REACH_K).toFixed(1), dist };
        if (terrBlocked(sc.x, sc.y)) { R.reach.push(Object.assign(base, { skip: 'terr' })); continue; }
        await send({ type: 'teleport_debug', x: Math.round(sx), y: Math.round(sy) });
        //   ★몸을 세운다(`__e2e_body` — 존 `E2E_GIVE` 문 안 · 이 시험만) — 길 시험은 먹고 마시지 않아 40분 무렵 쓰러져
        //     제자리 stuck×8 을 냈다(T1093 시험 셋째 판 실측 · 허기 · 갈증 0). 본판은 몸 세우기 0 그대로다.
        await send({ type: '__e2e_body', hunger: 90, thirst: 90, hp: 100 });
        let ok0 = false;
        for (let i = 0; i < 40 && !ok0; i++) { await sleep(200); const p = await meL(); ok0 = Math.hypot(p.x - sx, p.y - sy) < 24; }
        await sleep(1500);   // 청크 · 건물 · 자연물이 들어올 때까지
        dyn.clear(); R.stucks = [];
        await look();
        if (!ok0) { R.reach.push(Object.assign(base, { skip: 'tp' })); continue; }
        if (keepState(sx, sy) >= 1) { R.reach.push(Object.assign(base, { skip: 'keep' })); continue; }
        const t0 = Date.now();
        const goals = standAround(door.x, door.y, 40).filter((g) => !blockedCell(g.x, g.y));
        const w = goals.length ? await walkTo(goals, 14) : { ok: false, reason: 'nogoal' };
        const p1 = await meL();
        R.reach.push(Object.assign(base, { ok: w.ok, reason: w.reason || null, sec: +((Date.now() - t0) / 1000).toFixed(1), goals: goals.length,
          end: { x: Math.round(p1.x - door.x), y: Math.round(p1.y - door.y) }, stucks: (R.stucks || []).map((s) => ({ at: { x: s.at.x - door.x, y: s.at.y - door.y }, cell: s.cell, near: s.near, terr: s.terr, wall: s.wall })) }));
        say(`  ⌂ ${row.name} ${base.deg}° ${dist}px → ${w.ok ? '닿음' : '못 감 ' + w.reason} (${((Date.now() - t0) / 1000).toFixed(0)}초 · 걸림 ${(R.stucks || []).length})`);
      }
    }
    say('\n| 마을 | 시도 | 닿음 | 못 감(까닭) | 건너뜀(물 · 고리 · 이동) |');
    say('|---|---|---|---|---|');
    for (const row of rows) {
      const rs = R.reach.filter((x) => x.vid === row.vid), tr = rs.filter((x) => !x.skip), ok = tr.filter((x) => x.ok);
      const why = {}; for (const x of tr.filter((y) => !y.ok)) why[x.reason] = (why[x.reason] || 0) + 1;
      say(`| ${row.name} | ${tr.length} | ${ok.length} | ${Object.entries(why).map(([k2, n]) => `${k2} ${n}`).join(' · ') || '0'} | ${rs.filter((x) => x.skip).length} |`);
    }
    if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(R, null, 1)); say(`   → ${OUT}`); }
    clearInterval(sampler);
    await browser.close().catch(() => {});
    cleanup();
    process.exit(0);
  }

  // ── 촌장 판 머리: 인사 → 첫 의뢰 → 납품 → 밥 → 쉼터 ─────────────────────────
  if (CHIEF) {
    CUR = '촌장';
    const anc = R.village.anchor;
    if (QFIX) {   // 픽스처 — 게시판에 부족 하나(촌장에게 가기 **전에** — 인사에 첫 의뢰가 실린다)
      const tFix = Date.now();
      await send({ type: '__e2e_village_short', vid: V.vid }); await sleep(1500);
      R.fixture = await ev((t) => (window.__t511Log || []).filter((n) => n.t >= t).slice(0, 3).map((n) => n.x), tFix);   // 픽스처가 한 말(성공·거절 문장 그대로)
      await send({ type: 'village_board', vid: V.vid }); await sleep(800);   // (게시판 문을 한 번 두드려 판을 세운다 — 문 밖이면 서버가 거절 문장을 낸다)
    }
    const t0 = Date.now();
    let greet = null, quest = null, w = null;
    for (let k = 0; k < 4 && !greet && !timeUp(); k++) {
      w = await walkTo(standAround(anc.x, anc.y, 200 - k * 30).filter((g) => !blockedCell(g.x, g.y)), 20);
      for (let i = 0; i < 16 && !greet; i++) { const s = await state(); if (s.greet && s.greet.lines) { greet = s.greet; quest = s.quest; } else await sleep(500); }
    }
    // ★★[T540 ④ · T529 회부 5] 촌장이 **걸어오는** 판(`T529_CHIEF_WALKS=1`)이면 인사는 마을 중심이 아니라 **촌장이 닿는 때** 온다
    //   (T529 판: 84.6초 · 자는 60초에 "안 옴"으로 넘어갔다). ⇒ 여기서 선 채 기다린다 — 존의 촌장 줄(`/lifedbg` t529)이
    //   이 사람 몫을 **닫을 때까지**(곁 · 정체 · 하루 문 · 떠남). 닫혔는데 인사가 없으면 그때 막힘이다. 끔 판은 이 갈래를 안 탄다.
    if (!greet && ENV0.T529_CHIEF_WALKS === '1' && !timeUp()) {
      const myPid = await ev(() => (window.__evDbg && window.__evDbg.pid) || null);
      const tw = Date.now(); let open = true, lastEnd = null;
      while (!greet && open && !timeUp()) {
        for (let i = 0; i < 5 && !greet; i++) { const s2 = await state(); if (s2.greet && s2.greet.lines) { greet = s2.greet; quest = s2.quest; } else await sleep(1000); }
        const ld = await jget(`http://localhost:${ZPORT}/lifedbg`);
        const e = ld ? [].concat(...(ld.villages || []).map((v) => v.t529 || [])).find((x) => x.pid === myPid) : null;
        open = !!(e && !e.end); lastEnd = e ? (e.end || 'open') : 'none';
      }
      R.chiefWait = { sec: +((Date.now() - tw) / 1000).toFixed(1), end: lastEnd, greeted: !!greet };
    }
    R.legs.push({ t: tSec(), kind: 'toChief', ok: !!(w && w.ok), reason: w && w.reason || null, sec: +((Date.now() - t0) / 1000).toFixed(1) });
    if (greet) { mark('촌장 인사', { lines: (greet.lines || []).slice(0, 3) }); } else block('촌장', '마을 중심에 가도 인사가 안 왔다');
    await sleep(2500);
    quest = quest || (await state()).quest;
    R.quest = quest || null;
    if (quest) {
      mark('첫 의뢰 받음', { item: quest.item, remain: quest.remain, rew: `${quest.rewPlayerItem || quest.rewItem} ${quest.rewQty}`, meal: !!quest.meal });
      const want = quest.item;                       // econ 품목 — 플레이어 품목과 이름이 같은 것만 걷는다(없으면 막힘)
      if (SRC[want]) {
        for (let k = 0; k < 16 && !timeUp(); k++) { const s = await state(); if ((s.inv[want] || 0) >= (quest.remain || 1)) break; await fetchMissing({ [want]: quest.remain || 1 }); }
        await walkTo(standAround(anc.x, anc.y, 200).filter((g) => !blockedCell(g.x, g.y)), 20);
        const inv0 = (await state()).inv;
        await send({ type: 'village_deliver', vid: V.vid });   // ★게시판 납품 버튼이 보내는 그 한 줄
        await sleep(1500);
        const inv1 = (await state()).inv; const d = diffInv(inv0, inv1);
        if (Object.values(d).some((x) => x < 0)) mark('첫 납품', { d });
        else block('첫 의뢰', `납품이 안 됐다 ${JSON.stringify(d)}`);
        const rew = quest.rewPlayerItem;
        if (rew && FOOD[rew] && (inv1[rew] || 0) > 0) { const e = await eatOne(rew); mark('첫 밥', { how: `의뢰 보상 ${rew}`, hunger: `${Math.round(e.h0)}→${Math.round(e.h1)}` }); }
      } else block('첫 의뢰', `의뢰 품목 '${want}' 을 맨손으로 딸 길이 이 자에 없다`);
    } else block('첫 의뢰', '촌장이 의뢰를 안 냈다(게시판이 비었다)');
    const sh2 = await jget(`http://localhost:${ZPORT}/shelterdbg`);
    const shr = sh2 && sh2.rows ? sh2.rows.find((r) => r.vid === V.vid) : null;
    if (shr && shr.shelter) {
      const w2 = await walkTo(standAround(shr.shelter.x, shr.shelter.y, 72).filter((g) => !blockedCell(g.x, g.y)), 16);
      if (w2.ok) mark('첫 잠자리', { how: '공용 쉼터(촌장이 말한 곳)' }); else block('첫 잠자리', `쉼터에 못 감 ${w2.reason}`);
    } else block('첫 잠자리', '마을에 공용 쉼터가 아직 없다');
  }

  // ── 본판: 사람처럼 — 목마르면 마시고 · 먹을 게 있으면 먹고 · 도구 · 불 · 집 ──────
  //   ★순서는 사람의 판단 한 벌이다(자 안의 약속 · 보고에 적는다): 물(갈증 < 65 · 첫 물) > 먹기(첫 밥 · 허기 < 75) >
  //     불 곁 쬐기(추위 1단계 이상 · 불이 있으면) > 추우면 불부터 > 열매(첫 밥 전 · 허기 < 55 이고 먹을 게 없으면) >
  //     첫 도구 > 첫 불 > 첫 잠자리(보이는 공용 쉼터 · 문 밖이면) > 내 움집 사다리.
  const NEEDS = [
    { key: '물', when: (s) => !R.milestones['물'] || s.g.thirst < 65, run: () => goDrink(!R.milestones['물']) },
    { key: '먹기', when: (s, x) => x.foods.length && (!R.milestones['첫 밥'] || s.g.hunger < 75), run: async (s, x) => {
      const it = x.foods.sort((p, q) => (FOOD[q].hunger || 0) - (FOOD[p].hunger || 0))[0];
      const e = await eatOne(it); mark('첫 밥', { how: it, hunger: `${Math.round(e.h0)}→${Math.round(e.h1)}` }); return true; } },
    { key: '쬐기', when: (s, x) => fire && x.coldSt >= 1, run: (s) => warmUp((s.body || {}).cold || 0) },
    { key: '불', when: (s, x) => !R.milestones['첫 불'] && x.coldSt >= 1, run: () => makeFire() },   // 추우면 불이 도구보다 먼저
    { key: '열매', when: (s, x) => !x.foods.length && (!R.milestones['첫 밥'] || s.g.hunger < 55), run: () => fetchOne('berry') },   // 첫 밥 · 그리고 허기 1단계 문턱(55) 밑이면 다시 딴다
    { key: '도구', when: () => !R.milestones['첫 도구'], run: async (s) => {
      const rc = (Z.RECIPES.crude_axe && Z.RECIPES.crude_axe.cost) || null;   // ★조잡한 돌도끼 — 정본 `stone-uses.CRUDE_TOOLS`(서버 `RECIPES` 에 펼쳐진 그 줄)
      if (!rc) { block('첫 도구', 'RECIPES.crude_axe 없음'); return false; }
      if (Object.entries(rc).every(([k, n]) => (s.inv[k] || 0) >= n)) {
        if (await craft('craft', 'crude_axe', (q) => toolHas(q, 'crude_axe'))) { mark('첫 도구', { tool: 'crude_axe', cost: rc }); return true; }
        block('첫 도구', 'craft crude_axe 가 안 됐다'); return false;
      }
      return fetchMissing(rc); } },
    { key: '불', when: () => !R.milestones['첫 불'], run: () => makeFire() },
    { key: '칸', when: () => !!(PANELBOT && _pn && _pn.stage === 'tool' && _pn.step), run: () => followPanel(_pn) },   // ★[T1120] 칸이 다음 막힘을 말하면 그 한 칸(잠자리 · 움집 앞)
    { key: '잠자리', when: () => !R.milestones['첫 잠자리'], run: () => sleepStep() },
    { key: '움집', when: () => !(site && site.done), run: () => hutStep() },   // 쉼터를 찾은 뒤에도 셋째 단(내 움집)이 어디까지 가나
  ];
  let _pn = null;   // ★[T1120] 이번 차례에 칸이 말한 것
  const panelFirst = new Set();
  while (!timeUp()) {
    let did = false;
    try {
      if (PANELBOT) {
        _pn = await panelNow();
        if (_pn && _pn.stage === 'tool' && _pn.item && !panelFirst.has(_pn.item)) {   // 칸이 새 막힘 한 칸을 처음 말한 순간(분 · 사진)
          panelFirst.add(_pn.item);
          (R.panelFirst || (R.panelFirst = [])).push({ t: tSec(), item: _pn.item, guide: _pn.guide, step: _pn.step });
          mark('칸 다음 막힘', { item: _pn.item });
          say(`  ☞ ${(tSec() / 60).toFixed(2)}분  칸 「${_pn.item}」 ${_pn.guide}`);
          if (SHOTS) { _shotQ.push({ label: `칸-${_pn.item}`, need: '칸', reason: _pn.guide }); await flushShots(); }   // 칸이 그 말을 하고 있는 그 화면
        }
      }
      const s = await state();
      const b = s.body || {};
      const x = { coldSt: ((b.moodles || []).find((m) => m.axis === 'cold') || {}).stage | 0,
        foods: Object.keys(s.inv).filter((k) => (s.inv[k] || 0) >= 1 && FOOD[k] && (FOOD[k].hunger || 0) >= 1 && !(FOOD[k].hpDelta < 0)) };
      let ran = false;
      for (const n of NEEDS) {
        if ((skipUntil[n.key] || 0) > Date.now()) continue;
        if (!n.when(s, x)) continue;
        CUR = n.key; ran = true;
        did = await n.run(s, x);
        break;
      }
      await flushShots();   // ★[T1093 ④] 방금 적힌 막힘 자리를 찍는다(없으면 무동작)
      if (!ran) { if (fire) await warmUp(1); await sleep(3000); did = true; }
    } catch (e) {
      R.errors.push(String(e && e.message || e).slice(0, 160));
      if (/Target closed|browser has been closed|Execution context was destroyed/.test(String(e))) break;
      did = false;
    }
    if (!did) await sleep(2000);
  }
  await setKeys(new Set()).catch(() => {});
  clearInterval(sampler); await sampleOnce();
  {   // 쉼터는 기동 뒤 배경 백필로 선다(`_shelterBackfill`) — 끝에 다시 읽는다
    const sh3 = await jget(`http://localhost:${ZPORT}/shelterdbg`);
    const r3 = sh3 && sh3.rows ? sh3.rows.find((r) => r.vid === V.vid) : null;
    if (r3 && r3.shelter) R.shelter = { x: r3.shelter.x, y: r3.shelter.y, toAnchor: Math.round(Math.hypot(r3.shelter.x - R.village.anchor.x, r3.shelter.y - R.village.anchor.y)), inTerr: !!r3.inTerr, wake: r3.wake || null };
  }
  if (!R.milestones['첫 잠자리'] && !CHIEF) block('첫 잠자리', R.shelter && R.shelter.toAnchor < C.GATE ? `공용 쉼터가 촌장 문 안(중심에서 ${R.shelter.toAnchor}px < ${C.GATE}px)` : (shelterSeen ? `쉼터를 봤으나 못 감(${shelterSeen.fail || '?'}${shelterSeen.tries > 1 ? ` · ${shelterSeen.tries}번` : ''})` : '공용 쉼터가 한 번도 화면에 안 보였다'));   // ★[T1093] 다시 간 횟수
  if (!(site && site.done)) {
    const hs = ['곡괭이(손 제작)', '움집터(① 굴착)', '도끼(손 제작)', '움집 ② 단계', '움집 ③ 단계'].filter((k) => R.milestones[k]);
    R.hutReach = hs.length ? hs[hs.length - 1] : '곡괭이 전';
    R.notes.push(`내 움집 30분 안 미완 — 도달 ${R.hutReach}`);
  }
  for (const k of ['물', '첫 도구', '첫 밥', '첫 불']) if (!R.milestones[k]) block(k, '30분 안 미도달');
  if (!R.milestones['첫 열매'] && !R.milestones['첫 갈대']) block('첫 열매/갈대', '30분 안 미도달');
  await flushShots();   // ★[T1093 ④] 끝에 적힌 막힘(첫 잠자리 등)은 30분 끝 자리에서 찍는다
  R.walk = { px: Math.round(walkedPx), sec: +walkedSec.toFixed(1), pxPerSec: walkedSec ? +(walkedPx / walkedSec).toFixed(1) : null };
  R.notices = (await ev(() => (window.__t511Log || []).map((n) => ({ t: n.t, x: n.x.slice(0, 90) }))).catch(() => [])).map((n) => ({ t: +((n.t - T0) / 1000).toFixed(1), x: n.x }));
  R.final = await state().catch(() => null);
  const perf1 = await jget(`http://localhost:${ZPORT}/perf`);
  R.perf = perf1 ? { loop: perf1.loop || null, clock: perf1.clock || perf1.tickClock || null } : null;
  R.keepMin = (() => { let m = Infinity; for (const r of R.samples) for (const v of VILS) { if (CHIEF && v.vid === V.vid) continue; const d = Math.hypot(r.x - v.ax, r.y - v.ay); if (d < m) m = d; } return Math.round(m); })();
  say(`\n  ── ${TAG} 요약 ──`);
  for (const [k, v] of Object.entries(R.milestones)) say(`   ${String(v.min).padStart(6)}분  ${k}`);
  for (const bk of R.blockers) say(`   막힘 [${bk.need}] ${bk.reason}`);
  for (const [ax, a] of Object.entries(R.stage1)) say(`   몸 ${ax}: 1단계 첫 넘김 ${a.first === null ? '없음' : (a.first / 60).toFixed(1) + '분'} · 최고 ${a.max}단계${a.out !== null ? ' · 풀림 ' + (a.out / 60).toFixed(1) + '분' : ''}`);
  { const f = R.samples.map((q) => q.fps).filter((v) => v != null).sort((x, y) => x - y);
    R.fps = f.length ? { min: f[0], p10: f[Math.floor(f.length * 0.1)], med: f[Math.floor(f.length / 2)], under20: f.filter((v) => v < 20).length, n: f.length } : null; }
  say(`   렌더 fps(창 ${VW}×${VH} · 눈 ${SIGHT.join('×')}) ${R.fps ? `최저 ${R.fps.min} · 하위10% ${R.fps.p10} · 중앙 ${R.fps.med} · 20 밑 ${R.fps.under20}/${R.fps.n}표본` : '없음'}`);
  say(`   걸음 ${R.walk.px}px / ${R.walk.sec}s = ${R.walk.pxPerSec}px/s · 탐색 ${R.explore.legs}다리 ${R.explore.sec.toFixed(0)}s · 문 침범 ${R.breaches.length} · 문에서 최소 ${R.keepMin}px · 오류 ${R.errors.length}`);
  if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(R, null, 1)); say(`   → ${OUT}`); }
  await browser.close().catch(() => {});
  cleanup();
  process.exit(0);
})().catch((e) => { say('예외: ' + (e && e.stack || e)); try { if (OUT) fs.writeFileSync(OUT, JSON.stringify(Object.assign(R, { fatal: String(e && e.message || e) }), null, 1)); } catch (e2) {} cleanup(); process.exit(1); });
