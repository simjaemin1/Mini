# 분산 배포 가이드 — 5국가 VPS

durango-mini를 실제로 5개 국가의 VPS에 배포하는 방법.
시뮬레이션이 아니라 진짜 지연으로 도는 분산 게임 서버를 만든다.

## 0. 큰 그림

총 **6개 VM** 필요:
- 중앙 1대: `central.example.com` (인증·거래소). 한국에 두는 게 무난.
- zone 5대: `fr / cn / kr / jp / us . example.com` (각 국가)

플레이어는 가장 가까운 zone에 직접 WebSocket으로 붙고, zone들끼리는 HTTPS로 핸드오프, 인증·거래는 central으로.

## 1. VPS 제공자 결정

다음 중 하나 고르면 됨. 추천도 순:

| 제공자 | 5개 리전 가능? | 월 비용(약) | 비고 |
|---|---|---|---|
| **Vultr** | FR, JP, KR(Seoul), US, SG(중국 대체) | ~$30 ($5×5+central) | 한국 리전 있어서 추천 |
| **DigitalOcean** | FR, JP, SG(중국 대체), US, IN | ~$30 | 한국·중국 없음 — SG/IN으로 대체 |
| **AWS Lightsail** | FR(eu-west-3), TYO(ap-northeast-1), Seoul(ap-northeast-2), US(us-west), MUM | ~$25 | 결제·청구 복잡, 무료 티어 활용 가능 |
| **Hetzner** | FR, FIN, US, SG, 일본 없음 | ~$20 | 가장 저렴, 다만 리전 적음 |

> **중국 리전:** 실제 중국 본토 VPS는 ICP 라이센스 필요. 우회로 싱가포르(SG)나 홍콩(HK)을 "중국" zone으로 사용.

이 가이드는 **Vultr** 기준으로 작성 (가장 직관적).

## 2. VPS 5+1 프로비저닝 (Vultr)

각 VM 사양: **1 vCPU / 1GB RAM / 25GB SSD** 충분.

1. https://www.vultr.com 가입, 결제 등록.
2. Deploy New Server → Cloud Compute → Regular Performance.
3. 위치별로 한 대씩:
   - Paris → `france`
   - Singapore (or Hong Kong) → `china`
   - Seoul → `korea` + `central` (한국에 둘 다)
   - Tokyo → `japan`
   - Los Angeles → `usa`
4. OS: **Ubuntu 22.04 LTS**.
5. SSH 키 등록 (없으면 `ssh-keygen` 먼저).
6. Hostname: `durango-{zone}` (예: `durango-korea`).
7. 30초 정도 기다리면 IP 할당됨. 메모.

## 3. 도메인 + DNS

도메인 1개 사면 됨 (~$10/년):
- Cloudflare Registrar, Namecheap, GoDaddy 등 어디나.
- 예: `example.com` 샀다 치고.

DNS A 레코드 설정 (각 VPS IP를 가리키게):

```
fr.example.com       A  <france VPS IP>
cn.example.com       A  <china VPS IP>
kr.example.com       A  <korea VPS IP>
jp.example.com       A  <japan VPS IP>
us.example.com       A  <usa VPS IP>
central.example.com  A  <central VPS IP>
```

> Cloudflare 쓰면 **proxy 끄기 (orange cloud → grey)** — WebSocket이 cloudflare proxy 통과 안 됨.

## 4. 각 VPS 공통 셋업

각 6개 VM에 SSH 접속해서 다음 실행:

```bash
# 도커 설치 (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 방화벽 — SSH + HTTP/HTTPS + zone WS 포트
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw allow 3001:3010/tcp   # zone 포트 + central
sudo ufw enable

# 데이터 디렉토리
sudo mkdir -p /srv/durango
sudo chown $USER:$USER /srv/durango
```

## 5. 코드 배포

방법 A — GitHub 사용 (추천):
```bash
# 로컬에서
cd /Users/simjaemin1/Mini/durango-mini
git init && git add . && git commit -m "Initial commit"
# GitHub에 private repo 만들고 push
git remote add origin git@github.com:USER/durango-mini.git
git push -u origin main

# 각 VPS에서
git clone https://github.com/USER/durango-mini.git
cd durango-mini
```

방법 B — rsync:
```bash
# 로컬 → 각 VPS
rsync -avz --exclude node_modules --exclude '*.db*' \
  /Users/simjaemin1/Mini/durango-mini/ user@kr.example.com:~/durango-mini/
```

## 6. central VPS 부팅 (kr 리전에)

`central.example.com` VM에서:

```bash
cd ~/durango-mini

# central 컨테이너 빌드 + 실행
docker build -f Dockerfile.central -t durango-central .

docker run -d \
  --name durango-central \
  --restart unless-stopped \
  -p 3010:3010 \
  -e PUBLIC_HOST=central.example.com \
  -e ZONE_HOSTS='{"france":"fr.example.com","china":"cn.example.com","korea":"kr.example.com","japan":"jp.example.com","usa":"us.example.com"}' \
  -e WS_PROTO=wss \
  -e HTTP_PROTO=https \
  -e CENTRAL_PORT=443 \
  -v /srv/durango:/data \
  -e DB_PATH=/data/central.db \
  durango-central

# 헬스 확인
curl -s http://localhost:3010/health
```

