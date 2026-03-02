const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { parse } = require('csv-parse/sync');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DEFAULT_CSV_PATHS = [
  process.env.CSV_PATH,
  path.join(__dirname, 'data', 'responses.csv'),
  '/Users/helmi/Downloads/Order Form (Responses) - Form Responses 1.csv',
].filter(Boolean);
const QUESTIONS_JSON_PATH = path.join(__dirname, 'data', 'questions.json');

function getCsvPath() {
  const found = DEFAULT_CSV_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`CSV file not found. Checked: ${DEFAULT_CSV_PATHS.join(', ')}`);
  }
  return found;
}

function normalize(value) {
  return (value || '').toString().trim();
}

function isPlaceholder(value) {
  const v = normalize(value).toLowerCase();
  return !v || ['-', '--', '.', 'xx', 'n/a', 'na'].includes(v);
}

function loadQuestionsFromCsv() {
  const csvPath = getCsvPath();
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, bom: true });

  const filtered = rows
    .map((row) => ({
      name: normalize(row['Nama']),
      businessUnit: normalize(row['Business Unit']),
      attendance: normalize(row['Konfirmasi Kehadiran']).toLowerCase(),
      fact1: normalize(row['Fakta 1']),
      fact2: normalize(row['Fakta 2']),
      fictive: normalize(row['Fiktif 1']),
    }))
    .filter((row) => row.attendance === 'hadir')
    .filter((row) => row.name && row.fact1 && row.fact2 && row.fictive)
    .filter((row) => ![row.fact1, row.fact2, row.fictive].some(isPlaceholder))
    .filter((row) => new Set([row.fact1.toLowerCase(), row.fact2.toLowerCase(), row.fictive.toLowerCase()]).size === 3);

  const byName = new Map();
  for (const row of filtered) {
    byName.set(row.name.toLowerCase(), row);
  }
  return [...byName.values()];
}

function loadQuestionsFromJson() {
  if (!fs.existsSync(QUESTIONS_JSON_PATH)) return null;
  const raw = JSON.parse(fs.readFileSync(QUESTIONS_JSON_PATH, 'utf8'));
  if (!Array.isArray(raw)) return null;

  const questions = raw
    .map((row) => ({
      name: normalize(row.name),
      businessUnit: normalize(row.businessUnit),
      fact1: normalize(row.fact1),
      fact2: normalize(row.fact2),
      fictive: normalize(row.fictive),
    }))
    .filter((row) => row.name && row.fact1 && row.fact2 && row.fictive)
    .filter((row) => ![row.fact1, row.fact2, row.fictive].some(isPlaceholder))
    .filter((row) => new Set([row.fact1.toLowerCase(), row.fact2.toLowerCase(), row.fictive.toLowerCase()]).size === 3);

  return {
    source: QUESTIONS_JSON_PATH,
    questions,
  };
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadQuestionBank() {
  const fromJson = loadQuestionsFromJson();
  if (fromJson && fromJson.questions.length) return fromJson;

  return {
    source: getCsvPath(),
    questions: loadQuestionsFromCsv(),
  };
}

const loadedBank = loadQuestionBank();
const questionBank = loadedBank.questions;
const dataSourcePath = loadedBank.source;
const players = new Map();

let game = {
  status: 'lobby',
  roundCount: 10,
  questionDuration: 30,
  leaderboardPause: 7,
  selectionDuration: 8,
  currentRound: 0,
  totalRounds: 0,
  question: null,
  questionEndsAt: null,
  selectionEndsAt: null,
  leaderboardEndsAt: null,
  answers: new Map(),
  usedQuestionNames: new Set(),
  loopActive: false,
  lastRoundResult: null,
  finalLeaderboard: [],
};

function getSortedLeaderboard() {
  return [...players.values()]
    .sort((a, b) => b.score - a.score || a.joinOrder - b.joinOrder)
    .map((player, index) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      rank: index + 1,
      lastAnswer: player.lastAnswer,
    }));
}

