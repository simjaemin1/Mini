#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-jungwon-boot.js — 셋째 존(중원북 · 하란 북부)이 실제로 산다 (T409) ===
//
// ★왜 [T409 2026-09-26] — 닛폰이 네 카드(T343·T348·T351·T360)에 걸쳐 밟은 순서를 중원북은 한 카드로 밟았다:
//   지형(이름 통일) → 다리(92셀 · 3도하) → 광맥(4 → 754) → 마을(후보 25 정본 · 이름) → 부팅.
//   이 자는 `test-nippon-boot` 문법 그대로다 — 후보 정본(값싼 절)과 실서버(비싼 절)를 섞지 않는다.
//
// ★닛폰이 겪은 함정 셋을 **처음부터** 건다:
//   ① T348 — 계획기가 서버와 다른 물을 봤다(해안선 띠) ⇒ ⓕ 는 "다리를 놓았다"가 아니라 **교역 격자가 본다**(`다리구제 > 0`).
//   ② T360 — 착지 조건 `label === 1` ⇒ ⓙ 는 **도달불능 0쌍**(55/55).
//   ③ T407 — 품질 게이트가 후보를 솎는다 ⇒ ⓘ 는 부팅이 낸 선별·시딩 수가 **랩 자(`t407-nippon-isolation`)와 같다**.
//
// ★★자명 통과 금지 — 전제를 먼저 건다(시딩 줄 · econ 인구 · 쌍 수). 그게 없으면 아래는 아무것도 안 잰 것이다.
//
// 실행: node scripts/test-jungwon-boot.js
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)

