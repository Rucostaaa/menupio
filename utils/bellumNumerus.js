const DIFFICULTIES = {
  easy: { numberCount: 3, timeLimitSeconds: 25, damage: 8, hitDamage: 20 },
  medium: { numberCount: 4, timeLimitSeconds: 20, damage: 12, hitDamage: 24 },
  hard: { numberCount: 5, timeLimitSeconds: 15, damage: 16, hitDamage: 28 },
};

const evaluateExpression = (expression, numbers) => {
  if (typeof expression !== "string" || expression.length > 100) {
    return { valid: false };
  }

  const tokens = expression.match(/\d+(?:\.\d+)?|[()+*/-]/g) || [];
  if (tokens.join("") !== expression.replace(/\s/g, "")) {
    return { valid: false };
  }

  let cursor = 0;
  const usedNumbers = [];

  const parsePrimary = () => {
    const token = tokens[cursor];
    if (token === "+" || token === "-") {
      cursor += 1;
      const value = parsePrimary();
      return token === "-" ? -value : value;
    }
    if (token === "(") {
      cursor += 1;
      const value = parseExpression();
      if (tokens[cursor] !== ")") {
        throw new Error("Unclosed parenthesis");
      }
      cursor += 1;
      return value;
    }
    if (!token || !/^\d+(?:\.\d+)?$/.test(token)) {
      throw new Error("Expected a number");
    }
    cursor += 1;
    const value = Number(token);
    usedNumbers.push(value);
    return value;
  };

  const parseTerm = () => {
    let value = parsePrimary();
    while (tokens[cursor] === "*" || tokens[cursor] === "/") {
      const operator = tokens[cursor];
      cursor += 1;
      const right = parsePrimary();
      if (operator === "/" && right === 0) {
        throw new Error("Division by zero");
      }
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };

  const parseExpression = () => {
    let value = parseTerm();
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const operator = tokens[cursor];
      cursor += 1;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };

  try {
    if (!tokens.length) {
      return { valid: false };
    }
    const result = parseExpression();
    if (cursor !== tokens.length || !Number.isFinite(result)) {
      return { valid: false };
    }

    const remainingNumbers = [...numbers];
    for (const used of usedNumbers) {
      const index = remainingNumbers.findIndex((number) => number === used);
      if (index === -1) {
        return { valid: false };
      }
      remainingNumbers.splice(index, 1);
    }
    if (remainingNumbers.length !== 0) {
      return { valid: false };
    }

    return { valid: true, value: result };
  } catch {
    return { valid: false };
  }
};

const createChallenge = (difficulty, random = Math.random) => {
  const rules = DIFFICULTIES[difficulty];
  if (!rules) {
    throw new Error("Unsupported Bellum Numerus difficulty.");
  }

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const numbers = Array.from(
      { length: rules.numberCount },
      () => Math.floor(random() * 12) + 1,
    );
    const shuffled = [...numbers].sort(() => random() - 0.5);
    const operators = ["+", "-", "*", "/"];
    let solution = String(shuffled[0]);
    let result = shuffled[0];
    let valid = true;

    for (let index = 1; index < shuffled.length; index += 1) {
      const operator = operators[Math.floor(random() * operators.length)];
      const next = shuffled[index];
      if (
        operator === "/" &&
        (next === 0 || Math.abs(result % next) > Number.EPSILON)
      ) {
        valid = false;
        break;
      }

      if (operator === "+") result += next;
      if (operator === "-") result -= next;
      if (operator === "*") result *= next;
      if (operator === "/") result /= next;
      solution = `(${solution}${operator}${next})`;

      if (!Number.isSafeInteger(result) || Math.abs(result) > 10000) {
        valid = false;
        break;
      }
    }

    if (
      valid &&
      Number.isInteger(result) &&
      evaluateExpression(solution, numbers).valid &&
      evaluateExpression(solution, numbers).value === result
    ) {
      return { numbers, target: result, solution, ...rules };
    }
  }

  throw new Error("Unable to generate a valid Bellum Numerus challenge.");
};

module.exports = { DIFFICULTIES, createChallenge, evaluateExpression };
