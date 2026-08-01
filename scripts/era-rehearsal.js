#!/usr/bin/env node
// === scripts/era-rehearsal.js — 시대 전환 리허설 =============================
//
// ★[재민] "내가 시대를 언제 여는지에 따라 흥망성쇠가 크게 갈리면 안 돼"
//   시대를 여는 건 되돌릴 수 없는 개입이다. **열기 전에** 세 가지를 확인하려고 만든 스크립트다:
//     ① 경로 3종이 같은 답을 내는가   — setEra() / WORLD_ERA / SCHEDULE
//     ② 실서버가 그 시대로 부팅되는가 — zone.js 부팅 스모크(임시 DB·임시 포트, 라이브 무접촉)
//     ③ 열면 세계가 어떻게 되는가     — 실지도 800일을 플립 전/후로 비교(ERA_FLIP_DAY 재사용)
//
// 실행:
//   node scripts/era-rehearsal.js                    # ①② 만(수 초)
//   node scripts/era-rehearsal.js --lab              # ③ 포함(시드 1개 · 약 10분)
//   node scripts/era-rehearsal.js --lab --seeds=1020,7,42 --flip=400 --days=800
//   node scripts/era-rehearsal.js --era=iron          # 다른 시대로 리허설
//
// ★이 스크립트는 **아무것도 열지 않는다.** SCHEDULE 파일도, 라이브 DB 도 건드리지 않는다.
//   시대를 실제로 여는 건 server/era.js 의 SCHEDULE 한 줄이고, 그건 재민만 쓴다.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const m = argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const flag = (k) => argv.includes(`--${k}`);

const TARGET = arg('era', 'early_iron');
const DAYS = parseInt(arg('days', '800'), 10);
const FLIP = parseInt(arg('flip', String(Math.floor(DAYS / 2))), 10);
const SEEDS = arg('seeds', '1020').split(',').map((s) => s.trim()).filter(Boolean);
const DO_LAB = flag('lab');

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const say = (...a) => console.log(...a);

const Era = require(path.join(ROOT, 'server', 'era.js'));
say(`=== 시대 전환 리허설 — 현재 "${Era.currentEra()}" → 목표 "${TARGET}" ===`);
if (!Era.ERAS.includes(TARGET)) { say(`알 수 없는 시대: ${TARGET} (가능: ${Era.ERAS.join(', ')})`); process.exit(1); }

// ══ ① 경로 3종이 같은 답을 내는가 ═══════════════════════════════════════════
//   era.js 는 setEra() > WORLD_ERA > SCHEDULE 우선순위다. 어느 길로 열든 **능력 집합이 같아야**
//   한다 — 다르면 "테스트에선 됐는데 라이브에선 안 되는" 사고가 난다.
say('\n[① 경로 3종 정합 — setEra() · WORLD_ERA · SCHEDULE]');
const capsSig = (era) => {
  const c = Era.capsOf(era);
  return JSON.stringify({ tech: [...c.tech].sort(), npcMetals: [...c.npcMetals].sort(), tame: [...c.tame].sort() });
};
{
  const want = capsSig(TARGET);

  // (a) setEra()
  Era.setEra(TARGET);
  ok(Era.currentEra() === TARGET, `setEra("${TARGET}") → currentEra="${Era.currentEra()}"`);
  ok(capsSig(Era.currentEra()) === want, '  능력 집합 일치');
  Era.setEra(null);

  // (b) WORLD_ERA — 자식 프로세스(환경변수는 부팅 시 읽힌다)
  const r = spawnSync(process.execPath, ['-e',
    `const E=require(${JSON.stringify(path.join(ROOT, 'server', 'era.js'))});
     const c=E.capsOf(E.currentEra());
     process.stdout.write(JSON.stringify({era:E.currentEra(),sig:JSON.stringify({tech:[...c.tech].sort(),npcMetals:[...c.npcMetals].sort(),tame:[...c.tame].sort()})}));`],
    { env: { ...process.env, WORLD_ERA: TARGET }, encoding: 'utf8' });
  let wo = null; try { wo = JSON.parse(r.stdout); } catch (e) {}
  ok(wo && wo.era === TARGET, `WORLD_ERA=${TARGET} → currentEra="${wo ? wo.era : r.stderr.trim().slice(0, 120)}"`);
  ok(wo && wo.sig === want, '  능력 집합 일치');

  // (c) SCHEDULE — 파일을 안 고치고 **메모리에서만** 한 줄 얹어 본다(원복)
  const backup = Era.SCHEDULE.slice();
  Era.SCHEDULE.push({ at: '1971-01-01T00:00:00Z', era: TARGET });   // 과거 시각 = 즉시 발효
  ok(Era.currentEra() === TARGET, `SCHEDULE 항목 추가 → currentEra="${Era.currentEra()}"`);
  ok(capsSig(Era.currentEra()) === want, '  능력 집합 일치');
  Era.SCHEDULE.length = 0; Era.SCHEDULE.push(...backup);
  ok(Era.currentEra() !== TARGET || TARGET === Era.ERAS[0], 'SCHEDULE 원복 — 리허설이 세계를 바꾸지 않았다');

  // 무엇이 달라지는지 사람이 읽을 수 있게
  const before = Era.capsOf(Era.currentEra()), after = Era.capsOf(TARGET);
  const diff = (k) => [...after[k]].filter((x) => !before[k].has(x));
  say(`  ⇒ 새로 알려지는 설비: ${diff('tech').join(', ') || '(없음)'}`);
  say(`  ⇒ NPC 가 다룰 금속 추가: ${diff('npcMetals').join(', ') || '(없음)'}`);
  say(`  ⇒ 길들일 짐승 추가: ${diff('tame').join(', ') || '(없음)'}`);
  for (const m of ['iron', 'copper', 'nickel', 'zinc']) {
    const setup = Era.bestSetup(TARGET);
    const y0 = Era.smeltYield(m, Era.bestSetup(Era.currentEra()), Era.currentEra());
    const y1 = Era.smeltYield(m, setup, TARGET);
    if (y0 !== y1) say(`  ⇒ ${m} 수율 ${(y0 * 100).toFixed(1)}% → ${(y1 * 100).toFixed(1)}% (최고 노 ${setup.furnace})`);
  }
}

