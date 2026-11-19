#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 1   ← [T1383] land1084 옛 목록(규칙 앞 가지)에서 뺌 — 미끼 뜻 그대로 · 판정 줄에 바꾼 자리 수
// @old-red-also scripts/server-baseline-check.js   (재는 고침이 판 자 `--body-day` — 옛 코드 빨강 판에서 판 자도 옛 판으로 · T1383)
// === scripts/test-t1345-body-day.js — 서버 판 자 `--body-day`(운영 하루 24분 + 집 켬 · T1345 사다리 ③ 계단) ==================
//
// ★왜 [T1345] 조건 사다리(시드 1020 · 365날 · 한 번에 돈 판) — 묶음 해 끝 끔비: ① 서버 자(빠른 시계 · 집 끔) 1.099 · ①h 집 켬만(빠른 시계) 1.055 ·
//   ② 하루 24분만(집 끔) ≈ ① · ③ 하루 24분 + 집 켬 0.879(몸 세계 T1335 0.733). 꺾임은 집 켬 × 하루 24분이 **함께일 때만** 선다(보고 T1345 §1).
//   서버 기준선 자(`server-baseline-check.js`)는 `--house` 는 있었지만 하루 길이를 판 조건으로 적는 문이 없었다 — env `VILLAGE_DAY_MS` 는 아이에 그대로 갔지만
//   `cond` 에 안 적혀 빠른 시계 기준선과 섞여도 몰랐고, 기준선 `clock` 칸은 늘 "250" 이라 적었다.
//   고침(판 자): `--body-day` = 판 조건에 `VILLAGE_DAY_MS=1440000` + 집 켬(`T400_BUILD_ACT=1`) — `cond` · `clock` · `how` 에 적힌다 · 묶음 판을 빠른 시계로 만들면 경고.
//
// 판정 사본 0: 진짜 `server-baseline-check.js` → 진짜 `t577-server-run.js` 를 돌린다. 프리로드(`-r` 이 파일 자신)가 두 갈래로 선다 —
//   (가) 잡기(`T1345_CAPTURE`): t577 프로세스의 `child_process.spawn` 을 감싸 아이 존을 "받은 env 를 적고 끝나는" node 한 줄로 바꾼다(세계 0 · 몇 초 · T1087 꼴).
//   (나) 보기(`T1345_OBS`): 아이 존 안에서 장부 `scanDay` 마다 마을 칸을 읽기만 한다(지도 침상 · 주거 문 · 집터).
// 지키는 것:
//   ① `--body-day` — 아이 존 env: VILLAGE_DAY_MS=1440000 · T400_BUILD_ACT=1 · T315_MAPBEDS=1(집 켬 판 자 기본) · VILLAGE_NPC_CAP=LIFE_CREW
//   ② `--body-day` 없음(끈 판 세계) — 아이 VILLAGE_DAY_MS=250 · T400_BUILD_ACT=0(서버 기준선 자 그대로)
//   ③ 묶음(T1334_BUNDLE=1) + 빠른 시계 `--make` 는 경고 줄 하나 · `--body-day` 면 없음 · 묶음 끔이면 없음
//   ④ 짧은 판(묶음 · `--body-day` · 20날) — 기준선 `cond` 에 VILLAGE_DAY_MS '1440000' · T400_BUILD_ACT '1' · `bodyDay` · `how` 에 `--body-day` ·
//      판이 그 계단을 문다: 지도 침상이 선 마을(집 켬 세계) · 묶음 마을의 주거 문 닫힌 마을-날 > 0 · 그중 집터 없는 날 > 0(보고 T1345 §2 — 묶음 집터 찾기 10 ~ 25 %)
//   ⑤ 미끼(파일 안) — `--body-day` 의 cond 한 자리(`{ VILLAGE_DAY_MS: '1440000' }`)를 `{}` 로 바꾼 판 자 사본(바꾼 자리 정확히 1곳)은 ① 의 하루 길이 단언이 빨강
//
// 실행: node scripts/test-t1345-body-day.js   (잡기 넷 · 몇 초씩 + 짧은 판 하나 · 3 ~ 8분)
//   T1345_BODY_DAY_DAYS=<날>(기본 20) — 짧은 판 날 수
'use strict';
// ── 프리로드 갈래 ──
if (require.main !== module) {
  const fs0 = require('fs'), path0 = require('path');
  const A1 = process.argv[1] || '';
  // (가) 잡기 — t577 판 자 프로세스에서만: 아이 존을 env 를 적고 끝나는 한 줄로 바꾼다
  if (process.env.T1345_CAPTURE && /t577-server-run\.js$/.test(A1)) {
    const cp = require('child_process'); const real = cp.spawn;
    cp.spawn = function (cmd, args, opts) {
      const keys = ['VILLAGE_DAY_MS', 'T400_BUILD_ACT', 'T315_MAPBEDS', 'VILLAGE_NPC_CAP', 'T627_TRIP_DAY', 'T1334_BUNDLE', 'T745_VCLOCK'];
      const code = `const k=${JSON.stringify(keys)};const o={};for(const x of k)o[x]=process.env[x]==null?null:process.env[x];` +
        `require('fs').writeFileSync(process.env.T1345_CAPTURE,JSON.stringify(o));console.log('zone server up on 0');process.exit(0)`;
      return real.call(this, process.execPath, ['-e', code], opts);
    };
  }
  // (나) 보기 — 아이 존에서만: 날마다 마을 칸을 읽는다(세계 0)
  if (process.env.T1345_OBS && /server[\/\\]zone\.js$/.test(A1)) {
    const ROOT = path0.resolve(__dirname, '..'), OUT = process.env.T1345_OBS;
    const Ev = require(path0.join(ROOT, 'server', 'events'));
    const S = { days: 0, vils: 0, mapBeds: 0, gated: 0, gatedNoSite: 0, villageDays: 0, dayMs: process.env.VILLAGE_DAY_MS || null };
    let last = -1;
    const sv = () => { const vm = require.cache[path0.join(ROOT, 'server', 'villages.js')]; const V = vm && vm.exports; return V && V.__labProbe ? (V.__labProbe._t569Probe.setup().villages || []) : []; };
    const mk = Ev.createLedger;
    Ev.createLedger = function () {
      const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
      Lg.scanDay = function (world, day) {
        const r = sd.apply(this, arguments);
        try {
          if ((day | 0) !== last) {
            last = day | 0; S.days++;
            let n = 0, mb = 0;
            for (const v of sv()) {
              const e = v && v.econ; if (!e || e.founder) continue;
              n++; if (e._mapBeds !== undefined) mb++;
              S.villageDays++;
              if (e._dpDebug && e._dpDebug.gated) { S.gated++; if (!v._site) S.gatedNoSite++; }
            }
            S.vils = n; S.mapBeds = mb;
            fs0.writeFileSync(OUT, JSON.stringify(S));
          }
        } catch (e) {}
        return r;
      };
      return Lg;
    };
  }
  return;
}
// ── 바깥 ──
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SBC = path.join(ROOT, 'scripts', 'server-baseline-check.js');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1345-'));
const DAYS = parseInt(process.env.T1345_BODY_DAY_DAYS || '20', 10) || 20;
const CREW = String(require(path.join(ROOT, 'server', 'villages')).__labProbe._t400Probe.LIFE_CREW);
// 아이 존 env 잡기 — 진짜 server-baseline-check(또는 그 사본) → 진짜 t577 → 아이(바꿔 친 한 줄)
function capture(args, env, script) {
  const cap = path.join(TMP, 'cap.json'); fs.rmSync(cap, { force: true });
  const E = Object.assign({}, process.env, { T1345_CAPTURE: cap, NODE_OPTIONS: `-r ${__filename}` }, env || {});
  for (const k of ['VILLAGE_DAY_MS', 'T400_BUILD_ACT', 'T1334_BUNDLE', 'T1342_GATE_HOME', 'VILLAGE_NPC_CAP', 'T1345_OBS']) if (!(env && k in env)) delete E[k];
  const r = spawnSync(process.execPath, [script || SBC, '--make', path.join(TMP, 'cap-base.json'), '--days', '1', '--seeds', '7', '--par', '1', '--route-cache', 'off'].concat(args || []),
    { cwd: ROOT, env: E, encoding: 'utf8', timeout: 120000 });
  let o = null; try { o = JSON.parse(fs.readFileSync(cap, 'utf8')); } catch (e) { o = null; }
  return { env: o, out: (r.stdout || '') + (r.stderr || '') };
}
const WARN = '⚠ [T1345] 묶음 판을 빠른 시계 판 자로 만든다';

