/* =====================================================================
 *  app.js — Twin Work 앱 엔진
 * ---------------------------------------------------------------------
 *  config.js(CONFIG)를 읽어 대시보드를 그리고 동작을 연결.
 *  아이콘은 Lucide(라인 아이콘) 사용 → createIcons()로 <i>를 <svg>로 변환.
 *  💡 내용/메뉴는 config.js에서 수정. 이 파일은 거의 손댈 일 없음.
 * ===================================================================== */
(function () {
  "use strict";
  const C = window.CONFIG;
  if (!C) { console.error("config.js가 먼저 로드되어야 합니다."); return; }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    applyBranding();
    renderGreeting();
    initWeather();
    renderNoticeFeed();
    initTodos();
    renderShortcuts();
    renderSidebar();
    bindHeader();
    bindBottomNav();
    initHistory();            // 브라우저/Android 뒤로가기 → 홈 복귀
    initPush();               // 휴대폰 푸시(Firebase FCM) 초기화 — 설정 미완료 시 자동 스킵
    refreshIcons();           // Lucide <i> → <svg>
  }

  /* ---------------- 유틸 ---------------- */
  const $id = (id) => document.getElementById(id);
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function findService(id) { return C.SERVICES.find((s) => s.id === id); }
  function refreshIcons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }

  // 새 탭으로 외부 링크 열기 (크로스 플랫폼 안전)
  //  - iOS(특히 홈 화면 PWA)는 window.open(url,'_blank','noopener') 의 features 인자
  //    때문에 '팝업'으로 간주해 차단/무반응이 잦음. 임시 <a target=_blank> 클릭으로 회피.
  function openNewTab(url) {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Lucide 아이콘 박스 (+ 커스텀 PNG 있으면 페이드인 교체)
  function iconBox(service) {
    const box = el(`<div class="icon-box"><i data-lucide="${service.lucide || "square"}"></i></div>`);
    if (service.icon) {
      const img = new Image();
      img.className = "icon-box__img";
      img.alt = service.label;
      img.onload = () => { img.classList.add("is-loaded"); box.classList.add("has-img"); };
      img.onerror = () => img.remove();
      img.src = service.icon;
      box.appendChild(img);
    }
    return box;
  }

  /* ---------------- 브랜딩 ---------------- */
  function applyBranding() {
    const A = C.APP_ASSETS, M = C.APP_META;
    setLogo($id("headerLogo"), A.logo);
    setLogo($id("sidebarLogo"), A.logo);
    if ($id("headerName")) $id("headerName").textContent = M.appName;
    if ($id("sidebarTitle")) $id("sidebarTitle").textContent = M.appName;
  }
  function setLogo(imgEl, src) {
    if (!imgEl || !src) return;
    imgEl.onerror = () => { imgEl.style.display = "none"; };
    imgEl.src = src;
  }

  /* ---------------- [상단] 인사말 ---------------- */
  function renderGreeting() {
    if ($id("greetLine")) $id("greetLine").textContent = C.HOME_DATA.greetingLine || "";
  }

  /* ================= [중단 좌] 기상청 날씨 엔진 (3탭 + 체감온도 + 특보) ================= */
  let WX_TAB = "now";        // now | hourly | weekly
  let WX_DATA = null;        // { now, hourly[], weekly[], alert }
  let WX_STATE = "loading";  // loading(스켈레톤) | ready | error
  let WX_SAMPLE = false;     // true 면 카드에 "샘플" 배지 표시 (가짜를 진짜처럼 안 보이기)

  function initWeather() {
    // 탭 전환 바인딩 (새로고침 없이 active 토글)
    document.querySelectorAll(".wx-tab").forEach((t) => {
      t.addEventListener("click", () => {
        WX_TAB = t.dataset.wx;
        document.querySelectorAll(".wx-tab").forEach((x) => x.classList.toggle("is-active", x === t));
        renderWxTab();
      });
    });
    loadWeatherData();   // 스켈레톤 → (프록시 미설정: 샘플+배지 / 설정: 실데이터 / 실패: 오류+재시도)
  }

  /* ── 날씨 로컬 캐시 (체감 속도) ──
   *  GAS 프록시는 콜드스타트 시 1~3초 걸림 → 마지막 성공 데이터(1시간 이내)를
   *  localStorage 에 보관해 두고 즉시 표시, 네트워크 조회는 뒤에서 조용히 진행. */
  const WX_LS_KEY = "twin_wx_cache";
  const WX_LS_TTL = 60 * 60 * 1000;   // 1시간
  function readWxCache() {
    try {
      const o = JSON.parse(localStorage.getItem(WX_LS_KEY) || "null");
      if (o && o.t && o.data && (Date.now() - o.t) < WX_LS_TTL) return o.data;
    } catch (e) {}
    return null;
  }
  function saveWxCache(data) {
    try { localStorage.setItem(WX_LS_KEY, JSON.stringify({ t: Date.now(), data })); } catch (e) {}
  }

  // ── 데이터 로드 (GAS 프록시 미설정이면 샘플+배지, 설정 시 KMA 프록시 호출) ──
  async function loadWeatherData() {
    const proxy = (C.KMA && C.KMA.PROXY_URL) || "";
    const isPlaceholder = !proxy || /PLACEHOLDER/i.test(proxy);

    // 최근 성공 데이터가 있으면 스켈레톤 없이 즉시 표시 (뒤에서 최신값으로 교체)
    const cached = !isPlaceholder ? readWxCache() : null;
    if (cached) {
      WX_DATA = cached; WX_SAMPLE = false; WX_STATE = "ready";
      applyWeatherBg(cached.now && cached.now.clear);
      renderAlert();
    } else {
      WX_STATE = "loading";
    }
    renderWxTab();   // 캐시 표시 or 스켈레톤

    if (isPlaceholder) {
      WX_DATA = sampleWx();
      WX_SAMPLE = true;
      WX_STATE = "ready";
      console.info("%c[KMA] 날씨 프록시(WEATHER_PROXY_URL) 미설정 → 샘플 데이터 + '샘플' 배지 표시 중.", "color:#6b7280");
    } else {
      try {
        // ⚡ 4개 호출을 병렬로 동시 실행 (순차 ~7.5s → 가장 느린 1개 ~2s)
        //  - now/vil 은 필수(실패 시 전체 오류) → Promise.all 에 그대로
        //  - ext/alert 는 보조 → safeCall 로 감싸 실패해도 전체를 막지 않음
        const [now, vil, ext, alert] = await Promise.all([
          fetchKmaNow(),                              // 초단기실황(기온/습도/풍속/풍향/강수량)
          fetchKmaVilageRaw(),                        // 단기예보(시간별/주간/POP 공용)
          safeCall(fetchKmaExtremes, null),           // 오늘 정확한 최고/최저(02시 발표분)
          safeCall(fetchKmaAlert, { active: false }), // 기상특보 (실패 시 미발령)
        ]);
        Object.assign(now, parseTodayExtremes(vil));  // 강수확률 + 최고/최저 폴백
        Object.assign(now, parseCurrentSky(vil));     // 하늘상태(SKY) 보정 → 맑음/구름많음/흐림
        if (ext) { now.tmx = ext.tmx; now.tmn = ext.tmn; }
        // 체감온도: 기상청 생활기상지수 '체감온도' API 는 2026 데이터 생산중단으로 폐지됨.
        //  → 공식 API 없음. now.feels 는 fetchKmaNow 의 feelsLike(T,H,V) 계산식이 유일한 소스.
        const hourly = parseHourly(vil);
        const weekly = parseDaily(vil);
        WX_DATA = { now, hourly, weekly, alert };
        WX_SAMPLE = false;
        WX_STATE = "ready";
        saveWxCache(WX_DATA);   // 다음 방문 즉시 표시용
        console.info("%c[KMA] 실시간 기상 데이터 연동 완료", "color:#16a34a");
      } catch (e) {
        console.error("[KMA] 프록시 호출 실패:", e);
        if (cached) {
          // 캐시를 이미 보여준 상태 → 오류 화면으로 갈아엎지 않고 그대로 유지
          console.warn("[KMA] 갱신 실패 — 최근 캐시 데이터를 유지합니다.");
        } else {
          // 보여줄 게 없을 때만 오류 상태 + 재시도 버튼 (가짜 데이터로 위장하지 않음)
          WX_DATA = null;
          WX_STATE = "error";
        }
      }
    }
    // 샘플 배지 토글
    const tag = $id("wxSampleTag");
    if (tag) tag.hidden = !(WX_STATE === "ready" && WX_SAMPLE);

    if (WX_STATE === "ready") applyWeatherBg(WX_DATA.now.clear);
    renderAlert();
    renderWxTab();
  }
  async function safeCall(fn, fallback) {
    try { return await fn(); } catch (e) { console.warn("[KMA] 부분 실패:", e); return fallback; }
  }

  /* ── 체감온도 자동 연산 ──
   * 겨울(≤10°C): 풍속 기반 Wind Chill (V는 m/s → km/h 변환)
   * 여름/평시: 기상청 약식 습도기반 체감온도(일사 미반영) */
  function feelsLike(T, H, V) {
    if (T <= 10) {
      const vk = Math.pow(Math.max(V, 0.1) * 3.6, 0.16);
      return 13.12 + 0.6215 * T - 11.37 * vk + 0.3965 * T * vk;
    }
    const Tw = T * Math.atan(0.151977 * Math.sqrt(H + 8.313659))
      + Math.atan(T + H) - Math.atan(H - 1.67633)
      + 0.00391838 * Math.pow(H, 1.5) * Math.atan(0.023101 * H) - 4.686035;
    return -0.2442 + 0.55399 * Tw + 0.45535 * T - 0.0022 * Tw * Tw + 0.00278 * Tw * T + 3.0;
  }

  // 배경 동적 변경 (맑음/흐림)
  function applyWeatherBg(clear) {
    document.body.classList.remove("weather-clear", "weather-cloudy");
    document.body.classList.add(clear ? "weather-clear" : "weather-cloudy");
  }

  // 풍향(deg) → 8방위
  function windDir(deg) {
    if (deg == null || isNaN(deg)) return "-";
    const dirs = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
    return dirs[Math.round(Number(deg) / 45) % 8];
  }

  // KMA SKY/PTY 코드 → 한글 + Lucide
  function kmaIcon(sky, pty) {
    sky = Number(sky); pty = Number(pty);
    if (pty === 1 || pty === 4) return { label: "비", lucide: "cloud-rain" };
    if (pty === 2) return { label: "비/눈", lucide: "cloud-snow" };
    if (pty === 3) return { label: "눈", lucide: "snowflake" };
    if (sky === 1) return { label: "맑음", lucide: "sun" };
    if (sky === 3) return { label: "구름많음", lucide: "cloud-sun" };
    if (sky === 4) return { label: "흐림", lucide: "cloud" };
    return { label: "맑음", lucide: "sun" };
  }

  /* ---------------- 렌더 ---------------- */
  function renderAlert() {
    const box = $id("alertBanner");
    if (!box) return;
    const wrap = box.closest(".alert-wrap") || box;
    const a = (WX_DATA && WX_DATA.alert) || { active: false };
    if (a.active) {
      // 주의보/경보 감지 → 배너 노출
      wrap.style.display = "";
      box.className = "alert-banner is-on";
      box.innerHTML =
        `<span class="ab-ico"><i data-lucide="alert-triangle"></i></span>
         <span class="ab-text"><b>${a.area || "서울"} [${a.title}]</b> 발효 중 — ${a.message || "안전에 유의하세요."}</span>`;
      refreshIcons();
    } else {
      // 특보 없음 → 배너 숨김
      wrap.style.display = "none";
      box.className = "alert-banner is-off";
      box.innerHTML = "";
    }
  }

  function renderWxTab() {
    const body = $id("wxBody");
    if (!body) return;
    // 로딩: 스켈레톤 (가짜 데이터로 위장하지 않음)
    if (WX_STATE === "loading") { body.innerHTML = tplWxSkeleton(); return; }
    // 오류: 안내 + 재시도 버튼
    if (WX_STATE === "error" || !WX_DATA) {
      body.innerHTML = tplWxError();
      const retry = body.querySelector(".wx-error__retry");
      if (retry) retry.addEventListener("click", loadWeatherData);
      refreshIcons();
      return;
    }
    if (WX_TAB === "now") body.innerHTML = tplNow(WX_DATA.now);
    else if (WX_TAB === "hourly") body.innerHTML = tplHourly(WX_DATA.hourly);
    else body.innerHTML = tplWeekly(WX_DATA.weekly);
    refreshIcons();
  }

  // 스켈레톤 (현재 탭 레이아웃과 동일한 골격)
  function tplWxSkeleton() {
    const cells = Array(6).fill('<div class="skel wx-skel__cell"></div>').join("");
    return `<div class="wx-skel">
       <div class="wx-skel__top">
         <div class="skel wx-skel__icon"></div>
         <div class="skel wx-skel__temp"></div>
       </div>
       <div class="wx-skel__grid">${cells}</div>
     </div>`;
  }
  // 오류 상태 (재시도 가능)
  function tplWxError() {
    return `<div class="wx-error">
       <span class="wx-error__ico"><i data-lucide="cloud-off"></i></span>
       <p class="wx-error__text">날씨 정보를 불러오지 못했어요.<br>네트워크 상태를 확인해 주세요.</p>
       <button class="wx-error__retry" type="button">다시 시도</button>
     </div>`;
  }

  function tplNow(n) {
    const cell = (icon, label, val) =>
      `<div class="wx-cell">
         <span class="wx-cell__label"><i data-lucide="${icon}"></i>${label}</span>
         <span class="wx-cell__val">${val}</span>
       </div>`;
    return `<div class="wx-now">
       <div class="wx-now__top">
         <div class="wx-now__icon"><i data-lucide="${n.lucide}"></i></div>
         <div>
           <div class="wx-now__temp">${n.temp}°</div>
           <div class="wx-now__feels">체감 ${n.feels}°C · ${n.sky}</div>
         </div>
       </div>
       <div class="wx-now__grid">
         ${cell("thermometer", "최고/최저", `${n.tmx}° / ${n.tmn}°`)}
         ${cell("umbrella", "강수확률", `${n.pop}%`)}
         ${cell("cloud-rain", "강수량", `${n.rain}`)}
         ${cell("wind", "풍속", `${n.wind}m/s`)}
         ${cell("navigation", "풍향", `${n.windDir}`)}
         ${cell("droplet", "습도", `${n.humidity}%`)}
       </div>
     </div>`;
  }
  // ② 시간별: 세로 리스트 [시간 | 아이콘 | 기온 | 강수·풍속·습도]
  function tplHourly(arr) {
    const rows = (arr || []).map((h) =>
      `<div class="wx-row wx-row--h">
         <span class="wx-row__time">${h.hour}시</span>
         <span class="wx-row__ico"><i data-lucide="${h.lucide}"></i></span>
         <span class="wx-row__temp">${h.temp}°</span>
         <span class="wx-row__meta">
           <span class="wx-chip wx-chip--pop"><i data-lucide="umbrella"></i>${h.pop}%</span>
           <span class="wx-chip"><i data-lucide="wind"></i>${h.wind}㎧</span>
           <span class="wx-chip"><i data-lucide="droplet"></i>${h.humidity}%</span>
         </span>
       </div>`).join("");
    return `<div class="wx-list">${rows}</div>`;
  }
  // ③ 주간: 세로 리스트 [요일 | 오전 | 오후]
  function tplWeekly(arr) {
    const rows = (arr || []).map((d) =>
      `<div class="wx-row wx-row--w">
         <span class="wx-row__day">${d.label}</span>
         <span class="wx-wcell"><span class="wx-wcell__tag">오전</span><i data-lucide="${d.amIcon}"></i><span class="wx-wcell__pop">${d.amPop}%</span></span>
         <span class="wx-wcell"><span class="wx-wcell__tag">오후</span><i data-lucide="${d.pmIcon}"></i><span class="wx-wcell__pop">${d.pmPop}%</span></span>
       </div>`).join("");
    return `<div class="wx-list">${rows}</div>`;
  }

  /* ---------------- KMA 실호출 (GAS 프록시 경유) ---------------- */
  const p2 = (n) => String(n).padStart(2, "0");
  const round1 = (x) => Math.round(x * 10) / 10;

  // KMA 응답에서 item 배열을 안전하게 추출
  //  - resultCode 가 "00"(정상)이 아니면(NO_DATA·쿼터초과·점검 등) 명시적 오류로 던짐
  //  - item 이 단일 객체로 와도 배열로 정규화 (forEach/스프레드 안전)
  //  → 기상청 비정상 응답에 TypeError 로 죽지 않고 '오류 상태 + 재시도'로 흐르게 함
  function kmaItems_(json) {
    const r = json && json.response;
    const h = r && r.header;
    if (!h || h.resultCode !== "00") {
      throw new Error("KMA resultCode=" + (h ? h.resultCode : "?") + " " + ((h && h.resultMsg) || ""));
    }
    const item = r.body && r.body.items && r.body.items.item;
    if (!item) throw new Error("KMA no items");
    return Array.isArray(item) ? item : [item];
  }

  // GAS 프록시 URL 빌더 — 키는 서버(트윈날씨/Code.gs)에만 보관, CORS 도 해결
  function kmaUrl(service, op, params) {
    const base = (C.KMA && C.KMA.PROXY_URL) || "";
    const qs = Object.keys(params).map((k) => `${k}=${encodeURIComponent(params[k])}`).join("&");
    return `${base}${base.indexOf("?") === -1 ? "?" : "&"}service=${encodeURIComponent(service)}&op=${encodeURIComponent(op)}&${qs}`;
  }

  // 초단기실황 base: 매시 40분 이후 갱신 → 40분 여유
  function kmaUltraBase() {
    const d = new Date(Date.now() - 40 * 60000);
    return { base_date: `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`, base_time: `${p2(d.getHours())}00` };
  }
  // 단기예보 base: 02,05,08,11,14,17,20,23시 중 직전
  function kmaVilageBase() {
    const slots = [23, 20, 17, 14, 11, 8, 5, 2];
    const d = new Date(Date.now() - 10 * 60000);
    let base = slots.find((s) => d.getHours() >= s);
    if (base === undefined) { d.setDate(d.getDate() - 1); base = 23; }
    return { base_date: `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`, base_time: `${p2(base)}00` };
  }

  // ① 초단기실황 → 현재 (T1H 기온 / REH 습도 / WSD 풍속 / PTY 강수형태)
  async function fetchKmaNow() {
    const { base_date, base_time } = kmaUltraBase();
    const url = kmaUrl("VilageFcstInfoService_2.0", "getUltraSrtNcst", {
      pageNo: 1, numOfRows: 10, base_date, base_time, nx: C.KMA.NX, ny: C.KMA.NY,
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error("getUltraSrtNcst " + res.status);
    const json = await res.json();
    const items = kmaItems_(json);
    const m = {};
    items.forEach((it) => { m[it.category] = it.obsrValue; });   // 코드→값 매핑
    const T = Number(m.T1H), H = Number(m.REH), V = Number(m.WSD), PTY = Number(m.PTY);
    const RN1 = m.RN1, VEC = Number(m.VEC);
    const ic = kmaIcon(1, PTY);
    return {
      temp: Math.round(T), feels: round1(feelsLike(T, H, V)),
      humidity: H, wind: V, windDir: windDir(VEC),
      rain: (!RN1 || RN1 === "강수없음" || Number(RN1) === 0) ? "0mm" : `${RN1}mm`,
      sky: ic.label, lucide: ic.lucide, clear: PTY === 0,
      tmx: "-", tmn: "-", pop: 0,   // 단기예보에서 보강(loadWeatherData)
    };
  }

  // 오늘 최고/최저(TMX/TMN) + 현재 이후 강수확률(POP) 추출
  function parseTodayExtremes(items) {
    const now = new Date();
    const today = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}`;
    const nowKey = `${today}${p2(now.getHours())}00`;
    let tmx = null, tmn = null;
    const todayTmps = [];
    items.forEach((it) => {
      if (it.fcstDate !== today) return;
      if (it.category === "TMX") tmx = Math.round(Number(it.fcstValue));
      if (it.category === "TMN") tmn = Math.round(Number(it.fcstValue));
      if (it.category === "TMP") todayTmps.push(Number(it.fcstValue));
    });
    // TMX/TMN 미제공 시 오늘 TMP 범위로 폴백
    if (tmx == null && todayTmps.length) tmx = Math.round(Math.max(...todayTmps));
    if (tmn == null && todayTmps.length) tmn = Math.round(Math.min(...todayTmps));
    // 현재 이후 가장 가까운 POP
    const pops = items.filter((it) => it.category === "POP")
      .sort((a, b) => (a.fcstDate + a.fcstTime).localeCompare(b.fcstDate + b.fcstTime));
    const fut = pops.find((it) => (it.fcstDate + it.fcstTime) >= nowKey) || pops[0];
    return { tmx: tmx == null ? "-" : tmx, tmn: tmn == null ? "-" : tmn, pop: fut ? Number(fut.fcstValue) : 0 };
  }

  // 현재 하늘상태(SKY) — 단기예보 가장 가까운 시각 (초단기실황엔 SKY가 없어 보정)
  function parseCurrentSky(items) {
    const byTime = {};
    items.forEach((it) => {
      const k = it.fcstDate + it.fcstTime;
      (byTime[k] = byTime[k] || {})[it.category] = it.fcstValue;
    });
    const now = new Date();
    const nowKey = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}${p2(now.getHours())}00`;
    const keys = Object.keys(byTime).sort();
    const k = keys.find((x) => x >= nowKey) || keys[0];
    const o = byTime[k] || {};
    const ic = kmaIcon(o.SKY, o.PTY);
    return { sky: ic.label, lucide: ic.lucide, clear: Number(o.SKY) === 1 && Number(o.PTY || 0) === 0 };
  }

  // 날짜 YYYYMMDD
  function ymd(d) { return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`; }

  // 오늘 정확한 최고/최저 — 02시 발표분(아침 TMN 포함). 03시 이전이면 전일 23시.
  function kmaDayBase() {
    const d = new Date();
    if (d.getHours() < 3) { d.setDate(d.getDate() - 1); return { base_date: ymd(d), base_time: "2300" }; }
    return { base_date: ymd(d), base_time: "0200" };
  }
  async function fetchKmaExtremes() {
    const { base_date, base_time } = kmaDayBase();
    const url = kmaUrl("VilageFcstInfoService_2.0", "getVilageFcst", {
      pageNo: 1, numOfRows: 800, base_date, base_time, nx: C.KMA.NX, ny: C.KMA.NY,
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error("getVilageFcst(ext) " + res.status);
    const json = await res.json();
    if (!json.response || !json.response.header || json.response.header.resultCode !== "00") throw new Error("ext no data");
    const items = json.response.body.items.item;
    const today = ymd(new Date());
    let tmx = null, tmn = null;
    items.forEach((it) => {
      if (it.fcstDate !== today) return;
      if (it.category === "TMX") tmx = Math.round(Number(it.fcstValue));
      if (it.category === "TMN") tmn = Math.round(Number(it.fcstValue));
    });
    if (tmx == null && tmn == null) throw new Error("ext no tmx/tmn");
    return { tmx: tmx == null ? "-" : tmx, tmn: tmn == null ? "-" : tmn };
  }

  // ②③ 단기예보 원본 1회 호출 (시간별 + 주간 공용)
  async function fetchKmaVilageRaw() {
    const { base_date, base_time } = kmaVilageBase();
    const url = kmaUrl("VilageFcstInfoService_2.0", "getVilageFcst", {
      pageNo: 1, numOfRows: 800, base_date, base_time, nx: C.KMA.NX, ny: C.KMA.NY,
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error("getVilageFcst " + res.status);
    const json = await res.json();
    return kmaItems_(json);   // 원본 item 배열(정상 응답 검증 + 단일객체 정규화)
  }

  // ② 시간별: TMP/POP/SKY/PTY/WSD/REH → 현재 이후 10슬롯
  function parseHourly(items) {
    const byTime = {};
    items.forEach((it) => {
      const k = it.fcstDate + it.fcstTime;
      (byTime[k] = byTime[k] || { _t: it.fcstTime })[it.category] = it.fcstValue;
    });
    const now = new Date();
    const nowKey = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}${p2(now.getHours())}00`;
    return Object.keys(byTime).sort().filter((k) => k >= nowKey).slice(0, 10).map((k) => {
      const o = byTime[k]; const ic = kmaIcon(o.SKY, o.PTY);
      return {
        hour: Number(o._t.slice(0, 2)), temp: Number(o.TMP),
        pop: Number(o.POP || 0), wind: Number(o.WSD || 0), humidity: Number(o.REH || 0),
        lucide: ic.lucide,
      };
    });
  }

  // ③ 주간(단기예보 기간): 날짜별 오전/오후 대표 하늘상태·강수확률
  function parseDaily(items) {
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const byDate = {};
    items.forEach((it) => {
      byDate[it.fcstDate] = byDate[it.fcstDate] || { am: {}, pm: {} };
      const slot = Number(it.fcstTime.slice(0, 2)) < 12 ? "am" : "pm";
      byDate[it.fcstDate][slot][it.category] = it.fcstValue;
    });
    const now = new Date();
    const today = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}`;
    return Object.keys(byDate).sort().filter((d) => d >= today).slice(0, 5).map((d) => {
      const o = byDate[d];
      const am = kmaIcon(o.am.SKY || o.pm.SKY, o.am.PTY || 0);
      const pm = kmaIcon(o.pm.SKY || o.am.SKY, o.pm.PTY || 0);
      const dt = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
      return {
        label: `${dt.getMonth() + 1}.${dt.getDate()}(${days[dt.getDay()]})`,
        amIcon: am.lucide, pmIcon: pm.lucide,
        amPop: Number(o.am.POP || 0), pmPop: Number(o.pm.POP || 0),
      };
    });
  }

  // ④ 기상특보 현황 (getWthrWrnMsg) → 주의보/경보 포함 시 배너 노출
  async function fetchKmaAlert() {
    const url = kmaUrl("WthrWrnInfoService", "getWthrWrnMsg", {
      pageNo: 1, numOfRows: 10, stnId: (C.KMA && C.KMA.STN_ID) || 109,
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error("getWthrWrnMsg " + res.status);
    const json = await res.json();
    const header = json.response && json.response.header;
    // resultCode "03"(NO_DATA) = 발효 특보 없음 → 미발령으로 처리
    if (!header || header.resultCode !== "00") return { active: false };
    const body = json.response.body;
    let item = body && body.items && body.items.item;
    if (!item) return { active: false };
    if (Array.isArray(item)) item = item[0];
    // t6: 현재 발효 특보, t7: 예비특보, other: 기타문구
    const text = (item && (item.t6 || item.t7 || item.other || "")) || "";
    return parseAlertText(text);
  }

  // 특보 문장 파싱 → {active, title, level}
  function parseAlertText(text) {
    if (!text || !/(경보|주의보)/.test(text)) return { active: false };
    const m = text.match(/([가-힣]{2,}(?:경보|주의보))/);   // 예: "강풍주의보"
    const title = m ? m[1] : (/경보/.test(text) ? "기상경보" : "기상주의보");
    const level = /경보/.test(title) ? "경보" : "주의보";
    return { active: true, level, title, area: "서울·영등포", message: "현장 안전에 유의하세요." };
  }

  /* ---------------- 샘플 데이터 (키 없을 때 UI 표시용) ---------------- */
  function sampleWx() {
    const T = 26, H = 55, V = 2.3;
    return {
      now: {
        temp: T, feels: round1(feelsLike(T, H, V)), humidity: H, wind: V,
        windDir: "북서", rain: "0mm", sky: "맑음", lucide: "sun", clear: true,
        tmx: 28, tmn: 19, pop: 20,
      },
      hourly: sampleHourly(),
      weekly: sampleWeekly(),
      alert: { active: false },   // 폴백 시 특보 미발령 (배너 숨김)
    };
  }
  function sampleHourly() {
    const base = new Date();
    const temps = [26, 27, 27, 26, 25, 24, 23, 22, 21, 21];
    const pops  = [0, 0, 10, 20, 30, 20, 10, 0, 0, 10];
    const winds = [2.1, 2.4, 2.8, 3.1, 3.5, 2.9, 2.2, 1.8, 1.6, 1.5];
    const hums  = [52, 50, 55, 60, 68, 64, 58, 55, 57, 60];
    const ics = ["sun", "cloud-sun", "cloud", "cloud", "cloud-rain", "cloud", "cloud-sun", "moon", "moon", "cloud"];
    return temps.map((t, i) => {
      const h = new Date(base.getTime() + (i + 1) * 3600000);
      return { hour: h.getHours(), temp: t, pop: pops[i], wind: winds[i], humidity: hums[i], lucide: ics[i] };
    });
  }
  function sampleWeekly() {
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const base = new Date();
    const data = [
      ["sun", "sun", 0, 10], ["cloud-sun", "cloud", 10, 30], ["cloud", "cloud-rain", 30, 60],
      ["cloud-rain", "cloud-rain", 70, 80], ["cloud", "cloud-sun", 40, 20], ["sun", "sun", 0, 0], ["cloud-sun", "cloud", 10, 20],
    ];
    return data.map((x, i) => {
      const d = new Date(base.getTime() + (i + 1) * 86400000);
      return { label: `${d.getMonth() + 1}.${d.getDate()}(${days[d.getDay()]})`, amIcon: x[0], pmIcon: x[1], amPop: x[2], pmPop: x[3] };
    });
  }

  /* ---------------- [중단 우] 공지 피드 (구글 시트 + GAS 연동) ----------------
   *  - 목록: NOTICE_URL(GAS) 에서 GET 으로 불러와 표시. 미설정/실패 시 config 샘플.
   *  - 편집: '편집' 버튼 → 비밀번호(GET auth) → 편집기(작성/수정/삭제) → 저장(POST).
   *    · 비밀번호는 시트 [설정] B1 에서 검증(코드에 노출 안 됨).
   *    · POST 는 GAS 리다이렉트 CORS 때문에 no-cors(응답 못 읽음) → 저장 후 재조회로 확인.
   * ------------------------------------------------------------------------ */
  let NOTICE_CACHE = [];   // 마지막으로 불러온 공지 목록(편집기 초기값)

  // 오늘 날짜를 "MM.DD" 로 (새 공지의 날짜 자동 입력용)
  function todayStr() {
    const d = new Date();
    return String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  // 마지막으로 성공한 공지 목록(localStorage) — 재방문 시 GAS 응답(1~2초)을
  // 기다리지 않고 즉시 표시하기 위한 로컬 캐시
  const NOTICE_LS_KEY = "twin_notice_lastok";
  function readNoticeLs() {
    try {
      const a = JSON.parse(localStorage.getItem(NOTICE_LS_KEY) || "null");
      return Array.isArray(a) ? a : null;
    } catch (e) { return null; }
  }

  function renderNoticeFeed() {
    const list = $id("noticeFeed");
    if (!list) return;

    // 1) 마지막 성공 목록이 있으면 즉시 표시 (없으면 로딩 문구 — 옛 샘플로 위장 안 함)
    const cachedLs = readNoticeLs();
    if (cachedLs && cachedLs.length) {
      NOTICE_CACHE = cachedLs;
      paintNotices(cachedLs);
      updateBellBadge();
    } else {
      list.innerHTML = `<li class="feed__item"><span class="feed__text" style="color:#9ca3af;">공지사항을 불러오는 중…</span></li>`;
      NOTICE_CACHE = (C.HOME_DATA.notices || []).slice();   // 편집기 초기값/폴백용으로만 보관
    }

    // 2) 백그라운드로 NOTICE_URL 재조회 → 성공 시 최신값으로 교체.
    //    실패(null)면: 캐시를 보여준 상태면 유지, 아니면 config 샘플로 폴백
    fetchNotices().then((arr) => {
      if (arr) { NOTICE_CACHE = arr; paintNotices(arr); }
      else if (!cachedLs || !cachedLs.length) { paintNotices(NOTICE_CACHE); }
      updateBellBadge();   // 미확인 공지 수 → 벨 배지 갱신
    });

    // 3) '편집' 버튼 → 비밀번호 → 편집기 (중복 바인딩 방지)
    const edit = $id("noticeEdit");
    if (edit && !edit.dataset.bound) {
      edit.dataset.bound = "1";
      edit.addEventListener("click", openNoticeAuth);
    }
  }

  // 공지 목록을 화면에 그림(상위 3건). 제목은 textContent 로 넣어 안전 처리.
  // 제목을 누르면 제목+내용 읽기 팝업이 뜸.
  function paintNotices(notices) {
    const list = $id("noticeFeed");
    if (!list) return;
    list.innerHTML = "";
    if (!notices.length) {
      const empty = el(`<li class="feed__item"><span class="feed__text" style="color:#9ca3af;">등록된 공지가 없습니다.</span></li>`);
      list.appendChild(empty);
      return;
    }
    notices.slice(0, 3).forEach((n) => {
      const item = el(`<li class="feed__item" style="cursor:pointer;"><span class="feed__dot"></span><span class="feed__text"></span></li>`);
      item.querySelector(".feed__text").textContent = n.title;
      // 미확인 공지는 점을 빨갛게 + 제목을 진하게 표시
      if (!isNoticeRead(n)) {
        item.querySelector(".feed__dot").style.background = "#ef4444";
        item.querySelector(".feed__text").style.fontWeight = "700";
        item.querySelector(".feed__text").style.color = "var(--c-text)";
      }
      item.addEventListener("click", () => openNoticeView(n));
      list.appendChild(item);
    });
  }

  // 공지 읽기 팝업 — 제목 + 날짜 + 내용 전체 표시 (읽기 전용)
  function openNoticeView(n) {
    const root = $id("overlayRoot");
    const modal = el(
      `<div class="overlay" style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(17,24,39,0.45);backdrop-filter:blur(2px);padding:24px;animation:fadeIn .2s ease;">
         <div style="background:#fff;border-radius:22px;padding:24px 22px;max-width:440px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.2);animation:popIn .25s ease;">
           <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px;">
             <h3 class="nv-title" style="font-size:17px;font-weight:800;letter-spacing:-0.02em;line-height:1.4;word-break:break-word;"></h3>
             <button class="nv-close" type="button" aria-label="닫기" style="flex:none;width:30px;height:30px;border-radius:9px;background:#f3f4f6;color:#6b7280;display:grid;place-items:center;border:none;cursor:pointer;"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
           </div>
           <div class="nv-date" style="font-size:12.5px;color:#9ca3af;font-weight:600;margin-bottom:14px;"></div>
           <div class="nv-content" style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;word-break:break-word;overflow-y:auto;flex:1;"></div>
         </div>
       </div>`
    );
    modal.querySelector(".nv-title").textContent   = n.title || "";
    modal.querySelector(".nv-date").textContent    = n.date || "";
    modal.querySelector(".nv-content").textContent = n.content || "내용이 없습니다.";
    const close = () => (root.innerHTML = "");
    modal.querySelector(".nv-close").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    root.appendChild(modal); refreshIcons();

    markNoticeRead(n);   // 열어봤으니 '확인함' 처리 → 배지/하이라이트 갱신
  }

  /* ---------------- 미확인 공지 배지(인앱 알림 표시) ----------------
   *  - 공지는 고유 ID 가 없어 '날짜|제목' 을 서명(signature)으로 사용.
   *  - 사용자가 '연' 공지의 서명을 localStorage 에 저장 → 없는 공지 = 미확인.
   *  - 서버/네트워크 불필요(완전 클라이언트). 기기별로 따로 관리됨.
   * ------------------------------------------------------------------- */
  const NOTICE_SEEN_KEY = "twin_notice_seen";

  function noticeSig(n) {
    return String((n && n.date) || "") + "|" + String((n && n.title) || "");
  }
  function getSeenSet() {
    try { return new Set(JSON.parse(localStorage.getItem(NOTICE_SEEN_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveSeenSet(set) {
    try { localStorage.setItem(NOTICE_SEEN_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
  }
  function isNoticeRead(n) { return getSeenSet().has(noticeSig(n)); }

  function markNoticeRead(n) {
    const set = getSeenSet();
    set.add(noticeSig(n));
    saveSeenSet(set);
    paintNotices(NOTICE_CACHE);   // 피드의 빨간 점/굵기 갱신
    updateBellBadge();
  }
  function markAllNoticesRead() {
    const set = getSeenSet();
    (NOTICE_CACHE || []).forEach((n) => set.add(noticeSig(n)));
    saveSeenSet(set);
    paintNotices(NOTICE_CACHE);
    updateBellBadge();
  }
  function unreadNotices() {
    const set = getSeenSet();
    return (NOTICE_CACHE || []).filter((n) => !set.has(noticeSig(n)));
  }

  // 헤더 벨 버튼에 빨간 배지(미확인 개수) 표시 / 0 이면 숨김
  function updateBellBadge() {
    const bell = $id("btnBell");
    if (!bell) return;
    const count = unreadNotices().length;
    let badge = bell.querySelector(".bell-badge");
    if (count <= 0) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = el(`<span class="bell-badge"></span>`);
      bell.appendChild(badge);
    }
    badge.textContent = count > 9 ? "9+" : String(count);
  }

  // 벨 클릭 → 알림 패널(휴대폰 알림 토글 + 공지 목록 + 모두 읽음)
  function openNoticePanel() {
    const root = $id("overlayRoot");
    const modal = el(
      `<div class="overlay" style="position:fixed;inset:0;z-index:60;display:flex;align-items:flex-start;justify-content:center;background:rgba(17,24,39,0.4);backdrop-filter:blur(2px);padding:64px 18px 18px;animation:fadeIn .2s ease;">
         <div style="background:#fff;border-radius:22px;padding:18px 16px;max-width:420px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.2);animation:popIn .25s ease;">
           <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
             <h3 style="font-size:16.5px;font-weight:800;letter-spacing:-0.02em;display:flex;align-items:center;gap:7px;"><i data-lucide="bell" style="width:17px;height:17px;"></i> 알림</h3>
             <button class="np-close" type="button" aria-label="닫기" style="width:30px;height:30px;border-radius:9px;background:#f3f4f6;color:#6b7280;display:grid;place-items:center;border:none;cursor:pointer;"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
           </div>
           <div class="np-push" style="margin-bottom:12px;"></div>
           <div class="np-list" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px;"></div>
           <button class="np-readall" type="button" style="margin-top:12px;padding:11px;border-radius:14px;background:#f3f4f6;color:#374151;font-size:13.5px;font-weight:700;">모두 읽음으로 표시</button>
         </div>
       </div>`
    );
    const close = () => (root.innerHTML = "");
    modal.querySelector(".np-close").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    // 공지 목록 렌더(미확인 = 빨간 점 + 굵게). 클릭 → 상세 보기(자동 읽음 처리)
    const listBox = modal.querySelector(".np-list");
    const renderRows = () => {
      listBox.innerHTML = "";
      const arr = NOTICE_CACHE || [];
      if (!arr.length) {
        listBox.appendChild(el(`<div style="padding:24px 0;text-align:center;color:#9ca3af;font-size:13px;">등록된 공지가 없습니다.</div>`));
        return;
      }
      arr.slice(0, 20).forEach((n) => {
        const unread = !isNoticeRead(n);
        const row = el(
          `<button type="button" style="display:flex;align-items:flex-start;gap:9px;text-align:left;width:100%;padding:11px 12px;border-radius:13px;border:1px solid ${unread ? "#fee2e2" : "#eef0f4"};background:${unread ? "#fff7f7" : "#fafbfc"};cursor:pointer;">
             <span style="flex:none;width:7px;height:7px;border-radius:50%;margin-top:5px;background:${unread ? "#ef4444" : "#d1d5db"};"></span>
             <span style="flex:1;min-width:0;">
               <span class="np-row-title" style="display:block;font-size:13.5px;font-weight:${unread ? "700" : "500"};color:${unread ? "#111827" : "#6b7280"};line-height:1.4;word-break:break-word;"></span>
               <span class="np-row-date" style="display:block;font-size:11.5px;color:#9ca3af;font-weight:600;margin-top:2px;"></span>
             </span>
           </button>`
        );
        row.querySelector(".np-row-title").textContent = n.title || "(제목 없음)";
        row.querySelector(".np-row-date").textContent = n.date || "";
        row.addEventListener("click", () => { close(); openNoticeView(n); });
        listBox.appendChild(row);
      });
    };
    renderRows();

    modal.querySelector(".np-readall").addEventListener("click", () => {
      markAllNoticesRead();
      renderRows();
      toast("모든 공지를 읽음으로 표시했어요");
    });

    // 휴대폰 푸시 토글 영역(설정/지원 상태에 따라 다르게 표시)
    buildPushRow(modal.querySelector(".np-push"));

    root.appendChild(modal); refreshIcons();
  }

  /* ---------------- 휴대폰 푸시 알림 (Firebase Cloud Messaging) ----------------
   *  - config.js 의 FIREBASE_CONFIG + FCM_VAPID_KEY 가 설정돼야 동작
   *    (미설정 시 알림 토글 자체를 숨기고 인앱 배지만 동작).
   *  - 구독: 알림 권한 → FCM 토큰 발급 → GAS(NOTICE_URL)에 토큰 등록(시트 저장).
   *  - 발송: 새 공지 저장 시 서버([트윈공지/Code.gs])가 FCM HTTP v1 API 로 처리.
   *  - iOS 는 홈 화면 설치 PWA + iOS 16.4+ 에서만 가능 → 안내 표시.
   * ------------------------------------------------------------------- */
  const FB = C.FIREBASE || {};
  const FCM_SDK_VER  = "10.12.2";                 // Firebase compat SDK 버전 (firebase-messaging-sw.js 와 맞출 것)
  const FCM_ON_KEY   = "twin_fcm_on";             // 사용자가 알림을 켰는지 (localStorage)
  const FCM_TOK_KEY  = "twin_fcm_token";          // 서버에 등록해 둔 마지막 토큰
  let FCM_MESSAGING  = null;                      // firebase.messaging() 인스턴스 (초기화 성공 시)
  let FCM_SW_REG     = null;                      // FCM 전용 서비스워커 등록 객체

  function pushConfigured() {
    const bad = (v) => !v || String(v).indexOf("PLACEHOLDER") !== -1;
    const cfg = FB.config || {};
    return !bad(cfg.apiKey) && !bad(cfg.projectId) && !bad(cfg.messagingSenderId) && !bad(FB.vapidKey);
  }
  function pushBrowserSupported() {
    return ("serviceWorker" in navigator) && ("PushManager" in window) && ("Notification" in window);
  }
  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
           navigator.standalone === true;
  }
  function pushIosNeedsInstall() { return isIos() && !isStandalone(); }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.defer = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error("스크립트 로드 실패: " + src));
      document.head.appendChild(s);
    });
  }

  // Firebase SDK 동적 로드 + 초기화 (설정 & 브라우저 지원 시에만)
  async function initPush() {
    if (!pushConfigured() || !pushBrowserSupported()) return;
    try {
      await loadScript(`https://www.gstatic.com/firebasejs/${FCM_SDK_VER}/firebase-app-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${FCM_SDK_VER}/firebase-messaging-compat.js`);
      firebase.initializeApp(FB.config);
      FCM_MESSAGING = firebase.messaging();

      // 우리 sw.js(오프라인 캐시, 루트 스코프)와 충돌하지 않도록
      // FCM 전용 워커는 별도 스코프로 등록 (FCM 기본 방식과 동일한 스코프명)
      FCM_SW_REG = await navigator.serviceWorker.register("firebase-messaging-sw.js", {
        scope: "./firebase-cloud-messaging-push-scope",
      });

      // 앱이 열려 있을 때(포그라운드) 푸시 수신 → 토스트 + 공지 목록 새로고침
      FCM_MESSAGING.onMessage((payload) => {
        const n = (payload && payload.notification) || {};
        toast(n.title ? `${n.title}${n.body ? " — " + n.body : ""}` : "새 공지가 도착했어요");
        renderNoticeFeed();
      });

      // 이미 알림을 켠 사용자는 토큰이 갱신됐을 수 있으니 조용히 재확인
      refreshFcmToken();
    } catch (e) {
      console.warn("[푸시] FCM 초기화 실패:", e);
    }
  }

  async function pushIsOn() {
    return pushConfigured() &&
           Notification.permission === "granted" &&
           localStorage.getItem(FCM_ON_KEY) === "1";
  }

  async function pushEnable() {
    if (!FCM_MESSAGING) throw new Error("FCM 초기화 전");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
    const token = await FCM_MESSAGING.getToken({
      vapidKey: FB.vapidKey,
      serviceWorkerRegistration: FCM_SW_REG,
    });
    if (!token) return false;
    await sendTokenToServer(token, "subscribe");
    try {
      localStorage.setItem(FCM_ON_KEY, "1");
      localStorage.setItem(FCM_TOK_KEY, token);
    } catch (e) {}
    return true;
  }

  async function pushDisable() {
    const token = localStorage.getItem(FCM_TOK_KEY) || "";
    try { if (FCM_MESSAGING) await FCM_MESSAGING.deleteToken(); } catch (e) {}
    if (token) await sendTokenToServer(token, "unsubscribe");
    try {
      localStorage.setItem(FCM_ON_KEY, "0");
      localStorage.removeItem(FCM_TOK_KEY);
    } catch (e) {}
  }

  // 앱 시작 시: 구독 중인데 토큰이 바뀌었으면 서버 등록을 최신 토큰으로 교체
  async function refreshFcmToken() {
    try {
      if (!(await pushIsOn())) return;
      const token = await FCM_MESSAGING.getToken({
        vapidKey: FB.vapidKey,
        serviceWorkerRegistration: FCM_SW_REG,
      });
      const old = localStorage.getItem(FCM_TOK_KEY) || "";
      if (token && token !== old) {
        if (old) sendTokenToServer(old, "unsubscribe");
        await sendTokenToServer(token, "subscribe");
        try { localStorage.setItem(FCM_TOK_KEY, token); } catch (e) {}
      }
    } catch (e) {
      console.warn("[푸시] 토큰 갱신 실패:", e);
    }
  }

  // 토큰 등록/해제를 GAS(트윈공지)로 전송
  //  - GAS 리다이렉트 CORS 때문에 no-cors POST (공지 저장과 동일한 방식)
  async function sendTokenToServer(token, action) {
    const url = C.NOTICE_URL || "";
    if (!url || url.indexOf("PLACEHOLDER") !== -1) return;
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, token }),
    });
  }

  // 알림 패널 안의 '휴대폰 알림 받기' 영역 구성
  function buildPushRow(box) {
    if (!box) return;
    // 1) 푸시 미설정(APP_ID 없음) → 영역 자체를 비움(기능 숨김)
    if (!pushConfigured()) { box.innerHTML = ""; return; }
    // 2) 브라우저 미지원
    if (!pushBrowserSupported()) {
      box.innerHTML = `<div style="padding:12px 14px;border-radius:13px;background:#f9fafb;color:#9ca3af;font-size:12.5px;">이 브라우저는 알림을 지원하지 않습니다.</div>`;
      return;
    }
    // 3) iOS 미설치 → 홈 화면 추가 안내
    if (pushIosNeedsInstall()) {
      box.innerHTML = `<div style="padding:12px 14px;border-radius:13px;background:#eff6ff;color:#1d4ed8;font-size:12.5px;line-height:1.6;"><b>아이폰 알림 안내</b><br>공유 버튼 → '홈 화면에 추가'로 앱을 설치하면 휴대폰 알림을 받을 수 있어요.</div>`;
      return;
    }
    // 4) 정상 → 토글 버튼
    box.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:13px;background:#f5f3ff;border:1px solid #ede9fe;">
         <span style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700;color:#4338ca;"><i data-lucide="bell-ring" style="width:16px;height:16px;"></i> 휴대폰 알림 받기</span>
         <button class="np-toggle" type="button" aria-pressed="false" style="flex:none;width:46px;height:26px;border-radius:999px;background:#d1d5db;position:relative;transition:background .2s;cursor:pointer;border:none;">
           <span style="position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.25);"></span>
         </button>
       </div>
       <p class="np-toggle-hint" style="font-size:11.5px;color:#9ca3af;margin:7px 2px 0;">새 공지가 올라오면 휴대폰으로 알려드려요.</p>`;
    const toggle = box.querySelector(".np-toggle");
    const knob = toggle.querySelector("span");
    const paint = (on) => {
      toggle.setAttribute("aria-pressed", on ? "true" : "false");
      toggle.style.background = on ? "#4f46e5" : "#d1d5db";
      knob.style.left = on ? "23px" : "3px";
    };
    // 현재 구독 상태 반영
    pushIsOn().then(paint);

    let busy = false;
    toggle.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      const turningOn = toggle.getAttribute("aria-pressed") !== "true";
      try {
        if (turningOn) {
          const ok = await pushEnable();
          if (ok) { paint(true); toast("휴대폰 알림이 켜졌어요"); }
          else { paint(false); toast("알림 권한이 거부되어 있어요. 브라우저 설정에서 허용해 주세요"); }
        } else {
          await pushDisable();
          paint(false);
          toast("휴대폰 알림을 껐어요");
        }
      } catch (e) {
        console.warn("[푸시] 토글 실패:", e);
        toast("알림 설정에 실패했어요. 잠시 후 다시 시도해 주세요");
      } finally { busy = false; }
    });
  }

  // GAS 에서 공지 목록 GET (미설정/실패 시 null → 기존 표시 유지)
  //  ※ 캐시 무력화: 매 요청마다 t=타임스탬프 + cache:"no-store" 로 항상 최신값을 받음.
  //    (이게 없으면 브라우저가 동일 URL 응답을 디스크 캐시 → 옛 공지가 계속 떠서
  //     "새로고침 여러 번 해야 갱신" 증상이 생김)
  async function fetchNotices() {
    const url = C.NOTICE_URL || "";
    if (!url || url.indexOf("PLACEHOLDER") !== -1) return null;
    try {
      const sep = url.indexOf("?") === -1 ? "?" : "&";
      const res = await fetch(url + sep + "action=list&t=" + Date.now(), { cache: "no-store" });
      const json = await res.json();
      if (json.result === "ok" && Array.isArray(json.notices)) {
        // 성공 목록을 로컬에 보관 → 다음 방문 때 즉시 표시 (편집 저장 재조회 포함)
        try { localStorage.setItem(NOTICE_LS_KEY, JSON.stringify(json.notices.slice(0, 30))); } catch (e) {}
        return json.notices;
      }
    } catch (err) {
      console.warn("[공지] 목록 불러오기 실패:", err);
    }
    return null;
  }

  // 편집 진입 — 관리자 비밀번호 입력 모달
  function openNoticeAuth() {
    const url = C.NOTICE_URL || "";
    if (!url || url.indexOf("PLACEHOLDER") !== -1) {
      toast("공지 연동 주소가 아직 설정되지 않았어요 (config.js NOTICE_URL)");
      return;
    }
    const root = $id("overlayRoot");
    const modal = el(
      `<div class="overlay" style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(17,24,39,0.4);backdrop-filter:blur(2px);padding:28px;animation:fadeIn .2s ease;">
         <div style="background:rgba(255,255,255,0.92);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);border:1px solid rgba(255,255,255,0.5);border-radius:22px;padding:26px 22px;max-width:330px;width:100%;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.18);animation:popIn .25s ease;">
           <div style="width:50px;height:50px;margin:0 auto 14px;display:grid;place-items:center;border-radius:16px;background:var(--c-primary-soft);color:var(--c-icon-on);"><i data-lucide="lock" style="width:24px;height:24px;"></i></div>
           <h3 style="font-size:16px;font-weight:800;margin-bottom:6px;letter-spacing:-0.02em;">공지글 편집</h3>
           <p style="font-size:13px;color:#6b7280;margin-bottom:16px;">관리자 비밀번호를 입력하세요.</p>
           <input id="notice-pw" type="password" autocomplete="off" placeholder="비밀번호"
             style="width:100%;padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px;font-size:14px;margin-bottom:14px;box-sizing:border-box;" />
           <button class="np-ok" type="button" style="width:100%;padding:12px;border-radius:14px;background:#4f46e5;color:#fff;font-size:14px;font-weight:700;">확인</button>
           <button class="np-cancel" type="button" style="width:100%;padding:11px;margin-top:8px;border-radius:14px;background:transparent;color:#6b7280;font-size:13.5px;font-weight:600;">취소</button>
         </div>
       </div>`
    );
    const close = () => (root.innerHTML = "");
    const submit = async () => {
      const pw = (modal.querySelector("#notice-pw").value || "").trim();
      if (!pw) { toast("비밀번호를 입력하세요"); return; }
      const okBtn = modal.querySelector(".np-ok");
      okBtn.disabled = true; okBtn.textContent = "확인 중...";
      const ok = await verifyNoticePw(pw);
      okBtn.disabled = false; okBtn.textContent = "확인";
      if (!ok) { toast("비밀번호가 올바르지 않습니다"); return; }
      close();
      openNoticeEditor(pw);
    };
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector(".np-ok").addEventListener("click", submit);
    modal.querySelector(".np-cancel").addEventListener("click", close);
    modal.querySelector("#notice-pw").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    root.appendChild(modal); refreshIcons();
    setTimeout(() => { const i = modal.querySelector("#notice-pw"); if (i) i.focus(); }, 50);
  }

  // 비밀번호 확인 (GET auth → 응답을 읽어 valid 판정)
  async function verifyNoticePw(pw) {
    const url = C.NOTICE_URL || "";
    try {
      const sep = url.indexOf("?") === -1 ? "?" : "&";
      const res = await fetch(url + sep + "action=auth&t=" + Date.now() + "&pw=" + encodeURIComponent(pw), { cache: "no-store" });
      const json = await res.json();
      return json.result === "ok" && json.valid === true;
    } catch (err) {
      console.error("[공지] 비밀번호 확인 실패:", err);
      toast("서버 연결에 실패했어요");
      return false;
    }
  }

  // 공지 편집기 — 행 단위 작성/수정/삭제 후 전체 저장
  function openNoticeEditor(pw) {
    const root = $id("overlayRoot");
    const modal = el(
      `<div class="overlay" style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(17,24,39,0.45);backdrop-filter:blur(2px);padding:20px;animation:fadeIn .2s ease;">
         <div style="background:#fff;border-radius:22px;padding:22px 20px;max-width:480px;width:100%;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.2);animation:popIn .25s ease;">
           <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
             <h3 style="font-size:16.5px;font-weight:800;letter-spacing:-0.02em;">공지사항 편집</h3>
             <button class="ne-add" type="button" style="font-size:13px;font-weight:700;color:#4f46e5;background:#eef2ff;border-radius:999px;padding:7px 14px;">+ 추가</button>
           </div>
           <div class="ne-rows" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px;padding:2px;"></div>
           <div style="display:flex;gap:8px;margin-top:16px;">
             <button class="ne-cancel" type="button" style="flex:1;padding:12px;border-radius:14px;background:#f3f4f6;color:#374151;font-size:14px;font-weight:700;">취소</button>
             <button class="ne-save" type="button" style="flex:2;padding:12px;border-radius:14px;background:#4f46e5;color:#fff;font-size:14px;font-weight:700;">저장</button>
           </div>
         </div>
       </div>`
    );
    const rowsBox = modal.querySelector(".ne-rows");

    const addRow = (n) => {
      n = n || { title: "", date: "", content: "" };
      const row = el(
        `<div class="ne-row" style="border:1px solid #eef0f4;border-radius:14px;padding:12px;background:#fafbfc;position:relative;">
           <button class="ne-del" type="button" title="삭제" style="position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:8px;background:#fef2f2;color:#dc2626;display:grid;place-items:center;border:none;cursor:pointer;"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>
           <input class="ne-title" type="text" placeholder="제목" style="width:calc(100% - 34px);padding:9px 11px;border:1px solid #e5e7eb;border-radius:10px;font-size:13.5px;margin-bottom:8px;box-sizing:border-box;" />
           <textarea class="ne-content" rows="3" placeholder="내용을 입력하세요" style="width:100%;padding:9px 11px;border:1px solid #e5e7eb;border-radius:10px;font-size:13.5px;line-height:1.6;box-sizing:border-box;resize:vertical;min-height:72px;font-family:inherit;"></textarea>
         </div>`
      );
      row.querySelector(".ne-title").value   = n.title || "";
      row.querySelector(".ne-content").value = n.content || "";
      row.dataset.date = n.date || "";   // 기존 날짜 보존(저장 시 사용)
      row.querySelector(".ne-del").addEventListener("click", () => row.remove());
      rowsBox.appendChild(row);
      return row;
    };

    // 기존 공지로 채우되, 비어 있으면 빈 행 1개로 시작
    (NOTICE_CACHE.length ? NOTICE_CACHE : [{ title: "", date: "", content: "" }]).forEach(addRow);

    const close = () => (root.innerHTML = "");
    modal.querySelector(".ne-add").addEventListener("click", () => {
      const r = addRow();
      rowsBox.scrollTop = rowsBox.scrollHeight;
      refreshIcons();
      r.querySelector(".ne-title").focus();
    });
    modal.querySelector(".ne-cancel").addEventListener("click", close);
    modal.querySelector(".ne-save").addEventListener("click", async () => {
      const notices = [];
      rowsBox.querySelectorAll(".ne-row").forEach((row) => {
        const title   = row.querySelector(".ne-title").value.trim();
        const content = row.querySelector(".ne-content").value.trim();
        const date    = row.dataset.date || todayStr();       // 기존 날짜 유지, 새 글은 오늘 날짜 자동
        if (title) notices.push({ title, content, date });    // 제목 없는 행은 저장 제외
      });
      const saveBtn = modal.querySelector(".ne-save");
      saveBtn.disabled = true; saveBtn.textContent = "저장 중...";
      const ok = await saveNotices(pw, notices);
      if (ok) {
        paintNotices(NOTICE_CACHE);                            // 재조회로 최신화된 캐시 반영
        close();
        toast("공지사항이 저장되었습니다");
      } else {
        saveBtn.disabled = false; saveBtn.textContent = "저장";
        toast("저장에 실패했어요. 다시 시도해 주세요");
      }
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    root.appendChild(modal); refreshIcons();
  }

  // 전체 저장 (POST no-cors) → 잠시 후 재조회로 실제 저장 결과 반영
  async function saveNotices(pw, notices) {
    const url = C.NOTICE_URL || "";
    if (!url || url.indexOf("PLACEHOLDER") !== -1) return false;
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ pw, notices }),
      });
      // no-cors 는 응답을 못 읽으므로, 잠시 후 목록을 다시 읽어 '실제로 저장됐는지' 확인.
      //  (서버는 저장 직후 캐시를 무효화하고, read-back 은 cache-bust 로 최신값을 받음)
      //  ※ 시트 쓰기 반영에 필요한 최소 시간만 대기(과거 1400ms → 500ms 로 단축).
      await new Promise((r) => setTimeout(r, 500));
      const fresh = await fetchNotices();
      if (!fresh) { NOTICE_CACHE = notices; return true; }   // read-back 실패: 네트워크 예외 없으니 접수로 간주
      NOTICE_CACHE = fresh;
      // 보낸 제목 목록과 시트에 반영된 제목 목록을 비교(서버는 제목을 200자로 자르므로 동일 기준)
      const norm = (arr) => arr.map((n) => String(n.title || "").slice(0, 200)).join("");
      return norm(notices) === norm(fresh);
    } catch (err) {
      console.error("[공지] 저장 실패:", err);
      return false;
    }
  }

  /* ---------------- [하단] To-Do 피드 (필터 + 기억) ---------------- */
  const TODO_PART_KEY = "twinwork_todo_part";   // localStorage 키

  function initTodos() {
    // 1) 필터 드롭다운 옵션 채우기
    const sel = $id("todoFilter");
    const parts = C.HOME_DATA.todoParts || [{ value: "all", label: "전체" }];
    if (sel) {
      sel.innerHTML = "";
      parts.forEach((p) => {
        sel.appendChild(el(`<option value="${p.value}">${p.label}</option>`));
      });
      // 2) 저장된 파트 복원 (없으면 all). 저장값이 옵션에 없으면 all로 폴백
      const saved = localStorage.getItem(TODO_PART_KEY) || "all";
      sel.value = parts.some((p) => p.value === saved) ? saved : "all";
      // 3) 변경 시 저장 + 다시 그리기
      sel.addEventListener("change", () => {
        localStorage.setItem(TODO_PART_KEY, sel.value);
        renderTodoList();
      });
    }
    // 4) 전체보기 → 트윈 To-Do(MENU-02)로 라우팅
    const more = $id("todoMore");
    if (more) more.addEventListener("click", () => gotoService("MENU-02"));

    renderTodoList();
  }

  function currentPart() {
    const sel = $id("todoFilter");
    return sel ? sel.value : "all";
  }

  function renderTodoList() {
    const list = $id("todoList");
    if (!list) return;
    const part = currentPart();
    const all = C.HOME_DATA.todos || [];
    const todos = part === "all" ? all : all.filter((t) => t.part === part);

    list.innerHTML = "";
    if (todos.length === 0) {
      list.appendChild(el(
        `<li class="todo-empty">
           <span class="todo-empty__ico"><i data-lucide="clipboard-check"></i></span>
           <span class="todo-empty__text">현재 등록된 중요 전달사항이 없습니다.</span>
         </li>`
      ));
    } else {
      todos.forEach((t) => {
        const item = el(
          `<li class="todo-item ${t.done ? "is-done" : ""}">
             <button class="todo-check" type="button" aria-label="완료 토글">
               <i data-lucide="check"></i>
             </button>
             <div style="flex:1;min-width:0;">
               <div class="todo-item__text">${t.title}</div>
               <div class="todo-item__from">${t.from || ""}${t.part ? " · " + t.part : ""}</div>
             </div>
             <span class="pri pri--${t.priority || "Low"}">${t.priority || "Low"}</span>
           </li>`
        );
        item.querySelector(".todo-check").addEventListener("click", () => {
          t.done = !t.done;
          item.classList.toggle("is-done", t.done);
          updateTodoBadge();
        });
        list.appendChild(item);
      });
    }
    updateTodoBadge();
    refreshIcons();   // 새로 그린 체크 아이콘 변환
  }

  // 현재 필터된 목록 기준 미결 건수
  function updateTodoBadge() {
    const part = currentPart();
    const all = C.HOME_DATA.todos || [];
    const scope = part === "all" ? all : all.filter((t) => t.part === part);
    const open = scope.filter((t) => !t.done).length;

    const badge = $id("todoBadge");
    if (badge) badge.textContent = `미결 ${open}`;
  }

  /* ---------------- [하단] 컴팩트 서비스 그리드 ---------------- */
  function renderShortcuts() {
    const grid = $id("shortcutGrid");
    if (!grid) return;
    grid.innerHTML = "";
    (C.HOME_DATA.shortcuts || []).forEach((id) => {
      const s = findService(id);
      if (!s) return;
      const btn = el(
        `<button class="shortcut ${s.status === "preparing" ? "is-preparing" : ""}" type="button">
           <span class="shortcut__label">${s.label}</span>
         </button>`
      );
      btn.prepend(iconBox(s));
      btn.addEventListener("click", () => openService(s));
      grid.appendChild(btn);
    });
  }

  /* ---------------- 사이드바 ---------------- */
  function renderSidebar() {
    const nav = $id("sidebarNav");
    if (!nav) return;
    nav.innerHTML = "";

    const home = sideItem({ id: "DASH-00", lucide: "layout-dashboard", label: "대시보드", status: "active" }, true);
    home.addEventListener("click", () => { goHome(); setSideActive(home); });
    nav.appendChild(home);

    C.SERVICES.filter((s) => s.type !== "home").forEach((s) => {
      const item = sideItem(s, false);
      item.addEventListener("click", () => { openService(s); setSideActive(item); });
      nav.appendChild(item);
    });
  }
  function sideItem(s, active) {
    return el(
      `<button class="side-item ${active ? "is-active" : ""} ${s.status === "preparing" ? "is-preparing" : ""}"
               type="button" data-sid="${s.id || ""}">
         <span class="side-item__ico"><i data-lucide="${s.lucide || "square"}"></i></span>
         <span>${s.label}</span>
       </button>`
    );
  }

  // 서비스로 이동 + 사이드바 활성 표시 동기화 (대시보드 위젯의 바로가기용)
  function gotoService(id) {
    const s = findService(id);
    if (!s) return;
    openService(s);
    const sideEl = document.querySelector(`.side-item[data-sid="${id}"]`);
    if (sideEl) setSideActive(sideEl);
  }
  function setSideActive(activeEl) {
    document.querySelectorAll(".side-item").forEach((x) => x.classList.remove("is-active"));
    activeEl.classList.add("is-active");
  }

  /* ---------------- 라우팅 (+ 브라우저/Android 뒤로가기 연동) ----------------
   * 서브화면(브릿지/iframe/VOC)을 열 때 history 에 상태를 쌓아,
   * Android 하드웨어 뒤로가기·브라우저 뒤로가기를 누르면 앱이 꺼지지 않고
   * 홈 대시보드로 돌아오게 한다.
   *  - 홈 → 서브: pushState (뒤로가기 1번이면 홈)
   *  - 서브 → 다른 서브: replaceState (탭 전전 이력을 쌓지 않음 → 항상 홈으로 복귀)
   * ------------------------------------------------------------------------ */
  let POP_NAV = false;   // popstate 처리 중에는 pushState 금지 (무한 루프 방지)

  function initHistory() {
    // 시작점은 항상 홈 (해시 잔재 제거)
    history.replaceState({ view: null }, "", location.pathname + location.search);
    window.addEventListener("popstate", (e) => {
      POP_NAV = true;
      const id = e.state && e.state.view;
      const s = id ? findService(id) : null;
      if (s) openService(s);
      else renderHome();
      POP_NAV = false;
    });
  }

  // 서브화면 진입을 history 에 기록
  function syncHistory(s) {
    if (POP_NAV || !s || !s.id) return;
    const state = { view: s.id };
    if (history.state && history.state.view) history.replaceState(state, "", "#" + s.id);
    else history.pushState(state, "", "#" + s.id);
  }

  function openService(s) {
    switch (s.type) {
      case "home":     goHome(); break;
      case "bridge":   openBridge(s); break;
      case "iframe":   openIframe(s); break;
      case "external": openExternal(s); break;
      case "applink":  openAppLink(s); break;
      case "voc":      renderVoc(s); break;
      case "modal":    openModal(s); break;
      default:         toast("알 수 없는 메뉴 타입");
    }
  }

  // 외부 포탈 새 창 라우팅 (인사관리포탈 등)
  function openExternal(s) {
    if (!s.url) { toast(`${s.label} 주소가 아직 등록되지 않았어요`); return; }
    openNewTab(s.url);
  }

  // 설치형 외부 PWA 안내 팝업 (자체 푸시알림 보유 → iframe 불가)
  //  - '열기' 버튼: 베스트에포트로 새 창 열기 (안드로이드는 설치 앱으로 전환될 수 있음)
  //  - 안내 문구: 자동 실행이 안 되는 기기(특히 iOS)에서는 홈 화면 설치 앱으로 유도
  function openAppLink(s) {
    const root = $id("overlayRoot");
    const appName = s.appName || s.label;
    const modal = el(
      `<div class="overlay" style="
          position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;
          background:rgba(17,24,39,0.4);backdrop-filter:blur(2px);padding:28px;animation:fadeIn .2s ease;">
         <div style="background:rgba(255,255,255,0.9);backdrop-filter:blur(16px) saturate(160%);
              -webkit-backdrop-filter:blur(16px) saturate(160%);border:1px solid rgba(255,255,255,0.5);
              border-radius:22px;padding:28px 24px;max-width:340px;width:100%;
              text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.18);animation:popIn .25s ease;">
           <div style="width:54px;height:54px;margin:0 auto 14px;display:grid;place-items:center;
                border-radius:16px;background:var(--c-primary-soft);color:var(--c-icon-on);">
             <i data-lucide="${s.lucide || "bell-ring"}" style="width:26px;height:26px;"></i>
           </div>
           <h3 style="font-size:16.5px;font-weight:800;margin-bottom:8px;letter-spacing:-0.02em;">
             ${appName} 앱에서 확인하세요
           </h3>
           <p style="font-size:13.5px;color:#6b7280;line-height:1.65;margin-bottom:20px;">
             <b>${s.label}</b>은(는) 실시간 푸시 알림을 위해 별도 설치 앱
             <b>${appName}</b>으로 운영됩니다.<br>
             홈 화면의 <b>${appName}</b> 아이콘으로 열어 주세요.
             아직 설치 전이라면 아래 버튼으로 접속해 ‘홈 화면에 추가’할 수 있습니다.
           </p>
           <button class="app-open" type="button" style="
              width:100%;padding:12px;border-radius:14px;background:#4f46e5;color:#fff;
              font-size:14px;font-weight:700;letter-spacing:-0.01em;">${appName} 열기</button>
           <button class="app-close" type="button" style="
              width:100%;padding:11px;margin-top:8px;border-radius:14px;background:transparent;
              color:#6b7280;font-size:13.5px;font-weight:600;">닫기</button>
         </div>
       </div>`
    );
    const close = () => (root.innerHTML = "");
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector(".app-open").addEventListener("click", () => {
      if (s.url) openNewTab(s.url);
      close();
    });
    modal.querySelector(".app-close").addEventListener("click", close);
    root.appendChild(modal); refreshIcons();
  }

  // UI(홈 탭/뒤로 화살표)에서 홈으로: history 를 한 칸 되돌려 상태를 일치시킴
  function goHome() {
    if (history.state && history.state.view) { history.back(); return; }   // → popstate 가 renderHome 호출
    renderHome();
  }
  // 실제 홈 DOM 렌더 (history 조작 없음)
  function renderHome() {
    $id("homePage").classList.remove("page--hidden");
    const v = $id("viewPage");
    v.classList.add("page--hidden"); v.innerHTML = "";
    setBottomActive("home");
    const dash = document.querySelector('.side-item[data-sid="DASH-00"]');
    if (dash) setSideActive(dash);
  }
  function openIframe(s) {
    const v = $id("viewPage");
    v.innerHTML = "";
    v.appendChild(subHeader(s.label));
    if (s.url) {
      // 실제 연동 주소가 있으면 iframe 임베드
      v.appendChild(el(
        `<iframe class="sub-iframe" src="${s.url}" title="${s.label}"></iframe>`
      ));
    } else {
      // 아직 주소 미등록 → 메뉴명 크게 뜨는 임시 플레이스홀더
      v.appendChild(openPlaceholder(s));
    }
    showView(s); refreshIcons();
  }

  // 미완성 메뉴 임시 화면 (메뉴명 크게)
  function openPlaceholder(s) {
    return el(
      `<div class="placeholder">
         <span class="placeholder__ico"><i data-lucide="${s.lucide || "square"}"></i></span>
         <h2 class="placeholder__name">${s.label}</h2>
         <p class="placeholder__note">해당 서비스 화면을 준비하고 있습니다.</p>
         <span class="placeholder__badge">COMING SOON</span>
       </div>`
    );
  }
  function openBridge(s) {
    const B = C.BRIDGE_CONFIG;
    const v = $id("viewPage");
    v.innerHTML = "";
    v.appendChild(subHeader(s.label));

    const screen = el(
      `<div class="bridge">
         <div class="bridge__card" style="background:${B.gradient};">
           <div class="bridge__orb"><i data-lucide="${B.lucide || "bot"}"></i></div>
           <h2 class="bridge__title">${B.title}</h2>
           <p class="bridge__notice">${B.notice || ""}</p>

           <div class="bridge__dots"><span></span><span></span><span></span></div>

           <div class="bridge__actions">
             <button class="bridge__cta" type="button">
               ${B.ctaText} <i data-lucide="arrow-up-right"></i>
             </button>
             <button class="bridge__sub" type="button">
               ${B.subText || "권한 신청하기"} <i data-lucide="arrow-right"></i>
             </button>
           </div>
         </div>
       </div>`
    );
    v.appendChild(screen); showView(s); refreshIcons();

    const dots = screen.querySelector(".bridge__dots");
    const actions = screen.querySelector(".bridge__actions");

    // 로딩 후: 점 애니메이션 숨기고 듀얼 버튼 노출
    setTimeout(() => {
      if (dots) dots.style.display = "none";
      if (actions) actions.style.display = "flex";
    }, B.loadingMs || 1500);

    // 메인: 챗봇 새 창 (팝업차단 회피 → 사용자 클릭 기반)
    screen.querySelector(".bridge__cta").addEventListener("click", () => {
      openNewTab(s.url || B.ctaUrl);
    });
    // 서브: 권한 신청 링크 or 안내 모달
    screen.querySelector(".bridge__sub").addEventListener("click", () => {
      if (B.permitUrl) openNewTab(B.permitUrl);
      else openPermitModal();
    });
  }

  // 권한 신청 안내 모달 (permitUrl 미등록 시)
  function openPermitModal() {
    openInfoModal({
      lucide: "key-round",
      title: "챗봇 이용 권한 신청",
      text: "트윈챗봇은 승인된 구글 계정에만 공개됩니다. 운영팀(내선 0000) 또는 담당자에게 계정 권한을 요청해 주세요.",
    });
  }
  function subHeader(title) {
    const head = el(
      `<div class="sub-header">
         <button class="sub-back icon-btn" type="button" aria-label="뒤로"><i data-lucide="arrow-left"></i></button>
         <span class="sub-header__title">${title}</span>
       </div>`
    );
    head.querySelector(".sub-back").addEventListener("click", goHome);
    return head;
  }
  // 서브화면 표시 (+ 뒤로가기 history 기록)
  function showView(s) {
    $id("homePage").classList.add("page--hidden");
    $id("viewPage").classList.remove("page--hidden");
    syncHistory(s);
  }

  /* ================= 트윈소리함 (1:1 비밀 VOC 폼) =================
   * 남이 쓴 글 목록은 노출하지 않는 '제출 전용' 폼.
   * GAS(TWIN_VOICE_URL) 로 POST 하는 JSON payload 규격:
   *   timestamp   : "YYYY-MM-DD HH:mm:SS"
   *   isAnonymous : "익명" | "기명"
   *   name        : 작성자 이름 (익명이면 "익명")
   *   title       : 제목
   *   content     : 본문 (최대 VOC_CONTENT_MAX 자)
   * → Code.gs 가 [접수 시간|익명 여부|이름|제목|내용] 순으로 시트에 1행 append.
   * ─────────────────────────────────────────────────────────────── */
  const VOC_CONTENT_MAX = 1000;

  // "YYYY-MM-DD HH:mm:SS" 포맷
  function fmtTs(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
           `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /* 트윈소리함 화면 렌더
   * ───────────────────────────────────────────────────────────────
   *  사용한 표준 ID (HTML은 이 함수가 동적 생성):
   *    #voc-form        : 폼 컨테이너 (form)
   *    #voc-named       : "이름 남기고 작성(실명)" 체크박스 (기본=미체크=익명)
   *    #voc-named-group : [이름] 묶음 (실명 토글 대상)
   *    #voc-name        : 이름 입력
   *    #voc-title       : 제목 입력
   *    #voc-content     : 내용 입력(textarea)
   *    #voc-charcount   : 실시간 글자 수 카운터
   *    #voc-submit      : 제출 버튼
   *  ※ 디자인은 기존 클래스(voc__/bm-input)를 그대로 재사용.
   * ─────────────────────────────────────────────────────────────── */
  function renderVoc(s) {
    const v = $id("viewPage");
    v.innerHTML = "";
    v.appendChild(subHeader(s.label));

    const wrap = el(
      `<div class="voc">
         <form class="voc__card" id="voc-form" novalidate>
           <div class="voc__intro">
             <span class="voc__ico"><i data-lucide="inbox"></i></span>
             <h2 class="voc__title">트윈소리함</h2>
             <p class="voc__sub">센터장에게만 비공개로 전달되는 1:1 제안함입니다.<br>자유롭게 의견·불편사항을 남겨주세요.</p>
           </div>

           <label class="voc__opt">
             <input type="checkbox" id="voc-named" />
             <span><i data-lucide="user-round"></i> 이름 남기고 작성하기 <em style="font-style:normal;color:var(--c-text-mute);font-weight:500;">(기본은 익명)</em></span>
           </label>

           <!-- 이름 입력 묶음: 실명 체크 시에만 부드럽게 펼침 (기본 익명=숨김) -->
           <div id="voc-named-group"
                style="overflow:hidden;transition:max-height .3s ease,opacity .25s ease,margin .25s ease;">
             <input class="bm-input" id="voc-name" type="text"
                    placeholder="이름을 입력하세요" maxlength="20" required />
           </div>

           <input class="bm-input" id="voc-title" type="text"
                  placeholder="제목을 입력하세요" maxlength="60" required />
           <textarea class="bm-text" id="voc-content"
                     placeholder="내용을 자유롭게 작성해 주세요. (최대 ${VOC_CONTENT_MAX}자)"
                     maxlength="${VOC_CONTENT_MAX}" required></textarea>

           <!-- 우측 하단 실시간 글자 수 카운터 -->
           <div id="voc-charcount"
                style="text-align:right;font-size:11.5px;font-weight:600;color:var(--c-text-mute);margin-top:4px;">
             0 / ${VOC_CONTENT_MAX}자
           </div>

           <p class="voc__guard"><i data-lucide="lock"></i> 작성 내용은 다른 직원에게 공개되지 않습니다.</p>
           <button class="voc__submit" id="voc-submit" type="submit">제출하기</button>
         </form>
       </div>`
    );
    v.appendChild(wrap);

    bindVocAnonToggle(wrap);    // 기명/익명 동적 UI 토글
    bindVocCharCounter(wrap);   // 실시간 글자 수 카운터
    // 제출: form submit 가로채기(엔터/클릭 모두 커버) → 비동기 전송
    wrap.querySelector("#voc-form").addEventListener("submit", (e) => {
      e.preventDefault();
      submitVoc();
    });

    showView(s); refreshIcons();
  }

  // 실명/익명 동적 UI 토글 (기본=익명)
  //  - 미체크(익명, 기본): 이름 숨김 + disabled (required 우회) → 전송 시 "익명"
  //  - 체크(실명): 이름 노출 + required 활성 → 작성자 이름 입력 필수
  function bindVocAnonToggle(scope) {
    const named = scope.querySelector("#voc-named");
    const group = scope.querySelector("#voc-named-group");
    const name  = scope.querySelector("#voc-name");

    const apply = () => {
      const isNamed = named.checked;
      // 부드러운 펼침/접힘 (max-height 트랜지션)
      //  - 렌더 시점엔 viewPage 가 display:none 이라 scrollHeight 가 0 → 고정 상한값 사용
      group.style.maxHeight = isNamed ? "200px" : "0px";
      group.style.opacity   = isNamed ? "1" : "0";
      group.style.marginBottom = isNamed ? "" : "0px";
      // 숨김(익명) 시 required 해제 + disabled (검증 우회)
      name.disabled = !isNamed;
      name.required = isNamed;
    };

    apply();                                  // 초기 상태(익명) 반영
    named.addEventListener("change", apply);
  }

  // 실시간 글자 수 카운터 (현재 / 1000자) + 상한 차단
  function bindVocCharCounter(scope) {
    const ta = scope.querySelector("#voc-content");
    const counter = scope.querySelector("#voc-charcount");
    const update = () => {
      // maxlength 가 1차 차단하지만, 붙여넣기/IME 등 우회 입력도 방어적으로 잘라냄
      if (ta.value.length > VOC_CONTENT_MAX) ta.value = ta.value.slice(0, VOC_CONTENT_MAX);
      counter.textContent = `${ta.value.length} / ${VOC_CONTENT_MAX}자`;
      counter.style.color = ta.value.length >= VOC_CONTENT_MAX
        ? "var(--c-primary)" : "var(--c-text-mute)";
    };
    ta.addEventListener("input", update);
    update();
  }

  // VOC 제출 → JSON 파싱 → TWIN_VOICE_URL 로 비동기 POST → 완료 처리
  async function submitVoc() {
    const form    = $id("voc-form");
    const btn     = $id("voc-submit");
    const named   = $id("voc-named").checked;     // 체크=실명, 미체크=익명(기본)
    const name    = ($id("voc-name").value || "").trim();
    const title   = ($id("voc-title").value || "").trim();
    const content = ($id("voc-content").value || "").trim();

    // ── 유효성 검사 (실명일 때만 이름 필수) ──
    if (named && !name) { toast("작성자 이름을 입력해 주세요"); return; }
    if (!title)   { toast("제목을 입력해 주세요"); return; }
    if (!content) { toast("내용을 입력해 주세요"); return; }

    // 익명(기본)이면 이름을 "익명" 으로 자동 변환
    const payload = {
      timestamp: fmtTs(new Date()),
      isAnonymous: named ? "기명" : "익명",
      name: named ? name : "익명",
      title,
      content,
    };

    // URL 미설정 가드 (배포 전 오작동 방지)
    if (!TWIN_VOICE_URL || TWIN_VOICE_URL.indexOf("PLACEHOLDER") !== -1) {
      toast("전송 주소가 아직 설정되지 않았어요 (config.js)");
      return;
    }

    // ── 중복 클릭 방지: 버튼 잠금 ──
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "제출 중...";

    try {
      // GAS /exec 로의 POST 는 302 → googleusercontent 리다이렉트를 거치는데,
      // 이 리다이렉트 응답에는 CORS 헤더가 없어, 브라우저(cors 모드)는 응답을
      // 못 읽고 fetch 를 reject 합니다. (실제로는 서버에 전달·저장됐는데 '실패'로 오인)
      //  → 따라서 no-cors 로 보냅니다. 응답은 opaque 라 읽을 수 없지만,
      //    text/plain '단순 요청'이라 서버에는 정상 전달되어 시트 저장·메일 발송됩니다.
      //    (엔드포인트 정상 동작은 서버측에서 사전 검증함)
      //  ※ POST 응답을 읽어 성공/실패를 판정하려고 no-cors 를 제거하면, GAS 리다이렉트
      //    CORS 때문에 정상 접수도 '전송 실패'로 뜨므로 절대 제거하지 말 것.
      await fetch(TWIN_VOICE_URL, {
        method: "POST",
        mode: "no-cors",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // no-cors 는 네트워크 자체가 끊긴 경우에만 예외 → 예외 없으면 접수로 간주.

      openInfoModal({
        lucide: "check-circle-2",
        title: "접수 완료",
        text: "센터장님께 소중한 의견이 안전하게 비공개 접수되었습니다.",
      });
      resetVocForm(form);
    } catch (err) {
      // 여기로 오는 경우는 '네트워크 자체가 끊긴' 진짜 실패뿐.
      console.error("[트윈소리함] 전송 실패:", err);
      toast("전송에 실패했어요. 네트워크 확인 후 다시 시도해 주세요");
    } finally {
      // 성공/실패와 무관하게 버튼 원상복구
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  // 폼 전체 초기화 (입력값/익명상태/카운터/토글 UI 복원)
  //  - 리스너 중복 등록을 피하려고, 이미 바인딩된 핸들러를 이벤트로 재실행.
  function resetVocForm(form) {
    if (!form) return;
    form.reset();                                                  // 모든 input/textarea/select 기본값
    form.querySelector("#voc-named").dispatchEvent(new Event("change")); // 이름 묶음 접힘(익명) + required 재설정
    form.querySelector("#voc-content").dispatchEvent(new Event("input")); // 카운터 0 으로
  }

  /* ---------------- 오버레이 ---------------- */
  // 준비중 서비스 모달 → 공용 모달 재사용
  function openModal(s) {
    openInfoModal({
      lucide: s.lucide || "info",
      title: "잠시만요",
      text: s.modalText || `${s.label}은(는) 준비 중이에요`,
    });
  }

  // 공용 안내 모달 (아이콘 + 제목 + 본문 + 확인)
  function openInfoModal({ lucide: ic = "info", title = "안내", text = "" }) {
    const root = $id("overlayRoot");
    const modal = el(
      `<div class="overlay" style="
          position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;
          background:rgba(17,24,39,0.4);backdrop-filter:blur(2px);padding:28px;animation:fadeIn .2s ease;">
         <div style="background:rgba(255,255,255,0.85);backdrop-filter:blur(16px) saturate(160%);
              -webkit-backdrop-filter:blur(16px) saturate(160%);border:1px solid rgba(255,255,255,0.5);
              border-radius:22px;padding:28px 24px;max-width:330px;width:100%;
              text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.18);animation:popIn .25s ease;">
           <div style="width:52px;height:52px;margin:0 auto 14px;display:grid;place-items:center;
                border-radius:16px;background:var(--c-primary-soft);color:var(--c-icon-on);">
             <i data-lucide="${ic}" style="width:24px;height:24px;"></i>
           </div>
           <h3 style="font-size:16px;font-weight:800;margin-bottom:8px;letter-spacing:-0.02em;">${title}</h3>
           <p style="font-size:13.5px;color:#6b7280;line-height:1.6;margin-bottom:20px;">${text}</p>
           <button class="modal-ok" type="button" style="
              width:100%;padding:12px;border-radius:14px;background:#4f46e5;color:#fff;
              font-size:14px;font-weight:600;letter-spacing:-0.01em;">확인</button>
         </div>
       </div>`
    );
    const close = () => (root.innerHTML = "");
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector(".modal-ok").addEventListener("click", close);
    root.appendChild(modal); refreshIcons();
  }

  function openAllMenu() {
    const root = $id("overlayRoot");
    const panel = el(
      `<div class="overlay" style="
          position:fixed;inset:0;z-index:55;display:flex;justify-content:flex-end;
          background:rgba(17,24,39,0.4);animation:fadeIn .2s ease;">
         <div class="slide-panel" style="
            width:84%;max-width:360px;height:100%;overflow-y:auto;
            background:rgba(255,255,255,0.85);backdrop-filter:blur(16px) saturate(160%);
            -webkit-backdrop-filter:blur(16px) saturate(160%);border-left:1px solid rgba(255,255,255,0.5);
            padding:22px 16px;animation:slideIn .25s ease;box-shadow:-10px 0 40px rgba(0,0,0,.1);">
           <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
             <span style="font-size:17px;font-weight:800;letter-spacing:-0.02em;">전체 메뉴</span>
             <button class="panel-close icon-btn" type="button" aria-label="닫기"><i data-lucide="x"></i></button>
           </div>
           <div class="panel-list"></div>
         </div>
       </div>`
    );
    const list = panel.querySelector(".panel-list");
    C.SERVICES.forEach((s) => {
      const item = el(
        `<button class="panel-item" type="button" style="
            display:flex;align-items:center;gap:13px;width:100%;padding:11px 6px;
            border-bottom:1px solid var(--c-border);text-align:left;
            ${s.status === "preparing" ? "opacity:.5;" : ""}">
           <span style="font-size:13px;font-weight:600;flex:1;">${s.label}</span>
           <i data-lucide="chevron-right" style="width:16px;height:16px;color:#c4c8cd;"></i>
         </button>`
      );
      item.prepend(iconBox(s));
      item.addEventListener("click", () => { root.innerHTML = ""; openService(s); });
      list.appendChild(item);
    });
    const close = () => (root.innerHTML = "");
    panel.addEventListener("click", (e) => { if (e.target === panel) close(); });
    panel.querySelector(".panel-close").addEventListener("click", close);
    root.appendChild(panel); refreshIcons();
  }

  function toast(msg) {
    const root = $id("overlayRoot");
    const t = el(
      `<div style="position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:70;
          background:rgba(17,24,39,0.92);color:#fff;font-size:13px;font-weight:500;
          padding:10px 18px;border-radius:999px;animation:fadeIn .2s ease;max-width:80%;text-align:center;">${msg}</div>`
    );
    root.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  /* ---------------- 헤더 / 하단탭 ---------------- */
  function bindHeader() {
    const grid = $id("btnGrid");
    if (grid) grid.addEventListener("click", openAllMenu);
    const bell = $id("btnBell");
    if (bell) bell.addEventListener("click", openNoticePanel);
    updateBellBadge();

    // 브랜드(사이드바 'Twin Work' / 모바일 헤더 로고·이름) 클릭 → 홈(대시보드)
    document.querySelectorAll(".sidebar__brand, .app-header__left").forEach((brand) => {
      brand.style.cursor = "pointer";
      brand.setAttribute("role", "button");
      brand.setAttribute("aria-label", "홈(대시보드)으로 이동");
      brand.addEventListener("click", goHome);
    });
  }
  function bindBottomNav() {
    document.querySelectorAll(".bottom-nav__item").forEach((item) => {
      item.addEventListener("click", () => {
        const nav = item.dataset.nav;
        if (nav === "home") goHome();
        else if (nav === "menu") openAllMenu();
        else if (nav === "chatbot") { openService(findService("MENU-01")); setBottomActive("chatbot"); }
        // 매뉴얼은 '새 창(external)'으로 열림 → 화면은 그대로이므로 탭 하이라이트를 옮기지 않음
        else if (nav === "manual") { openService(findService("MENU-03")); }
      });
    });
  }
  function setBottomActive(nav) {
    document.querySelectorAll(".bottom-nav__item").forEach((x) => {
      x.classList.toggle("is-active", x.dataset.nav === nav);
    });
  }
})();
