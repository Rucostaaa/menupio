const TIME_LIMITS = { easy: 20, medium: 15, hard: 12 };
const QUESTION_COUNT = 10;
const GRADES = [5, 6, 7, 8, 9, 10, 11, 12];

const TOPICS = {
  arithmetic: "Cálculo",
  fractions: "Frações e números racionais",
  percentage: "Percentagens",
  proportion: "Proporcionalidade",
  geometry: "Geometria e medida",
  solidGeometry: "Geometria espacial",
  statistics: "Estatística",
  probability: "Probabilidades",
  algebra: "Álgebra",
  equations: "Equações",
  inequalities: "Inequações",
  systems: "Sistemas de equações",
  sequences: "Sequências",
  functions: "Funções",
  functionGraph: "Gráficos de funções",
  polynomials: "Polinómios",
  analyticGeometry: "Geometria analítica",
  vectors: "Vetores",
  combinatorics: "Combinatória",
  trigonometry: "Trigonometria",
  exponentialLogarithmic: "Exponenciais e logaritmos",
  limits: "Limites",
  derivatives: "Derivadas",
  primitives: "Primitivas",
  integralArea: "Integrais e áreas",
  complexNumbers: "Números complexos",
};

const GRADE_TOPICS = {
  5: ["arithmetic", "fractions", "percentage", "geometry", "solidGeometry", "statistics"],
  6: ["arithmetic", "fractions", "percentage", "proportion", "geometry", "solidGeometry", "statistics", "probability"],
  7: ["arithmetic", "fractions", "proportion", "geometry", "solidGeometry", "statistics", "probability", "algebra", "equations"],
  8: ["fractions", "proportion", "geometry", "solidGeometry", "statistics", "probability", "algebra", "equations", "inequalities", "systems", "sequences"],
  9: ["proportion", "geometry", "solidGeometry", "statistics", "probability", "combinatorics", "algebra", "equations", "inequalities", "systems", "sequences", "functions", "functionGraph"],
  10: ["statistics", "probability", "combinatorics", "algebra", "equations", "inequalities", "systems", "sequences", "functions", "functionGraph", "polynomials", "analyticGeometry", "vectors", "trigonometry"],
  11: ["statistics", "probability", "combinatorics", "sequences", "functions", "functionGraph", "polynomials", "analyticGeometry", "vectors", "trigonometry", "exponentialLogarithmic", "limits", "derivatives"],
  12: ["statistics", "probability", "combinatorics", "functions", "functionGraph", "polynomials", "analyticGeometry", "vectors", "trigonometry", "exponentialLogarithmic", "limits", "derivatives", "primitives", "integralArea", "complexNumbers"],
};

const formatNumber = (value) => {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2)));
};

const shuffle = (values, random) => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const makeOptions = (answer, random, customDistractors) => {
  const answerLabel = String(answer);
  const fallbackOffsets = ["− 2", "− 1", "+ 1", "+ 2", "+ 3"];
  const distractors = customDistractors || fallbackOffsets.map((offset) => {
    const [operation, amount] = offset.split(" ");
    return formatNumber(answer + (operation === "+" ? 1 : -1) * Number(amount));
  });
  const uniqueDistractors = [...new Set(distractors.map(String))]
    .filter((choice) => choice !== answerLabel)
    .slice(0, 3);
  let offset = 1;
  while (uniqueDistractors.length < 3) {
    const candidate = formatNumber(Number(answer) + offset);
    if (candidate !== answerLabel && !uniqueDistractors.includes(candidate)) {
      uniqueDistractors.push(candidate);
    }
    offset += 1;
  }

  const choices = shuffle([answerLabel, ...uniqueDistractors], random);
  const correctIndex = choices.indexOf(answerLabel);
  return {
    options: choices.map((label, index) => ({
      id: `option-${index}`,
      label,
    })),
    correctOptionId: `option-${correctIndex}`,
    answerLabel,
  };
};

const numericQuestion = (prompt, answer, explanation, random, graph) => ({
  prompt,
  explanation,
  graph,
  ...makeOptions(
    formatNumber(answer),
    random,
    [-3, -2, -1, 1, 2, 3, 5].map((offset) =>
      formatNumber(answer + offset),
    ),
  ),
});

