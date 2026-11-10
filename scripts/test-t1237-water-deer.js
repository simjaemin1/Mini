#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1237-water-deer.js — 고라니 = 새 종(T1237 · ★재민 11-09 "새 종" · 손잡이 `T1237_WATER_DEER` 끔 기본) ===
//
// ★왜 [보고/T1210 회부 1 · ★재민 11-09] 고라니 시트를 사슴 칸 미리보기로 세웠던 것을 **제 종**으로 — 사슴(꽃사슴 쪽) 자리는 그대로 두고
//   고라니가 물가에 따로 선다. 블록(B · 마을실험실 원본)은 한 글자도 안 고치고 **같은 함수를 둘째 상태로** 부른다(wildlife.js [C] T1237).
//   이 하네스는 그 길이 **말한 대로** 서는지 · 끄면 **옛 세계 그대로**인지 · 켜도 **사슴 쪽이 한 치도 안 바뀌는지**를 잰다.
//
//  ① 표 — 카탈로그 한 줄(서버 = 클라 · 야생 블록만 낳는 종: `spawn_biome` 비움 → 존 첫 스폰 · DB 몹 목록에 없다) · 존 칸 줄(T607 그대로 · 열도 없음) ·
//     드롭 kg 줄(한국아종 16~21 · 사슴 수율 → 고기 7 · 가죽 1)
//  ② 끔 — 고라니 갈래가 한 번도 안 돈다(셈 0 · 랩 종 키 없음 · 그림자 0 · 존 칸 `ps` · welcome 칸 0) · 부르는 자리마다 손잡이 뒤(글자)
//  ③ 켬(가짜 땅 · 정본 tick · 존과 같은 꼴의 틱마다 씨 뿌리는 흐름) — 고라니가 **물가 서식 칸에서만** 난다 · 마릿수 = 블록 식 그대로
//     (서식 칸 풍부도 ÷ K × 밀도 · 뷰에 서식 있으면 5 이상) · 맹수는 둘째 상태에 안 선다(지킴이 둘) · 몸짓 칸 0/1/2
//  ④ ★★켬이어도 첫 판(사슴 · 멧돼지 · 토끼 · 맹수 · 그림자)이 **끔과 바이트 같다** — 둘째 상태는 틱의 끝에서 돌고 흐름은 틱마다 다시 뿌린다
//     (카드 ⑥ "사슴과 같은 칸에서 서로 밀어내지 않나" — 마릿수 · 자리 · 상태 · 그림자 다 같다 · 자명 통과 금지: 고라니는 실제로 섰다)
//  ⑤ 행동 — 사람이 다가오면 경계(44m) · 도주(36m) · 짧게 뛰고 선다 · 엎드림(숨을 곳에서 경계) · 열도(T622 켬)엔 안 난다 · 사람이 잡으면 랩도 죽는다
// 실행: node scripts/test-t1237-water-deer.js   (자식 넷 · 가짜 땅 · 라이브 무접촉 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 자식 — 가짜 땅 위 정본 tick(최소 호스트 · test-zone-fauna ④ 꼴) ══════════════════════════════
if (process.env.T1237_SUB) {
  process.env.ENABLE_WILDLIFE = '1';
  // ★가상 벽시계 — 훑기 두 고리(첫 판 `_stepScans` · 고라니 `_t1237StepScans`)는 벽시계 4ms 로 줄을 끊는다. 부를 때마다 0.01ms 씩만 가는 시계를 쥐여
  //   판마다 끝내는 줄 수를 결정론으로(400줄 = 4ms) — 같은 판을 두 번 돌리면 바이트 같다(끔 · 켬 견줌 · 놀래기 판이 늘 같은 고라니를 고른다).
  let _vnow = 1e12; Date.now = () => (_vnow += 0.01);
  const _log = console.log; const logs = []; console.log = (...a) => logs.push(a.join(' '));
  const SEED = require(SV('seed-rand.js'));
  const W = require(SV('wildlife.js'));
  const N = 96, CH = 512, CC = CH / 32, ZONE = process.env.T1237_SUB_ZONE || 'hanbando';
  const RIV = [60, 63];                                           // 강(물) 칸 x 60 ~ 63 · 숲 x < 40
  const water = (cx) => cx >= RIV[0] && cx <= RIV[1];
  const keys = new Set(); for (let cy = 0; cy < N / CC; cy++) for (let cx = 0; cx < N / CC; cx++) keys.add(cx + '_' + cy);
  const mobs = new Map(), players = new Map(), corpses = [];
  const ag = JSON.parse(process.env.T1237_SUB_AGENTS || '[]');    // [[x 셀, y 셀], …] — 사람(위협원)
  ag.forEach(([x, y], i) => players.set('p' + i, { pid: 'p' + i, x: x * 32, y: y * 32, hp: 100, vx: 0, vy: 0 }));
  const st = SEED.makeStream(), ZSH = SEED.pidHash(ZONE);
  W.init({ ZONE_ID: ZONE, TICK_HZ: 30, ZONE: { zoneWidth: 32 * N, zoneHeight: 32 * N }, rng: st.next,
    WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 },
    isTerrainBlockedLocal: (x, y) => water(Math.floor(x / 32)), isRockTileLocal: () => false,
    terrainMod: { getForestMultiplier: (z, x) => (Math.floor(x / 32) < 40 ? 2.5 : 1) },
    // 정본 `chunk._wildClass` 와 같은 꼴(물 · 바위 → null · 220px 네 방향에 물 → 물가 · 숲 · 들) — 가짜 땅의 판정(하네스 몫)
    wildClass: (x, y) => { const cx = Math.floor(x / 32); if (water(cx)) return null; if (water(Math.floor((x - 220) / 32)) || water(Math.floor((x + 220) / 32))) return 'riverside'; return cx < 40 ? 'forest' : 'plain'; },
    chunkManager: { chunkSize: CH, removeMob: () => {}, insertMob: () => {}, updateMobChunk: () => {} },
    players, mobs, getActiveChunkKeys: () => keys, isPositionActive: () => true,
    spawnCorpse: (m) => corpses.push(m.type), damagePlayer: () => {}, broadcast: () => {}, setMobHp: require('./lib-hp-door').makeSetMobHp(),
    simVillages: () => [], legacyVillages: [], warThreats: () => [], gameRichAt: () => undefined, gameRichSize: () => 0 });
  const S = W._debug.S, SWs = W._debug.SW;
  const T = +(process.env.T1237_SUB_TICKS || 1800), marks = [], wdSeen = [], wdCells = new Set();
  const fp = () => {   // 첫 판 지문 — 랩 몹(종 · 자리 · 상태 · hp · 무리) + 그 그림자(고라니 빼고 — 그림자 번호는 세는 수라 뺀다)
    const lab = S.mobs.map((m) => [m.type, m.px.toFixed(6), m.py.toFixed(6), m.st, m.hp, m.gid].join(','));
    const sh = [...mobs.values()].filter((m) => m.type !== 'water_deer').map((m) => [m.type, m.x.toFixed(4), m.y.toFixed(4), m.hp, m.vx.toFixed(3)].join(','));
    return require('crypto').createHash('sha1').update(lab.join('|') + '#' + sh.join('|')).digest('hex').slice(0, 16);
  };
  let t = 60000, ps = { 0: 0, 1: 0, 2: 0 }, predSW = 0, vMax = 0, vBusy = 0;
  for (let i = 0; i < T; i++) {
    st.seed(SEED.seedOf(ZSH, 0, 0, 0, i));                       // 존 틱 흐름 영점(zone.js `_diceTick.seed` 꼴 — 틱마다)
    t += 1000 / 30; const v0 = _vnow; W.tick(t); const dv = _vnow - v0;   // 이 틱이 쓴 가상 벽시계(ms) — 훑기 주머니(4ms)를 넘나
    if (dv > vMax) vMax = dv; if (dv >= 3.9) vBusy++;
    for (const m of mobs.values()) if (m.type === 'water_deer') { ps[m._ps | 0] = (ps[m._ps | 0] || 0) + 1; }
    for (const lm of SWs.mobs) { if (lm.type !== '고라니') { if (!lm._t1237Sentinel) predSW++; continue; } if (!lm._born) { lm._born = 1; wdSeen.push([lm.px, lm.py]); } }
    if (i % 300 === 299) marks.push(fp());
  }
  for (const [x] of wdSeen) wdCells.add(Math.floor(x));
  const wdSh = [...mobs.values()].filter((m) => m.type === 'water_deer');
  const out = { zone: ZONE, knob: process.env.T1237_WATER_DEER || null, marks, stats: W._debug.t1237, vMax: +vMax.toFixed(2), vBusy,
    S: S.mobs.length, sw: SWs.mobs.filter((m) => m.type === '고라니').length, swAll: SWs.mobs.length, predSW,
    wdBorn: wdSeen.length, wdX: wdSeen.map(([x]) => +x.toFixed(2)), wdSh: wdSh.length, wdHp: wdSh.map((m) => m.maxHp), wdWild: wdSh.every((m) => m.isWild),
    ps, types: [...mobs.values()].reduce((o, m) => (o[m.type] = (o[m.type] || 0) + 1, o), {}),
    cov: W._debug.wdCov ? [...W._debug.wdCov].reduce((a, v) => a + v, 0) : null,
    sts: SWs.mobs.filter((m) => m.type === '고라니').map((m) => m.st), logSpawn: logs.filter((l) => / spawn 고라니/.test(l)).length };
  // ⑤ 놀래기 — 살아 있는 고라니 하나 곁(25m · 도주 반경 36 × 성질 0.72 ~ 1.28 안)에 사람 하나를 세우고 20초: 상태 차례 · 뛴 거리 · 멈춘 자리
  if (process.env.T1237_SUB_SCARE === '1') {
    const lm = SWs.mobs.find((m) => m.type === '고라니' && m.st !== 'dead' && m.st !== 'sleep' && m.px < 60 && m.py > 25 && m.py < 71);
    if (lm) {
      const p = players.get('p0');   // 강 쪽(동)에서 25m — 고라니는 서쪽 들 · 숲으로 튄다(물은 못 건넌다 · 회부)
      p.x = (lm.px + 25) * 32; p.y = lm.py * 32;
      const seq = [], x0 = lm.px, y0 = lm.py, bursts = []; let run = 0, px = lm.px, py = lm.py, fleeT = 0, maxV = 0, fT0 = -1;
      for (let i = 0; i < 600; i++) {
        st.seed(SEED.seedOf(ZSH, 0, 0, 0, T + 10 + i)); t += 1000 / 30; W.tick(t);
        if (seq[seq.length - 1] !== lm.st) seq.push(lm.st);
        const dd = Math.hypot(lm.px - px, lm.py - py);
        if (lm.st === 'flee') {
          if (!(lm.fT < fT0)) bursts.push({ s: 0, m: 0 });   // 한 판(블록 `fT` 15초 · 다시 차오르면 새 판)
          const b = bursts[bursts.length - 1]; b.s += 1 / 30; b.m += dd; fT0 = lm.fT;
          run += dd; fleeT++; maxV = Math.max(maxV, dd * 30);
        } else fT0 = -1;
        px = lm.px; py = lm.py;
      }
      out.scare = { tmp: +lm.tmp.toFixed(3), seq, runM: +run.toFixed(1), fleeS: +(fleeT / 30).toFixed(2), maxV: +maxV.toFixed(1),
        bursts: bursts.map((b) => [+b.s.toFixed(2), +b.m.toFixed(1)]),
        endFromMan: +Math.hypot(lm.px - p.x / 32, lm.py - p.y / 32).toFixed(1), endFromStart: +Math.hypot(lm.px - x0, lm.py - y0).toFixed(1), endSt: lm.st, endPs: lm._shadow ? (lm._shadow._ps | 0) : null };
    }
  }
  // ⑤ 사람이 잡는다 — 존의 문(`onMobHit`)으로 hp 0 → 랩 몸도 죽는다 · 사체는 존 길이 짓는다(랩은 안 짓는다)
  if (process.env.T1237_SUB_KILL === '1' && wdSh.length) {
    const sh = wdSh[0], lm = sh._wildRef; sh.hp = 0; W.onMobHit(sh, 20, null);
    st.seed(SEED.seedOf(ZSH, 0, 0, 0, T)); t += 1000 / 30; const c0 = corpses.length; W.tick(t);
    out.kill = { labDead: lm.st === 'dead', corpsed: lm._corpsed === 1, corpseByLab: corpses.length - c0 };
  }
  console.log = _log;
  console.log(JSON.stringify(out));
  process.exit(0);
}

