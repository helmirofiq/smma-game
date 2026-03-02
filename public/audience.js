const socket = io();

const joinCard = document.getElementById('joinCard');
const gameCard = document.getElementById('gameCard');
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const joinError = document.getElementById('joinError');

const phase = document.getElementById('phase');
const questionTitle = document.getElementById('questionTitle');
const options = document.getElementById('options');
const answerStatus = document.getElementById('answerStatus');
const timer = document.getElementById('timer');
const myRank = document.getElementById('myRank');
const myScore = document.getElementById('myScore');
const leaderboard = document.getElementById('leaderboard');
const finalStanding = document.getElementById('finalStanding');

let me = null;
let hasAnswered = false;
let selectedOptionId = null;
let currentQuestionKey = '';

function questionKey(state) {
  if (!state.question) return '';
  return `${state.currentRound}|${state.question.name}|${state.question.options
    .map((o) => `${o.id}:${o.text}`)
    .join('|')}`;
}

function renderLeaderboard(list = []) {
  leaderboard.innerHTML = list
    .slice(0, 10)
    .map(
      (entry) =>
        `<div class="leaderboard-row"><strong>#${entry.rank}</strong><span>${entry.name}</span><strong>${entry.score}</strong></div>`,
    )
    .join('');
}

function renderOptions(state) {
  if (state.status !== 'question' || !state.question) {
    options.innerHTML = '';
    return;
  }

  options.innerHTML = state.question.options
    .map((option) => {
      const isSelected = selectedOptionId === option.id;
      const cls = [
        'aud-option',
        isSelected ? 'is-selected' : '',
        hasAnswered ? 'is-locked' : '',
        hasAnswered && isSelected ? 'is-submitted' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const suffix = hasAnswered && isSelected ? '<span class="submit-badge">Submitted</span>' : '';
      return `
      <button class="${cls}" data-id="${option.id}" ${hasAnswered ? 'disabled' : ''}>
        <div class="aud-option-head">
          <strong>${option.id.toUpperCase()}</strong>
          ${suffix}
        </div>
        <p>${option.text}</p>
      </button>
    `;
    })
    .join('');

  options.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      if (hasAnswered) return;
      selectedOptionId = button.dataset.id;
      renderOptions(state);

      window.navigator.vibrate?.(22);
      setTimeout(() => {
        socket.emit('player:answer', { optionId: button.dataset.id });
        hasAnswered = true;
        answerStatus.className = 'answer-status submitted';
        answerStatus.textContent = 'Answer submitted.';
        renderOptions(state);
      }, 120);
    });
  });
}

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  socket.emit('player:join', { name });
});

socket.on('join:error', (payload) => {
  joinError.textContent = payload.message;
});

socket.on('join:ok', (payload) => {
  me = payload;
  joinCard.style.display = 'none';
  gameCard.style.display = 'grid';
});

socket.on('player:state', (state) => {
  if (!me) return;
  hasAnswered = state.hasAnswered;
  myScore.textContent = `Score ${state.score}`;
  myRank.textContent = `Rank ${state.rank || '-'}`;
});

socket.on('game:state', (state) => {
  timer.textContent = `${state.secondsRemaining || state.selectionSecondsRemaining || state.leaderboardSecondsRemaining || 0}s`;
  renderLeaderboard(state.leaderboard);

  if (state.status === 'question') {
    const key = questionKey(state);
    if (key !== currentQuestionKey) {
      currentQuestionKey = key;
      selectedOptionId = null;
      hasAnswered = false;
    }
  }

  if (state.status === 'selecting') {
    hasAnswered = false;
    selectedOptionId = null;
    currentQuestionKey = '';
    phase.textContent = 'AI selecting next name...';
    questionTitle.textContent = state.question?.name || '';
    answerStatus.className = 'answer-status';
    answerStatus.textContent = 'Get ready.';
  } else if (state.status === 'question') {
    phase.textContent = `Round ${state.currentRound}/${state.totalRounds}`;
    questionTitle.textContent = `${state.question?.name || '-'} - Choose the fictive statement`;
    if (!hasAnswered) {
      answerStatus.className = 'answer-status';
      answerStatus.textContent = 'Tap one answer.';
    }
  } else if (state.status === 'result') {
    phase.textContent = 'Round result';
    questionTitle.textContent = `Correct: ${state.lastRoundResult?.correctOptionId?.toUpperCase() || '-'}`;
    answerStatus.className = 'answer-status';
    answerStatus.textContent = 'Leaderboard is updating...';
  } else if (state.status === 'leaderboard') {
    phase.textContent = 'Leaderboard';
    questionTitle.textContent = `Next round in ${state.leaderboardSecondsRemaining || 0}s`;
    answerStatus.className = 'answer-status';
    answerStatus.textContent = '';
  } else if (state.status === 'final') {
    phase.textContent = 'Game ended';
    questionTitle.textContent = 'Final leaderboard';
    const mine = state.finalLeaderboard.find((entry) => entry.id === me?.id);
    finalStanding.innerHTML = mine
      ? `<p>You finished at <strong>#${mine.rank}</strong> with <strong>${mine.score}</strong> points.</p>`
      : '<p>You were not ranked.</p>';
  } else {
    phase.textContent = 'Waiting host to start';
    questionTitle.textContent = '';
    answerStatus.className = 'answer-status';
    answerStatus.textContent = '';
  }

  renderOptions(state);

  if (state.status !== 'question') {
    options.innerHTML = '';
  }
});
