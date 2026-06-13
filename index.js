// ─── 🎤 Hot Mic v1.7.0 ───
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
    debug: false,             // 화면 디버그 배너 (모바일 진단용, 필요시 설정에서 켜기)
};

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
        docu: `당신은 자연 다큐멘터리 나레이터입니다. 캐릭터를 '관찰 대상 개체'로 취급하고, 인간의 행동을 동물 생태 관찰하듯 건조하게 해설합니다. 본인은 진지하지만 그래서 더 웃긴 톤.

문체 예시 (이 톤과 프레임을 따르되 내용은 실제 장면에 맞게):
- "수컷 개체 [이름]은 또다시 '내가 한 거 아니다' 전략을 시도한다. 그러나 귀끝의 발적 현상과 부자연스러운 시선 회피로 보아, 이미 실패한 것으로 추정된다. 전문가들은 이를 '들킨 츤데레 증후군'이라 부른다."
- "이는 먹이를 요구하거나 관심을 요구할 때 흔히 관찰되는 행동이다."
- "현재 [이름]은 자신을 맹수로 생각하고 있으나, 관찰 결과 대형견에 더 가깝다."
핵심: '개체', '~로 추정된다', '~증후군이라 부른다', 동물 비유.`,

        sports: `당신은 스포츠 실황 중계진입니다. 캐스터(중계)와 해설위원(해설) 두 명이 핑퐁하듯 주고받습니다. 긴박감, 탄성, 리플레이.

문체 예시 (이 톤을 따르되 내용은 실제 장면에 맞게):
- "자 갑니다! [이름] 선수! '난 모르는 일인데.' 시치미 떼기 들어갔습니다! 하지만 리플레이 보시죠! 귀끝 붉어졌습니다! 귀끝 붉어졌습니다!"
- "해설: 저건 들켰네요. / 중계: 예! 완전히 들켰습니다!"
- "그리고 마지막 발언! '나 오늘도 자고 갈 거야.' 선언 나왔습니다! 자연스럽게 말했지만 사실상 일방적인 통보입니다!"
핵심: 중계/해설 라벨 핑퐁, 중요 순간 반복 강조, "리플레이 보시죠", 플레이 용어화.`,

        variety: `당신은 한국 예능 프로그램 자막 담당자입니다. 캐릭터의 온갖 심리전과 플러팅을 짧은 한 줄로 정리해 체면을 박살냅니다. 가장 잔혹하고 가장 웃긴 모드.

문체 예시 (이 톤을 따르되 내용은 실제 장면에 맞게):
- 이모지 타임라인: "🧺 과일 보냄 / 😶 본인 아님 / 🧺 또 보냄 / 😶 진짜 본인 아님"
- 번호 정리: "① 밥 달라고 함 ② 고기 넣으라고 함 ③ 자고 간다고 함 까지 완료했습니다. 아직 본인이 집주인인 줄 알고 있습니다."
- 치트키 한 줄 요약 + 괄호 시간 카운트: "결국 하고 싶은 말: '나 챙겨줘.' (38분째 돌려 말하는 중)"
핵심: 긴 플러팅을 4글자로 요약, (N분째 ~하는 중) 카운트, 짧고 임팩트, ㅋㅋ 가능. director 필드에 이런 정리체를 적극 활용.`,
    };

    const contextNote = settings.context === 'current'
        ? '방금 생성된 마지막 캐릭터 메시지만 분석하세요.'
        : settings.context === 'recent5'
        ? '최근 5개의 대화를 맥락으로 삼아 분석하세요.'
        : '전체 대화 흐름을 바탕으로 분석하세요.';

    const langNote = settings.language === 'en'
        ? '\n\n모든 해설은 영어로 작성하세요. (Write all commentary in English. Keep the same satirical reality-show tone.)'
        : '\n\n모든 해설은 한국어로 작성하세요.';

    const systemPrompt = `${modePrompts[settings.mode]}

당신은 관찰자입니다. 캐릭터는 당신의 존재를 모릅니다. 당신의 해설은 캐릭터에게 보이지 않으며, 다음 대화에 영향을 주지 않습니다.

[가장 중요한 원칙 — 속마음/인터뷰 작성 시]
속마음 유출과 인터뷰는 반드시 '캐릭터 정보(시트)'와 '실제 대화 내용'에 근거해야 합니다. 즉흥적으로 지어내지 마세요.
- 캐릭터가 겉으로 한 말/행동(표면)과, 시트의 성격·대화 맥락에서 추론되는 진짜 속내(이면)의 간극을 포착하세요.
- 그 간극이 바로 웃음 포인트입니다. 예: 시트상 소심한 캐릭터가 속으로는 음침하게 계산하고 있다거나, 무심한 척하지만 시트의 집착 성향이 새어나온다거나.
- 단, 이면은 시트와 대화에서 '실제로 뒷받침되는' 것이어야 합니다. 캐릭터 성격에 없는 걸 날조하면 안 됩니다. 베이스는 항상 캐릭터 시트 + 실제 대화입니다.
- 표면과 이면이 일치하는(솔직한) 캐릭터라면 억지로 반전을 만들지 말고, 그 솔직함 자체를 해설하세요.

[데드팬(deadpan) 유머 원칙 — 가장 중요한 웃음 기법]
- 절대 과장하거나 흥분해서 설명하지 마세요. 가장 어이없는 사실을 가장 건조하고 무덤덤하게 툭 던질 때 제일 웃깁니다.
- 감정 단어("정말 웃기게도", "충격적으로")를 쓰지 말고, 사실만 무미건조하게 나열해서 독자가 알아서 웃게 하세요.
- 짧게 끊으세요. 긴 설명보다 한 줄 펀치라인이 강합니다. 예: "본인은 다정하다고 생각함." / "근거 없음."
- 캐릭터의 진지함과 해설의 무심함의 낙차가 클수록 좋습니다. 캐릭터가 목숨 걸고 진지할 때 해설은 날씨 얘기하듯.
- 캐릭터 성격(시트)의 디테일을 콕 집어 건조하게 들이대세요. 막연한 평가가 아니라 그 캐릭터만의 구체적 모순을 짚어야 성격 반영이 됩니다.

${contextNote}${langNote}

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

    if (targetProfile && cmrs && typeof cmrs.sendRequest === 'function') {
        try {
            const result = await cmrs.sendRequest(
                targetProfile.id,
                [{ role: 'user', content: fullPrompt }],
                1000,
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
            raw = await genQuiet(fullPrompt, false, true, null, '관찰자', null, true);
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

    // 캐릭터 정보 (시트 전체를 충실히 — 인터뷰/속마음의 근거)
    let charData = '(캐릭터 정보 없음)';
    if (ctx.characters && ctx.characterId !== undefined) {
        const char = ctx.characters[ctx.characterId];
        if (char) {
            const cc = char.data || {}; // V2 카드 필드
            charData = [
                `이름: ${char.name || cc.name || '?'}`,
                (char.description || cc.description) ? `설명:\n${(char.description || cc.description).slice(0, 1500)}` : '',
                (char.personality || cc.personality) ? `성격: ${(char.personality || cc.personality).slice(0, 600)}` : '',
                (char.scenario || cc.scenario) ? `시나리오: ${(char.scenario || cc.scenario).slice(0, 400)}` : '',
                (cc.mes_example || char.mes_example) ? `예시 대화(말투/성격 참고):\n${(cc.mes_example || char.mes_example).slice(0, 600)}` : '',
            ].filter(Boolean).join('\n');
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
        const who = m.is_user ? '유저' : (ctx.characters?.[ctx.characterId]?.name || 'AI');
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
        blocks.push(`
            <div class="obs-block type-director">
                <div class="obs-block-label">[ 제작진 ]</div>
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

    // 새 해설 렌더되면 맨 위로 + 자동스크롤 재시작
    body.scrollTop = 0;
    if (getSettings().autoscroll) startAutoScroll();

    // 모드별 마스코트 애니메이션 (확률 + 스마트 가중치)
    maybePlayFx(data);
}

