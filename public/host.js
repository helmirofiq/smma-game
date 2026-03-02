const socket = io();

const lobbyScene = document.getElementById('lobbyScene');
const gameScene = document.getElementById('gameScene');
const phaseLabel = document.getElementById('phaseLabel');
const roundInfo = document.getElementById('roundInfo');
const timer = document.getElementById('timer');
const timerWrap = document.getElementById('timerWrap');
const ringProgress = document.getElementById('ringProgress');
const nameDisplay = document.getElementById('nameDisplay');
const subInfo = document.getElementById('subInfo');
const hostOptions = document.getElementById('hostOptions');
const leaderboard = document.getElementById('leaderboard');
const podium = document.getElementById('podium');
const startBtn = document.getElementById('startBtn');
const resetButtons = document.querySelectorAll('[data-reset-game]');
const roundCount = document.getElementById('roundCount');
const questionDuration = document.getElementById('questionDuration');
const selectionDuration = document.getElementById('selectionDuration');
const qr = document.getElementById('qr');
const joinUrlEl = document.getElementById('joinUrl');
const hostStatus = document.getElementById('hostStatus');
const participantList = document.getElementById('participantList');
const playersCount = document.getElementById('playersCount');
const selectingWrap = document.getElementById('selectingWrap');
const questionWrap = document.getElementById('questionWrap');
const nameCloud = document.getElementById('nameCloud');
const gameBottom = document.getElementById('gameBottom');

const joinUrl = `${window.location.origin}/audience`;
joinUrlEl.textContent = joinUrl;
qr.src = `/api/qr?text=${encodeURIComponent(joinUrl)}`;

const RING_RADIUS = 52;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
ringProgress.style.strokeDasharray = `${RING_CIRC}`;
ringProgress.style.strokeDashoffset = `${RING_CIRC}`;

let connected = false;
let canStartByPhase = true;
let previousPhase = 'lobby';
let questionNames = [];
let aiTicker = null;
let aiStageKey = '';

function updateStartState() {
  startBtn.disabled = !connected || !canStartByPhase;
}

function activateScene(scene) {
  if (scene === 'lobby') {
    lobbyScene.classList.add('active');
    gameScene.classList.remove('active');
    return;
  }
  lobbyScene.classList.remove('active');
  gameScene.classList.add('active');
}

function renderLeaderboard(list = []) {
  leaderboard.innerHTML = list
    .map(
      (entry) =>
        `<div class="leaderboard-row"><strong>#${entry.rank}</strong><span>${entry.name}</span><strong>${entry.score}</strong></div>`,
    )
    .join('');
}

function renderParticipantList(list = []) {
  playersCount.textContent = String(list.length);
  participantList.innerHTML =
    list
      .map((entry) => `<div class="participant-item">${entry.name}</div>`)
      .join('') || '<p class="muted">No participants yet.</p>';
}

function renderPodium(list = []) {
  if (!list.length) {
    podium.innerHTML = '<p class="muted">Final podium appears when game ends.</p>';
    return;
  }

  const byRank = {
    1: list.find((x) => x.rank === 1),
    2: list.find((x) => x.rank === 2),
    3: list.find((x) => x.rank === 3),
  };

  podium.innerHTML = `
    <div class="podium">
      <div class="slot second"><h3>2</h3><p>${byRank[2]?.name || '-'}</p><strong>${byRank[2]?.score || 0}</strong></div>
      <div class="slot first"><h3>1</h3><p>${byRank[1]?.name || '-'}</p><strong>${byRank[1]?.score || 0}</strong></div>
      <div class="slot third"><h3>3</h3><p>${byRank[3]?.name || '-'}</p><strong>${byRank[3]?.score || 0}</strong></div>
    </div>
  `;
}

function renderOptions(state) {
  if (!state.question) {
    hostOptions.innerHTML = '';
    return;
  }

  const correct = state.lastRoundResult?.correctOptionId;

  hostOptions.innerHTML = state.question.options
    .map((option) => {
      let cls = 'option';
      if (state.status === 'result') {
        cls += option.id === correct ? ' correct-zoom good' : ' wrong-hide bad';
      }
      return `<div class="${cls}"><strong>${option.id.toUpperCase()}</strong><p style="margin-top:6px">${option.text}</p></div>`;
    })
    .join('');
}

