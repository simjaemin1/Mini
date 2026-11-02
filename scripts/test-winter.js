#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-winter.js — 겨울나기 공동 프로젝트를 걷었다 (★T779 새 세계: 겨울 0) =====================
//
// ★[T779 2026-10-18 · 재민 10-15 "겨울 프로젝트 없어. 기부는 상시 되고 보상도 없음."]
//   T20 겨울나기(`server/winter.js` — 가을 공표 · 양 적립 · 겨울 첫날 판정 · 달성 보상 · 게시판 머리줄 · 납품 안 겨울 갈래)를 걷었다.
//   손잡이를 꺼도 돌아오지 않는다(`EV_WINTER_OFF` 째 걷음). 연표에 이미 쓰인 옛 판정(`WINTER_KEPT` · `WINTER_SHORT`)은 **그대로 읽힌다**(연표는 영구).
//
// ★★이 하네스의 제1 원칙(옛 판 그대로): **검사 상황이 실제로 그 날들을 밟는지 먼저 assert 한다.**
//   "겨울 사건이 0건이다"를 통과로 세기 전에 **가을 첫날 · 겨울 첫날을 실제로 지났는지**를 먼저 잰다.
//
//   ① 모듈 · 배선이 없다 — 파일 · `require` · `Winter` 부름 · DB 표 도우미 · 게시판 머리줄(서버 · 화면) · 장부의 `.winter` 읽기
//   ② 800일 스윕 — 가을 · 겨울 첫날을 해마다 지났다(전제) · 그동안 `WINTER_*` 0 · 가을 사건에 공표 칸 0 · 가을 줄에 공표 말 0
//   ③ 옛 꼴 호스트 몫(`extra.winter` — 공표 · 판정)을 건네도 장부가 한 건도 안 싣는다(두 장부 대조 · 관측자 규약)
//   ④ 옛 판정 두 유형은 연표에서 그대로 읽힌다 — 유형 표 · 일 유형 · 이웃 연표 제외 · 연표 한 해에 줄로 · ㉝ 계약
//   ⑤ 옛 가을 사건(공표 칸 실린 것)은 공표 없이 가을 한 줄로 읽힌다
//   ⑥ 옛 DB 표 `village_winter` 는 지우지 않는다(새 DB 엔 안 생긴다 · 도우미 0)
//   ⑦ 곳간 식량 등가 — 쓰러진 사람 구제 죽(`zone._villageMeal`)이 "곳간이 비었나"를 묻는 밑변(옛 ⑧ 그대로 · 한도 · 보상 밑변은 걷었다)
//   ⑧ ★자가 검사 — 장부에 옛 쓰는 자리(`extra.winter.emit`)를 되살린 사본을 같은 ③ 에 넣으면 **잡는가**
//
// 실행: node scripts/test-winter.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/test-winter-${process.pid}.db`;

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const SV = (p) => path.join(ROOT, 'server', p);

const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const Events = R('server/events');
const Villages = R('server/villages');
const acorn = require(path.join(ROOT, 'node_modules', 'acorn'));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

function makeWorld(days, seed) {
  const world = econV2.createWorldV2({ seed: seed || 7, villageCount: 4, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  const _log = console.log; console.log = () => {};
  try { for (let d = 0; d < (days || 0); d++) econV2.tickWorldV2(world); } finally { console.log = _log; }
  return world;
}
function mkLedger(world, E) {
  const L = (E || Events).createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap() });
  L.prime(world);
  return L;
}
// econ 상태 스냅샷 — 관측자 규약 검사용(곳간·인구·인구 누적)
const snapEcon = (world) => JSON.stringify(world.villages.map((v) => [
  v.npcs.length, v._dPAccum, Object.entries(v.storage).sort().map(([k, q]) => [k, +(+q).toFixed(6)]),
]));
// 주석을 뺀 코드 — acorn 이 준 주석 자리만 지운다(주석 속 옛 이름 · 경고 인용은 안 센다)
function codeOf(src) {
  const cuts = [];
  acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true, onComment: (b, t, s, e) => cuts.push([s, e]) });
  let out = '', at = 0;
  for (const [s, e] of cuts) { out += src.slice(at, s); at = e; }
  return out + src.slice(at);
}
const isWinterType = (t) => /^WINTER_/.test(String(t || ''));
const winterTypes = Events.TYPES.filter(isWinterType);
const winterIn = (L) => winterTypes.reduce((a, t) => a + ((L.stats.byType || {})[t] || 0), 0);
const chronWinter = (L) => L.vids.reduce((a, v) => a + L.chronOf(v).filter((e) => isWinterType(e.type)).length, 0);
// 옛 호스트(`winter.js dailyExtra`)가 장부에 넘기던 꼴 — 공표(`goal`)와 판정(`emit`)
const OLD_EXTRA = (day) => ({ winter: {
  goal: { 0: { res: 'food', target: 50, deadline: day + 30 }, 1: { res: 'food', target: 40, deadline: day + 30 } },
  emit: [{ vid: 0, type: 'WINTER_KEPT', item: 'food', mag: 1.2, meta: { by: [] } }, { vid: 1, type: 'WINTER_SHORT', item: 'food', mag: 0.4, meta: null }],
} });