// ─── 마스코트 애니메이션 ───
// 모드별 이모지가 패널에서 한 번 연출되고 사라진다.
// 등장 확률 = 기본 fxFrequency% + 상황 키워드 가중치.
function maybePlayFx(data) {
    const s = getSettings();
    const base = Math.max(0, Math.min(100, s.fxFrequency || 0));
    if (base === 0) return;

    const mode = s.mode;
    const text = [data.inner, data.director, data.fact, data.interview, data.preview]
        .filter(Boolean).join(' ');

    // 스마트 가중치: 모드별 "터질 만한" 키워드 있으면 확률 부스트
    const triggers = {
        docu:    ['멸종', '희귀', '최초', '관찰 사상', '경이', '드뭅', '유일'],
        sports:  ['골', '득점', '역전', '실패', '성공', '대기록', '승부', '결정', '!'],
        variety: ['치트키', '결국', '하고 싶은 말', '들켰', '실패', '폭로', '???', 'ㅋㅋ'],
    };
    const hits = (triggers[mode] || []).filter(k => text.includes(k)).length;
    const boosted = Math.min(100, base + hits * 18); // 키워드당 +18%

    if (Math.random() * 100 >= boosted) return; // 확률 통과 못하면 끝

    playFx(mode, text);
}

// 모드별 기본 이모지 풀 (다양하게)
const FX_SETS = {
    docu:    { emojis: ['📹', '🔬', '🦒', '🐾', '🧬', '🌿', '🔭', '📋', '🦔', '🐧'], anim: 'fx-pan' },
    sports:  { emojis: ['⚽', '🥅', '🏟️', '📣', '🏆', '🚩', '🥏', '🎽', '🏅', '📊'], anim: 'fx-dribble' },
    variety: { emojis: ['🎉', '✨', '🎊', '💥', '😂', '🤡', '💢', '❗', '🫣', '👀', '💀', '🙈'], anim: 'fx-pop' },
};