const choiceQuestion = (prompt, answer, distractors, explanation, random, graph) => ({
  prompt,
  explanation,
  graph,
  ...makeOptions(answer, random, distractors),
});

const createRandom = (random) => ({
  int: (minimum, maximum) =>
    Math.floor(random() * (maximum - minimum + 1)) + minimum,
  pick(values) {
    return values[this.int(0, values.length - 1)];
  },
});

const makeBarGraph = (bars) => ({ kind: "bars", bars });

const generateForTopic = (topic, grade, random = Math.random) => {
  const rng = createRandom(random);
  const int = (minimum, maximum) => rng.int(minimum, maximum);
  const pick = (values) => rng.pick(values);

  switch (topic) {
    case "arithmetic": {
      const left = int(12, grade <= 6 ? 99 : 250);
      const right = int(2, grade <= 6 ? 20 : 60);
      const operation = pick(["+", "−", "×"]);
      const first = operation === "−" ? Math.max(left, right) : left;
      const second = operation === "−" ? Math.min(left, right) : right;
      const answer = operation === "+" ? first + second : operation === "−" ? first - second : first * second;
      return numericQuestion(`${first} ${operation} ${second} = ?`, answer, `Calcula ${first} ${operation} ${second}: o resultado é ${answer}.`, random);
    }
    case "fractions": {
      const denominator = pick([2, 3, 4, 5, 8, 10, 12]);
      const operation = pick(["+", "−"]);
      const first = int(1, denominator - 1);
      const second = int(1, denominator - 1);
      const left = operation === "−" ? Math.max(first, second) : first;
      const right = operation === "−" ? Math.min(first, second) : second;
      const numerator = operation === "+" ? left + right : left - right;
      const answer = Number((numerator / denominator).toFixed(2));
      return numericQuestion(
        `Calcula ${left}/${denominator} ${operation} ${right}/${denominator}. (Arredonda às centésimas.)`,
        answer,
        `Com o mesmo denominador, ${left}/${denominator} ${operation} ${right}/${denominator} = ${numerator}/${denominator}, aproximadamente ${formatNumber(answer)}.`,
        random,
      );
    }
    case "percentage": {
      const base = int(2, 20) * 10;
      const rate = pick([10, 20, 25, 30, 40, 50, 75]);
      const answer = (base * rate) / 100;
      return numericQuestion(`Quanto é ${rate}% de ${base}?`, answer, `${rate}% = ${rate}/100; logo ${base} × ${rate}/100 = ${answer}.`, random);
    }
    case "proportion": {
      const factor = int(2, 9);
      const unit = int(2, 12);
      const quantity = int(2, 8);
      const answer = unit * quantity;
      return numericQuestion(
        `${quantity} cadernos iguais custam ${answer} €. Quanto custam ${factor} cadernos?`,
        unit * factor,
        `O preço unitário é ${answer} ÷ ${quantity} = ${unit} €. Assim, ${factor} cadernos custam ${unit * factor} €.`,
        random,
      );
    }
    case "geometry": {
      const length = int(3, 14);
      const width = int(2, 10);
      if (grade <= 6) {
        const answer = 2 * (length + width);
        return numericQuestion(`Um retângulo mede ${length} cm por ${width} cm. Qual é o seu perímetro?`, answer, `P = 2 × (${length} + ${width}) = ${answer} cm.`, random);
      }
      const answer = (length * width) / 2;
      return numericQuestion(`Qual é a área de um triângulo com base ${length} cm e altura ${width} cm?`, answer, `A = base × altura ÷ 2 = ${length} × ${width} ÷ 2 = ${answer} cm².`, random);
    }
    case "solidGeometry": {
      const length = int(2, 10);
      const width = int(2, 8);
      const height = int(2, 7);
      const answer = length * width * height;
      return numericQuestion(
        `Um paralelepípedo mede ${length} cm × ${width} cm × ${height} cm. Qual é o seu volume?`,
        answer,
        `V = comprimento × largura × altura = ${length} × ${width} × ${height} = ${answer} cm³.`,
        random,
      );
    }
    case "statistics": {
      const values = Array.from({ length: 4 }, () => int(1, 12));
      const sortedValues = [...values].sort((left, right) => left - right);
      const statistic = pick(["média", "mediana", "amplitude"]);
      const answer = statistic === "média"
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : statistic === "mediana"
          ? (sortedValues[1] + sortedValues[2]) / 2
          : sortedValues[3] - sortedValues[0];
      const bars = ["A", "B", "C", "D"].map((label, index) => ({
        label,
        value: values[index],
      }));
      return numericQuestion(
        `O gráfico mostra os valores de quatro medições. Qual é a ${statistic}?`,
        answer,
        statistic === "média"
          ? `A média é (${values.join(" + ")}) ÷ 4 = ${formatNumber(answer)}.`
          : statistic === "mediana"
            ? `Ordenando os valores (${sortedValues.join(", ")}), a mediana é a média dos dois valores centrais: ${formatNumber(answer)}.`
            : `A amplitude é o máximo menos o mínimo: ${sortedValues[3]} − ${sortedValues[0]} = ${answer}.`,
        random,
        makeBarGraph(bars),
      );
    }
    case "probability": {
      const total = int(4, 12);
      const favourable = int(1, total - 1);
      const percent = Math.round((favourable / total) * 100);
      return numericQuestion(
        `Num saco há ${favourable} bolas vermelhas e ${total - favourable} azuis. Qual é a probabilidade de tirar uma vermelha, em percentagem arredondada à unidade?`,
        percent,
        `Há ${favourable} casos favoráveis em ${total}; (${favourable}/${total}) × 100 ≈ ${percent}%.`,
        random,
      );
    }
    case "algebra": {
      const a = int(2, 8);
      const b = int(1, 9);
      const x = int(2, 10);
      const answer = a * x + b * x;
      return numericQuestion(`Calcula o valor de ${a}x + ${b}x para x = ${x}.`, answer, `Reduzindo termos semelhantes: ${a}x + ${b}x = ${a + b}x; para x = ${x}, o valor é ${answer}.`, random);
    }
    case "equations": {
      const coefficient = int(2, 8);
      const x = int(-8, 12);
      const offset = int(-12, 12);
      const right = coefficient * x + offset;
      return numericQuestion(`Resolve a equação ${coefficient}x ${offset < 0 ? "− " + Math.abs(offset) : "+ " + offset} = ${right}.`, x, `Isolando x: ${coefficient}x = ${right - offset}; portanto x = ${x}.`, random);
    }
    case "inequalities": {
      const coefficient = int(2, 6);
      const threshold = int(-5, 8);
      const relation = pick(["<", "≤", ">", "≥"]);
      const relationChoices = ["<", "≤", ">", "≥"];
      const answer = `x ${relation} ${threshold}`;
      const distractors = relationChoices
        .filter((symbol) => symbol !== relation)
        .map((symbol) => `x ${symbol} ${threshold}`);
      return choiceQuestion(
        `Resolve a inequação ${coefficient}x ${relation} ${coefficient * threshold}.`,
        answer,
        distractors,
        `Como se divide por ${coefficient}, que é positivo, o sentido da desigualdade mantém-se: ${answer}.`,
        random,
      );
    }
    case "systems": {
      const x = int(-5, 8);
      const y = int(-5, 8);
      const sum = x + y;
      const difference = x - y;
      return numericQuestion(
        `Resolve o sistema: x + y = ${sum}; x − y = ${difference}. Qual é o valor de x?`,
        x,
        `Somando as equações, 2x = ${sum + difference}; logo x = ${x}.`,
        random,
      );
    }
    case "sequences": {
      const first = int(1, 15);
      const difference = int(2, 9);
      const values = Array.from({ length: 4 }, (_, index) => first + index * difference);
      const answer = first + 4 * difference;
      return numericQuestion(`Qual é o próximo termo da sequência ${values.join(", ")}, …?`, answer, `A sequência aumenta de ${difference} em ${difference}; o próximo termo é ${answer}.`, random);
    }
    case "functions": {
      const slope = int(-5, 5) || 2;
      const intercept = int(-8, 8);
      const x = int(-4, 5);
      const answer = slope * x + intercept;
      return numericQuestion(`Se f(x) = ${slope}x ${intercept < 0 ? "− " + Math.abs(intercept) : "+ " + intercept}, calcula f(${x}).`, answer, `Substitui x por ${x}: f(${x}) = ${slope} × ${x} ${intercept < 0 ? "− " + Math.abs(intercept) : "+ " + intercept} = ${answer}.`, random);
    }
    case "functionGraph": {
      const kind = grade >= 10 && random() < 0.35 ? "parabola" : "line";
      if (kind === "parabola") {
        const vertexX = int(-3, 3);
        const vertexY = int(-3, 2);
        const graph = { kind, vertexX, vertexY, xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
        return numericQuestion(
          `Observa o gráfico de f. Qual é a abcissa do vértice da parábola?`,
          vertexX,
          `O vértice está em (${vertexX}, ${vertexY}); a sua abcissa é ${vertexX}.`,
          random,
          graph,
        );
      }
      const slope = pick([-2, -1, 1, 2]);
      const intercept = int(-2, 2);
      const x = pick([-2, -1, 0, 1, 2]);
      const answer = slope * x + intercept;
      const graph = { kind: "line", slope, intercept, xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
      return numericQuestion(
        `O gráfico representa f. Qual é o valor de f(${x})?`,
        answer,
        `Lendo o ponto do gráfico com abcissa ${x}, obtém-se f(${x}) = ${answer}.`,
        random,
        graph,
      );
    }
    case "polynomials": {
      const a = int(1, 5);
      const b = pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]);
      const x = int(-3, 4);
      const answer = a * x * x + b * x;
      return numericQuestion(`Calcula P(${x}) para P(x) = ${a}x² ${b < 0 ? "− " + Math.abs(b) + "x" : "+ " + b + "x"}.`, answer, `P(${x}) = ${a} × ${x}² ${b < 0 ? "− " + Math.abs(b) + " × " + x : "+ " + b + " × " + x} = ${answer}.`, random);
    }
    case "analyticGeometry": {
      const x1 = int(-4, 3);
      const y1 = int(-4, 3);
      const [horizontal, vertical, answer] = pick([
        [3, 4, 5],
        [5, 12, 13],
        [8, 15, 17],
      ]);
      return numericQuestion(
        `Qual é a distância entre A(${x1}, ${y1}) e B(${x1 + horizontal}, ${y1 + vertical})?`,
        answer,
        `Pelo teorema de Pitágoras, d = √((${horizontal})² + (${vertical})²) = ${answer}.`,
        random,
      );
    }
    case "vectors": {
      const first = int(-5, 6);
      const second = int(-5, 6);
      const third = int(-5, 6);
      const fourth = int(-5, 6);
      const answer = first * third + second * fourth;
      return numericQuestion(
        `Calcula o produto escalar dos vetores u = (${first}, ${second}) e v = (${third}, ${fourth}).`,
        answer,
        `u · v = ${first} × ${third} + ${second} × ${fourth} = ${answer}.`,
        random,
      );
    }
    case "combinatorics": {
      const total = int(5, 12);
      const answer = (total * (total - 1)) / 2;
      return numericQuestion(
        `De quantas formas se podem escolher 2 alunos de um grupo de ${total}?`,
        answer,
        `A ordem não importa: C(${total}, 2) = ${total} × ${total - 1} ÷ 2 = ${answer}.`,
        random,
      );
    }
    case "trigonometry": {
      const values = [
        { angle: 0, fn: "sen", answer: "0", distractors: ["1/2", "√2/2", "1"] },
        { angle: 30, fn: "sen", answer: "1/2", distractors: ["√3/2", "√2/2", "1"] },
        { angle: 45, fn: "sen", answer: "√2/2", distractors: ["1/2", "√3/2", "1"] },
        { angle: 60, fn: "cos", answer: "1/2", distractors: ["√3/2", "√2/2", "0"] },
        { angle: 30, fn: "cos", answer: "√3/2", distractors: ["1/2", "√2/2", "1"] },
        { angle: 90, fn: "cos", answer: "0", distractors: ["1/2", "√2/2", "1"] },
      ];
      const item = pick(values);
      return choiceQuestion(
        `Qual é o valor exato de ${item.fn}(${item.angle}°)?`,
        item.answer,
        item.distractors,
        `Pelos valores notáveis da trigonometria, ${item.fn}(${item.angle}°) = ${item.answer}.`,
        random,
      );
    }
    case "exponentialLogarithmic": {
      const base = pick([2, 3, 10]);
      const exponent = int(2, 5);
      const value = base ** exponent;
      if (random() < 0.5) {
        return numericQuestion(`Calcula log${base}(${value}).`, exponent, `Como ${base}^${exponent} = ${value}, então log${base}(${value}) = ${exponent}.`, random);
      }
      return numericQuestion(`Calcula ${base}^${exponent}.`, value, `${base} elevado a ${exponent} é ${value}.`, random);
    }
    case "limits": {
      const point = int(-4, 5);
      const answer = 2 * point;
      const pointMagnitude = Math.abs(point);
      const denominator = point < 0
        ? `x + ${pointMagnitude}`
        : `x − ${point}`;
      const simplified = point < 0
        ? `x − ${pointMagnitude}`
        : `x + ${point}`;
      return numericQuestion(
        `Calcula lim(x→${point}) (x² − ${point ** 2})/(${denominator}).`,
        answer,
        `Fatorizando, a fração simplifica-se para ${simplified}; no limite, o valor é ${answer}.`,
        random,
      );
    }
    case "derivatives": {
      const coefficient = int(1, 5);
      const power = int(2, 5);
      const x = int(1, 4);
      const answer = coefficient * power * x ** (power - 1);
      return numericQuestion(
        `Se f(x) = ${coefficient}x^${power}, quanto vale f'(${x})?`,
        answer,
        `f'(x) = ${coefficient * power}x^${power - 1}; substituindo x = ${x}, f'(${x}) = ${answer}.`,
        random,
      );
    }
    case "primitives": {
      const coefficient = int(1, 5);
      const power = int(1, 4);
      const answer = `${coefficient}/${power + 1}x^${power + 1} + C`;
      const distractors = [
        `${coefficient}x^${power + 1} + C`,
        `${coefficient * (power + 1)}x^${power} + C`,
        `${coefficient}/${power}x^${power} + C`,
      ];
      return choiceQuestion(
        `Qual é uma primitiva de f(x) = ${coefficient}x^${power}?`,
        answer,
        distractors,
        `Uma primitiva é F(x) = ${answer}, pois F'(x) = ${coefficient}x^${power}.`,
        random,
      );
    }
    case "integralArea": {
      const upper = int(2, 8);
      const answer = (upper * upper) / 2;
      return numericQuestion(
        `Qual é a área sob o gráfico de f(x) = x, entre x = 0 e x = ${upper}?`,
        answer,
        `A região é um triângulo de base ${upper} e altura ${upper}; A = ${upper} × ${upper} ÷ 2 = ${formatNumber(answer)}.`,
        random,
      );
    }
    case "complexNumbers": {
      const triples = [
        [3, 4, 5],
        [5, 12, 13],
        [8, 15, 17],
      ];
      const [real, imaginary, modulus] = pick(triples);
      return numericQuestion(
        `Se z = ${real} + ${imaginary}i, qual é o módulo |z|?`,
        modulus,
        `|z| = √(${real}² + ${imaginary}²) = ${modulus}.`,
        random,
      );
    }
    default:
      throw new Error(`Unsupported mathematics topic: ${topic}`);
  }
};

