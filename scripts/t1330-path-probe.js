// (@regress 없음 — 러너 밖 · T1330 계측기 · 제품 무변 · 읽기만)
// === scripts/t1330-path-probe.js — 교전 틱의 몸 길찾기: 틱 ms 분포 · 틱당 `localPath` 수 · 실패 · 같은 물음 되풀이 ===================
//   쓰는 법: 존 아이 프리로드(`NODE_OPTIONS="-r $PWD/scripts/t1330-path-probe.js"`) — T577 판 자 · T1308 이어 도는 판 자 그대로.
//   존 아이 프로세스(T577_OUT 있는 본 실)만 잰다 · 날마다 `T1330_PROBE_OUT`(없으면 판 JSON 곁 `.t1330.json`)에 덮어 쓴다(끊겨도 그날까지 남는다).
//   감싸는 것: path-core `localPath`(같은 인수 · 같은 반환 · hrtime) · war-live `stepFight`(같은 인수 · 같은 반환). 값은 안 바꾼다.
'use strict';
const OUT = process.env.T1330_PROBE_OUT ? process.env.T1330_PROBE_OUT.replace(/\.json$/, '') + (process.env.T1330_PROBE_SEED === '1' ? '.' + process.env.T577_SEED : '') + '.json' : (process.env.T577_OUT ? process.env.T577_OUT + '.t1330.json' : '');   // `T1330_PROBE_SEED=1` 이면 시드마다 따로(판 셋을 나란히 띄우는 기준선 자)
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT && MAIN && process.env.T577_SEED) {   // 아이 존만(판 자 부모 · 다른 프로세스 무접촉)
  const fs = require('fs'), path = require('path');
  const ROOT = path.join(__dirname, '..');
  const PC = require(path.join(ROOT, 'sim', 'path-core.js'));
  //   시간 = CPU µs(`process.cpuUsage` — 가상 시계 자 `t745-vclock` 는 벽시계 · hrtime 을 V 에 묶는다 · CPU 는 안 묶는다 · 한 실이라 틱 걸린 시간과 같다)
  const now = () => { const c = process.cpuUsage(); return BigInt(c.user + c.system) * 1000n; };
  const BUCK = [1, 2, 5, 10, 33, 66, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000];   // 틱 ms 칸(위 끝)
  const rec = { days: {}, top: [] };
  //   이어 도는 판(T1308 — 마디마다 새 프로세스)은 앞 마디 기록을 이어 받는다(같은 파일 · 날 열쇠 · 뒤 마디가 같은 날을 덮지 않게 그날은 이어 센다)
  try { const o = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (o && o.days) { rec.days = o.days; rec.top = o.top || []; rec.cpu0 = (o.cpu0 || 0) + (o.cpuS || 0); } } catch (e) {}
  let inFight = 0, cur = null, S = null, VIL = null, wrapped = false, lastW = 0n;
  //   쓰기 = CPU 2초마다(감싼 문 안에서 — 가상 시계 타이머는 존이 한 콜백에 갇히면 안 돈다 · 멈춤을 재려면 갇힌 동안에도 써야 한다)
  const flush = (force) => { const t = now(); if (!force && t - lastW < 2000000000n) return; lastW = t; wrap(); try { fs.writeFileSync(OUT, JSON.stringify({ buck: BUCK, cpuS: Number(t) / 1e9, ...rec })); } catch (e) {} };
  const day = () => (S && S.world ? S.world.day | 0 : -1);
  const D = () => { const d = day(); return rec.days[d] || (rec.days[d] = { ticks: 0, ms: 0, max: 0, hist: BUCK.map(() => 0), lp: 0, lpMs: 0, lpFail: 0, lpRepeat: 0, lpMaxPerTick: 0, units: 0, lpOut: 0 }); };
  // localPath — 교전 틱 안(inFight)이면 그 틱 몫으로 센다
  const lp0 = PC.localPath;
  PC.localPath = function (sx, sy, gx, gy, opts) {
    const t0 = now(); const r = lp0.apply(this, arguments); const ms = Number(now() - t0) / 1e6;
    const d = D();
    if (inFight) { d.lp++; d.lpMs += ms; if (!r) d.lpFail++; if (cur) { cur.n++; const k = sx + ',' + sy + '>' + gx + ',' + gy; if (cur.keys.has(k)) d.lpRepeat++; cur.keys.add(k); } }
    else d.lpOut++;
    flush(false);
    return r;
  };
  const wrap = () => {
    if (wrapped || !VIL) return; try { S = VIL.__p3Bind({}).state; } catch (e) { return; } if (!S || !S.warLive) return; wrapped = true;
    const WL = S.warLive, st = WL.stepFight;
    WL.stepFight = function (f) {
      inFight++; cur = { n: 0, keys: new Set() };
      const t0 = now(); let r; try { r = st.apply(this, arguments); } finally { inFight--; }
      const ms = Number(now() - t0) / 1e6, d = D();
      d.ticks++; d.ms += ms; if (ms > d.max) d.max = ms;
      let i = 0; while (i < BUCK.length - 1 && ms > BUCK[i]) i++; d.hist[i]++;
      if (cur.n > d.lpMaxPerTick) d.lpMaxPerTick = cur.n;
      const us = f && f.ctx ? f.ctx.units : []; let a = 0; for (const u of us) if (u.hp > 0) a++; d.units = Math.max(d.units, a);
      if (ms > 200 && rec.top.length < 60) rec.top.push({ day: day(), ms: +ms.toFixed(1), lp: cur.n, uniq: cur.keys.size, alive: a, state: f && f.state });
      cur = null;
      flush(false);
      return r;
    };
  };
  // villages 모듈이 실리는 순간을 잡는다(존이 require 한 그 객체)
  const Module = require('module'), load0 = Module._load;
  Module._load = function (req) { const m = load0.apply(this, arguments); if (!VIL && /villages(\.js)?$/.test(req) && m && m.__p3Bind) { VIL = m; } return m; };
  const iv = setInterval(() => flush(true), 5000); if (iv.unref) iv.unref();
  process.on('exit', () => flush(true));
}
