// ─── 🎤 Hot Mic v2.12.1 ───
// 캐릭터 몰래 보는 감독판 코멘터리
// RP에 개입하지 않음. 해설은 기억되지 않음. 단방향.

import { getContext, extension_settings } from '../../../extensions.js';
import { event_types, eventSource, saveSettingsDebounced } from '../../../../script.js';

const EXT_NAME = 'hot-mic';

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
};

// 색상 테마 정의 (배경 RGB, 강조색, 텍스트색, 버튼색)
const HOTMIC_THEMES = {
    dark:    { name: '🖤 기본 (검정)',   bg: '34,34,38',   accent: '#ff5a5a', text: 'rgba(255,255,255,0.96)', btn: 'rgba(255,255,255,0.75)' },
    light:   { name: '🤍 화이트',        bg: '248,248,250', accent: '#d83a3a', text: 'rgba(28,28,32,0.95)',   btn: 'rgba(40,40,45,0.8)' },
    midnight:{ name: '🌌 미드나잇 블루',  bg: '28,38,64',   accent: '#7aa2ff', text: 'rgba(228,238,255,0.97)', btn: 'rgba(200,215,255,0.75)' },
    forest:  { name: '🌲 포레스트',       bg: '26,46,34',   accent: '#5fe39c', text: 'rgba(228,255,240,0.97)', btn: 'rgba(200,255,222,0.75)' },
    wine:    { name: '🍷 와인',          bg: '52,24,34',   accent: '#ff7aa6', text: 'rgba(255,232,240,0.97)', btn: 'rgba(255,210,224,0.75)' },
    sepia:   { name: '📜 세피아',         bg: '54,42,28',   accent: '#f0bd72', text: 'rgba(255,244,228,0.97)', btn: 'rgba(255,232,200,0.78)' },
};

// 디버그는 저장하지 않는 휘발성 (이스터에그로 켠 세션에만 유효, 새로고침 시 자동 off)
let HOTMIC_DEBUG = false;

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

// ─── 상태 ───
let currentCommentary = null;   // 현재 해설 데이터
let isGenerating = false;

