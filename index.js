// ─── 🎤 Hot Mic v2.6.0 ───
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

// 색상 테마 정의 (배경 RGB, 강조색, 텍스트색)
const HOTMIC_THEMES = {
    dark:    { name: '🖤 기본 (검정)',   bg: '10,10,10',   accent: '#ff3c3c', text: 'rgba(255,255,255,0.96)' },
    light:   { name: '🤍 화이트',        bg: '245,245,245', accent: '#e23c3c', text: 'rgba(20,20,20,0.95)' },
    midnight:{ name: '🌌 미드나잇 블루',  bg: '14,20,38',   accent: '#5b8cff', text: 'rgba(225,235,255,0.96)' },
    forest:  { name: '🌲 포레스트',       bg: '12,26,18',   accent: '#4fd18b', text: 'rgba(225,255,238,0.96)' },
    wine:    { name: '🍷 와인',          bg: '28,10,18',   accent: '#ff5c8a', text: 'rgba(255,228,238,0.96)' },
    sepia:   { name: '📜 세피아',         bg: '32,24,14',   accent: '#e0a85a', text: 'rgba(255,240,220,0.96)' },
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
        docu: `당신은 BBC Earth 급 자연 다큐멘터리 나레이터입니다. 데이비드 애튼버러처럼 우아하고 진지한 어조로, 그러나 대상은 인간 캐릭터를 '개체'로 취급해 동물 생태처럼 해설합니다. 진지함이 극에 달할수록 웃깁니다(데드팬).

톤 핵심:
- 장엄하고 차분한 다큐 어조 + 데드팬. "광활한 원룸 사바나에서, 한 마리의 수컷 개체가 오늘도 생존을 위한 의식을 시작한다."
- 학술 용어처럼 포장: '~로 추정된다', '~증후군', '구애 행동', '영역 표시', '서열 다툼', '동면 준비'.
- 진화·본능·생존으로 거창하게 설명한 뒤, 실상은 시시한 진실로 착지. "이 정교한 구애 행동의 목적은, 단지 같이 자고 가기 위함이다."
- 동물 비유 적극: 맹수인 줄 알지만 대형견, 포식자인 척하지만 사실 길들여진 개체 등.

예시:
- "수컷 개체는 또다시 '내가 한 게 아니다' 전략을 구사한다. 그러나 귀 끝의 발적과 시선 회피로 보아, 위장은 이미 실패한 것으로 관찰된다. 학계는 이를 '들킨 츤데레 증후군'이라 명명했다."`,

        sports: `당신은 월드컵 결승 실황 중계진입니다. 캐스터(중계)와 해설위원(해설)이 숨 가쁘게 핑퐁합니다. 사소한 일상도 세기의 명승부처럼 중계해 웃깁니다.

톤 핵심:
- 극도로 흥분, 다급함, 탄성. 느낌표 남발. "아아—! 이게 들어갑니다!"
- 중계/해설 2인 핑퐁 필수. 중계는 흥분, 해설은 차분히 팩트 폭격.
- 스포츠 전문용어로 일상 번역: '선제골', '역전', '패스 미스', 'VAR 판독', '경고 누적', '추가시간', '리플레이 보시죠'.
- 결정적 순간 같은 말 반복 강조. "귀끝 붉어졌습니다! 귀끝 붉어졌습니다!"
- 손에 땀 쥐게: "자, 운명의 한마디가 나옵니다... 갑니다...!"

예시:
- "중계: 자 갑니다, 시치미 작전! '난 모르는 일인데.' / 해설: 아 근데 이거, 리플레이 보시면... 귀끝 붉어졌어요. / 중계: VAR 판독 결과——거짓말 확정입니다! 관중석 뒤집어집니다!"`,

        variety: `당신은 무한도전·런닝맨 급 한국 예능 자막 PD입니다. 캐릭터의 진지한 순간에 능청맞은 자막을 깔아 체면을 박살냅니다. 가장 짓궂고 가장 웃긴 모드.

톤 핵심:
- 예능 자막 특유의 능청·반전·드립. 진지한 장면 위에 깔리는 무심한 한 줄.
- 큼직한 캡션체: "(다 보임)", "(여유)", "(허세 100%)", "★위기★", "ㅋㅋㅋ".
- 이모지 타임라인: "🧺 과일 보냄 → 😶 본인 아님 → 🧺 또 보냄 → 😶 진짜 본인 아님 → 🧺 세 번째 → 😶 박 실장이 함".
- 번호 정리로 죄목 나열: "① 밥 달라 함 ② 고기 더 넣으라 함 ③ 자고 간다 함. 아직 본인이 집주인인 줄 앎."
- 치트키 한 줄 요약 + 괄호 시간 카운트(킬러): "결국 하고 싶은 말: '나 챙겨줘.' (38분째 돌려 말하는 중)".
- 제작진 난입 드립도: "[제작진] 저희도 왜 저러는지 모릅니다."

예시:
- director에 "① 다정한 척 ② 사실 독점욕 ③ 본인만 모름 (현재 3단계 진행 중)" 같은 정리체 적극 활용.`,
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
        normal: '\n\n[분량] 보통. 각 항목 1~2문장.',
        long:   '\n\n[분량] 풍부하게. 각 항목 2~4문장까지 허용. 디테일과 부연을 살리되 데드팬 톤은 유지.',
        max:    '\n\n[분량] 매우 길고 풍부하게. 각 항목을 충분히 길게(인터뷰는 여러 문답, 중계는 긴 실황). 다인원이면 인물별로 모두 다루세요. 단 데드팬/모드 톤은 끝까지 유지.',
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

응답 형식:
{
  "inner": "속마음 유출 (캐릭터가 말하지 않은 진심. 1-2문장. 없으면 null)",
  "director": "제작진 코멘터리 (행동 해설. 1-2문장. 없으면 null)",
  "fact": "팩트체크 (캐릭터 발언 검증. 짧게. 없으면 null)",
  "interview": "관찰 카메라 인터뷰 (Q/A 형식 가상 인터뷰. 없으면 null)",
  "preview": "전체 해설을 한 줄로 요약 (ticker용. 필수)"
}

모드에 따라 비율 조절:
- docu: director와 fact 위주, inner는 간결하게
- sports: director가 실황 중계(중계/해설 핑퐁), interview는 중계 인터뷰 형식
- variety: director에 정리체/타임라인/번호 적극 활용, inner는 진심 한 줄, 치트키 요약 필수

preview 작성 규칙:
- variety 모드: 캐릭터의 모든 행동을 박살내는 치트키 한 줄 요약을 넣으세요. 예: "결국 하고 싶은 말: 나 챙겨줘 (38분째 돌려 말하는 중)"
- docu 모드: 관찰 기록 한 줄. 예: "개체, 또 들킴"
- sports 모드: 중계 한 줄. 예: "시치미 작전 실패! 귀끝 붉어졌습니다!"

캐릭터 정보:
${charData}

마지막 캐릭터 메시지:
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
    const maxTokens = { short: 400, normal: 900, long: 2000, max: 4000 }[settings.length] || 900;

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

    history = contextMsgs.map(m => {
        // 그룹챗은 메시지마다 화자가 다르므로 m.name 우선 사용
        const who = m.is_user ? '유저' : (m.name || ctx.characters?.[ctx.characterId]?.name || 'AI');
        return `${who}: ${(m.mes || '').slice(0, 600)}`;
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
        if (blocks.length) blocks.push('<div class="obs-divider"></div>');
        const dirLabel = { docu: '[ 관찰 ]', sports: '[ 중계 ]', variety: '[ 제작진 ]' }[getSettings().mode] || '[ 제작진 ]';
        blocks.push(`
            <div class="obs-block type-director">
                <div class="obs-block-label">${dirLabel}</div>
                <div class="obs-block-content">${escHtml(data.director)}</div>
            </div>
        `);
    }

    if (data.fact) {
        if (blocks.length) blocks.push('<div class="obs-divider"></div>');
        blocks.push(`
            <div class="obs-block type-fact">
                <div class="obs-block-label">[ 팩트체크 ]</div>
                <div class="obs-block-content">${escHtml(data.fact)}</div>
            </div>
        `);
    }

    if (data.interview) {
        if (blocks.length) blocks.push('<div class="obs-divider"></div>');
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
                <button class="obs-btn-small obs-settings" title="설정">⚙️</button>
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

    // 설정 모달은 bar 밖, body 직속으로 별도 삽입 (bar의 fixed/pointer-events 제약을 안 받게)
    if (!document.getElementById('observer-settings-modal')) {
        document.body.insertAdjacentHTML('beforeend', `
<div id="observer-settings-modal" class="obs-hidden">
    <div class="obs-settings-box">
        <div class="obs-settings-head">
            <span>🎤 Hot Mic 설정</span>
            <button class="obs-settings-close" title="닫기">✕</button>
        </div>
        <div class="obs-settings-body"></div>
    </div>
</div>`);
    }

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

    // ⚙️ 설정 모달 열기
    bar.querySelectorAll('.obs-settings').forEach(btn =>
        btn.addEventListener('click', (e) => { e.stopPropagation(); openSettingsModal(); })
    );

    // 설정 모달 닫기 (X 버튼 + 배경 클릭)
    const modal = document.getElementById('observer-settings-modal');
    if (modal) {
        modal.querySelector('.obs-settings-close')?.addEventListener('click', (e) => {
            e.stopPropagation(); closeSettingsModal();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeSettingsModal(); // 배경 탭하면 닫기
        });
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

    hotmicDebug('  · html 생성 시작');
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
            <select id="hotmic-profile" class="text_pole">
                ${profileOptions}
            </select>
            <small class="notes">메인 RP와 다른 모델로 해설을 뽑고 싶을 때 선택. (예: RP는 GLM, 해설은 Claude)<br><br>나레이션 모드·분량·구성 등 나머지 설정은 자막바의 ⚙️ 버튼에서 조절하세요.</small>
        </div>
    </div>
</div>`;

    hotmicDebug('  · html 완성, 삽입 직전');
    container.insertAdjacentHTML('beforeend', html);
    hotmicDebug('  · 삽입 완료, 바인딩 시작');
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

    // 활성화 토글 시 자막바 표시/숨김
    document.getElementById('hotmic-enabled')?.addEventListener('change', applyEnabledState);
    applyEnabledState();
}

// ─── 설정 모달 (자막바 ⚙️에서 열림) ───
function buildSettingsModal() {
    const box = document.querySelector('#observer-settings-modal .obs-settings-body');
    if (!box) return;
    const s = getSettings();
    const themeOptions = Object.entries(HOTMIC_THEMES)
        .map(([k, v]) => `<option value="${k}" ${s.theme === k ? 'selected' : ''}>${v.name}</option>`)
        .join('');
    box.innerHTML = `
        <label class="obs-set-label" id="hotmic-lang-label">출력 언어</label>
        <select id="m-language" class="obs-set-select">
            <option value="ko" ${s.language === 'ko' ? 'selected' : ''}>한국어</option>
            <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option>
        </select>

        <label class="obs-set-label">색상 테마</label>
        <select id="m-theme" class="obs-set-select">
            ${themeOptions}
        </select>

        <label class="obs-set-label">나레이션 모드</label>
        <select id="m-mode" class="obs-set-select">
            <option value="docu"    ${s.mode === 'docu'    ? 'selected' : ''}>🎬 다큐멘터리</option>
            <option value="sports"  ${s.mode === 'sports'  ? 'selected' : ''}>🏟️ 스포츠 중계</option>
            <option value="variety" ${s.mode === 'variety' ? 'selected' : ''}>📺 예능</option>
        </select>

        <label class="obs-set-label">맥락 범위</label>
        <select id="m-context" class="obs-set-select">
            <option value="current" ${s.context === 'current' ? 'selected' : ''}>현재 메시지만</option>
            <option value="recent5" ${s.context === 'recent5' ? 'selected' : ''}>최근 5턴</option>
            <option value="all"     ${s.context === 'all'     ? 'selected' : ''}>전체 대화</option>
        </select>

        <label class="obs-set-label">해설 분량</label>
        <select id="m-length" class="obs-set-select">
            <option value="short"  ${s.length === 'short'  ? 'selected' : ''}>간결 (짧고 강하게)</option>
            <option value="normal" ${s.length === 'normal' ? 'selected' : ''}>보통</option>
            <option value="long"   ${s.length === 'long'   ? 'selected' : ''}>수다 (풍부하게)</option>
            <option value="max"    ${s.length === 'max'    ? 'selected' : ''}>초장문 (대용량)</option>
        </select>

        <label class="obs-set-label">구성</label>
        <select id="m-preset" class="obs-set-select">
            <option value="all"       ${s.preset === 'all'       ? 'selected' : ''}>전체 (속마음+제작진+팩트+인터뷰)</option>
            <option value="fact"      ${s.preset === 'fact'      ? 'selected' : ''}>팩트체크만</option>
            <option value="interview" ${s.preset === 'interview' ? 'selected' : ''}>인터뷰만</option>
            <option value="broadcast" ${s.preset === 'broadcast' ? 'selected' : ''}>속마음 + 제작진/중계만</option>
        </select>

        <label class="obs-set-label" style="margin-top:10px;">이모지 빈도: <span id="m-fx-val">${s.fxFrequency}</span>%</label>
        <input type="range" id="m-fxfreq" min="0" max="100" step="10" value="${s.fxFrequency}" style="width:100%;">

        <label class="obs-set-label" style="margin-top:10px;">불투명도: <span id="m-op-val">${s.opacity}</span>%</label>
        <input type="range" id="m-opacity" min="30" max="100" step="5" value="${s.opacity}" style="width:100%;">
    `;

    const bindM = (id, key) => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            getSettings()[key] = e.target.value;
            saveSettingsDebounced();
            syncControls();
        });
    };
    bindM('m-language', 'language');
    bindM('m-mode', 'mode');
    bindM('m-context', 'context');
    bindM('m-length', 'length');
    bindM('m-preset', 'preset');

    document.getElementById('m-theme')?.addEventListener('change', (e) => {
        getSettings().theme = e.target.value;
        applyTheme();
        saveSettingsDebounced();
    });

    document.getElementById('m-fxfreq')?.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        getSettings().fxFrequency = v;
        const lbl = document.getElementById('m-fx-val');
        if (lbl) lbl.textContent = v;
        saveSettingsDebounced();
    });

    document.getElementById('m-opacity')?.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        getSettings().opacity = v;
        const lbl = document.getElementById('m-op-val');
        if (lbl) lbl.textContent = v;
        applyOpacity();
        saveSettingsDebounced();
    });

    // 🥚 이스터에그: "출력 언어" 라벨 1.5초 내 5번 탭 → 디버그
    const langLabel = document.getElementById('hotmic-lang-label');
    if (langLabel) {
        let taps = [];
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

function openSettingsModal() {
    buildSettingsModal();
    document.getElementById('observer-settings-modal')?.classList.remove('obs-hidden');
}
function closeSettingsModal() {
    document.getElementById('observer-settings-modal')?.classList.add('obs-hidden');
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
}
function applyOpacity() { applyTheme(); }

// 설정 값 동기화 (드로어 + 모달)
function syncControls() {
    const s = getSettings();
    const set = (sel, val) => { const el = document.querySelector(sel); if (el && el.value !== val) el.value = val; };
    // 모달 (열려있을 때만 존재)
    set('#m-mode', s.mode);
    set('#m-context', s.context);
    set('#m-language', s.language);
    set('#m-length', s.length);
    set('#m-preset', s.preset);
    set('#m-theme', s.theme);
    // 드로어
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
