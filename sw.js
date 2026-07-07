/* =====================================================================
 *  sw.js — PWA 서비스워커 (홈 화면 설치 + 기본 오프라인 캐시)
 * ---------------------------------------------------------------------
 *  초보자 참고: 이 파일은 거의 건드릴 일 없습니다.
 *  앱을 업데이트했는데 변경이 안 보이면 CACHE_VERSION 숫자만 올리세요.
 * ===================================================================== */

const CACHE_VERSION = "connect-on-v7";       // ← 업데이트 시 v8, v9 ... 으로 변경 (속도 개선: SWR 캐시 전략 v7)
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

// 요청 가로채기 전략 (외부 도메인 — 챗봇/GAS/앱시트 등 — 은 그대로 통과)
//  - HTML(페이지 진입): 네트워크 우선 → 항상 최신 앱. 실패(오프라인) 시 캐시.
//  - 정적 파일(JS/CSS/아이콘): 캐시 '즉시' 응답 + 백그라운드로 최신본 갱신
//    (stale-while-revalidate) → 재방문이 네트워크를 기다리지 않아 훨씬 빠름.
//    갱신본은 다음 방문에 반영되므로, 배포 시 CACHE_VERSION 을 꼭 올릴 것.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;

  // ① 페이지 진입(navigate) — 네트워크 우선
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("./index.html"))
        )
    );
    return;
  }

  // ② 정적 파일 — 캐시 즉시 + 백그라운드 갱신
  event.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);   // 네트워크 실패: 캐시라도 반환
      return hit || refresh;
    })
  );
});