function publicState() {
  const now = Date.now();
  const leaderboard = getSortedLeaderboard();

  return {
    status: game.status,
    currentRound: game.currentRound,
    totalRounds: game.totalRounds,
    questionDuration: game.questionDuration,
    selectionDuration: game.selectionDuration,
    leaderboardPause: game.leaderboardPause,
    selectionEndsAt: game.selectionEndsAt,
    leaderboardEndsAt: game.leaderboardEndsAt,
    questionEndsAt: game.questionEndsAt,
    secondsRemaining:
      game.questionEndsAt && game.status === 'question'
        ? Math.max(0, Math.ceil((game.questionEndsAt - now) / 1000))
        : 0,
    selectionSecondsRemaining:
      game.selectionEndsAt && game.status === 'selecting'
        ? Math.max(0, Math.ceil((game.selectionEndsAt - now) / 1000))
        : 0,
    leaderboardSecondsRemaining:
      game.leaderboardEndsAt && game.status === 'leaderboard'
        ? Math.max(0, Math.ceil((game.leaderboardEndsAt - now) / 1000))
        : 0,
    playersCount: players.size,
    leaderboard,
    question: game.question
      ? {
          name: game.question.name,
          businessUnit: game.question.businessUnit,
          options: game.question.options.map((option) => ({
            id: option.id,
            text: option.text,
          })),
        }
      : null,
    answersCount: game.answers.size,
    lastRoundResult: game.lastRoundResult,
    finalLeaderboard: game.finalLeaderboard,
  };
}

function emitState() {
  const state = publicState();
  io.emit('game:state', state);

  for (const [socketId, player] of players.entries()) {
    io.to(socketId).emit('player:state', {
      id: player.id,
      name: player.name,
      score: player.score,
      rank: state.leaderboard.find((entry) => entry.id === player.id)?.rank || null,
      hasAnswered: game.answers.has(player.id),
    });
  }
}

