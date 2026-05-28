// 자동 e2e 테스트 — 두 클라이언트를 띄워서:
// 1. 한국에 접속해서 welcome 받기
// 2. 다른 플레이어가 보이는지 확인
// 3. 채집 시도해서 인벤토리 늘어나는지
// 4. 동쪽(일본)으로 계속 이동 → 핸드오프 발생 → 일본 서버에 다시 접속
// 5. 인벤토리가 핸드오프 후에도 유지되는지

const WebSocket = require('ws');

const ZONES = {
  china: 'ws://localhost:3001',
  korea: 'ws://localhost:3002',
  japan: 'ws://localhost:3003',
};

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${name}`); pass++; }
  else      { console.log(`  ❌ ${name}  ${detail}`); fail++; }
}

class FakeClient {
  constructor(name) {
    this.name = name;
    this.ws = null;
    this.state = { resources: [], claims: [], players: [], inventory: { wood: 0, stone: 0 }, zone: null, pid: null, self: { x: 0, y: 0 } };
    this.events = [];
    this.handoffsObserved = 0;
  }
  connect(zoneId, transfer = null) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams();
      params.set('name', this.name);
      if (transfer) {
        params.set('x', transfer.x);
        params.set('y', transfer.y);
        params.set('inv', encodeURIComponent(JSON.stringify(transfer.inventory)));
      }
      const url = `${ZONES[zoneId]}/?${params.toString()}`;
      this.ws = new WebSocket(url);
      let resolved = false;
      this.ws.on('open', () => {});
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        this.events.push(msg.type);
        if (msg.type === 'welcome') {
          this.state.zone = msg.zone;
          this.state.pid = msg.pid;
          this.state.resources = msg.resources;
          this.state.claims = msg.claims;
          this.state.inventory = msg.inventory;
          this.state.self = msg.self;
          if (!resolved) { resolved = true; resolve(); }
        } else if (msg.type === 'tick') {
          this.state.players = msg.players;
          const me = msg.players.find(p => p.pid === this.state.pid);
          if (me) this.state.self = { x: me.x, y: me.y };
        } else if (msg.type === 'inventory') {
          this.state.inventory = msg.inventory;
        } else if (msg.type === 'resource_removed') {
          this.state.resources = this.state.resources.filter(r => r.id !== msg.id);
        } else if (msg.type === 'resource_update') {
          const r = this.state.resources.find(x => x.id === msg.id);
          if (r) r.hp = msg.hp;
        } else if (msg.type === 'handoff') {
          this.handoffsObserved++;
          this.ws.close();
          this.connect(msg.targetZone, { x: msg.x, y: msg.y, inventory: msg.inventory });
        }
      });
      this.ws.on('error', (e) => { if (!resolved) { resolved = true; reject(e); } });
      setTimeout(() => { if (!resolved) reject(new Error('welcome timeout')); }, 3000);
    });
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  move(vx, vy) {
    this._vx = vx; this._vy = vy;
    this.send({ type: 'input', vx, vy });
    // 서버 입력 타임아웃(1초) 회피용으로 300ms 마다 재전송
    if (this._moveTimer) clearInterval(this._moveTimer);
    if (vx !== 0 || vy !== 0) {
      this._moveTimer = setInterval(() => this.send({ type: 'input', vx: this._vx, vy: this._vy }), 300);
    }
  }
  gather() { this.send({ type: 'gather' }); }
  claim() { this.send({ type: 'claim' }); }
  close() { if (this._moveTimer) clearInterval(this._moveTimer); try { this.ws.close(); } catch (e) {} }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// === Observer 모드 별도 테스트 ===
async function testObserver() {
  console.log('\n[5] Observer 모드');
  return new Promise((resolve) => {
    const params = new URLSearchParams();
    params.set('observer', '1');
    const url = `${ZONES.korea}/?${params.toString()}`;
    const ws = new WebSocket(url);
    let welcomeMsg = null;
    let tickCount = 0;
    let sawRealPlayer = false;
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'welcome') welcomeMsg = m;
      else if (m.type === 'tick') {
        tickCount++;
        if (m.players.some(p => p.name === '진짜플레이어')) sawRealPlayer = true;
      }
    });
    ws.on('open', async () => {
      await sleep(200);
      check('observer welcome 받음', welcomeMsg !== null);
      check('observer 플래그 true', welcomeMsg?.observer === true);
      check('welcome에 worldOffsetX 포함', welcomeMsg?.zone?.worldOffsetX === 2048,
            `offset=${welcomeMsg?.zone?.worldOffsetX}`);

      // 진짜 플레이어를 같은 존(한국)에 띄움 — observer가 그 사람의 tick을 받아야 함
      const player = new FakeClient('진짜플레이어');
      await player.connect('korea');
      await sleep(800);
      check('observer가 실제 플레이어의 tick을 봄', sawRealPlayer, `tickCount=${tickCount}, sawReal=${sawRealPlayer}`);

      // observer가 플레이어 목록에는 안 들어가야 함 (그 플레이어의 시각에서)
      check('observer는 플레이어 목록에 안 잡힘', !player.state.players.some(p => p.name === '관찰자'));

      player.close();
      ws.close();
      resolve();
    });
    ws.on('error', (e) => { check('observer 접속', false, e.message); resolve(); });
  });
}

(async () => {
  console.log('\n=== e2e test 시작 ===\n');

  // 1. 두 클라이언트 한국 접속
  console.log('[1] 한국 존 동시 접속');
  const a = new FakeClient('알파');
  const b = new FakeClient('베타');
  await a.connect('korea');
  await b.connect('korea');
  check('알파 welcome 받음', a.state.zone?.id === 'korea');
  check('베타 welcome 받음', b.state.zone?.id === 'korea');
  check('알파 자원 받음', a.state.resources.length > 0, `count=${a.state.resources.length}`);

  // 2. 상호 인식 (tick에서 서로 보여야 함)
  await sleep(500);
  check('알파가 베타를 봄', a.state.players.some(p => p.name === '베타'));
  check('베타가 알파를 봄', b.state.players.some(p => p.name === '알파'));

  // 3. 채집 — 알파가 가장 가까운 자원 옆으로 이동 후 채집
  console.log('\n[2] 채집');
  const myPos = a.state.self;
  const nearest = a.state.resources
    .map(r => ({ r, d: Math.hypot(r.x - myPos.x, r.y - myPos.y) }))
    .sort((x, y) => x.d - y.d)[0];
  // 자원 옆으로 텔레포트는 못하니, 자원 방향으로 이동
  const dx = nearest.r.x - myPos.x, dy = nearest.r.y - myPos.y;
  const len = Math.hypot(dx, dy);
  a.move(dx / len, dy / len);
  // 가까워질 때까지 대기
  for (let i = 0; i < 30; i++) {
    await sleep(150);
    const d = Math.hypot(nearest.r.x - a.state.self.x, nearest.r.y - a.state.self.y);
    if (d < 40) break;
  }
  a.move(0, 0);
  const beforeWood = a.state.inventory.wood, beforeStone = a.state.inventory.stone;
  // 4번 채집 시도 (hp 3~4 이면 깰 수 있음)
  for (let i = 0; i < 5; i++) { a.gather(); await sleep(150); }
  const gained = (a.state.inventory.wood - beforeWood) + (a.state.inventory.stone - beforeStone);
  check('채집으로 인벤토리 증가', gained >= 1, `gained=${gained}, inv=${JSON.stringify(a.state.inventory)}`);

  // 4. 핸드오프 — 알파가 동쪽으로 끝까지 이동 → 일본으로 넘어감
  console.log('\n[3] 한국 → 일본 핸드오프');
  const invBeforeHandoff = JSON.parse(JSON.stringify(a.state.inventory));
  a.move(1, 0);
  // 핸드오프 이벤트 대기 (최대 15초)
  let timer = 0;
  while (a.handoffsObserved === 0 && timer < 15000) {
    await sleep(200); timer += 200;
  }
  check('핸드오프 메시지 수신', a.handoffsObserved >= 1, `count=${a.handoffsObserved}`);
  await sleep(500); // 새 존 welcome 대기
  check('알파가 일본 존에 접속됨', a.state.zone?.id === 'japan', `zone=${a.state.zone?.id}`);
  check('인벤토리 유지됨 (wood)', a.state.inventory.wood === invBeforeHandoff.wood, `before=${invBeforeHandoff.wood}, after=${a.state.inventory.wood}`);
  check('인벤토리 유지됨 (stone)', a.state.inventory.stone === invBeforeHandoff.stone, `before=${invBeforeHandoff.stone}, after=${a.state.inventory.stone}`);
  check('알파 위치가 일본 서쪽 경계 근처', a.state.self.x < 250, `x=${a.state.self.x}`);

  // 5. 베타도 보낼 수 있는지 — 베타가 서쪽으로 이동 → 중국으로
  console.log('\n[4] 한국 → 중국 핸드오프 (베타)');
  const bInvBefore = JSON.parse(JSON.stringify(b.state.inventory));
  b.move(-1, 0);
  timer = 0;
  while (b.handoffsObserved === 0 && timer < 15000) {
    await sleep(200); timer += 200;
  }
  check('베타 핸드오프 발생', b.handoffsObserved >= 1);
  await sleep(500);
  check('베타가 중국 존에 접속됨', b.state.zone?.id === 'china', `zone=${b.state.zone?.id}`);

  // 6. 분리된 존에서는 서로 안 보임
  await sleep(500);
  check('알파(일본)는 베타(중국)를 못 봄', !a.state.players.some(p => p.name === '베타'));

  // 7. Observer 모드
  await testObserver();

  console.log('\n=== 결과 ===');
  console.log(`✅ pass=${pass}   ❌ fail=${fail}`);

  a.close(); b.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('테스트 중 오류:', e); process.exit(2); });
