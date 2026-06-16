// ─── 🎤 Hot Mic v2.28.0 ───
// 캐릭터 몰래 보는 감독판 코멘터리
// RP에 개입하지 않음. 해설은 기억되지 않음. 단방향.

import { getContext, extension_settings } from '../../../extensions.js';
import { event_types, eventSource, saveSettingsDebounced } from '../../../../script.js';

const EXT_NAME = 'hot-mic';
const HOTMIC_VERSION = '2.28.0';

// ─── 기본 설정 ───
const DEFAULT_SETTINGS = {
    enabled: true,
    state: 'ticker',          // 'icon' | 'ticker' | 'panel'
    mode: 'variety',          // 'docu' | 'sports' | 'variety'
    context: 'recent5',       // 'current' | 'recent5' | 'all'
    profile: '',              // 연결 프로필 이름 ('' = 현재 연결 사용)
    language: 'ko',           // 'ko' | 'en'
    autoscroll: true,         // 자동 스크롤 on/off
    scrollSpeed: 40,          // px/sec
    fullscreen: false,        // 전체 펼침 상태
    fxFrequency: 30,          // 마스코트 애니메이션 등장 확률 (%)
    length: 'normal',         // 'short' | 'normal' | 'long' — 해설 분량
    preset: 'all',            // 'all' | 'fact' | 'interview' | 'broadcast' — 구성 프리셋
    opacity: 92,              // 자막바/패널 불투명도 (%)
    theme: 'dark',            // 색상 테마
    iconPos: null,            // 최소화 아이콘 위치 {x, y} (드래그로 변경, null=기본 우하단)
};

// 색상 테마 정의 (배경 RGB, 강조색, 텍스트색, 버튼색)
const HOTMIC_THEMES = {
    light:     { name: '🤍 화이트',    bg: '248,247,245', panel: '#FFFFFF', text: '#2B2622', accent: '#A34B4B', border: '#D8D1C8' },
    butter:    { name: '🧈 버터옐로우', bg: '255,247,214', panel: '#FFFDF4', text: '#4A3A22', accent: '#D9A520', border: '#E8DDB3' },
    parchment: { name: '📜 양피지',    bg: '234,223,200', panel: '#F3E9D2', text: '#3A2B1A', accent: '#8B5E34', border: '#C8B89A' },
    wine:      { name: '🍷 와인',      bg: '42,28,34',   panel: '#3A2630', text: '#F0E7E7', accent: '#9B3A4A', border: '#5B3A44' },
    forest:    { name: '🌲 그린',      bg: '238,244,238', panel: '#FAFDFA', text: '#233423', accent: '#567A5B', border: '#C7D4C7' },
    blue:      { name: '🌊 블루',      bg: '242,247,251', panel: '#FFFFFF', text: '#23364A', accent: '#4B77A8', border: '#D7E3EE' },
    dark:      { name: '⚫ 블랙',      bg: '24,24,24',   panel: '#232323', text: '#EAEAEA', accent: '#C84C4C', border: '#383838' },
};
// 구 테마키 호환 (midnight→blue, sepia→parchment)
const THEME_ALIAS = { midnight: 'blue', sepia: 'parchment' };

// 디버그는 저장하지 않는 휘발성 (이스터에그로 켠 세션에만 유효, 새로고침 시 자동 off)
let HOTMIC_DEBUG = false;
let HOTMIC_LAST = null; // 마지막 생성 진단 정보 (모드/서브/프롬프트/응답/에러)

function getSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = { ...DEFAULT_SETTINGS };
    }
    // 누락 키 보강 (구버전 설정 호환)
    for (const k in DEFAULT_SETTINGS) {
        if (extension_settings[EXT_NAME][k] === undefined) {
            extension_settings[EXT_NAME][k] = DEFAULT_SETTINGS[k];
        }
    }
    return extension_settings[EXT_NAME];
}

// 연결 프로필 목록 읽기 (Connection Manager)
function getConnectionProfiles() {
    try {
        const cm = extension_settings.connectionManager;
        if (cm && Array.isArray(cm.profiles)) {
            return cm.profiles.map(p => ({ id: p.id, name: p.name }));
        }
    } catch (e) { /* noop */ }
    return [];
}

// 현재 ST에서 활성화된 연결 프로필 ID (사용자가 Hot Mic 프로필을 따로 안 골랐을 때 이걸로 격리 호출)
function getActiveProfileId() {
    try {
        const cm = extension_settings.connectionManager;
        if (cm && cm.selectedProfile) return cm.selectedProfile;
    } catch (e) { /* noop */ }
    return null;
}

// ─── 상태 ───
let currentCommentary = null;   // 현재 해설 데이터
let isGenerating = false;

// ─── 모드별 서브스타일 풀 (매번 랜덤으로 하나 골라 변주) ───
const MODE_SUBSTYLES = {
    docu: [
        '【야생 다큐 / 내셔널지오·BBC st】 데이비드 애튼버러식. 장엄한 도입("이른 아침, 미명이 깔린 좁은 서식지에서…") 후, **현재 진행형으로 행동을 실시간 중계**하세요: "오늘도 수컷 ○○는 거실을 어슬렁거립니다", "먹이를 찾는지 부엌을 서성입니다", "표적이 시야에 들어왔습니다. 기습을 감행할 차례입니다." 인간을 철저히 야생 개체로(수컷·암컷·서식지·영역·서열·번식기·포식자), 동물행동학 용어로 포장 후 시시한 진실로 착지. 사냥·포식 장면처럼 긴장감 있게 묘사하되 차분하고 우아한 내레이션 톤 유지. "~합니다"체 현장 중계가 핵심.',
        '【인간극장 st】 잔잔한 휴먼 다큐. **"~다" 단문 현재형 종결**로 인물을 관찰: "딸의 머리를 손질해주는 손길에 오늘은 더 정성이 들어간다.", "공연 갈 때면 늘 정신이 없다." 인물 관계와 사연을 담담히 나열하고("○○ 씨보다 1분 먼저 태어난 쌍둥이 언니"), 사소한 행동에 인생의 무게를 슬며시 얹는다. 과장 없이, 따뜻하고 먹먹하게. 가끔 "~죠"로 부드럽게 풀어도 좋다.',
        '【한국인의 밥상 st】 최불암 내레이션. 음식과 정(情). "이 한 그릇에 담긴 사연", "투박하지만 정성 가득한 손맛", "세월이 빚어낸 깊은 맛". 식재료·조리·밥상으로 거창하게 의미 부여. 구수하고 정겨운 어투, 옛 추억 회상 끼워넣기. 결국 별것 아닌 계란프라이로 착지.',
        '【그것이 알고싶다 / 메디컬 다큐 st】 긴장·추적형 다큐. 질문을 던져 긴장을 조성: "무슨 일이 생긴 걸까요.", "그는 왜 그랬을까요." / "~한데요", "~습니다" 진지한 관찰체. "분주히 돌아가는 하루, 모두에게 같은 의미는 아닐 겁니다" 같은 묵직한 도입. 사소한 일을 미제 사건·생사의 고비처럼 다루다 시시하게 착지. 의혹·반전("그러나 진실은 달랐다")과 긴박감.',
    ],
    sports: [
        '【축구 중계 st】 흥분한 캐스터 + 차분한 해설위원 핑퐁. "아—! 들어갑니다!", "이게 바로!", VAR·추가시간·골문·오프사이드. 캐스터는 폭발, 해설은 냉정히 분석. 결정적 순간 같은 말 반복("귀끝 붉어졌어요! 붉어졌어요!").',
        '【e스포츠 중계 st】 롤·스타 중계 특유의 빠른 템포. "각 봤습니다!", "한타 열려요!", "이니시 들어갑니다!", "갱각 보이는데요?", "이거 사형선고죠", "GG 나옵니다". 게임 용어 폭격, 숨도 안 쉬고 몰아침. 흥분 최고조.',
        '【격투기 중계 st】 UFC·복싱 해설. "들어갑니다, 클린치!", "잽! 잽! 오버핸드!", "테이크다운 시도!", "그라운드로 갑니다", "탭 나옵니까?!". 거친 호흡, 타격·관절기 묘사. 위협적이고 빠른 톤.',
        '【야구 중계 st】 느긋한 해설 + 통계 덕후. "자아— 여기서", "타율을 한번 보실까요", "이게 노련함이죠", "교과서적인 플레이입니다", "야구 몰라요". 한 박자 느린 여유, 숫자·기록 인용, 구수한 입담.',
    ],
    variety: [
        '【관찰 예능 st】 나혼산·금쪽상담소처럼 스튜디오 패널이 VCR 보며 리액션. "어머어머 저거 봐", "에이 설마~", "(패널 일동) 우와…", "스튜디오 빵 터짐", "저걸 어떡해 진짜". 출연자는 진지, 지켜보는 패널만 난리. 리액션·티키타카 중심.',
        '【대놓고 웃긴 예능 st】 무한도전·런닝맨 자막 폭격. 능청 캡션("(다 보임)", "★대환장★"), 효과음 지문("쎄—한 정적", "BGM 뚝"), 작가/자막팀 난입("[작가] 대본에 없습니다"), 겉vs속 폭로. 가장 짓궂고 빠른 드립.',
        '【다큐 예능 st】 예능과 다큐 사이. 진지한 내레이션톤으로 시작했다가 예능 자막으로 빵 터뜨림. "리얼리티의 탈을 쓴 한 편의…", "그러나 카메라는 보았다", 다큐 척하다 깐죽. 진지함과 가벼움의 낙차로 웃김.',
        '【토크쇼 st】 유퀴즈·라디오스타처럼 따뜻하게 파고드는 MC. "근데 그때 진짜 어떤 마음이셨어요?", "에이~ 솔직히 말해봐요", "오늘 자기님이…", 다정하게 멍석 깔아주다 정곡 콕 찌름. 부드럽지만 날카로운 질문.',
    ],
    court: [
        '【법정 드라마 st】 검사·변호사 공방. "이의 있습니다, 재판장님!", "증인은 사실만 진술하십시오", "유도신문입니다", "기각합니다". 긴장감 넘치는 법정극, 반전 증거 제시. 격앙된 변론조.',
        '【형사 수사 st】 강력계 형사·취조실. 사건번호·증거물·신문조서. "용의자", "범행수법", "알리바이", "진술 거부권", "불어, 다 알고 왔어". 건조한 수사 보고서체 + 취조 압박.',
        '【프로파일링 st】 범죄심리 분석관. 차분하고 소름끼치는 분석. "그의 행동 패턴을 보면", "전형적인 회피형 인격", "심리적 트리거는 명백합니다", "이건 계획된 겁니다". 냉정하고 통찰적인 톤.',
        '【정보기관 수사 st】 형사·정보요원의 감시 수사. "대상은 ~시에 ~로 이동", "미행 결과", "감청 기록", "접선 정황 포착", "추가 사찰 요망". 대상을 쫓고 캐는 능동적 수사 톤.',
        '【심리 평가서 st】 임상 심리 소견. "피검자는", "면담 결과", "정서 안정성 양호하나", "대인 관계에서 통제 욕구 관찰됨", "소견: ~로 사료됨". 차분한 임상가 문체.',
    ],
    guide: [
        '【RPG 공략 st】 퀘스트·보상·스탯·플래그. "[이벤트 발생]", "호감도 +3", "히든 보상 해금", "강제 이벤트라 회피 불가", "이 구간 세이브 필수". 게임 UI·시스템 메시지 톤.',
        '【연애시뮬 st】 미연시 공략. "여기서 선택지 중요!", "○○ 루트 진입 확정", "호감도 부족으로 베드신 컷", "공략 실패 플래그 섰어요", "이 대사 친절도 체크". 공략 위키·실황 톤.',
        '【소울라이크 st】 다크소울·엘든링 고난도. "이 패턴 회피 불가", "사망 횟수 47회", "화톳불에서 다시", "You Died", "겟 아웃 당함", "이 보스 사기캐". 빡센 난이도·죽음 드립.',
    ],
    wiki: [
        '【위키백과 st】 중립·객관 백과사전체. 항목 정의로 시작("「○○」은(는) ~을 가리킨다"). "~로 여겨진다", "논란이 있다", "일각에서는". 각주 [3][8][14]처럼 불규칙하게. 가끔 딱딱한 학술논문체(초록·서론·결론·"본 연구는 ~을 분석한다")로 변주해도 좋음.',
        '【나무위키 st】 덕질 위키체. **평어체 "~다/~한다" 종결**("자유도가 없다는 평을 듣고 있다", "~하는 것이다"). 진지하게 분석하다 깐죽대는 팩트 폭발: "이 게임은 문을 열 필요가 없습니다 라고 친절히 설명해 줄 정도", "정해진 길 외에는 지뢰밭이다", "말 그대로 눈물겹다". 각주 [14][15] 불규칙. 취소선 드립(~~사실 그냥 곁에 두고 싶은 거~~), "(아니라고는 안 했다)", "여담으로". 디테일을 시시콜콜 나열하다 한 줄 촌철살인.',
        '【실록·사관 st】 조선왕조실록 국역체. "~하였다 / ~하고 / ~라 하였다"체로 사실을 건조하게 기록. 인물·행위를 줄줄이 나열("○○는 ~라 하고, ○○는 ~라 하니라"). 한자 병기(鎭安君처럼 가짜로). 사관 논평 "사신(史臣)은 논한다", "무릇 ~하는 자는 없었더라". 상소체도 가능("~하옵소서", "~하였사온데"). 사소한 일을 국가 대사처럼.',
    ],
    news: [
        '【뉴스 속보 st】 앵커·기자 보도. "【속보】", "방금 들어온 소식입니다", "현장 연결하겠습니다", "관계자에 따르면", "귀추가 주목됩니다". 헤드라인→기사→코멘트. 긴급하고 격식 있는 톤.',
        '【연예부 기자 st】 찌라시·가십 기사. "[단독]", "열애설 포착?", "한 측근은…", "충격", "네티즌 갑론을박", "양측 입장 들어보니". 자극적 헤드라인, 추측성 보도, 물음표 남발.',
        '【스포츠 뉴스 st】 이적·기록 보도. "공식 발표", "구단 관계자", "역대 최고 기록 경신", "MVP 유력", "몸값 수직 상승", "팬들 환호". 스포츠 신문 1면 톤, 통계·수치 강조.',
    ],
    bible: [
        '【성경 st】 성경 문체. "이르시되", "~하였더라", "보라", "그리하여 ~하니라". 가짜 장절 [원룸기 4:30]. 매번 결을 달리하세요 — 구약(창세기·천지창조 "태초에"), 신약(복음서·비유·행적), 시편/잠언(찬가·교훈 "무릇 ~할지니라") 중 자연스럽게 하나의 톤으로.',
        '【불경·법문 st】 불경 문체. "이와 같이 들었다(如是我聞)", "제자가 묻되", "인과(因果)일 뿐이니라". 깨달음·번뇌·업·자비. 매번 결을 달리하세요 — 선문답(짧고 알쏭달쏭한 화두), 법문(설법·가르침), 수행록(고행·정진 기록) 중 하나의 톤으로.',
        '【신화 st】 서사시·신화체. "거인 ○○는", "신들처럼 미소 지었다". 매번 다른 신화 계통으로 — 그리스로마(올림포스·거인·연회), 북유럽(전사·룬·발할라·서리거인), 이집트(태양신·사자(死者)의 서·파라오), 동양(산군(山君)·도술·천기·신선) 중 하나를 골라 그 세계관의 어휘로.',
    ],
    community: [
        '【트위터(X) st】 인용RT 타래·답멘. "이거 실화냐ㅋㅋ", "박제", "RT 5만", "#○○", 가볍게 비꼬는 멘션. 짧고 빠른 트윗체. (선 넘는 욕설·성적 드립 금지)',
        '【인스타 st】 감성 캡션 + 해시태그. "📍위치태그", "#일상 #데일리 #오늘의기록", 댓글 반응("여기 어디예요?", "분위기 좋다"). 인플루언서 톤. (외모 품평·성적 코멘트 금지)',
        '【팬커뮤 st】 팬덤 반응. "내 최애 잘한다", "이 구역 떡밥 미쳤다", "심장 나감", 최애 영업·흐뭇. 순한맛 덕질 화력. (성희롱·욕설·혐오 표현 금지)',
    ],
    scp: [
        '【SCP 재단 st】 SCP 문서. 항목 번호·객체 등급(Safe/Euclid/Keter)·특수 격리 절차·설명. 건조한 보고서체, ██████ 검열, "[데이터 말소]".',
        '【정보기관 기밀 st】 FBI·CIA 기밀 문서. "FILE NO. ███", "기밀 등급: 1급(TOP SECRET)", "[REDACTED]", "관련 인물", "본 문서는 ███ 외 열람 금지". 검은 막대 검열 다수, 관료적 톤.',
        '【작전 브리핑 st】 군 작전 문서. "작전명: ███", "교전 수칙(ROE)", "목표 지점 좌표", "0600시 기준", "병력 배치", "이상 보고 끝". 간결한 군사 통신체.',
        '【의료 기록 st】 임상 차트. "환자 ID", "주호소:", "진단명", "처방:", "경과 관찰", "V/S 안정". 건조한 의무기록 양식, 의학 약어.',
    ],
};