console.log('\n=== T1345 — 서버 판 자 `--body-day`(운영 하루 24분 + 집 켬 · 사다리 ③ 계단) ===');
// ①
const bd = capture(['--body-day']);
ok(bd.env && bd.env.VILLAGE_DAY_MS === '1440000', '① `--body-day` — 아이 존 VILLAGE_DAY_MS=1440000(운영 하루 24분)', JSON.stringify(bd.env));
ok(bd.env && bd.env.T400_BUILD_ACT === '1' && bd.env.T315_MAPBEDS === '1' && bd.env.VILLAGE_NPC_CAP === CREW,
  `① \`--body-day\` — 집 켬이 따라온다(T400_BUILD_ACT=1 · 지도 침상 T315_MAPBEDS=1 · 몸 상한 LIFE_CREW ${CREW})`);
// ②
const fast = capture([]);
ok(fast.env && fast.env.VILLAGE_DAY_MS === '250' && fast.env.T400_BUILD_ACT === '0', '② `--body-day` 없음 — 서버 기준선 자 그대로(VILLAGE_DAY_MS=250 · 집 끔)', JSON.stringify(fast.env));
// ③
const bunFast = capture([], { T1334_BUNDLE: '1' });
const bunBody = capture(['--body-day'], { T1334_BUNDLE: '1' });
ok(bunFast.out.split(WARN).length === 2, '③ 묶음 + 빠른 시계 `--make` — 경고 줄 하나');
ok(bunBody.out.indexOf(WARN) < 0 && fast.out.indexOf(WARN) < 0, '③ 묶음 + `--body-day` · 묶음 끔 — 경고 없음');
ok(bunBody.env && bunBody.env.T1334_BUNDLE === '1' && bunBody.env.VILLAGE_DAY_MS === '1440000', '③ 묶음 + `--body-day` — 아이 존에 묶음 · 하루 24분이 같이 간다', JSON.stringify(bunBody.env));
// ⑤ 미끼 — 판 자 사본(바꾼 자리 정확히 1곳) · ① 의 하루 길이 단언이 빨강
{
  const src = fs.readFileSync(SBC, 'utf8');
  const a = "BODY_DAY ? { VILLAGE_DAY_MS: '1440000' } : {}";
  ok(src.split(a).length === 2, '⑤ 판 자에서 `--body-day` 의 판 조건 자리는 한 곳');
  const bait = path.join(path.dirname(SBC), `._t1345-bait-${process.pid}.js`);
  fs.writeFileSync(bait, src.replace(a, 'BODY_DAY ? {} : {}'));
  let b = null; try { b = capture(['--body-day'], {}, bait); } finally { fs.rmSync(bait, { force: true }); }
  const na = src.split(a).length - 1;
  ok(na === 1 && b && b.env && b.env.VILLAGE_DAY_MS !== '1440000' && b.env.T400_BUILD_ACT === '1',
    '⑤ 미끼 — 하루 길이 자리를 뺀 사본은 집만 켜고 하루는 250 — ① 의 "VILLAGE_DAY_MS=1440000" 단언이 빨강', `바꾼 자리 ${na} · ${JSON.stringify(b && b.env)}`);
}
// ④ 짧은 판 — 묶음 · `--body-day` · 진짜 존
{
  const base = path.join(TMP, 'b.json'), obs = path.join(TMP, 'obs.json');
  const E = Object.assign({}, process.env, { T1334_BUNDLE: '1', T1345_OBS: obs, NODE_OPTIONS: `-r ${__filename}` });
  for (const k of ['VILLAGE_DAY_MS', 'T400_BUILD_ACT', 'T1345_CAPTURE', 'T1342_GATE_HOME', 'VILLAGE_NPC_CAP']) delete E[k];
  const r = spawnSync(process.execPath, ['--experimental-sqlite', SBC, '--make', base, '--days', String(DAYS), '--seeds', '1020', '--body-day', '--vclock', '--par', '1'],
    { cwd: ROOT, env: E, encoding: 'utf8', timeout: 1800000 });
  let doc = null; try { doc = JSON.parse(fs.readFileSync(base, 'utf8')); } catch (e) { doc = null; }
  let o = null; try { o = JSON.parse(fs.readFileSync(obs, 'utf8')); } catch (e) { o = null; }
  ok(r.status === 0 && doc, `④ 짧은 판(묶음 · --body-day · ${DAYS}날) — 기준선이 선다`, `RC=${r.status}${r.status ? ' · ' + String(r.stdout || '').split('\n').filter((l) => /✗|실패|Error/.test(l)).slice(0, 2).join(' / ') : ''}`);
  ok(doc && doc.cond && doc.cond.VILLAGE_DAY_MS === '1440000' && doc.cond.T400_BUILD_ACT === '1' && doc.cond.T1334_BUNDLE === '1' && doc.bodyDay === true && /--body-day/.test(doc.how) && /1440000/.test(doc.clock),
    '④ 기준선 cond · bodyDay · how · clock 에 운영 하루 24분 + 집 켬이 적힌다', doc ? JSON.stringify(doc.cond) : '');
  ok(o && o.days >= DAYS && o.dayMs === '1440000' && o.vils > 0 && o.mapBeds === o.vils, '④ 판이 그 세계를 돈다 — 존 하루 24분 · 마을마다 지도 침상(집 켬)', JSON.stringify(o));
  ok(o && o.gated > 0 && o.gatedNoSite > 0, '④ 판이 계단을 문다 — 묶음 마을의 주거 문 닫힌 마을-날 > 0 · 그중 집터 없는 날 > 0', o ? `주거 문 ${o.gated} · 집터 없음 ${o.gatedNoSite} / 마을-날 ${o.villageDays}` : '');
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
