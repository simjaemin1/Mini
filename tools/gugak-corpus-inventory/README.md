# 국악 원음 corpus inventory — R&D 전용

`inventory.py`는 **명시적으로 준 audio root만** 읽어 SHA-256 기준으로 중복을
묶는 보수적 source inventory다. 원음을 복사·변환·decode·정규화·수정하지 않는다.
개인 Downloads 경로나 기본 scan 대상은 없다.

```sh
# stdout으로만 report를 받는다.
python3 tools/gugak-corpus-inventory/inventory.py \
  --root /explicit/audio-root \
  --root-label direct-source > /tmp/gugak-corpus-inventory.json

# 여러 root를 하나의 SHA inventory로 합친다.
python3 tools/gugak-corpus-inventory/inventory.py \
  --root /explicit/source-a --root-label source-a \
  --root /explicit/source-b --root-label source-b \
  --output /tmp/gugak-corpus-inventory.json
```

`--root-label`을 쓰면 모든 `--root`마다 하나씩 준다. Report에는 root의 절대
경로를 쓰지 않고 `root_001` 같은 id와 그 root 내부의 상대 경로만 남긴다.
`--output`은 명시한 source root 안에 둘 수 없고, 기존 report를 바꾸려면
`--overwrite`가 필요하다.

## 무엇을 기록하는가

- `.wav`, `.flac`, `.mp3`, `.ogg`, `.m4a`, `.aif`, `.aiff` 파일의 원본 바이트
  SHA-256 및 크기
- SHA가 같은 파일의 occurrence 목록과 중복 수
- RIFF/RF64 WAV의 native container, encoding, sample-rate, channels, bit-depth,
  frame count, duration. 이는 sibling `tools/daegeum-transitions/native_wav.py`로
  **resample 없이** 읽는다.
- 다른 container는 hash만 기록하고 descriptor/duration은 `null`로 둔다. 파일
  확장자만 보고 format이나 길이를 꾸며내지 않는다.
- filename에 실제로 있는 대금·가야금·해금·피리 등의 단어와 `scale`·`악구` 같은
  title keyword를 *hint*로 보존한다. 애매하거나 모르는 이름은 `unknown`이며,
  한 이름에서 복수 family가 나오면 `ambiguous_filename_hints`다.

## 의도적으로 하지 않는 것

이 도구의 `policy`는 아래를 모두 `unknown_not_inferred`로 기록한다.

- 라이선스·학습 허가·배포 허가
- 연주자, 실제 articulation, 호흡, legato, 전이 존재 여부
- phrase 품질·자연스러움·음정 판정
- 게임 asset 또는 모델 학습 대상 적합성

따라서 `named_phrase_or_performance_candidate`나
`named_technique_or_exercise_candidate`는 filename에 적힌 단어를 보존한 것일
뿐, 오디오를 듣거나 판정한 label이 아니다. 지속음 악기의 실제 전이 검색에는
이 inventory 다음에 별도 segment/trajectory/검토 gate가 필요하다.

검증은 임시 WAV fixture만 쓰며 사용자 파일을 열지 않는다.

```sh
python3 tools/gugak-corpus-inventory/test_inventory.py
```
