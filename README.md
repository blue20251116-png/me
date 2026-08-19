# yt-shorts-global (V1)

해외 시청자 대상 YouTube Shorts AI 제작 파이프라인 V1.
기존 Threads/쇼핑쇼츠 프로젝트와 코드/DB/환경변수를 전혀 공유하지 않는 완전 별도 프로젝트입니다.

## 실행 방법

```bash
npm install
cp .env.example .env
# .env에 3개 키 채우기: ANTHROPIC_API_KEY, PEXELS_API_KEY, OPENAI_API_KEY
npm start
```

브라우저에서 `http://localhost:4100` 접속 → 관리자 Preview UI.
서버가 처음 뜰 때 `storage/yt_shorts_global.db`에 SQLite 스키마가 자동 생성됩니다(마이그레이션 불필요).

## 필요한 API 키

| 키 | 용도 | 발급처 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 소재분석/대본생성/scene분해 (Claude) | console.anthropic.com |
| `PEXELS_API_KEY` | scene별 스톡 영상 검색 | pexels.com/api |
| `OPENAI_API_KEY` | TTS(tts-1) + Whisper word-timestamp 정렬 | platform.openai.com |

## 기본 흐름

1. Admin UI에서 프로젝트 생성 (source_type: TOPIC/URL/ARTICLE/UPLOAD)
2. "파이프라인 실행" 클릭 → 소재분석(TOPIC은 생략)→대본→scene분해→영상검색→TTS→자막정렬→timeline재분배→렌더까지 한 번에 실행
3. Preview 화면에서 대본/scene 영상(후보 클릭으로 교체)/자막(JSON) 수정
4. "수정사항 반영 재렌더" — AI를 다시 호출하지 않고 현재 상태로만 재렌더
5. 만족스러우면 "최종 렌더 확정"

## V1에서 하지 않는 것

- YouTube 자동 업로드 / Analytics 수집 → V1.5
- 생성형 영상 API 연동
- 자동 소재 크롤링/발굴
- BGM 카테고리별 자동 매핑

## 디렉터리

`src/modules/` 각 파이프라인 단계, `src/workers/pipelineWorker.js` 전체 오케스트레이션, `src/routes/projects.js` REST API, `admin/index.html` 관리자 Preview UI, `storage/` 업로드/렌더 결과물 저장.