const ROOT = path.join(__dirname, '..');
const ZID = 'jungwon_n';

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
  console.log('\n=== 셋째 존이 실제로 산다 — 중원북 부팅 (T409) ===');
  const T = require(path.join(ROOT, 'server', 'terrain'));
  const ZONES = require(path.join(ROOT, 'server', 'zone-config')).ZONES;
  const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8'));

  // ── ⓐ 후보 정본 ─────────────────────────────────────────────────────────
  console.log('\n[ⓐ 후보 정본 — 적힌 칸 그대로]');
  const hard = T.getZoneVillages(ZID), cand = T.siteCandidates(ZID);
  ok(Array.isArray(hard) && hard.length > 0, 'ⓐ0 ★중원북 후보가 **정본 칸에 적혀 있다**(T409 — 종전 0곳)', `${(hard || []).length}곳`);
  ok(cand === hard, 'ⓐ ★그 칸을 **그대로** 돌려준다(같은 배열 객체 · 절차 배치기를 다시 안 돈다)', cand === hard ? '동일 객체' : '다른 객체');
  const TYPES = new Set(['plain', 'riverside', 'forest', 'mining']);
  const shapeBad = (cand || []).filter((v) => !(v && typeof v.name === 'string' && Number.isFinite(v.x) && Number.isFinite(v.y) && TYPES.has(v.type)));
  ok(shapeBad.length === 0, 'ⓐ2 꼴이 한반도와 같다 — {name,x,y,type}', shapeBad.length ? JSON.stringify(shapeBad[0]) : `${(cand || []).length}곳`);
  // 이름 — 하란 줄기 + 한반도 업종 낱말(`t409-village-names`). 절차 음절표(북미 평원)의 이름이 남아 있으면 안 된다.
  const WORDS = ['광산', '어촌', '임업', '농촌'];
  const nameBad = (cand || []).filter((v) => !WORDS.some((w) => v.name.endsWith(w)) || /[0-9]/.test(v.name));
  ok(nameBad.length === 0, 'ⓐ3 이름이 **하란 줄기 + 업종 낱말**이다(절차 음절표 이름 0)', nameBad.length ? nameBad.map((v) => v.name).join(',') : (cand || []).slice(0, 4).map((v) => v.name).join('·') + ' …');
  ok(new Set((cand || []).map((v) => v.name)).size === (cand || []).length, 'ⓐ4 이름이 서로 겹치지 않는다(이름은 신원이다)');
  const typeWord = { mining: '광산', riverside: '어촌', forest: '임업', plain: '농촌' };
  const tw = (cand || []).filter((v) => !v.name.endsWith(typeWord[v.type]));
  ok(tw.length === 0, 'ⓐ5 업종 낱말이 **타입과 맞다**(한반도 정본 51곳의 타입→낱말 그대로)', tw.length ? tw.map((v) => `${v.name}/${v.type}`).join(',') : '');

  // ── ⓑ 경계 이름 통일 — 한반도 쪽은 그대로, 중원북 쪽만 ───────────────────────
  console.log('\n[ⓑ 경계 이름 통일 — T408 ④ 대응표]');
  const pairs10 = [['rivers', '대숲내'], ['rivers', '꽃여울'], ['rivers', '선강'], ['rivers', '둔머리천'], ['lakes', '율호'], ['lakes', '노호'],
                   ['ridges', '도산맥'], ['forests', '학수해'], ['forests', '단수해'], ['forests', '소수해']];
  const both = pairs10.filter(([k, n]) => (J.hanbando[k] || []).some((f) => f.name === n) && (J.jungwon_n[k] || []).some((f) => f.name === n));
  ok(both.length === pairs10.length, 'ⓑ ★경계를 넘는 짝 10 이 **두 존에서 같은 이름**이다', `${both.length}/${pairs10.length}`);
  ok((J.jungwon_n.forests || []).some((f) => f.name === '운림') && (J.bering.forests || []).some((f) => f.name === '운림'),
    'ⓑ2 ★운림은 **안 바꿨다** — 베링·시바라와 이미 같은 이름(바꾸면 그쪽과 갈라진다)');
  const old = ['청수', '운수', '민하', '광수', '무호', '샛못호_2', '려산맥', '적림', '창림', '광림'];
  const left = old.filter((n) => ['rivers', 'lakes', 'ridges', 'forests'].some((k) => (J.jungwon_n[k] || []).some((f) => f.name === n)));
  ok(left.length === 0, 'ⓑ3 옛 이름이 중원북 목록에 안 남았다(한 피처 두 이름 0)', left.join(',') || '0');

  // ── ⓒ 광맥 — 4 → 754 · 자잘 포함(T407 이 닛폰 0 을 잡았다) ─────────────────────
  console.log('\n[ⓒ 광맥 — 계획기 그대로]');
  const ores = J.jungwon_n.ores || [];
  ok(ores.length === 754, 'ⓒ 중원북 정본 광맥 754(기존 4 + 대중소 50 + 자잘 700)', `${ores.length}`);
  ok(ores.filter((o) => o.minor).length === 700, 'ⓒ2 ★자잘 광맥이 **있다**(닛폰의 병 — 자잘 0 — 을 안 옮겼다)', `${ores.filter((o) => o.minor).length}`);
  ok(ores.every((o) => typeof o.mineral === 'string' && o.pk > 0), 'ⓒ3 광맥마다 광종·품위가 박혀 있다(`mineral:null` 0 — T348 의 병)');
  // ★정본에 술어 캐시가 새지 않았다 — T406·T408 뒤 쓰는 도구가 `_segIdx` 를 정본에 적은 적이 있다(T409 에서 잡았다)
  const leak = JSON.stringify(J).match(/"_segIdx"/g);
  ok(!leak, 'ⓒ4 ★정본에 술어 캐시(`_segIdx`)가 없다 — 도구가 **쓰는 판을 파일에서 새로 읽는다**', leak ? `${leak.length}곳` : '0');

  // ── ⓔ 실서버 ─────────────────────────────────────────────────────────────
  console.log('\n[ⓔ 실서버 — ZONE_ID=jungwon_n 으로 실제로 띄운다]');
  const [CPORT, ZPORT] = await pickPorts();
  const CDB = `/tmp/jb-central-${process.pid}.db`, ZDB = `/tmp/jb-zone-${process.pid}.db`;
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  const cp = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZID });
  const _up = await FB.waitUp(cp, /central server up on/, { name: 'central' });
  ok(_up.ok, 'ⓔ0 central 기동', _up.ok ? `${_up.ms}ms · 아이가 제 입으로 말했다` : _up.why);
  const zp = boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: ZID, DB_PATH: ZDB,
    CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
  });
  ok(await waitUp(zp, `http://localhost:${ZPORT}/health`), 'ⓔ1 중원북 존 기동');
  let ready = false;
  for (let i = 0; i < 300 && !ready; i++) { ready = /마을 시뮬 준비/.test(zp._out) || /시뮬 비활성/.test(zp._out); await sleep(1000); }
  const LOG = zp._out;
  ok(/마을 시딩 시작 — 후보 (\d+)/.test(LOG), 'ⓔ2 전제: 시딩이 실제로 돌았다', (LOG.match(/마을 시딩 시작 — [^\n]*/) || [''])[0]);
  const mSeeded = LOG.match(/마을 시딩 완료 — 후보 (\d+) → 선별 (\d+) → \*\*시딩 (\d+)\*\*/);
  ok(!!mSeeded, 'ⓔ3 전제: 시딩 완료 줄이 찍혔다', mSeeded ? mSeeded[0] : '(없음)');
  const mSim = LOG.match(/마을 시뮬 준비: 마을 (\d+), econ 인구 (\d+)/);
  ok(!!mSim, 'ⓔ4 전제: 생활층이 깨어났다(마을 시뮬 준비)', mSim ? mSim[0] : '(없음 — 조용한 0)');
  const h = await (await fetch(`http://localhost:${ZPORT}/health`)).json();
  ok(typeof h.villages === 'number' && h.villages >= 1, 'ⓔ ★★중원북에 마을이 **선다**', `villages=${h.villages}`);
  ok(!!mSim && (+mSim[2]) > 0, 'ⓔ5 econ 인구가 0보다 크다', mSim ? `${mSim[2]}명` : '-');
  const errLines = LOG.split('\n').filter((l) => /(^|\s)(Error|TypeError|ReferenceError)\b|\bfatal\b|Cannot read|is not a function/.test(l));
  ok(errLines.length === 0, 'ⓔ8 ★부팅 로그 오류 0', errLines.length ? errLines.slice(0, 2).join(' | ').slice(0, 200) : '');
  const errTail = (zp._err || '').split('\n');
  const errReal = errTail.filter((l) => /^\s+at\s+\S/.test(l) || /(^|\s)(Error|TypeError|ReferenceError)\b|Cannot read|is not a function/.test(l));
  ok(errReal.length === 0, 'ⓔ9 stderr 에 예외 자취가 없다', errReal.slice(0, 2).join(' | ').slice(0, 200));
  const skips = LOG.split('\n').concat(errTail).filter((l) => /주변 24셀 내 뭍 없음 — 스킵/.test(l));
  ok(!mSeeded || (+mSeeded[2] - +mSeeded[3]) === skips.length, 'ⓔ10 선별−시딩 차이 = 물 위 스킵 수(조용히 사라진 마을 0)',
    mSeeded ? `선별 ${mSeeded[2]} − 시딩 ${mSeeded[3]} · 스킵 줄 ${skips.length}` : '-');

  // ── ⓕ 다리 · ⓙ 한 덩어리 ─────────────────────────────────────────────────
  console.log('\n[ⓕ 다리 — 교역 격자가 본다 · ⓙ 한 덩어리]');
  const mDist = LOG.match(/교역 BFS 거리행렬: (\d+)마을 (\d+)쌍[^\n]*다리구제 (\d+)\)[^\n]*도달불능 (\d+)쌍/);
  ok(!!mDist, 'ⓕ0 전제: 교역 거리행렬 줄이 찍혔다', mDist ? mDist[0].slice(0, 110) : '(없음)');
  const pairs = mDist ? +mDist[2] : 0, unreach = mDist ? +mDist[4] : 0, saved = mDist ? +mDist[3] : 0;
  ok(pairs > 1, 'ⓕ1 전제: 마을 쌍이 실제로 있다', `${pairs}쌍`);
  const nb = ((ZONES[ZID] && ZONES[ZID].bridges) || []).length / 2;
  ok(nb === 92, 'ⓕ2 존 설정 다리 92셀(계획기 3도하 — 16 · 50 · 26)', `${nb}셀`);
  ok(saved > 0, 'ⓕ ★다리가 교역 격자에 **보인다**(다리구제 > 0 — T348 1차 판의 병)', `다리구제 ${saved}칸`);
  ok(unreach === 0, 'ⓙ ★★서로 못 가는 마을 쌍이 **없다**(T373 불능 45쌍 → 0)', `도달 ${pairs - unreach}/${pairs}쌍 · 불능 ${unreach}`);

  // ── ⓘ 부팅 = 랩 자 ─────────────────────────────────────────────────────────
  console.log('\n[ⓘ 부팅이 낸 수 = 정본 · 랩 자]');
  ok(!!mSeeded && +mSeeded[1] === (hard || []).length, 'ⓘ 부팅 후보 수 = 정본 칸 수', mSeeded ? `${mSeeded[1]} · 정본 ${(hard || []).length}` : '-');
  ok(!!mSeeded && +mSeeded[2] === 12 && +mSeeded[3] === 11, 'ⓘ2 ★선별 12 → 시딩 11(품질 게이트 — `t407-nippon-isolation jungwon_n` 과 같은 수)',
    mSeeded ? `선별 ${mSeeded[2]} · 시딩 ${mSeeded[3]}` : '-');
  ok(pairs === 55, 'ⓘ3 교역 쌍 55(시딩 11)', `${pairs}쌍`);
  const lands = [...LOG.matchAll(/\[([^\]]+)\] 시딩: 중심[^\n]*land\(F([\d.]+)\/W([\d.]+)\/S([\d.]+)\/O([\d.]+)\//g)].map((m) => ({ name: m[1], ore: +m[5] }));
  ok(lands.length === 11, 'ⓘ4 전제: 시딩 줄 11곳에서 땅 파라미터를 읽었다', `${lands.length}곳`);
  const canonNames = new Set((hard || []).map((v) => v.name));
  ok(lands.every((v) => canonNames.has(v.name)), 'ⓘ5 시딩된 이름이 전부 정본 이름이다', lands.map((v) => v.name).join('·'));
  ok(lands.every((v) => v.ore >= 0.1), 'ⓘ6 광맥 값이 바닥(0.1) 아래로 안 내려간다',
    lands.length ? `${Math.min(...lands.map((v) => v.ore))} ~ ${Math.max(...lands.map((v) => v.ore))}` : '-');

  // ── ⓗ 한반도·닛폰 무변 — 자료 쪽 ─────────────────────────────────────────────
  console.log('\n[ⓗ 한반도·닛폰 무변 — 자료 쪽]');
  ok((J.hanbando.ores || []).length === 787, 'ⓗ 한반도 정본 광맥 787', `${(J.hanbando.ores || []).length}`);
  ok(((ZONES.hanbando.bridges || []).length / 2) === 836, 'ⓗ2 한반도 다리 836셀', `${(ZONES.hanbando.bridges || []).length / 2}`);
  ok((J.nippon.ores || []).length === 55 && ((ZONES.nippon.bridges || []).length / 2) === 208, 'ⓗ3 닛폰 광맥 55 · 다리 208셀');
  ok((J.hanbando.villages || []).length === 51 && (J.nippon.villages || []).length === 16, 'ⓗ4 한반도 후보 51 · 닛폰 16 그대로');

  shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); shutdown(); process.exit(1); });
