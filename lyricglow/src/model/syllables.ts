// ─── English syllable estimator ────────────────────────────────────────────
// Heuristic splitter used when lyrics arrive without syllable timing (plain
// LRC lines, Sync Studio text). Explicit splits with "|" or "·" always win.
// Goal: correct *counts* for common words and sensible display chunks.

const VOWELS = new Set(["a", "e", "i", "o", "u", "y", "à", "á", "â", "ä", "è", "é", "ê", "ë", "ì", "í", "î", "ï", "ò", "ó", "ô", "ö", "ù", "ú", "û", "ü", "ñ"]);
const PLAIN_VOWELS = new Set(["a", "e", "i", "o", "u"]);
const DIGRAPHS = new Set(["ch", "sh", "th", "ph", "wh", "ck", "ng"]);
const ONSET2 = new Set(["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tr", "ch", "sh", "th", "ph", "wh", "qu", "sl", "sm", "sn", "sw", "tw"]);
const ONSET3 = new Set(["str", "spr", "scr", "spl", "thr", "shr", "chr", "phr", "squ"]);
const KEEP_ES_AFTER = ["s", "x", "z", "ch", "sh", "ce", "ge", "se", "ze"];
const HIATUS = new Set(["ia", "io", "iu", "eo", "ua", "uo", "oa"]);
const NO_HIATUS_CONTEXT = ["tion", "sion", "cian", "cious", "tial", "geous", "cial", "tious", "cean", "peop"];
const SUFFIX_RE = /(ing|ed|est|ers|er|en|ly|y)$/;
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;
const LETTER_RE = /\p{L}|\p{N}/u;

function lowerChar(c: string): string {
  const l = c.toLowerCase();
  return l.length === c.length ? l : c;
}

/** Split one word (may carry punctuation) into display syllables. */
export function splitSyllables(word: string): string[] {
  if (!word) return [];
  if (/[|·]/.test(word)) return word.split(/[|·]/).filter(Boolean);
  if (word.includes("-") && word.length > 1) {
    const parts = word.split("-");
    const out: string[] = [];
    parts.forEach((p, i) => {
      const syls = splitSyllables(p);
      if (!syls.length) return;
      if (i < parts.length - 1) syls[syls.length - 1] += "-";
      out.push(...syls);
    });
    return out.length ? out : [word];
  }

  // peel punctuation
  let lead = 0;
  while (lead < word.length && !LETTER_RE.test(word[lead])) lead++;
  let trail = word.length;
  while (trail > lead && !LETTER_RE.test(word[trail - 1])) trail--;
  if (lead >= trail) return [word];
  const prefix = word.slice(0, lead);
  const suffix = word.slice(trail);
  const core = word.slice(lead, trail);

  let parts: string[];
  if (CJK_RE.test(core)) parts = splitCjk(core);
  else parts = splitLatin(core);

  parts[0] = prefix + parts[0];
  parts[parts.length - 1] += suffix;
  return parts;
}

export function countSyllables(word: string): number {
  return splitSyllables(word).length;
}

/** "Softly now the ci|ty" → [["Soft","ly"],["now"],["the"],["ci","ty"]] */
export function splitWordsAndSyllables(text: string): string[][] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(splitSyllables)
    .filter((w) => w.length > 0);
}

function splitCjk(core: string): string[] {
  const out: string[] = [];
  let latin = "";
  for (const ch of core) {
    if (CJK_RE.test(ch)) {
      if (latin) {
        out.push(...splitLatin(latin));
        latin = "";
      }
      out.push(ch);
    } else latin += ch;
  }
  if (latin) out.push(...splitLatin(latin));
  return out;
}

