const POW = [1, 3, 9, 27, 81]
const DIGIT = { b: 0, y: 1, g: 2 }

// pattern as a base 3 number with green 2 and yellow 1, same rules as the game incl. repeated letters
function code(guess, answer) {
  const left = new Uint8Array(26)
  let out = 0
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) out += 2 * POW[i]
    else left[answer.charCodeAt(i) - 97]++
  }
  for (let i = 0; i < 5; i++) {
    const c = guess.charCodeAt(i) - 97
    if (guess[i] !== answer[i] && left[c]) {
      out += POW[i]
      left[c]--
    }
  }
  return out
}

const toCode = pattern => [...pattern].reduce((s, ch, i) => s + DIGIT[ch] * POW[i], 0)

// expected bits of information from guessing w when any word in pool could be the answer
const counts = new Uint16Array(243)
function entropy(w, pool) {
  counts.fill(0)
  for (const a of pool) counts[code(w, a)]++
  let h = 0
  for (const c of counts) if (c) h -= (c / pool.length) * Math.log2(c / pool.length)
  return h
}

// words that fit every guess, ranked by expected information, plus the single best next guess
function solve(guesses, likely, valid) {
  const checks = guesses.map(g => [g.word, toCode(g.pattern)])
  const fits = w => checks.every(([g, c]) => code(g, w) === c)
  const a = likely.filter(fits)
  const b = valid.filter(fits)
  const pool = a.length ? a : b
  if (!pool.length) return { likely: [], rare: [], best: '' }

  const info = new Map()
  const h = w => {
    if (!info.has(w)) info.set(w, entropy(w, pool))
    return info.get(w)
  }
  const rank = list => list
    .map(w => [h(w), w])
    .sort((x, y) => y[0] - x[0] || (x[1] < y[1] ? -1 : 1))
    .map(x => x[1])
  // ponytail: huge rare lists keep their baked opening order, rank them live if that order feels off
  const out = { likely: rank(a), rare: b.length * pool.length > 2e6 ? b : rank(b) }

  // a possible answer wins ties since it can end the game
  // ponytail: big pools only search common words for the best guess to stay fast, widen if suggestions feel weak
  let best = (a.length ? out.likely : out.rare)[0]
  for (const w of pool.length > 100 ? likely : likely.concat(valid)) if (h(w) > h(best) + 1e-9) best = w
  return { ...out, best }
}

if (typeof module === 'object') module.exports = { code, toCode, entropy, solve }