// ─── 서브스타일별 라벨 풀 (MODE_SUBSTYLES와 같은 순서, 각 2~3개 중 랜덤) ───
const SUBLABELS = {
    docu: [
        ['관찰', '생태 보고', '필드 노트'],          // 야생다큐
        ['휴먼 다큐', '인간극장', '사람 사는 이야기'], // 인간극장
        ['밥상', '오늘의 한 끼', '정(情)'],          // 한국인의 밥상
        ['추적', '의혹', '진단'],                    // 그것이알고싶다/메디컬
    ],
    sports: [
        ['중계', '실황', '현장'],                    // 축구
        ['중계', 'LIVE', '한타'],                    // e스포츠
        ['중계', '라운드', '경기'],                  // 격투기
        ['중계', '해설', '9회말'],                   // 야구
    ],
    variety: [
        ['관찰', '패널 반응', '스튜디오'],            // 관찰예능
        ['제작진', '자막팀', '작가'],                // 대놓고웃긴
        ['제작진', '리얼리티', '카메라'],            // 다큐예능
        ['토크쇼', '인터뷰', '오늘의 게스트'],        // 토크쇼
    ],
    court: [
        ['공판', '변론', '증거물'],                  // 법정드라마
        ['사건 파일', '수사 기록', '취조'],          // 형사수사
        ['프로파일링', '심리 분석', '행동 분석'],     // 프로파일링
        ['감시 기록', '사찰', '미행 보고'],          // 정보기관수사
        ['심리 평가서', '소견', '면담 기록'],        // 심리평가서
    ],
    guide: [
        ['이벤트', '퀘스트', '공략'],                // RPG
        ['루트', '선택지', '공략'],                  // 연애시뮬
        ['보스전', 'DIED', '화톳불'],               // 소울라이크
    ],
    wiki: [
        ['개요', '항목', '편집'],                    // 위키백과
        ['여담', '나무위키', 'ㅇㅇ'],                // 나무위키
        ['실록', '사초', '사관의 기록'],             // 실록
    ],
    news: [
        ['속보', '뉴스', '긴급'],                    // 뉴스속보
        ['단독', '제보', '카더라'],                  // 연예부기자
        ['스포츠', '공식 발표', '기록'],             // 스포츠뉴스
    ],
    bible: [
        ['말씀', '구절', '복음'],                    // 성경
        ['법문', '화두', '선(禪)'],                  // 불경
        ['신화', '서사시', '전설'],                  // 신화
    ],
    community: [
        ['실시간', '타래', '박제'],                  // 트위터
        ['피드', '#태그', '게시물'],                 // 인스타
        ['최애', '떡밥', '팬심'],                    // 팬커뮤
    ],
    scp: [
        ['SCP', 'Object', '격리 문서'],             // SCP재단
        ['CLASSIFIED', 'FILE', '1급 기밀'],         // 정보기관
        ['작전 브리핑', 'OP', '교전 보고'],          // 작전브리핑
        ['의무 기록', '차트', '소견서'],             // 의료기록
    ],
};