const generateQuestionForTopic = (topic, grade, random = Math.random) => {
  if (!Object.hasOwn(TOPICS, topic)) {
    throw new Error(`Unsupported mathematics topic: ${topic}`);
  }
  if (!GRADES.includes(grade) || !GRADE_TOPICS[grade].includes(topic)) {
    throw new Error(`Topic ${topic} is not available for grade ${grade}.`);
  }

  const generated = generateForTopic(topic, grade, random);
  return {
    type: topic,
    topic,
    topicLabel: TOPICS[topic],
    grade,
    ...generated,
  };
};

const generateQuestion = (
  difficulty,
  questionNumber,
  random = Math.random,
  grade = 7,
) => {
  const topics = GRADE_TOPICS[grade];
  if (!topics) throw new Error(`Unsupported school grade: ${grade}`);
  const topic = topics[Math.floor(random() * topics.length)];
  const generated = generateQuestionForTopic(topic, grade, random);
  return {
    ...generated,
    questionNumber,
    timeLimitSeconds: TIME_LIMITS[difficulty] || TIME_LIMITS.medium,
  };
};

module.exports = {
  GRADE_TOPICS,
  GRADES,
  QUESTION_COUNT,
  TIME_LIMITS,
  TOPICS,
  generateQuestion,
  generateQuestionForTopic,
};
