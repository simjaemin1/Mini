#!/usr/bin/env node
// @regress
// === scripts/test-zone-fauna.js — T622 짐승 존 칸(T607 표 그대로 · 손잡이 `T622_ZONE_FAUNA` 기본 끔) ==========
//
// ★왜 [재민 "한반도와 닛폰 특산 차이가 크게" · 카드 T622] 카탈로그(`server/animals.js` ANIMALS)는 존 구분이 없어서
//   열도(닛폰 · biome mountain)에도 호랑이가 났다. T607(`설계/고증_짐승.md`)이 두 존의 있음/드묾/없음을 출처로 적었다 —
//   이 하네스는 그 칸이 **표 그대로** 옮겨졌는지, 켜면 **없음 = 안 남**이 세 자리(첫 스폰 · DB 적재 · 야생 블록)에서
//   실제로 서는지, 끄면 **옛 줄 그대로**인지를 잰다.
//
//  ① 표 = T607 그대로 — 고증 문서 ① 표를 **읽어서** 칸마다 대조(사본 0) · 문서 18줄 = 표 줄 9 + 새 종 후보 8 + 나중 존 1
//     (★[T636 · 재민 10-04] 곰 = 반달가슴곰 줄 · 불곰은 나중 존 `FAUNA_LATER`)
//  ② 끔 = 옛 줄 — 손잡이 없음이면 모든 biome × 존에서 목록이 옛 함수(존 없음)와 **같은 배열** · `faunaOut` 늘 false
//     · 배선(zone.js 첫 스폰 · DB 적재 · wildlife.js 5a)이 손잡이 뒤에 있다 · 블록(B)은 무수정
//  ③ 켬 — 닛폰 mountain 목록에서 호랑이만 빠진다 · 한반도 목록 그대로 · 표범은 칸만 없음(두 존 biome 목록에 원래 없다)
//     · 드묾(미끼 줄)은 몫 무변(T607 은 비를 안 줬다) · 새 종은 안 든다 · 표 밖 종(아이벡스 · 범위 밖)은 지금 값 · 곰(반달가슴곰)은 두 존 있음
//  ④ 야생 블록 다리 — 실기(정본 `tick` · 최소 호스트 = test-hunt-vis ⑥ 꼴): 랩 🐯 한 마리를 세워 두고 한 틱 —
//     끔 닛폰 = 그림자 tiger 가 선다(대조) · 켬 닛폰 = 그림자 0 · 랩 목록에서도 빠진다 · 켬 한반도 = 선다
//  ⑤ 실부팅(닛폰 · 임시 DB · 하위 프로세스 둘) — 켬: 첫 스폰 공격 개체가 서는데 호랑이 0 ·
//     DB 에 심은 호랑이 행은 안 싣고 행은 남는다(늑대 행은 싣는다 — 적재 길이 실제로 돈다)
//  ⑥ TV 짐승 줄 — `region-profiles tvTable().fauna` — 끔 = 지금 두 목록의 TV · 켬이면 커진다
//
// 실행: node scripts/test-zone-fauna.js        (⑤ 가 닛폰을 두 번 띄운다 — 2코어에서 1~2분)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 하위 실행(④ 야생 다리 · ⑤ 실부팅) — 결과 JSON 한 줄을 낸다 ══════════════════════════════
const SUB = process.env.T622_SUB || '';
if (SUB === 'wild') {
  // ④ — 최소 호스트로 정본 tick 을 돌리고, 랩 🐯 한 마리를 세운 뒤 한 틱
  process.env.ENABLE_WILDLIFE = '1';
  let st = 1020 | 0;   // 결정론(test-hunt-vis ⑥ 와 같은 처방) — 블록 굴림이 같은 난수열을 본다
  Math.random = function () { st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const _log = console.log; console.log = () => {};
  const W = require(SV('wildlife.js'));
  const zone = process.env.T622_SUB_ZONE;
  const N = 64, CH = 512, CC = CH / 32;
  const LED = new Map(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) LED.set(x + ',' + y, 100);
  const keys = new Set(); for (let cy = 0; cy < N / CC; cy++) for (let cx = 0; cx < N / CC; cx++) keys.add(cx + '_' + cy);
  const mobs = new Map();
  W.init({ ZONE_ID: zone, TICK_HZ: 30, ZONE: { zoneWidth: 32 * N, zoneHeight: 32 * N },
    WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 },
    isTerrainBlockedLocal: () => false, isRockTileLocal: () => false, terrainMod: { getForestMultiplier: () => 2 },
    chunkManager: { chunkSize: CH, removeMob: () => {}, insertMob: () => {}, updateMobChunk: () => {} },
    players: new Map(), mobs, getActiveChunkKeys: () => keys, isPositionActive: () => true,
    spawnCorpse: () => {}, damagePlayer: () => {}, broadcast: () => {}, simVillages: () => [], legacyVillages: [], warThreats: () => [],
    gameRichAt: (k) => LED.get(String(k)), gameRichSize: () => LED.size });
  const S = W._debug.S;
  let t = 60000;
  for (let i = 0; i < 600; i++) { t += 1000 / 30; W.tick(t); }   // 데우기 — 초식이 선다(블록이 스스로 낳는 🐯 는 이 틱 수 안엔 드물다)
  const types0 = {}; for (const m of mobs.values()) types0[m.type] = (types0[m.type] || 0) + 1;
  // 랩 🐯 한 마리 — 블록 spawnGrp 가 짓는 그 꼴(필드 그대로 · 픽스처)
  const tig = { px: 40.5, py: 40.5, type: '🐯', gid: 99999, hp: 14, tmp: 1, stam: 1, hun: 0, ang: 0, pause: 0, cd: 0, fcd: 0, cvo: 0, cvt: 0, flk: 0, st: 'prowl' };
  S.mobs.push(tig);
  t += 1000 / 30; W.tick(t);
  let tigerShadow = 0; for (const m of mobs.values()) if (m.type === 'tiger') tigerShadow++;
  console.log = _log;
  console.log(JSON.stringify({ zone, knob: process.env.T622_ZONE_FAUNA || null, warm: types0, tigerShadow,
    inLab: S.mobs.indexOf(tig) >= 0, rot: tig.rot === undefined ? null : tig.rot, cut: W._debug.stats.t622 || 0 }));
  process.exit(0);
}
if (SUB === 'boot') {
  // ⑤ — 닛폰을 임시 DB·임시 포트로 띄운다(test-tame 꼴 · 라이브 무접촉). T622_SUB_SEED=1 이면 DB 에 행을 먼저 심는다.
  const TMP = `/tmp/t622-zone-fauna-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'nippon';
  process.env.PORT = String(41100 + (process.pid % 800));
  process.env.DB_PATH = TMP;
  const _log = console.log, logs = [];
  console.log = (...a) => { logs.push(a.join(' ')); };
  console.warn = () => {}; console.error = () => {};
  let seeded = null;
  if (process.env.T622_SUB_SEED === '1') {
    const LDB = require(SV('zone-local-db.js'));
    for (const [type, x, y] of [['tiger', 30000, 60000], ['tiger', 31000, 61000], ['wolf', 32000, 62000]]) LDB.insertMob({ type, x, y, hp: 50, max_hp: 50 });
    seeded = LDB.getMobs().length;
  }
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  const cnt = {}; for (const m of H.mobs.values()) cnt[m.type] = (cnt[m.type] || 0) + 1;
  let dbRows = null;
  try { const LDB = require(SV('zone-local-db.js')); const r = {}; for (const row of LDB.getMobs()) r[row.type] = (r[row.type] || 0) + 1; dbRows = r; } catch (e) { dbRows = null; }
  console.log = _log;
  console.log(JSON.stringify({ knob: process.env.T622_ZONE_FAUNA || null, seeded, cnt, dbRows,
    t622: logs.filter((s) => /T622 존 칸/.test(s)) }));
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ══ 본 실행 ═══════════════════════════════════════════════════════════════════════════════
delete process.env.T622_ZONE_FAUNA;
const A = require(SV('animals.js'));
const RP = require(SV('region-profiles.js'));
const ZC = require(SV('zone-config.js'));
const ZSRC = fs.readFileSync(SV('zone.js'), 'utf8');
const WSRC = fs.readFileSync(SV('wildlife.js'), 'utf8');
const DOC = fs.readFileSync(path.join(ROOT, '설계', '고증_짐승.md'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const withEnv = (env, fn) => { const old = {}; for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
  try { return fn(); } finally { for (const k of Object.keys(env)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 옛 함수 — 이 카드 앞의 `huntableInBiome` 본문 그대로(존 없음)
const oldHunt = (biome) => Object.entries(A.ANIMALS).filter(([id, m]) => !m.breeding && m.spawn_biome.includes(biome)).map(([id]) => id);
const BIOMES = [...new Set(Object.values(ZC.ZONES).map((z) => z.biome))];
const ZIDS = Object.keys(ZC.ZONES);

say('\n=== 짐승 존 칸 (T622 · T607 표 그대로 · 손잡이 T622_ZONE_FAUNA 기본 끔) ===');

// ── ① 표 = T607 그대로 ───────────────────────────────────────────────────────────────────
say('\n① 표 = T607 그대로 — 고증 문서 ① 표를 읽어 칸마다 대조');
{
  // 문서 ① 표: `| 종 | 한반도 | 열도(…) | …` — 머리·구분 줄 다음부터 빈 줄까지
  const lines = DOC.split('\n');
  const h = lines.findIndex((l) => /^\|\s*종\s*\|\s*한반도\s*\|/.test(l));
  const rows = [];
  for (let i = h + 2; i < lines.length && /^\|/.test(lines[i]); i++) {
    const c = lines[i].split('|').slice(1, -1).map((s) => s.trim());
    const word = (s) => { const m = s.replace(/\*\*/g, '').match(/^(있음|없음|드묾)/); return m ? m[1] : null; };
    rows.push({ name: c[0].replace(/\*\*/g, ''), hb: word(c[1]), np: word(c[2]) });
  }
  pre(h > 0 && rows.length > 0, '문서 ① 표를 찾았다', `${rows.length}줄`);
  const mine = [...A.ZONE_FAUNA, ...A.FAUNA_NEW, ...A.FAUNA_LATER];
  ok(rows.length === 18 && mine.length === 18, '★① 문서 18줄 = 표 줄 9 + 새 종 후보 8 + 나중 존 1(불곰 · T636)',
    `문서 ${rows.length} · 표 ${A.ZONE_FAUNA.length} + 새 종 ${A.FAUNA_NEW.length} + 나중 존 ${A.FAUNA_LATER.length}`);
  const miss = [], bad = [];
  for (const r of rows) {
    const m = mine.filter((x) => x.t607 === r.name);
    if (m.length !== 1) { miss.push(r.name); continue; }
    if (m[0].hb !== r.hb || m[0].np !== r.np) bad.push(`${r.name} 문서 ${r.hb}/${r.np} ≠ 표 ${m[0].hb}/${m[0].np}`);
  }
  ok(miss.length === 0, '★★① 문서의 줄마다 표에 꼭 한 번 있다', miss.join(' · ') || '빠짐 0');
  ok(bad.length === 0, '★★① 칸(한반도/열도)이 문서 글자 그대로다', bad.join(' · ') || '어긋남 0');
  const ids = A.ZONE_FAUNA.map((r) => r.id);
  ok(ids.every((id) => A.ANIMALS[id] && !A.ANIMALS[id].breeding) && new Set(ids).size === ids.length,
    '① 표 줄의 id 는 전부 카탈로그의 야생 종이다(유령 0 · 겹침 0)', ids.join(','));
  const kos = new Set(Object.values(A.ANIMALS).map((m) => m.ko));
  const ghost = A.FAUNA_NEW.filter((r) => kos.has(r.t607.split(/[ (/]/)[0]));
  ok(ghost.length === 0, '① 새 종 후보 8은 카탈로그에 이름이 없다(게임에 없는 종 — 켬에서도 안 넣는다)', ghost.map((r) => r.t607).join(',') || '0');
  const bearRow = A.ZONE_FAUNA.find((r) => r.id === 'bear');
  ok(!!bearRow && bearRow.t607 === '반달가슴곰' && !ids.includes('ibex'), '★① [T636] 곰 = 반달가슴곰 줄(재민 10-04) · 아이벡스는 표에 줄이 없다(T607 재민 칸 → 지금 값)', bearRow ? `${bearRow.hb}/${bearRow.np}` : '없음');
  ok(A.FAUNA_LATER.length === 1 && A.FAUNA_LATER[0].t607 === '불곰' && !kos.has('불곰'), '① [T636] 불곰은 나중 존 줄 하나 — 게임 id 없음(지금 존에 안 남)');
  const npOut = mine.filter((r) => r.np === '없음').map((r) => r.t607.split('(')[0]);
  const hbOut = mine.filter((r) => r.hb === '없음').map((r) => r.t607.split('(')[0]);
  ok(hbOut.length === 1 && /일본원숭이/.test(hbOut[0]), '① 한반도 없음 1 = 일본원숭이(T607 ② 그대로)', hbOut.join(','));
  ok(npOut.length === 7, '① 열도 없음 = T607 ② 여섯(호랑이·표범·스라소니·고라니·노루·불곰) + 수달(표 칸 "없음" · 청동기 당시 미확인 — ② 요약엔 안 셌다)', npOut.join(','));
  ok(A.ZONE_FAUNA.filter((r) => r.diff).map((r) => r.id).join() === 'pheasant' && A.FAUNA_NEW.filter((r) => r.diff).length === 3,
    '① "다른 종" 네 쌍(너구리·오소리·꿩·산양)은 없음이 아니라 있음/있음 + 표시(T607 ② "섞지 않는다")');
  const rare = mine.filter((r) => r.hb === '드묾' || r.np === '드묾');
  ok(rare.length === 1 && rare[0].t607 === '불곰' && A.ZONE_FAUNA.every((r) => r.hb !== '드묾' && r.np !== '드묾'), '① 드묾 칸은 불곰 한반도 하나(나중 존) — 게임 종엔 드묾 0', rare.map((r) => r.t607).join(','));
}

// ── ② 끔 = 옛 줄 ─────────────────────────────────────────────────────────────────────────
say('\n② 끔 = 옛 줄 — 손잡이 없음이면 목록이 옛 함수와 같은 배열');
{
  ok(A.faunaOn() === false, '★② 손잡이 없음 = 끔');
  let diff = 0, n = 0;
  for (const b of BIOMES) {
    if (!same(A.huntableInBiome(b), oldHunt(b))) diff++;
    for (const z of ZIDS) { n++; if (!same(A.huntableInBiome(b, z), oldHunt(b))) diff++; }
  }
  ok(diff === 0, '★★② 끔 — biome × 존 전부 옛 함수와 같은 배열(차례까지)', `${BIOMES.length} biome × ${ZIDS.length} 존 = ${n}쌍 · 다른 것 ${diff}`);
  let outN = 0; for (const id of Object.keys(A.ANIMALS)) for (const z of ZIDS) if (A.faunaOut(id, z)) outN++;
  ok(outN === 0, '② 끔 — faunaOut 은 늘 false(DB 적재 · 야생 다리가 아무것도 안 거른다)');
  withEnv({ T622_ZONE_FAUNA: '0' }, () => ok(A.faunaOn() === false, "② '0' 도 끔(켬은 '1' 하나)"));
  ok(/huntableInBiome\(ZONE\.biome, ZONE_ID\)/.test(ZSRC), '② 배선 — zone.js 첫 스폰이 존을 같이 넘긴다');
  ok(/if \(!row\.tame_owner && faunaOut\(row\.type, ZONE_ID\)\) \{ _t622skip\+\+; continue; \}/.test(ZSRC), '② 배선 — zone.js DB 적재가 같은 함수로 거른다(길들인 개체 제외)');
  const i5 = WSRC.indexOf('updateMobs(S, 1 / H.TICK_HZ);'), i5a = WSRC.indexOf('if (Animals.faunaOn()) {'), i6 = WSRC.indexOf('// 6) 랩몹 → shadow 동기');
  ok(i5 > 0 && i5 < i5a && i5a < i6, '② 배선 — wildlife.js 5a 는 블록 구동 뒤 · 그림자 동기 앞에 · 손잡이 뒤에 있다');
  const ib = WSRC.indexOf('function updateMobs('), ie = WSRC.indexOf('// ═══ [C] 본체 브리지');
  const blk = WSRC.slice(ib, ie);
  ok(ib > 0 && ie > ib && !/T622|faunaOut|faunaOn/.test(blk), '② 블록(B)은 무수정 — 이 카드의 글자가 블록 안에 없다');
}

// ── ③ 켬 ──────────────────────────────────────────────────────────────────────────────────
say('\n③ 켬 — 그 존에서 없음 = 안 남 · 드묾은 몫 무변 · 새 종 0 · 표 밖은 지금 값');
withEnv({ T622_ZONE_FAUNA: '1' }, () => {
  const bH = ZC.ZONES.hanbando.biome, bN = ZC.ZONES.nippon.biome;
  const hOff = oldHunt(bH), nOff = oldHunt(bN), hOn = A.huntableInBiome(bH, 'hanbando'), nOn = A.huntableInBiome(bN, 'nippon');
  pre(nOff.includes('tiger'), `끔 닛폰(${bN}) 목록에 호랑이가 있다(이게 없으면 아래가 자명 통과)`, nOff.join(','));
  ok(!nOn.includes('tiger') && same(nOn, nOff.filter((id) => id !== 'tiger')), '★★③ 켬 닛폰 — 호랑이만 빠진다(차례 그대로)', `${nOff.length} → ${nOn.length}종 · ${nOn.join(',')}`);
  ok(same(hOn, hOff), '★③ 켬 한반도 — 목록 그대로(호랑이 있음)', `${hOn.length}종`);
  ok(A.faunaCell('leopard', 'nippon') === '없음' && !nOff.includes('leopard') && !hOff.includes('leopard'),
    '③ 표범 — 닛폰 칸 없음이지만 두 존 biome 목록에 원래 없다(빠지는 수 0 · 보고에 줄)', `spawn_biome ${A.ANIMALS.leopard.spawn_biome.join(',')}`);
  ok(nOn.includes('bear') && hOn.includes('bear') && nOn.includes('ibex') && hOn.includes('moose'), '③ 곰(반달가슴곰 있음/있음)은 두 존에서 그대로 · 표 밖 종(아이벡스 · 무스)은 지금 값 그대로');
  const all = new Set(Object.keys(A.ANIMALS));
  let ghost = 0; for (const b of BIOMES) for (const z of ZIDS) for (const id of A.huntableInBiome(b, z)) if (!all.has(id)) ghost++;
  ok(ghost === 0, '③ 켬에서도 새 종은 안 든다(목록은 카탈로그 안에서 빼기만)');
  let other = 0; for (const b of BIOMES) for (const z of ZIDS) if (!A.FAUNA_ZONES[z] && !same(A.huntableInBiome(b, z), oldHunt(b))) other++;
  ok(other === 0, '③ 프로필 없는 존(중원북 · 베링 · 바다 …)은 켬에서도 옛 줄', `다른 것 ${other}`);
  // 드묾 미끼 — 표 한 칸(닛폰 늑대)을 드묾으로 바꿔 보면(하네스 미끼 · 끝나면 되돌린다) 목록은 그대로(T607 은 비를 안 줬다 → 표시만)
  const row = A.ZONE_FAUNA.find((r) => r.id === 'wolf'), keep = row.np;
  try {
    row.np = '드묾';
    pre(A.faunaCell('wolf', 'nippon') === '드묾', '미끼가 실제로 들었다(닛폰 늑대 칸 = 드묾)');
    ok(same(A.huntableInBiome(bN, 'nippon'), nOn) && !A.faunaOut('wolf', 'nippon'), '★③ 드묾 미끼 — 목록 그대로(몫 무변 · 거르는 것은 없음 하나)', nOn.join(','));
  } finally { row.np = keep; }
  ok(A.faunaCell('wolf', 'nippon') === '있음', '③ 미끼를 되돌렸다');
});

// ── ④ 야생 블록 다리 — 실기 ──────────────────────────────────────────────────────────────
say('\n④ 야생 블록 다리 — 랩 🐯 한 마리를 세우고 한 틱(정본 tick · 최소 호스트)');
const sub = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, env), stdio: 'pipe' }).toString().trim().split('\n').pop());
{
  const offN = sub({ T622_SUB: 'wild', T622_SUB_ZONE: 'nippon', T622_ZONE_FAUNA: '' });
  const onN = sub({ T622_SUB: 'wild', T622_SUB_ZONE: 'nippon', T622_ZONE_FAUNA: '1' });
  const onH = sub({ T622_SUB: 'wild', T622_SUB_ZONE: 'hanbando', T622_ZONE_FAUNA: '1' });
  pre(Object.keys(offN.warm).length > 0, '데우기 600틱 — 초식 그림자가 섰다(다리가 실제로 돈다)', JSON.stringify(offN.warm));
  pre(offN.tigerShadow >= 1 && offN.inLab, '끔 닛폰(대조) — 세운 🐯 가 그림자 tiger 로 선다(이게 없으면 아래가 자명 통과)', `그림자 ${offN.tigerShadow} · 거둔 수 ${offN.cut}`);
  ok(onN.tigerShadow === 0 && !onN.inLab && onN.rot === -1 && onN.cut >= 1, '★★④ 켬 닛폰 — 그림자 0 · 랩 목록에서도 빠졌다(rot −1 = 블록 디스폰 꼴)', `그림자 ${onN.tigerShadow} · 거둔 수 ${onN.cut}`);
  ok(onH.tigerShadow >= 1 && onH.inLab && onH.cut === 0, '★④ 켬 한반도 — 그대로 선다(한반도 호랑이 있음)', `그림자 ${onH.tigerShadow}`);
  ok(offN.cut === 0, '④ 끔 — 다리 5a 가 하나도 안 거른다');
}

// ── ⑤ 실부팅(닛폰) ────────────────────────────────────────────────────────────────────────
say('\n⑤ 실부팅 — 닛폰을 임시 DB 로 두 번(첫 스폰 · DB 적재) 띄운다(켬)');
const subAsync = (env) => new Promise((res) => {
  const p = spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', () => {});
  p.on('close', () => { try { res(JSON.parse(out.trim().split('\n').pop())); } catch (e) { res({ err: out.slice(-400) }); } });
});
(async () => {
  const t0 = Date.now();
  const [fresh, seeded] = await Promise.all([
    subAsync({ T622_SUB: 'boot', T622_ZONE_FAUNA: '1' }),
    subAsync({ T622_SUB: 'boot', T622_ZONE_FAUNA: '1', T622_SUB_SEED: '1' }),
  ]);
  const c = fresh.cnt || {};
  const aggr = Object.keys(c).filter((k) => k !== 'tiger' && A.ANIMALS[k] && A.ANIMALS[k].aggressive).reduce((s, k) => s + c[k], 0);
  pre(!fresh.err && aggr > 0, '켬 닛폰 첫 스폰 — 공격 개체가 실제로 섰다(늑대·곰 · 이게 0 이면 아래가 자명 통과)', fresh.err || JSON.stringify(c));
  ok(!c.tiger, '★★⑤ 켬 닛폰 첫 스폰 — 호랑이 0', JSON.stringify(c));
  ok((fresh.t622 || []).some((s) => /호랑이\(tiger\)/.test(s)), '⑤ 부팅 줄이 무엇을 안 낳는지 적는다', (fresh.t622 || [])[0] || '');
  const s = seeded.cnt || {}, r = seeded.dbRows || {};
  pre(!seeded.err && seeded.seeded === 3 && s.wolf === 1, 'DB 에 행 셋(호랑이 2 · 늑대 1)을 심었고 늑대 행은 실렸다(적재 길이 실제로 돈다)', seeded.err || JSON.stringify(s));
  ok(!s.tiger, '★★⑤ 켬 닛폰 DB 적재 — 호랑이 행은 안 실었다', JSON.stringify(s));
  ok(r.tiger === 2, '★⑤ 그 행은 DB 에 그대로 있다(지우지 않는다 · 끄면 돌아온다)', JSON.stringify(r));
  ok((seeded.t622 || []).some((x) => /2마리는 안 실었다/.test(x)), '⑤ 적재 줄이 안 실은 수를 적는다', (seeded.t622 || [])[0] || '');
  say(`  ── 실부팅 두 판 ${((Date.now() - t0) / 1000).toFixed(0)}초`);

  // ── ⑥ TV 짐승 줄 ─────────────────────────────────────────────────────────────────────────
  say('\n⑥ TV 짐승 줄 — region-profiles tvTable().fauna');
  {
    const flat = (ids) => { const o = {}; for (const id of ids) o[id] = 1 / ids.length; return o; };
    const off = RP.tvTable().fauna;
    const want = +RP.tv(flat(oldHunt(ZC.ZONES.hanbando.biome)), flat(oldHunt(ZC.ZONES.nippon.biome))).toFixed(4);
    ok(off === want && off > 0, '★⑥ 끔 — 지금 두 첫 스폰 목록(biome)의 TV', `${off}`);
    const on = withEnv({ T622_ZONE_FAUNA: '1' }, () => RP.tvTable().fauna);
    ok(on > off, '★⑥ 켬 — 두 존 짐승이 더 갈린다(TV 커짐)', `${off} → ${on}`);
    ok(['ore', 'tree', 'fishFresh', 'fishRod', 'forage'].every((k) => k in RP.tvTable()), '⑥ 옛 다섯 줄은 그대로 있다(한 줄 더하기)');
  }

  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})();
