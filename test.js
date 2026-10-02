// node test.js
const assert = require('assert')
const fs = require('fs')
const { code, toCode, solve } = require('./solver.js')
const { LIKELY, VALID, OPENER } = new Function(fs.readFileSync(__dirname + '/words.js', 'utf8') + 'return { LIKELY, VALID, OPENER }')()

assert.equal(code('crane', 'crane'), toCode('ggggg'))
assert.equal(code('speed', 'abide'), toCode('bbyby'))
assert.equal(code('eerie', 'there'), toCode('ybybg'))
assert.equal(code('llama', 'hello'), toCode('yybbb'))

for (const answer of ['abide', 'jazzy', 'mamma', 'eerie']) {
  const guesses = ['crane', 'pilot'].map(word => ({ word, pattern: pattern(word, answer) }))
  const { likely, rare, best } = solve(guesses, LIKELY, VALID)
  assert(likely.includes(answer), answer)
  assert(best)
  for (const w of likely.concat(rare)) for (const g of guesses) assert.equal(code(g.word, w), toCode(g.pattern))
}

// two answers left must suggest one of them
const two = solve([{ word: 'alert', pattern: 'bbygy' }, { word: 'usury', pattern: 'bbbgg' }], LIKELY, VALID)
assert(two.likely.includes(two.best), two.best)
assert.equal(OPENER, 'tarse')
console.log('ok', two.likely, two.best)

function pattern(guess, answer) {
  let c = code(guess, answer)
  return Array.from({ length: 5 }, () => { const d = c % 3; c = (c - d) / 3; return 'byg'[d] }).join('')
}