function setTimer(remaining, total) {
  const safeTotal = Math.max(1, total);
  const pct = Math.max(0, Math.min(1, remaining / safeTotal));
  const offset = RING_CIRC * (1 - pct);
  timer.textContent = String(remaining);
  ringProgress.style.strokeDashoffset = `${offset}`;
}

function startAiSelectorAnimation(names, selectedName) {
  const pool = names.filter(Boolean);
  if (!pool.length) {
    nameCloud.innerHTML = '<p class="muted">Preparing candidates...</p>';
    return;
  }
  const candidates = pool.filter((name) => name !== selectedName);
  const stageKey = `${selectedName}|${candidates.length}`;
  if (aiTicker && aiStageKey === stageKey) return;
  stopAiSelectorAnimation();
  aiStageKey = stageKey;

  nameCloud.innerHTML = `
    <div class="ai-tile-stage">
      <p class="ai-meta">MODEL: SMMA-NAME-SELECTOR v2.0 | SIGNAL BUG ACTIVE</p>
      <p class="ai-route-status">Searching candidate graph...</p>
      <div class="name-tile-grid">
        ${candidates.map((name) => `<div class="name-tile">${name}</div>`).join('')}
      </div>
      <div class="ai-bug" aria-hidden="true"></div>
    </div>
  `;

  const stage = nameCloud.querySelector('.ai-tile-stage');
  const tiles = [...nameCloud.querySelectorAll('.name-tile')];
  const bug = nameCloud.querySelector('.ai-bug');
  const routeStatus = nameCloud.querySelector('.ai-route-status');
  if (!tiles.length || !bug || !stage) return;

  let currentIdx = Math.floor(Math.random() * tiles.length);

  const moveBugTo = (tile) => {
    const tileBox = tile.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    const x = tileBox.left - stageBox.left + tileBox.width / 2 - 14;
    const y = tileBox.top - stageBox.top + tileBox.height / 2 - 14;
    bug.style.transform = `translate(${x}px, ${y}px)`;
  };

  moveBugTo(tiles[currentIdx]);
  tiles[currentIdx].classList.add('is-scan');

  aiTicker = setInterval(() => {
    tiles[currentIdx].classList.remove('is-scan');
    const step = 1 + Math.floor(Math.random() * 4);
    currentIdx = (currentIdx + step) % tiles.length;
    const candidateName = tiles[currentIdx].textContent;
    tiles[currentIdx].classList.add('is-scan');
    moveBugTo(tiles[currentIdx]);
    routeStatus.textContent = `Scanning: ${candidateName}`;
  }, 150);
}

function stopAiSelectorAnimation() {
  if (aiTicker) {
    clearInterval(aiTicker);
    aiTicker = null;
  }
  aiStageKey = '';
}

function playSelectionBurst(selectedName) {
  const burst = document.createElement('div');
  burst.className = 'selection-burst';

  const selected = document.createElement('div');
  selected.className = 'burst-selected';
  selected.textContent = selectedName || 'Selected';
  burst.appendChild(selected);

  const others = questionNames
    .filter((n) => n && n !== selectedName)
    .sort(() => Math.random() - 0.5)
    .slice(0, 16);

  others.forEach((name, idx) => {
    const item = document.createElement('span');
    item.className = 'burst-other';
    const angle = (Math.PI * 2 * idx) / Math.max(1, others.length);
    const dist = 28 + Math.random() * 32;
    item.style.setProperty('--bx', `${Math.cos(angle) * dist}vw`);
    item.style.setProperty('--by', `${Math.sin(angle) * dist}vh`);
    item.style.setProperty('--bd', `${0.06 + (idx % 5) * 0.03}s`);
    item.textContent = name;
    burst.appendChild(item);
  });

  questionWrap.appendChild(burst);
  setTimeout(() => burst.remove(), 1100);
}

async function loadQuestionNames() {
  const response = await fetch('/api/question-names');
  const data = await response.json();
  questionNames = Array.isArray(data.names) ? data.names : [];
}

socket.on('connect', () => {
  connected = true;
  hostStatus.textContent = 'Connected. Ready to start.';
  socket.emit('host:join');
  updateStartState();
});

