/* =====================================================================
 *  config.js — Twin Work [중앙 컨트롤타워]
 * ---------------------------------------------------------------------
 *  ⭐ 코딩 초보자 가이드 ⭐
 *  - 이 파일은 "앱의 두뇌"입니다. 디자인/기능 코드는 건드리지 마세요.
 *  - 메뉴 URL/아이콘/활성화 상태/대시보드 내용은 전부 여기서 바꿉니다.
 *  - 따옴표(' ') 안 글자만 바꾸고, 콤마(,)는 지우지 마세요!
 * ===================================================================== */

/* ---------------------------------------------------------------------
 * 1) 앱 기본 정보
 * ------------------------------------------------------------------- */
const APP_META = {
  appName: "Twin Work",
  companyName: "TWIN TOWER",
  version: "1.1.0",
  themeColor: "#4f46e5",           // 인디고 포인트
};

/* ---------------------------------------------------------------------
 * 2) 에셋 맵 (커스텀 이미지/로고 경로)
 *    - 파일이 없어도 Lucide 아이콘이 대신 뜨므로 깨지지 않습니다.
 * ------------------------------------------------------------------- */
const APP_ASSETS = {
  logo: "assets/images/logo.png",
};

/* ---------------------------------------------------------------------
 * 2-1) 기상청(KMA) 날씨 — 구글 앱스크립트(GAS) 프록시 연동
 *   - 건물은 여의도 고정 → 격자좌표 하드코딩 (변환식 생략)
 *   - ★ API 키는 더 이상 여기(브라우저 노출 코드)에 두지 않습니다.
 *     [트윈날씨/Code.gs] 를 구글 앱스크립트에 새 프로젝트로 배포하고
 *     (배포 > 새 배포 > 웹 앱 > 액세스: 모든 사용자),
 *     발급받은 "웹 앱 URL(/exec)" 을 WEATHER_PROXY_URL 에 붙여넣으세요.
 *   - PLACEHOLDER 상태면 화면에 샘플 날씨 + "샘플" 배지가 표시됩니다.
 *   - 프록시를 거치면 ① 키가 서버에만 보관되고 ② 브라우저 CORS 차단도
 *     해결됩니다 (apis.data.go.kr 은 브라우저 직접 호출이 막히는 경우가 많음).
 * ------------------------------------------------------------------- */
const KMA_NX = 59;                 // 기상청 격자 X (여의도)
const KMA_NY = 126;                // 기상청 격자 Y (여의도)
const KMA_AREA_CODE = "L1022600";  // 서울/영등포 특보구역 코드
const KMA_AREA_NO = "1156000000";  // 영등포구 행정구역코드 (체감온도/생활기상지수)
const KMA_STN_ID = 109;            // 특보 발표관서: 서울지방기상청(수도권)
const WEATHER_PROXY_URL = "https://script.google.com/macros/s/AKfycbydZ6ad_2D1bQLLVGII6GqpsXNM-ZTUP7oKTvm7t4I2iR46XGpSjf426M5SAdV_DHfV/exec";   // ★ 트윈날씨 GAS 웹 앱 URL

/* ---------------------------------------------------------------------
 * 2-2) 트윈소리함(비공개 VOC) — 구글 웹앱(Apps Script) 연동 주소
 *   - ★ 내용 기밀 유지를 위해 [트윈소리함/Code.gs] 와 저장 시트는 반드시
 *     '센터장 계정(twin.eoc1@gmail.com)' 으로 생성·배포해야 합니다.
 *     (그래야 sni.twintowers 등 다른 계정은 글 내용에 접근 불가)
 *   - 그 계정에서 배포 후 발급받은 "웹 앱 URL(/exec)" 을 아래 따옴표 안에
 *     그대로 붙여넣으세요.
 *   - PLACEHOLDER 상태면 실제 전송은 막히고 안내 메시지가 표시됩니다.
 * ------------------------------------------------------------------- */
const TWIN_VOICE_URL = "https://script.google.com/macros/s/AKfycbyrAXGDxNWRvySLgM8r6irX9mKr00DSlmOFxBEcIEWWiguyGrxYpt9nW_5WWVkxCB3rvA/exec";

/* ---------------------------------------------------------------------
 * 3) 트윈 Chat-Bot '브릿지 스크린' 설정
 * ------------------------------------------------------------------- */