// ══ 본 실행 ═══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const sub = (env) => {
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1237_WATER_DEER: '0' }, env), encoding: 'utf8', timeout: 300000 });
  const line = (r.stdout || '').trim().split('\n').pop();
  try { return JSON.parse(line); } catch (e) { return { err: (r.stderr || '').slice(-400) || line }; }
};
delete process.env.T1237_WATER_DEER;
const A = require(SV('animals.js'));
const PA = require(path.join(ROOT, 'public', 'animals.js'));
const ZSRC = fs.readFileSync(SV('zone.js'), 'utf8');
const WSRC = fs.readFileSync(SV('wildlife.js'), 'utf8');
const NSRC = fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8');

say('\n=== 고라니 = 새 종 (T1237 · 손잡이 T1237_WATER_DEER 켬 기본 · =0 끔) ===');

say('\n⓪ T1255 기본 켬 · 명시 끔 · 부팅 고정');
{
 const code="const A=require('./server/animals');const first=A.waterDeerOn();process.env.T1237_WATER_DEER=first?'0':'1';console.log(JSON.stringify([first,A.waterDeerOn()]));";
 for(const [label,value,want]of [['unset',null,true],['empty','',true],['on','1',true],['off','0',false]]){
  const env={...process.env};if(value==null)delete env.T1237_WATER_DEER;else env.T1237_WATER_DEER=value;
  const r=spawnSync(process.execPath,['-e',code],{cwd:ROOT,env,encoding:'utf8'});
  ok(r.status===0&&r.stdout.trim()===JSON.stringify([want,want]),'⓪ '+label+' — 술어 한 번 읽기 · 런타임 env 변경 무효',r.stdout.trim());
 }
 const D=sub({T1237_SUB:'1',T1237_WATER_DEER:'',T1237_SUB_AGENTS:JSON.stringify([[80,30]])});
 const E=sub({T1237_SUB:'1',T1237_WATER_DEER:'1',T1237_SUB_AGENTS:JSON.stringify([[80,30]])});
 const clean=x=>{const y={...x};delete y.knob;return JSON.stringify(y);};
 ok(!D.err&&!E.err&&D.wdSh>0&&clean(D)===clean(E),'⓪ 기본 켬의 실제 생태·고라니 그림자 = 명시 켬');
}
say('\n① 표 — 카탈로그 · 존 칸 · 드롭 kg');
{
  const w = A.ANIMALS.water_deer;
  ok(!!w && w.ko === '고라니' && w.hp === 20 && w.size === 'small' && !w.aggressive && !w.breeding, '① 카탈로그 한 줄 — 이름 고라니 · hp 20(랩 2 × 10) · small · 순함', w ? JSON.stringify({ hp: w.hp, size: w.size, pack: w.pack }) : '없음');
  ok(JSON.stringify(A.ANIMALS) === JSON.stringify(PA.ANIMALS), '① 서버 = 클라 카탈로그(글자째 같은 표)');
  const small = Object.values(A.ANIMALS).filter((a) => a.size === 'small' && a !== w).map((a) => a.hp);
  ok(small.length === 4 && Math.abs(small.reduce((x, y) => x + y, 0) / small.length - 21.5) < 1e-9 && Math.round(21.5 / 10) * 10 === w.hp,
    '① hp = 같은 몸 칸(small) 넷의 가운데 21.5 → 랩 hp 2(× 10)', small.join(' · '));
  ok(w.spawn_biome.length === 0 && w.spawn_density === 0, '① 야생 블록만 낳는다 — spawn_biome 비움 · 밀도 0');
  const ZC = require(SV('zone-config.js'));
  let inList = 0; for (const z of Object.keys(ZC.ZONES)) for (const b of new Set(Object.values(ZC.ZONES).map((q) => q.biome))) if (A.huntableInBiome(b, z).includes('water_deer') || A.huntableInBiome(b).includes('water_deer')) inList++;
  ok(inList === 0, '★① 존 첫 스폰 · DB 몹 목록(huntableInBiome)엔 어느 biome × 존에도 없다 — 손잡이 끔이면 세계에 0마리');
  const r = A.ZONE_FAUNA.find((x) => x.id === 'water_deer');
  ok(r && r.hb === '있음' && r.np === '없음' && A.faunaCell('water_deer', 'nippon') === '없음', '① 존 칸 — 한반도 있음 · 열도 없음(T607 줄 그대로)', r ? `${r.hb}/${r.np}` : '없음');
  const d = A.dropKgRow('water_deer', 'hanbando');
  ok(d && d.liveKg === 18.5 && Math.abs(d.yld - 0.3744) < 1e-12 && d.units === 7 && A.dropsOf('water_deer', 'hanbando').leather === 1,
    '★① 드롭 — 한국아종 16~21 가운데 18.5kg × 사슴 수율 37.44% = 6.93kg → 고기 7 · 가죽 1', d ? `${d.meatKg.toFixed(2)}kg` : '없음');
}

