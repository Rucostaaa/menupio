const User = require("../models/User");
const {
  DIFFICULTIES,
  generatePuzzle,
  isCorrectSelection,
} = require("./wordSearch");

const activePuzzles = new Map();

const acknowledge = (callback, response) => {
  if (typeof callback === "function") callback(response);
};

const getPublicPuzzle = (puzzle) => ({
  puzzleId: puzzle.puzzleId,
  difficulty: puzzle.difficulty,
  grid: puzzle.grid,
  words: puzzle.words,
  timeLimitSeconds: puzzle.timeLimitSeconds,
});

const finishPuzzle = async (socket, game, timedOut = false) => {
  if (game.finished) return;
  game.finished = true;
  clearTimeout(game.timer);

  try {
    const updatedUser = await User.findByIdAndUpdate(
      game.userId,
      {
        $inc: { "games.wordSearch.played": 1 },
        $max: { "games.wordSearch.bestScore": game.score },
      },
      { new: true, projection: { "games.wordSearch": 1 } },
    );
    socket.emit("wordSearch:finished", {
      puzzleId: game.puzzleId,
      score: game.score,
      foundWords: game.foundWordIds.length,
      totalWords: game.words.length,
      timedOut,
      bestScore: updatedUser?.games?.wordSearch?.bestScore ?? game.score,
    });
  } catch (error) {
    console.error("WORD SEARCH PERSISTENCE ERROR:", error);
    socket.emit("wordSearch:error", {
      message: "O jogo terminou, mas não foi possível guardar o resultado.",
    });
    socket.emit("wordSearch:finished", {
      puzzleId: game.puzzleId,
      score: game.score,
      foundWords: game.foundWordIds.length,
      totalWords: game.words.length,
      timedOut,
      persistenceFailed: true,
    });
  } finally {
    activePuzzles.delete(socket.id);
    delete socket.data.wordSearchPuzzleId;
  }
};

const attachWordSearchSocket = (io, socket) => {
  socket.on("wordSearch:start", (data = {}, callback) => {
    if (!socket.user?._id) {
      acknowledge(callback, {
        success: false,
        message: "Inicia sessão para jogar à Sopa de Letras.",
      });
      return;
    }
    if (socket.data.bellumMatchId || socket.data.mixedMathQuizId) {
      acknowledge(callback, {
        success: false,
        message: "Termina o jogo atual antes de começares a Sopa de Letras.",
      });
      return;
    }
    if (activePuzzles.has(socket.id)) {
      acknowledge(callback, {
        success: false,
        message: "Já tens uma Sopa de Letras em curso.",
      });
      return;
    }

    let puzzle;
    try {
      puzzle = generatePuzzle(data.difficulty);
    } catch (error) {
      acknowledge(callback, { success: false, message: error.message });
      return;
    }

    const game = {
      ...puzzle,
      userId: String(socket.user._id),
      foundWordIds: [],
      score: 0,
      startedAt: Date.now(),
      finished: false,
    };
    activePuzzles.set(socket.id, game);
    socket.data.wordSearchPuzzleId = game.puzzleId;
    socket.emit("wordSearch:puzzle", getPublicPuzzle(game));
    acknowledge(callback, { success: true, puzzleId: game.puzzleId });
    game.timer = setTimeout(() => {
      void finishPuzzle(socket, game, true);
    }, game.timeLimitSeconds * 1000);
  });

  socket.on("wordSearch:select", (data = {}, callback) => {
    const game = activePuzzles.get(socket.id);
    if (
      !game ||
      game.finished ||
      data.puzzleId !== game.puzzleId ||
      socket.data.wordSearchPuzzleId !== game.puzzleId
    ) {
      acknowledge(callback, {
        success: false,
        message: "Esta Sopa de Letras já não está ativa.",
      });
      return;
    }

    const selection = data.cells;
    if (
      !Array.isArray(selection) ||
      selection.length > game.grid.length ||
      selection.some(
        (cell) =>
          !Number.isInteger(cell?.row) ||
          !Number.isInteger(cell?.column) ||
          cell.row < 0 ||
          cell.column < 0 ||
          cell.row >= game.grid.length ||
          cell.column >= game.grid.length,
      )
    ) {
      acknowledge(callback, {
        success: false,
        message: "A seleção de letras não é válida.",
      });
      return;
    }

    const placement = isCorrectSelection(selection, game.placements);
    if (!placement || game.foundWordIds.includes(placement.id)) {
      acknowledge(callback, {
        success: false,
        message: "Essa seleção não corresponde a uma palavra por encontrar.",
      });
      return;
    }

    game.foundWordIds.push(placement.id);
    const remainingSeconds = Math.max(
      0,
      Math.ceil(
        (game.timeLimitSeconds * 1000 - (Date.now() - game.startedAt)) / 1000,
      ),
    );
    game.score += 100 + remainingSeconds;
    socket.emit("wordSearch:found", {
      wordId: placement.id,
      cells: selection,
      score: game.score,
      foundWordIds: game.foundWordIds,
      remainingSeconds,
    });
    acknowledge(callback, { success: true });

    if (game.foundWordIds.length === game.words.length) {
      void finishPuzzle(socket, game);
    }
  });

  socket.on("wordSearch:cancel", (callback) => {
    const game = activePuzzles.get(socket.id);
    if (game) {
      game.finished = true;
      clearTimeout(game.timer);
      activePuzzles.delete(socket.id);
    }
    delete socket.data.wordSearchPuzzleId;
    acknowledge(callback, { success: true });
  });

  socket.on("disconnect", () => {
    const game = activePuzzles.get(socket.id);
    if (game) {
      game.finished = true;
      clearTimeout(game.timer);
      activePuzzles.delete(socket.id);
    }
  });
};

module.exports = { attachWordSearchSocket };
