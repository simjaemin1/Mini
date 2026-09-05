#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-regrow.js — 나무는 다시 난다 (T122) ==========================
//
// ★[재민 확정 2026-09-05] *"당연히 나무도 리젠되어야 한다."*
//   종전엔 캔 시드 자원이 `harvested_seeds` 에 박혀 **그 세계에서 영원히** 없었다.
//   이 하네스가 재는 것: 벤 자리가 **그루터기 → 묘목 → 성목**으로 돌아오는가 ·
//   두 번 정산해도 같은가(멱등) · 재부팅 뒤에도 같은가 · 옛 행이 승격되는가 ·
//   되돌림이 옛 세계를 정확히 재현하는가 · 그리고 **이 검사가 ✗ 를 낼 수 있는가**.
//
// ★★제1 규약(족보 ㊻): 재생은 **시간의 함수**라 하네스가 시계를 밀 수 있다.
//   ⇒ 여기서는 게임일을 **인자로 넘겨** 잰다(타이머를 기다리지 않는다 · 벽시계 0).
//     그러면 800일 뒤도 8,000일 뒤도 같은 1초 안에 잰다.
//
// 실행: node scripts/test-regrow.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
// ★주석을 빼고 본다 — 소스 계약은 **코드**를 물어야 한다(주석은 설명할 자유가 있다).
const codeOnly = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const C = require(path.join(ROOT, 'server', 'chunk.js'));
const E = require(path.join(ROOT, 'server', 'events.js'));
const Y = E.yearDaysOf();