// 해설 내용에 맞는 이모지를 골라준다 (내용 인식)
const FX_KEYWORDS = [
    // [정규식, 이모지들]
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
    // 내용 키워드 매칭되면 그 이모지 우선
    if (text) {
        for (const [re, emojis] of FX_KEYWORDS) {
            if (re.test(text)) return emojis;
        }
    }
    return FX_SETS[mode]?.emojis || FX_SETS.variety.emojis;
}

function playFx(mode, text) {
    const bar = document.getElementById('observer-bar');
    if (!bar) return;
    // bar는 overflow 제한이 없어 폭죽이 잘리지 않음
    const host = bar;

    const set = FX_SETS[mode] || FX_SETS.variety;
    const pool = pickEmojis(mode, text);

    // 예능 폭죽은 여러 개 흩뿌림, 나머지는 1~2개
    const count = mode === 'variety' ? 5 : (mode === 'sports' ? 2 : 2);

    for (let i = 0; i < count; i++) {
        const el = document.createElement('span');
        el.className = `hotmic-fx ${set.anim}`;
        el.textContent = pool[Math.floor(Math.random() * pool.length)];
        // 랜덤 시작 위치/지연
        el.style.left = (10 + Math.random() * 80) + '%';
        el.style.animationDelay = (Math.random() * 0.25) + 's';
        el.style.fontSize = (18 + Math.random() * 14) + 'px';
        host.appendChild(el);
        setTimeout(() => el.remove(), 2200);
    }
}

// ─── 자동 스크롤 엔진 ───
let _scrollRAF = null;
let _scrollAccum = 0;
let _lastTs = 0;

function startAutoScroll() {
    stopAutoScroll();
    const body = document.querySelector('.obs-panel-body');
    if (!body) return;
    // 스크롤할 내용이 없으면 안 함
    if (body.scrollHeight <= body.clientHeight + 2) return;

    _lastTs = performance.now();
    _scrollAccum = body.scrollTop;

    const step = (ts) => {
        const speed = getSettings().scrollSpeed || 40; // px/sec
        const dt = (ts - _lastTs) / 1000;
        _lastTs = ts;
        _scrollAccum += speed * dt;
        body.scrollTop = _scrollAccum;

        // 끝에 도달하면 잠깐 멈췄다가 위로 (루프)
        if (body.scrollTop + body.clientHeight >= body.scrollHeight - 1) {
            stopAutoScroll();
            setTimeout(() => {
                const b = document.querySelector('.obs-panel-body');
                if (b && getSettings().autoscroll) {
                    b.scrollTop = 0;
                    startAutoScroll();
                }
            }, 2500);
            return;
        }
        _scrollRAF = requestAnimationFrame(step);
    };
    _scrollRAF = requestAnimationFrame(step);
}

function stopAutoScroll() {
    if (_scrollRAF) { cancelAnimationFrame(_scrollRAF); _scrollRAF = null; }
}

