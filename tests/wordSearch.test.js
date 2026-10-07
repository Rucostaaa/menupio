const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DIFFICULTIES,
  WORD_BANK,
  generatePuzzle,
  isCorrectSelection,
  normalizeWord,
} = require("../utils/wordSearch");

const seededRandom = (seed) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
};

test("generates complete grids and every listed word has a matching straight path", () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 1; seed <= 30; seed += 1) {
      const puzzle = generatePuzzle(difficulty, seededRandom(seed * 19));
      assert.equal(puzzle.grid.length, DIFFICULTIES[difficulty].size);
      assert.ok(puzzle.grid.every((row) => row.length === puzzle.grid.length));
      assert.equal(puzzle.words.length, DIFFICULTIES[difficulty].wordCount);
      assert.equal(puzzle.placements.length, puzzle.words.length);
      assert.equal(
        puzzle.grid.flat().every((letter) => /^[A-Z]$/.test(letter)),
        true,
      );

      for (const placement of puzzle.placements) {
        const found = placement.path
          .map(({ row, column }) => puzzle.grid[row][column])
          .join("");
        assert.equal(found, normalizeWord(placement.text));
        assert.equal(
          isCorrectSelection(placement.path, puzzle.placements)?.id,
          placement.id,
        );
        assert.equal(
          isCorrectSelection([...placement.path].reverse(), puzzle.placements)?.id,
          placement.id,
        );
      }
    }
  }
});

test("normalizes Portuguese accents and rejects an invalid difficulty", () => {
  assert.equal(normalizeWord("TRIGONOMETRIA"), "TRIGONOMETRIA");
  assert.equal(normalizeWord("FRAÇÃO"), "FRACAO");
  assert.throws(() => generatePuzzle("impossible"), /difficulty/);
  assert.ok(WORD_BANK.includes("FRAÇÃO"));
});

