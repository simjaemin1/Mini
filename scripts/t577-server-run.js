#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 세 밤 분할(T238) · 지금 A 20 · B 21 · C 22 — 적은 쪽(실서버 셋을 띄운다 · 판당 7~9분)
// === scripts/t577-server-run.js — **서버 판 자**: 실서버 호스트 · 새 세계 · 손님 0 · 800일 · 시드 셋 ===
//
// ★★[T577 2026-10-03 · 재민 "죽은 마을 왜 죽었는지 파악해야지"] 게이트(t17 · t176 3시드)는 **econ 만** 세운다.
//   도적 층(`server/bandits.js` — 해체 · 절망 이탈 · 캐러밴 약탈 · 행상 피살)은 서버 호스트(`villages.banditHost()`)에만 붙어
//   두 자에서 구조적으로 0 이다. 서울 사본의 빈 11곳은 전부 그 층의 해체 표를 달았다(T572) ⇒ **게이트가 못 보는 죽음**이었다.
//   이 자는 그 층이 붙은 **진짜 서버**(`node server/zone.js`)를 새 세계로 띄워 800일을 돌리고 3시드 옆에 둘 줄을 낸다:
//     여덟 수(t17 ⓚ 와 같은 이름 · 같은 합) + 해체 수 + 빈 마을 수 + 첫 빈 날 + 도적 누계.
//
// ★판의 조건(T572 §2-1 이 잰 함정 — 바꾸면 다른 세계다):
//   · 빠른 시계 `VILLAGE_DAY_MS=250` — 800일을 판당 7~9분에.
//   · `T315_MAPBEDS=0` — 빠른 시계에선 생활층 몸이 집을 못 지어, 켜면 침상이 시딩 12 에 묶이고 인구가 600(=50×12)에서 선다
//     (도적을 꺼도 굶어 비운다 — 시계의 잡음). 끄면 econ 자기 주거(`housing`)로 큰다 = 라이브가 비던 8월의 세계.
//     ★[T914] 집 행위가 선 판에선 `T315_MAPBEDS=1` + `T627_TRIP_DAY=1` 이 기본이다(아래 T914 줄) — 이 줄은 집 행위 끔 판(`T400_BUILD_ACT=0`)의 기본이다.
//   · `VILLAGE_NPC_CAP=1` — 가시 몸만 줄인다(econ 인구는 무제한 · 시뮬 진실). 몸 5천을 30Hz 로 굴리면 빠른 시계를 못 버틴다.
//     ★[T864] `VILLAGE_NPC_CAP=Infinity` 를 주면 아이 env 에서 그 칸을 뺀다 = 제품 운영 기본(무제한 · villages.js `NPC_CAP_PER_VILLAGE` 의 Infinity · T805 자 꼴).
//   · 시드 = econ 시드(`createWorldV2({seed})` 한 칸 — t17 이 시드를 바꾸는 그 자리). 지도·소굴·전쟁 시드는 그대로.
//   ⚠★★[T577 추신 2026-10-03] **이 조건의 왜곡 하나 — 집이 공짜다.** 생활층 집 행위(`T400_BUILD_ACT` 기본 켬)가 서는 마을은
//     econ 이 집 목재 제약을 크루에게 넘긴다(`economy-sim.js buildActOn` · `_t400Live`). 빠른 시계에선 크루가 걷지 못하고
//     `T315_MAPBEDS=0` 이 지은 침상 상한까지 떼어 econ 주거가 **목재 없이** 는다 ⇒ 작은 마을이 첫해 ~60(t17 ~20)까지 컸다 겨울에 굶는다.
//     `T400_BUILD_ACT=0` 이면 t17 과 같은 궤적(작은 무리 첫해 최고 21 · 보고/T577_추신 §3). 어느 조건을 기준선으로 둘지는 PM.
//   ★★[T914 2026-10-24 · T875 회부 1] **그 왜곡을 고쳤다 — 제품 무접촉(아이 env 기본값 둘).** 집 행위가 선 판(`T400_BUILD_ACT` 켬 · 제품 기본)이면 아이에게
//     `T627_TRIP_DAY=1`(크루 몫을 정본 운영 하루 24분으로 센다 — T627 리허설 시계 ⇒ 크루가 곳간에서 목재를 실제로 꺼내 집을 짓는다)과
//     `T315_MAPBEDS=1`(지은 침상이 econ 을 묶는다 — 제품 기본 그대로)을 준다 ⇒ econ 주거는 크루가 곳간 목재로 지은 집 안에서만 큰다(라이브와 같은 집 규칙).
//     T875 판: 첫해 굶어 죽음 6,323 → 216 · 첫해 K 80% 넘긴 마을 150 → 36/153 · 크루가 꺼낸 통나무 0 → 12,231(3시드 · 400날 · 보고/T914).
//     집 행위가 꺼진 판(서버 기준선 자 `T400_BUILD_ACT=0`)은 종전 그대로다(`T315_MAPBEDS=0` · `T627` 없음 — econ 이 곳간 목재로 짓는다 · 공짜 아님).
//     부르는 쪽이 준 값이 먼저다. 되돌림(종전 판 자 바이트) = `T627_TRIP_DAY=0 T315_MAPBEDS=0`.
//   ★★[T941 2026-10-26 · T924 회부 4] **가상 시계 판(`T745_VCLOCK=1`)이면 아이 env `T696_WAL=0` 이 기본이다**(부르는 쪽이 준 값이 먼저 · 되돌림 `T696_WAL=1`).
//     T696 WAL 체크포인트 일꾼(`zone-local-db.js` · `T696_ROAD_TAIL` 켬 기본)은 틱 사이 빈 시간에 PASSIVE 로 따라잡는데, 가상 시계는 틱 사이 실제 시간이 0 이라
//     일꾼이 끝내 못 따라잡아 WAL 이 비워지지 않는다(시드마다 ~16 MB/일 — 800날 3시드면 세션 디스크를 넘어 760일께 `ENOSPC` · T924).
//     `T696_WAL=0` 은 체크포인트를 종전 자리(COMMIT 안 자동 체크포인트)로 되돌릴 뿐 값을 안 바꾼다 — 판 JSON 바이트 같음(보고/T941 §1 · 3시드 400날).
//     벽시계 판(가상 시계 없음)은 종전 그대로다(일꾼이 따라잡는다).
//   ★★[T959 2026-10-28 · ★PM T941 회부 1 = 길 1] **아이 env `T941_BATTLE_DAY=1` 이 기본이다**(부르는 쪽이 준 값이 먼저 · 되돌림 `T941_BATTLE_DAY=0`).
//     판 자 하루(250ms)의 전쟁 몸 몫은 8 걸음(몸 0.267초)이라 교전 하루가 운영 하루(43,200 걸음 · 1,440초)의 1/5,400 이었다 — 교전이 몇 달 가는 세계(T924 회부 3 · T941 §2).
//     켜면 교전 국면 몸만 그날 몫을 운영 하루로 센다(`villages.js _t941Q` — 행군 · 귀환 · 생활층은 판 몫 그대로). 제품 기본은 끔 그대로다(라이브는 이미 운영 하루).
//     서버 기준선 자(`server-baseline-check.js`)는 이 자를 부르니 같은 기본을 탄다(가상 시계 판 · 벽시계 판 둘 다).
//   ★★[T990 2026-10-28 · T986 회부 2 · ★PM 판 자 결정론 = 가상 시계 = 벽시계] **아이 env `T990_ECON_DAY=1` 이 기본이다**(길의 날 · NPC 광맥 시각 = econ 날)(부르는 쪽이 준 값이 먼저 · 되돌림 `T990_ECON_DAY=0`).
//     길의 날(`roads.js dayNow` — 답압 감쇠 · 코스 등급 · 하루 재구축)은 벽시계 날(`VILLAGE_DAY_MS` 250ms)이라 벽시계 판에선 econ 이 밀린 만큼(한 econ 날 ≈ 2초) 길이 8배쯤 빨리 풀렸다.
//     가상 시계 판은 길의 날 ≈ econ 날이라 길이 섰고(등급 칸) — 행군로(`computeRoutePts` 길 할인)가 갈려 집 행위 켬 800날 시드 1020 날 747 전쟁 50 의 진 자리 · 정산이 두 시계에서 갈렸다(보고/T990 §3).
//     같은 꼴 둘째 — NPC 광맥 장부 시각(`zone.js oreStockAt` · `oreConsumeAt` 이 읽는 마감 벽시계)도 판 빠르기에 달려 광산 마을 곳간 · 금고가 날 379 에서 판마다 갈렸다(보고/T990 §3-②).
//     켜면 길의 날 = econ 날(`roads.setEconDay` · 하루는 하루 마감 `dayRoads` 자리) · NPC 광맥 시각 = econ 날 × 하루 길이(15분 정리는 읽기만).
//     ★[T1001 2026-10-30] 제품도 켬 기본(zone 상수 `!== '0'` · 부팅 때 한 번 벽시계에 맞춘다 — 라이브 DB 줄과 같은 축 · 옮김 0). 이 줄은 '부르는 값 먼저' 자리로 남는다(`=0` 이면 끔 판).
//   ★★[T1013 2026-10-31 · 판 자 결정론 마감] **아이 env `T1013_BAND_DAY=1` 이 기본이다**(부르는 값 먼저 · 되돌림 `=0` · 제품 끔 기본).
//     사냥터 짓기(`villages.js _huntBandBuild`)는 마을 하루치 벽시계 몫(20ms)이 바닥나면 내일 잇는다 — 부하가 크면 큰 마을 띠가 다음 날로 넘어가
//     사냥꾼 차감 · 14일 `land.game` 이 판마다 달랐다(`--house` 800날 부하 판 시드 1020 날 771 임업1). 켜면 쉼표 뒤 같은 날 이어 짓는다(가상 시계 판과 같은 답).
//   ⚠서버 판은 **바이트 결정론이 아니다**(하루 마감 조각 · 캐러밴 몸 타이밍이 벽시계에 기댄다) — 같은 시드도 판마다 조금 갈린다.
//     그래서 판정하지 않는다: 이 자의 ok() 는 "판이 끝까지 돌았다 · 시딩이 섰다"뿐이고 수는 **표**다(기준선은 PM 이 착지 때 선언).
//
// 실행:
//   node scripts/t577-server-run.js [일수=800] [시드=1020,7,42]          # 판 셋(동시 T577_PAR · 기본 min(3, 코어))
//   T577_CAND_WALK=1 node scripts/t577-server-run.js 800 1020            # 후보 손잡이(env 는 아이에게 그대로 간다)
//   T577_RAMP=0 node scripts/t577-server-run.js                          # ★[T577 추신] 보호기 펴기 끔 판(종전 · 기준선 첫째)
//   VILLAGE_LIFE=0 node scripts/t577-server-run.js 400 1020              # 층 끄기 판(생활층 · ENABLE_BANDITS · VILLAGE_CARAVAN_MAX · T513_DAY_SLICE · WAR_MINDAY)
//   node scripts/t577-server-run.js --table <dir>                        # 판 JSON 만 읽어 표(세계를 안 세운다)
//   T577_DIR=/tmp/t577/runs  판 JSON · 아이 로그 자리(기본 /tmp/t577-<pid>)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

