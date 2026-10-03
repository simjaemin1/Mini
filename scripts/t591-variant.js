// (@regress 없음 — 러너 밖 · T591 자 · 예비 적재 · 제품 무변)
// 닛폰 폭 W(zone-config base 단위 · 6000 | 7000)와 해안 띠 배수 k 를 **zone-config 원문에 얹어** 부른다(require 전에 원문 치환 · 세계가 한 벌로 맞물린다).
//   env T591_W   — 닛폰 폭(base). 함께 미는 칸: japan_pacific 폭 = W · nambingyang 폭 = 23000 + (W − 6000) · pacific 서쪽 끝 = 48000 + W · 폭 = 13000 − W
//   env T591_K   — 닛폰 `coastBandK`(없으면 정본 그대로 · 'none' 이면 칸을 지운다 = 배수 1)
//   쓰는 법: NODE_OPTIONS=--require=scripts/t591-variant.js T591_W=7000 T591_K=0.3 node <자>
'use strict';
const path = require('path');
const Module = require('module');
const W = process.env.T591_W ? +process.env.T591_W : null;
const K = process.env.T591_K || null;
const BW = process.env.T591_BW ? +process.env.T591_BW : null;   // 베링 폭(base) — pacific_arctic 이 같이 밀린다(서쪽 끝 41000 + BW · 폭 20000 − BW)
if (W || K || BW) {
  const _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(path.join('server', 'zone-config.js'))) {
      const rep = (re, to, what) => { if (!re.test(content)) throw new Error('[T591] zone-config 줄을 못 찾았다: ' + what); content = content.replace(re, to); };
      if (W) {
        rep(/(worldOffsetX: 48000, worldOffsetY: 5000, zoneWidth: )\d+(, zoneHeight: 13000,)/, `$1${W}$2`, 'nippon');
        rep(/(worldOffsetX: 48000, worldOffsetY: 18000, zoneWidth: )\d+(, zoneHeight: 13000,)/, `$1${W}$2`, 'japan_pacific');
        rep(/(worldOffsetX: 31000, worldOffsetY: 31000, zoneWidth: )\d+(, zoneHeight: 7000,)/, `$1${23000 + (W - 6000)}$2`, 'nambingyang');
        rep(/worldOffsetX: \d+, worldOffsetY: 5000, zoneWidth: \d+, zoneHeight: 33000,/, `worldOffsetX: ${48000 + W}, worldOffsetY: 5000, zoneWidth: ${13000 - W}, zoneHeight: 33000,`, 'pacific');
      }
      if (BW) {
        rep(/(worldOffsetX: 41000, worldOffsetY: 0, zoneWidth: )\d+(, zoneHeight: 5000,)/, `$1${BW}$2`, 'bering');
        rep(/worldOffsetX: \d+, worldOffsetY: 0, zoneWidth: \d+, zoneHeight: 5000,(\s*\n[^\n]*\n[^\n]*북큰바다)/, `worldOffsetX: ${41000 + BW}, worldOffsetY: 0, zoneWidth: ${20000 - BW}, zoneHeight: 5000,$1`, 'pacific_arctic');
      }
      if (K) {
        const re = /(\n  nippon: \{\n)/;
        content = content.replace(/\n    coastBandK: [\d.]+,[^\n]*/, '');
        if (K !== 'none') rep(re, `$1    coastBandK: ${+K},\n`, 'nippon 머리');
      }
    }
    return _c.call(this, content, filename);
  };
  process.stderr.write(`[T591] 예비 적재 — 닛폰 폭 ${W || '정본'} · 띠 배수 ${K || '정본'} · 베링 폭 ${BW || '정본'}\n`);
}