socket.on('disconnect', () => {
  connected = false;
  hostStatus.textContent = 'Disconnected. Reconnecting...';
  updateStartState();
});

socket.on('game:state', (state) => {
  const phase = state.status;
  phaseLabel.textContent = `Phase: ${phase}`;
  roundInfo.textContent = `Round ${state.currentRound}/${state.totalRounds}`;

  // Hard reset: never keep previous options outside question/result phases.
  if (phase !== 'question' && phase !== 'result') {
    hostOptions.innerHTML = '';
    questionWrap.classList.add('hidden');
  }

  renderLeaderboard(state.leaderboard);
  renderParticipantList(state.leaderboard);
  renderPodium(phase === 'final' ? state.finalLeaderboard : []);

  canStartByPhase = phase === 'lobby' || phase === 'final';
  updateStartState();

  if (phase === 'lobby') {
    activateScene('lobby');
    stopAiSelectorAnimation();
    setTimer(0, 1);
    timerWrap.classList.remove('hidden');
    gameBottom.classList.remove('hidden');
    previousPhase = phase;
    return;
  }

  activateScene('game');

  if (phase === 'selecting') {
    stopAiSelectorAnimation();
    selectingWrap.classList.remove('hidden');
    questionWrap.classList.add('hidden');
    hostOptions.innerHTML = '';
    gameBottom.classList.add('hidden');
    timerWrap.classList.add('hidden');
    startAiSelectorAnimation(questionNames, state.question?.name || '');
  } else {
    stopAiSelectorAnimation();
    selectingWrap.classList.add('hidden');
    timerWrap.classList.remove('hidden');

    if (phase === 'question') {
      questionWrap.classList.remove('hidden');
      renderOptions(state);
      nameDisplay.textContent = state.question?.name || '-';
      subInfo.textContent = `${state.question?.businessUnit || ''} | Find the fictive statement`;
      setTimer(state.secondsRemaining || 0, state.questionDuration || Number(questionDuration.value) || 30);
      gameBottom.classList.add('hidden');
      if (previousPhase === 'selecting') {
        playSelectionBurst(state.question?.name || '');
        nameDisplay.classList.remove('selected-pop');
        void nameDisplay.offsetWidth;
        nameDisplay.classList.add('selected-pop');
      }
    } else if (phase === 'result') {
      questionWrap.classList.remove('hidden');
      renderOptions(state);
      nameDisplay.textContent = state.question?.name || '-';
      subInfo.textContent = `Fiktif: ${state.lastRoundResult?.correctText || '-'} | Correct option: ${
        state.lastRoundResult?.correctOptionId?.toUpperCase() || '-'
      }`;
      setTimer(0, 1);
      gameBottom.classList.remove('hidden');
    } else if (phase === 'leaderboard') {
      questionWrap.classList.add('hidden');
      nameDisplay.textContent = 'Leaderboard';
      subInfo.textContent = 'Next round starts soon';
      hostOptions.innerHTML = '';
      const remaining = state.leaderboardSecondsRemaining || 0;
      setTimer(remaining, state.leaderboardPause || 7);
      gameBottom.classList.remove('hidden');
    } else if (phase === 'final') {
      questionWrap.classList.add('hidden');
      nameDisplay.textContent = 'Game Finished';
      subInfo.textContent = 'Final ranking';
      hostOptions.innerHTML = '';
      setTimer(0, 1);
      gameBottom.classList.remove('hidden');
    }
  }
  previousPhase = phase;
});

startBtn.addEventListener('click', () => {
  hostStatus.textContent = 'Starting game...';
  lobbyScene.classList.add('launching');
  socket.emit(
    'host:start',
    {
      roundCount: Number(roundCount.value),
      questionDuration: Number(questionDuration.value),
      selectionDuration: Number(selectionDuration.value),
    },
    (res) => {
      hostStatus.textContent = res?.message || 'No server response.';
      if (!res?.ok) lobbyScene.classList.remove('launching');
    },
  );
});

resetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    socket.emit('host:reset', {}, (res) => {
      hostStatus.textContent = res?.message || 'Session reset.';
    });
  });
});

loadQuestionNames().catch(() => {
  questionNames = [];
});
