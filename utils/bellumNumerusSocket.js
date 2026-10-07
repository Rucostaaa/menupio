const { randomUUID } = require("crypto");
const BellumMatch = require("../models/BellumMatch");
const User = require("../models/User");
const {
  createChallenge,
  DIFFICULTIES,
  evaluateExpression,
} = require("./bellumNumerus");

const STARTING_HEALTH = 100;
const ROUND_PAUSE_MS = 1400;
const BOT_THINK_TIME_MS = {
  easy: [10_000, 17_000],
  medium: [6_000, 12_000],
  hard: [3_000, 8_000],
};
const MATCHMAKING = new Map(
  Object.keys(DIFFICULTIES).map((difficulty) => [difficulty, []]),
);
const matches = new Map();

const acknowledge = (callback, response) => {
  if (typeof callback === "function") {
    callback(response);
  }
};

const removeFromQueue = (socket) => {
  const difficulty = socket.data.bellumDifficulty;
  const queue = MATCHMAKING.get(difficulty);
  if (queue) {
    MATCHMAKING.set(
      difficulty,
      queue.filter((socketId) => socketId !== socket.id),
    );
  }
  delete socket.data.bellumDifficulty;
};

const playerStateFor = (match, userId) => {
  const player = match.players.get(userId);
  const opponent = [...match.players.values()].find(
    (entry) => entry.userId !== userId,
  );
  return {
    matchId: match.matchId,
    difficulty: match.difficulty,
    roundNumber: match.roundNumber,
    player: {
      userId,
      name: player.name,
      health: player.health,
      score: player.score,
      combo: player.combo,
    },
    opponent: {
      userId: opponent.isBot ? null : opponent.userId,
      name: opponent.name,
      health: opponent.health,
      score: opponent.score,
      isBot: opponent.isBot,
    },
  };
};

const broadcastState = (io, match) => {
  for (const player of match.players.values()) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit(
      "bellum:state",
      playerStateFor(match, player.userId),
    );
  }
};

const finishMatch = async (io, match, winnerId, result) => {
  if (match.finished) return;
  match.finished = true;
  clearTimeout(match.roundTimer);
  clearTimeout(match.advanceTimer);

  const finishedAt = new Date();
  const playerData = [...match.players.values()].map((player) => ({
    ...(player.isBot ? {} : { user: player.userId }),
    name: player.name,
    isBot: player.isBot,
    score: player.score,
    remainingHealth: player.health,
  }));

  try {
    const winner = winnerId ? match.players.get(winnerId) : null;
    await BellumMatch.create({
      matchId: match.matchId,
      difficulty: match.difficulty,
      players: playerData,
      winner: winner && !winner.isBot ? winner.userId : null,
      winnerIsBot: Boolean(winner?.isBot),
      winnerName: winner?.name || "",
      result,
      rounds: match.rounds.map((round) => {
        const roundWinner = round.winner
          ? match.players.get(round.winner)
          : null;
        return {
          ...round,
          winner:
            roundWinner && !roundWinner.isBot ? roundWinner.userId : null,
        };
      }),
      startedAt: match.startedAt,
      finishedAt,
    });

    for (const player of match.players.values()) {
      if (player.isBot) continue;
      const isWinner = winnerId === player.userId;
      const isDraw = result === "draw";
      const increments = { "games.bellumNumerus.matches": 1 };
      if (isDraw) increments["games.bellumNumerus.draws"] = 1;
      else if (isWinner) increments["games.bellumNumerus.wins"] = 1;
      else increments["games.bellumNumerus.losses"] = 1;

      const updatedUser = await User.findByIdAndUpdate(
        player.userId,
        { $inc: increments },
        { new: true, projection: { "games.bellumNumerus": 1 } },
      );

      const trophies = [];
      const stats = updatedUser?.games?.bellumNumerus;
      if (stats?.matches === 1) trophies.push("first-match");
      if (isWinner && stats?.wins === 1) trophies.push("first-victory");
      if (isWinner && stats?.wins === 5) trophies.push("five-victories");
      if (isWinner && stats?.wins === 25) {
        trophies.push("twenty-five-victories");
      }

      if (trophies.length) {
        await User.updateOne(
          { _id: player.userId },
          {
            $addToSet: {
              "games.bellumNumerus.trophies": { $each: trophies },
            },
          },
        );
      }
    }

    for (const player of match.players.values()) {
      if (!player.socketId) continue;
      const stats = await User.findById(player.userId)
        .select("games.bellumNumerus")
        .lean();
      io.to(player.socketId).emit("bellum:matchFinished", {
        matchId: match.matchId,
        result,
        winnerId: winner?.isBot ? null : winnerId,
        winnerName: winner?.name || "",
        winnerIsBot: Boolean(winner?.isBot),
        playerId: player.userId,
        score: player.score,
        opponentScore: [...match.players.values()].find(
          (entry) => entry.userId !== player.userId,
        ).score,
        trophies: stats?.games?.bellumNumerus?.trophies || [],
      });
    }
  } catch (error) {
    console.error("BELLUM NUMERUS PERSISTENCE ERROR:", error);
    for (const player of match.players.values()) {
      if (!player.socketId) continue;
      io.to(player.socketId).emit("bellum:error", {
        message:
          "The match ended, but its result could not be saved. Please contact support.",
      });
      io.to(player.socketId).emit("bellum:matchFinished", {
        matchId: match.matchId,
        result,
        winnerId: winnerId && !match.players.get(winnerId)?.isBot
          ? winnerId
          : null,
        winnerName: match.players.get(winnerId)?.name || "",
        winnerIsBot: Boolean(match.players.get(winnerId)?.isBot),
        playerId: player.userId,
        score: player.score,
        opponentScore: [...match.players.values()].find(
          (entry) => entry.userId !== player.userId,
        ).score,
        trophies: [],
        persistenceFailed: true,
      });
    }
  } finally {
    for (const player of match.players.values()) {
      const socket = player.socketId
        ? io.sockets.sockets.get(player.socketId)
        : null;
      if (socket) {
        socket.leave(`bellum:${match.matchId}`);
        delete socket.data.bellumMatchId;
      }
    }
    setTimeout(() => matches.delete(match.matchId), 60_000).unref?.();
  }
};

