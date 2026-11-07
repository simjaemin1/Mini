# 3D 모델 보내는 곳 — 형이 읽을 안내

미니에 들어갈 3D 모델(짐승 · 건물 · 소품 …)은 이 폴더에 받습니다.
게임 안에는 3D 가 그대로 들어가지 않습니다. 재민 쪽에서 블렌더로 **8방향 그림**(스프라이트)을 구워 넣습니다.
그래서 모델은 **가볍고 · 실제 크기이고 · 움직임(동작)이 들어 있으면** 그대로 굽힙니다.

---

## 1. 어디에 두나 — 폴더

```
assets-src/models/<분류>/<이름>/
```

| 분류 | 무엇 |
|---|---|
| `animals` | 짐승(멧돼지 · 소 · 닭 …) |
| `buildings` | 집 · 곳간 |
| `props` | 마당 소품 · 가구 |
| `items` | 손에 드는 물건 |
| `nature` | 나무 · 풀 · 바위 |
| `crops` | 작물 |
| `char` | 사람 |

**이름** = 게임 속 이름(영어 소문자 · 밑줄). 짐승은 `public/animals.js` 의 이름을 씁니다 —
멧돼지 `wild_boar` · 소 `cow` · 닭 `chicken` · 사슴 `deer` · 늑대 `wolf` …

### 예시 — 멧돼지 한 마리

```
assets-src/models/animals/wild_boar/
├── wild_boar.glb     ← 모델 하나(텍스처까지 안에 든 .glb)
└── 출처.txt           ← 아래 4번
```

---

## 2. 받는 규격 — 이것만 맞춰 주세요

| 칸 | 규격 | 왜 |
|---|---|---|
| 형식 | **.glb**(FBX 도 받지만 .glb 가 좋습니다) | 텍스처까지 한 파일에 들어갑니다 |
| 파일 크기 | 한 파일 **25 MB 밑** | 깃허브 웹으로 올릴 수 있는 한도 · 아래 5번 |
| 면 수 | 삼각형 **2만 안팎**(3만 넘으면 다시) | 게임 그림은 짐승 한 마리가 손바닥만 합니다(멧돼지 가로 68px). 그 크기에서 50만 면과 2만 면은 눈으로 같습니다 |
| 면 줄이는 법 | **만든 도구에서 면 수를 정해 다시 뽑기**(리토폴로지 + 텍스처 다시 굽기) | 블렌더 "자동 줄이기"(Decimate)만 하면 텍스처 이음매가 어긋나 얼룩이 질 수 있습니다(면을 5천까지 줄이면 게임 크기에서도 보입니다) |
| 텍스처 | 가장 긴 변 **2048 이하**(색 · 요철 다) | 게임 크기에서 4096 과 2048 은 같은 그림이 됩니다 |
| 크기 | **실제 크기(미터)** — 멧돼지면 몸길이 1~2 m | 모든 짐승을 1 m 로 맞춰 뽑으면 닭과 소가 같은 크기가 됩니다. 1 m 로 뽑았으면 `출처.txt` 에 실제 크기를 적어 주세요 |
| 앞 | 머리가 **+Y** 를 보게. 다르면 `출처.txt` 에 `앞: -Y` 처럼 | 그림 8방향의 0번(동쪽 보기)을 맞추는 데 씁니다. 첫 PR 셋은 머리가 −Y 쪽이었습니다 — 그대로 두고 `앞: -Y` 라고만 적어도 됩니다 |
| 위 · 바닥 | 위가 하늘 · 발바닥이 바닥(높이 0) | |
| 뼈대 · 동작(짐승 · 사람) | 뼈대 + 동작 다섯: **idle**(서 있기) · **walk**(걷기) · **run**(뛰기) · **eat**(먹기) · **die**(쓰러지기) | 동작 이름이 그대로 그림 이름이 됩니다. 한글 이름(서 있기 · 걷기 · 뛰기 · 먹기 · 쓰러지기)도 알아듣습니다 |
| `출처.txt` | 같은 폴더에 하나 | 누가 · 무엇으로 만들었고 · 어디까지 써도 되는지 |

---

## 3. 동작은 이렇게