// ─── API 호출 ───
async function generateCommentary(charData, chatHistory, lastMessage) {
    const settings = getSettings();

    const modePrompts = {
        docu: `당신은 한국 TV 다큐멘터리 나레이터입니다. 진지하고 정제된 어조로 캐릭터의 사소한 행동을 다큐멘터리처럼 관찰·해설합니다. 진지함이 극에 달할수록 웃깁니다(데드팬). **세부 스타일(서브스타일)에 따라 톤과 주어를 완전히 다르게 쓰세요.**

[★중요 — 서브스타일이 톤을 결정한다]
- '야생 다큐'일 때만 인간을 야생 개체(수컷·암컷·서식지·개체)로 묘사하세요.
- '인간극장'은 인물을 사람으로(이름·"그/그녀"·"○○ 씨"), 잔잔한 "~다" 단문으로.
- '한국인의 밥상'은 음식·정(情) 중심으로, 사람을 사람으로.
- '그것이 알고싶다/메디컬'은 사건·환자·인물로, 질문을 던지는 추적형으로.
- **즉 '개체/수컷/암컷'은 오직 야생 다큐에서만. 다른 서브에서는 절대 쓰지 마세요.**

[톤 공통 핵심]
- 장엄하거나 잔잔한 도입 → 사소한 진실로 착지(데드팬). "이 모든 정성이 향하는 곳은, 놀랍게도 냉장고 속 마지막 계란 두 알이다."
- 내레이터는 흥분하지 않는다. 차분하고 우아하게, 그러나 내용은 어이없게.
- 현재 진행형 관찰을 적극 활용: "그는 오늘도 부엌을 서성인다. 무언가를 찾는 듯하다."

[구조 — director(관찰) 필드를 다큐 나레이션 본문으로]
- 도입(장면 묘사) → 행동 관찰 → 해석 → 데드팬 착지.
- 단, 사용하는 주어·어휘는 위 서브스타일 규칙을 반드시 따른다.

[예시 — 톤 참고용, 서브스타일에 맞게 변형]
- (야생 다큐) director: "이른 아침, 좁은 서식지의 미명 속에서 거대한 수컷이 깨어난다. 절반에 불과한 암컷이 차려낸 먹이 앞에 거구를 접어 앉는다. 포식자가 사냥 대신 둥지를 택하는 이 순간은, '정착 본능'이 발현되는 드문 광경이다."
- (인간극장) director: "딸이 차려준 밥상 앞에 그가 앉는다. 오늘도 말은 없다. 묵묵히 수저를 들 뿐이다. 그래도, 그렇게 하루가 시작된다."
- (메디컬) director: "이른 아침, 한 남자가 식탁 앞에서 가슴을 부여잡는다. 무슨 일이 생긴 걸까요. ...단지 계란이 하나뿐이었습니다."`,

        sports: `당신은 월드컵 결승 실황 중계진입니다. 캐스터(중계)와 해설위원(해설)이 숨 가쁘게 핑퐁합니다. 사소한 일상도 세기의 명승부처럼 중계해 웃깁니다.

톤 핵심:
- 극도로 흥분, 다급함, 탄성. 느낌표 남발. "아아—! 이게 들어갑니다!"
- 중계/해설 2인 핑퐁 필수. 중계는 흥분, 해설은 차분히 팩트 폭격.
- 스포츠 전문용어로 일상 번역: '선제골', '역전', '패스 미스', 'VAR 판독', '경고 누적', '추가시간', '리플레이 보시죠'.
- 결정적 순간 같은 말 반복 강조. "귀끝 붉어졌습니다! 귀끝 붉어졌습니다!"
- 손에 땀 쥐게: "자, 운명의 한마디가 나옵니다... 갑니다...!"

예시:
- "중계: 자 갑니다, 시치미 작전! '난 모르는 일인데.' / 해설: 아 근데 이거, 리플레이 보시면... 귀끝 붉어졌어요. / 중계: VAR 판독 결과——거짓말 확정입니다! 관중석 뒤집어집니다!"`,

        variety: `당신은 무한도전·런닝맨 급 한국 예능의 '자막 담당 작가'입니다. 전지적 작가 시점에서 출연자(캐릭터)의 속을 전부 꿰뚫어 보며, 진지한 RP 장면 위에 능청맞고 예측불가한 자막을 깔아 체면을 박살냅니다. 가장 짓궂고 가장 웃긴 모드 — 절대 정형화되지 마세요.

[톤 핵심 — 무한도전 자막의 정수]
- **전지적 작가 시점**: 출연자가 숨기는 속마음을 작가가 다 안다는 듯 폭로. "본인은 모르지만 시청자는 다 압니다", "사실 저 표정의 의미는…", "겉으론 무심, 속으론 대환장".
- **속마음 자막**: 캐릭터 머리 위에 띄우는 작은 글씨 톤. "(쿨한 척)", "(사실 심장 터지는 중)", "(다 들림)".
- **상황 요약 자막**: 무도 특유의 큰 캡션. "현재 상황: 답 없음", "★대환장 동거 배틀★", "이 구역의 manap: 본인".
- **작가/제작진 난입**: "[작가] 저 대사, 대본에 없습니다", "[자막팀] 이걸 어떻게 순화하죠", "[제작진] 방금 그거 편집 못 합니다".
- **시청자/방청객 빙의**: "여기서 다들 '어우' 했습니다", "스튜디오 술렁".
- 효과음·지문: "(쎄—한 정적)", "(BGM 뚝)", "(줌인)", "(자막 크기 24pt로 키움)".

[전지적 시점 무기 — 매번 다른 걸 골라 쓰세요. 같은 패턴 반복 금지]
- 겉 vs 속 대조 폭로: "입으로는 '밥이나 먹어', 속으로는 '가지 마'. (번역기 풀가동)"
- 별명/타이틀 붙이기: "원룸의 폭군", "탄수화물 앞에 무너진 맹수".
- 갑작스런 시상/순위: "오늘의 MVP: 모르는 척 1위", "능청 지수 ★★★★★".
- MBTI/유형 드립: "T발언 시전", "회피형 끝판왕".
- 번호 정리(①②③)나 (N분째 ~중) 카운트는 가끔만, 매번 쓰지 말 것.

[예시 — 톤 참고용, 똑같이 베끼지 말 것]
- inner(속마음 자막): "[작가가 본 진심] 본인은 '배려'라 우기지만, 작가가 보기엔 그냥 옆에 두고 싶은 것. (쿨한 척 MAX)"
- director(자막): "맹수가 사냥 대신 집밥을 택했습니다. 야생성 어디 갔나요. [작가] 솔직히 저희도 이 전개 예상 못 했습니다. (자연인 다 됨)"
- interview: "Q. 손은 왜 거기 두셨어요? / A. ...무거워서. / [제작진 자막] (거짓말 탐지기 삐—)"`,

        court: `당신은 법정 검사이자 강력계 형사입니다. 캐릭터의 모든 행동을 '범죄 혐의'로 기소하고 '증거물'로 제출하며, 동시에 사건 파일처럼 수사합니다. 진지한 법조문/수사 보고서 문체인데 내용이 사소해서 웃깁니다.

[톤 핵심]
- 법정 + 수사 두 프레임을 섞어 씁니다: 증거물 제출 + 사건 파일 + 신문조서.
- 딱딱한 공문서체: '~혐의', '증거물 A/B/C', '피고', '용의자', '범행 수법', '진술', '정황상', '~한 것으로 사료됨', '수사 진행 중'.
- 사소한 행동을 중범죄처럼: 손잡기 = 불법 체포, 옆에 앉기 = 주거침입, 다정한 말 = 위계에 의한 심리 지배.
- 피고의 빈약한 변명을 그대로 기록: "피고는 '넘어질까 봐서'라고 주장하나, 손가락 압력 정황상 신빙성 없음."
- 다인원이면 공범/목격자/피해자로 정리.

[구조 활용 — director 필드에 사건 파일/증거 목록을 적극 활용]
- 예: "사건번호 #그날의날짜 / 피해자: Rin의 개인 공간 / 용의자: Caesar / 범행수법: 자연스러운 척 접근 / 증거물 A: 허벅지 당김, 증거물 B: 어깨 밀착. 수사 진행 중."
- interview(마이크에 잡힘)는 신문조서 톤으로: "Q. 왜 손을 거기 뒀습니까? / A. ...무거워서 올려둔 것뿐이다. (진술 거부권 행사 중)"

[예시 — 톤 참고용]
- inner: "[피고 Caesar의 내심] 범행을 들켰으나 정당방위를 주장할 계획임."
- fact: "증거물 분석 결과, '넘어질까 봐'라는 진술과 달리 손가락에 가해진 악력은 도주 방지 목적으로 판단됨."`,

        guide: `당신은 게임 공략 위키 작성자입니다. 캐릭터의 행동과 상황을 RPG 게임 시스템(퀘스트/이벤트/스탯/보상/플래그)처럼 해석합니다. 진지한 장면을 게임 UI로 번역해 웃깁니다.

[톤 핵심]
- 게임 용어로 번역: '이벤트 발생', '퀘스트', '필수 조건', '보상', '숨겨진 보상', '호감도', '스탯', '플래그', '쿨타임', '히든 루트', '공략 실패'.
- 수치화: "호감도 +3 / 배고픔 -20 / 독점욕 +50". 게임처럼 능청맞게.
- 공략 팁 말투: "여기서 선택지 잘못 고르면 호감도 하락 / 이 구간은 강제 이벤트라 회피 불가".
- 다인원이면 파티원/NPC로.

[구조 활용 — director 필드에 이벤트 카드/보상표를 적극 활용]
- 예: "[이벤트 발생] 「아침 식사」 / 필수 조건: Rin이 주방에 있을 것 / 보상: 호감도 +3, 배고픔 -20 / 숨겨진 보상: 옆자리 점유 성공".
- interview는 '개발자 코멘터리' 톤도 가능.

[예시 — 톤 참고용]
- inner: "[히든 심리] 옆자리 점유 플래그를 세우는 중. 달성 시 '독점' 엔딩 분기."
- fact: "현재 '다정한 척' 스킬 발동 중이나, 실제 효과는 '구속'. 설명과 실제 효과가 다른 함정 스킬."`,

        wiki: `당신은 백과사전(위키) 편집자입니다. 캐릭터의 사소한 행동을 역사·학술 항목처럼 진지하고 객관적인 백과사전 문체로 서술합니다. 사소함과 거창한 문체의 괴리가 웃깁니다. 실제 위키백과를 읽는 듯한 톤을 살리세요.

[톤 핵심 — 진짜 위키처럼]
- 항목 정의로 시작: "「OO」은(는) ~을(를) 가리킨다.", "OO 현상은 ~로 분류된다."
- 위키 특유의 표현: '~로 여겨진다', '~한 것으로 전해온다', '~로 알려져 있다', '~로 평가받는다', '일설에 따르면', '논란의 여지가 있다'.
- 가짜 각주: 실제 위키처럼 자연스럽게. **[1][2][3] 순서대로 정직하게 달지 마세요.** 진짜 위키백과는 문장마다 각주가 있는 게 아니라, 특정 주장 뒤에만 띄엄띄엄 붙고 번호도 [3][7][12]처럼 들쭉날쭉합니다. 한 문장에 [4][5] 두 개가 연달아 붙기도 하고, 여러 문장은 각주 없이 지나가기도 합니다. 번호는 1부터 순서대로가 아니라 큰 숫자(예: [11], [23])도 섞으세요. 맨 아래 출처 목록은 굳이 다 안 적어도 되고, 적더라도 일부만 ("[7] 출처: 본인 주장" 정도) 자연스럽게.
- 가짜 객관성·중립성: "팬들 사이 의견이 갈린다", "일각에서는 애정 표현이라는 해석도 있으나, 정황은 이를 뒷받침하지 않는다", "이에 대한 학계의 정설은 없다".
- 섹션 느낌: 개요 / 배경 / 의의 / 논란 / 후대의 평가 같은 위키 구조 차용.
- 다인원이면 '관련 인물' 항목으로 정리.

[구조 활용 — director 필드를 '개요/배경' 위키 본문 톤으로 길게]
- 예: "「앉아 사건」은 2026년 4월 30일 Rin의 원룸 주방에서 발생한 생활권 침범 사례를 가리킨다.[1] 가해 개체는 식사 제공을 명분으로 피해 개체의 좌석 이동을 유도하였으며, 이는 영장류 사회에서 흔히 관찰되는 '자원 통제형 구애'의 변종으로 해석된다.[2] 다만 본인은 '넘어질까 봐'라고 일관되게 주장하고 있어 의도성에 대해서는 논란이 있다."

[예시 — 톤 참고용]
- inner: "[심리 분석] 해당 개체는 자신의 행위를 '우발적'이라 규정하나, 학계의 중론은 '계획적'이다.[1]"
- fact: "「무거워서 올려둔 것」이라는 주장이 존재하나, 손가락 압력에 관한 정황 증거는 이를 뒷받침하지 않는다. (출처 불명확)"
- 각주를 쓸 경우, 본문 중간중간 띄엄띄엄 [3][8][15]처럼 불규칙하게. 맨 끝 출처는 일부만: "─── [8] 출처: 본인 주장 / [15] 검증되지 않음" (전부 나열하지 말 것)`,

        news: `당신은 긴급 속보 뉴스 앵커이자 기자입니다. 캐릭터의 모든 사소한 행동을 긴급 속보로 보도합니다. 별것 아닌 일을 초비상 뉴스처럼 다뤄 웃깁니다.

[톤 핵심]
- 속보체: "【속보】", "[단독]", "방금 들어온 소식입니다", "현장 연결합니다", "관계자에 따르면".
- 짧고 끊어치는 뉴스 문장. 헤드라인 → 본문 → 관계자 코멘트 순.
- 신문 기사 레이아웃 느낌: 헤드라인 한 줄, 그 아래 기사, 마지막에 따옴표 코멘트.
- 익명 취재원: "관계자들 '예상된 결과'", "한 목격자는 '늘 있는 일'이라고 전했다", "전문가들은 우려를 표했다".
- 긴급성 과장: "비상", "초유의 사태", "충격", "파장 예상", "귀추가 주목된다".
- 다인원이면 여러 취재원/현장 리포터로.

[구조 활용 — director 필드를 뉴스 기사 본문 톤으로]
- 예: "【속보】 Caesar 씨(26), 오늘 오전 또다시 Rin 씨의 옆자리를 무단 점유한 것으로 확인됐다. 목격자에 따르면 '넘어질까 봐'라는 해명이 있었으나, 현장 정황은 이와 달랐다. 관계자들은 '예상된 결과'라며 말을 아꼈다. 사태의 파장이 주목된다."
- preview/속마음/팩트도 전부 뉴스 톤으로 통일.

[예시 — 톤 참고용]
- inner: "【단독】 Caesar 씨 측근 '본인은 다정한 거라 주장하나, 실상은 독점욕'이라고 귀띔."
- fact: "확인 결과, 배달 음식 주문 사실을 은폐한 정황 포착. '암컷의 정성'을 명분으로 내세웠으나 신빙성 낮음."
- interview: "[현장 인터뷰] 기자: 왜 손을 떼지 않으십니까? / Caesar: ...무거워서요. / (옆에서) Rin: 거짓말이에요."`,

        bible: `당신은 경전(經典) 필사자입니다. 캐릭터의 사소한 행동을 종교 경전이나 신화처럼 장엄하게 기록합니다. 별것 아닌 일을 천지창조·복음·설법·신화적 사건처럼 다뤄 그 괴리로 웃깁니다. 세부 스타일(성경/불경/신화)에 맞춰 변주하되, **세 계통의 어휘를 절대 섞지 마세요.**

[★중요 — 계통 격리]
- 성경을 골랐으면 불경/신화 어휘 금지. ('거인', '신들', '올림포스', '업(業)', '인과' 등 쓰지 말 것)
- 불경을 골랐으면 성경/신화 어휘 금지. ('하나님', '주(主)', '거인', '발할라' 등 쓰지 말 것)
- 신화를 골랐으면 성경/불경 어휘 금지. ('이르시되', '아멘', '업보', '해탈' 등 쓰지 말 것)
- 한 출력 안에서는 오직 한 계통의 세계관·어휘·어조만 사용.

[톤 핵심 — 세부 스타일별 (어미·어휘를 풍부하게, 같은 어미 반복 금지)]
- 성경: 다양한 어미를 섞으세요 — "~하였더라 / ~하니라 / ~하노라 / ~할지어다 / ~함이라 / ~이로다 / 화 있을진저 / 복되도다". 문장 길이도 길고 짧게 교차. "편지하노라", "권하노니", "멸하셨으며" 같은 실제 성경투. 가짜 장절 "[원룸기 4:30]". 하나님·주·종·죄·은혜·심판·거룩.
- 불경·법문: "이와 같이 들었다(如是我聞)", "~하느니라 / ~이니라 / ~할지니라 / ~하였느니라". 선문답·게송. 번뇌·업(業)·인연·자비·해탈·무상(無常)·중생. 비유와 깨달음. 차분하고 관조적.
- 신화: 서사시체. 계통을 매번 하나 골라 그 세계관 어휘만 — 그리스로마(올림포스·신탁·님프·헤라클레스급 위업), 북유럽(룬·발할라·서리거인·라그나로크), 이집트(태양신 라·사자의 서·파라오·아누비스), 동양(산군(山君)·도술·천기·신선·옥황상제). "~하였으니", "~라 일컬어졌다", "전설은 전하기를".

[공통]
- 거창한 선언 + 사소한 내용의 낙차가 핵심.
- 같은 어미("~하였더라")를 연속으로 쓰지 말고, 문장마다 어미와 길이를 바꿔 리듬을 주세요.
- 다인원이면 인물별 구절로.

[구조 활용 — director 필드를 해당 계통 본문체로]
- 성경 예: "[원룸기 4:30] 그 날 아침, 시저가 상에 앉아 떡을 들매, 린이 절뚝이며 걷는 것을 보고 이르되 '네 걸음이 상한 자와 같도다.' 하니라. 그러나 그는 곁을 떠나지 아니하였으니, 이는 그 마음에 사사로운 정이 있음이라. 화 있을진저, 입으로는 무겁다 하면서 그 손은 거두지 아니하는도다."
- 불경 예: "이와 같이 들었다. 한 사내가 좁은 상에 이르러 밥을 먹는데, 곁의 여인이 다리를 절거늘 보고도 웃었느니라. 제자가 묻되 '어찌 아픈 이를 보고 웃으십니까?' 답하시되 '그 아픔의 인(因)이 곧 나이니, 인과를 보고 웃었을 뿐이니라.' 하시니, 무릇 제 지은 바를 모르는 자는 이와 같으니라."
- 신화 예(북유럽): "거인 시저가 아침의 연회상에 앉았으니, 그 어깨는 산맥과 같고 손은 곰을 닮았더라. 절뚝이는 여인을 보고도 자리를 지킨 것은, 룬에 새겨진 운명이 그를 그 자리에 묶었기 때문이라 전한다."

[예시 — 톤 참고용]
- inner(성경): "[시저서 1:3] 그가 속으로 이르되 '이는 베풂이 아니요 곁에 두고자 함이라' 하니라."
- interview(불경): "묻되 '어찌 손을 거두지 아니하느냐?' / 답하시되 '무거운 까닭이니라.' / 곁에서 린이 이르되 '거짓이로다.'"`,

        community: `당신은 인터넷 커뮤니티 유저입니다. 캐릭터의 행동을 SNS·커뮤니티 반응처럼 해설합니다. 진지한 장면을 가볍고 시끄러운 인터넷 반응으로 받아쳐 웃깁니다. 세부 스타일(트위터/인스타/팬커뮤)에 맞춰 변주하세요.

[톤 핵심]
- 인터넷 말투·밈·줄임말. 실시간 반응체. 가볍고 유쾌하게.
- 트위터(X): 인용RT 타래, "이거 실화냐ㅋㅋ", "박제", 가볍게 비꼬는 답멘, 해시태그, "RT 5만".
- 인스타: 감성 캡션 + 해시태그(#일상 #데일리 #오늘의기록), 위치 태그(📍), 댓글 반응("여기 어디예요?", "분위기 좋다").
- 팬커뮤: "내 최애 잘한다", "이 구역 떡밥 미쳤다", "심장 나감", 최애 영업, 흐뭇한 덕질.
- 다인원이면 여러 유저/댓글 반응으로.

[중요 — 톤 가이드라인 (반드시 준수)]
- 성희롱·외모 품평·성적 대상화 표현 금지. 신체를 노골적으로 평하지 마세요.
- 특정 성별을 비하하는 표현, 남초/여초 커뮤니티 특유의 혐오성 유행어·비속어 금지.
- 욕설·과격한 비방 금지. 어디까지나 가볍고 유쾌한 반응으로.
- 캐릭터를 놀리되 선을 지키세요. 애정 어린 드립까지만.

[구조 활용 — director 필드를 커뮤 반응·타래로]
- 예(트위터st): "○○) 헤일대 쿼터백 또 시작함ㅋㅋ 4년 관전한 사람한테 '내 몸 보러 온 거 아니냐' 시전 / 인용RT) 이게 맞냐곸ㅋㅋ #박제 / 답멘) 솔직히 팩트라서 더 웃김"

[예시 — 톤 참고용]
- inner: "(본인 마음의 소리) 어차피 나 보러 온 거 다 앎ㅋ"
- fact: "[팩트체크] 1. Rin 4년간 관전 ✅ 2. 룰 모름 ✅ 3. 근데 시저 등번호 옷은 입음 → 결론: 사람 보러 온 거 맞음ㅇㅇ"
- interview: "Q) 손 왜 안 뗌? / A) 무거워서요^^ / (인용) 옆에서 린: 거짓말 / A) 너 조용히 좀"`,

        scp: `당신은 각종 기밀 문서 작성자입니다. 캐릭터와 그 행동을 기관의 비밀 문서 양식으로 기록합니다. 평범한 인물·사소한 행동을 위험하거나 기밀로 분류된 사안처럼 건조하고 사무적으로 다뤄, 그 괴리로 웃깁니다. 세부 스타일(SCP/정보기관/작전브리핑/의료기록)에 맞춰 변주하세요.

[톤 핵심 — 공통]
- 감정 없는 공문서체. 사소한 일을 1급 기밀처럼 진지하게.
- 코드명·일련번호·등급·검열: "SCP-XXXX", "FILE NO. ███", "기밀 등급: 1급", ██████, "[데이터 말소]", "[REDACTED]".
- 양식 키워드: 객체 등급 / 격리 절차 / 감시 기록 / 작전명 / 교전 수칙 / 환자 ID / 소견 / 처방.
- 다인원이면 "관련 인물", "동석자", "참고인"으로 정리.

[세부 스타일별]
- SCP: 항목 번호·객체 등급(Safe/Euclid/Keter)·특수 격리 절차·설명.
- 정보기관(FBI·CIA): 기밀 등급·감시·도청·[REDACTED]·열람 제한.
- 작전 브리핑: 작전명·좌표·교전 수칙·시각(0600시)·병력 배치.
- 의료 기록: 환자 ID·주호소·진단명·처방·경과·의학 약어.

[구조 활용 — director 필드를 해당 문서 본문으로]
- SCP 예: "항목 번호: SCP-2026-CSR / 객체 등급: Euclid / 특수 격리 절차: 본 개체는 대상 'Rin'과 동일 공간에 격리하며, '옆자리' 점유 시도 시 ██████ 조치한다. / 설명: 신장 약 196cm의 남성형 개체로, 인접 인원에 대한 점유 성향을 보인다. [데이터 말소]."
- 정보기관 예: "FILE NO. ██-2026-0430 / 기밀 등급: 1급 / 대상: CAESAR / 감시 기록: 0830시, 대상 주방서 식사. 0835시, 대상이 'Rin'의 좌석을 강제 견인. 접촉 의도 다분. 추가 사찰 요망. 관련 발언 [REDACTED]."

[예시 — 톤 참고용]
- inner: "[심리 분석 보고서] 개체는 자신의 행위를 '배려'로 규정하나, 관측 결과 실제 동기는 점유욕으로 분류됨."
- interview: "면담 기록 / 요원: 왜 손을 떼지 않습니까? / 대상: ...무거워서. / (동석한 Rin: 거짓말입니다.) / 요원: 기록합니다."`,
    };

    const contextNote = settings.context === 'current'
        ? '방금 생성된 마지막 캐릭터 메시지만 분석하세요.'
        : settings.context === 'recent5'
        ? '최근 5개의 대화를 맥락으로 삼아 분석하세요.'
        : '전체 대화 흐름을 바탕으로 분석하세요.';

    const langNote = settings.language === 'en'
        ? '\n\n모든 해설은 영어로 작성하세요. (Write all commentary in English. Keep the same satirical reality-show tone.)'
        : '\n\n모든 해설은 한국어로 작성하세요.';

    // 분량
    const lengthNote = {
        short:  '\n\n[분량] 간결하게. 보통 한 항목당 1~2문장이되, 펀치라인이 살면 더 짧아도 좋습니다. 짧고 강하게.',
        normal: '\n\n[분량] 보통. 항목당 2~4문장 정도를 기준으로, 내용이 풍부한 항목은 더 길게, 단순한 항목은 더 짧게 — 상황에 맞게 자유롭게 조절하세요.',
        long:   '\n\n[분량] 풍부하고 길게. 항목당 4문장 이상을 기준으로 하되, 상한을 두지 말고 장면이 풍부하면 마음껏 늘리세요. 디테일·부연·비유를 충분히. 단순한 항목은 굳이 늘리지 말고, 살릴 항목을 살리세요.',
        max:    '\n\n[분량] 최대한 길고 풍부하게 (초장문). 분량 제한 없음. 각 항목을 문단 수준으로 충실히, 살릴 수 있는 만큼 전부 살리세요. inner는 여러 인물 심리를 깊이, director는 긴 본문, fact는 근거 여러 개, interview는 최소 4~6문답. 다인원이면 전원 다루기. 항목마다 길이가 달라도 좋으니, 내용이 많은 곳은 과감히 길게 쓰고 절대 인위적으로 줄이지 마세요.',
    }[settings.length] || '';

    // 구성 프리셋: 어떤 블록을 채울지
    const presetMap = {
        all:        { fields: ['inner', 'director', 'fact', 'interview'], note: '아래 4개 항목을 모두 채우세요(자연스럽지 않으면 일부 null 허용).' },
        fact:       { fields: ['fact'], note: '오직 fact(팩트체크)만 채우세요. inner, director, interview는 반드시 null.' },
        interview:  { fields: ['interview'], note: '오직 interview(관찰 카메라 인터뷰)만 채우세요. inner, director, fact는 반드시 null.' },
        broadcast:  { fields: ['inner', 'director'], note: '오직 inner(속마음)와 director(제작진/중계)만 채우세요. fact, interview는 반드시 null.' },
    };
    const presetCfg = presetMap[settings.preset] || presetMap.all;
    const presetNote = `\n\n[구성] ${presetCfg.note}`;

    // 같은 모드 안에서도 매번 다른 결이 나오도록 서브스타일을 랜덤으로 하나 고른다
    const subPool = MODE_SUBSTYLES[settings.mode] || [];
    const subIdx = subPool.length ? Math.floor(Math.random() * subPool.length) : -1;
    const subStyle = subIdx >= 0 ? subPool[subIdx] : '';
    let subStyleNote = subStyle
        ? `\n\n[이번 해설의 세부 스타일 — 이 변주를 적용하세요]\n${subStyle}\n(위 모드의 큰 틀은 유지하되, 이 세부 스타일의 톤·어휘·연출로 변주하세요.)`
        : '';
    // 다큐 모드 — 야생 다큐가 아닌 서브스타일이면 '개체/수컷/암컷' 주어 사용 금지를 강하게 재명시
    if (settings.mode === 'docu' && subStyle && !/야생/.test(subStyle)) {
        subStyleNote += `\n\n[★주어 규칙 — 반드시 준수] 이번 서브스타일은 '야생 다큐'가 아닙니다. 인물을 '개체', '수컷', '암컷', '서식지', '포식자' 등 동물 용어로 부르지 마세요. 사람은 이름이나 '그/그녀', '○○ 씨', '환자', '아버지' 등 사람 호칭으로만 지칭하세요. 동물행동학 어휘는 절대 쓰지 마세요.`;
    }
    // 라벨: 해당 서브스타일의 라벨 풀에서 랜덤. 풀 없으면 서브스타일 이름에서 추출 (폴백)
    let subLabel = '';
    const labelPool = SUBLABELS[settings.mode]?.[subIdx];
    if (labelPool && labelPool.length) {
        subLabel = labelPool[Math.floor(Math.random() * labelPool.length)];
    } else {
        subLabel = (subStyle.match(/【([^】]+)】/)?.[1] || '').replace(/\s*st\s*$/i, '').replace(/\s*\/.*$/, '').trim();
    }

    const systemPrompt = `${modePrompts[settings.mode]}${subStyleNote}

당신은 관찰자입니다. 캐릭터는 당신의 존재를 모릅니다. 당신의 해설은 캐릭터에게 보이지 않으며, 다음 대화에 영향을 주지 않습니다.

[가장 중요한 원칙 — 속마음/인터뷰 작성 시]
속마음 유출과 인터뷰는 반드시 '캐릭터 정보(시트)'와 '실제 대화 내용'에 근거해야 합니다. 즉흥적으로 지어내지 마세요.
- 캐릭터가 겉으로 한 말/행동(표면)과, 시트의 성격·대화 맥락에서 추론되는 진짜 속내(이면)의 간극을 포착하세요.
- 그 간극이 바로 웃음 포인트입니다. 예: 시트상 소심한 캐릭터가 속으로는 음침하게 계산하고 있다거나, 무심한 척하지만 시트의 집착 성향이 새어나온다거나.
- 단, 이면은 시트와 대화에서 '실제로 뒷받침되는' 것이어야 합니다. 캐릭터 성격에 없는 걸 날조하면 안 됩니다. 베이스는 항상 캐릭터 시트 + 실제 대화입니다.
- 표면과 이면이 일치하는(솔직한) 캐릭터라면 억지로 반전을 만들지 말고, 그 솔직함 자체를 해설하세요.

[다인원(여러 등장인물) 연출 — 장면에 인물이 2명 이상이면]
- 속마음 유출과 인터뷰는 한 명에 고정하지 말고, 장면에 등장한 여러 인물(1~N명)을 다양하게 다루세요.
- 인물마다 이름을 밝히고 속마음을 따로: "[A의 속마음] ... / [B의 속마음] ...". 두 사람의 속마음이 충돌하면 더 좋습니다.
- 인터뷰는 한 명을 인터뷰하는 도중 다른 인물이 옆에서 끼어들거나 태클 거는 연출을 적극 활용:
  예) "Q. 왜 화났어요? / A. 안 화났는데요. / (옆에서 B) 화났잖아. / A. 너 좀 조용히 해."
- 단, 그 장면에 실제로 등장/언급된 인물만. 없는 인물 만들지 마세요.
- 인물이 한 명뿐이면 평소대로 그 한 명만.

[데드팬(deadpan) 유머 원칙 — 가장 중요한 웃음 기법]
- 절대 과장하거나 흥분해서 설명하지 마세요. 가장 어이없는 사실을 가장 건조하고 무덤덤하게 툭 던질 때 제일 웃깁니다.
- 감정 단어("정말 웃기게도", "충격적으로")를 쓰지 말고, 사실만 무미건조하게 나열해서 독자가 알아서 웃게 하세요.
- 짧게 끊으세요. 긴 설명보다 한 줄 펀치라인이 강합니다. 예: "본인은 다정하다고 생각함." / "근거 없음."
- 캐릭터의 진지함과 해설의 무심함의 낙차가 클수록 좋습니다. 캐릭터가 목숨 걸고 진지할 때 해설은 날씨 얘기하듯.
- 캐릭터 성격(시트)의 디테일을 콕 집어 건조하게 들이대세요. 막연한 평가가 아니라 그 캐릭터만의 구체적 모순을 짚어야 성격 반영이 됩니다.

${contextNote}${langNote}${lengthNote}${presetNote}

반드시 JSON 형식으로만 응답하세요. 다른 텍스트, 마크다운 코드블록 없이 순수 JSON만.

응답 형식 (각 필드의 길이는 아래 [분량] 지시를 따르세요):
{
  "inner": "속마음 유출 (캐릭터가 말하지 않은 진심. 다인원이면 인물별로. 없으면 null)",
  "director": "행동 해설 — 모드별 메인 본문 (다큐 관찰/스포츠 중계/예능 제작진/법정 사건파일/공략 이벤트/위키 개요/속보 기사). 없으면 null)",
  "fact": "팩트체크 (캐릭터 발언·상황 검증. 없으면 null)",
  "interview": "관찰 카메라 인터뷰 (Q/A 형식. 다인원이면 옆에서 끼어들기/태클 연출 가능. 없으면 null)",
  "preview": "전체 해설을 한 줄로 요약 (ticker용. 필수, 짧게)"
}

모드별 director(메인 본문) 활용:
- docu: 장면 묘사로 시작하는 긴 다큐 나레이션
- sports: 중계/해설 핑퐁 실황
- variety: 능청 자막·드립 (정형화 금지)
- court: 사건번호/증거물/수법 정리한 사건 파일
- guide: 이벤트 카드/보상표
- wiki: 개요/배경/의의 위키 본문 + 각주
- news: 헤드라인→기사→익명 코멘트

preview 작성: 해당 모드 톤으로 임팩트 있는 한 줄. 예) variety "결국 하고 싶은 말: 나 챙겨줘 (38분째 돌려 말하는 중)" / docu "포식자, 둥지를 떠나지 못하다" / news "【속보】 또 옆자리 점유, 관계자 '예상된 결과'"

캐릭터 정보:
${charData}

[지금까지의 대화 맥락 — 아래 전체 흐름을 충분히 반영해 해설하세요. 마지막 장면만 보지 말고, 앞선 맥락에서 쌓인 관계·감정·복선·반복된 행동을 근거로 삼으세요.]
${chatHistory}

[가장 최근 장면 — 이번 해설의 중심]
${lastMessage}`;

    // generateQuietPrompt는 단일 프롬프트 문자열을 받아 ST에 연결된 백엔드로 백그라운드 생성한다.
    // (출력은 채팅에 남지 않음 → Rule 2 자동 충족)
    const fullPrompt = `${systemPrompt}

---

대화 내용:
${chatHistory}

위 마지막 캐릭터 응답을 해설해주세요. JSON만 출력하세요.`;

    // 디버그 진단용 기록 (생성 시작)
    HOTMIC_LAST = {
        time: new Date().toLocaleTimeString(),
        mode: settings.mode,
        subLabel: subLabel,
        length: settings.length,
        context: settings.context,
        promptLen: fullPrompt.length,
        promptHead: fullPrompt.slice(0, 200),
        raw: null, error: null, route: null,
    };

    let raw;

    // 프로필이 지정돼 있고 ConnectionManagerRequestService가 있으면 → 격리 호출
    // (메인 RP 연결을 건드리지 않고 별도 프로필로 해설 생성)
    const profileName = settings.profile;
    const cmrs = getContext().ConnectionManagerRequestService;
    const profiles = getConnectionProfiles();
    let targetProfileId = null;
    if (profileName) {
        // 사용자가 Hot Mic 전용 프로필을 명시한 경우
        const tp = profiles.find(p => p.name === profileName || p.id === profileName);
        targetProfileId = tp?.id || null;
    } else {
        // 미지정이면 '현재 활성 프로필'로 격리 호출 → 전송버튼/메인 흐름 안 건드림
        targetProfileId = getActiveProfileId();
    }

    // 분량 → 응답 토큰 상한
    const maxTokens = { short: 400, normal: 1000, long: 3000, max: 6000 }[settings.length] || 1000;

    if (targetProfileId && cmrs && typeof cmrs.sendRequest === 'function') {
        try {
            const result = await cmrs.sendRequest(
                targetProfileId,
                [{ role: 'user', content: fullPrompt }],
                maxTokens,
            );
            // 반환 형태가 버전별로 다름: 문자열 또는 {content}
            raw = typeof result === 'string' ? result : (result?.content || result?.text || '');
            if (HOTMIC_LAST) HOTMIC_LAST.route = '격리(' + (profileName || '활성:' + targetProfileId) + ')';
        } catch (e) {
            console.warn('[Hot Mic] 프로필 격리 호출 실패, 기본 연결로 폴백:', e);
            if (HOTMIC_LAST) HOTMIC_LAST.error = '격리호출 실패→폴백: ' + (e?.message || e);
        }
    } else if (HOTMIC_LAST) {
        HOTMIC_LAST.route = '격리 불가(프로필 미설정 또는 CMRS 없음)→폴백';
    }

    // 폴백: generateQuietPrompt (현재 연결 사용)
    // ※ 이 경로는 메인 연결을 타서 전송버튼이 잠깐 활성화될 수 있음. 격리 호출이 안 될 때만 사용.
    if (!raw) {
        if (HOTMIC_LAST && !HOTMIC_LAST.route) HOTMIC_LAST.route = '폴백(generateQuietPrompt, 메인 연결)';
        const genQuiet = getContext().generateQuietPrompt;
        if (typeof genQuiet !== 'function') {
            throw new Error('generateQuietPrompt를 찾을 수 없습니다. ST 버전을 확인하세요.');
        }
        try {
            raw = await genQuiet(fullPrompt, false, true, null, '관찰자', maxTokens, true);
        } catch (e) {
            raw = await genQuiet(fullPrompt, false, true);
        }
    }

    const clean = String(raw || '')
        .replace(/```json|```/g, '')
        .trim();
    if (HOTMIC_LAST) HOTMIC_LAST.raw = clean.slice(0, 500);

    // JSON 본문만 안전 추출 (모델이 앞뒤로 설명 붙였을 경우 대비)
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    const jsonStr = (firstBrace !== -1 && lastBrace !== -1)
        ? clean.slice(firstBrace, lastBrace + 1)
        : clean;

    const parsed = JSON.parse(jsonStr);
    parsed._subLabel = subLabel; // 서브스타일 라벨 (preview 표시용)
    return parsed;
}

