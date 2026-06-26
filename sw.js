/* =====================================================================
 *  sw.js — PWA 서비스워커 (홈 화면 설치 + 기본 오프라인 캐시)
 * ---------------------------------------------------------------------
 *  초보자 참고: 이 파일은 거의 건드릴 일 없습니다.
 *  앱을 업데이트했는데 변경이 안 보이면 CACHE_VERSION 숫자만 올리세요.
 * ===================================================================== */

const CACHE_VERSION = "connect-on-v3";       // ← 업데이트 시 v4, v5 ... 으로 변경 (아이콘 추가로 v3)
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./config.js",
  "./manifest.json",
  "./assets/css/style.css",
  "./assets/js/app.js",
  "./assets/vendor/lucide.min.js",
  "./assets/icons/app_192.png",
  "./assets/icons/app_512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png",
];

// 설치: 핵심 파일 미리 저장
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// 활성화: 옛 버전 캐시 청소
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 요청 가로채기: 네트워크 우선, 실패 시 캐시 (외부 iframe/주소는 그대로 통과)
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // 외부 도메인(챗봇/사이트/앱시트 등)은 캐시하지 않고 그대로 통과
  if (!url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