// ── 표 — 판 JSON 을 읽어 줄로 ─────────────────────────────────────────────────
function table(outs) {
  const E11 = ['광산7', '임업4', '농촌3', '농촌7', '농촌9', '농촌10', '농촌13', '농촌14', '농촌15', '농촌16', '농촌18'];
  console.log('\n| 판 | 시드 | 일 | 인구 | 소멸 | 무기Q | 확장셀 | 게시 | 도구Q | 보존식 | 생곡 | 해체 | 빈 마을 | 첫 빈 날 | 해체 day≤400 | 죽음 누계 | 행상 피살 | 도적 전환 | 절망 이탈 | 서울 빈 11 중 빈 곳 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const o of outs) {
    const e = o.eight, cand = Object.keys((o.env && o.env.cand) || {}).map((k) => `${k.replace(/^T577_(CAND_)?/, '')}=${o.env.cand[k]}`).join(' ') || '기준(켬)';
    const early = (o.bdtDay || []).filter((d) => d != null && d <= 400).length;
    const last = o.rows && o.rows.length ? o.rows[o.rows.length - 1][1] : [];
    const hit = (o.names || []).map((n, i) => (E11.includes(n) && last[i] === 0 ? n : null)).filter(Boolean);
    console.log(`| ${cand} | ${o.seed} | ${o.days} | ${e.pop} | ${e.dead}/${e.ever} | ${e.weapQ} | ${e.expand} | ${e.board} | ${e.toolQ} | ${e.preserve} | ${e.grain}`
      + ` | ${o.dissolved} | ${o.empty} | ${o.firstEmpty ?? '—'} | ${early} | ${o.deadTot} | ${o.tradersKilled}`
      + ` | ${o.bandit ? o.bandit.conv : '—'} | ${o.bandit ? o.bandit.exo : '—'} | ${hit.length}${hit.length ? ' (' + hit.join('·') + ')' : ''} |`);
  }
  // ★[T590] 줄어든 몸 — 판 JSON 에 `bodyExit` 이 있을 때만(T590 전 판은 이 표가 없다)
  const bx = outs.filter((o) => o.bodyExit);
  if (bx.length) {
    console.log('\n| 판 | 시드 | 몸 상한 | 줄어든 몸 | 그 자리 죽음(굶음·늙음) | 걸어 나감(도적·이탈·이주) | 그 밖(원정·행상·모름) | 순간 소멸 | 누운 채 · 걷는 중(끝 날) | 다 누움 · 다 걸음 | 직선 폴백 | 버린 까닭 |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const o of bx) {
      const B = o.bodyExit, sum = (x) => Object.values(x || {}).reduce((a, v) => a + v, 0);
      const d = sum(B.died), w = sum(B.walk), t = sum(B.other), n = d + w + t;
      const pc = (x) => (n ? (100 * x / n).toFixed(1) + '%' : '—');
      const cand = Object.keys((o.env && o.env.cand) || {}).map((k) => `${k.replace(/^T577_/, '')}=${o.env.cand[k]}`).join(' ') || '기준';
      console.log(`| ${cand} | ${o.seed} | ${(o.env && o.env.VILLAGE_NPC_CAP) || '∞'} | ${n} | ${d} (${pc(d)} · ${B.died.starve}·${B.died.old}) | ${w} (${pc(w)} · ${B.walk.bandit}·${B.walk.desert}·${B.walk.move})`
        + ` | ${t} (${pc(t)} · ${B.other.expedition}·${B.other.road}·${B.other.unknown}) | ${B.vanish} | ${B.lying} · ${B.walking} | ${B.rot} · ${B.arrive} | ${B.straight} | ${B.trimmed} |`);
    }
  }
}