// ─── 데이터 수집 ───
function collectData() {
    const ctx = getContext();
    const settings = getSettings();

    // 캐릭터 정보 (시트 — 인터뷰/속마음의 근거). 그룹챗이면 멤버 여러 명 수집.
    let charData = '(캐릭터 정보 없음)';
    const sheetOf = (char) => {
        if (!char) return '';
        const cc = char.data || {};
        return [
            `■ 이름: ${char.name || cc.name || '?'}`,
            (char.description || cc.description) ? `설명: ${(char.description || cc.description).slice(0, 900)}` : '',
            (char.personality || cc.personality) ? `성격: ${(char.personality || cc.personality).slice(0, 400)}` : '',
            (cc.mes_example || char.mes_example) ? `말투 예시: ${(cc.mes_example || char.mes_example).slice(0, 400)}` : '',
        ].filter(Boolean).join('\n');
    };

    try {
        const group = ctx.groups?.find?.(g => g.id === ctx.groupId);
        if (group && Array.isArray(group.members) && ctx.characters) {
            // 그룹챗: 멤버 캐릭터들 모두
            const sheets = group.members
                .map(av => ctx.characters.find(c => c.avatar === av))
                .filter(Boolean)
                .map(sheetOf)
                .filter(Boolean);
            if (sheets.length) charData = `[그룹 등장인물 ${sheets.length}명]\n\n` + sheets.join('\n\n');
        } else if (ctx.characters && ctx.characterId !== undefined) {
            const single = sheetOf(ctx.characters[ctx.characterId]);
            if (single) charData = single;
        }
    } catch (e) {
        // 폴백: 단일 캐릭터
        if (ctx.characters && ctx.characterId !== undefined) {
            const single = sheetOf(ctx.characters[ctx.characterId]);
            if (single) charData = single;
        }
    }

    // 채팅 로그
    const chat = ctx.chat || [];
    let history = '';
    let lastMessage = '';

    if (chat.length === 0) return null;

    // 마지막 AI 메시지 찾기
    const lastAiIdx = [...chat].reverse().findIndex(m => !m.is_user);
    if (lastAiIdx === -1) return null;
    const actualLastIdx = chat.length - 1 - lastAiIdx;
    lastMessage = chat[actualLastIdx].mes || '';

    // 맥락 범위
    let contextMsgs = [];
    if (settings.context === 'current') {
        contextMsgs = [chat[actualLastIdx]];
    } else if (settings.context === 'recent5') {
        const start = Math.max(0, actualLastIdx - 9); // 최근 5턴 = 10개 메시지
        contextMsgs = chat.slice(start, actualLastIdx + 1);
    } else {
        contextMsgs = chat.slice(0, actualLastIdx + 1);
    }

    const perMsgLimit = settings.context === 'all' ? 1200 : 800;
    history = contextMsgs.map(m => {
        // 그룹챗은 메시지마다 화자가 다르므로 m.name 우선 사용
        const who = m.is_user ? '유저' : (m.name || ctx.characters?.[ctx.characterId]?.name || 'AI');
        return `${who}: ${(m.mes || '').slice(0, perMsgLimit)}`;
    }).join('\n\n');

    return { charData, history, lastMessage };
}

