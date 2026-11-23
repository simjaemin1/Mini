#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1436 판 자 · 제품 무변 · 판정 0)
// === scripts/t1436-run.js — 이어 도는 판 자(`t1308-long-run.js`)를 CLI · env 로만 부르고, 바깥에서 마디마다 **부팅 초 · RSS** 를 잰다 ===
//   node scripts/t1436-run.js --days 30 --seed 1020 --every 1 --dir /tmp/t1436/a --tag a [--frac 0.35] [--body]
//     --every N  마디 길이(30 = 한 번에 돈 판 · 1 = 날마다 저장하고 다시 뜸) — `t1308-long-run --every` 그대로
//     --frac f   마디 끝을 하루 경계가 아니라 그다음 날의 f 몫에서 낸다(프리로드 `t1436-shift-stop.js` · `T1436_STOP_FRAC`)
//     --inert    `t1436-shift-stop.js` 를 싣되 몫을 안 준다(프리로드 무변 확인용)
//     --body     몸 세계 = T1382 판 꼴(`T577_BODY=1` — 하루 24분 · 몸 상한 없음 · 캐러밴 0 · 가상 시계) + `T1331_BEAST_BODY=1`
//   판 조건(끔 세계 · T1420 서버 판 꼴): T745_VCLOCK=1 VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 · 둘 다 `T1308_KEEP=0`(판 자 잇기 훅 끔 = 제품 재기동만 · T1382 꼴).
//   관찰기(읽기만 · 기존): t650-print(econ 날 지문 · 마을마다 인구) · t740-side-hook(마을 칸 지문 — 자가 늘 싣는다) · t1308-bodyprint(몸 자리).
//   잼(바깥 — 아이 프로세스에 아무것도 안 싣는다): 300ms 마다 /proc 에서 존 아이(부모 = long-run)의 VmRSS · VmHWM, 마디 로그(`seg-<날>.log`)의
//     만든 시각 → `zone server up on` 줄을 본 시각(부팅 초) → `[t745] 가상 시계 돈다` 줄(첫 틱 앞)까지.
//   ⇒ <dir>/t1436-boot.json { segs:[{ from, upSec, clockSec, rssUpMB, hwmMB, rssLastMB, pid }] , sec, code }
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const DAYS = parseInt(opt('days', '30'), 10), SEED = parseInt(opt('seed', '1020'), 10), EVERY = parseInt(opt('every', '1'), 10);
const DIR = path.resolve(opt('dir', `/tmp/t1436/run-${SEED}`)), TAG = opt('tag', 'r'), FRAC = opt('frac', null);
const BODY = A.includes('--body'), INERT = A.includes('--inert');
if (!(DAYS > 0 && SEED > 0 && EVERY > 0)) { console.error('쓰는 법: t1436-run.js --days N --seed S --every K --dir D --tag T [--frac f] [--inert] [--body]'); process.exit(2); }
const S = __dirname;
const env = Object.assign({}, process.env, { T745_VCLOCK: '1', VILLAGE_CARAVAN_MAX: '0', T1308_KEEP: '0' });
if (BODY) Object.assign(env, { T577_BODY: '1', T1331_BEAST_BODY: '1' }); else env.T400_BUILD_ACT = '0';
const pre = ['t650-print.js', 't1308-bodyprint.js'].concat(FRAC || INERT ? ['t1436-shift-stop.js'] : []).map((f) => `-r ${path.join(S, f)}`);
env.NODE_OPTIONS = pre.join(' ');
if (FRAC) env.T1436_STOP_FRAC = String(FRAC); else delete env.T1436_STOP_FRAC;
fs.mkdirSync(DIR, { recursive: true });
const OUT = path.join(DIR, 't1436-boot.json');
const t0 = Date.now();
console.log(`=== T1436 판 — ${BODY ? '몸 세계' : '끔 세계'} · 시드 ${SEED} · ${DAYS}날 · 마디 ${EVERY} · 멈추는 때 ${FRAC ? '다음 날 ' + FRAC + ' 몫' : '하루 경계'}${INERT ? ' · 프리로드만(몫 없음)' : ''} · ${DIR}`);
const kid = spawn(process.execPath, [path.join(S, 't1308-long-run.js'), String(DAYS), String(SEED), '--every', String(EVERY), '--dir', DIR, '--tag', TAG], { env, stdio: ['ignore', 'inherit', 'inherit'] });

