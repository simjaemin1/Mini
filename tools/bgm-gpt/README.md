# BGM 첫 대금 악구 비교

`render_first_phrases.py`는 국립국악원 대금 악구 `w3-714-001`~`005`의 사본만 읽어 36초짜리 청취본 세 개를 만든다. 원본의 각 7.2초 구간을 전부 보존하고 순서대로 잇는다. 파일명과 악구 목록의 최종 대응은 `finish.py`의 순차 확인이 끝난 뒤 재검증한다.

```bash
python3 tools/bgm-gpt/render_first_phrases.py \
  --source-dir ~/Mini/_bgm/국악원/raw/phrase/c0240 \
  --output-dir ~/Mini/_bgm/gpt/청취
```

`finish.py`가 정리를 끝내 raw 파일을 옮긴 뒤에는 `--source-dir` 대신 `--gugak-root ~/Mini/_bgm/국악원`을 쓴다. 이 경우 정리된 대금 악구의 ID 이름으로 파일 하나를 찾으며, 중복이면 멈춘다.

| 청취본 | 차이 |
|---|---|
| `001_대금_원음연결.m4a` | 다섯 악구를 원음 그대로 연결 |
| `002_대금_악구음량균형.m4a` | 각 악구의 통합 음량을 다섯 악구 중앙값에 맞춤. 구간 안의 강약은 유지 |
| `003_대금_음량균형_약한잡음정제.m4a` | ②에 약한 FFT 잡음 정제(`afftdn=nr=5:nf=-55:gs=1`) 추가 |

세 파일의 길이와 통합 음량은 동일하게 맞춘다. Safari용 AAC `.m4a`이며 `국악기 음원 제공 — 국립국악원 (공공누리 제1유형)`을 파일 메타데이터에 넣는다. `제작정보.json`에는 입력 경로·SHA-256·측정값을 남긴다. 어떤 판이 더 좋은지는 청취 판정 전까지 확정하지 않는다.

순차 다운로드가 끝나면 다음 읽기 전용 검사로 목록 ID, 실제 파일, float 원본의 `.wv` 보존, `정리/목록표.csv`를 대조한다. `finish.py`의 `끝` 출력과 `.done`만으로 무결성을 가정하지 않는다.

```bash
python3 tools/bgm-gpt/audit_finish.py --root ~/Mini/_bgm/국악원
```