function updateTickerPreview(preview) {
    const el = document.querySelector('.obs-ticker-preview');
    if (el) el.textContent = preview || '녹음 중...';
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
}

// ─── 해설 생성 실행 ───
async function runGeneration() {
    if (isGenerating) return;
    const settings = getSettings();
    if (!settings.enabled) return;

    const collected = collectData();
    if (!collected) return;

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
        currentCommentary = commentary;
        updateTickerPreview(commentary.preview || '해설 생성 완료');
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
        🎤
        <span class="obs-rec-dot"></span>
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
                </select>
                <select class="obs-select obs-context-select" title="맥락 범위">
                    <option value="current" ${settings.context === 'current'  ? 'selected' : ''}>현재만</option>
                    <option value="recent5" ${settings.context === 'recent5'  ? 'selected' : ''}>최근 5턴</option>
                    <option value="all"     ${settings.context === 'all'      ? 'selected' : ''}>전체</option>
                </select>
                <button class="obs-btn-small obs-autoscroll" title="자동 스크롤 켜기/끄기">⤓</button>
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
        if (panel) {
            const topSafe = 12;
            const maxH = Math.max(120, window.innerHeight - gap - topSafe - 8);
            panel.style.setProperty('max-height', maxH + 'px', 'important');
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

    // ticker 클릭 (버튼 제외) → panel
    bar.querySelector('#observer-ticker')?.addEventListener('click', (e) => {
        if (!e.target.closest('button')) setState('panel');
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

    // 자동 스크롤 토글
    bar.querySelectorAll('.obs-autoscroll').forEach(btn => {
        const refresh = () => {
            const on = getSettings().autoscroll;
            btn.style.opacity = on ? '1' : '0.35';
            btn.title = on ? '자동 스크롤: 켜짐 (클릭해 끄기)' : '자동 스크롤: 꺼짐 (클릭해 켜기)';
        };
        refresh();
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const s = getSettings();
            s.autoscroll = !s.autoscroll;
            saveSettingsDebounced();
            refresh();
            syncControls();
            if (s.autoscroll) startAutoScroll(); else stopAutoScroll();
        });
    });

    // 본문에 마우스 올리면 자동스크롤 일시정지
    const body = bar.querySelector('.obs-panel-body');
    if (body) {
        body.addEventListener('mouseenter', stopAutoScroll);
        body.addEventListener('mouseleave', () => { if (getSettings().autoscroll) startAutoScroll(); });
        // 사용자가 직접 스크롤하면 잠깐 멈춤
        body.addEventListener('wheel', () => {
            stopAutoScroll();
            clearTimeout(body._resumeTimer);
            body._resumeTimer = setTimeout(() => { if (getSettings().autoscroll) startAutoScroll(); }, 2000);
        });
    }

    // 🥚 이스터에그: 패널 제목 "🎤 HOT MIC"를 1.5초 안에 5번 탭하면 디버그 모드 토글
    const title = bar.querySelector('.obs-panel-title');
    if (title) {
        let taps = [];
        title.style.cursor = 'pointer';
        title.addEventListener('click', (e) => {
            e.stopPropagation();
            const now = Date.now();
            taps = taps.filter(t => now - t < 1500);
            taps.push(now);
            if (taps.length >= 5) {
                taps = [];
                const s = getSettings();
                s.debug = !s.debug;
                saveSettingsDebounced();
                // 짧은 피드백
                const old = title.textContent;
                title.textContent = s.debug ? '🐞 DEBUG ON' : '🎤 HOT MIC';
                if (s.debug) {
                    hotmicDebug('🐞 디버그 모드 ON (새로고침 시 진단 표시)');
                } else {
                    document.getElementById('hotmic-debug')?.remove();
                }
                setTimeout(() => { title.textContent = '🎤 HOT MIC'; }, 1500);
            }
        });
    }

    // 모드 변경
    bar.querySelector('.obs-mode-select')?.addEventListener('change', (e) => {
        getSettings().mode = e.target.value;
        saveSettingsDebounced();
        syncControls();
    });

    // 맥락 변경
    bar.querySelector('.obs-context-select')?.addEventListener('change', (e) => {
        getSettings().context = e.target.value;
        saveSettingsDebounced();
        syncControls();
    });
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
            <small class="notes">메인 RP와 다른 모델로 해설을 뽑고 싶을 때 선택. (예: RP는 GLM, 해설은 Claude)</small>

            <label for="hotmic-language" style="margin-top:10px;">출력 언어</label>
            <select id="hotmic-language" class="text_pole">
                <option value="ko" ${settings.language === 'ko' ? 'selected' : ''}>한국어</option>
                <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
            </select>

            <label for="hotmic-mode-s" style="margin-top:10px;">나레이션 모드</label>
            <select id="hotmic-mode-s" class="text_pole">
                <option value="docu"    ${settings.mode === 'docu'    ? 'selected' : ''}>🎬 다큐멘터리</option>
                <option value="sports"  ${settings.mode === 'sports'  ? 'selected' : ''}>🏟️ 스포츠 중계</option>
                <option value="variety" ${settings.mode === 'variety' ? 'selected' : ''}>📺 예능</option>
            </select>

            <label for="hotmic-context-s" style="margin-top:10px;">맥락 범위</label>
            <select id="hotmic-context-s" class="text_pole">
                <option value="current" ${settings.context === 'current' ? 'selected' : ''}>현재 메시지만</option>
                <option value="recent5" ${settings.context === 'recent5' ? 'selected' : ''}>최근 5턴</option>
                <option value="all"     ${settings.context === 'all'     ? 'selected' : ''}>전체 대화</option>
            </select>

            <label class="checkbox_label" style="margin-top:12px;">
                <input type="checkbox" id="hotmic-autoscroll" ${settings.autoscroll ? 'checked' : ''}>
                <span>자막 자동 스크롤</span>
            </label>
            <label for="hotmic-scrollspeed" style="margin-top:6px;">스크롤 속도: <span id="hotmic-speed-val">${settings.scrollSpeed}</span> px/s</label>
            <input type="range" id="hotmic-scrollspeed" min="10" max="120" step="5" value="${settings.scrollSpeed}" style="width:100%;">
            <small class="notes">패널에 마우스를 올리거나 직접 스크롤하면 잠시 멈춥니다.</small>

            <label for="hotmic-fxfreq" style="margin-top:12px;">애니메이션 빈도: <span id="hotmic-fx-val">${settings.fxFrequency}</span>%</label>
            <input type="range" id="hotmic-fxfreq" min="0" max="100" step="10" value="${settings.fxFrequency}" style="width:100%;">
            <small class="notes">해설이 뜰 때 모드별 마스코트(🎉 예능 / ⚽ 중계 / 📹 다큐)가 등장할 확률. 0%면 끔. 상황이 격할수록 확률이 올라갑니다.</small>
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
    bind('hotmic-language', 'language');
    bind('hotmic-mode-s', 'mode');
    bind('hotmic-context-s', 'context');
    bind('hotmic-autoscroll', 'autoscroll');

    // 자동스크롤 체크박스 → 즉시 반영
    document.getElementById('hotmic-autoscroll')?.addEventListener('change', () => {
        if (getSettings().autoscroll) startAutoScroll(); else stopAutoScroll();
        syncControls();
    });

    // 스크롤 속도 슬라이더
    const speedInput = document.getElementById('hotmic-scrollspeed');
    speedInput?.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        getSettings().scrollSpeed = v;
        const lbl = document.getElementById('hotmic-speed-val');
        if (lbl) lbl.textContent = v;
        saveSettingsDebounced();
    });

    // 애니메이션 빈도 슬라이더
    const fxInput = document.getElementById('hotmic-fxfreq');
    fxInput?.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        getSettings().fxFrequency = v;
        const lbl = document.getElementById('hotmic-fx-val');
        if (lbl) lbl.textContent = v;
        saveSettingsDebounced();
    });

    // 활성화 토글 시 자막바 표시/숨김
    document.getElementById('hotmic-enabled')?.addEventListener('change', applyEnabledState);
    applyEnabledState();
}