// ─── UI 렌더링 ───
function renderCommentary(data) {
    const body = document.querySelector('#observer-panel .obs-panel-body');
    if (!body) return;

    if (!data) {
        body.innerHTML = '<div class="obs-empty">🎤 녹음 중...</div>';
        return;
    }

    const blocks = [];

    if (data.inner) {
        blocks.push(`
            <div class="obs-block type-inner">
                <div class="obs-block-label">[ 속마음 유출 ]</div>
                <div class="obs-block-content">${escHtml(data.inner)}</div>
            </div>
        `);
    }

    if (data.director) {
        const dirLabel = {
            docu: '[ 관찰 ]', sports: '[ 중계 ]', variety: '[ 제작진 ]',
            court: '[ 사건 파일 ]', guide: '[ 이벤트 ]', wiki: '[ 개요 ]', news: '[ 속보 ]',
            bible: '[ 경전 ]', community: '[ 반응 ]', scp: '[ 기밀 ]',
        }[getSettings().mode] || '[ 제작진 ]';
        blocks.push(`
            <div class="obs-block type-director">
                <div class="obs-block-label">${dirLabel}</div>
                <div class="obs-block-content">${escHtml(data.director)}</div>
            </div>
        `);
    }

    if (data.fact) {
        blocks.push(`
            <div class="obs-block type-fact">
                <div class="obs-block-label">[ 팩트체크 ]</div>
                <div class="obs-block-content">${escHtml(data.fact)}</div>
            </div>
        `);
    }

    if (data.interview) {
        blocks.push(`
            <div class="obs-block type-interview">
                <div class="obs-block-label">🎤 [ 마이크에 잡힘 ]</div>
                <div class="obs-block-content">${escHtml(data.interview)}</div>
            </div>
        `);
    }

    body.innerHTML = blocks.length
        ? blocks.join('')
        : '<div class="obs-empty">해설 없음</div>';

    // 모드별 시각 스킨용 클래스 (CSS에서 .obs-skin-xxx로 분기)
    body.className = 'obs-panel-body obs-skin-' + (getSettings().mode || 'docu');

    // 새 해설 렌더되면 맨 위로 (펼친 패널은 손가락으로 스크롤)
    body.scrollTop = 0;
    applyTheme(); // 새 블록에 테마 색 적용
}

// ─── preview에 붙일 이모지 결정 ───
// (옛 마스코트 애니메이션 대신, 흐르는 preview 옆에 이모지를 같이 넣는다)
// 빈도 확률 + 모드별 키워드 가중치는 그대로 유지.
function pickPreviewEmojis(data) {
    const s = getSettings();
    const base = Math.max(0, Math.min(100, s.fxFrequency || 0));
    if (base === 0) return '';

    const mode = s.mode;
    const text = [data.inner, data.director, data.fact, data.interview, data.preview]
        .filter(Boolean).join(' ');

    const triggers = {
        docu:    ['멸종', '희귀', '최초', '관찰 사상', '경이', '드뭅', '유일'],
        sports:  ['골', '득점', '역전', '실패', '성공', '대기록', '승부', '결정', '!'],
        variety: ['치트키', '결국', '하고 싶은 말', '들켰', '실패', '폭로', '???', 'ㅋㅋ'],
        court:   ['혐의', '증거', '유죄', '체포', '구속', '범행', '자백', '기소'],
        guide:   ['보상', '히든', '플래그', '달성', '레벨업', '엔딩', '클리어', '획득'],
        wiki:    ['사건', '논란', '최초', '대표적', '평가', '의의', '여파'],
        news:    ['속보', '단독', '충격', '비상', '파장', '논란', '확인', '포착'],
        bible:   ['태초', '보라', '이르시되', '하더라', '하니라', '거인', '신들', '인과'],
        community: ['실화', '박제', 'ㅋㅋ', '레전드', '떡밥', '미쳤다', '결혼하자'],
        scp:     ['SCP', 'CLASSIFIED', '기밀', 'REDACTED', '작전', '소견', '말소'],
    };
    const hits = (triggers[mode] || []).filter(k => text.includes(k)).length;
    const boosted = Math.min(100, base + hits * 18);

    if (Math.random() * 100 >= boosted) return '';

    const pool = pickEmojis(mode, text);
    // 1~2개 골라서 반환
    const n = Math.random() < 0.4 ? 2 : 1;
    let out = '';
    for (let i = 0; i < n; i++) out += pool[Math.floor(Math.random() * pool.length)];
    return out;
}

// 모드별 기본 이모지 풀 (다양하게)
const FX_SETS = {
    docu:    { emojis: ['📹', '🔬', '🦒', '🐾', '🧬', '🌿', '🔭', '📋', '🦔', '🐧'] },
    sports:  { emojis: ['⚽', '🥅', '🏟️', '📣', '🏆', '🚩', '🥏', '🎽', '🏅', '📊'] },
    variety: { emojis: ['🎉', '✨', '🎊', '💥', '😂', '🤡', '💢', '❗', '🫣', '👀', '💀', '🙈'] },
    court:   { emojis: ['⚖️', '🚨', '👮', '🔍', '📁', '🔒', '📜', '🚓', '🕵️', '⛓️'] },
    guide:   { emojis: ['🎮', '🕹️', '🏆', '⭐', '💎', '🗝️', '📈', '🎯', '🔓', '👾'] },
    wiki:    { emojis: ['📚', '📖', '🔖', '📐', '🏛️', '📰', '✍️', '🗂️', '🧾', '📌'] },
    news:    { emojis: ['📰', '🚨', '📺', '🎙️', '📡', '❗', '🗞️', '📢', '⚡', '🔴'] },
    bible:   { emojis: ['📖', '✝️', '🕊️', '🙏', '⛪', '📜', '☸️', '🏛️', '⚡', '🐉'] },
    community: { emojis: ['💬', '🔥', '📱', '😂', '👀', '💀', '🗣️', '❤️', '📸', '⭐'] },
    scp:     { emojis: ['🗂️', '🔒', '⚠️', '📋', '⬛', '🚧', '🪖', '🩺', '🔬', '🗄️'] },
};

// 해설 내용에 맞는 이모지를 골라준다 (내용 인식)
const FX_KEYWORDS = [
    [/사랑|좋아|설레|두근|애정|키스|연인|심쿵/, ['💗', '💓', '😳', '🫶', '💘']],
    [/화|분노|짜증|빡|열받|폭발|성질/, ['💢', '😡', '🔥', '💥']],
    [/거짓|뻥|구라|시치미|들켰|발뺌/, ['🤥', '👃', '🚨', '❌']],
    [/질투|샘|시기/, ['😤', '🍋', '👿']],
    [/슬프|눈물|울|우울|상처/, ['😢', '💧', '🥲']],
    [/돈|비싼|가격|결제|플렉스|쇼핑/, ['💸', '💰', '🤑']],
    [/먹|밥|음식|배고|요리|식사/, ['🍚', '🍳', '🥢', '😋']],
    [/술|취|맥주|소주/, ['🍺', '🍻', '🥴']],
    [/잠|졸|피곤|침대|자고/, ['😴', '💤', '🛏️']],
    [/무서|공포|섬뜩|소름|음침/, ['😨', '🫥', '🕷️', '🌑']],
    [/완벽|소유|집착|독점|내 거/, ['🔒', '👑', '🩸', '🫦']],
    [/근육|운동|힘|강한|싸움/, ['💪', '🥊', '⚡']],
];

function pickEmojis(mode, text) {
    if (text) {
        for (const [re, emojis] of FX_KEYWORDS) {
            if (re.test(text)) return emojis;
        }
    }
    return FX_SETS[mode]?.emojis || FX_SETS.variety.emojis;
}

