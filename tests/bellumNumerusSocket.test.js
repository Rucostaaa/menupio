const test = require("node:test");
const assert = require("node:assert/strict");
const { attachBellumNumerusSocket } = require("../utils/bellumNumerusSocket");

const createSocket = (id, user) => {
  const handlers = new Map();
  const received = [];
  return {
    id,
    user,
    data: {},
    connected: true,
    received,
    handlers,
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, payload) {
      received.push({ event, payload });
    },
    join() {},
    leave() {},
    trigger(event, ...args) {
      handlers.get(event)(...args);
    },
  };
};

const createIo = (sockets) => ({
  sockets: { sockets },
  to(socketId) {
    return {
      emit(event, payload) {
        sockets.get(socketId).received.push({ event, payload });
      },
    };
  },
});

test("human matchmaking requires auth and locks the first submitted answer", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = () => ({ unref() { return this; } });
  global.clearTimeout = () => {};

  try {
    const first = createSocket("first", { _id: "user-first", name: "First" });
    const second = createSocket("second", {
      _id: "user-second",
      name: "Second",
    });
    const anonymous = createSocket("anonymous", null);
    const sockets = new Map([
      [first.id, first],
      [second.id, second],
      [anonymous.id, anonymous],
    ]);
    const io = createIo(sockets);

    attachBellumNumerusSocket(io, first);
    attachBellumNumerusSocket(io, second);
    attachBellumNumerusSocket(io, anonymous);

    let anonymousResponse;
    anonymous.trigger("bellum:queue", { difficulty: "easy" }, (response) => {
      anonymousResponse = response;
    });
    assert.equal(anonymousResponse.success, false);

    first.trigger("bellum:queue", { difficulty: "medium" }, () => {});
    second.trigger("bellum:queue", { difficulty: "medium" }, () => {});

    const firstRound = first.received.find(
      (event) => event.event === "bellum:round",
    )?.payload;
    const secondRound = second.received.find(
      (event) => event.event === "bellum:round",
    )?.payload;
    assert.ok(firstRound);
    assert.deepEqual(firstRound, secondRound);
    assert.equal(firstRound.numbers.length, 4);
    assert.equal(Object.hasOwn(firstRound, "solution"), false);
    assert.equal(
      Object.hasOwn(
        first.received.find((event) => event.event === "bellum:state").payload,
        "solution",
      ),
      false,
    );

    let firstAnswer;
    first.trigger(
      "bellum:submit",
      {
        matchId: firstRound.matchId,
        roundId: firstRound.roundId,
        expression: "999",
      },
      (response) => {
        firstAnswer = response;
      },
    );
    assert.deepEqual(firstAnswer, { success: true, correct: false });

    const firstState = first.received
      .filter((event) => event.event === "bellum:state")
      .at(-1).payload;
    const secondState = second.received
      .filter((event) => event.event === "bellum:state")
      .at(-1).payload;
    assert.equal(firstState.player.health, 88);
    assert.equal(secondState.player.health, 100);

    let secondAnswer;
    second.trigger(
      "bellum:submit",
      {
        matchId: firstRound.matchId,
        roundId: secondRound.roundId,
        expression: "1",
      },
      (response) => {
        secondAnswer = response;
      },
    );
    assert.equal(secondAnswer.success, false);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test("starts a server-controlled bot match and lets the bot solve privately", () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = [];
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = () => {};

  try {
    const human = createSocket("human", {
      _id: "user-human",
      name: "Human",
    });
    const sockets = new Map([[human.id, human]]);
    const io = createIo(sockets);
    attachBellumNumerusSocket(io, human);

    let botResponse;
    human.trigger("bellum:bot", { difficulty: "medium" }, (response) => {
      botResponse = response;
    });
    assert.deepEqual(botResponse, {
      success: true,
      matched: true,
      opponent: "bot",
    });

    const matchFound = human.received.find(
      (event) => event.event === "bellum:matchFound",
    ).payload;
    const round = human.received.find(
      (event) => event.event === "bellum:round",
    ).payload;
    assert.equal(matchFound.opponent.name, "Numerus Bot");
    assert.equal(matchFound.opponent.isBot, true);
    assert.equal(matchFound.mode, "bot");
    assert.equal(Object.hasOwn(round, "solution"), false);

    const botThinkTimer = timers.find((timer) => timer.delay < 20_000);
    assert.ok(botThinkTimer);
    botThinkTimer.callback();

    const updatedState = human.received
      .filter((event) => event.event === "bellum:state")
      .at(-1).payload;
    const result = human.received
      .filter((event) => event.event === "bellum:roundResult")
      .at(-1).payload;
    assert.equal(updatedState.player.health, 76);
    assert.equal(updatedState.opponent.health, 100);
    assert.match(result.message, /Numerus Bot solved it first/);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});
