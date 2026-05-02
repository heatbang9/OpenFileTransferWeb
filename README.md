# OpenFileTransfer Web MVP

설치 없이 브라우저에서 파일을 보내는 WebRTC 웹 앱입니다. Vercel은 정적 HTML/CSS/JS를 배포하고, 파일 데이터는 연결된 두 브라우저 사이의 WebRTC DataChannel로 직접 이동합니다.

## 결론

- UPnP/SSDP 자동 탐색은 브라우저 보안 모델상 지원하지 않습니다.
- 초대 코드와 응답 코드를 교환해 WebRTC 연결을 만듭니다.
- 연결 후 파일 바이트는 Vercel 서버를 거치지 않습니다.
- 별도 방 서버, 계정, 앱 설치 없이 동작하는 정적 웹 앱입니다.
- 여러 파일 큐 전송, 수신 파일 목록, 공유 링크, QR 코드, 선택 전송 암호화를 지원합니다.

## 로컬 실행

```bash
npm run check
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 배포 주소

- Production: <https://open-file-transfer-web.vercel.app>

## Vercel 배포

정적 프로젝트이므로 저장소를 Vercel에 연결하거나 CLI로 배포할 수 있습니다.

```bash
npx vercel --prod --yes --name open-file-transfer-web
```

## 사용 흐름

1. 보내는 디바이스에서 파일을 선택하고 필요하면 `전송 암호`를 입력합니다.
2. `초대 코드 만들기`를 누르고 코드 또는 공유 링크를 받는 디바이스로 보냅니다.
3. 받는 디바이스에서 초대 코드를 붙여넣고, 같은 전송 암호가 있다면 입력한 뒤 `응답 코드 만들기`를 누릅니다.
3. 보내는 디바이스에서 응답 코드를 붙여넣고 `응답 코드 연결`을 누릅니다.
4. WebRTC 채널이 열리면 `선택 파일 전송`을 누릅니다.
5. 받는 디바이스의 `받은 파일` 목록에서 각 파일을 저장합니다.

## 문서

- [웹 MVP 설계와 제약](docs/web-mvp.md)
- [Vercel 배포 체크리스트](docs/vercel-deploy.md)