- 걷기 · 뛰기 · 서 있기는 **처음과 끝이 이어지게**(되풀이해도 튀지 않게).
- 먹기 · 쓰러지기는 한 번 하고 끝나는 동작이라 이어지지 않아도 됩니다.
- 길이는 실제 짐승 빠르기 그대로면 됩니다(재민 쪽 도구가 동작 길이에서 그림 넘기는 빠르기를 셉니다).

---

## 4. `출처.txt` — 이 칸을 채워 주세요

```
이름: 멧돼지 (wild_boar)
만든 사람: 예) 이름 (GitHub euhhong)
만든 도구: 예) Blender 4.2 · Meshy · Tripo …
쓰임 조건: 예) 미니에 써도 됨 · 다른 곳에 쓰려면 물어보기
앞: +Y
크기: 몸길이 1.45 m
동작: idle walk run eat die
```

- `앞:` 은 +X · -X · +Y · -Y 가운데 하나.
- `크기:` 는 모델 단위가 이미 실제 미터면 `모델 그대로` 라고 적어도 됩니다.

---

## 5. 올리는 순서 — fork → PR

**깃허브 웹으로 하는 법(쉬움)**

1. 처음 한 번만: https://github.com/simjaemin1/Mini 에서 오른쪽 위 **Fork** → 형 계정에 사본이 생깁니다.
2. 올리기 전에 형의 fork 화면에서 **Sync fork → Update branch**(재민 쪽 새 내용 받기).
3. `assets-src/models/<분류>/<이름>/` 자리로 들어가 **Add file → Upload files** → `.glb` 와 `출처.txt` 를 끌어다 놓기.
   (폴더가 없으면 Add file → Create new file 에서 이름 칸에 `animals/wild_boar/출처.txt` 처럼 슬래시로 적으면 폴더가 생깁니다.)
4. 아래 **Commit changes**.
5. fork 첫 화면의 **Contribute → Open pull request** — 제목에 무엇을 보냈는지(예: `멧돼지 규격판 · 동작 다섯`).
6. 재민이 검사기로 보고 합칩니다.

**명령줄로 하는 법**

```bash
git clone https://github.com/<형 계정>/Mini.git && cd Mini
git remote add upstream https://github.com/simjaemin1/Mini.git
git pull upstream main                       # 재민 쪽 새 내용
git checkout -b model/wild-boar              # 보낼 것마다 가지 하나
# assets-src/models/animals/wild_boar/ 에 파일 넣기
git add assets-src/models/animals/wild_boar
git commit -m "멧돼지 규격판"
git push origin model/wild-boar              # 그다음 깃허브에서 Open pull request
```

---

## 6. 큰 파일을 올리면 안 되는 까닭

- git 은 한 번 올린 파일을 **기록에 영원히** 남깁니다. 나중에 지워도, 레포를 받는 사람 모두가 그 무게를 계속 받습니다.
  첫 PR 의 FBX 셋(소 · 닭 · 멧돼지)은 합쳐 200 MB 입니다 — 한 번 합치면 레포가 200 MB 무거워진 채로 남습니다.
- 깃허브는 100 MB 넘는 파일을 받지 않고, 웹으로는 25 MB 까지만 올라갑니다.
- **무거운 원본**(고해상 · 작업 파일)은 레포 말고 재민에게 따로 주세요(카톡 · 드라이브). 재민 맥의 `~/Mini/_3d_in/<형 이름>/` 에 둡니다.

---

## 7. 재민 · Claude 쪽에서 하는 일(참고)

```bash
# 규격 검사 — 항목마다 통과 / 빠짐 표
blender --background --factory-startup --python scripts/model-check.py -- assets-src/models/animals/wild_boar/wild_boar.glb --class=animals

# 8방향 그림 굽기 → public/assets/animals/wild_boar/
blender --background --factory-startup --python scripts/model_render.py -- assets-src/models/animals/wild_boar/wild_boar.glb --name=wild_boar --class=animals
```

게임에서 보이는 것은 손잡이 `T1194_MODEL_SPRITES=1` 을 켠 서버에서만입니다(지금은 꺼져 있습니다).