const startRound = (io, match) => {
  if (match.finished) return;
  match.roundNumber += 1;
  const challenge = createChallenge(match.difficulty);
  match.activeRound = {
    roundId: randomUUID(),
    target: challenge.target,
    numbers: challenge.numbers,
    solution: challenge.solution,
    startedAt: Date.now(),
    deadlineAt: Date.now() + challenge.timeLimitSeconds * 1000,
    damage: challenge.damage,
    hitDamage: challenge.hitDamage,
    timeLimitSeconds: challenge.timeLimitSeconds,
    locked: false,
  };

  broadcastState(io, match);
  const publicChallenge = {
    matchId: match.matchId,
    roundId: match.activeRound.roundId,
    roundNumber: match.roundNumber,
    numbers: match.activeRound.numbers,
    target: match.activeRound.target,
    difficulty: match.difficulty,
    timeLimitSeconds: match.activeRound.timeLimitSeconds,
    remainingMs: Math.max(0, match.activeRound.deadlineAt - Date.now()),
  };
  for (const player of match.players.values()) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit("bellum:round", publicChallenge);
  }

  const activeRoundId = match.activeRound.roundId;
  if (match.isBotMatch) {
    const [minimum, maximum] = BOT_THINK_TIME_MS[match.difficulty];
    const delay = Math.floor(
      minimum + Math.random() * (maximum - minimum + 1),
    );
    match.botTimer = setTimeout(() => {
      if (
        match.finished ||
        match.activeRound?.roundId !== activeRoundId ||
        match.activeRound.locked
      ) {
        return;
      }
      resolveSubmission(io, match, match.botUserId, match.activeRound.solution);
    }, delay);
  }
  match.roundTimer = setTimeout(() => {
    if (
      match.finished ||
      match.activeRound?.roundId !== activeRoundId ||
      match.activeRound.locked
    ) {
      return;
    }
    match.activeRound.locked = true;
    const damage = match.activeRound.damage;
    for (const player of match.players.values()) {
      player.health = Math.max(0, player.health - damage);
      player.combo = 0;
    }
    match.rounds.push({
      roundNumber: match.roundNumber,
      target: match.activeRound.target,
      result: "timeout",
      damage,
      elapsedMs: match.activeRound.timeLimitSeconds * 1000,
    });
    finishRound(io, match, {
      result: "timeout",
      message: "Time expired. Both players take damage.",
    });
  }, challenge.timeLimitSeconds * 1000);
};