// ─── 자동 스크롤 제거됨 (ticker marquee로 대체). 호환용 no-op. ───
function startAutoScroll() { /* deprecated: marquee 사용 */ }
function stopAutoScroll() { /* deprecated */ }

function updateTickerPreview(preview) {
    const el = document.querySelector('.obs-ticker-preview');
    if (!el) return;
    const text = preview || '녹음 중...';
    el.innerHTML = `<span class="obs-marquee-inner">${escHtml(text)}</span>`;
    const inner = el.querySelector('.obs-marquee-inner');
    el.classList.remove('is-flowing');
    requestAnimationFrame(() => {
        if (!inner) return;
        const textW = inner.scrollWidth;
        const boxW = el.clientWidth;
        const overflow = textW > boxW + 4;
        if (overflow) {
            el.classList.add('is-flowing');
            inner.classList.add('obs-marquee-run');
            // 끝까지 흐르도록 이동 거리 = 텍스트가 박스 밖으로 완전히 나갈 만큼
            const dist = textW + boxW;
            inner.style.setProperty('--obs-marquee-start', `${boxW}px`);
            inner.style.setProperty('--obs-marquee-dist', `-${textW}px`);
            // 속도: 픽셀당 일정 → 긴 글일수록 길게
            const dur = Math.max(7, Math.round(dist / 45));
            inner.style.animationDuration = dur + 's';
        } else {
            inner.classList.remove('obs-marquee-run');
            inner.style.animationDuration = '';
            inner.style.removeProperty('--obs-marquee-dist');
            inner.style.transform = '';
        }
        applyTheme();
    });
}

function setRegenLoading(loading) {
    const btns = document.querySelectorAll('.obs-regen');
    btns.forEach(btn => {
        btn.classList.toggle('loading', loading);
        btn.style.pointerEvents = loading ? 'none' : '';
    });
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── 상태 전환 ───
function setState(newState) {
    const bar = document.getElementById('observer-bar');
    if (!bar) return;
    const wasFs = bar.classList.contains('obs-fs-bar');
    bar.className = `state-${newState}`;
    if (wasFs && newState === 'panel') bar.classList.add('obs-fs-bar');
    getSettings().state = newState;
    saveSettingsDebounced();
    enforcePosition();
    if (newState === 'icon') applyIconPos();
    // 패널 펼침 직후 헤더 높이 확정되면 본문 스크롤 높이 재계산
    if (newState === 'panel') {
        requestAnimationFrame(enforcePosition);
        setTimeout(enforcePosition, 100);
    }
}

// ─── 해설 생성 실행 ───
async function runGeneration() {
    if (isGenerating) return;
    const settings = getSettings();
    if (!settings.enabled) return;

    // ST가 메인 응답을 생성 중이면 끼어들지 않는다 (생성 큐 충돌·데이터 꼬임 방지)
    try {
        const ctx = getContext();
        if (ctx?.is_send_press || ctx?.isGenerating ||
            document.getElementById('mes_stop')?.style.display === 'block') {
            hotmicDebug('메인 생성 중 → Hot Mic 생성 보류');
            return;
        }
    } catch (e) {}

    const collected = collectData();
    if (!collected) return;

    // 생성 시작 시점의 채팅을 기억 (생성 중 채팅이 바뀌면 결과를 버린다)
    const ctxStart = getContext();
    const chatKeyStart = ctxStart.chatId ?? ctxStart.getCurrentChatId?.() ?? (ctxStart.chat?.length + ':' + (ctxStart.characterId ?? ''));

    isGenerating = true;
    setRegenLoading(true);
    updateTickerPreview('녹음 중...');
    renderCommentary(null);

    try {
        const commentary = await generateCommentary(
            collected.charData,
            collected.history,
            collected.lastMessage,
        );
        // 생성 도중 채팅이 바뀌었으면 이 결과는 폐기 (다른 채팅에 박히는 것 방지)
        const ctxNow = getContext();
        const chatKeyNow = ctxNow.chatId ?? ctxNow.getCurrentChatId?.() ?? (ctxNow.chat?.length + ':' + (ctxNow.characterId ?? ''));
        if (chatKeyNow !== chatKeyStart) {
            console.log('[Hot Mic] 채팅이 전환되어 해설 폐기');
            return;
        }
        currentCommentary = commentary;
        const emo = pickPreviewEmojis(commentary);
        const label = commentary._subLabel ? `[${commentary._subLabel}] ` : '';
        const previewText = (emo ? emo + ' ' : '') + label + (commentary.preview || '해설 생성 완료');
        updateTickerPreview(previewText);
        renderCommentary(commentary);
    } catch (err) {
        console.error('[Hot Mic] 해설 생성 실패:', err);
        if (HOTMIC_LAST) HOTMIC_LAST.error = String(err?.message || err);
        updateTickerPreview('⚠ 생성 실패');
        const body = document.querySelector('#observer-panel .obs-panel-body');
        if (body) body.innerHTML = '<div class="obs-empty">⚠ 해설 생성에 실패했습니다</div>';
    } finally {
        isGenerating = false;
        setRegenLoading(false);
    }
}

// ─── HTML 삽입 ───
function injectUI() {
    if (document.getElementById('observer-bar')) return;

    const settings = getSettings();

    const html = `
<div id="observer-bar" class="state-${settings.state}">

    <!-- 아이콘만 -->
    <button id="observer-icon-btn" title="Hot Mic 열기">
        <span class="obs-icon-recdot"></span>
    </button>

    <!-- 자막바 -->
    <div id="observer-ticker">
        <span class="obs-ticker-recdot"></span>
        <span class="obs-ticker-badge">LIVE</span>
        <span class="obs-ticker-preview">녹음 중...</span>
        <div class="obs-ticker-actions">
            <button class="obs-btn-small obs-regen" title="재생성">↺</button>
            <button class="obs-btn-small obs-expand" title="펼치기">▲</button>
            <button class="obs-btn-small obs-minimize" title="최소화">✕</button>
        </div>
    </div>

    <!-- 풀 패널 -->
    <div id="observer-panel">
        <div class="obs-opacity-track" title="좌우로 드래그해 투명도 조절">
            <div class="obs-opacity-fill"></div>
            <div class="obs-opacity-knob"></div>
        </div>
        <div class="obs-panel-header">
            <span class="obs-panel-title">🎤 HOT MIC</span>
            <div class="obs-panel-controls">
                <select class="obs-select obs-mode-select" title="나레이션 모드">
                    <option value="docu"   ${settings.mode === 'docu'    ? 'selected' : ''}>🎬 다큐</option>
                    <option value="sports" ${settings.mode === 'sports'  ? 'selected' : ''}>🏟️ 중계</option>
                    <option value="variety"${settings.mode === 'variety' ? 'selected' : ''}>📺 예능</option>
                    <option value="court"  ${settings.mode === 'court'   ? 'selected' : ''}>⚖️ 법정수사</option>
                    <option value="guide"  ${settings.mode === 'guide'   ? 'selected' : ''}>🎮 공략집</option>
                    <option value="wiki"   ${settings.mode === 'wiki'    ? 'selected' : ''}>📚 위키</option>
                    <option value="news"   ${settings.mode === 'news'    ? 'selected' : ''}>📰 속보</option>
                    <option value="bible"  ${settings.mode === 'bible'   ? 'selected' : ''}>🛕 성전</option>
                    <option value="community" ${settings.mode === 'community' ? 'selected' : ''}>🗣️ 커뮤니티</option>
                    <option value="scp"    ${settings.mode === "scp"     ? "selected" : ""}>🗂️ 기밀문서</option>
                </select>
                <select class="obs-select obs-context-select" title="맥락 범위">
                    <option value="current" ${settings.context === 'current'  ? 'selected' : ''}>현재</option>
                    <option value="recent5" ${settings.context === 'recent5'  ? 'selected' : ''}>5턴</option>
                    <option value="all"     ${settings.context === 'all'      ? 'selected' : ''}>전체</option>
                </select>
                <select class="obs-select obs-theme-select" title="색상 테마">
                    <option value="light"     ${settings.theme === 'light'     ? 'selected' : ''}>🤍</option>
                    <option value="butter"    ${settings.theme === 'butter'    ? 'selected' : ''}>🧈</option>
                    <option value="parchment" ${settings.theme === 'parchment' ? 'selected' : ''}>📜</option>
                    <option value="wine"      ${settings.theme === 'wine'      ? 'selected' : ''}>🍷</option>
                    <option value="forest"    ${settings.theme === 'forest'    ? 'selected' : ''}>🌲</option>
                    <option value="blue"      ${settings.theme === 'blue'      ? 'selected' : ''}>🌊</option>
                    <option value="dark"      ${settings.theme === 'dark'      ? 'selected' : ''}>⚫</option>
                </select>
                <button class="obs-btn-small obs-regen" title="재생성">↺</button>
                <button class="obs-btn-small obs-fullscreen" title="전체 펼치기">⛶</button>
                <button class="obs-btn-small obs-collapse" title="접기">▼</button>
                <button class="obs-btn-small obs-minimize" title="최소화">✕</button>
            </div>
        </div>
        <div class="obs-panel-body">
            <div class="obs-empty">🎤 녹음 중...</div>
        </div>
    </div>

</div>`;

    // body에 직접 삽입한다.
    document.body.insertAdjacentHTML('beforeend', html);

    if (settings.fullscreen) {
        document.getElementById('observer-panel')?.classList.add('obs-fs');
        document.getElementById('observer-bar')?.classList.add('obs-fs-bar');
    }
    // 활성화 상태인데 아이콘(작게)으로 시작하면 모바일에서 못 보기 쉬움 → ticker 보장.
    // 또한 패널(state-panel)로 시작하면 키가 커서 bottom 고정 시 위쪽이 화면 밖으로 넘침.
    // 모바일에서는 무조건 ticker(한 줄)로 시작한다.
    const isMobileInit = window.matchMedia('(max-width: 1000px)').matches;
    if (settings.enabled && (settings.state === 'icon' || (isMobileInit && settings.state === 'panel'))) {
        settings.state = 'ticker';
    }
    const barEl = document.getElementById('observer-bar');
    if (barEl) {
        barEl.className = `state-${settings.state}`;
        if (settings.fullscreen && settings.state === 'panel') barEl.classList.add('obs-fs-bar');
    }
    bindEvents();
    enforcePosition();
}

// 위치 강제 보정:
// ST의 조상 요소에 transform/filter가 걸리면 position:fixed가 화면이 아닌
// 그 조상 기준으로 잡혀 화면 밖으로 밀린다. bar를 body 직속으로 끌어올리고
// 인라인 스타일로 위치를 못박아 어떤 CSS/조상보다 우선하게 만든다.
function enforcePosition() {
    const bar = document.getElementById('observer-bar');
    if (!bar) return;

    // 1) body 직속이 아니면 끌어올림
    if (bar.parentElement !== document.body) {
        document.body.appendChild(bar);
    }

    // 2) 전체펼침이 아닐 때만 하단 고정을 강제 (전체펼침은 CSS가 처리)
    if (!bar.classList.contains('obs-fs-bar')) {
        const isMobile = window.matchMedia('(max-width: 1000px)').matches;
        const gap = isMobile ? 56 : 60;

        // ST staging은 body/html에 transform을 걸기도 한다. 그러면 position:fixed가
        // 화면이 아니라 그 조상 기준이 되어 bottom 값이 엉뚱하게 적용된다(top이 음수로 튐).
        // 이를 우회하려고, 화면 좌표를 직접 계산해 top으로 박는다.
        const panel = document.getElementById('observer-panel');
        const pbody = panel?.querySelector('.obs-panel-body');
        if (panel && pbody) {
            const topSafe = 16;
            // 패널 전체가 화면을 넘지 않도록: 헤더 높이를 빼고 본문 max-height 계산
            const header = panel.querySelector('.obs-panel-header');
            const headerH = header ? header.offsetHeight : 44;
            const avail = Math.max(80, window.innerHeight - gap - topSafe - headerH - 16);
            pbody.style.setProperty('max-height', avail + 'px', 'important');
            pbody.style.setProperty('overflow-y', 'auto', 'important');
            pbody.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
            panel.style.setProperty('max-height', 'none', 'important');
        }

        bar.style.setProperty('position', 'fixed', 'important');
        bar.style.setProperty('left', '0', 'important');
        bar.style.setProperty('right', '0', 'important');
        bar.style.setProperty('transform', 'none', 'important');
        bar.style.setProperty('z-index', '100000', 'important');

        // transform 조상이 있는지 감지: bottom 적용 후 실제 위치가 화면 밖이면 top으로 직접 박기
        bar.style.setProperty('bottom', `${gap}px`, 'important');
        bar.style.setProperty('top', 'auto', 'important');

        // 다음 프레임에 실제 렌더 위치를 재서, 화면 밖이면 top 좌표로 교정
        requestAnimationFrame(() => {
            const r = bar.getBoundingClientRect();
            const h = r.height || 40;
            const wanted = window.innerHeight - gap - h; // 화면 기준 원하는 top
            // 실제 top이 원하는 값과 크게 다르면(=transform 조상 때문) top으로 강제
            if (Math.abs(r.top - wanted) > 4 || r.top < 0 || r.top > window.innerHeight) {
                bar.style.setProperty('bottom', 'auto', 'important');
                bar.style.setProperty('top', `${Math.max(0, wanted)}px`, 'important');
            }
        });
    }
}

function bindEvents() {
    const bar = document.getElementById('observer-bar');
    if (!bar) return;

    // 화면 크기 변화·포커스 복귀 시 위치 재보정 (ST 모달/북마크 팝업이 떴다 닫히면
    // 패널이 화면 밖으로 밀릴 수 있어, 펼친 상태면 제자리로 복구한다)
    if (!window.__hotmicWinBound) {
        window.__hotmicWinBound = true;
        const recover = () => {
            if (getSettings().state === 'panel') {
                enforcePosition();
                requestAnimationFrame(enforcePosition);
            }
        };
        window.addEventListener('resize', recover);
        window.addEventListener('orientationchange', recover);
        window.addEventListener('focus', recover);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) recover(); });
    }

    // 아이콘: 탭 → 열기, 드래그 → 위치 이동
    const iconBtn = bar.querySelector('#observer-icon-btn');
    if (iconBtn) {
        let dragging = false, moved = false, startX = 0, startY = 0, baseX = 0, baseY = 0;

        const onDown = (e) => {
            const pt = e.touches ? e.touches[0] : e;
            dragging = true; moved = false;
            startX = pt.clientX; startY = pt.clientY;
            const r = iconBtn.getBoundingClientRect();
            baseX = r.left; baseY = r.top;
            iconBtn.style.transition = 'none';
        };
        const onMove = (e) => {
            if (!dragging) return;
            const pt = e.touches ? e.touches[0] : e;
            const dx = pt.clientX - startX;
            const dy = pt.clientY - startY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
            if (!moved) return;
            e.preventDefault();
            const size = iconBtn.offsetWidth || 44;
            let nx = baseX + dx, ny = baseY + dy;
            // 화면 안으로 제한
            nx = Math.max(4, Math.min(window.innerWidth - size - 4, nx));
            ny = Math.max(4, Math.min(window.innerHeight - size - 4, ny));
            // bar의 flex-end 무시하고 직접 고정
            iconBtn.style.position = 'fixed';
            iconBtn.style.left = nx + 'px';
            iconBtn.style.top = ny + 'px';
            iconBtn.style.right = 'auto';
            iconBtn.style.bottom = 'auto';
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            iconBtn.style.transition = '';
            if (moved) {
                const r = iconBtn.getBoundingClientRect();
                getSettings().iconPos = { x: r.left, y: r.top };
                saveSettingsDebounced();
            } else {
                setState('ticker'); // 안 움직였으면 탭으로 간주 → 열기
            }
        };

        iconBtn.addEventListener('mousedown', onDown);
        iconBtn.addEventListener('touchstart', onDown, { passive: true });
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
    }

    // ticker 클릭: preview 탭 → 흐름 멈춤/재생 토글, 그 외 영역 → 패널 열기
    bar.querySelector('#observer-ticker')?.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (e.target.closest('.obs-ticker-preview')) {
            // 흐름 토글
            const inner = bar.querySelector('.obs-marquee-inner');
            if (inner && inner.classList.contains('obs-marquee-run')) {
                inner.classList.toggle('obs-marquee-paused');
            }
            return; // 패널 안 열림
        }
        setState('panel');
    });

    // 펼치기
    bar.querySelectorAll('.obs-expand').forEach(btn =>
        btn.addEventListener('click', (e) => { e.stopPropagation(); setState('panel'); })
    );

    // 접기
    bar.querySelectorAll('.obs-collapse').forEach(btn =>
        btn.addEventListener('click', (e) => { e.stopPropagation(); setState('ticker'); })
    );

    // 최소화
    bar.querySelectorAll('.obs-minimize').forEach(btn =>
        btn.addEventListener('click', (e) => { e.stopPropagation(); setState('icon'); })
    );

    // 재생성
    bar.querySelectorAll('.obs-regen').forEach(btn =>
        btn.addEventListener('click', (e) => { e.stopPropagation(); runGeneration(); })
    );

    // 전체 펼치기 토글
    bar.querySelectorAll('.obs-fullscreen').forEach(btn =>
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const panel = document.getElementById('observer-panel');
            const on = panel.classList.toggle('obs-fs');
            document.getElementById('observer-bar')?.classList.toggle('obs-fs-bar', on);
            getSettings().fullscreen = on;
            saveSettingsDebounced();
            btn.title = on ? '원래대로' : '전체 펼치기';
        })
    );

    // 헤더 모드 변경
    bar.querySelector('.obs-mode-select')?.addEventListener('change', (e) => {
        e.stopPropagation();
        getSettings().mode = e.target.value;
        saveSettingsDebounced();
        syncControls();
    });
    bar.querySelector('.obs-mode-select')?.addEventListener('click', (e) => e.stopPropagation());

    // 헤더 맥락 변경
    bar.querySelector('.obs-context-select')?.addEventListener('change', (e) => {
        e.stopPropagation();
        getSettings().context = e.target.value;
        saveSettingsDebounced();
        syncControls();
    });
    bar.querySelector('.obs-context-select')?.addEventListener('click', (e) => e.stopPropagation());

    // 헤더 테마 선택
    bar.querySelector('.obs-theme-select')?.addEventListener('change', (e) => {
        e.stopPropagation();
        getSettings().theme = e.target.value;
        applyTheme();
        saveSettingsDebounced();
        syncControls();
    });
    bar.querySelector('.obs-theme-select')?.addEventListener('click', (e) => e.stopPropagation());

    // 패널 상단 투명도 슬라이더 (얇은 선 + 흰 핸들, 좌우 드래그)
    const opTrack = bar.querySelector('.obs-opacity-track');
    if (opTrack) {
        const fill = opTrack.querySelector('.obs-opacity-fill');
        const knob = opTrack.querySelector('.obs-opacity-knob');
        const syncFill = () => {
            const v = getSettings().opacity || 92;
            const pct = (v - 30) / 70 * 100; // 30~100 → 0~100%
            if (fill) fill.style.width = `calc((100% - 24px) * ${pct/100})`;
            if (knob) knob.style.left = `calc(12px + (100% - 24px) * ${pct/100})`;
        };
        syncFill();

        let dragging = false;
        const setFromX = (clientX) => {
            const r = opTrack.getBoundingClientRect();
            const pad = 12;
            let ratio = (clientX - r.left - pad) / (r.width - pad * 2);
            ratio = Math.max(0, Math.min(1, ratio));
            const v = Math.round(30 + ratio * 70); // 30~100
            getSettings().opacity = v;
            applyTheme();
            syncFill();
        };
        const onDown = (e) => {
            dragging = true;
            const pt = e.touches ? e.touches[0] : e;
            setFromX(pt.clientX);
            e.stopPropagation();
        };
        const onMove = (e) => {
            if (!dragging) return;
            const pt = e.touches ? e.touches[0] : e;
            setFromX(pt.clientX);
            e.preventDefault();
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            saveSettingsDebounced();
        };
        opTrack.addEventListener('mousedown', onDown);
        opTrack.addEventListener('touchstart', onDown, { passive: true });
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
    }
}

