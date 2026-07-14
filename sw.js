/* =====================================================================
 *  sw.js — PWA 서비스워커 (홈 화면 설치 + 오프라인 캐시)
 * ---------------------------------------------------------------------
 *  ⭐ 캐시 때문에 이전 버전이 뜨는 문제를 구조적으로 막는 버전입니다.
 *   - 앱 파일(HTML/JS/CSS)  → '네트워크 우선': 온라인이면 항상 최신,
 *       네트워크가 안 되면 그때만 캐시로 폴백. → 버전 숫자를 잊어도 최신.
 *   - 무거운 벤더/아이콘     → '캐시 우선 + 백그라운드 갱신(SWR)': 빠르게 유지.
 *   - 새 버전 감지 시 index.html 이 '새로고침' 알림을 띄웁니다(즉시 반영).
 *  ---------------------------------------------------------------------
 *  참고: 이제 CACHE_VERSION 을 안 올려도 앱 파일은 최신이 뜹니다.
 *  다만 올려두면 옛 캐시 청소 + 업데이트 알림이 더 확실하니 배포 때 올리길 권장.
 * ===================================================================== */

const CACHE_VERSION = "connect-on-v9";       // ← 배포 시 v9, v10 ... 으로 변경 (특보 순환 카운터 우측하단 표시 v9)

// 자주 바뀌는 '앱 파일' — 네트워크 우선(항상 최신). 오프라인일 때만 아래 캐시 사용.
const APP_SHELL = [
  "./",
  "./index.html",
  "./config.js",
  "./manifest.json",
  "./assets/css/style.css",
  "./assets/js/app.js",
];
// 거의 안 바뀌는 '무거운 파일' — 캐시 우선(빠름). 백그라운드로만 갱신.
const VENDOR_ASSETS = [
  "./assets/vendor/lucide.min.js",
  "./assets/icons/app_192.png",
  "./assets/icons/app_512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png",
];
const CORE_ASSETS = APP_SHELL.concat(VENDOR_ASSETS);

// 이 요청이 '앱 파일'(네트워크 우선 대상)인가? — config.js / assets/js / assets/css
function isAppShell_(url) {
  return /\/config\.js(\?|$)/.test(url)
      || url.indexOf("/assets/js/") !== -1
      || url.indexOf("/assets/css/") !== -1;
}

// 설치: 핵심 파일 미리 저장
//  skipWaiting() 은 여기서 호출하지 않습니다 → 새 SW 를 '대기' 상태로 두어
//  index.html 이 사용자에게 "새로고침" 을 물어본 뒤(수락 시 SKIP_WAITING 메시지)
//  교체하도록 합니다. (첫 설치 때는 대기 없이 바로 활성화됨)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

// index.html 의 '새로고침' 수락 → 즉시 새 버전으로 교체
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
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
//  - HTML(페이지 진입) + 앱 파일(JS/CSS/config): '네트워크 우선'
//       → 온라인이면 항상 최신. 실패(오프라인) 시에만 캐시로 폴백.
//       → 이래서 CACHE_VERSION 을 잊어도 이전 버전이 굳지 않습니다.
//  - 벤더/아이콘(무거움): 캐시 '즉시' + 백그라운드 갱신(SWR) → 재방문이 빠름.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;

  // ① 페이지 진입(navigate) 또는 앱 파일(JS/CSS/config) — 네트워크 우선
  if (req.mode === "navigate" || isAppShell_(req.url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) =>
            hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined)
          )
        )
    );
    return;
  }

  // ② 벤더/아이콘 — 캐시 즉시 + 백그라운드 갱신(SWR)
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