const finishRound = (io, match, outcome) => {
  clearTimeout(match.roundTimer);
  clearTimeout(match.botTimer);
  broadcastState(io, match);
  for (const player of match.players.values()) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit("bellum:roundResult", outcome);
  }

  const defeated = [...match.players.values()].filter(
    (player) => player.health <= 0,
  );
  if (defeated.length === 2) {
    void finishMatch(io, match, null, "draw");
    return;
  }
  if (defeated.length === 1) {
    const winner = [...match.players.values()].find(
      (player) => player.userId !== defeated[0].userId,
    );
    void finishMatch(io, match, winner.userId, "win");
    return;
  }

  match.advanceTimer = setTimeout(() => startRound(io, match), ROUND_PAUSE_MS);
};

const resolveSubmission = (io, match, userId, expression) => {
  const round = match.activeRound;
  if (!round || round.locked || Date.now() > round.deadlineAt) return false;

  round.locked = true;
  clearTimeout(match.roundTimer);
  clearTimeout(match.botTimer);

  const player = match.players.get(userId);
  const opponent = [...match.players.values()].find(
    (entry) => entry.userId !== userId,
  );
  const elapsedMs = Math.max(0, Date.now() - round.startedAt);
  const answer = evaluateExpression(expression, round.numbers);
  const correct =
    answer.valid && Math.abs(answer.value - round.target) < 1e-9;

  if (correct) {
    player.combo += 1;
    player.score += 100 + player.combo * 10;
    opponent.health = Math.max(0, opponent.health - round.hitDamage);
    match.rounds.push({
      roundNumber: match.roundNumber,
      target: round.target,
      winner: player.userId,
      result: "solved",
      damage: round.hitDamage,
      elapsedMs,
    });
  } else {
    player.combo = 0;
    player.health = Math.max(0, player.health - round.damage);
    match.rounds.push({
      roundNumber: match.roundNumber,
      target: round.target,
      result: "incorrect",
      damage: round.damage,
      elapsedMs,
    });
  }

  finishRound(io, match, {
    result: correct ? "solved" : "incorrect",
    message: correct
      ? `${player.name} solved it first!`
      : `${player.name} missed and takes ${round.damage} damage.`,
    submittedBy: player.isBot ? null : player.userId,
    correct,
    damage: correct ? round.hitDamage : round.damage,
  });
  return correct;
};

const createMatch = (io, firstSocket, secondSocket, difficulty, botUserId = "") => {
  const matchId = randomUUID();
  const humanUserId = String(firstSocket.user._id);
  const botMatch = Boolean(botUserId);
  const players = new Map([
    [
      humanUserId,
      {
        userId: humanUserId,
        name: firstSocket.user.name || "Player",
        socketId: firstSocket.id,
        isBot: false,
        health: STARTING_HEALTH,
        score: 0,
        combo: 0,
      },
    ],
  ]);
  firstSocket.data.bellumMatchId = matchId;
  firstSocket.join(`bellum:${matchId}`);
  if (botMatch) {
    players.set(botUserId, {
      userId: botUserId,
      name: "Numerus Bot",
      socketId: null,
      isBot: true,
      health: STARTING_HEALTH,
      score: 0,
      combo: 0,
    });
  } else {
    const secondUserId = String(secondSocket.user._id);
    players.set(secondUserId, {
      userId: secondUserId,
      name: secondSocket.user.name || "Player",
      socketId: secondSocket.id,
      isBot: false,
      health: STARTING_HEALTH,
      score: 0,
      combo: 0,
    });
    secondSocket.data.bellumMatchId = matchId;
    secondSocket.join(`bellum:${matchId}`);
  }
  const match = {
    matchId,
    difficulty,
    players,
    isBotMatch: botMatch,
    botUserId: botMatch ? botUserId : "",
    startedAt: new Date(),
    roundNumber: 0,
    activeRound: null,
    rounds: [],
    finished: false,
  };
  matches.set(matchId, match);

  const humanSockets = botMatch ? [firstSocket] : [firstSocket, secondSocket];
  for (const socket of humanSockets) {
    const ownId = String(socket.user._id);
    const opponent = [...players.values()].find(
      (player) => player.userId !== ownId,
    );
    socket.emit("bellum:matchFound", {
      matchId,
      difficulty,
      player: { userId: ownId, name: socket.user.name || "Player" },
      opponent: {
        userId: opponent.isBot ? null : opponent.userId,
        name: opponent.name,
        isBot: opponent.isBot,
      },
      mode: opponent.isBot ? "bot" : "player",
      startingHealth: STARTING_HEALTH,
    });
  }

  startRound(io, match);
};

