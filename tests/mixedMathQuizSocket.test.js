const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const { GRADE_TOPICS } = require("../utils/mixedMathQuiz");
const {
  attachMixedMathQuizSocket,
} = require("../utils/mixedMathQuizSocket");

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
    const timer = { callback, delay, cleared: false, unref() { return this; } };
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

test("requires an authenticated player and validates quiz answers server-side", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalRandom = Math.random;
  global.setTimeout = () => ({ unref() { return this; } });
  global.clearTimeout = () => {};
  Math.random = () => 0.3;

  try {
    const player = createSocket("player", { _id: "user-quiz", name: "Quizzer" });
    const anonymous = createSocket("anonymous", null);
    attachMixedMathQuizSocket({}, player);
    attachMixedMathQuizSocket({}, anonymous);

    let anonymousResponse;
    anonymous.trigger("mathQuiz:start", { difficulty: "easy" }, (response) => {
      anonymousResponse = response;
    });
    assert.equal(anonymousResponse.success, false);

    let startResponse;
    player.trigger(
      "mathQuiz:start",
      { difficulty: "medium", grade: 12 },
      (response) => {
        startResponse = response;
      },
    );
    assert.equal(startResponse.success, true);

    const question = player.received.find(
      (event) => event.event === "mathQuiz:question",
    ).payload;
    assert.equal(question.grade, 12);
    assert.ok(GRADE_TOPICS[12].includes(question.topic));
    assert.equal(question.options.length, 4);
    assert.equal(Object.hasOwn(question, "correctOptionId"), false);
    assert.equal(Object.hasOwn(question, "answerLabel"), false);
    assert.equal(Object.hasOwn(question, "explanation"), false);
    assert.equal(question.graph.kind, "parabola");
    assert.equal(Object.hasOwn(question.graph, "vertexX"), false);
    assert.equal(Object.hasOwn(question.graph, "vertexY"), false);
    assert.equal(Object.hasOwn(question.graph, "slope"), false);
    assert.equal(Object.hasOwn(question.graph, "intercept"), false);

    player.trigger("mathQuiz:cancel", () => {});
    let invalidGradeResponse;
    player.trigger(
      "mathQuiz:start",
      { difficulty: "medium", grade: 13 },
      (response) => {
        invalidGradeResponse = response;
      },
    );
    assert.equal(invalidGradeResponse.success, false);

    player.trigger("mathQuiz:start", { difficulty: "medium", grade: 12 }, (response) => {
      startResponse = response;
    });
    const activeQuestion = player.received
      .filter((event) => event.event === "mathQuiz:question")
      .at(-1).payload;

    let invalidResponse;
    player.trigger(
      "mathQuiz:answer",
      {
        quizId: startResponse.quizId,
        questionNumber: 1,
        optionId: "not-an-option",
      },
      (response) => {
        invalidResponse = response;
      },
    );
    assert.equal(invalidResponse.success, false);

    let answerResponse;
    player.trigger(
      "mathQuiz:answer",
      {
        quizId: startResponse.quizId,
        questionNumber: 1,
        optionId: activeQuestion.options[0].id,
      },
      (response) => {
        answerResponse = response;
      },
    );
    assert.equal(answerResponse.success, true);
    const answerResult = player.received.find(
      (event) => event.event === "mathQuiz:answerResult",
    ).payload;
    assert.equal(answerResult.questionNumber, 1);
    assert.equal(typeof answerResult.correct, "boolean");

    let duplicateResponse;
    player.trigger(
      "mathQuiz:answer",
      {
        quizId: startResponse.quizId,
        questionNumber: 1,
        optionId: activeQuestion.options[1].id,
      },
      (response) => {
        duplicateResponse = response;
      },
    );
    assert.equal(duplicateResponse.success, false);
    player.trigger("mathQuiz:cancel", () => {});
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    Math.random = originalRandom;
  }
});

test("marks unanswered questions as timeouts", async () => {
  await withFakeTimers(async (runNext) => {
    const player = createSocket("timed-player", { _id: "timed-user" });
    attachMixedMathQuizSocket({}, player);

    player.trigger("mathQuiz:start", { difficulty: "easy" }, () => {});
    runNext(20000);

    const timeout = player.received.find(
      (event) => event.event === "mathQuiz:answerResult",
    );
    assert.equal(timeout.payload.timedOut, true);
    assert.equal(timeout.payload.correct, false);
    assert.equal(timeout.payload.selectedOptionId, null);

    player.trigger("mathQuiz:cancel", () => {});
  });
});

test("completes ten questions and persists aggregate quiz stats", async () => {
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  let persistenceCall;
  User.findByIdAndUpdate = async (...args) => {
    persistenceCall = args;
    return { games: { mixedMathQuiz: { bestScore: 650 } } };
  };

  try {
    await withFakeTimers(async (runNext) => {
      const player = createSocket("complete-player", {
        _id: "complete-user",
      });
      attachMixedMathQuizSocket({}, player);
      player.trigger("mathQuiz:start", { difficulty: "medium" }, () => {});
      const quizId = player.received.find(
        (event) => event.event === "mathQuiz:started",
      ).payload.quizId;

      for (let questionNumber = 1; questionNumber <= 10; questionNumber += 1) {
        if (questionNumber > 1) runNext(1200);
        const question = player.received
          .filter((event) => event.event === "mathQuiz:question")
          .at(-1).payload;
        player.trigger(
          "mathQuiz:answer",
          {
            quizId,
            questionNumber,
            optionId: question.options[0].id,
          },
          () => {},
        );
      }

      runNext(1200);
      await new Promise((resolve) => setImmediate(resolve));
      const finished = player.received.find(
        (event) => event.event === "mathQuiz:finished",
      );
      assert.equal(finished.payload.totalQuestions, 10);
      assert.equal(finished.payload.questionsAnswered, 10);
      assert.equal(finished.payload.persistenceFailed, undefined);
      assert.equal(finished.payload.bestScore, 650);
      assert.equal(persistenceCall[0], "complete-user");
      assert.equal(persistenceCall[1].$inc["games.mixedMathQuiz.played"], 1);
      assert.equal(persistenceCall[1].$inc["games.mixedMathQuiz.questionsAnswered"], 10);
    });
  } finally {
    User.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});
