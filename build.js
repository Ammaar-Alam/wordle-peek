// node build.js re-sorts words.js by opening value so the empty board needs no work at runtime
const fs = require('fs')
const { entropy } = require('./solver.js')

const file = __dirname + '/words.js'
const { LIKELY, VALID } = new Function(fs.readFileSync(file, 'utf8') + 'return { LIKELY, VALID }')()
const h = new Map(LIKELY.concat(VALID).map(w => [w, entropy(w, LIKELY)]))
const sort = list => [...list].sort((x, y) => h.get(y) - h.get(x) || (x < y ? -1 : 1))

fs.writeFileSync(file, `// answer list first, the rest are valid guesses, each sorted by opening value
const LIKELY = "${sort(LIKELY).join(' ')}".split(" ");
const VALID = "${sort(VALID).join(' ')}".split(" ");
const OPENER = "${sort(LIKELY.concat(VALID))[0]}";
`)