const attachBellumNumerusSocket = (io, socket) => {
  socket.on("bellum:queue", (data = {}, callback) => {
    if (!socket.user?._id) {
      acknowledge(callback, {
        success: false,
        message: "Sign in to play Bellum Numerus.",
      });
      return;
    }
    if (socket.data.bellumMatchId) {
      acknowledge(callback, {
        success: false,
        message: "You are already in a match.",
      });
      return;
    }

    const difficulty = data.difficulty;
    if (!Object.hasOwn(DIFFICULTIES, difficulty)) {
      acknowledge(callback, {
        success: false,
        message: "Choose easy, medium, or hard difficulty.",
      });
      return;
    }

    if (socket.data.bellumDifficulty) removeFromQueue(socket);
    const queue = MATCHMAKING.get(difficulty);
    const opponentSocketId = queue.find((socketId) => {
      const candidate = io.sockets.sockets.get(socketId);
      return (
        candidate?.connected &&
        candidate.id !== socket.id &&
        String(candidate.user?._id || "") !== String(socket.user._id)
      );
    });
    if (!opponentSocketId) {
      queue.push(socket.id);
      socket.data.bellumDifficulty = difficulty;
      acknowledge(callback, { success: true, queued: true });
      return;
    }

    MATCHMAKING.set(
      difficulty,
      queue.filter((socketId) => socketId !== opponentSocketId),
    );
    const opponentSocket = io.sockets.sockets.get(opponentSocketId);
    if (!opponentSocket) {
      queue.push(socket.id);
      socket.data.bellumDifficulty = difficulty;
      acknowledge(callback, { success: true, queued: true });
      return;
    }

    delete opponentSocket.data.bellumDifficulty;
    acknowledge(callback, { success: true, queued: false, matched: true });
    createMatch(io, opponentSocket, socket, difficulty);
  });

  socket.on("bellum:bot", (data = {}, callback) => {
    if (!socket.user?._id) {
      acknowledge(callback, {
        success: false,
        message: "Sign in to play Bellum Numerus.",
      });
      return;
    }
    if (socket.data.bellumMatchId) {
      acknowledge(callback, {
        success: false,
        message: "You are already in a match.",
      });
      return;
    }

    const difficulty = data.difficulty;
    if (!Object.hasOwn(DIFFICULTIES, difficulty)) {
      acknowledge(callback, {
        success: false,
        message: "Choose easy, medium, or hard difficulty.",
      });
      return;
    }

    if (socket.data.bellumDifficulty) removeFromQueue(socket);
    acknowledge(callback, { success: true, matched: true, opponent: "bot" });
    createMatch(io, socket, null, difficulty, `bot:${randomUUID()}`);
  });

  socket.on("bellum:cancelQueue", (callback) => {
    removeFromQueue(socket);
    acknowledge(callback, { success: true });
  });

  socket.on("bellum:submit", (data = {}, callback) => {
    const match = matches.get(String(data.matchId || ""));
    const userId = String(socket.user?._id || "");
    if (
      !match ||
      match.finished ||
      !match.players.has(userId) ||
      socket.data.bellumMatchId !== match.matchId
    ) {
      acknowledge(callback, {
        success: false,
        message: "This match is no longer active.",
      });
      return;
    }
    const round = match.activeRound;
    if (
      !round ||
      round.roundId !== data.roundId ||
      round.locked ||
      Date.now() > round.deadlineAt
    ) {
      acknowledge(callback, {
        success: false,
        message: "This round is locked or has expired.",
      });
      return;
    }

    const correct = resolveSubmission(io, match, userId, data.expression);
    acknowledge(callback, { success: true, correct });
  });

  socket.on("bellum:forfeit", (callback) => {
    const match = matches.get(String(socket.data.bellumMatchId || ""));
    const userId = String(socket.user?._id || "");
    if (!match || match.finished || !match.players.has(userId)) {
      acknowledge(callback, { success: false, message: "No active match." });
      return;
    }
    const winner = [...match.players.values()].find(
      (player) => player.userId !== userId,
    );
    acknowledge(callback, { success: true });
    void finishMatch(io, match, winner.userId, "forfeit");
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket);
    const match = matches.get(String(socket.data.bellumMatchId || ""));
    const userId = String(socket.user?._id || "");
    if (!match || match.finished || !match.players.has(userId)) return;
    const winner = [...match.players.values()].find(
      (player) => player.userId !== userId,
    );
    void finishMatch(io, match, winner.userId, "forfeit");
  });
};

module.exports = { attachBellumNumerusSocket };