// 활성화 상태에 따라 자막바 표시
function applyEnabledState() {
    const bar = document.getElementById('observer-bar');
    if (bar) bar.style.display = getSettings().enabled ? '' : 'none';
}

// 설정창 ↔ 자막바 컨트롤 값 동기화
function syncControls() {
    const s = getSettings();
    const set = (sel, val) => { const el = document.querySelector(sel); if (el && el.value !== val) el.value = val; };
    set('.obs-mode-select', s.mode);
    set('.obs-context-select', s.context);
    set('#hotmic-mode-s', s.mode);
    set('#hotmic-context-s', s.context);
    set('#hotmic-profile', s.profile);
    set('#hotmic-language', s.language);
    const en = document.getElementById('hotmic-enabled');
    if (en) en.checked = s.enabled;
    const as = document.getElementById('hotmic-autoscroll');
    if (as) as.checked = s.autoscroll;
    // 자막바 자동스크롤 버튼 투명도
    document.querySelectorAll('.obs-autoscroll').forEach(b => {
        b.style.opacity = s.autoscroll ? '1' : '0.35';
    });
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
}

// ─── 화면 디버그 배너 (모바일은 콘솔을 못 보므로 화면에 직접 표시) ───
function hotmicDebug(msg, isError) {
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
        // 닫기 버튼 (배너 아무데나 눌러서 실수로 닫히지 않게)
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

// 단계별 안전 실행
function safeStep(label, fn) {
    hotmicDebug('▶ ' + label + ' 시작');
    try {
        fn();
        hotmicDebug('✅ ' + label + ' 완료');
    } catch (e) {
        hotmicDebug('❌ ' + label + ' 에러: ' + (e?.message || e), true);
        hotmicDebug('   ' + (e?.stack || '').split('\n').slice(0,2).join(' | '), true);
    }
}

// ─── 초기화 ───
jQuery(async () => {
    const DEBUG = getSettings().debug;

    if (DEBUG) hotmicDebug('--- Hot Mic 초기화 시작 ---');

    // 각 단계를 독립적으로 — 하나 터져도 나머지는 계속
    safeStep('injectUI', injectUI);
    // injectUI 직후 bar 생성 확인
    hotmicDebug(document.getElementById('observer-bar')
        ? '  ↳ observer-bar 생성됨 ✓'
        : '  ↳ observer-bar 없음 ✗', !document.getElementById('observer-bar'));
    // 자막바 위치를 settings보다 먼저 못박는다 (settings가 모바일에서 멈춰도 자막바는 떠야 함)
    safeStep('enforcePosition(우선)', enforcePosition);
    safeStep('setupEventListeners', setupEventListeners);
    safeStep('applyEnabledState', applyEnabledState);
    // 설정창은 비동기로 미뤄서, 여기서 멈춰도 위 단계들이 이미 끝나있게 한다
    setTimeout(() => safeStep('injectSettings(지연)', injectSettings), 0);
    setTimeout(() => safeStep('injectWandMenu(지연)', injectWandMenu), 0);
    safeStep('syncControls', syncControls);

    if (DEBUG) {
        const bar = document.getElementById('observer-bar');
        if (!bar) {
            hotmicDebug('❌ observer-bar 생성 안 됨 (null)', true);
        } else {
            const r = bar.getBoundingClientRect();
            const cs = getComputedStyle(bar);
            hotmicDebug(`bar: parent=${bar.parentElement?.id || bar.parentElement?.tagName}`);
            hotmicDebug(`bar: display=${cs.display} pos=${cs.position} bottom=${cs.bottom}`);
            hotmicDebug(`bar: top=${Math.round(r.top)} left=${Math.round(r.left)} size=${Math.round(r.width)}x${Math.round(r.height)}`);
            hotmicDebug(`화면: winH=${window.innerHeight} winW=${window.innerWidth}`);
            if (r.top > window.innerHeight || r.top < -r.height) {
                hotmicDebug('⚠ bar가 화면 밖 → top 교정 시도함', true);
                // 교정 한 번 더 강제 호출
                try { enforcePosition(); } catch (e) {}
                setTimeout(() => {
                    const r2 = document.getElementById('observer-bar')?.getBoundingClientRect();
                    if (r2) hotmicDebug(`교정 후: top=${Math.round(r2.top)} (winH=${window.innerHeight})`);
                }, 100);
            } else if (r.width === 0 || r.height === 0) {
                hotmicDebug('⚠ bar 크기가 0 → 내용/display 문제', true);
            } else {
                hotmicDebug('✓ bar는 화면 안에 있음. (가려졌거나 정상)');
            }
            hotmicDebug('(위 ✕ 닫기 버튼으로 닫으세요)');
        }
    }

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