if (process.argv.includes('--table')) {
  const dir = process.argv[process.argv.indexOf('--table') + 1];
  const outs = fs.readdirSync(dir).filter((f) => /\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  table(outs);
  process.exit(0);
}

const DAYS = parseInt(process.argv[2], 10) || 800;
const SEEDS = String(process.argv[3] || '1020,7,42').split(',').map((s) => parseInt(s, 10)).filter(Boolean);
const PAR = parseInt(process.env.T577_PAR || '', 10) || Math.max(1, Math.min(3, os.cpus().length));
const DIR = process.env.T577_DIR || `/tmp/t577-${process.pid}`;
fs.mkdirSync(DIR, { recursive: true });
// ★[T914] 집 행위가 선 판인가(제품 기본 켬 · econ 정본과 같은 글자 `!== '0'`) — 그 판이면 크루가 실제로 나르게 아이 env 기본값 둘(머리 주석 T914 줄)
const HOUSE_ACT = process.env.T400_BUILD_ACT !== '0';
const KID_MAPBEDS = process.env.T315_MAPBEDS != null ? process.env.T315_MAPBEDS : (HOUSE_ACT ? '1' : '0');
const KID_TRIPDAY = process.env.T627_TRIP_DAY != null ? process.env.T627_TRIP_DAY : (HOUSE_ACT ? '1' : null);
// ★[T941] 가상 시계 판이면 WAL 일꾼 끔이 기본(머리 주석 T941 줄 · 값 무변) — 부르는 쪽이 준 값이 먼저
const VCLOCK = process.env.T745_VCLOCK === '1';
const KID_WAL = process.env.T696_WAL != null ? process.env.T696_WAL : (VCLOCK ? '0' : null);
// ★[T959] 교전 몫 = 운영 하루(길 1)가 판 자 기본 — 부르는 쪽이 준 값이 먼저(되돌림 `=0`)
const KID_BATTLE = process.env.T941_BATTLE_DAY != null ? process.env.T941_BATTLE_DAY : '1';
// ★[T1013] 사냥터 짓기 그날 안에(몫이 바닥나도 쉼표 뒤 같은 날) — 판 자 기본 · 부르는 쪽이 준 값이 먼저(되돌림 `=0`)
const KID_BAND = process.env.T1013_BAND_DAY != null ? process.env.T1013_BAND_DAY : '1';
// ★[T990] 길의 날 · NPC 광맥 시각 = econ 날이 판 자 기본 — 부르는 쪽이 준 값이 먼저(되돌림 `=0`)
const KID_ECON = process.env.T990_ECON_DAY != null ? process.env.T990_ECON_DAY : '1';
// ★[T577 추신] 판 이름 — 판을 가르는 손잡이(후보 · 층 끄기)만 이름에 싣는다(`T577_TAG` 로 덮을 수 있다)
const TAG = process.env.T577_TAG || Object.keys(process.env).filter((k) => /^(T577_(?!SEED$|DAYS$|OUT$|DIR$|PAR$|TAG$)|VILLAGE_LIFE$|ENABLE_BANDITS$|VILLAGE_CARAVAN_MAX$|T513_DAY_SLICE$|WAR_MINDAY$|T766_[A-Z_]+$)/.test(k)).sort().map((k) => `${k.replace(/^T577_(CAND_)?/, '').toLowerCase()}${process.env[k]}`).join('-') || 'base';

function runOne(seed, k) {
  return new Promise((resolve) => {
    const out = path.join(DIR, `${TAG}-${seed}.json`), logf = path.join(DIR, `${TAG}-${seed}.log`);
    const db = path.join(DIR, `${TAG}-${seed}.db`);
    for (const f of [out, db, db + '-wal', db + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    const env = Object.assign({}, process.env, {
      ZONE_ID: 'hanbando', PORT: String(39100 + ((process.pid + k * 37) % 700)), DB_PATH: db,
      ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
      VILLAGE_DAY_MS: process.env.VILLAGE_DAY_MS || '250',
      T315_MAPBEDS: KID_MAPBEDS,   // ★[T914] 집 행위 켬 판 기본 '1'(지은 침상이 묶는다) · 끔 판 기본 '0'(종전)
      ...(KID_TRIPDAY != null ? { T627_TRIP_DAY: KID_TRIPDAY } : {}),   // ★[T914] 집 행위 켬 판 기본 '1'(크루 몫 = 정본 운영 하루) · 끔 판은 안 준다(종전)
      ...(KID_WAL != null ? { T696_WAL: KID_WAL } : {}),   // ★[T941] 가상 시계 판 기본 '0'(WAL 일꾼 끔 — 값 무변 · 디스크) · 벽시계 판은 안 준다(종전)
      T941_BATTLE_DAY: KID_BATTLE,   // ★[T959] 판 자 기본 '1'(교전 국면 몸만 운영 하루 몫) · 되돌림 '0' = T959 전 판 자
      T1013_BAND_DAY: KID_BAND,   // ★[T1013] 판 자 기본 '1'(사냥터 짓기 그날 안에) · 되돌림 '0' = T1013 전 판 자
      T990_ECON_DAY: KID_ECON,   // ★[T990] 판 자 기본 '1'(길의 날 · NPC 광맥 시각 = econ 날) · 되돌림 '0' = T990 전 판 자
      VILLAGE_NPC_CAP: process.env.VILLAGE_NPC_CAP || '1',
      T577_SEED: String(seed), T577_DAYS: String(DAYS), T577_OUT: out,
      //   ★[T655] 첫 부팅 조각(T640 · 제품 기본 켬)은 이 자에서 끈다 — 하루 250ms 면 표본이 도는 ~4분 동안 수백 날이 지나 도적 데일리를 건너뛴다(T640 회부 ①).
      T640_BOOT_SLICE: '0',
    });
    if (env.VILLAGE_NPC_CAP === 'Infinity') delete env.VILLAGE_NPC_CAP;   // ★[T864] 몸 상한 운영 기본(무제한)
    const t0 = Date.now();
    const child = spawn(process.execPath, ['-r', path.join(__dirname, 't577-server-hook.js'), path.join(ROOT, 'server', 'zone.js')],
      { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const lf = fs.createWriteStream(logf);
    child.stdout.pipe(lf); child.stderr.pipe(lf);
    const up = FB.waitUp(child, /zone server up on/, { name: `zone(시드 ${seed})`, capMs: 300000 });
    child.on('exit', async () => {
      const u = await up;
      let o = null; try { o = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { o = null; }
      resolve({ seed, up: u, o, sec: ((Date.now() - t0) / 1000) | 0, logf });
    });
  });
}

(async () => {
  console.log(`\n=== 서버 판 자(T577) — ${DAYS}일 · 시드 ${SEEDS.join('·')} · 판 ${TAG} · 동시 ${PAR} · ${DIR} ===`);
  console.log(`  조건: VILLAGE_DAY_MS=${process.env.VILLAGE_DAY_MS || '250'} · T315_MAPBEDS=${KID_MAPBEDS} · T627_TRIP_DAY=${KID_TRIPDAY != null ? KID_TRIPDAY : '(없음)'} · 집 행위 ${HOUSE_ACT ? '켬' : '끔'} · 가상 시계 ${VCLOCK ? '켬' : '끔'} · T696_WAL=${KID_WAL != null ? KID_WAL : '(없음)'} · T941_BATTLE_DAY=${KID_BATTLE} · T990_ECON_DAY=${KID_ECON} · T1013_BAND_DAY=${KID_BAND} · VILLAGE_NPC_CAP=${process.env.VILLAGE_NPC_CAP || '1'} · 도적 ${process.env.ENABLE_BANDITS === '0' ? '끔' : '켬'}`);
  const res = [];
  const q = SEEDS.map((s, k) => [s, k]);
  await Promise.all(Array.from({ length: Math.min(PAR, q.length) }, async () => {
    while (q.length) { const [s, k] = q.shift(); res.push(await runOne(s, k)); }
  }));
  res.sort((a, b) => SEEDS.indexOf(a.seed) - SEEDS.indexOf(b.seed));
  for (const r of res) {
    ok(r.up.ok, `시드 ${r.seed} — 존이 떴다`, r.up.ok ? '' : r.up.why);
    ok(!!r.o && r.o.days >= DAYS, `시드 ${r.seed} — **${DAYS}일을 끝까지 돌았다**(판 JSON)`, r.o ? `${r.o.days}일 · ${r.sec}초` : `JSON 없음 — 로그 ${r.logf}`);
    if (r.o) ok(r.o.villages >= 40 && (r.o.seedPop || []).every((n) => n > 0),
      `시드 ${r.seed} — 시딩이 섰다(마을마다 첫날 사람이 있다)`, `${r.o.villages}곳 · 첫날 ${Math.min(...(r.o.seedPop || [0]))}~${Math.max(...(r.o.seedPop || [0]))}명`);
  }
  const outs = res.map((r) => r.o).filter(Boolean);
  if (outs.length) table(outs);
  console.log(`\n  판 JSON · 로그: ${DIR}  (표만 다시: node scripts/t577-server-run.js --table ${DIR})`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
