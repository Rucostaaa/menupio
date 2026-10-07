const { randomUUID } = require("crypto");
const User = require("../models/User");
const { DIFFICULTIES } = require("./bellumNumerus");
const {
  GRADES,
  generateQuestion,
  QUESTION_COUNT,
} = require("./mixedMathQuiz");

const quizzes = new Map();
const NEXT_QUESTION_PAUSE_MS = 1200;

const acknowledge = (callback, response) => {
  if (typeof callback === "function") callback(response);
};

const getPublicGraph = (graph) => {
  if (!graph || graph.kind === "bars") return graph;

  const points = Array.from({ length: 101 }, (_, index) => {
    const x = graph.xMin + (index / 100) * (graph.xMax - graph.xMin);
    const y =
      graph.kind === "parabola"
        ? (x - graph.vertexX) ** 2 + graph.vertexY
        : graph.slope * x + graph.intercept;
    return {
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
    };
  });

  return {
    kind: graph.kind,
    xMin: graph.xMin,
    xMax: graph.xMax,
    yMin: graph.yMin,
    yMax: graph.yMax,
    points,
  };
};

const getPublicQuestion = (question) => ({
  quizId: question.quizId,
  questionNumber: question.questionNumber,
  type: question.type,
  grade: question.grade,
  topic: question.topic,
  topicLabel: question.topicLabel,
  prompt: question.prompt,
  options: question.options,
  graph: getPublicGraph(question.graph),
  timeLimitSeconds: question.timeLimitSeconds,
  remainingMs: Math.max(0, question.deadlineAt - Date.now()),
});

const sendQuestion = (io, socket, quiz) => {
  if (quiz.finished) return;
  const privateQuestion = generateQuestion(
    quiz.difficulty,
    quiz.questionNumber,
    Math.random,
    quiz.grade,
  );
  quiz.activeQuestion = {
    ...privateQuestion,
    quizId: quiz.quizId,
    startedAt: Date.now(),
    deadlineAt: Date.now() + privateQuestion.timeLimitSeconds * 1000,
    locked: false,
  };

  socket.emit("mathQuiz:question", getPublicQuestion(quiz.activeQuestion));

  quiz.questionTimer = setTimeout(() => {
    if (quiz.finished || quiz.activeQuestion.locked) return;
    resolveAnswer(io, socket, quiz, null, true);
  }, privateQuestion.timeLimitSeconds * 1000);
};

const finishQuiz = async (io, socket, quiz) => {
  if (quiz.finished) return;
  quiz.finished = true;
  clearTimeout(quiz.questionTimer);
  clearTimeout(quiz.advanceTimer);

  try {
    const updatedUser = await User.findByIdAndUpdate(
      quiz.userId,
      {
        $inc: {
          "games.mixedMathQuiz.played": 1,
          "games.mixedMathQuiz.questionsAnswered": quiz.answered,
          "games.mixedMathQuiz.correctAnswers": quiz.correctAnswers,
        },
        $max: { "games.mixedMathQuiz.bestScore": quiz.score },
      },
      { new: true, projection: { "games.mixedMathQuiz": 1 } },
    );
    socket.emit("mathQuiz:finished", {
      quizId: quiz.quizId,
      score: quiz.score,
      correctAnswers: quiz.correctAnswers,
      questionsAnswered: quiz.answered,
      totalQuestions: QUESTION_COUNT,
      accuracy: Math.round((quiz.correctAnswers / QUESTION_COUNT) * 100),
      bestScore: updatedUser?.games?.mixedMathQuiz?.bestScore || quiz.score,
    });
  } catch (error) {
    console.error("MIXED MATH QUIZ PERSISTENCE ERROR:", error);
    socket.emit("mathQuiz:error", {
      message:
        "Quiz complete, but your result could not be saved. Please contact support.",
    });
    socket.emit("mathQuiz:finished", {
      quizId: quiz.quizId,
      score: quiz.score,
      correctAnswers: quiz.correctAnswers,
      questionsAnswered: quiz.answered,
      totalQuestions: QUESTION_COUNT,
      accuracy: Math.round((quiz.correctAnswers / QUESTION_COUNT) * 100),
      persistenceFailed: true,
    });
  } finally {
    quizzes.delete(socket.id);
    delete socket.data.mixedMathQuizId;
  }
};