function pickNextQuestion() {
  const unused = questionBank.filter((q) => !game.usedQuestionNames.has(q.name));
  const pool = unused.length ? unused : questionBank;
  const base = pool[Math.floor(Math.random() * pool.length)];
  game.usedQuestionNames.add(base.name);

  const shuffled = shuffle([
    { text: base.fact1, isFictive: false },
    { text: base.fact2, isFictive: false },
    { text: base.fictive, isFictive: true },
  ]);
  const options = shuffled.map((item, index) => ({
    id: `o${index + 1}`,
    text: item.text,
    isFictive: item.isFictive,
  }));

  return {
    name: base.name,
    businessUnit: base.businessUnit,
    options,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitWithStateTicks(seconds) {
  for (let i = 0; i < seconds; i += 1) {
    await wait(1000);
    emitState();
  }
}

async function runGameLoop() {
  if (game.loopActive) return;
  game.loopActive = true;

  for (let i = 1; i <= game.totalRounds; i += 1) {
    game.currentRound = i;
    game.status = 'selecting';
    game.answers = new Map();
    game.question = pickNextQuestion();
    game.lastRoundResult = null;
    game.selectionEndsAt = Date.now() + game.selectionDuration * 1000;
    game.questionEndsAt = null;
    game.leaderboardEndsAt = null;
    for (const player of players.values()) {
      player.lastAnswer = null;
    }
    emitState();

    await waitWithStateTicks(game.selectionDuration);

    game.status = 'question';
    game.questionEndsAt = Date.now() + game.questionDuration * 1000;
    game.selectionEndsAt = null;
    game.leaderboardEndsAt = null;
    emitState();
    await waitWithStateTicks(game.questionDuration);

    const correctOption = game.question.options.find((option) => option.isFictive);
    const leaderboard = getSortedLeaderboard();
    const correctPlayers = leaderboard.filter((entry) => entry.lastAnswer?.isCorrect);

    game.status = 'result';
    game.lastRoundResult = {
      correctOptionId: correctOption.id,
      correctText: correctOption.text,
      correctPlayers,
      allAnswers: leaderboard
        .filter((entry) => entry.lastAnswer)
        .map((entry) => ({
          name: entry.name,
          selectedOptionId: entry.lastAnswer.optionId,
          isCorrect: entry.lastAnswer.isCorrect,
          pointsGained: entry.lastAnswer.points,
          score: entry.score,
        })),
      leaderboard,
    };
    emitState();

    await wait(5000);

    game.status = 'leaderboard';
    game.leaderboardEndsAt = Date.now() + game.leaderboardPause * 1000;
    emitState();
    await waitWithStateTicks(game.leaderboardPause);
  }

  game.status = 'final';
  game.finalLeaderboard = getSortedLeaderboard();
  game.question = null;
  game.questionEndsAt = null;
  game.selectionEndsAt = null;
  game.leaderboardEndsAt = null;
  game.lastRoundResult = null;
  emitState();

  game.loopActive = false;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/meta', (req, res) => {
  const total = questionBank.length;
  const businessUnits = new Set(questionBank.map((q) => q.businessUnit).filter(Boolean)).size;
  res.json({
    sourceCsv: dataSourcePath,
    totalEligibleQuestions: total,
    uniqueBusinessUnits: businessUnits,
  });
});

app.get('/api/question-names', (req, res) => {
  res.json({
    names: questionBank.map((q) => q.name).filter(Boolean),
  });
});

app.get('/api/qr', async (req, res) => {
  try {
    const text = req.query.text;
    if (!text) {
      res.status(400).json({ error: 'Missing text query param' });
      return;
    }
    const png = await QRCode.toBuffer(text, {
      width: 320,
      margin: 1,
      color: { dark: '#111111', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => res.redirect('/host'));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/audience', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'audience.html')),
);

io.on('connection', (socket) => {
  socket.on('host:join', () => {
    socket.join('hosts');
    socket.emit('game:state', publicState());
  });

  socket.on('player:join', ({ name }) => {
    const cleanName = normalize(name).slice(0, 32);
    if (!cleanName) {
      socket.emit('join:error', { message: 'Name is required.' });
      return;
    }

    players.set(socket.id, {
      id: socket.id,
      name: cleanName,
      score: 0,
      joinOrder: players.size + 1,
      lastAnswer: null,
    });

    socket.emit('join:ok', { id: socket.id, name: cleanName });
    emitState();
  });

  socket.on('host:start', (config = {}, ack) => {
    if (game.loopActive) {
      if (typeof ack === 'function') {
        ack({ ok: false, message: 'Game is already running.' });
      }
      return;
    }

    const requestedRounds = Number(config.roundCount) || 10;
    const requestedDuration = Number(config.questionDuration) || 30;
    const requestedSelection = Number(config.selectionDuration) || game.selectionDuration;
    const safeRounds = Math.max(1, Math.min(requestedRounds, questionBank.length));
    const safeDuration = Math.max(10, Math.min(requestedDuration, 120));
    const safeSelection = Math.max(4, Math.min(requestedSelection, 20));

    if (!questionBank.length) {
      if (typeof ack === 'function') {
        ack({ ok: false, message: 'No valid questions found in CSV.' });
      }
      return;
    }

    game = {
      ...game,
      status: 'lobby',
      roundCount: safeRounds,
      questionDuration: safeDuration,
      selectionDuration: safeSelection,
      currentRound: 0,
      totalRounds: safeRounds,
      usedQuestionNames: new Set(),
      answers: new Map(),
      lastRoundResult: null,
      finalLeaderboard: [],
    };

    for (const player of players.values()) {
      player.score = 0;
      player.lastAnswer = null;
    }

    runGameLoop();
    if (typeof ack === 'function') {
      ack({
        ok: true,
        message: `Game started: ${safeRounds} rounds x ${safeDuration}s (selection ${safeSelection}s).`,
      });
    }
  });

  socket.on('player:answer', ({ optionId }) => {
    if (game.status !== 'question' || !game.question) return;
    const player = players.get(socket.id);
    if (!player) return;
    if (game.answers.has(player.id)) return;

    const chosen = game.question.options.find((option) => option.id === optionId);
    if (!chosen) return;

    const remainingSec = Math.max(0, Math.ceil((game.questionEndsAt - Date.now()) / 1000));
    const isCorrect = chosen.isFictive;
    const points = isCorrect ? 10 * remainingSec : 0;

    game.answers.set(player.id, {
      optionId,
      isCorrect,
      points,
      answeredAt: Date.now(),
    });

    player.score += points;
    player.lastAnswer = {
      optionId,
      isCorrect,
      points,
    };

    emitState();
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    emitState();
  });
});

server.listen(PORT, () => {
  console.log(`SMMA game server running on http://localhost:${PORT}`);
  console.log(`Loaded ${questionBank.length} eligible questions from ${dataSourcePath}.`);
});