## 7. 각 zone VPS 부팅

`fr.example.com` (프랑스 VM)에서:

```bash
cd ~/durango-mini

docker build -f Dockerfile.zone -t durango-zone .

docker run -d \
  --name durango-zone-france \
  --restart unless-stopped \
  -p 3004:3004 \
  -e ZONE_ID=france \
  -e PORT=3004 \
  -e CENTRAL_HOST=central.example.com \
  -e CENTRAL_PORT=443 \
  -e HTTP_PROTO=https \
  -e WS_PROTO=wss \
  -e ZONE_HOSTS='{"france":"fr.example.com","china":"cn.example.com","korea":"kr.example.com","japan":"jp.example.com","usa":"us.example.com"}' \
  -e LATENCY_MS=0 \
  -v /srv/durango:/data \
  -e DB_PATH=/data/world-france.db \
  durango-zone

docker logs -f durango-zone-france
```

`ZONE_ID`와 `PORT`만 바꿔서 cn/kr/jp/us 5번 반복.

| zone | PORT |
|---|---|
| france | 3004 |
| china | 3001 |
| korea | 3002 |
| japan | 3003 |
| usa | 3005 |

## 8. SSL — Caddy 리버스 프록시

각 VPS에서 HTTPS·WSS 자동 발급:

```bash
# Caddy 설치
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Caddyfile (각 VPS마다 자기 도메인 한 줄)
sudo tee /etc/caddy/Caddyfile <<EOF
kr.example.com {
    reverse_proxy localhost:3002
}
EOF
# central VPS면:
# central.example.com {
#     reverse_proxy localhost:3010
# }

sudo systemctl reload caddy
```

도메인 첫 접속 시 Let's Encrypt가 자동으로 인증서 발급. 30초 정도 걸림.

## 9. 검증

브라우저에서:
```
https://central.example.com/
```

게임 로비가 뜨면 성공. 등록·로그인 후 동쪽으로 이동하면 zone 핸드오프 발생 — RTT가 시뮬레이션이 아니라 진짜 ping(파리→서울 280ms 등)이 됨.

**메트릭 확인:**
```bash
# 각 zone health
for h in fr cn kr jp us; do
  echo "=== $h ==="
  curl -s https://$h.example.com/health | head -c 200
  echo
done

# central
curl -s https://central.example.com/health
```

## 10. 실제 ping vs 시뮬레이션 비교

`zone-config.js`에 정의된 시뮬레이션 값:
- 한국→파리 RTT ~270ms
- 한국→베이징 RTT ~50ms
- 한국→도쿄 RTT ~30ms
- 한국→LA RTT ~180ms

실제 측정:
```bash
# 한국 VPS에서
ping -c 5 fr.example.com    # 실제 한→파리
ping -c 5 jp.example.com    # 실제 한→도쿄
```

대체로 시뮬레이션 값과 ±50ms 안에서 일치하면 적절. 클라가 RTT 뱃지 보면서 zone 핸드오프 시 실제로 latency가 바뀌는 것 체감 가능.

## 11. 장애 대응

```bash
docker logs durango-zone-korea --tail 100
docker restart durango-zone-korea
docker ps                        # 컨테이너 상태
```

zone 한 대 죽어도 다른 zone은 계속 동작. central 죽으면 신규 로그인만 막힘 (게임 중인 사람들은 계속).

## 12. 비용 정리

| 항목 | 월 비용 |
|---|---|
| Vultr 5 zone VM ($5×5) | $25 |
| Vultr central VM | $5 |
| 도메인 (월 환산) | $1 |
| **합계** | **~$31/월** |

처음 한 달은 무료 크레딧 받아 $0 가능.

---

## 부록: 환경변수 레퍼런스

### zone 서버
- `ZONE_ID`: france / china / korea / japan / usa
- `PORT`: 3001~3005
- `DB_PATH`: world-{zone}.db 경로
- `CENTRAL_HOST`, `CENTRAL_PORT`: central 위치
- `HTTP_PROTO`: http | https (zone↔central, zone↔zone)
- `WS_PROTO`: ws | wss (클라가 보는 zone URL)
- `ZONE_HOSTS`: JSON. zone마다 host. 예: `{"korea":"kr.example.com"}`
- `LATENCY_MS`: 시뮬레이션 latency. 프로덕션은 0.

### central 서버
- `PORT`: 3010
- `DB_PATH`: central.db 경로
- `PUBLIC_HOST`: 클라에 노출할 자기 호스트
- `ZONE_HOSTS`: 위와 동일 — publicZoneMap이 사용
- `HTTP_PROTO`, `WS_PROTO`: 위와 동일