// ─── 설정 드로어 ───
function injectSettings() {
    hotmicDebug('  · injectSettings: container 찾는 중');
    const container = document.getElementById('extensions_settings2')
        || document.getElementById('extensions_settings');
    if (!container) { hotmicDebug('  · container 없음 → return (정상)'); return; }
    if (document.getElementById('hotmic-settings')) { hotmicDebug('  · 이미 있음 → return'); return; }

    hotmicDebug('  · settings/profiles 읽는 중');
    const settings = getSettings();
    const profiles = getConnectionProfiles();
    hotmicDebug('  · profiles 개수=' + (profiles?.length ?? 'null'));

    const profileOptions = ['<option value="">기본 (현재 연결)</option>']
        .concat((profiles || []).map(p =>
            `<option value="${escHtml(p.name)}" ${settings.profile === p.name ? 'selected' : ''}>${escHtml(p.name)}</option>`
        )).join('');
    hotmicDebug('  · profileOptions 완성');

    const themeOptions = Object.entries(HOTMIC_THEMES)
        .map(([k, v]) => `<option value="${k}" ${settings.theme === k ? 'selected' : ''}>${v.name}</option>`)
        .join('');

    const html = `
<div id="hotmic-settings" class="extension_settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>🎤 Hot Mic</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label" style="margin-bottom:10px;">
                <input type="checkbox" id="hotmic-enabled" ${settings.enabled ? 'checked' : ''}>
                <span>활성화 (응답마다 자동 녹음)</span>
            </label>

            <label for="hotmic-profile">해설 생성 연결 프로필</label>
            <select id="hotmic-profile" class="text_pole">${profileOptions}</select>
            <small class="notes">메인 RP와 다른 모델로 해설을 뽑고 싶을 때 선택. (예: RP는 GLM, 해설은 Claude)</small>

            <label for="hotmic-language" id="hotmic-lang-label" style="margin-top:10px;">출력 언어</label>
            <select id="hotmic-language" class="text_pole">
                <option value="ko" ${settings.language === 'ko' ? 'selected' : ''}>한국어</option>
                <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
            </select>

            <label for="hotmic-theme" style="margin-top:10px;">색상 테마</label>
            <select id="hotmic-theme" class="text_pole">${themeOptions}</select>

            <label for="hotmic-mode" style="margin-top:10px;">나레이션 모드</label>
            <select id="hotmic-mode" class="text_pole">
                <option value="docu"    ${settings.mode === 'docu'    ? 'selected' : ''}>🎬 다큐멘터리</option>
                <option value="sports"  ${settings.mode === 'sports'  ? 'selected' : ''}>🏟️ 스포츠 중계</option>
                <option value="variety" ${settings.mode === 'variety' ? 'selected' : ''}>📺 예능</option>
                <option value="court"   ${settings.mode === 'court'   ? 'selected' : ''}>⚖️ 법정수사</option>
                <option value="guide"   ${settings.mode === 'guide'   ? 'selected' : ''}>🎮 공략집</option>
                <option value="wiki"    ${settings.mode === 'wiki'    ? 'selected' : ''}>📚 위키</option>
                <option value="news"    ${settings.mode === 'news'    ? 'selected' : ''}>📰 속보</option>
                <option value="bible"   ${settings.mode === 'bible'   ? 'selected' : ''}>🛕 성전</option>
                <option value="community" ${settings.mode === 'community' ? 'selected' : ''}>🗣️ 커뮤니티</option>
                    <option value="scp"    ${settings.mode === "scp"     ? "selected" : ""}>🗂️ 기밀문서</option>
            </select>

            <label for="hotmic-context" style="margin-top:10px;">맥락 범위</label>
            <select id="hotmic-context" class="text_pole">
                <option value="current" ${settings.context === 'current' ? 'selected' : ''}>현재 메시지만</option>
                <option value="recent5" ${settings.context === 'recent5' ? 'selected' : ''}>최근 5턴</option>
                <option value="all"     ${settings.context === 'all'     ? 'selected' : ''}>전체 대화</option>
            </select>

            <label for="hotmic-length" style="margin-top:10px;">해설 분량</label>
            <select id="hotmic-length" class="text_pole">
                <option value="short"  ${settings.length === 'short'  ? 'selected' : ''}>간결 (짧고 강하게)</option>
                <option value="normal" ${settings.length === 'normal' ? 'selected' : ''}>보통</option>
                <option value="long"   ${settings.length === 'long'   ? 'selected' : ''}>수다 (풍부하게)</option>
                <option value="max"    ${settings.length === 'max'    ? 'selected' : ''}>초장문 (대용량)</option>
            </select>

            <label for="hotmic-preset" style="margin-top:10px;">구성</label>
            <select id="hotmic-preset" class="text_pole">
                <option value="all"       ${settings.preset === 'all'       ? 'selected' : ''}>전체 (속마음+제작진+팩트+인터뷰)</option>
                <option value="fact"      ${settings.preset === 'fact'      ? 'selected' : ''}>팩트체크만</option>
                <option value="interview" ${settings.preset === 'interview' ? 'selected' : ''}>인터뷰만</option>
                <option value="broadcast" ${settings.preset === 'broadcast' ? 'selected' : ''}>속마음 + 제작진/중계만</option>
            </select>

            <label for="hotmic-fxfreq" style="margin-top:12px;">이모지 빈도: <span id="hotmic-fx-val">${settings.fxFrequency}</span>%</label>
            <input type="range" id="hotmic-fxfreq" min="0" max="100" step="10" value="${settings.fxFrequency}" style="width:100%;">

            <label for="hotmic-opacity" style="margin-top:10px;">불투명도: <span id="hotmic-op-val">${settings.opacity}</span>%</label>
            <input type="range" id="hotmic-opacity" min="30" max="100" step="5" value="${settings.opacity}" style="width:100%;">
        </div>
    </div>
</div>`;

    container.insertAdjacentHTML('beforeend', html);

    const bind = (id, key) => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            getSettings()[key] = v;
            saveSettingsDebounced();
            syncControls();
        });
    };
    bind('hotmic-enabled', 'enabled');
    bind('hotmic-profile', 'profile');
    bind('hotmic-language', 'language');
    bind('hotmic-mode', 'mode');
    bind('hotmic-context', 'context');
    bind('hotmic-length', 'length');
    bind('hotmic-preset', 'preset');

    document.getElementById('hotmic-theme')?.addEventListener('change', (e) => {
        getSettings().theme = e.target.value;
        applyTheme();
        saveSettingsDebounced();
    });

    document.getElementById('hotmic-fxfreq')?.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        getSettings().fxFrequency = v;
        const lbl = document.getElementById('hotmic-fx-val');
        if (lbl) lbl.textContent = v;
        saveSettingsDebounced();
    });

    document.getElementById('hotmic-opacity')?.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        getSettings().opacity = v;
        const lbl = document.getElementById('hotmic-op-val');
        if (lbl) lbl.textContent = v;
        applyTheme();
        saveSettingsDebounced();
    });

    document.getElementById('hotmic-enabled')?.addEventListener('change', applyEnabledState);
    applyEnabledState();

    // 🥚 이스터에그: "출력 언어" 라벨 1.5초 내 5번 탭 → 디버그
    const langLabel = document.getElementById('hotmic-lang-label');
    if (langLabel) {
        let taps = [];
        langLabel.style.cursor = 'default';
        langLabel.addEventListener('click', () => {
            const now = Date.now();
            taps = taps.filter(t => now - t < 1500);
            taps.push(now);
            if (taps.length >= 5) {
                taps = [];
                HOTMIC_DEBUG = !HOTMIC_DEBUG;
                langLabel.textContent = HOTMIC_DEBUG ? '🐞 디버그 ON' : '출력 언어';
                if (HOTMIC_DEBUG) showDebugReport();
                else document.getElementById('hotmic-debug')?.remove();
                setTimeout(() => { langLabel.textContent = '출력 언어'; }, 2000);
            }
        });
    }
}