say('\n② 끔 — 고라니 갈래가 한 번도 안 돈다');
const OFF = sub({ T1237_SUB: '1', T1237_SUB_AGENTS: JSON.stringify([[80, 30]]) });
{
  pre(!OFF.err && OFF.S > 0, '끔 판이 돌았다(첫 판 짐승이 섰다)', OFF.err || `랩 ${OFF.S} · ${JSON.stringify(OFF.types)}`);
  ok(OFF.stats && OFF.stats.runs === 0 && OFF.stats.scanned === 0 && OFF.sw === 0 && OFF.wdSh === 0 && OFF.cov === null && OFF.logSpawn === 0,
    '★★② 끔 — 둘째 상태 판 0 · 훑기 0 · 고라니 0(랩 · 그림자) · 숨을 곳 격자 안 지음 · 스폰 줄 0', JSON.stringify(OFF.stats));
  const gates = [
    [/if \(T1237 && _t1237StepScans\(keys, _tS\)\) _t1237Habitat\(keys\);/, '훑기'], [/if \(T1237\) _t1237Habitat\(keys\);/, '재합성'],
    [/if \(T1237\) \{ MOB_DEF\[WD\] = WD_DEF; MAIN_TYPE\[WD\] = 'water_deer'; \}/, '랩 종 키'],
    [/if \(T1237\) \{ _wdCov = new Uint8Array/, '격자'], [/if \(T1237\) _t1237Tick\(\);/, '틱'], [/if \(T1237\) for \(const lm of SW\.mobs\)/, '동기'],
  ];
  const miss = gates.filter(([re]) => !re.test(WSRC)).map(([, n]) => n);
  ok(miss.length === 0 && /const T1237 = Animals\.waterDeerOn\(\);/.test(WSRC), "② 부르는 자리 여섯이 다 손잡이 뒤 · 공통 술어(부팅 때 읽는다)", miss.join(' · ') || '여섯');
  ok(/const _tS = T1237 \? Date\.now\(\) : 0;[^\n]*\n  if \(_stepScans\(\)\) _rebuildHabitat\(keys\);/.test(WSRC) && /function _t1237StepScans\(keys, t0\) \{\n  const cc = /.test(WSRC),
    '② 훑기 주머니 — 시작 시각은 첫 판 훑기 바로 앞에서 켬만 한 번 읽고(끔 = 시각 읽기 그대로) · 고라니 고리는 그 시각부터 같은 4ms(제 시계를 새로 안 연다)');
  const sc = WSRC.slice(WSRC.indexOf('function _stepScans()'), WSRC.indexOf('function _rebuildHabitat('));
  ok(sc.length > 0 && !/T1237|_wd|wildClass/.test(sc), '★② 첫 판 훑기(`_stepScans` — 벽시계 4ms 로 줄을 끊는 고리)엔 고라니 일이 없다 — 판마다 끝내는 줄 수 · 사슴 서식이 서는 판이 끔과 같다');
  const ib = WSRC.indexOf('function updateMobs('), ie = WSRC.indexOf('// ═══ [C] 본체 브리지');
  ok(ib > 0 && ie > ib && !/T1237|고라니|_wd|SW\b/.test(WSRC.slice(ib, ie)), '★② 블록(B)은 무수정 — 이 카드의 글자가 블록 안에 없다');
  ok(/if \(o\._ps\) e\.ps = o\._ps;/.test(ZSRC) && /\.\.\.\(waterDeerOn\(\) \? \{ waterDeer: true \} : \{\}\)/.test(ZSRC),
    '② 존 — 몹 칸 `ps` 는 그림자에 몸짓이 선 때만(끔 = 서는 몹 0) · welcome `waterDeer` 는 켬에서만(끔 = 칸 없음)');
  ok(/if \(m\.ps\) c\.mobs\.get\(m\.mid\)\.ps = m\.ps;/.test(NSRC), '② 클라 — 받은 몹 칸에 `ps` 가 있을 때만 싣는다(끔 = 몹 객체 그대로)');
}

say('\n③ 켬 — 물가에서만 · 블록 식 마릿수 · 맹수 0 · 몸짓');
const ON = sub({ T1237_SUB: '1', T1237_WATER_DEER: '1', T1237_SUB_AGENTS: JSON.stringify([[80, 30]]), T1237_SUB_KILL: '1' });
{
  pre(!ON.err && ON.wdBorn > 0, '켬 판에서 고라니가 섰다(이게 0 이면 아래가 자명 통과)', ON.err || `태어남 ${ON.wdBorn} · 지금 ${ON.sw}`);
  // 가짜 땅의 물가 = 정본 술어 꼴(220px 네 방향 탐침) — 칸 가운데에서 ±7칸이 강(60 ~ 63)에 드는 칸: x 53 ~ 56 · 67 ~ 70(강에 붙은 칸은 탐침이 건너편 땅에 떨어진다 — 보고 §6)
  const rivN = [...Array(96).keys()].filter((x) => (x - 7 >= 60 && x - 7 <= 63) || (x + 7 >= 60 && x + 7 <= 63)).length * 96;
  const offBand = ON.wdX.filter((x) => !((x >= 53 - 4 && x < 57 + 4) || (x >= 67 - 4 && x < 71 + 4)));
  ok(offBand.length === 0 && ON.wdX.every((x) => x > 40), '★★③ 고라니는 물가 서식 칸(± 블록 무리 스폰 반경 4m)에서만 난다 — 숲(x < 40)에 0', `태어난 자리 x ${Math.min(...ON.wdX)} ~ ${Math.max(...ON.wdX)} · 밖 ${offBand.length}`);
  ok(ON.stats.habitat === rivN && ON.stats.riverside === rivN && rivN === 768, '③ 서식 칸 = 물가 칸(마을 0 — 완충 없음) 8열 × 96', `${ON.stats.habitat}`);
  const target = Math.min(50, Math.max(5, Math.round(ON.stats.habitat * 60 / 100 * 0.02)));
  ok(ON.stats.maxN <= target + 4 && ON.stats.lastN >= Math.min(target, 5), '★③ 마릿수 = 블록 식 그대로(서식 칸 × 풍부도 60 ÷ K 100 × 밀도 0.02 · 뷰에 서식 있으면 5 이상 · 넘침 + 4 까지)',
    `식 ${target} · 지금 ${ON.stats.lastN} · 최대 ${ON.stats.maxN}`);
  ok(ON.predSW === 0 && ON.swAll - ON.sw === 2, '★③ 둘째 상태엔 맹수가 안 선다(지킴이 둘 — 늑대 · 호랑이 출현 문이 닫힌다)', `맹수 ${ON.predSW} · 지킴이 ${ON.swAll - ON.sw}`);
  ok(ON.wdSh > 0 && ON.wdWild && ON.wdHp.every((h) => h === 20), '③ 그림자 — 종 water_deer · 야생 그림자 · 최대 hp 20(랩 2 × 10)', `${ON.wdSh}마리`);
  ok(Object.keys(ON.ps).every((k) => ['0', '1', '2'].includes(k)) && (ON.ps[1] || 0) + (ON.ps[2] || 0) > 0, '③ 몸짓 칸 — 0 · 1 엎드림 · 2 풀 뜯기만 · 판 동안 엎드림이나 뜯기가 섰다', JSON.stringify(ON.ps));
  ok(ON.kill && ON.kill.labDead && ON.kill.corpsed && ON.kill.corpseByLab === 0, '③ 사람이 잡으면(존 문 `onMobHit`) 랩 몸도 죽는다 · 사체는 존 길이 짓는다(랩이 두 번 안 짓는다)', JSON.stringify(ON.kill || null));
}

say('\n④ ★★켬이어도 첫 판(사슴 · 멧돼지 · 토끼 · 맹수)은 끔과 바이트 같다');
{
  pre(OFF.marks && ON.marks && OFF.marks.length === 6, '두 판 다 지문 여섯(10초마다)', `${OFF.marks && OFF.marks.length} · ${ON.marks && ON.marks.length}`);
  ok(JSON.stringify(OFF.marks) === JSON.stringify(ON.marks), '★★④ 첫 판 지문(랩 몹 종 · 자리 · 상태 · hp · 무리 + 그림자) 여섯이 다 같다 — 고라니가 사슴 몫을 안 먹고 · 안 지우고 · 굴림도 안 비튼다',
    `${OFF.marks && OFF.marks[5]} · ${ON.marks && ON.marks[5]}`);
  const A2 = sub({ T1237_SUB: '1', T1237_SUB_AGENTS: JSON.stringify([[20, 30]]) });
  ok(A2.marks && JSON.stringify(A2.marks) !== JSON.stringify(OFF.marks), '④ (자명 통과 금지) 사람 자리만 옮기면 지문이 갈린다 — 지문이 세계를 실제로 잰다');
  // ★[실존 판 뒤] 훑기 한 주머니 — 고라니 훑기가 따로 4ms 를 쓰면 훑는 틱이 4 → 8ms(보고 §6). 가상 벽시계(부를 때마다 0.01ms)로 틱마다 쓴 시간:
  //   켬의 가장 긴 틱 ≤ 끔의 가장 긴 틱 + 0.5ms(그림자 몇 마리의 시각 읽기 몫) · 켬은 훑는 틱이 더 길게 이어진다(고라니 몫이 첫 판 뒤에 붙는다)
  ok(OFF.vMax >= 3.9 && ON.vMax <= OFF.vMax + 0.5 && ON.vBusy > OFF.vBusy,
    '★④ 훑기 주머니 하나 — 켬의 가장 긴 틱이 끔과 같은 4ms 띠(둘이 따로면 8ms) · 고라니 훑기는 첫 판 뒤 남은 틱에 이어 돈다', `끔 ${OFF.vMax}ms · ${OFF.vBusy}틱 · 켬 ${ON.vMax}ms · ${ON.vBusy}틱`);
}

say('\n⑤ 행동 · 존 칸');
{
  const SC = sub({ T1237_SUB: '1', T1237_WATER_DEER: '1', T1237_SUB_AGENTS: JSON.stringify([[90, 10]]), T1237_SUB_TICKS: '900', T1237_SUB_SCARE: '1' });
  const sc = SC.scare;
  pre(!SC.err && !!sc, '놀래기 판 — 고라니 하나 곁 25m 에 사람', SC.err || JSON.stringify(sc));
  ok(sc && sc.seq.includes('flee') && sc.runM > 0, '★⑤ 25m(도주 반경 36 × 성질 안)에 사람이 서면 튄다', sc ? `${sc.seq.join(' → ')} · 성질 ${sc.tmp}` : '');
  const v1 = sc && sc.bursts.length ? sc.bursts[0][1] / sc.bursts[0][0] : 0;
  ok(sc && v1 > 5.4 * 1.4 * 0.9 && v1 <= 5.4 * 2.6 * 1.02, '⑤ 첫 판 평균 도주 빠르기 = 속보 7.6 ~ 질주 5.4 × 2.6 = 14.0 m/s 사이(가속 포함)', sc ? `평균 ${v1.toFixed(1)} m/s · 틱 최고 ${sc.maxV} m/s(블록 분리 밀기가 한 틱에 두 번 옮긴 값 — 사슴과 같은 줄)` : '');
  ok(sc && sc.bursts.length > 0 && sc.bursts.every(([sec]) => sec <= 15 + 1 / 30 + 1e-9) && sc.seq[sc.seq.length - 1] !== 'flee',
    '⑤ 한 판은 15초 안(블록 도주 한 판) · 사람이 도주 반경 두 배 안이면 새 판 · 결국 선다', sc ? `판 ${sc.bursts.map(([a, b]) => a + '초 ' + b + 'm').join(' · ')} · 모두 ${sc.runM} m · 사람에서 ${sc.endFromMan} m` : '');
  const NP = sub({ T1237_SUB: '1', T1237_WATER_DEER: '1', T622_ZONE_FAUNA: '1', T1237_SUB_ZONE: 'nippon', T1237_SUB_AGENTS: JSON.stringify([[80, 30]]), T1237_SUB_TICKS: '600' });
  ok(!NP.err && NP.wdBorn === 0 && NP.sw === 0 && NP.wdSh === 0, '★⑤ 열도(존 칸 손잡이 켬) — 고라니 0(낳지도 않는다 · 낳고 거두는 되풀이 0)', NP.err || JSON.stringify(NP.stats));
  const HB = sub({ T1237_SUB: '1', T1237_WATER_DEER: '1', T622_ZONE_FAUNA: '1', T1237_SUB_AGENTS: JSON.stringify([[80, 30]]), T1237_SUB_TICKS: '600' });
  ok(!HB.err && HB.wdBorn > 0, '⑤ (대조) 한반도는 존 칸을 켜도 선다(고라니 있음)', `${HB.wdBorn}`);
}

say('\n⑥ 그림 문 · 매니페스트 — 짐승 시트가 T1123 문 · T1131 표를 지난다(T1210 회부 7)');
{
  const G = require(SV('gimg-map.js'));
  const m = G.build().map;
  const PUBA = path.join(ROOT, 'public', 'assets', 'animals');
  const sheets = fs.readdirSync(path.join(PUBA, 'water_deer')).filter((f) => /^body_.*\.png$/.test(f)).sort();
  const bad = sheets.filter((f) => !new RegExp('^/assets/animals/water_deer/' + f.replace('.png', '') + '\\.webp\\?v=[0-9a-f]{10}$').test(m['/assets/animals/water_deer/' + f] || ''));
  ok(G.GROUPS.includes('animals') && sheets.length === 6 && bad.length === 0, '★⑥ 무리에 animals — 고라니 시트 여섯이 다 webp 쌍둥이 주소 + 내용 해시로 나간다', bad.join(' ') || sheets.join(' '));
  ok(/\?v=[0-9a-f]{10}$/.test(m['/assets/animals/index.json'] || '') && /\?v=[0-9a-f]{10}$/.test(m['/assets/animals/water_deer/water_deer_meta.json'] || ''), '⑥ 목록 · 메타 json 도 해시 주소');
  const others = G.GROUPS.filter((g) => g !== 'animals').filter((g) => fs.existsSync(path.join(ROOT, 'public', 'assets', g)) && fs.readdirSync(path.join(ROOT, 'public', 'assets', g)).some((f) => fs.statSync(path.join(ROOT, 'public', 'assets', g, f)).isDirectory()));
  const deep = Object.keys(m).filter((u) => !u.startsWith('/assets/animals/') && u.split('/').length > 4);
  ok(others.length === 0 && deep.length === 0, '⑥ 한 겹 더 훑기는 짐승 무리만 바꾼다 — 다른 무리엔 폴더가 없다(표 칸 · 차례 그대로)', others.join(' ') || '폴더 0');
  const S40 = fs.readFileSync(path.join(ROOT, 'public', 'client', '40-r2-sprites.js'), 'utf8');
  ok(/_gfetch\('\/assets\/animals\/index\.json'\)/.test(S40) && /_gfetch\('\/assets\/animals\/' \+ rel\)/.test(S40) && /_gsrc\(im, '\/assets\/animals\/' \+ dir \+ sk \+ '\.png'\)/.test(S40) && !/(?<![\w])fetch\('\/assets\/animals/.test(S40) && !/im\.src = '\/assets\/animals/.test(S40),
    '★⑥ 클라 — 목록 · 메타 · 시트 셋 다 문(`_gfetch` · `_gsrc`)을 지난다 · 문 밖 길 0');
}

say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