const BRIDGE_CONFIG = {
  // 로딩 중 굵은 안내 타이틀
  title:   "트윈타워 운영 지식 가이드 AI를 연결하고 있습니다.",
  // 권한 안내 (가볍고 작은 텍스트)
  notice:  "본 챗봇은 사내 보안 문서가 학습되어 있어 승인된 구글 계정으로만 접근이 가능합니다. 브라우저의 로그인 상태를 확인해 주세요.",
  lucide:  "bot",                  // 브릿지 중앙 아이콘 (Lucide)
  loadingMs: 1500,                 // 로딩 애니메이션 노출 시간(ms)

  // 메인 버튼: 챗봇 새 창 연결
  ctaText: "트윈챗봇 바로가기",
  ctaUrl:  "https://notebooklm.google.com/notebook/fd9bfa22-4d10-4015-a58f-658c0a15a016",   // ★ 실제 노트북LM 공유 주소

  // 서브 버튼: 권한 신청 (외부 링크 있으면 새 창, 없으면 안내 모달)
  subText:   "챗봇 이용 권한 신청하기",
  permitUrl: "",                   // ★ 권한 신청 폼 주소 (비우면 안내 모달)

  // 파스텔 그라데이션 (연 민트 → 라벤더)
  gradient: "linear-gradient(150deg, #e8f8f3 0%, #eef0ff 52%, #f4ecfb 100%)",
};

/* ---------------------------------------------------------------------
 * 4) 7대 서비스 라인업
 *    lucide : Lucide 아이콘 이름 (https://lucide.dev/icons 에서 검색)
 *    icon   : 커스텀 PNG 경로 (넣으면 Lucide 대신 이 이미지가 표시됨)
 *    type   : 'home' | 'bridge' | 'iframe' | 'modal'
 *    status : 'active' | 'preparing'
 * ------------------------------------------------------------------- */
const SERVICES = [
  {
    id: "DASH-00", label: "대시보드", group: "HOME",
    lucide: "layout-dashboard", icon: "assets/icons/dashboard.png",
    type: "home", url: "", status: "active",
  },
  {
    // 트윈챗봇 — NotebookLM 브릿지
    id: "MENU-01", label: "트윈 Chat-Bot", group: "AI",
    lucide: "bot", icon: "assets/icons/chatbot.png",
    type: "bridge", url: BRIDGE_CONFIG.ctaUrl, status: "active",
  },
  {
    // 트윈투두 — AppSheet 임베드 (★ 아래 url 에 AppSheet 주소 입력)
    id: "MENU-02", label: "트윈 To-Do", group: "WORK",
    lucide: "square-check-big", icon: "assets/icons/todo.png",
    type: "iframe", url: "", status: "active",
  },
  {
    // 운영매뉴얼 — Google Sites 임베드 (★ url 입력)
    id: "MENU-03", label: "운영매뉴얼", group: "WORK",
    lucide: "book-open", icon: "assets/icons/manual.png",
    type: "iframe", url: "", status: "active",
  },
  {
    // 재난대응매뉴얼 — 별도 설치형 PWA(자체 푸시알림 보유).
    //  iframe 임베드 시 알림/설치가 막히고, 외부 자동실행은 OS·기기마다 불가할 수
    //  있어(특히 iOS) → 안내 팝업(type: applink)으로 '설치 앱에서 열기'를 유도한다.
    //  appName : 안내 문구에 표시할 설치 앱 이름
    id: "MENU-04", label: "재난대응매뉴얼", group: "SAFETY",
    lucide: "siren", icon: "assets/icons/disaster.png",
    type: "applink", url: "https://atssa-kim.github.io/twin-alarm/",
    appName: "Twin-alarm", status: "active",
  },
  {
    // 트윈Safety — AppSheet 임베드 (법적 서명/위험성평가, ★ url 입력)
    id: "MENU-05", label: "트윈Safety", group: "SAFETY",
    lucide: "shield-check", icon: "assets/icons/safety.png",
    type: "iframe", url: "", status: "active",
  },
  {
    // 인사관리포탈 — 외부 HR 포탈 새 창(_blank)
    id: "MENU-06", label: "인사관리포탈", group: "HR",
    lucide: "users", icon: "assets/icons/hr.png",
    type: "external", url: "https://sni-twin.github.io/hire-eval/", status: "active",
  },
  {
    // 트윈소리함 — 1:1 비밀 VOC 제안 폼 (글 목록 노출 안 함)
    id: "MENU-07", label: "트윈소리함", group: "COMMUNITY",
    lucide: "inbox", icon: "assets/icons/voc.png",
    type: "voc", url: "", status: "active",
  },
  {
    // 외주작업관리 — 무인화 관리자창 (개발 중 → 안내 모달)
    id: "MENU-08", label: "외주작업관리", group: "WORK",
    lucide: "briefcase", icon: "assets/icons/outsourcing.png",
    type: "modal", url: "", status: "preparing",
    modalText: "외주작업 무인화 관리 시스템을 구축하는 중입니다.",
  },
];

