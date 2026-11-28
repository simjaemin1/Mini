'use strict';
// (@regress 없음 — 러너 밖 귀 · T1485)
// =============================================================================
// scripts/t1485-observer.js — 읽기만 하는 귀(제품 코드 · 하네스 손 0). `NODE_OPTIONS=--require scripts/t1485-observer.js` 로만 건다(존 프로세스에서만 산다).
//   곁 마을 표시 `_memberNearVid` 를 **언제 · 누가** 쓰는지 한 줄씩 `$T1485_LOG`(기본 /tmp/t1485-obs.jsonl)에 적는다.
//   ① Object.prototype 에 안 세어지는(enumerable:false) 접근자 하나 — 처음 쓰는 순간 그 몸에 **같은 값을 들고 있는 접근자**를 달아 두고(읽기 = 값 · 안 쓴 몸은 undefined 그대로 ·
//      JSON · 나열은 종전과 같다) 쓸 때마다 부른 자리(스택)·값·몸의 자리·영토 판정을 적는다. 값을 바꾸지 않는다(쓴 값 그대로 저장).
//   ② ws 서버 'connection' 에서 그 ws 의 'message' 귀를 껍데기로 감싼다(존이 `removeAllListeners` 로 앞 귀를 지워서) — 마을 · 순간이동 · 채팅 메시지의 도착(시각 · 마을 장부 마감 중인가)만 적는다(메시지는 안 만진다 · 원 귀를 같은 인자로 그대로 부른다).
//   ③ Membership.handleChat 를 감싼다(`/인출` 일 때만 호출 전 자리 · 표시 · 몸 번호를 적고 원본을 그대로 부른다 · 인자 · 반환 그대로).
//   ④ 이벤트 루프 지연은 perf_hooks.monitorEventLoopDelay(히스토그램 · JS 타이머 0)로 적는다.
//   모든 쓰기는 try/catch — 귀가 죽어도 판은 돈다. 모듈은 미리 안 부른다(`Module.prototype.require` 로 앱이 제 손으로 부른 뒤에 감싼다 — 부르는 차례가 안 바뀐다).
// =============================================================================
try {
  if (/zone\.js$/.test(String(process.argv[1] || ''))) {
    const fs = require('fs');
    const Module = require('module');
    const { monitorEventLoopDelay } = require('perf_hooks');
    const OUT = process.env.T1485_LOG || '/tmp/t1485-obs.jsonl';
    const T0 = Date.now();
    let VIL = null, wsWrapped = false, memWrapped = false;
    const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
    const lagMax = () => { const m = Math.round(h.max / 1e6); h.reset(); return m; };
    const put = (o) => { try { o.t = Date.now() - T0; fs.appendFileSync(OUT, JSON.stringify(o) + '\n'); } catch (e) { /* 귀는 판을 건드리지 않는다 */ } };
    const ids = new WeakMap(); let idSeq = 0;
    const idOf = (o) => { if (!o || (typeof o !== 'object' && typeof o !== 'function')) return null; let v = ids.get(o); if (!v) { v = ++idSeq; ids.set(o, v); } return v; };
    const busy = () => { try { return VIL && VIL.villagesBusy ? !!VIL.villagesBusy() : null; } catch (e) { return null; } };
    const terr = (x, y) => {
      const o = { cell: [Math.floor(x / 32), Math.floor(y / 32)], terr: null, near: [] };
      try { if (VIL && VIL.villageOfCell) { const v = VIL.villageOfCell(o.cell[0], o.cell[1]); o.terr = v ? (v.id != null ? v.id : (v.dbId != null ? v.dbId : 'x')) : 0; } } catch (e) { o.terr = 'err'; }
      try {
        if (VIL && VIL.villageByDbId && VIL.villageAnchorPx && VIL.villageWithdrawGate) {
          for (let id = 1; id <= 6; id++) {
            const v = VIL.villageByDbId(id); if (!v) continue;
            const a = VIL.villageAnchorPx(v), d = Math.round(Math.hypot(a.x - x, a.y - y));
            if (d > 600) continue;
            const g = VIL.villageWithdrawGate(id, x, y);
            o.near.push({ vid: id, d, gate: g && g.err ? String(g.err).slice(0, 24) : 'ok' });
          }
        }
      } catch (e) { /* */ }
      return o;
    };
    const stack = () => {
      try {
        const lines = String(new Error().stack || '').split('\n').slice(2);
        const out = [];
        for (const l of lines) {
          if (/t1485-observer/.test(l)) continue;
          const m = /at (?:(\S+) )?\(?.*?([\w.-]+\.js):(\d+):\d+\)?/.exec(l);
          if (!m) continue;
          if (/node:internal|node_modules/.test(l)) continue;
          out.push(`${m[1] || '-'}@${m[2]}:${m[3]}`);
          if (out.length >= 7) break;
        }
        return out;
      } catch (e) { return []; }
    };
    // ① 접근자 — 처음 쓰는 순간 몸에 같은 값의 접근자를 단다
    const KEY = '_memberNearVid';
    Object.defineProperty(Object.prototype, KEY, {
      configurable: true, enumerable: false,
      get() { return undefined; },
      set(v) {
        let store = v;
        try {
          Object.defineProperty(this, KEY, {
            configurable: true, enumerable: true,
            get() { return store; },
            set(nv) { put(Object.assign({ k: 'set', body: idOf(this), pid: this.pid, val: nv == null ? null : nv, prev: store == null ? null : store, x: Math.round(this.x), y: Math.round(this.y), busy: busy(), lag: lagMax(), stack: stack() }, terr(this.x, this.y))); store = nv; },
          });
          put(Object.assign({ k: 'set', first: 1, body: idOf(this), pid: this.pid, val: v == null ? null : v, prev: null, x: Math.round(this.x), y: Math.round(this.y), busy: busy(), lag: lagMax(), stack: stack() }, terr(this.x, this.y)));
        } catch (e) { try { Object.defineProperty(this, KEY, { value: v, writable: true, configurable: true, enumerable: true }); } catch (e2) { /* */ } }
      },
    });
    const origReq = Module.prototype.require;
    Module.prototype.require = function (id) {
      const m = origReq.apply(this, arguments);
      try {
        const f = Module._resolveFilename(id, this);
        if (/server[\\/]villages\.js$/.test(f)) VIL = m;
        if (!wsWrapped && id === 'ws' && m && m.Server && m.Server.prototype) {
          wsWrapped = true;
          const oe = m.Server.prototype.emit;
          m.Server.prototype.emit = function (ev, ws) {
            try {
              if (ev === 'connection' && ws && typeof ws.prependListener === 'function') {
                const wid = idOf(ws);
                put({ k: 'conn', ws: wid });
                const look = (raw) => {
                  try {
                    const s = raw && raw.toString ? raw.toString() : '';
                    const mm = /"type":"(village_brief|village_view|village_trade|teleport_debug|chat)"/.exec(s);
                    if (!mm) return;
                    const j = JSON.parse(s);
                    const o = { k: 'msg', ws: wid, type: mm[1], busy: busy(), lag: lagMax() };
                    if (mm[1] === 'teleport_debug') { o.x = j.x | 0; o.y = j.y | 0; }
                    else if (mm[1] === 'chat') { o.text = String(j.text || j.msg || '').slice(0, 20); if (!/^\s*\//.test(o.text)) return; }
                    else o.vid = j.vid;
                    put(o);
                  } catch (e) { /* */ }
                };
                //   존이 `removeAllListeners('message')` 로 앞 귀를 지우므로 — 'message' 귀를 **다는 순간** 같은 인자로 부르는 껍데기로 감싼다(원 귀는 그대로 · 같은 this · 같은 인자 · 같은 반환).
                const on0 = ws.on;
                ws.on = function (evn, fn) {
                  if (evn === 'message' && typeof fn === 'function' && !fn.__t1485) {
                    const w = function (raw) { look(raw); return fn.apply(this, arguments); };
                    w.__t1485 = 1;
                    return on0.call(this, evn, w);
                  }
                  return on0.apply(this, arguments);
                };
              }
            } catch (e) { /* */ }
            return oe.apply(this, arguments);
          };
        }
        if (!memWrapped && /server[\\/]membership\.js$/.test(f) && m && typeof m.handleChat === 'function') {
          memWrapped = true;
          const orig = m.handleChat;
          m.handleChat = function (player, text) {
            try {
              if (player && String(text || '').trim().startsWith('/인출')) {
                put(Object.assign({ k: 'chat', text: String(text).slice(0, 12), body: idOf(player), pid: player.pid, nearVid: player._memberNearVid == null ? null : player._memberNearVid, x: Math.round(player.x), y: Math.round(player.y), busy: busy(), lag: lagMax() }, terr(player.x, player.y)));
              }
            } catch (e) { /* */ }
            return orig.apply(this, arguments);
          };
        }
      } catch (e) { /* 없어도 판은 돈다 */ }
      return m;
    };
  }
} catch (e) { /* 없어도 판은 돈다 */ }