const resolveAnswer = (io, socket, quiz, optionId, timedOut = false) => {
  const question = quiz.activeQuestion;
  if (quiz.finished || !question || question.locked) return false;
  question.locked = true;
  clearTimeout(quiz.questionTimer);

  const correct =
    !timedOut && optionId === question.correctOptionId;
  quiz.answered += 1;
  if (correct) {
    quiz.correctAnswers += 1;
    quiz.streak += 1;
    quiz.score += 100 + Math.min(quiz.streak, 10) * 10;
  } else {
    quiz.streak = 0;
  }

  socket.emit("mathQuiz:answerResult", {
    questionNumber: question.questionNumber,
    correct,
    timedOut,
    selectedOptionId: timedOut ? null : optionId,
    correctOptionId: question.correctOptionId,
    answerLabel: question.answerLabel,
    explanation: question.explanation,
    score: quiz.score,
    correctAnswers: quiz.correctAnswers,
    streak: quiz.streak,
  });

  if (quiz.questionNumber >= QUESTION_COUNT) {
    quiz.advanceTimer = setTimeout(() => {
      void finishQuiz(io, socket, quiz);
    }, NEXT_QUESTION_PAUSE_MS);
    return correct;
  }

  quiz.advanceTimer = setTimeout(() => {
    if (quiz.finished) return;
    quiz.questionNumber += 1;
    sendQuestion(io, socket, quiz);
  }, NEXT_QUESTION_PAUSE_MS);
  return correct;
};

const attachMixedMathQuizSocket = (io, socket) => {
  socket.on("mathQuiz:start", (data = {}, callback) => {
    if (!socket.user?._id) {
      acknowledge(callback, {
        success: false,
        message: "Sign in to play the mixed math quiz.",
      });
      return;
    }
    if (socket.data.bellumMatchId || socket.data.wordSearchPuzzleId) {
      acknowledge(callback, {
        success: false,
        message: "Finish your current duel before starting a quiz.",
      });
      return;
    }
    if (quizzes.has(socket.id)) {
      acknowledge(callback, {
        success: false,
        message: "A quiz is already in progress.",
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

    const grade = Number(data.grade ?? 7);
    if (!GRADES.includes(grade)) {
      acknowledge(callback, {
        success: false,
        message: "Choose a school year from 5.º to 12.º.",
      });
      return;
    }

    const quiz = {
      quizId: randomUUID(),
      userId: String(socket.user._id),
      difficulty,
      grade,
      questionNumber: 1,
      answered: 0,
      correctAnswers: 0,
      score: 0,
      streak: 0,
      activeQuestion: null,
      finished: false,
    };
    quizzes.set(socket.id, quiz);
    socket.data.mixedMathQuizId = quiz.quizId;
    socket.emit("mathQuiz:started", {
      quizId: quiz.quizId,
      difficulty,
      grade,
      totalQuestions: QUESTION_COUNT,
    });
    acknowledge(callback, { success: true, quizId: quiz.quizId });
    sendQuestion(io, socket, quiz);
  });

  socket.on("mathQuiz:answer", (data = {}, callback) => {
    const quiz = quizzes.get(socket.id);
    if (
      !quiz ||
      quiz.finished ||
      data.quizId !== quiz.quizId ||
      socket.data.mixedMathQuizId !== quiz.quizId
    ) {
      acknowledge(callback, {
        success: false,
        message: "This quiz is no longer active.",
      });
      return;
    }

    const question = quiz.activeQuestion;
    if (
      !question ||
      question.locked ||
      data.questionNumber !== question.questionNumber ||
      Date.now() > question.deadlineAt ||
      !question.options.some((option) => option.id === data.optionId)
    ) {
      acknowledge(callback, {
        success: false,
        message: "This question is locked or the answer is invalid.",
      });
      return;
    }

    const correct = resolveAnswer(io, socket, quiz, data.optionId);
    acknowledge(callback, { success: true, correct });
  });

  socket.on("mathQuiz:cancel", (callback) => {
    const quiz = quizzes.get(socket.id);
    if (quiz) {
      quiz.finished = true;
      clearTimeout(quiz.questionTimer);
      clearTimeout(quiz.advanceTimer);
      quizzes.delete(socket.id);
    }
    delete socket.data.mixedMathQuizId;
    acknowledge(callback, { success: true });
  });

  socket.on("disconnect", () => {
    const quiz = quizzes.get(socket.id);
    if (quiz) {
      quiz.finished = true;
      clearTimeout(quiz.questionTimer);
      clearTimeout(quiz.advanceTimer);
      quizzes.delete(socket.id);
    }
  });
};

module.exports = { attachMixedMathQuizSocket };