// ══ ② 실서버 부팅 스모크 ════════════════════════════════════════════════════
//   시대만 바꾼 채 zone.js 를 실제로 띄운다. 임시 DB·임시 포트라 라이브는 손대지 않는다.
//   확인: 예외 없이 뜨는가 · zonePublicMeta().era 가 그 시대를 말하는가 · 노 목록이 늘었는가.
say('\n[② 실서버 부팅 스모크 — 시대를 바꾼 채 zone.js 를 띄운다]');
function bootProbe(env, label) {
  const tmp = `/tmp/era-reh-${process.pid}-${Math.abs(hash(label))}.db`;
  for (const f of [tmp, tmp + '-wal', tmp + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  const code = `
    const _l=console.log; console.log=()=>{}; console.warn=()=>{}; console.error=()=>{};
    let boomed=null;
    try { require(${JSON.stringify(path.join(ROOT, 'server', 'zone.js'))}); } catch(e) { boomed = e.message; }
    const E=require(${JSON.stringify(path.join(ROOT, 'server', 'era.js'))});
    console.log=_l;
    // zonePublicMeta 는 export 되지 않으므로 era 노출은 era.js + FURNACE_KINDS 계약으로 재현한다
    const known = ['crucible','bloomery','improved_bloomery','blast_furnace'].filter(k=>E.hasTech(k));
    process.stdout.write(JSON.stringify({ boomed, era: E.currentEra(), furnaces: known,
      ironYield: E.smeltYield('iron', E.bestSetup()) }));
    process.exit(0);
  `;
  const r = spawnSync(process.execPath, ['-e', code], {
    env: { ...env, ZONE_ID: 'hanbando', PORT: String(37000 + (Math.abs(hash(label)) % 900)), DB_PATH: tmp,
           ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' },
    encoding: 'utf8', timeout: 120000,
  });
  for (const f of [tmp, tmp + '-wal', tmp + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return { boomed: (r.stderr || '').trim().slice(0, 200) || 'stdout 파싱 실패' }; }
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
{
  const now = bootProbe(process.env, 'now');
  ok(!now.boomed, `현재 시대(${now.era}) 부팅 — ${now.boomed || '예외 없음'}`);
  say(`    노 목록 ${JSON.stringify(now.furnaces)} · 철 수율 ${(now.ironYield * 100).toFixed(1)}%`);
  const flipped = bootProbe({ ...process.env, WORLD_ERA: TARGET }, 'flip');
  ok(!flipped.boomed, `WORLD_ERA=${TARGET} 부팅 — ${flipped.boomed || '예외 없음'}`);
  ok(flipped.era === TARGET, `  서버가 "${flipped.era}" 로 뜬다`);
  say(`    노 목록 ${JSON.stringify(flipped.furnaces)} · 철 수율 ${(flipped.ironYield * 100).toFixed(1)}%`);
  ok(flipped.furnaces.length >= now.furnaces.length, '  노 목록이 줄지 않는다(시대는 누적이다)');
  ok(flipped.ironYield >= now.ironYield, '  철 수율이 줄지 않는다');
}

// ══ ③ 실지도 800일 플립 비교 ════════════════════════════════════════════════
if (!DO_LAB) {
  say(`\n[③ 실지도 플립 비교] --lab 을 주면 돈다 (시드 ${SEEDS.join(',')} · ${DAYS}일 · 플립 ${FLIP}일차)`);
} else {
  say(`\n[③ 실지도 플립 비교 — ${DAYS}일 · 플립 ${FLIP}일차 → ${TARGET} · 시드 ${SEEDS.join(',')}]`);
  say('   (시드당 두 판을 돌린다: 안 연 세계 vs 연 세계. 한 판 수 분)');
  const run = (seed, flipDay) => {
    const dump = `/tmp/era-reh-${process.pid}-${seed}-${flipDay}.json`;
    const env = { ...process.env, LAB_SEED: String(seed), LAB_DUMP: dump };
    if (flipDay > 0) { env.ERA_FLIP_DAY = String(flipDay); env.ERA_FLIP_TO = TARGET; }
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'econ-lab-real.js'), String(DAYS)],
        { env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 3600000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { return null; }
    let d = null; try { d = JSON.parse(fs.readFileSync(dump, 'utf8')); } catch (e) {}
    try { fs.unlinkSync(dump); } catch (e) {}
    if (!d) return null;
    const agg = { pop: 0, dead: 0, iron: 0, copper: 0, tin: 0, ore: 0, weapon: 0, armor: 0, smith: 0, miner: 0, cast: 0 };
    for (const v of d.villages) {
      agg.pop += v.pop; if (v.pop <= 0) agg.dead++;
      for (const k of ['iron', 'copper', 'tin', 'ore', 'weapon', 'armor']) agg[k] += v.storage[k] || 0;
      agg.smith += (v.jobs || {}).smith || 0; agg.miner += (v.jobs || {}).miner || 0;
      if (v.alloyGrade != null) agg.cast++;
    }
    agg.n = d.villages.length;
    return agg;
  };
  const rows = [];
  for (const s of SEEDS) {
    process.stdout.write(`   시드 ${s} — 안 연 세계 …`);
    const a = run(s, 0);
    process.stdout.write(a ? ' 완료' : ' 실패');
    process.stdout.write(` / 연 세계 …`);
    const b = run(s, FLIP);
    say(b ? ' 완료' : ' 실패');
    if (a && b) rows.push({ s, a, b });
  }
  ok(rows.length === SEEDS.length, `${rows.length}/${SEEDS.length} 시드 완주`);
  if (rows.length) {
    const mean = (k, side) => rows.reduce((x, r) => x + r[side][k], 0) / rows.length;
    const F = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1));
    say('\n   항목        안 연 세계 →   연 세계     변화');
    for (const k of ['pop', 'dead', 'cast', 'smith', 'miner', 'iron', 'copper', 'tin', 'ore', 'weapon', 'armor']) {
      const A = mean(k, 'a'), B = mean(k, 'b');
      const pct = A > 0 ? ((B - A) / A * 100) : (B > 0 ? Infinity : 0);
      say(`   ${k.padEnd(10)} ${F(A).padStart(10)} → ${F(B).padStart(9)}   ${isFinite(pct) ? (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%' : (B > 0 ? '신규' : '—')}`);
    }
    // ★재민의 기준: "언제 여는지에 따라 흥망성쇠가 크게 갈리면 안 돼"
    const dPop = (mean('pop', 'b') - mean('pop', 'a')) / Math.max(1, mean('pop', 'a'));
    const dDead = mean('dead', 'b') - mean('dead', 'a');
    say('');
    ok(Math.abs(dPop) < 0.25, `★인구 급변 없음 — 플립 전후 ${(dPop * 100).toFixed(1)}% (기준 ±25%)`);
    ok(dDead <= 1.0, `★소멸 급증 없음 — ${dDead >= 0 ? '+' : ''}${dDead.toFixed(1)}곳 (기준 +1.0)`);
    say(`   ⇒ 시대를 열면 철 재고 ${F(mean('iron', 'a'))} → ${F(mean('iron', 'b'))} · 주조 마을 ${F(mean('cast', 'a'))} → ${F(mean('cast', 'b'))}`);
  }
}

say(`\n=== 리허설: ${fail ? '실패 ' + fail + '건 ❌' : '전부 통과 ✅'} ===`);
if (!fail) say(`   실제로 열려면: server/era.js 의 SCHEDULE 에 { at: '<ISO시각>', era: '${TARGET}' } 한 줄. (배포는 재민만)`);
process.exit(fail ? 1 : 0);