console.log('\n=== 겨울나기 공동 프로젝트 걷음 (T779) ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// ① 모듈 · 배선이 없다
// ─────────────────────────────────────────────────────────────────────────────
{
  ok(!fs.existsSync(SV('winter.js')), '① `server/winter.js` 가 없다');
  const req = (() => { try { require(SV('winter.js')); return 'loaded'; } catch (e) { return e && e.code; } })();
  ok(req === 'MODULE_NOT_FOUND', '①b 불러도 못 찾는다', String(req));
  const files = [];
  for (const dir of ['server', path.join('public', 'client')]) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((n) => n.endsWith('.js'))) files.push(path.join(dir, f));
  }
  const bad = [], parseErr = [];
  let nCode = 0;
  for (const rel of files) {
    let code;
    try { code = codeOf(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (e) { parseErr.push(`${rel}:${e.message}`); continue; }
    nCode++;
    if (/require\(\s*['"`][^'"`]*\bwinter['"`]\s*\)/.test(code) || /\bWinter\b/.test(code)) bad.push(rel);
  }
  ok(nCode === files.length && nCode > 30, '①c 전제: 서버 · 화면 코드를 실제로 다 읽었다(주석을 뺀 코드)', `${nCode}/${files.length}` + (parseErr.length ? ` · 못 읽음 ${parseErr.slice(0, 2).join(' ')}` : ''));
  ok(bad.length === 0, '①d ★서버 · 화면 코드 어디에도 겨울 모듈 `require` · `Winter` 부름이 없다', bad.join(' ') || '0곳');
  const msrc = fs.readFileSync(SV('membership.js'), 'utf8');
  ok(/\bWinter\b/.test(msrc) && !/\bWinter\b/.test(codeOf(msrc)), '①e (자명 통과 방지) 그 낱말이 `membership.js` 주석(걷은 것 목록)엔 **있다** — 위 검사가 주석을 안 본다는 증거');
  const D = fs.readFileSync(SV('zone-local-db.js'), 'utf8');
  ok(!/upsertVillageWinter|getVillageWinterSince|CREATE TABLE IF NOT EXISTS village_winter/.test(codeOf(D)), '①f DB 도우미 둘 · 표 만들기가 없다(`zone-local-db.js`)');
  const evCode = codeOf(fs.readFileSync(SV('events.js'), 'utf8'));
  ok(!/\.winter\b/.test(evCode), '①g ★장부(`events.js`)가 `.winter` 칸을 읽지도 쓰지도 않는다(호스트 몫 · 가을 공표 칸)');
  ok(/'WINTER_KEPT'/.test(evCode) && /WINTER_SHORT:/.test(evCode), '①h (자명 통과 방지) 옛 판정 유형 이름 · 줄은 코드에 **남아 있다**(읽는 자리 — ④)');
  const board = codeOf(fs.readFileSync(path.join(ROOT, 'public', 'client', '47-s-board.js'), 'utf8'));
  const css = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');
  ok(!/\.head\b/.test(board) && !/\.bp-head\b/.test(css), '①i 게시판 화면에 머리줄 칸이 없다(`bd.head` · `.bp-head`)');
  const knobs = [];
  for (const rel of files) { const s = fs.readFileSync(path.join(ROOT, rel), 'utf8'); if (/EV_WINTER_OFF|EV_WINTER_[A-Z_]+/.test(codeOf(s))) knobs.push(rel); }
  ok(knobs.length === 0, '①j 겨울 손잡이(`EV_WINTER_OFF` · `EV_WINTER_*`)를 읽는 코드가 없다(꺼도 돌아올 길 0)', knobs.join(' ') || '0곳');
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 800일 스윕 + ③ 옛 꼴 호스트 몫 — 같은 세계에 두 장부(대조군 · 옛 꼴을 건넨 판)
//    ⚠자명 통과 금지: 가을 첫날 · 겨울 첫날을 **실제로** 해마다 지났고, 그날 계절 사건이 **실제로** 났다는 것을 먼저 잰다.
// ─────────────────────────────────────────────────────────────────────────────
const YD = Events.yearDaysOf();
{
  const world = makeWorld(0, 7);
  const LA = mkLedger(world);
  const LB = mkLedger(world);
  const DAYS = 800;
  const firsts = { autumn: 0, winter: 0 };
  let prevSeason = null, moved = 0;
  const seasonEvA = [], seasonEvB = [];
  const _l = console.log; console.log = () => {};
  try {
    for (let d = 1; d <= DAYS; d++) {
      econV2.tickWorldV2(world);
      const day = world.day;
      const sn = Events.calendarOf(day).season;
      if (prevSeason != null && sn !== prevSeason && (sn in firsts)) firsts[sn]++;
      prevSeason = sn;
      const s0 = snapEcon(world);
      const ea = LA.scanDay(world, day, {}) || [];
      const eb = LB.scanDay(world, day, OLD_EXTRA(day)) || [];
      if (snapEcon(world) !== s0) moved++;
      for (const e of ea) if (e.type === 'SEASON_CHANGE') seasonEvA.push(e);
      for (const e of eb) if (e.type === 'SEASON_CHANGE') seasonEvB.push(e);
    }
  } finally { console.log = _l; }
  const autumnA = seasonEvA.filter((e) => e.meta && e.meta.season === 'autumn');
  ok(firsts.autumn >= 2 && firsts.winter >= 2, '② 전제: 800일이 가을 첫날 · 겨울 첫날을 두 번 넘게 지났다(달력 정본)', `한 해 ${YD}일 · 가을 ${firsts.autumn} · 겨울 ${firsts.winter}`);
  ok(autumnA.length >= 2 * world.villages.length, '②b 전제: 가을 첫날 계절 사건이 마을마다 **실제로** 났다(0건이 그냥 안 지나서가 아니다)', `가을 사건 ${autumnA.length} · 마을 ${world.villages.length}`);
  ok(winterIn(LA) === 0 && chronWinter(LA) === 0, '② ★800일 동안 겨울 판정 사건이 **한 건도** 안 났다(장부 · 연표 둘 다)', `장부 ${winterIn(LA)} · 연표 ${chronWinter(LA)}`);
  ok(seasonEvA.every((e) => !(e.meta && 'winter' in e.meta)), '②c 계절 사건에 공표 칸(`meta.winter`)이 없다', `${seasonEvA.length}건`);
  ok(autumnA.every((e) => !/올겨울/.test(Events.briefLine(e) || '')), '②d 가을 줄에 공표 말("올겨울 …")이 없다', autumnA[0] ? Events.briefLine(autumnA[0]) : '');
  ok(moved === 0, '③ 전제: 두 장부가 econ 을 한 글자도 안 건드렸다(관측자 규약)', `${moved}일`);
  ok(winterIn(LB) === 0 && chronWinter(LB) === 0, '③ ★옛 꼴 호스트 몫(판정 `emit`)을 날마다 건네도 장부가 **한 건도 안 싣는다**', `장부 ${winterIn(LB)} · 연표 ${chronWinter(LB)}`);
  ok(seasonEvB.length === seasonEvA.length && seasonEvB.every((e) => !(e.meta && 'winter' in e.meta)), '③b 옛 꼴 공표(`goal`)를 건네도 가을 사건에 공표 칸이 안 실린다', `${seasonEvB.length} = ${seasonEvA.length}`);
  ok(JSON.stringify(LA.stats.byType) === JSON.stringify(LB.stats.byType) && LA.stats.emitted === LB.stats.emitted,
    '③c 유형별 건수 · 총 건수가 **두 장부에서 같다**(옛 꼴 몫이 아무것도 못 바꾼다)', `${LA.stats.emitted} = ${LB.stats.emitted}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 옛 판정 두 유형은 연표에서 그대로 읽힌다 — 연표는 영구(T18) · 재기동 복구(`loadChronicle`)가 그 길이다
// ─────────────────────────────────────────────────────────────────────────────
let L4 = null;
{
  const world = makeWorld(30, 1020);
  L4 = mkLedger(world);
  const d0 = (() => { for (let d = 1; d <= YD; d++) { const c = Events.calendarOf(d); if (c.season === 'winter' && c.dayOfSeason === 1) return d; } return -1; })();
  ok(d0 > 0, '④ 전제: 첫해 겨울 첫날을 달력에서 찾았다(옛 판정이 쓰이던 날)', `${d0}일`);
  const rows = [{ vid: 0, day: d0, type: 'WINTER_KEPT', item: 'food', mag: 1.2 }, { vid: 1, day: d0, type: 'WINTER_SHORT', item: 'food', mag: 0.4 }];
  ok(L4.loadChronicle(rows) === 2, '④b 옛 판정 두 줄이 연표 복구 길로 들어간다(`loadChronicle` — 재기동 그 길)');
  ok(winterTypes.length === 2 && Events.TYPES.includes('WINTER_KEPT') && Events.TYPES.includes('WINTER_SHORT'), '④c 유형 표에 두 이름이 남아 있다', winterTypes.join(' '));
  ok(L4.isDeed({ type: 'WINTER_KEPT' }) && L4.isDeed({ type: 'WINTER_SHORT' }), '④d 두 유형 다 "일"로 등재돼 있다(연표 문턱 면제 — 옛 그대로)');
  ok(L4.deedForeign.indexOf('WINTER_KEPT') < 0 && L4.deedForeign.indexOf('WINTER_SHORT') < 0, '④e 남의 마을 겨울은 이웃 연표에 안 실린다(옛 그대로)');
  const items = (vid) => L4.chronicle(vid, { today: d0 + 3 }).seasons.reduce((a, b) => a.concat(b.items), []);
  const k = items(0).find((x) => x.type === 'WINTER_KEPT');
  const s = items(1).find((x) => x.type === 'WINTER_SHORT');
  ok(!!k && k.line === Events.briefLine(rows[0]) && /올겨울은 넉넉하이/.test(k.line), '④ ★옛 달성 판정이 그 마을 연표 겨울 칸에 **줄로** 선다', k ? k.line : '(없음)');
  ok(!!s && s.line === Events.briefLine(rows[1]) && /궁하겠네/.test(s.line), '④f 옛 미달 판정도 같다', s ? s.line : '(없음)');
  for (const r of rows) {
    ok(!!Events.briefLine(r) && Events.briefLine(r) === Events.briefLine(Object.assign({}, r, { meta: null })),
      `④g ${r.type} 문장이 **vid·day·type·item·mag 만으로** 재현된다(㉝ 계약 — 연표 표는 meta 를 안 담는다)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 옛 가을 사건(공표 칸 실린 것 — `village_events` 90일 창에 남은 것)은 공표 없이 가을 한 줄로 읽힌다
// ─────────────────────────────────────────────────────────────────────────────
{
  const old = { vid: 0, day: 1, type: 'SEASON_CHANGE', item: null, mag: 1, meta: { season: 'autumn', winter: { res: 'food', target: 50, deadline: 91 } } };
  const now = { vid: 0, day: 1, type: 'SEASON_CHANGE', item: null, mag: 1, meta: { season: 'autumn' } };
  const a = Events.briefLine(old), b = Events.briefLine(now);
  ok(!!a && a === b, '⑤ ★옛 가을 사건 = 지금 가을 사건과 같은 한 줄(공표 칸을 안 읽는다)', a);
  ok(!/올겨울|모아 두려|손을 보태/.test(a), '⑤b 없어진 프로젝트를 다시 공표하지 않는다');
  ok(/올겨울/.test(Events.briefLine({ vid: 0, day: 1, type: 'WINTER_KEPT', item: 'food', mag: 1 })), '⑤c (자명 통과 방지) 같은 낱말 검사가 옛 판정 줄에선 **걸린다**');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 옛 DB 표는 지우지 않는다 · 새 DB 엔 안 생긴다 — 존 DB 정본(`zone-local-db`)을 하위 실행에서 연다(한 실행 = 한 DB)
// ─────────────────────────────────────────────────────────────────────────────
{
  const { DatabaseSync } = require('node:sqlite');
  const tmp = (k) => `/tmp/test-winter-${k}-${process.pid}.db`;
  const OLD = tmp('old'), NEW = tmp('new');
  for (const f of [OLD, NEW]) for (const x of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + x); } catch (e) {} }
  { const d = new DatabaseSync(OLD);
    d.exec(`CREATE TABLE village_winter (zone TEXT NOT NULL, vid INTEGER NOT NULL, year INTEGER NOT NULL, player_id TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 0, res TEXT, name TEXT, PRIMARY KEY (zone, vid, year, player_id));
      INSERT INTO village_winter VALUES ('hanbando', 3, 0, '', 50, 'food', NULL), ('hanbando', 3, 0, 'anon_x', 12, 'food', '들풀');`);
    d.close(); }
  const code = `const D=require(${JSON.stringify(SV('zone-local-db.js'))});
    const has=D.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='village_winter'").all().length>0;
    const n=has?D.db.prepare('SELECT COUNT(*) AS c FROM village_winter').get().c:null;
    const chron=D.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='village_chronicle'").all().length>0;
    process.stdout.write('@@'+JSON.stringify({has,n,chron,fns:[typeof D.upsertVillageWinter,typeof D.getVillageWinterSince]}));`;
  const run = (db) => { const o = execFileSync(process.execPath, ['-e', code], { env: Object.assign({}, process.env, { DB_PATH: db, ZONE_ID: 'hanbando' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); return JSON.parse(o.slice(o.lastIndexOf('@@') + 2)); };
  let o = null, n = null;
  try { o = run(OLD); n = run(NEW); } catch (e) { ok(false, '⑥ 하위 실행 오류', String(e && e.message || e).slice(0, 200)); }
  if (o && n) {
    ok(n.chron === true, '⑥ 전제: 하위 실행이 존 DB 정본을 실제로 열었다(연표 표가 섰다)');
    ok(o.has === true && o.n === 2, '⑥ ★옛 DB 의 `village_winter` 표 · 행은 **그대로** 남는다(DROP 0)', `행 ${o.n}`);
    ok(n.has === false, '⑥b 새 DB 엔 그 표가 안 생긴다');
    ok(o.fns.every((t) => t === 'undefined'), '⑥c 그 표를 쓰고 읽던 도우미 둘이 없다', o.fns.join(' '));
  }
  for (const f of [OLD, NEW]) for (const x of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + x); } catch (e) {} }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ ★[재민 확정 2026-09-03 · ⓑ] 곳간 식량 등가 — 보존식도 곳간의 식량이다(옛 ⑧ 그대로).
//    ★[T779] 이 밑변을 쓰던 소속 인출 한도 · 겨울 달성 보상은 걷었다 — 지금 묻는 곳은 쓰러진 사람 구제 죽
//    (`zone._villageMeal` — "곳간이 비었나") 하나다. 겨울이면 곡식은 이미 보존식으로 갈무리돼 있으니
//    `storage.food` 한 칸만 보면 곳간이 빈 것으로 읽혀 구제가 막힌다 ⇒ 밑변은 econ 정본 `totalFoodEquivalent` 그대로(사본 0).
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(0, 11);
  const vil = { dbId: 900, name: '겨울시험', econ: world.villages[0] };
  const st = vil.econ.storage;
  for (const k of Object.keys(st)) st[k] = 0;
  //   ⓐ 곡식 칸이 비었는데 보존식이 있는 겨울 곳간
  st.dried_fish = 120;
  const raw = Villages.playerVillageWithdrawStock(vil, 'food');
  const feq = Villages.playerVillageWithdrawStockFoodEq(vil);
  ok(raw === 0, '⑦ 전제: 곡식 칸은 **비어 있다**(아래가 자명 통과가 아니다)', `food ${raw}`);
  ok(feq > 0, '⑦a ★그래도 곳간엔 식량이 있다 — 식량 등가가 보존식을 센다', `등가 ${feq}`);
  //   ⓑ 그 수는 econ 정본이 낸 수다(사본 금지 — 같은 함수로 대조)
  const canon = Math.floor((+econ.totalFoodEquivalent(vil.econ) || 0) / 1);
  ok(feq === canon, '⑦b 그 수는 **econ 정본 `totalFoodEquivalent`** 그대로다(사본 0)', `${feq} vs ${canon}`);
  //   ⓒ 보존식을 빼면 등가도 같이 준다 — 상수를 심어 둔 게 아니다
  st.dried_fish = 0;
  ok(Villages.playerVillageWithdrawStockFoodEq(vil) === 0, '⑦c 보존식을 비우면 등가도 0 이 된다(고정값이 아니다)');
  //   ⓓ "이 재화가 식량으로 세어지는가"도 **목록을 옮겨 적지 않고** econ 에게 묻는다
  st.dried_fish = 50; st.stone = 50;
  ok(Villages._countsAsFoodEq(vil, 'dried_fish') === true, '⑦d 보존식은 식량으로 센다(econ 에게 물어서 안다)');
  ok(Villages._countsAsFoodEq(vil, 'stone') === false, '⑦e ★자명 통과 금지 — 돌은 식량이 아니다');
  const zcode = codeOf(fs.readFileSync(SV('zone.js'), 'utf8'));
  ok(/function _villageMeal[\s\S]{0,600}playerVillageWithdrawStockFoodEq\(/.test(zcode), '⑦f 그 밑변을 묻는 자리 = 구제 죽(`_villageMeal`) — 지금 남은 쓰임');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑧ ★자가 검사 — ③ 이 **잡을 수 있는 검사인가**: 장부의 옛 쓰는 자리(⑩ `extra.winter.emit` 고리)를 되살린 사본을 같은 꼴로 돌린다
//    사본은 메모리에서만 짓는다(같은 파일 이름 · 같은 상대 경로로 — 저장소엔 손대지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
{
  const src = fs.readFileSync(SV('events.js'), 'utf8');
  const MARK = '    // ⑩ ★[T779] 겨울나기 판정';
  const at = src.indexOf(MARK);
  ok(at > 0, '⑧ 전제: 걷은 자리(⑩ 표지)를 장부 소스에서 찾았다', at > 0 ? `@${at}` : '(없음)');
  if (at > 0) {
    const eol = src.indexOf('\n', at);
    const revived = src.slice(0, at)
      + '    for (const e of ((extra && extra.winter && extra.winter.emit) || [])) {\n'
      + '      if (e == null || e.vid == null) continue;\n'
      + '      commit(st(e.vid), [{ day, vid: e.vid | 0, type: String(e.type), item: e.item || null, mag: +e.mag || 1, meta: e.meta || null }], out);\n'
      + '    }' + src.slice(eol);
    const m = new Module(SV('events.js'), null);
    m.filename = SV('events.js');
    m.paths = Module._nodeModulePaths(path.dirname(m.filename));
    let EM = null;
    try { m._compile(revived, m.filename); EM = m.exports; } catch (e) { ok(false, '⑧ 되살린 사본을 못 지었다', String(e && e.message || e).slice(0, 200)); }
    if (EM) {
      const world = makeWorld(0, 7);
      const LA = mkLedger(world), LM = mkLedger(world, EM);
      const _l = console.log; console.log = () => {};
      try { for (let d = 1; d <= 5; d++) { econV2.tickWorldV2(world); LA.scanDay(world, world.day, {}); LM.scanDay(world, world.day, OLD_EXTRA(world.day)); } } finally { console.log = _l; }
      ok(winterIn(LM) > 0 && chronWinter(LM) > 0, '⑧ ★옛 쓰는 자리를 되살리면 같은 셈이 **겨울 판정을 잡는다**(③ 은 잡을 수 있는 검사다)', `되살린 판 ${winterIn(LM)} · 연표 ${chronWinter(LM)}`);
      ok(JSON.stringify(LA.stats.byType) !== JSON.stringify(LM.stats.byType), '⑧b 그리고 ③c 의 두 장부 대조가 **갈린다**', `${LA.stats.emitted} ≠ ${LM.stats.emitted}`);
    }
  }
  ok(chronWinter(L4) === 2, '⑧c 연표 셈(`chronWinter`)도 옛 판정을 실제로 센다(④ 의 복구 판에서 2)', String(chronWinter(L4)));
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
process.exit(fail ? 1 : 0);