/* ---------------------------------------------------------------------
 * 5) 대시보드 표시 데이터
 * ------------------------------------------------------------------- */
const HOME_DATA = {
  // [상단] 한 줄 인사말
  greetingLine: "환영합니다. LG트윈타워 Work 플랫폼입니다",

  // [중단 왼쪽] 날씨 위젯 (추후 GAS API 연동 자리)
  weather: {
    location: "여의도",
    condition: "맑음",
    temp: "24°C",
    lucide: "sun",               // 날씨 아이콘 (sun/cloud/cloud-rain/snowflake 등)
  },

  // [중단 오른쪽] 공지 피드 (여러 개 리스트업)
  notices: [
    { title: "트윈 피트니스 26년 3분기 정기 회원 모집 안내", date: "06.05", url: "" },
    { title: "6월 4일(목) 트윈 통근 퇴근버스 운행 안내", date: "06.04", url: "" },
    { title: "중원 지하1층 고메스트릿 신규 매장 오픈", date: "06.02", url: "" },
  ],

  // [하단] To-Do 필터 드롭다운 옵션 (value 는 아래 todos 의 part 와 일치해야 함)
  todoParts: [
    { value: "all",    label: "전체" },
    { value: "건축",   label: "건축" },
    { value: "기계",   label: "기계" },
    { value: "전기",   label: "전기" },
    { value: "소방",   label: "소방" },
    { value: "운영",   label: "운영" },
    { value: "품질",   label: "품질" },
    { value: "센터장", label: "센터장" },
  ],

  // [하단] 트윈 To-Do 중요 업무 전달사항
  // priority: "High" | "Medium" | "Low" / part: 위 todoParts 의 value
  todos: [
    { title: "B1F 전기실 정기 안전점검 결과 보고",   from: "전기파트장", part: "전기",   priority: "High",   done: false },
    { title: "동관 공조설비 필터 교체 일정 확정",     from: "기계파트장", part: "기계",   priority: "High",   done: false },
    { title: "지하주차장 배수펌프 작동 점검",         from: "기계파트장", part: "기계",   priority: "Medium", done: false },
    { title: "옥상 방수층 균열 보수 범위 검토",       from: "건축파트장", part: "건축",   priority: "Medium", done: false },
    { title: "외벽 석재 탈락 위험 구간 정밀 점검",     from: "건축파트장", part: "건축",   priority: "High",   done: false },
    { title: "분기 소방 합동훈련 참가자 명단 취합",   from: "소방파트장", part: "소방",   priority: "Medium", done: true  },
    { title: "스프링클러 헤드 교체 자재 발주",         from: "소방파트장", part: "소방",   priority: "Low",    done: false },
    { title: "외주 미화팀 6월 근무표 검토",           from: "운영파트장", part: "운영",   priority: "Medium", done: false },
    { title: "시설물 품질점검 체크리스트 갱신",       from: "품질파트장", part: "품질",   priority: "Low",    done: false },
    { title: "6월 운영 정례회의 안건 정리",           from: "센터장",     part: "센터장", priority: "High",   done: false },
  ],

  // [하단] 컴팩트 서비스 바로가기 순서 (8개 → 4열 2행 꽉 참)
  shortcuts: ["MENU-01", "MENU-02", "MENU-03", "MENU-04", "MENU-05", "MENU-06", "MENU-07", "MENU-08"],
};

/* ---------------------------------------------------------------------
 * 6) 전역 노출 (수정 금지)
 * ------------------------------------------------------------------- */
window.CONFIG = {
  APP_META, APP_ASSETS, BRIDGE_CONFIG, SERVICES, HOME_DATA,
  TWIN_VOICE_URL,
  KMA: {
    NX: KMA_NX, NY: KMA_NY, AREA_CODE: KMA_AREA_CODE, AREA_NO: KMA_AREA_NO,
    STN_ID: KMA_STN_ID, PROXY_URL: WEATHER_PROXY_URL,
  },
};
