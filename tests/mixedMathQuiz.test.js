const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GRADE_TOPICS,
  GRADES,
  QUESTION_COUNT,
  TOPICS,
  generateQuestion,
  generateQuestionForTopic,
} = require("../utils/mixedMathQuiz");

const seededRandom = (seed) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
};

test("offers multiple-choice questions across Portuguese school years 5 to 12", () => {
  const seenTopics = new Set();

  for (const grade of GRADES) {
    assert.ok(GRADE_TOPICS[grade].length >= 5);
    for (const topic of GRADE_TOPICS[grade]) {
      seenTopics.add(topic);
      for (let seed = 1; seed <= 12; seed += 1) {
        const question = generateQuestionForTopic(
          topic,
          grade,
          seededRandom(seed * 31 + grade),
        );
        assert.equal(question.grade, grade);
        assert.equal(question.topic, topic);
        assert.equal(question.topicLabel, TOPICS[topic]);
        assert.equal(question.options.length, 4, `${grade}º ano: ${topic}`);
        assert.equal(
          new Set(question.options.map((option) => option.label)).size,
          4,
          `${grade}º ano: ${topic}`,
        );
        assert.ok(
          question.options.some(
            (option) => option.id === question.correctOptionId,
          ),
        );
        assert.ok(question.explanation.length > 0);
        assert.equal(Object.hasOwn(question, "answer"), false);
      }
    }
  }

  for (const topic of Object.keys(TOPICS)) {
    assert.ok(seenTopics.has(topic), `${topic} is not covered by any grade`);
  }
});

test("mixed questions stay within the selected grade and rotate grade-appropriate topics", () => {
  for (const grade of GRADES) {
    const random = seededRandom(grade);
    for (let questionNumber = 1; questionNumber <= QUESTION_COUNT; questionNumber += 1) {
      const question = generateQuestion("medium", questionNumber, random, grade);
      assert.equal(question.questionNumber, questionNumber);
      assert.equal(question.grade, grade);
      assert.ok(GRADE_TOPICS[grade].includes(question.topic));
      assert.equal(question.timeLimitSeconds, 15);
    }
  }
});

test("includes graph exercises for function graphs and statistical data", () => {
  const graphQuestion = generateQuestionForTopic(
    "functionGraph",
    12,
    seededRandom(1234),
  );
  const statisticsQuestion = generateQuestionForTopic(
    "statistics",
    6,
    seededRandom(4321),
  );

  assert.ok(["line", "parabola"].includes(graphQuestion.graph.kind));
  assert.equal(statisticsQuestion.graph.kind, "bars");
  assert.equal(statisticsQuestion.graph.bars.length, 4);
  assert.match(statisticsQuestion.prompt, /gráfico/i);
});

test("covers high-school calculus, inequalities, trigonometry, and logarithms", () => {
  const random = () => 0.5;
  const inequality = generateQuestionForTopic("inequalities", 9, random);
  const trig = generateQuestionForTopic("trigonometry", 11, random);
  const derivative = generateQuestionForTopic("derivatives", 12, random);
  const primitive = generateQuestionForTopic("primitives", 12, random);
  const area = generateQuestionForTopic("integralArea", 12, random);
  const logarithm = generateQuestionForTopic(
    "exponentialLogarithmic",
    11,
    random,
  );

  assert.match(inequality.prompt, /inequação/i);
  assert.match(trig.prompt, /sen|cos/);
  assert.match(derivative.prompt, /f'/);
  assert.match(primitive.prompt, /primitiva/i);
  assert.match(area.prompt, /área/i);
  assert.match(logarithm.prompt, /log|\^/);
});

test("includes systems, spatial geometry, combinatorics, vectors, and complex numbers", () => {
  const random = seededRandom(2026);
  const topics = [
    ["solidGeometry", 6],
    ["systems", 9],
    ["combinatorics", 10],
    ["vectors", 11],
    ["complexNumbers", 12],
  ];

  for (const [topic, grade] of topics) {
    const question = generateQuestionForTopic(topic, grade, random);
    assert.equal(question.topic, topic);
    assert.equal(question.options.length, 4);
    assert.ok(
      question.options.some((option) => option.label === question.answerLabel),
    );
  }
});

test("rejects topics outside the selected grade", () => {
  assert.throws(
    () => generateQuestionForTopic("derivatives", 10),
    /not available for grade/,
  );
  assert.throws(() => generateQuestion("medium", 1, Math.random, 13), /grade/);
});
