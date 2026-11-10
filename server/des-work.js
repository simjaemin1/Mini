'use strict';
// T1248: 시간/단위는 호출자가 준다. 모델 수치와 완료 효과를 복제하지 않는 사건 커널.
const { EventQueue, Facility } = require('./des');
class WorkSpan {
  constructor({ start, progress = 0, target, rate = 1 }) {
    if (![start, progress, target, rate].every(Number.isFinite) || rate < 0 || target < progress) throw new RangeError('invalid work span');
    Object.assign(this, { start, progress, target, rate });
  }
  at(now) { return Math.min(this.target, this.progress + Math.max(0, now - this.start) * this.rate); }
  get end() { return this.rate > 0 ? this.start + (this.target - this.progress) / this.rate : Infinity; }
  cut(now) { const p = this.at(now); this.start = Math.max(this.start, now); this.progress = p; return p; }
}
class BodyQueue {
  constructor() { this.heap = new EventQueue(); this.owned = new Map(); this.ready = new Map(); this.versions = new Map(); this.facilities = new Map(); this.tickets = new Map(); this.promoted = []; this.stats = { due: 0, canceled: 0, stale: 0, requests: 0, queued: 0 }; }
  add(id, body) { if (!this.owned.has(id)) this.ready.set(id, body); }
  remove(id) { this.cancel(id); this.ready.delete(id); this.release(id); }
  hold(id, body, time, state) {
    if (!Number.isFinite(time)) throw new RangeError('finite wake time required');
    const generation = (this.versions.get(id) || 0) + 1;
    this.versions.set(id, generation); this.ready.delete(id);
    this.owned.set(id, { time, generation, state });
    const eventId = this.heap.push(time, { id, generation });
    return eventId;
  }
  side(id, time, payload) { const old = this.owned.get(id); if (!old) return; this.heap.push(time, { id, generation: old.generation, side: payload }); }
  cancel(id) { const old = this.owned.get(id); if (old) { this.owned.delete(id); this.versions.set(id, old.generation + 1); this.stats.canceled++; } return old || null; }
  wake(id, body, now, callback) { const old = this.cancel(id); if (!old) return false; if (body) { callback(body, old.state, now); this.ready.set(id, body); } return true; }
  run(now, resolve, callback, side = () => {}) {
    return this.heap.runUntil(now, (time, event) => {
      const old = this.owned.get(event.id);
      if (!old || old.generation !== event.generation) { this.stats.stale++; return; }
      const body = resolve(event.id);
      if (!body) return; // 재시작 뒤 아직 바인딩 안 된 몸은 소유권을 잃지 않는다.
      if (event.side) { side(body, event.side, time); this.stats.side = (this.stats.side || 0) + 1; return; }
      this.owned.delete(event.id);
      callback(body, old.state, time); this.ready.set(event.id, body); this.stats.due++;
    });
  }
  request(id, key, capacity, now) {
    let f = this.facilities.get(key);
    if (!f) { f = new Facility(key, capacity); this.facilities.set(key, f); }
    const prev = this.tickets.get(id);
    if (prev && prev !== key) this.release(id);
    this.tickets.set(id, key); this.stats.requests++;
    const admitted = f.request(id, now); if (!admitted) this.stats.queued++;
    return admitted;
  }
  release(id) {
    const key = this.tickets.get(id); if (key == null) return null;
    this.tickets.delete(id); const f = this.facilities.get(key); const next = f ? f.release(id) : null; if (next != null) this.promoted.push(next); return next;
  }
  // 단순 값만. 몸과 콜백은 저장하지 않는다. 재시작 때 같은 ID의 몸을 다시 묶는다.
  save() {
    return JSON.parse(JSON.stringify({ version: 1, heap: { t: this.heap.t, s: this.heap.s, v: this.heap.v, seq: this.heap.seq },
      owned: [...this.owned], promoted: this.promoted, versions: [...this.versions], tickets: [...this.tickets],
      facilities: [...this.facilities].map(([key, f]) => [key, { cap: f.cap, busy: [...f.busy], q: f.q, seq: f.seq, served: f.served, maxQ: f.maxQ }]), stats: this.stats }));
  }
  static restore(saved) {
    saved = JSON.parse(JSON.stringify(saved));
    if (!saved || saved.version !== 1) throw new Error('unsupported DES snapshot');
    if (!saved.heap || !['t','s','v'].every(k => Array.isArray(saved.heap[k])) || saved.heap.t.length !== saved.heap.s.length || saved.heap.t.length !== saved.heap.v.length || !saved.heap.t.every(Number.isFinite)) throw new Error('invalid DES heap');
    const q = new BodyQueue(); Object.assign(q.heap, saved.heap);
    for (const k of ['owned', 'versions', 'tickets']) q[k] = new Map(saved[k]);
    for (const [key, v] of saved.facilities) { const f = new Facility(key, v.cap); Object.assign(f, v, { busy: new Set(v.busy) }); q.facilities.set(key, f); }
    q.promoted = saved.promoted || []; q.stats = saved.stats; return q;
  }
}
class Store {
  constructor(db, zone) {
    this.db = db; this.zone = zone;
    db.exec('CREATE TABLE IF NOT EXISTS des_work_state(zone TEXT PRIMARY KEY, payload TEXT NOT NULL)');
    this.put = db.prepare('INSERT INTO des_work_state(zone,payload) VALUES(?,?) ON CONFLICT(zone) DO UPDATE SET payload=excluded.payload');
    this.get = db.prepare('SELECT payload FROM des_work_state WHERE zone=?');
  }
  save(queue, bodies) {
    // 한 행 UPSERT가 queue+몸 스냅샷의 원자적 단위다.
    this.put.run(this.zone, JSON.stringify({ queue: queue.save(), bodies }));
  }
  load() { const row = this.get.get(this.zone); return row ? JSON.parse(row.payload) : null; }
}
module.exports = { WorkSpan, BodyQueue, Store };
