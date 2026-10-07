const { randomUUID } = require("crypto");

const DIFFICULTIES = {
  easy: { size: 8, wordCount: 5, timeLimitSeconds: 90 },
  medium: { size: 12, wordCount: 8, timeLimitSeconds: 120 },
  hard: { size: 16, wordCount: 10, timeLimitSeconds: 150 },
};

const WORD_BANK = [
  "NUMERO",
  "FRAÇÃO",
  "DECIMAL",
  "ÂNGULO",
  "MÉDIA",
  "DADOS",
  "GRAU",
  "RAIO",
  "AREA",
  "VOLUME",
  "POTENCIA",
  "RAIZ",
  "PERCENTAGEM",
  "PROPORÇÃO",
  "EQUAÇÃO",
  "INEQUACAO",
  "SEQUENCIA",
  "POLIGONO",
  "TRIANGULO",
  "CIRCULO",
  "PERIMETRO",
  "PROBABILIDADE",
  "ESTATÍSTICA",
  "ALGEBRA",
  "FUNÇÃO",
  "GRAFICO",
  "POLINOMIO",
  "VETOR",
  "MATRIZ",
  "SENO",
  "COSSENO",
  "TANGENTE",
  "LOGARITMO",
  "LIMITE",
  "DERIVADA",
  "PRIMITIVA",
  "INTEGRAL",
  "PARABOLA",
];

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const shuffle = (values, random) => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const normalizeWord = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

const generatePuzzle = (difficulty, random = Math.random) => {
  const settings = DIFFICULTIES[difficulty];
  if (!settings) throw new Error("Choose easy, medium, or hard difficulty.");

  const { size, wordCount, timeLimitSeconds } = settings;
  const candidates = WORD_BANK
    .map((word) => ({ id: randomUUID(), text: word, normalized: normalizeWord(word) }))
    .filter((word) => word.normalized.length <= size);
  const shuffled = shuffle(candidates, random);
  const selectedWords = shuffled
    .slice(0, wordCount)
    .sort((left, right) => right.normalized.length - left.normalized.length);
  const grid = Array.from({ length: size }, () => Array(size).fill(""));
  const placements = [];

  for (const word of selectedWords) {
    let placement = null;
    for (let attempt = 0; attempt < 400 && !placement; attempt += 1) {
      const [rowStep, columnStep] = DIRECTIONS[
        Math.floor(random() * DIRECTIONS.length)
      ];
      const startRow = Math.floor(random() * size);
      const startColumn = Math.floor(random() * size);
      const path = Array.from({ length: word.normalized.length }, (_, index) => ({
        row: startRow + rowStep * index,
        column: startColumn + columnStep * index,
      }));
      const fits = path.every(({ row, column }, index) => {
        if (row < 0 || row >= size || column < 0 || column >= size) {
          return false;
        }
        const letter = word.normalized[index];
        return !grid[row][column] || grid[row][column] === letter;
      });
      if (fits) placement = path;
    }
    if (!placement) {
      throw new Error(`Could not place the word ${word.text} in the puzzle.`);
    }

    placement.forEach(({ row, column }, index) => {
      grid[row][column] = word.normalized[index];
    });
    placements.push({ id: word.id, text: word.text, normalized: word.normalized, path: placement });
  }

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!grid[row][column]) {
        grid[row][column] = String.fromCharCode(65 + Math.floor(random() * 26));
      }
    }
  }

  return {
    puzzleId: randomUUID(),
    difficulty,
    grid,
    words: placements.map(({ id, text }) => ({ id, text })),
    timeLimitSeconds,
    placements,
  };
};

const isCorrectSelection = (selection, placements) => {
  if (!Array.isArray(selection) || selection.length < 2) return null;

  const selectedPath = selection
    .map((cell) => `${cell.row},${cell.column}`)
    .join("|");
  return (
    placements.find((placement) => {
      const forward = placement.path
        .map((cell) => `${cell.row},${cell.column}`)
        .join("|");
      const reverse = [...placement.path]
        .reverse()
        .map((cell) => `${cell.row},${cell.column}`)
        .join("|");
      return selectedPath === forward || selectedPath === reverse;
    }) || null
  );
};

module.exports = {
  DIFFICULTIES,
  WORD_BANK,
  generatePuzzle,
  isCorrectSelection,
  normalizeWord,
};
