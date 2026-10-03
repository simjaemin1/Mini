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
//   · `VILLAGE_NPC_CAP=1` — 가시 몸만 줄인다(econ 인구는 무제한 · 시뮬 진실). 몸 5천을 30Hz 로 굴리면 빠른 시계를 못 버틴다.
//   · 시드 = econ 시드(`createWorldV2({seed})` 한 칸 — t17 이 시드를 바꾸는 그 자리). 지도·소굴·전쟁 시드는 그대로.
//   ⚠서버 판은 **바이트 결정론이 아니다**(하루 마감 조각 · 캐러밴 몸 타이밍이 벽시계에 기댄다) — 같은 시드도 판마다 조금 갈린다.
//     그래서 판정하지 않는다: 이 자의 ok() 는 "판이 끝까지 돌았다 · 시딩이 섰다"뿐이고 수는 **표**다(기준선은 PM 이 착지 때 선언).
//
// 실행:
//   node scripts/t577-server-run.js [일수=800] [시드=1020,7,42]          # 판 셋(동시 T577_PAR · 기본 min(3, 코어))
//   T577_CAND_WALK=1 node scripts/t577-server-run.js 800 1020            # 후보 손잡이(env 는 아이에게 그대로 간다)
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
    const e = o.eight, cand = Object.keys((o.env && o.env.cand) || {}).map((k) => `${k.replace(/^T577_/, '')}=${o.env.cand[k]}`).join(' ') || '기준';
    const early = (o.bdtDay || []).filter((d) => d != null && d <= 400).length;
    const last = o.rows && o.rows.length ? o.rows[o.rows.length - 1][1] : [];
    const hit = (o.names || []).map((n, i) => (E11.includes(n) && last[i] === 0 ? n : null)).filter(Boolean);
    console.log(`| ${cand} | ${o.seed} | ${o.days} | ${e.pop} | ${e.dead}/${e.ever} | ${e.weapQ} | ${e.expand} | ${e.board} | ${e.toolQ} | ${e.preserve} | ${e.grain}`
      + ` | ${o.dissolved} | ${o.empty} | ${o.firstEmpty ?? '—'} | ${early} | ${o.deadTot} | ${o.tradersKilled}`
      + ` | ${o.bandit ? o.bandit.conv : '—'} | ${o.bandit ? o.bandit.exo : '—'} | ${hit.length}${hit.length ? ' (' + hit.join('·') + ')' : ''} |`);
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
const TAG = Object.keys(process.env).filter((k) => /^T577_CAND_/.test(k)).map((k) => `${k.replace(/^T577_CAND_/, '').toLowerCase()}${process.env[k]}`).join('-') || 'base';

function runOne(seed, k) {
  return new Promise((resolve) => {
    const out = path.join(DIR, `${TAG}-${seed}.json`), logf = path.join(DIR, `${TAG}-${seed}.log`);
    const db = path.join(DIR, `${TAG}-${seed}.db`);
    for (const f of [out, db, db + '-wal', db + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    const env = Object.assign({}, process.env, {
      ZONE_ID: 'hanbando', PORT: String(39100 + ((process.pid + k * 37) % 700)), DB_PATH: db,
      ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1',
      VILLAGE_DAY_MS: process.env.VILLAGE_DAY_MS || '250',
      T315_MAPBEDS: process.env.T315_MAPBEDS != null ? process.env.T315_MAPBEDS : '0',
      VILLAGE_NPC_CAP: process.env.VILLAGE_NPC_CAP || '1',
      T577_SEED: String(seed), T577_DAYS: String(DAYS), T577_OUT: out,
    });
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
  console.log(`  조건: VILLAGE_DAY_MS=${process.env.VILLAGE_DAY_MS || '250'} · T315_MAPBEDS=${process.env.T315_MAPBEDS != null ? process.env.T315_MAPBEDS : '0'} · VILLAGE_NPC_CAP=${process.env.VILLAGE_NPC_CAP || '1'} · 도적 ${process.env.ENABLE_BANDITS === '0' ? '끔' : '켬'}`);
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