const segs = new Map();   // from → 잰 것
const MB = (kb) => +(kb / 1024).toFixed(1);
function procStatus(pid) { try { const t = fs.readFileSync(`/proc/${pid}/status`, 'utf8'); const g = (k) => { const m = t.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm')); return m ? +m[1] : null; }; return { rss: g('VmRSS'), hwm: g('VmHWM') }; } catch (e) { return null; } }
function kids(ppid) { const o = []; for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { const s = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); const r = s.slice(s.lastIndexOf(')') + 2).split(' '); if (+r[1] === ppid) o.push(+d); } catch (e) {} } return o; }
function poll() {
  let logs = []; try { logs = fs.readdirSync(DIR).map((f) => f.match(/^seg-(\d+)\.log$/)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b); } catch (e) {}
  for (const from of logs) {
    let g = segs.get(from);
    const lf = path.join(DIR, `seg-${from}.log`);
    if (!g) { let born = Date.now(); try { const st = fs.statSync(lf); born = st.birthtimeMs > 0 ? st.birthtimeMs : born; } catch (e) {} g = { from, born, off: 0, tail: '', upAt: null, clockAt: null, pid: null, rssUp: null, hwm: null, rssLast: null }; segs.set(from, g); }
    if (from === logs[logs.length - 1] || g.clockAt == null) {   // 로그를 이어 읽는다(부팅 줄 둘 · 그 뒤 econ 날 줄 — 날마다 그 순간 RSS)
      try { const st = fs.statSync(lf); if (st.size > g.off) { const fd = fs.openSync(lf, 'r'), n = Math.min(st.size - g.off, 8 << 20), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, g.off); fs.closeSync(fd); g.off += n;
        const s = g.tail + b.toString('utf8'); const now = Date.now();
        if (g.upAt == null && s.includes('zone server up on')) g.upAt = now;
        if (g.clockAt == null && s.includes('[t745] 가상 시계 돈다')) g.clockAt = now;
        for (const m of s.matchAll(/마을 econ day (\d+):/g)) { const d = +m[1]; if (!g.dayRss) g.dayRss = {}; if (!(d in g.dayRss)) { const q = g.pid ? procStatus(g.pid) : null; g.dayRss[d] = q && q.rss != null ? MB(q.rss) : null; } }
        g.tail = s.slice(-400); } } catch (e) {}
    }
  }
  const last = logs.length ? segs.get(logs[logs.length - 1]) : null;
  if (last) {
    const ps = kids(kid.pid);
    if (ps.length) { const pid = ps[0]; if (last.pid == null) last.pid = pid; if (last.pid === pid) { const q = procStatus(pid); if (q && q.rss != null) { last.rssLast = q.rss; last.hwm = q.hwm; if (last.upAt != null && last.rssUp == null) last.rssUp = q.rss; } } }
  }
}
function dump(code) {
  const rows = [...segs.values()].sort((a, b) => a.from - b.from).map((g) => ({ from: g.from, upSec: g.upAt != null ? +((g.upAt - g.born) / 1000).toFixed(1) : null, clockSec: g.clockAt != null ? +((g.clockAt - g.born) / 1000).toFixed(1) : null,
    rssUpMB: g.rssUp != null ? MB(g.rssUp) : null, hwmMB: g.hwm != null ? MB(g.hwm) : null, rssLastMB: g.rssLast != null ? MB(g.rssLast) : null, pid: g.pid, dayRss: g.dayRss || null }));
  let stops = null;
  if (code != null) {   // 끝에 한 번 — 멈춤 덤프(마디 끝)마다 멈춘 V · 마을 날 · 하늘 몫(덤프는 크다 · 표에는 이것만)
    let W = null; try { W = require(path.join(__dirname, '..', 'server', 'zone-config')).WORLD; } catch (e) {}
    stops = [];
    for (const f of fs.readdirSync(DIR).filter((x) => /^stop-\d+\.json$/.test(x))) { try { const o = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      stops.push({ seg: +f.match(/\d+/)[0], tag: o.tag, at: o.at, worldDay: o.worldDay, lastGameDay: o.lastGameDay, gameDayNow: o.gameDayNow, drainMs: o.drainMs, sky: W ? +(((o.at - (W.worldEpoch || 0)) % W.dayLengthMs) / W.dayLengthMs).toFixed(4) : null,
        dayFrac: o.dayMs ? +(((o.at - (o.epoch || 0)) % o.dayMs) / o.dayMs).toFixed(4) : null, t1436: o.t1436 || null }); } catch (e) {} }
    stops.sort((a, b) => a.seg - b.seg);
  }
  fs.writeFileSync(OUT, JSON.stringify({ card: 'T1436', days: DAYS, seed: SEED, every: EVERY, frac: FRAC ? +FRAC : null, inert: INERT, body: BODY, env: { NODE_OPTIONS: env.NODE_OPTIONS, T1436_STOP_FRAC: env.T1436_STOP_FRAC || null }, segs: rows, stops, sec: +((Date.now() - t0) / 1000).toFixed(1), code }, null, 1));
}
const iv = setInterval(poll, 300);
const iv2 = setInterval(() => dump(null), 30000);
kid.on('exit', (code) => { clearInterval(iv); clearInterval(iv2); poll(); dump(code); console.log(`=== T1436 판 끝 — 코드 ${code} · ${((Date.now() - t0) / 1000).toFixed(0)}초 · ${OUT}`); process.exit(code == null ? 1 : code); });
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { try { kid.kill(s); } catch (e) {} });
