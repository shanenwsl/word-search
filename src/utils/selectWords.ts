/* ================= SEEDED RNG ================= */

// Deterministic random number generator
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convert string seed → number
function hashSeed(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

/* ================= WORD PICKER ================= */

export function pickWords(
  bank: string[],
  count: number,
  gridSize: number,
  seed: string
) {
  const rand = mulberry32(hashSeed(seed));

  // Filter words that can actually fit in grid
  const usable = bank.filter((w) => w.length <= gridSize);

  // Shuffle deterministically
  const shuffled = [...usable];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Take first N
  return shuffled.slice(0, count).map((w) => w.toUpperCase());
}
