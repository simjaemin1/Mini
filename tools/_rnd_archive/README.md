# `tools/_rnd_archive/` — R&D 보관소 (정본 아님)

GPT BGM R&D 착지(`462b4acc` · 86커밋 스쿼시)가 들여온 도구 24 폴더 가운데 **14 폴더**를 옮겨 둔 자리다.
이 14 폴더는 이 레포에서 제 일을 못 하고, 다른 곳이 이 폴더에 기대지도 않는다.
**R&D 미확정 · 정본 아님** — 제품(`public/client`·`bgm.js`)·서버·배포 이미지 어디서도 이 폴더를 부르지 않는다.

## 왜 옮겼나

| 카드 | 한 일 | 그 표 |
|---|---|---|
| T386 (09-25) | GPT R&D 검수 — 도구 23 폴더(+ T353 `tools/ddsp`): 쓰임 0/23 · 실데이터 경로 23 전부 못 돌림 · 자기 시험 36/37 파일 초록 | `보고/T386_2026-09-25.md` §ⓒ |
| T411 (09-26) | 24 폴더 진입점을 네트워크 0 · 5분으로 한 번씩 돌렸다 — 돈다 5 · 안 돈다 19. 권고는 쓴다 1 · 참고 9 · **버림 14** | `보고/T411_2026-09-26.md` §③ |
| T422 (09-26 · PM 승인) | 버림 14 를 `git mv` 로 여기 옮겼다. 내용은 무변이고 히스토리는 `git log --follow` 로 이어진다. 경로 줄만 고쳤다(아래) | `보고/T422_2026-09-26.md` |

## 무엇이 있나 — 14

| 묶음 | 폴더 | 버림 까닭(T411) | 자기 시험(옮긴 뒤) |
|---|---|---|---|
| MIDI-DDSP 줄기 7 | `midi-ddsp-score-adapter` | 레포 계획으로 **돈다**(MIDI + 다리 JSON). 그런데 받는 쪽이 전부 체크포인트 없음 | 4/4 |
| 〃 | `midi-ddsp-runtime` | 체크포인트 없음(URMP 가중치 zip) · TF 2.7 환경 없음 | 5/5 |
| 〃 | `midi-ddsp-audition-pack` | 런타임 산출이 있어야 돈다 | 2/2 |
| 〃 | `midi-ddsp-daegeum-timbre` | 권리 감사 · NGC 192 WAV · 런타임 B WAV 가 있어야 돈다 | 2/2 |
| 〃 | `midi-ddsp-daegeum-adapter` | NGC 목록이 없어도 exit 0 "blocked" 로 끝난다 | **5/6** — 빨간 절은 레포 밖(`_bgm_rnd`) 파일이 **있다**고 단언한다. 옮기기 전과 같다 |
| 〃 | `midi-ddsp-transfer-train` | 준비 판정만 돈다("준비 안 됨" 넷 — WSL py3.8 · 4060 · 가중치 · 데이터) | 7/7 |
| 〃 | `model-provenance` | MIDI-DDSP 가중치 zip 전용 게이트 — 체크포인트 없음 | 3/3 |
| 청취 묶음 줄기 5 | `yoseong-audition-pack` · `full-ari-yoseong-audition-pack` · `full-ari-reference-contour-audition-pack` · `full-ari-reference-depth-audition-pack` · `full-ari-reference-fade-audition-pack` | 기준 커밋 `03a54f5c` 가 이 레포에 없어 입력이 다 와도 **조립 불가**. #66 청취본은 맥 `_bgm_rnd` 에 이미 있다. 네 판은 `sys.path` 로 서로 import 한다(fade → depth → contour → full-ari-yoseong) | 5/5 · 4/4 · 7/7 · 7/7 · 8/8 |
| 홀로 | `source-led-stem-mixer` | 산출 소비자 0 · 입력(스팬 청취 JSON + 원음 스템)이 `_bgm_rnd` 에 있다. ⚠T422 정정: T411 은 "R&D-07 이 닫은 방향"이라 적었는데, 그건 틀렸다. R&D-07·08 은 source-led 편곡을 **즉시 경로**로 적는다(§되살리려면) | 6/6 |
| 홀로 | `ddsp`(T353 · ART 영역) | `train.py` 가 f0 를 392 Hz 로 고정한다(조건부 모델이 아니다). `phrase.py` 백엔드 B 가 부르는 `ddsp_backend` 모듈은 어디에도 없다. GPT `expressive-synthesis` 가 "archived ddsp" 로 부르며 안 쓴다 | 시험 없음 |

MIDI-DDSP 줄기를 버린 근거는 `설계/BGM_RND_08.md` 의 한 줄이다: *"MIDI-DDSP 공개 구현은 archived 상태이므로 그대로 제품 의존성으로 채택하지 않고, notes/performance/synthesis 분리 원칙과 eval 설계만 참고한다."*

## 옮기며 바꾼 줄 — 경로만(로직 0)

한 칸 깊어진 자리에서 옆 폴더(`tools/<남은 폴더>`)나 레포 뿌리를 찾도록 `parents[k]` 의 k 를 하나 올렸다. 그 밖에는 한 글자도 안 바꿨다.

