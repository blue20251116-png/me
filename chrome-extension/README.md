# ME Instagram Reel Bridge

1. Chrome에서 Instagram에 로그인합니다.
2. `chrome://extensions`를 엽니다.
3. 오른쪽 위 `개발자 모드`를 켭니다.
4. `압축해제된 확장 프로그램을 로드합니다`를 누르고 이 `chrome-extension` 폴더를 선택합니다.
5. 확장프로그램 아이콘을 열어 ME 서버 주소와 ME 관리자 PIN을 저장합니다.
6. `Instagram Reel 수집 시작`을 누릅니다.

동작 방식:
- ME에 등록된 Instagram 벤치마킹 계정을 로그인된 Chrome에서 순회합니다.
- 계정별 Reels 페이지에서 여러 Reel 링크를 확인한 뒤 매 실행마다 서로 다른 후보를 선택할 수 있습니다.
- 실제 Reel 페이지의 `<video>` URL과 본문을 브라우저에서 읽습니다.
- 후보를 ME 서버로 보내면 서버가 중복을 제외하고 상품성이 높은 최대 3개만 저장합니다.
- 저장된 3개는 자동으로 기존 인포크/쿠팡/대본/영상 분석 파이프라인을 실행합니다.

Instagram 로그인 쿠키나 비밀번호는 ME 서버로 전송하지 않습니다.
