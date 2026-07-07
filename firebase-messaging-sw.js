/* =====================================================================
 *  firebase-messaging-sw.js — FCM 푸시 전용 서비스워커
 * ---------------------------------------------------------------------
 *  - 앱이 꺼져 있거나 백그라운드일 때 도착한 푸시를 휴대폰 알림으로 표시.
 *  - Firebase 설정은 config.js(FIREBASE_CONFIG)를 그대로 읽어 씀 → 여기서
 *    따로 수정할 값 없음. (버전 상수 FCM_SDK_VER 만 app.js 와 맞출 것)
 *  - 오프라인 캐시용 sw.js 와는 별개 파일/별개 스코프로 등록됨(충돌 없음).
 * ===================================================================== */

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
importScripts("./config.js");   // self.CONFIG.FIREBASE 로 설정 공유

(function () {
  const FB = (self.CONFIG && self.CONFIG.FIREBASE) || {};
  const cfg = FB.config || {};
  const bad = (v) => !v || String(v).indexOf("PLACEHOLDER") !== -1;
  if (bad(cfg.apiKey) || bad(cfg.projectId) || bad(cfg.messagingSenderId)) {
    console.warn("[FCM SW] Firebase 설정(placeholder) 미완료 — 백그라운드 푸시 비활성");
    return;
  }

  firebase.initializeApp(cfg);
  const messaging = firebase.messaging();

  // 백그라운드 수신:
  //  - 서버(Code.gs)가 notification 페이로드로 보내면 브라우저가 자동 표시하므로
  //    여기서는 data 전용 메시지가 왔을 때만 직접 알림을 띄운다(중복 방지).
  messaging.onBackgroundMessage((payload) => {
    if (payload && payload.notification) return;   // 자동 표시에 맡김
    const d = (payload && payload.data) || {};
    self.registration.showNotification(d.title || "트윈타워 공지", {
      body: d.body || "",
      icon: "assets/icons/app_192.png",
      badge: "assets/icons/app_192.png",
      tag: "twin-notice",                          // 같은 태그는 최신 1건으로 갱신
      data: { url: d.url || "./" },
    });
  });
})();

// 알림 클릭 → 이미 열린 앱 탭이 있으면 포커스, 없으면 새로 열기
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