| 폴더 | 줄 | 왜 |
|---|---|---|
| `full-ari-reference-contour-audition-pack` | 시험 :18 `REPOSITORY_ROOT = HERE.parents[2]` | 시험 7 이 깨졌다(`tools/tools/daegeum-vibrato-reference/…`). depth·fade 시험이 이 모듈을 픽스처로 읽어서, 이 한 줄로 셋이 다 선다 |
| `midi-ddsp-daegeum-timbre` | :146 `parents[2]` | 옆 `daegeum-transitions/native_wav.py` 를 찾는다 — 시험 1 이 깨졌다 |
| `midi-ddsp-score-adapter` | :45 · 시험 :17 `HERE.parents[1] / "score-expression"` | 옆 `score-expression` import — 시험이 import 에서 깨졌다. 모듈 줄도 같이 고쳤다(CLI) |
| `source-led-stem-mixer` | :31 · 시험 :17 `HERE.parents[1] / "daegeum-transitions"` | 옆 `native_wav` import — 시험이 import 에서 깨졌다. 모듈 줄도 같이 고쳤다 |
| `midi-ddsp-daegeum-adapter` | :81 `parents[3]` · 시험 :16 `HERE.parents[2]` | 시험은 안 깨졌다. 그런데 레포 뿌리 기본값이 `tools/` 를 가리키게 됐다 |
| `midi-ddsp-runtime` | :55 `parents[3]` | 같다(레포 뿌리 기본값) |
| `midi-ddsp-transfer-train` | :480 · :831 `parents[3]` | 같다(`--repository-root` 기본값 · 데이터 목록 뿌리) |

제품 쪽 흔적도 고쳤다. `public/assets/audio/bgm/phrase.py` 4줄(:167 · :174 · :182 · :188)의 `tools/ddsp` → `tools/_rnd_archive/ddsp` 다. 모델이 0 이라 동작은 무변이다(`test_curves.py` PASS).
⚠그 함수 `ddsp_model_dir` 는 처음부터(T353) `dirname` 을 4번만 올라가서 `public/tools/…` 를 본다. 레포 뿌리의 `tools/` 가 아니다. 이 카드는 문자열만 옮겼고 그 결함은 회부했다.

**안 바꾼 것**:
- 폴더 안 README 의 `tools/<이름>/…` 명령 — 읽을 때 `tools/_rnd_archive/<이름>/…` 로 바꿔 읽는다.
- `midi-ddsp-transfer-train` 의 계보 문자열 `tools/midi-ddsp-runtime/run_official_flute_rnd.py` — 설정과 검사기가 **같은 글자**를 맞대는 기록이다(감사 때의 자리).
- 보고·설계·지시의 옛 경로 — 역사다.

## 배포

배포 이미지는 `Dockerfile.{zone,central}` 의 `COPY package*.json server public sim` 만 싣는다. 이 폴더는 어느 이미지에도 **안 실린다**. `scripts/test-assets-audit.js ⑩` 이 두 Dockerfile 의 `COPY` 를 읽어 지킨다(미끼: `COPY . .` 를 더하면 이 폴더 전부를 문다).
`.gitattributes` 는 `tools/_rnd_archive/** linguist-vendored export-ignore` 다(GitHub 언어 통계에 안 센다 · `git archive` 에서 뺀다).

## 되살리려면

되살릴 까닭이 서기 전엔 되살리지 않는다. 판정은 재민·PM 몫이다(설계 11장 판정 — `보고/T422` §②).

1. `git mv tools/_rnd_archive/<이름> tools/<이름>`
2. 그 폴더의 경로 줄을 되돌린다 — 위 표의 `parents[k]` 에서 k 를 하나 내린다. 옮긴 커밋은 `git log --oneline --grep 'T422' -- tools/_rnd_archive` 로 찾는다(그 커밋의 그 폴더 diff 를 거꾸로). `ddsp` 면 `phrase.py` 4줄도 되돌린다.
3. 그 폴더 자기 시험과 `scripts/test-daegeum-transition-bank.py` 를 돌린다.
   (자기 시험: `env GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false python3 -m unittest discover -s tools/<이름> -p 'test_*.py'`)
4. 청취 묶음 다섯을 되살려도 `03a54f5c` 가 없으면 조립은 여전히 안 된다.

★되살릴 후보 하나: **`source-led-stem-mixer`**. `설계/BGM_RND_07.md` §다음 구현 순서 1 *"Source-led 편곡 (즉시 가능한 경로)"* 과 `설계/BGM_RND_08.md` §구현 우선순위 2 *"phrase boundary triage + source-led stem"* 이 가리키는 도구가 이것이다. R&D-07 이 "없다"로 닫은 것은 아리랑 악보를 충실히 부른 source 악구였고, source-led 편곡은 닫지 않았다(T411 정정). 입력(`span_audition.json` · 원음 스템)이 레포 밖이라 지금은 어느 자리에서도 못 돈다.

## 알려진 결함 (고치지 않았다 · `보고/T411` §③-4)

- `midi-ddsp-daegeum-adapter`: 입력이 없어도 exit 0 "blocked" 로 끝난다 · 시험 하나는 레포 밖 파일을 단언하고, 하나는 파일이 없어서 공짜로 초록이다
- 청취 묶음 다섯: 기준 커밋 `03a54f5c` 가 레포에 없다
- `midi-ddsp-runtime`: `--execute` 없이 부르면 거절이 `try` 밖이라 traceback 이 난다
- `ddsp`: `train.sh` 가 폴더 안에 venv 를 만들고 네트워크로 pip 를 부른다 — 돌리지 마라 · `ddsp_backend` 모듈이 없다