function splitLatin(core: string): string[] {
  const chars = Array.from(core);
  const low = chars.map(lowerChar);
  const n = low.length;
  const isV = (i: number): boolean => {
    if (i < 0 || i >= n) return false;
    const c = low[i];
    if (c === "y") {
      if (i === 0) return false;
      return !PLAIN_VOWELS.has(low[i - 1]) && !(i + 1 < n && PLAIN_VOWELS.has(low[i + 1]));
    }
    if (c === "u" && i > 0 && low[i - 1] === "q") return false;
    return VOWELS.has(c);
  };

  // nuclei as [start, end) ranges
  const nuclei: [number, number][] = [];
  let i = 0;
  while (i < n) {
    if (!isV(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && isV(j)) j++;
    // split hiatus pairs inside a vowel run
    let s = i;
    for (let k = i; k < j - 1; k++) {
      const pair = low[k] + low[k + 1];
      const nextIsCons = k + 2 >= n || !isV(k + 2);
      const ieT = pair === "ie" && k + 2 === n - 1 && low[k + 2] === "t";
      if ((HIATUS.has(pair) && nextIsCons) || ieT) {
        const ctx = low.slice(Math.max(0, k - 1), k + 5).join("");
        if (!NO_HIATUS_CONTEXT.some((c) => ctx.includes(c))) {
          nuclei.push([s, k + 1]);
          s = k + 1;
        }
      }
    }
    nuclei.push([s, j]);
    i = j;
  }
  if (nuclei.length === 0) return [core];

  // silent-e family: drop the final nucleus and merge it leftwards
  if (nuclei.length > 1) {
    const last = nuclei[nuclei.length - 1];
    const tail = low.slice(last[0]).join("");
    const before = low.slice(0, last[0]).join("");
    const prevChar = before[before.length - 1] ?? "";
    const prev2 = before[before.length - 2] ?? "";
    let drop = false;
    if (tail === "e") {
      const le = prevChar === "l" && prev2 !== "" && !PLAIN_VOWELS.has(prev2) && prev2 !== "l";
      drop = !le;
    } else if (tail === "es") {
      drop = !KEEP_ES_AFTER.some((k) => before.endsWith(k));
    } else if (tail === "ed") {
      drop = !(prevChar === "t" || prevChar === "d");
    }
    if (drop) nuclei.pop();
  }
  if (nuclei.length === 1) return [core];

  // boundaries between consecutive nuclei
  const suffixMatch = SUFFIX_RE.exec(low.join(""));
  const suffixStart = suffixMatch ? n - suffixMatch[0].length : -1;
  const cuts: number[] = [];
  for (let k = 0; k < nuclei.length - 1; k++) {
    const cStart = nuclei[k][1];
    const cEnd = nuclei[k + 1][0];
    const cluster = low.slice(cStart, cEnd).join("");
    const len = cluster.length;
    const nextIsSuffix = suffixStart >= 0 && nuclei[k + 1][0] >= suffixStart && k + 1 === nuclei.length - 1;
    let cut: number;
    if (len === 0) cut = cStart;
    else if (nextIsSuffix && len === 1) {
      const suf = suffixMatch![0];
      cut = suf === "ing" || suf === "ed" || suf === "est" || suf === "en" ? cEnd : cStart;
    } else if (nextIsSuffix && len === 2 && DIGRAPHS.has(cluster)) cut = cEnd;
    else if (len === 1) cut = cStart;
    else if (len === 2) cut = DIGRAPHS.has(cluster) || ONSET2.has(cluster) ? cStart : cStart + 1;
    else {
      const last3 = cluster.slice(-3);
      const last2 = cluster.slice(-2);
      if (ONSET3.has(last3)) cut = cEnd - 3;
      else if (ONSET2.has(last2) || DIGRAPHS.has(last2)) cut = cEnd - 2;
      else cut = cEnd - 1;
    }
    cuts.push(cut);
  }

  const out: string[] = [];
  let prev = 0;
  for (const c of cuts) {
    if (c <= prev || c >= n) continue;
    out.push(chars.slice(prev, c).join(""));
    prev = c;
  }
  out.push(chars.slice(prev).join(""));
  return out.filter(Boolean);
}