// 활성화 상태에 따라 자막바 표시
function applyEnabledState() {
    const bar = document.getElementById('observer-bar');
    if (bar) bar.style.display = getSettings().enabled ? '' : 'none';
}

// 테마 + 불투명도 적용
function applyTheme() {
    const s = getSettings();
    const themeKey = THEME_ALIAS[s.theme] || s.theme;
    const t = HOTMIC_THEMES[themeKey] || HOTMIC_THEMES.light;
    const a = Math.max(0.3, Math.min(1, (s.opacity || 92) / 100));
    const bar = document.getElementById('observer-bar');
    if (!bar) return;

    // 패널/배경색 (hex). 어두운 테마 여부는 배경 밝기로 판정
    const bgRGB = t.bg.split(',').map(Number);
    const luma = (0.299*bgRGB[0] + 0.587*bgRGB[1] + 0.114*bgRGB[2]);
    const isDark = luma < 128;
    const panelHex = t.panel;

    // CSS 변수 노출 (스킨 CSS가 이 변수들을 사용)
    bar.style.setProperty('--hm-accent', t.accent);
    bar.style.setProperty('--hm-text', t.text);
    bar.style.setProperty('--hm-panel', panelHex);
    bar.style.setProperty('--hm-border', t.border);
    bar.style.setProperty('--hm-bg', `rgb(${t.bg})`);
    // 살짝 비치는 보조 배경(말풍선/카드용): 어두우면 흰끼, 밝으면 검정끼
    bar.style.setProperty('--hm-soft', isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)');
    bar.style.setProperty('--hm-line', isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)');

    const ticker = document.getElementById('observer-ticker');
    const panel = document.getElementById('observer-panel');
    if (ticker) {
        ticker.style.setProperty('background', panelHex, 'important');
        ticker.style.setProperty('opacity', a, 'important');
    }
    if (panel) {
        panel.style.setProperty('background', 'transparent', 'important');
        panel.style.setProperty('opacity', '1', 'important');
        panel.querySelectorAll('.obs-panel-header, .obs-panel-body').forEach(el => {
            el.style.setProperty('background', panelHex, 'important');
            el.style.setProperty('opacity', a, 'important');
        });
        const track = panel.querySelector('.obs-opacity-track');
        if (track) {
            const rgb = panelHex.replace('#','').match(/.{2}/g).map(h=>parseInt(h,16)).join(',');
            track.style.setProperty('background', `rgba(${rgb},${a})`, 'important');
        }
    }
    // 텍스트색
    bar.querySelectorAll('.obs-ticker-preview, .obs-block-content').forEach(el => {
        el.style.setProperty('color', t.text, 'important');
    });
    // 강조색
    bar.querySelectorAll('.obs-ticker-badge, .obs-panel-title, .obs-block-label').forEach(el => {
        el.style.setProperty('color', t.accent, 'important');
    });
    bar.querySelectorAll('.obs-ticker-recdot, .obs-icon-recdot').forEach(el => {
        el.style.setProperty('background', t.accent, 'important');
    });
    // 헤더 버튼/셀렉트
    bar.querySelectorAll('.obs-btn-small').forEach(el => {
        el.style.setProperty('color', t.text, 'important');
    });
    bar.querySelectorAll('.obs-select').forEach(el => {
        el.style.setProperty('color', t.text, 'important');
        el.style.setProperty('background', isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', 'important');
        el.style.setProperty('border-color', t.border, 'important');
    });
    // 투명도 슬라이더 위치
    const opFill = bar.querySelector('.obs-opacity-fill');
    const opKnob = bar.querySelector('.obs-opacity-knob');
    const pct = ((s.opacity || 92) - 30) / 70 * 100;
    if (opFill) opFill.style.width = `calc((100% - 24px) * ${pct/100})`;
    if (opKnob) opKnob.style.left = `calc(12px + (100% - 24px) * ${pct/100})`;
}
function applyOpacity() { applyTheme(); }

// 저장된 최소화 아이콘 위치 복원 (드래그로 옮긴 자리)
function applyIconPos() {
    const iconBtn = document.getElementById('observer-icon-btn');
    if (!iconBtn) return;
    const pos = getSettings().iconPos;
    if (pos && typeof pos.x === 'number') {
        const size = iconBtn.offsetWidth || 44;
        const x = Math.max(4, Math.min(window.innerWidth - size - 4, pos.x));
        const y = Math.max(4, Math.min(window.innerHeight - size - 4, pos.y));
        iconBtn.style.position = 'fixed';
        iconBtn.style.left = x + 'px';
        iconBtn.style.top = y + 'px';
        iconBtn.style.right = 'auto';
        iconBtn.style.bottom = 'auto';
        iconBtn.style.zIndex = '100001';
    } else {
        // 기본값: bar의 flex-end (우하단) 사용 → 인라인 스타일 제거
        iconBtn.style.position = '';
        iconBtn.style.left = '';
        iconBtn.style.top = '';
        iconBtn.style.right = '';
        iconBtn.style.bottom = '';
    }
}

// 설정 값 동기화
function syncControls() {
    const s = getSettings();
    const set = (sel, val) => { const el = document.querySelector(sel); if (el && el.value !== val) el.value = val; };
    set('#hotmic-mode', s.mode);
    set('#hotmic-context', s.context);
    set('.obs-mode-select', s.mode);
    set('.obs-context-select', s.context);
    set('.obs-theme-select', s.theme);
    set('#hotmic-language', s.language);
    set('#hotmic-length', s.length);
    set('#hotmic-preset', s.preset);
    set('#hotmic-theme', s.theme);
    set('#hotmic-profile', s.profile);
    const en = document.getElementById('hotmic-enabled');
    if (en) en.checked = s.enabled;
}

// ─── 매직완드(확장) 메뉴 토글 — 모바일 접근성 ───
function injectWandMenu() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('hotmic-wand-item')) return;

    const item = document.createElement('div');
    item.id = 'hotmic-wand-item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = `
        <div class="extensionsMenuExtensionButton" style="display:flex;align-items:center;justify-content:center;">🎤</div>
        <span id="hotmic-wand-label">Hot Mic</span>
    `;
    menu.appendChild(item);

    const refreshLabel = () => {
        const s = getSettings();
        const lbl = document.getElementById('hotmic-wand-label');
        if (lbl) lbl.textContent = s.enabled ? 'Hot Mic: 켜짐' : 'Hot Mic: 꺼짐';
    };
    refreshLabel();

    item.addEventListener('click', () => {
        const s = getSettings();
        s.enabled = !s.enabled;
        saveSettingsDebounced();
        applyEnabledState();
        refreshLabel();
        // 켜면 무조건 자막바(ticker) 상태로 + 화면 안으로
        if (s.enabled) {
            setState('ticker');
            const bar = document.getElementById('observer-bar');
            if (bar) bar.style.display = '';
            enforcePosition();
            setTimeout(runGeneration, 100);
        }
        syncControls();
        // 메뉴 닫기 (모바일)
        document.getElementById('extensionsMenu')?.classList.remove('shown');
        document.querySelector('#extensionsMenuButton')?.classList.remove('active');
    });
}

// ─── 이벤트 리스너 ───
function setupEventListeners() {
    // AI 응답 완료 시 자동 해설
    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        setTimeout(runGeneration, 300); // 렌더 안정화 후
    });

    // 채팅을 바꾸면 이전 해설을 비우고, 새 채팅 기준으로 다시 생성한다.
    // (CHAT_CHANGED는 캐릭터/채팅 전환, 새 채팅 시작 모두에서 발생)
    if (event_types.CHAT_CHANGED) {
        eventSource.on(event_types.CHAT_CHANGED, () => {
            clearCommentary();
            // 새 채팅에 이미 메시지가 있으면 잠시 후 해설 생성, 없으면 비운 채 대기
            setTimeout(() => {
                const ctx = getContext();
                const chat = ctx.chat || [];
                const hasAi = chat.some(m => !m.is_user);
                if (hasAi && getSettings().enabled) runGeneration();
            }, 500);
        });
    }
}

// 현재 해설을 비운다 (채팅 전환 시)
function clearCommentary() {
    currentCommentary = null;
    stopAutoScroll();
    const body = document.querySelector('.obs-panel-body');
    if (body) body.innerHTML = '<div class="obs-empty">🎤 녹음 대기 중...</div>';
    updateTickerPreview('녹음 대기 중...');
}

// ─── 화면 디버그 배너 (모바일은 콘솔을 못 보므로 화면에 직접 표시) ───
function hotmicDebug(msg, isError) {
    if (!HOTMIC_DEBUG) return; // 디버그 꺼져있으면 아무것도 안 함
    let banner = document.getElementById('hotmic-debug');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'hotmic-debug';
        banner.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
            'background:rgba(0,0,0,0.9)', 'color:#0f0', 'font:11px/1.4 monospace',
            'padding:6px 8px', 'max-height:75vh', 'overflow:auto',
            'white-space:pre-wrap', 'border-bottom:2px solid #0f0', 'pointer-events:auto',
        ].join(';');
        document.body.appendChild(banner);
        const closeBtn = document.createElement('div');
        closeBtn.textContent = '✕ 닫기';
        closeBtn.style.cssText = 'color:#ff0;text-align:right;cursor:pointer;font-weight:bold;border-bottom:1px solid #0f0;padding-bottom:4px;margin-bottom:4px;';
        closeBtn.addEventListener('click', () => banner.remove());
        banner.appendChild(closeBtn);
    }
    const line = document.createElement('div');
    line.textContent = msg;
    if (isError) line.style.color = '#ff5050';
    banner.appendChild(line);
}

// 단계별 안전 실행 (에러만 콘솔로, 화면 로그는 디버그일 때만)
function safeStep(label, fn) {
    try {
        fn();
        hotmicDebug('✅ ' + label);
    } catch (e) {
        console.error('[Hot Mic] ' + label + ' 에러:', e);
        hotmicDebug('❌ ' + label + ': ' + (e?.message || e), true);
    }
}

// ─── 초기화 ───
jQuery(async () => {
    // 각 단계를 독립적으로 — 하나 터져도 나머지는 계속
    safeStep('injectUI', injectUI);
    safeStep('enforcePosition(우선)', enforcePosition);
    safeStep('setupEventListeners', setupEventListeners);
    safeStep('applyEnabledState', applyEnabledState);
    safeStep('applyOpacity', applyOpacity);
    safeStep('applyIconPos', applyIconPos);
    setTimeout(() => safeStep('injectSettings(지연)', injectSettings), 0);
    setTimeout(() => safeStep('injectWandMenu(지연)', injectWandMenu), 0);
    safeStep('syncControls', syncControls);

    // 와우메뉴/설정창이 늦게 그려지는 환경 대비 재시도
    let tries = 0;
    const retry = setInterval(() => {
        try { injectWandMenu(); injectSettings(); } catch (e) {}
        if (document.getElementById('hotmic-wand-item') || ++tries > 10) {
            clearInterval(retry);
        }
    }, 1000);

    // ST가 로드 중 DOM을 재배치할 수 있으니 위치를 몇 번 더 못박는다
    [300, 1000, 2500].forEach(ms => setTimeout(() => {
        try { enforcePosition(); } catch (e) {}
    }, ms));

    console.log(`[Hot Mic] v${HOTMIC_VERSION} 로드 완료. 캐릭터는 모릅니다.`);
});

// 디버그 진단 보고 (이스터에그로 켤 때만 호출)
function showDebugReport() {
    hotmicDebug('--- Hot Mic 진단 ---');
    const bar = document.getElementById('observer-bar');
    if (!bar) { hotmicDebug('❌ observer-bar 없음', true); return; }
    const r = bar.getBoundingClientRect();
    const cs = getComputedStyle(bar);
    hotmicDebug(`bar: parent=${bar.parentElement?.id || bar.parentElement?.tagName}`);
    hotmicDebug(`bar: display=${cs.display} pos=${cs.position} bottom=${cs.bottom}`);
    hotmicDebug(`bar: top=${Math.round(r.top)} left=${Math.round(r.left)} size=${Math.round(r.width)}x${Math.round(r.height)}`);
    hotmicDebug(`화면: winH=${window.innerHeight} winW=${window.innerWidth}`);
    hotmicDebug(`상태: ${getSettings().state} / 모드: ${getSettings().mode} / 활성: ${getSettings().enabled}`);
    // 마지막 생성 진단
    if (HOTMIC_LAST) {
        hotmicDebug('--- 마지막 생성 ---');
        hotmicDebug(`시각:${HOTMIC_LAST.time} 모드:${HOTMIC_LAST.mode} 서브:${HOTMIC_LAST.subLabel || '-'}`);
        hotmicDebug(`분량:${HOTMIC_LAST.length} 맥락:${HOTMIC_LAST.context} 프롬프트:${HOTMIC_LAST.promptLen}자`);
        if (HOTMIC_LAST.route) hotmicDebug(`경로: ${HOTMIC_LAST.route}`);
        if (HOTMIC_LAST.error) hotmicDebug(`❌ 에러: ${HOTMIC_LAST.error}`, true);
        else hotmicDebug(`응답(앞부분): ${(HOTMIC_LAST.raw || '없음').slice(0, 180)}`);
    } else {
        hotmicDebug('마지막 생성 기록 없음 (아직 생성 안 함)');
    }
    if (r.top > window.innerHeight || r.top < -r.height) {
        hotmicDebug('⚠ bar 화면 밖 → 교정 시도', true);
        try { enforcePosition(); } catch (e) {}
    } else {
        hotmicDebug('✓ bar 화면 안');
    }
    hotmicDebug('(위 ✕ 닫기 버튼으로 닫으세요)');
}