(async () => {
  say('=== 나무는 다시 난다 — 재생 (T122) ===\n');

  // ═══ ① 단계 — 그루터기 → 묘목 → 성목 ═══════════════════════════════════════
  say('① 단계 셋 — 벤 뒤 경과 게임일의 함수');
  {
    pre(Y > 0, '한 해의 길이를 **econ 정본에서 유도했다**(365 를 하네스가 적지 않는다)', `${Y} 게임일`);
    const S = (d) => C.regrowStageOf('tree', d);
    const N = C.REGROW.TREE_STUMP_Y() * Y, M = C.REGROW.TREE_FULL_Y() * Y;
    ok(S(0) === 'stump' && S(N - 1) === 'stump', '★★① 벤 직후부터 N일까지는 **그루터기**다',
      `0 → ${S(0)} · ${Math.round(N - 1)} → ${S(N - 1)}`);
    ok(S(N) === 'sapling' && S(M - 1) === 'sapling', '★★① N일에 **묘목**이 서고 M일 전까지 묘목이다',
      `${Math.round(N)} → ${S(N)} · ${Math.round(M - 1)} → ${S(M - 1)}`);
    ok(S(M) === 'mature', '★★① M일이면 **성목** — 안 벤 것과 같아진다', `${Math.round(M)} → ${S(M)}`);
    ok(S(-1) === null, '★① 벤 날을 모르면(−1) 판정을 안 한다 — 종전대로 빠진다', `${S(-1)}`);
    // ★단조 — 뒤로 가지 않는다(자라다 말고 그루터기로 돌아가면 그건 재생이 아니다)
    const order = { stump: 0, sapling: 1, mature: 2 };
    let mono = true, prev = -1;
    for (let d = 0; d <= M + Y; d += Math.max(1, Math.round(Y / 4))) { const v = order[S(d)]; if (v < prev) mono = false; prev = v; }
    ok(mono, '★★① 단계는 **뒤로 안 간다**(단조)', `${Math.round((M + Y) / Math.max(1, Math.round(Y / 4)))}점 검사`);
    // ★바위·광맥·운철은 무변
    for (const t of ['rock', 'ore', 'meteorite', 'water_pool']) {
      ok(C.regrowStageOf(t, 999999) === null, `★★① \`${t}\` 는 **재생하지 않는다**(종전 그대로)`);
    }
    ok(C.regrowStageOf('berry_bush', C.REGROW.BUSH_Y() * Y - 1) === 'gone'
      && C.regrowStageOf('berry_bush', C.REGROW.BUSH_Y() * Y) === 'mature',
      '★① 덤불은 **이듬해 다시 열린다**(단계 없이 한 번에)');
    ok(C.regrowStageOf('herb', C.REGROW.HERB_Y() * Y - 1) === 'gone'
      && C.regrowStageOf('herb', C.REGROW.HERB_Y() * Y) === 'mature',
      '★① 약초는 **한 철**이면 돌아온다');
  }

  // ═══ ② 멱등 — 두 번 정산해도 같다 · 주사위 0 ═══════════════════════════════
  say('\n② 멱등 · 주사위 0 — 볼 때 정산이라 몇 번을 봐도 같다');
  {
    let same = true;
    for (const d of [0, 100, 8030, 12345, 18980, 99999]) {
      const a = C.regrowStageOf('tree', d), b = C.regrowStageOf('tree', d), c = C.regrowStageOf('tree', d);
      if (!(a === b && b === c)) same = false;
    }
    ok(same, '★★② 같은 (벤 날 · 게임일)이면 **몇 번을 물어도 같은 답**이다(멱등)');
    const src = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8'));
    const fn = src.slice(src.indexOf('function regrowStageOf('), src.indexOf('\n}', src.indexOf('function regrowStageOf(')));
    ok(fn.length > 0, '② 전제 — 판정 함수 본문을 집었다', `${fn.split('\n').length}줄`);
    ok(!/Math\.random|Date\.now|setTimeout|setInterval/.test(fn),
      '★★② **주사위 0 · 타이머 0** — 재생은 시간의 함수다(난수·벽시계·틱 0줄)');
    ok(!/\b365\b/.test(fn), '★② 한 해의 길이를 **함수 안에 안 적었다**(econ 정본에서 유도 · 사본 0)');
  }

  // ═══ ③ 생성 — 벤 자리가 실제로 단계로 난다 ═════════════════════════════════
  say('\n③ `generateChunkResources` — 벤 자리가 **빠지는 대신 단계로** 난다');
  {
    const Terr = require(path.join(ROOT, 'server', 'terrain.js'));
    const hard = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando;
    const W = 70016, H = 130016;
    Terr.setZonesMeta({ hanbando: { zoneWidth: W, zoneHeight: H, biome: 'forest', isOcean: false } });
    Terr.setHardcoded('hanbando', hard);
    const CS = C.CHUNK_SIZE;
    // ★자리는 **찾는다**(족보 73) — 나무가 실제로 나는 청크를 세계에 물어서 고른다.
    let cx = -1, cy = -1, base = null;
    for (let k = 0; k < 4000 && cx < 0; k++) {
      const tx = 40 + (k % 60), ty = 40 + ((k / 60) | 0);
      const r = C.generateChunkResources('hanbando', 'forest', tx, ty, CS, new Map(), 0);
      const trees = r.filter((e) => e.type === 'tree');
      if (trees.length >= 20) { cx = tx; cy = ty; base = r; }
    }
    pre(cx >= 0, '나무가 **여럿 나는** 청크를 찾았다(빈 청크면 아래가 자명 통과다)',
      cx >= 0 ? `(${cx},${cy}) 자원 ${base.length}개 · 나무 ${base.filter((e) => e.type === 'tree').length}그루` : '못 찾음');
    if (cx >= 0) {
      const trees = base.filter((e) => e.type === 'tree');
      const victim = trees[0];
      const cut = new Map([[victim.seedKey, 0]]);
      const at = (day) => C.generateChunkResources('hanbando', 'forest', cx, cy, CS, cut, day);
      const find = (arr) => arr.find((e) => e.seedKey === victim.seedKey) || null;
      const N = C.REGROW.TREE_STUMP_Y() * Y, M = C.REGROW.TREE_FULL_Y() * Y;

      const d0 = find(at(1));
      ok(d0 && d0.type === 'stump', '★★③ 벤 이튿날 그 자리엔 **그루터기**가 있다(빠지지 않는다)', d0 ? d0.type : '없음');
      ok(d0 && d0.maxHp === 0, '★★③ 그루터기는 **캘 수 없다**(hp 0 — 서버가 물리로 막는다)', d0 ? `hp ${d0.hp}/${d0.maxHp}` : '—');
      ok(d0 && d0.h < victim.h && d0.x === victim.x && d0.y === victim.y,
        '★③ 그리고 **같은 자리**에 더 낮게 선다', d0 ? `h ${victim.h.toFixed(0)} → ${d0.h}` : '—');
      const d1 = find(at(N + 1));
      ok(d1 && d1.type === 'sapling' && d1.maxHp > 0, '★★③ N일 뒤엔 **묘목** — 캘 수 있다', d1 ? `${d1.type} hp ${d1.maxHp}` : '없음');
      ok(d1 && d1.h < victim.h && d1.h > (d0 ? d0.h : 0), '★③ 묘목은 그루터기보다 크고 성목보다 작다',
        d1 ? `${d0.h} < ${d1.h.toFixed(1)} < ${victim.h.toFixed(0)}` : '—');
      const d2 = find(at(M + 1));
      ok(d2 && d2.type === 'tree' && Math.abs(d2.h - victim.h) < 1e-9 && Math.abs(d2.r - victim.r) < 1e-9,
        '★★③ M일 뒤엔 **안 벤 것과 완전히 같은 나무**다(크기까지)', d2 ? `${d2.type} h ${d2.h.toFixed(1)}` : '없음');
      // ★자명 통과 금지 — 안 벤 판과 벤 판이 실제로 다른가
      ok(find(at(1)).type !== find(base).type, '★★③ 자명 통과 금지 — 벤 판과 안 벤 판이 **실제로 다르다**',
        `안 벰 ${find(base).type} vs 벤 뒤 ${find(at(1)).type}`);
      // ★다른 나무는 **한 그루도** 안 바뀐다
      const others = (arr) => arr.filter((e) => e.seedKey !== victim.seedKey).map((e) => `${e.seedKey}:${e.type}:${(e.h || 0).toFixed(3)}`).join('|');
      ok(others(at(1)) === others(base), '★★③ 벤 것 말고는 **한 그루도 안 바뀐다**(결정론 불변)',
        `${base.length - 1}개 대조`);
      // ★멱등 — 같은 날 두 번 부르면 같은 배열
      const s1 = JSON.stringify(at(N + 1)), s2 = JSON.stringify(at(N + 1));
      ok(s1 === s2, '★★③ 같은 날 두 번 정산 = **같은 세계**(멱등 · 재부팅과 같은 뜻)');
      // ★덤불·바위 — **다른 청크를 찾는다.** 위에서 고른 건 순수 숲 청크라 나무밖에 없었다
      //   (초안이 그래서 [상황] 둘을 빨갛게 냈다 — 세계가 아니라 내 표본이 좁았다 · 족보 ㊻).
      const findKind = (kind) => {
        for (let k = 0; k < 6000; k++) {
          const tx = 40 + (k % 80), ty = 40 + ((k / 80) | 0);
          const r = C.generateChunkResources('hanbando', 'forest', tx, ty, CS, new Map(), 0);
          const e = r.find((z) => z.type === kind);
          if (e) return { tx, ty, e };
        }
        return null;
      };
      const bs = findKind('berry_bush');
      pre(!!bs, '덤불이 나는 청크를 **찾았다**', bs ? `(${bs.tx},${bs.ty}) ${bs.e.seedKey}` : '없음');
      if (bs) {
        const cutB = new Map([[bs.e.seedKey, 0]]);
        const g = (d) => C.generateChunkResources('hanbando', 'forest', bs.tx, bs.ty, CS, cutB, d).find((z) => z.seedKey === bs.e.seedKey);
        ok(!g(C.REGROW.BUSH_Y() * Y - 1) && (g(C.REGROW.BUSH_Y() * Y) || {}).type === 'berry_bush',
          '★★③ 덤불은 이듬해 **그대로 돌아온다**(단계 없음)');
      }
      const rk = findKind('rock');
      pre(!!rk, '바위가 나는 청크를 **찾았다**', rk ? `(${rk.tx},${rk.ty}) ${rk.e.seedKey}` : '없음');
      if (rk) {
        const cutR = new Map([[rk.e.seedKey, 0]]);
        const r9 = C.generateChunkResources('hanbando', 'forest', rk.tx, rk.ty, CS, cutR, 999999).find((z) => z.seedKey === rk.e.seedKey);
        ok(!r9, '★★③ 바위는 **영원히 안 난다**(그게 맞다 — 종전 무변)');
      }
      // ★옛 계약 — `Set` 을 주면 종전 그대로 빠진다(구 하네스·옛 호출부가 산다)
      const asSet = new Set([victim.seedKey]);
      const withSet = C.generateChunkResources('hanbando', 'forest', cx, cy, CS, asSet, 99999).find((e) => e.seedKey === victim.seedKey);
      ok(!withSet, '★★③ `Set` 을 주면 **종전 그대로 빠진다**(옛 계약 보존 · 새 인자 없이 부르면 종전 세계)');
      const noDay = C.generateChunkResources('hanbando', 'forest', cx, cy, CS, cut).find((e) => e.seedKey === victim.seedKey);
      ok(!noDay, '★★③ 게임일을 안 주면 **종전 그대로 빠진다**(계약이 뒤에서 안 바뀐다)');

      // ═══ ④ 되돌림 + 돌연변이 — 자식 프로세스 + env ═══════════════════════
      say('\n④ 되돌림 · 돌연변이 (자식 프로세스 + env · 공통 §2⑨)');
      {
        const { execFileSync } = require('child_process');
        const probe = `/tmp/t122-probe-${process.pid}.js`, out = `/tmp/t122-probe-${process.pid}.json`;
        fs.writeFileSync(probe, [
          "const fs=require('fs'),path=require('path');",
          "const ROOT=" + JSON.stringify(ROOT) + ";",
          "const _l=console.log;console.log=()=>{};console.warn=()=>{};console.error=()=>{};",
          "const C=require(path.join(ROOT,'server','chunk.js'));",
          "const Terr=require(path.join(ROOT,'server','terrain.js'));",
          "const hard=JSON.parse(fs.readFileSync(path.join(ROOT,'server','hanbando-terrain.json'),'utf8')).hanbando;",
          "Terr.setZonesMeta({hanbando:{zoneWidth:70016,zoneHeight:130016,biome:'forest',isOcean:false}});",
          "Terr.setHardcoded('hanbando',hard);",
          "console.log=_l;",
          "const cut=new Map([[" + JSON.stringify(victim.seedKey) + ",0]]);",
          "const g=(d)=>{const a=C.generateChunkResources('hanbando','forest'," + cx + "," + cy + ",C.CHUNK_SIZE,cut,d);" +
            "const e=a.find(z=>z.seedKey===" + JSON.stringify(victim.seedKey) + ");return e?e.type:null;};",
          "fs.writeFileSync(process.argv[2],JSON.stringify({on:C.REGROW.ON(),stumpY:C.REGROW.TREE_STUMP_Y()," +
            "d1:g(1),dN:g(" + Math.round(N + 1) + "),dM:g(" + Math.round(M + 1) + ")}));",
        ].join('\n'));
        const run = (env) => { try { fs.unlinkSync(out); } catch (e) {}
          execFileSync(process.execPath, [probe, out], { env: Object.assign({}, process.env, env), encoding: 'utf8', stdio: 'ignore', timeout: 180000 });
          return JSON.parse(fs.readFileSync(out, 'utf8')); };
        const b = run({});
        ok(b.d1 === 'stump' && b.dN === 'sapling' && b.dM === 'tree',
          '★④ (전제) 자식이 부모와 **같은 답**을 낸다', `${b.d1} → ${b.dN} → ${b.dM}`);
        //   ★★되돌림 — `T122_REGROW=0` 은 **옛 세계**(영구 소실)를 정확히 재현한다
        const off = run({ T122_REGROW: '0' });
        ok(off.on === 0 && off.d1 === null && off.dN === null && off.dM === null,
          '★★④ **되돌림 `T122_REGROW=0` 이 옛 세계를 정확히 재현한다**(벤 자리는 영원히 빈다)',
          `on=${off.on} · ${off.d1} / ${off.dN} / ${off.dM}`);
        //   ★★돌연변이 — 그루터기 기간을 0 으로 하면 **즉시 묘목**이 된다 ⇒ ③의 첫 줄이 ✗ 를 낸다
        const mut = run({ T122_STUMP_Y: '0' });
        ok(mut.stumpY === 0 && mut.d1 !== 'stump',
          '★★④ 돌연변이 — 그루터기 기간을 0 으로 하면 **이튿날 이미 묘목**이다(③이 ✗ 를 낼 수 있다)',
          `stumpY=${mut.stumpY} · 이튿날 ${mut.d1}`);
        //   ★그리고 성목까지 0 으로 하면 **벤 적 없는 세계**가 된다 — 그것도 잡힌다
        const mut2 = run({ T122_STUMP_Y: '0', T122_TREE_Y: '0' });
        ok(mut2.d1 === 'tree', '★★④ 둘 다 0 이면 **이튿날 성목** — "벤 적 없는 세계"도 이 검사가 잡는다', `${mut2.d1}`);
        for (const f of [probe, out]) { try { fs.unlinkSync(f); } catch (e) {} }
      }
    }
  }

  // ═══ ⑤ 접점 — DB 열 · NPC 현장 · 동사 · 클라 ═══════════════════════════════
  say('\n⑤ 접점 — 벤 날은 DB 가 안다 · NPC 는 그루터기를 안 벤다 · 화면은 한 갈래');
  {
    const dbSrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone-local-db.js'), 'utf8'));
    ok(/ALTER TABLE harvested_seeds ADD COLUMN harvested_day/.test(dbSrc),
      '★★⑤ **새 표 0 · 열 하나**다(`harvested_seeds.harvested_day`)');
    ok(/PRAGMA table_info\(harvested_seeds\)/.test(dbSrc),
      '★⑤ 마이그레이션은 **있으면 건너뛴다**(`mined_cells` 와 같은 문법 · 재부팅 안전)');
    ok(/harvested_day INTEGER NOT NULL DEFAULT -1/.test(dbSrc),
      '★⑤ 옛 행은 −1 로 들어온다(부팅 때 승격 — 즉시 성목이 되지 않는다)');
    const zSrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    ok(/promoteHarvestedDays\(/.test(zSrc), '★★⑤ 옛 행을 **승격일로** 채운다(DB 에도 쓴다)');
    //   ★★그리고 그 승격은 **부팅 최상위가 아니라** 첫 청크 활성화 때 한다 — 부팅 시점엔
    //     `gameDayNow` 가 읽는 `let` 들이 TDZ 이고(초안이 `test-mining` 을 통째로 터뜨렸다),
    //     econ 시계도 아직 안 서서 그때 적은 "오늘"은 **틀린 날**이었을 것이다.
    const bootBlk = zSrc.slice(zSrc.indexOf('const harvested = db.getAllHarvestedSeeds();'),
                               zSrc.indexOf('채집된 시드 자원 ${harvested.length}개'));
    ok(bootBlk.length > 0 && !/gameDayNow\(\)/.test(bootBlk),
      '★★⑤ 부팅 블록은 **게임일을 안 묻는다**(모듈 최상위 TDZ · 시계가 아직 안 섰다)', `${bootBlk.split('\n').length}줄`);
    ok(/function _promoteHarvestOnce\(\)/.test(zSrc) && /_promoteHarvestOnce\(\);/.test(zSrc),
      '★⑤ 승격은 **한 번**이고 시계가 선 뒤다(`activateChunk` 에서 호출 · 멱등)');
    ok(/new Map\(\); \/\/ 채집된 시드 자원/.test(zSrc) || /const harvestedSeeds = new Map\(\)/.test(zSrc),
      '★⑤ `harvestedSeeds` 가 **Map**(키 → 벤 날)이다');
    ok(!/harvestedSeeds\.add\(/.test(zSrc), '★★⑤ 벤 자리를 적는 길이 **문 하나**다(`_markHarvested` · `.add` 잔재 0)');
    const vSrc = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
    const jm = vSrc.match(/const JOB_RES = \{([^}]*)\}/);
    ok(!!jm, '⑤ 전제 — NPC 현장 표를 읽었다');
    ok(jm && !/stump|sapling/.test(jm[1]),
      '★★⑤ **NPC 벌목꾼 현장에 그루터기·묘목이 없다** — 버킷이 `JOB_RES[j].includes(r.type)` 하나라 새 종류는 **자동으로 빠진다**',
      jm ? jm[1].trim() : '—');
    ok(!/T122|regrow|stump|sapling/.test(vSrc),
      '★★⑤ 그래서 `villages.js` 를 **한 글자도 안 만졌다**(랩 모듈 · 여덟 수가 움직일 이유가 없다)');
    const RV = require(path.join(ROOT, 'server', 'itemlabel.js')).RESOURCE_VERBS;
    ok(RV.sapling === '벌목', '★⑤ 묘목의 동사는 나무와 **같은 말**이다', RV.sapling);
    ok(!RV.stump, '★★⑤ 그루터기는 동사 표에 **없다** — 자연물 종류가 아니라 hp 0 으로 나는 그림이다');
    const chunkSrc = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
    const m4 = chunkSrc.match(/const RESOURCE_HP_TABLE = \{([^}]*)\}/);
    const kinds = m4 ? [...m4[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]) : [];
    ok(kinds.includes('sapling') && !kinds.includes('stump'),
      '★⑤ 그리고 hp 정본과 동사 표가 **서로 맞는다**(`test-itemlabel ⑭` 가 매번 맞대 본다)', kinds.join(' '));
    const rl = fs.readFileSync(path.join(ROOT, 'public', 'client', '34-m-renderloop.js'), 'utf8');
    ok(/type === 'stump'/.test(rl) && /type === 'sapling'/.test(rl), '★⑤ 화면에 두 갈래가 있다');
    ok(/item\.r\.maxHp > 0 && item\.r\.hp < item\.r\.maxHp/.test(rl),
      '★⑤ 그루터기의 hp 바를 **0 으로 나누지 않는다**(maxHp 0)');
    const vb = fs.readFileSync(path.join(ROOT, 'public', 'client', '46-h-verbs.js'), 'utf8');
    ok(/if \(!\(t\.obj\.maxHp > 0\)\) return out;/.test(vb),
      '★★⑤ 그루터기엔 동사가 안 뜬다 — **물리(`maxHp`)로** 거른다(종류 이름 목록 사본 0)');
    const sp = fs.readFileSync(path.join(ROOT, 'public', 'client', '40-r2-sprites.js'), 'utf8');
    ok(/assets\/trees\/stump01\.png/.test(sp) && /assets\/trees\/sap_/.test(sp),
      '★★⑤ 그림은 **T129 가 구운 것**을 그대로 쓴다(축소 그림 임시 0)');
    for (const f of ['stump01.png', 'sap_pine.png', 'sap_oak.png']) {
      ok(fs.existsSync(path.join(ROOT, 'public', 'assets', 'trees', f)), `★⑤ 그림이 실제로 있다 — ${f}`);
    }
  }

  // ═══ ⑥ 앵커 — 출처가 있고, 실시간 환산을 숨기지 않는다 ═════════════════════
  say('\n⑥ 앵커 — 출처 하나 · 실시간 환산은 보고에 적는다');
  {
    const src = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
    ok(/10\.5772\/intechopen\.80236/.test(src), '★★⑥ 출처가 **소스에 박혀 있다**(doi)');
    ok(/22 years are required/.test(src) && /52 years are required/.test(src),
      '★★⑥ 그리고 **문서의 말 그대로** 인용했다(내 요약이 아니다)');
    const N = C.REGROW.TREE_STUMP_Y(), M = C.REGROW.TREE_FULL_Y();
    ok(N === 22 && M === 52, '★⑥ 채택값이 출처값 **그대로**다(첫 판 · 재민 판정 전)', `${N} / ${M} 게임년`);
    const realDays = (y) => y * Y * 24 / 60 / 24;
    ok(realDays(N) > 100 && realDays(M) > 300,
      '★★⑥ 실시간 환산 — **플레이어는 성목이 되는 걸 사실상 못 본다**(그게 임학이 말하는 크기다 · 회부)',
      `그루터기→묘목 ${realDays(N).toFixed(0)}실일 · →성목 ${realDays(M).toFixed(0)}실일`);
    ok(/T122_STUMP_Y/.test(src) && /T122_TREE_Y/.test(src) && /T122_REGROW/.test(src),
      '★⑥ 손잡이가 셋 다 env 다(값을 갈 때 코드를 안 고친다)');
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