// ─── API 호출 ───
async function generateCommentary(charData, chatHistory, lastMessage) {
    const settings = getSettings();

    const modePrompts = {
        docu: `당신은 내셔널지오그래픽·BBC Earth 급 자연 다큐멘터리 나레이터입니다. 데이비드 애튼버러처럼 장엄하고 시적이며 진지한 어조로, 인간 캐릭터를 야생 동물 '개체'처럼 관찰·해설합니다. 진지함이 극에 달할수록 웃깁니다(데드팬). 동물 다큐의 호흡을 그대로 살리세요.

[톤 핵심 — 동물 다큐의 정수]
- 장엄한 도입으로 장면을 연다: "이른 아침, 미명이 깔린 좁은 서식지에서...", "건기의 끝자락, 한 마리의 거대한 수컷이...". 시간·장소·날씨를 영화처럼 묘사.
- 인간을 철저히 야생 개체로: '수컷 개체', '암컷', '서식지', '영역', '서열', '구애', '번식기', '포식자', '먹이', '둥지'.
- 동물행동학 용어로 포장: '정착 본능', '영역 표시', '구애 행동', '우위 과시', '에너지 효율', '~로 관찰된다', '~로 분석된다', '학계는 이를 ~라 명명한다'.
- 거창한 자연의 섭리 → 시시한 진실로 착지(데드팬의 핵심): "이 정교한 사냥 기술이 향하는 곳은, 놀랍게도 냉장고 속 마지막 계란 두 알이다."
- 내레이터는 절대 흥분하지 않는다. 차분하고 우아하게, 그러나 내용은 어이없게.
- 동물 비유: 맹수인 줄 알았으나 길들여진 대형 포유류, 포식자를 자처하나 실은 둥지를 떠나지 못하는 개체.

[구조 — director(관찰) 필드를 다큐 나레이션 본문으로 길고 그림 그려지게]
- 도입(장면 묘사) → 행동 관찰 → 행동학적 해석 → 데드팬 착지의 흐름.

[예시 — 톤 참고용, 그대로 베끼지 말 것]
- inner: "[수컷 개체의 내심] 사냥(배달 주문)을 포기하고 암컷이 제공한 먹이를 수용하기로 결정한다. 이는 에너지 효율을 극대화하려는 포식자의 본능적 계산이다."
- director(관찰): "이른 아침, 좁은 서식지의 미명 속에서 한 마리의 거대한 수컷이 깨어난다. 6피트 5인치에 달하는 이 개체는, 절반에 불과한 암컷이 차려낸 먹이 앞에 거구를 접어 앉는다. 야생에서 포식자가 사냥 대신 둥지를 택하는 이 순간은, 번식기 특유의 '정착 본능'이 발현되는 드문 광경이다. 그는 결코 미안함을 표하지 않는다. 사과란 서열 1위 수컷의 사전에 없는 단어이기 때문이다."
- fact: "그가 언급한 '햄스트링 파열'은 의학적 외상이 아니다. 지난밤 자신의 과도한 영역 표시가 남긴 흔적을, 자연의 섭리인 양 포장하는 포식자 특유의 자기과시 화법으로 분석된다."
- interview: "Q. 암컷이 걷기 힘들어 보이는데 부축하지 않는 이유는? / A. (무심히 먹이를 씹으며) ...개체는 스스로 회복한다. 야생의 법칙이다."`,

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
- 가짜 각주: 문장 끝에 [1] [2] 같은 각주 번호를 달고, 맨 아래 "[1] 출처: 본인 주장 [2] 확인되지 않음" 식으로 처리.
- 가짜 객관성·중립성: "팬들 사이 의견이 갈린다", "일각에서는 애정 표현이라는 해석도 있으나, 정황은 이를 뒷받침하지 않는다", "이에 대한 학계의 정설은 없다".
- 섹션 느낌: 개요 / 배경 / 의의 / 논란 / 후대의 평가 같은 위키 구조 차용.
- 다인원이면 '관련 인물' 항목으로 정리.

[구조 활용 — director 필드를 '개요/배경' 위키 본문 톤으로 길게]
- 예: "「앉아 사건」은 2026년 4월 30일 Rin의 원룸 주방에서 발생한 생활권 침범 사례를 가리킨다.[1] 가해 개체는 식사 제공을 명분으로 피해 개체의 좌석 이동을 유도하였으며, 이는 영장류 사회에서 흔히 관찰되는 '자원 통제형 구애'의 변종으로 해석된다.[2] 다만 본인은 '넘어질까 봐'라고 일관되게 주장하고 있어 의도성에 대해서는 논란이 있다."

[예시 — 톤 참고용]
- inner: "[심리 분석] 해당 개체는 자신의 행위를 '우발적'이라 규정하나, 학계의 중론은 '계획적'이다.[1]"
- fact: "「무거워서 올려둔 것」이라는 주장이 존재하나, 손가락 압력에 관한 정황 증거는 이를 뒷받침하지 않는다. (출처 불명확)"
- 각주를 쓸 경우 본문 맨 끝에: "─── [1] 출처: 본인 주장 / [2] 검증되지 않음"`,

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
        short:  '\n\n[분량] 아주 간결하게. 각 항목은 한 줄(최대 1문장). 펀치라인 위주로 짧고 강하게.',
        normal: '\n\n[분량] 보통. 각 항목 2~3문장.',
        long:   '\n\n[분량] 풍부하고 길게. 각 항목 4~6문장. 디테일·부연·비유를 충분히 살리되 모드 톤은 유지. 짧게 끝내지 마세요.',
        max:    '\n\n[분량] 최대한 길고 풍부하게 (초장문). 각 항목을 문단 수준으로 충실히 작성하세요. inner는 여러 인물의 심리를 깊이 있게, director는 긴 본문(중계/사건파일/개요 등)으로, fact는 근거를 여러 개, interview는 최소 4~6개의 문답으로. 다인원이면 등장인물 전원을 다루세요. 절대 짧게 요약하지 말고, 분량을 아끼지 마세요. 모드 톤은 끝까지 유지.',
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

    const systemPrompt = `${modePrompts[settings.mode]}

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

    let raw;

    // 프로필이 지정돼 있고 ConnectionManagerRequestService가 있으면 → 격리 호출
    // (메인 RP 연결을 건드리지 않고 별도 프로필로 해설 생성)
    const profileName = settings.profile;
    const cmrs = getContext().ConnectionManagerRequestService;
    const profiles = getConnectionProfiles();
    const targetProfile = profileName
        ? profiles.find(p => p.name === profileName || p.id === profileName)
        : null;

    // 분량 → 응답 토큰 상한
    const maxTokens = { short: 400, normal: 1000, long: 3000, max: 6000 }[settings.length] || 1000;

    if (targetProfile && cmrs && typeof cmrs.sendRequest === 'function') {
        try {
            const result = await cmrs.sendRequest(
                targetProfile.id,
                [{ role: 'user', content: fullPrompt }],
                maxTokens,
            );
            // 반환 형태가 버전별로 다름: 문자열 또는 {content}
            raw = typeof result === 'string' ? result : (result?.content || result?.text || '');
        } catch (e) {
            console.warn('[Hot Mic] 프로필 격리 호출 실패, 기본 연결로 폴백:', e);
        }
    }

    // 폴백: generateQuietPrompt (현재 연결 사용)
    if (!raw) {
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

    // JSON 본문만 안전 추출 (모델이 앞뒤로 설명 붙였을 경우 대비)
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    const jsonStr = (firstBrace !== -1 && lastBrace !== -1)
        ? clean.slice(firstBrace, lastBrace + 1)
        : clean;

    return JSON.parse(jsonStr);
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
        const previewText = (emo ? emo + ' ' : '') + (commentary.preview || '해설 생성 완료');
        updateTickerPreview(previewText);
        renderCommentary(commentary);
    } catch (err) {
        console.error('[Hot Mic] 해설 생성 실패:', err);
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
                </select>
                <select class="obs-select obs-context-select" title="맥락 범위">
                    <option value="current" ${settings.context === 'current'  ? 'selected' : ''}>현재</option>
                    <option value="recent5" ${settings.context === 'recent5'  ? 'selected' : ''}>5턴</option>
                    <option value="all"     ${settings.context === 'all'      ? 'selected' : ''}>전체</option>
                </select>
                <select class="obs-select obs-theme-select" title="색상 테마">
                    <option value="dark"     ${settings.theme === 'dark'     ? 'selected' : ''}>🖤</option>
                    <option value="light"    ${settings.theme === 'light'    ? 'selected' : ''}>🤍</option>
                    <option value="midnight" ${settings.theme === 'midnight' ? 'selected' : ''}>🌌</option>
                    <option value="forest"   ${settings.theme === 'forest'   ? 'selected' : ''}>🌲</option>
                    <option value="wine"     ${settings.theme === 'wine'     ? 'selected' : ''}>🍷</option>
                    <option value="sepia"    ${settings.theme === 'sepia'    ? 'selected' : ''}>📜</option>
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

    // 아이콘 → ticker
    bar.querySelector('#observer-icon-btn')?.addEventListener('click', () => setState('ticker'));

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
    const t = HOTMIC_THEMES[s.theme] || HOTMIC_THEMES.dark;
    const a = Math.max(0.3, Math.min(1, (s.opacity || 92) / 100));
    const bar = document.getElementById('observer-bar');
    if (!bar) return;
    const bgRgba = `rgba(${t.bg},${a})`;

    bar.style.setProperty('--hm-accent', t.accent);
    bar.style.setProperty('--hm-text', t.text);
    bar.style.setProperty('--hm-bg', bgRgba);

    const ticker = document.getElementById('observer-ticker');
    const panel = document.getElementById('observer-panel');
    [ticker, panel].forEach(el => {
        if (el) el.style.setProperty('background', bgRgba, 'important');
    });
    // 텍스트색
    bar.querySelectorAll('.obs-ticker-preview, .obs-block-content').forEach(el => {
        el.style.setProperty('color', t.text, 'important');
    });
    // 강조색 (LIVE 배지, 점, 라벨, 제목)
    bar.querySelectorAll('.obs-ticker-badge, .obs-panel-title, .obs-block-label').forEach(el => {
        el.style.setProperty('color', t.accent, 'important');
    });
    bar.querySelectorAll('.obs-ticker-recdot, .obs-icon-recdot').forEach(el => {
        el.style.setProperty('background', t.accent, 'important');
    });
    // 헤더 버튼 + 헤더 select 색 (흰 배경에서 안 보이던 문제 해결)
    bar.querySelectorAll('.obs-btn-small').forEach(el => {
        el.style.setProperty('color', t.btn, 'important');
    });
    bar.querySelectorAll('.obs-select').forEach(el => {
        el.style.setProperty('color', t.text, 'important');
        // 흰 테마면 select 배경도 밝게, 어두운 테마면 어둡게
        const lightTheme = s.theme === 'light';
        el.style.setProperty('background', lightTheme ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)', 'important');
        el.style.setProperty('border-color', lightTheme ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)', 'important');
    });
}
function applyOpacity() { applyTheme(); }

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
        <div class="fa-solid fa-microphone extensionsMenuExtensionButton"></div>
        <span id="hotmic-wand-label">🎤 Hot Mic</span>
    `;
    menu.appendChild(item);

    const refreshLabel = () => {
        const s = getSettings();
        const lbl = document.getElementById('hotmic-wand-label');
        if (lbl) lbl.textContent = s.enabled ? '🎤 Hot Mic: 켜짐' : '🎤 Hot Mic: 꺼짐';
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

    console.log('[Hot Mic] 로드 완료. 캐릭터는 모릅니다.');
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
    if (r.top > window.innerHeight || r.top < -r.height) {
        hotmicDebug('⚠ bar 화면 밖 → 교정 시도', true);
        try { enforcePosition(); } catch (e) {}
    } else {
        hotmicDebug('✓ bar 화면 안');
    }
    hotmicDebug('(위 ✕ 닫기 버튼으로 닫으세요)');
}
