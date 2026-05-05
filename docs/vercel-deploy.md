# Vercel 배포 체크리스트

## 배포 방식

이 프로젝트는 빌드 단계가 없는 정적 웹 앱입니다. Vercel 프로젝트 루트를 저장소 루트로 잡으면 `index.html`, `app.js`, `styles.css`, `assets/`가 그대로 배포됩니다.

현재 Production 주소는 <https://open-file-transfer-web.vercel.app> 입니다.

## 로컬 확인

```bash
npm run check
npm run vercel:dev
```

브라우저에서 `http://localhost:4173`을 열어 화면과 정적 리소스를 확인합니다.

## Vercel CLI 배포

```bash
npx vercel --prod --yes --name open-file-transfer-web
```

Framework Preset은 `Other` 또는 정적 프로젝트로 둡니다. Build Command는 비워두고 Output Directory도 비워둡니다.

## Git 연동 배포

1. GitHub에 `OpenFileTransferWeb` 저장소를 만듭니다.
2. Vercel에서 해당 저장소를 Import합니다.
3. Framework Preset을 `Other`로 설정합니다.
4. Build Command를 비워둡니다.
5. Production Branch를 `main`으로 둡니다.

## 주의 사항

- 파일 데이터는 Vercel에 업로드되지 않습니다.
- Nearby 방 기능은 Vercel Runtime Cache에 디바이스 presence와 연결용 signaling 메시지만 짧게 저장합니다.
- 초대/응답 코드는 URL hash 또는 클립보드로만 오갑니다.
- URL hash는 서버 요청에 포함되지 않지만, 사용자가 직접 채팅/메신저에 공유하면 그 채널에는 노출됩니다.
- WebRTC 직접 연결이 실패하는 네트워크에서는 TURN 서버 설정을 입력해야 합니다.
- 모바일 브라우저는 화면 잠금 또는 앱 전환 시 전송이 끊길 수 있습니다.
- QR 스캔과 바로 저장은 브라우저 지원 여부에 따라 사용할 수 있습니다.
- Service Worker는 앱 shell만 캐시하며 `/api/nearby`는 항상 네트워크 요청으로 처리합니다.
