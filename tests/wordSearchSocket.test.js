const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const { attachWordSearchSocket } = require("../utils/wordSearchSocket");
const { normalizeWord } = require("../utils/wordSearch");

const createSocket = (id, user) => {
  const handlers = new Map();
  const received = [];
  return {
    id,
    user,
    data: {},
    received,
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, payload) {
      received.push({ event, payload });
    },
    trigger(event, ...args) {
      handlers.get(event)(...args);
    },
  };
};

const withFakeTimers = async (run) => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = [];
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = (timer) => {
    if (timer) timer.cleared = true;
  };
  const runNext = (delay) => {
    const index = timers.findIndex(
      (timer) => timer.delay === delay && !timer.cleared,
    );
    assert.notEqual(index, -1, `expected an active ${delay}ms timer`);
    const [timer] = timers.splice(index, 1);
    timer.callback();
  };

  try {
    await run(runNext);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
};

const findPath = (grid, word) => {
  const target = normalizeWord(word);
  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (let row = 0; row < grid.length; row += 1) {
    for (let column = 0; column < grid.length; column += 1) {
      for (const [rowStep, columnStep] of directions) {
        const cells = Array.from({ length: target.length }, (_, index) => ({
          row: row + rowStep * index,
          column: column + columnStep * index,
        }));
        if (
          cells.every(
            (cell) =>
              cell.row >= 0 &&
              cell.row < grid.length &&
              cell.column >= 0 &&
              cell.column < grid.length,
          ) &&
          cells.map((cell) => grid[cell.row][cell.column]).join("") === target
        ) {
          return cells;
        }
      }
    }
  }
  return null;
};

test("validates found paths on the server and persists a completed puzzle", async () => {
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  let persistenceCall;
  User.findByIdAndUpdate = async (...args) => {
    persistenceCall = args;
    return { games: { wordSearch: { bestScore: 900 } } };
  };

  try {
    await withFakeTimers(async () => {
      const player = createSocket("word-player", { _id: "word-user" });
      attachWordSearchSocket({}, player);

      let startResponse;
      player.trigger("wordSearch:start", { difficulty: "easy" }, (response) => {
        startResponse = response;
      });
      assert.equal(startResponse.success, true);
      const puzzle = player.received.find(
        (event) => event.event === "wordSearch:puzzle",
      ).payload;
      assert.equal(puzzle.words.length, 5);
      assert.equal(Object.hasOwn(puzzle, "placements"), false);
      assert.equal(player.data.wordSearchPuzzleId, puzzle.puzzleId);

      let invalidResponse;
      player.trigger(
        "wordSearch:select",
        {
          puzzleId: puzzle.puzzleId,
          cells: [{ row: -1, column: 0 }, { row: 0, column: 0 }],
        },
        (response) => {
          invalidResponse = response;
        },
      );
      assert.equal(invalidResponse.success, false);

      for (const word of puzzle.words) {
        let selectionResponse;
        player.trigger(
          "wordSearch:select",
          {
            puzzleId: puzzle.puzzleId,
            cells: findPath(puzzle.grid, word.text),
          },
          (response) => {
            selectionResponse = response;
          },
        );
        assert.equal(selectionResponse.success, true);
      }

      await new Promise((resolve) => setImmediate(resolve));
      const result = player.received.find(
        (event) => event.event === "wordSearch:finished",
      );
      assert.equal(result.payload.foundWords, 5);
      assert.equal(result.payload.totalWords, 5);
      assert.equal(result.payload.bestScore, 900);
      assert.equal(persistenceCall[0], "word-user");
      assert.equal(persistenceCall[1].$inc["games.wordSearch.played"], 1);
      assert.equal(player.data.wordSearchPuzzleId, undefined);
    });
  } finally {
    User.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

