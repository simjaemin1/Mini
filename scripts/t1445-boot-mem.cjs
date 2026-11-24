// (@regress 없음 — 계측 훅 · 러너 밖 · T1445 · 판정 0)
// === scripts/t1445-boot-mem.cjs — 살아 있는 세계 DB 로 띄운 존의 메모리 봉우리를 가른다(존 아이 프리로드 · 제품 무접촉 · 읽기만) ===
//   T1445_MEM_OUT=<파일>(%p = 프로세스) — 5초(T1445_EVERY)마다 rss · heapUsed · heapTotal · external · 한도(MB) 한 줄
//   T1445_LOGGC=1 + `--expose-gc` — 처음 T1445_LOGGC_S(70)초 동안 로그 줄마다 가득 수거 뒤 힙(산 몫) + 그 줄(동기 부팅의 어느 단계가 쥐는가)
//   T1445_META_OUT=<파일> — 생활층 T742 모듈 메모리 되돌림(부팅) · 꺼내기(경계 · 종료 저장)마다 이름 · 글자 크기 · 힙 차 · ms
//   T1445_NOW0=<ms> — 존 벽시계를 옮긴다(꺼진 시간 흉내 · 계측 전용)
'use strict';
const OUT = process.env.T1445_MEM_OUT, Z = /zone\.js$/.test(process.argv[1] || '');
if (Z && process.env.T1445_NOW0) {
  const real = Date.now.bind(Date), r0 = real(), n0 = +process.env.T1445_NOW0, _D = Date;
  Date.now = () => real() - r0 + n0;
  global.Date = class extends _D { constructor(...a) { if (a.length === 0) super(Date.now()); else super(...a); } static now() { return real() - r0 + n0; } };
}
if (Z && OUT) {
  const fs = require('fs'), v8 = require('v8'), hr = () => Number(process.hrtime.bigint() / 1000000n), t0 = hr(), f = OUT.replace('%p', String(process.pid));
  const put = (tag) => { const m = process.memoryUsage(), h = v8.getHeapStatistics(); try { fs.appendFileSync(f, JSON.stringify({ t: hr() - t0, tag, rss: m.rss >> 20, heap: m.heapUsed >> 20, tot: m.heapTotal >> 20, ext: m.external >> 20, lim: Math.round(h.heap_size_limit / 1048576) }) + '\n'); } catch (e) {} };
  put('start'); setInterval(() => put(''), +(process.env.T1445_EVERY || 5000)).unref();
  if (process.env.T1445_LOGGC && typeof global.gc === 'function') {
    const lim = +(process.env.T1445_LOGGC_S || 70) * 1000, ol = console.log;
    console.log = function (...a) { const r = ol.apply(this, a); try { if (hr() - t0 < lim) { const s = a.map(String).join(' '); if (!/NPC 스폰|교역로 A\*|GC 정지/.test(s)) { global.gc(); fs.appendFileSync(f + '.lg', (hr() - t0) + '\t' + (process.memoryUsage().heapUsed >> 20) + '\t' + s.slice(0, 120).replace(/\n/g, ' ') + '\n'); } } } catch (e) {} return r; };
  }
}
if (Z && process.env.T1445_META_OUT) {
  const MO = process.env.T1445_META_OUT, Module = require('module'), _c = Module.prototype._compile, VP = require('path').join('server', 'villages.js');
  const A = '  for (const [n, r] of _t742Reg) { try { o[n] = _t740Enc(r.get()); } catch (e) {} }', B = '  _t742Pend = Object.assign({}, x);';
  const SZ = "(function (v) { try { return v == null ? 0 : typeof v === 'string' ? v.length : JSON.stringify(v).length; } catch (e) { return -1; } })";
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(VP)) {
      const ok = content.split(A).length === 2 && content.split(B).length === 2;
      if (ok) {
        content = content.replace(A, `  for (const [n, r] of _t742Reg) { try { const _h0 = process.memoryUsage().heapUsed, _t0 = Date.now(); o[n] = _t740Enc(r.get()); require('fs').appendFileSync(${JSON.stringify(MO)}, JSON.stringify({ k: 'out', n, sz: ${SZ}(o[n]), dh: (process.memoryUsage().heapUsed - _h0) >> 20, ms: Date.now() - _t0 }) + '\\n'); } catch (e) {} }`);
        content = content.replace(B, `${B} try { for (const _k of Object.keys(x)) require('fs').appendFileSync(${JSON.stringify(MO)}, JSON.stringify({ k: 'in', n: _k, sz: ${SZ}(x[_k]) }) + '\\n'); } catch (e) {}`);
      }
      console.log('[T1445 메타 훅] ' + (ok ? '끼움' : '자리 없음 — 안 잰다'));
    }
    return _c.call(this, content, filename);
  };
}
