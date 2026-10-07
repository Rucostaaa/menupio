const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DIFFICULTIES,
  createChallenge,
  evaluateExpression,
} = require("../utils/bellumNumerus");

test("validates precedence and requires each challenge number exactly once", () => {
  assert.deepEqual(evaluateExpression("2 + 3 * 4", [2, 3, 4]), {
    valid: true,
    value: 14,
  });
  assert.deepEqual(evaluateExpression("(8 + 4) / 3", [8, 4, 3]), {
    valid: true,
    value: 4,
  });
  assert.equal(evaluateExpression("2 + 2", [2, 3]).valid, false);
  assert.equal(evaluateExpression("2 + 3", [2, 3, 4]).valid, false);
  assert.equal(evaluateExpression("2 / (3 - 3)", [2, 3, 3]).valid, false);
  assert.equal(evaluateExpression("2 + process.exit()", [2, 3]).valid, false);
});

test("generates a solvable target at every difficulty", () => {
  for (const [difficulty, rules] of Object.entries(DIFFICULTIES)) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const challenge = createChallenge(difficulty);
      assert.equal(challenge.numbers.length, rules.numberCount);
      assert.equal(challenge.timeLimitSeconds, rules.timeLimitSeconds);
      assert.equal(
        evaluateExpression(challenge.solution, challenge.numbers).value,
        challenge.target,
      );
    }
  }
});
