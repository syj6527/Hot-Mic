// ─── 🎤 Hot Mic v1.2.0 ───
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
    bar.className = `state-${newState}`;
    getSettings().state = newState;
    saveSettingsDebounced();
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
        <span class="obs-ticker-cam">🎤</span>
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

    document.body.insertAdjacentHTML('beforeend', html);
    if (settings.fullscreen) {
        document.getElementById('observer-panel')?.classList.add('obs-fs');
        document.getElementById('observer-bar')?.classList.add('obs-fs-bar');
    }
    bindEvents();
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
    const container = document.getElementById('extensions_settings2')
        || document.getElementById('extensions_settings');
    if (!container || document.getElementById('hotmic-settings')) return;

    const settings = getSettings();
    const profiles = getConnectionProfiles();

    const profileOptions = ['<option value="">기본 (현재 연결)</option>']
        .concat(profiles.map(p =>
            `<option value="${escHtml(p.name)}" ${settings.profile === p.name ? 'selected' : ''}>${escHtml(p.name)}</option>`
        )).join('');

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
        </div>
    </div>
</div>`;

    container.insertAdjacentHTML('beforeend', html);

    // 바인딩 + 자막바 select와 양방향 동기화
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

// ─── 이벤트 리스너 ───
function setupEventListeners() {
    // AI 응답 완료 시 자동 해설
    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        setTimeout(runGeneration, 300); // 렌더 안정화 후
    });
}

// ─── 초기화 ───
jQuery(async () => {
    injectUI();
    injectSettings();
    setupEventListeners();
    syncControls();
    console.log('[Hot Mic] 로드 완료. 캐릭터는 모릅니다.');
});
