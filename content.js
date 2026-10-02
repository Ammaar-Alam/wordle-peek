(() => {
  const STATE = { correct: 'g', present: 'y', absent: 'b' }
  const KNOWN = new Set(LIKELY.concat(VALID))
  const FIRST = '2021-06-19'
  const EYE = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="var(--color-tone-1)" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>'
  const icon = d => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`
  const CLOSE = icon('M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z')
  const PREV = icon('M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z')
  const NEXT = icon('M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z')
  const MIC = icon('M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z')
  const tiles = n => Array.from({ length: n }, (_, i) => `<span style="--i:${i}"></span>`).join('')

  const today = () => new Date().toLocaleDateString('en-CA')
  const shift = (date, days) => new Date(Date.parse(date) + days * 864e5).toISOString().slice(0, 10)
  const inRange = date => date >= FIRST && date <= today()
  const fmt = (date, opts) => new Date(Date.parse(date)).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', ...opts })
  // archive puzzles live at /games/wordle/YYYY-MM-DD, everything else is today
  const currentDate = () => location.pathname.match(/\/wordle\/(\d{4}-\d{2}-\d{2})/)?.[1] || today()

  // remembers the last puzzle seen so the next one follows the direction of travel
  let store = {}
  try { store = JSON.parse(localStorage.getItem('peek')) || {} } catch {}
  const save = () => { try { localStorage.setItem('peek', JSON.stringify(store)) } catch {} }

  const puzzles = {}
  let date = ''
  let isOpen = false
  let revealed = false
  let showRare = false
  let lastKey = ''
  let timer = 0
  let voice = null
  let session = null

  const host = document.createElement('div')
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${CSS()}</style>
    <aside class="panel" aria-label="Peek" aria-hidden="true">
      <div class="top">
        <h2>Peek</h2>
        <div class="actions">
          <button class="switch" role="switch" data-act="hints"><span>Hints</span><i></i></button>
          <button class="icon" data-act="close" aria-label="Close">${CLOSE}</button>
        </div>
      </div>
      <div class="body">
        <section class="puzzle">
          <div class="row">
            <h3 class="date"></h3>
            <div class="nav">
              <button class="icon step" data-step="-1" aria-label="Previous puzzle">${PREV}</button>
              <button class="icon step" data-step="1" aria-label="Next puzzle">${NEXT}</button>
            </div>
          </div>
          <button class="tiles hint" data-act="reveal" aria-label="Reveal answer">${tiles(5)}</button>
          <div class="row">
            <p class="meta"></p>
            <button class="text hint" data-act="reveal">Reveal</button>
          </div>
          <button class="go" data-act="go"></button>
        </section>
        <section class="voice">
          <button class="mic" aria-label="Hold to talk">${MIC}</button>
          <div><p class="said">Hold to talk</p><p class="sub">or hold space</p></div>
        </section>
        <section class="possible hint">
          <div class="row head"><h3>Possible</h3><span class="count"></span></div>
          <div class="best"><span>Try</span><button class="mini">${tiles(5)}</button></div>
          <div class="words likely"></div>
          <button class="text more" data-act="more"></button>
          <div class="words rare"></div>
        </section>
      </div>
    </aside>`
  document.body.append(host)

  const $ = s => root.querySelector(s)
  const panel = $('.panel')

  // header button borrows the game's own icon button styling
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.setAttribute('aria-label', 'Peek')
  toggle.innerHTML = EYE
  toggle.addEventListener('click', () => {
    toggle.blur()
    setOpen(!isOpen)
  })

  function mountToggle() {
    if (toggle.isConnected) return
    // newer header first, older layout still served to some players
    const menu = document.querySelector('[class*="AppHeader-module_toolbar__menu"], [class*="AppHeader-module_menuRight"]')
    if (!menu) return
    toggle.className = menu.querySelector('button')?.className || ''
    menu.prepend(toggle)
  }

  function readBoard() {
    return [...document.querySelectorAll('[class*="Row-module_row"]')].flatMap(row => {
      const cells = [...row.querySelectorAll('[data-state]')]
      const pattern = cells.map(c => STATE[c.dataset.state] || '').join('')
      const word = cells.map(c => c.textContent.trim().toLowerCase()).join('')
      return cells.length === 5 && pattern.length === 5 && /^[a-z]{5}$/.test(word) ? [{ word, pattern }] : []
    })
  }

  // picks up the puzzle on load and after any in-page navigation
  function syncPuzzle() {
    const d = currentDate()
    if (d === date) return
    date = d
    revealed = false
    if (store.last && store.last !== d) store.dir = d > store.last ? 1 : -1
    store.last = d
    save()
    loadPuzzle(d)
  }

  async function loadPuzzle(d) {
    if (puzzles[d] && puzzles[d] !== 'error') return
    puzzles[d] = null
    try {
      const res = await fetch(`https://www.nytimes.com/svc/wordle/v2/${d}.json`)
      if (!res.ok) throw new Error(res.status)
      const data = await res.json()
      if (!/^[a-z]{5}$/.test(data.solution)) throw new Error('bad solution')
      puzzles[d] = data
    } catch {
      puzzles[d] = 'error'
    }
    if (d === date && isOpen) render()
  }

  // next puzzle in the direction of travel, turning around at either end
  function nextDate() {
    let step = store.dir || -1
    if (!inRange(shift(date, step))) step = -step
    return inRange(shift(date, step)) ? shift(date, step) : ''
  }

  function go(d) {
    location.href = d === today() ? '/games/wordle/index.html' : `/games/wordle/${d}`
  }

  function render() {
    const puzzle = typeof puzzles[date] === 'object' ? puzzles[date] : null
    const word = revealed && puzzle ? puzzle.solution : ''
    $('.date').textContent = date === today() ? 'Today' : fmt(date, { year: 'numeric' })
    root.querySelectorAll('.step').forEach(b => {
      const step = Number(b.dataset.step)
      b.disabled = !inRange(shift(date, step))
      b.classList.toggle('lead', step === (store.dir || -1))
    })
    $('.tiles').classList.toggle('revealed', !!word)
    $('.tiles').setAttribute('aria-label', word ? word.toUpperCase() : 'Reveal answer')
    root.querySelectorAll('.tiles span').forEach((s, i) => { s.textContent = word[i] || '' })
    $('[data-act="reveal"].text').textContent = revealed ? 'Hide' : 'Reveal'
    $('.meta').textContent = puzzle
      ? [`No. ${puzzle.days_since_launch}`, puzzle.editor].filter(Boolean).join(' · ')
      : puzzles[date] === 'error' ? 'Couldn’t load this puzzle' : ''

    const guesses = readBoard()
    const over = guesses.length === 6 || guesses.some(g => g.pattern === 'ggggg')
    const next = nextDate()
    $('.go').hidden = !over || !next
    if (next) $('.go').textContent = `Play ${fmt(next, next.slice(0, 4) === date.slice(0, 4) ? {} : { year: 'numeric' })}`

    const hints = store.hints !== false
    panel.classList.toggle('clean', !hints)
    $('.switch').setAttribute('aria-checked', String(hints))
    if (!hints) return

    const extra = puzzle && !KNOWN.has(puzzle.solution) ? [puzzle.solution] : []
    const key = JSON.stringify(guesses) + extra + showRare
    if (key === lastKey) return
    lastKey = key

    const { likely, rare, best } = guesses.length
      ? solve(guesses, LIKELY.concat(extra), VALID)
      : { likely: LIKELY.concat(extra), rare: VALID, best: OPENER }
    const main = likely.length ? likely : rare
    const list = words => words.map(w => `<button data-word="${w}">${w}</button>`).join('')

    $('.count').textContent = (likely.length + rare.length).toLocaleString()
    $('.best').hidden = over || !best
    root.querySelectorAll('.mini span').forEach((s, i) => { s.textContent = best[i] || '' })
    $('.mini').dataset.word = best
    $('.mini').setAttribute('aria-label', best)
    $('.likely').innerHTML = main.length ? list(main) : '<p class="empty">Nothing fits</p>'
    const hasRare = likely.length > 0 && rare.length > 0
    $('.more').hidden = !hasRare
    $('.more').textContent = showRare ? 'Fewer' : `${rare.length.toLocaleString()} more`
    $('.rare').innerHTML = hasRare && showRare ? list(rare) : ''
  }

  function setOpen(next) {
    isOpen = next
    store.open = next
    save()
    panel.classList.toggle('open', isOpen)
    panel.setAttribute('aria-hidden', String(!isOpen))
    toggle.setAttribute('aria-pressed', String(isOpen))
    if (isOpen) {
      lastKey = ''
      render()
      if (store.voice) loadVoice()
    }
  }

  // types the word into the current row, optionally submitting it
  async function play(word, submit = true) {
    const press = key => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    for (const key of [...Array(5).fill('Backspace'), ...word, ...(submit ? ['Enter'] : [])]) {
      press(key)
      await new Promise(r => setTimeout(r, 25))
    }
  }

  // first real five letter word heard, also accepts one spelled out letter by letter
  function pickWord(texts) {
    const options = texts.flatMap(t => {
      const tokens = t.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
      return [...(tokens.every(x => x.length === 1) ? [tokens.join('')] : []), ...tokens]
    }).filter(w => /^[a-z]{5}$/.test(w))
    return options.find(w => KNOWN.has(w)) || options[0] || ''
  }

  function say(text, isWord = false) {
    $('.said').textContent = text
    $('.said').classList.toggle('word', isWord)
  }

  // offline speech limited to Wordle words, plus single letters so rare words can be spelled out
  function loadVoice() {
    voice ||= Vosk.createModel(chrome.runtime.getURL('voice/model.tar.gz'), -2).then(model => {
      const grammar = JSON.stringify([...KNOWN, ...'abcdefghijklmnopqrstuvwxyz', '[unk]'])
      // the worker rebuilds the recognizer itself if the mic runs at another rate
      const recognizer = new model.KaldiRecognizer(48000, grammar)
      recognizer.on('result', m => {
        session?.texts.push(m.result.text)
        session?.resolve?.()
      })
      // the worker reports failures as events, without this they are silent and audio is dropped
      recognizer.on('error', m => {
        console.warn('[peek] recognizer:', m.error)
        if (session && !/not ready/i.test(m.error)) session.error = 'Voice error: ' + m.error
      })
      recognizer.on('partialresult', m => {
        if (session && m.result.partial) say(m.result.partial)
      })
      store.voice = true
      save()
      return { recognizer }
    })
    voice.catch(() => { voice = null })
    return voice
  }

  async function listen() {
    if (session) return
    const s = session = { texts: [], peak: 0 }
    $('.mic').classList.add('on')
    say(store.voice ? 'Listening' : 'Getting voice ready')
    try {
      const [v, stream] = await Promise.all([
        loadVoice(),
        navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }),
      ])
      s.voice = v
      s.stream = stream
      if (s.released) return finish(s)
      say('Listening')
      // raw mic frames straight from the track, no AudioContext that can sit suspended and feed silence
      const reader = new MediaStreamTrackProcessor({ track: stream.getAudioTracks()[0] }).readable.getReader()
      s.pump = (async () => {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) return
          const samples = new Float32Array(value.numberOfFrames)
          value.copyTo(samples, { planeIndex: 0, format: 'f32-planar' })
          for (const x of samples) if (Math.abs(x) > s.peak) s.peak = Math.abs(x)
          v.recognizer.acceptWaveformFloat(samples, value.sampleRate)
          value.close()
        }
      })()
    } catch (err) {
      console.warn('[peek] voice:', err)
      s.error = err?.name === 'NotAllowedError' ? 'Microphone blocked for this site'
        : err?.name === 'NotFoundError' ? 'No microphone available'
        : 'Voice couldn\u2019t load'
      finish(s)
    }
  }

  function stop() {
    if (!session || session.released) return
    session.released = true
    if (session.pump) finish(session)
  }

  async function finish(s) {
    s.stream?.getTracks().forEach(t => t.stop())
    if (s.pump) {
      await s.pump.catch(() => {})
      // flush whatever is still being decoded, the result event resolves this
      await new Promise(r => {
        s.resolve = r
        setTimeout(r, 1500)
        s.voice.recognizer.retrieveFinalResult()
      })
    }
    session = null
    $('.mic').classList.remove('on')
    console.info('[peek] heard:', s.texts, 'peak', s.peak.toFixed(3))
    const word = pickWord(s.texts)
    const heard = s.texts.join(' ').replace(/\[unk\]/g, '').trim()
    if (word) {
      say(word, true)
      play(word, false)
    } else if (s.error) say(s.error)
    else if (!s.pump) say('Hold to talk')
    else if (s.peak < 0.002) say('No sound from the microphone')
    else say(heard ? `\u201c${heard}\u201d` : 'Didn\u2019t catch that')
  }

  const mic = $('.mic')
  mic.addEventListener('pointerdown', e => {
    mic.setPointerCapture(e.pointerId)
    listen()
  })
  mic.addEventListener('pointerup', stop)
  mic.addEventListener('pointercancel', stop)

  root.addEventListener('click', e => {
    const el = e.target.closest('button')
    if (!el) return
    el.blur()
    const act = el.dataset.act
    if (act === 'close') setOpen(false)
    else if (act === 'hints') {
      store.hints = store.hints === false
      save()
      lastKey = ''
      render()
    }
    else if (act === 'reveal') {
      revealed = !revealed
      if (puzzles[date] === 'error') loadPuzzle(date)
      render()
    } else if (act === 'more') {
      showRare = !showRare
      render()
    } else if (act === 'go') go(nextDate())
    else if (el.dataset.step) go(shift(date, Number(el.dataset.step)))
    else if (el.dataset.word) play(el.dataset.word)
  })

  window.addEventListener('keydown', e => {
    if (isOpen && e.key === 'Escape') setOpen(false)
    if (isOpen && e.code === 'Space') {
      e.preventDefault()
      if (!e.repeat) listen()
    }
  }, true)
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') stop()
  }, true)

  chrome.runtime.onMessage.addListener(msg => {
    if (msg === 'toggle') setOpen(!isOpen)
  })

  new MutationObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      mountToggle()
      syncPuzzle()
      if (isOpen) render()
    }, 120)
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
  mountToggle()
  syncPuzzle()
  if (store.open) setOpen(true)

  function CSS() {
    return `
:host { all: initial; position: fixed; inset: 0 0 0 auto; z-index: 2147483000; pointer-events: none; }
.panel {
  --bg: var(--color-tone-7, #fff);
  --ink: var(--color-tone-1, #1a1a1b);
  --muted: var(--color-tone-2, #787c7e);
  --hint: var(--color-tone-3, #878a8c);
  --line: var(--color-tone-4, #d3d6da);
  --correct: var(--color-correct, #6aaa64);
  --sans: nyt-franklin, 'Clear Sans', 'Helvetica Neue', Arial, sans-serif;
  pointer-events: auto;
  box-sizing: border-box;
  width: min(360px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--ink);
  font: 400 14px/1.4 var(--sans);
  border-left: 1px solid var(--line);
  box-shadow: -12px 0 32px -16px rgb(0 0 0 / 0.18);
  transform: translateX(100%);
  visibility: hidden;
  transition: transform 200ms cubic-bezier(0.4, 0, 1, 1), visibility 0s 200ms;
}
.panel.open {
  transform: none;
  visibility: visible;
  transition: transform 340ms cubic-bezier(0.16, 1, 0.3, 1);
}
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
button:disabled { cursor: default; opacity: 0.3; }
button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; border-radius: 2px; }
[hidden] { display: none !important; }

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 12px 24px;
  border-bottom: 1px solid var(--line);
}
.actions { display: flex; align-items: center; gap: 8px; }
.switch { display: flex; align-items: center; gap: 8px; padding: 6px 4px; font-size: 13px; font-weight: 600; color: var(--muted); }
.switch i { position: relative; width: 32px; height: 20px; border-radius: 999px; background: var(--line); transition: background 160ms; }
.switch i::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgb(255 255 255);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.switch[aria-checked="true"] { color: var(--ink); }
.switch[aria-checked="true"] i { background: var(--correct); }
.switch[aria-checked="true"] i::after { transform: translateX(12px); }
.clean .hint { display: none !important; }
h2 { margin: 0; font: 700 28px/1 nyt-karnakcondensed, Georgia, serif; letter-spacing: -0.01em; }
.icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: var(--ink); }
.icon:not(:disabled):hover { background: color-mix(in srgb, var(--line) 50%, transparent); }

.body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
section { padding: 24px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h3 { margin: 0; font: 700 12px/1 var(--sans); letter-spacing: 0.1em; text-transform: uppercase; }
.text { font-size: 13px; font-weight: 600; padding: 4px 0; text-underline-offset: 3px; }
.text:hover { text-decoration: underline; }

.puzzle { display: grid; gap: 16px; padding-top: 16px; }
.nav { display: flex; gap: 2px; margin-right: -10px; }
.step { width: 36px; height: 36px; color: var(--muted); }
.step.lead:not(:disabled) { color: var(--ink); }
.tiles {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  width: 100%;
  perspective: 600px;
}
.tiles span {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  border: 2px solid var(--line);
  font: 700 32px/1 var(--sans);
  text-transform: uppercase;
  color: rgb(255 255 255);
  transition: border-color 120ms;
}
.tiles:not(.revealed):hover span { border-color: var(--hint); }
.tiles:not(.revealed):active span { transform: scale(0.97); }
.tiles.revealed span {
  animation:
    flip 520ms ease-in-out calc(var(--i) * 180ms) both,
    paint 520ms linear calc(var(--i) * 180ms) both;
}
@keyframes flip {
  0%, 100% { transform: rotateX(0); }
  50% { transform: rotateX(-90deg); }
}
@keyframes paint {
  0%, 49.9% { background: transparent; border-color: var(--line); color: transparent; }
  50%, 100% { background: var(--correct); border-color: var(--correct); color: rgb(255 255 255); }
}
.meta { margin: 0; color: var(--muted); font-size: 13px; min-height: 1.4em; }
.go {
  height: 48px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--bg);
  font-size: 16px;
  font-weight: 600;
  animation: rise 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.go:hover { opacity: 0.88; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } }

.voice { display: flex; align-items: center; gap: 16px; border-top: 1px solid var(--line); }
.mic {
  flex: none;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid var(--line);
  color: var(--ink);
  touch-action: none;
  user-select: none;
  transition: background 150ms, border-color 150ms, transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
}
.mic:hover { border-color: var(--hint); }
.mic.on {
  background: var(--correct);
  border-color: var(--correct);
  color: rgb(255 255 255);
  transform: scale(1.06);
  animation: pulse 1.2s ease-out infinite;
}
@keyframes pulse {
  from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--correct) 45%, transparent); }
  to { box-shadow: 0 0 0 14px transparent; }
}
.said { margin: 0; font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
.said.word { letter-spacing: 0.08em; text-transform: uppercase; }
.sub { margin: 2px 0 0; font-size: 13px; color: var(--muted); }

.possible { border-top: 1px solid var(--line); padding-top: 0; }
.head { position: sticky; top: 0; z-index: 1; background: var(--bg); padding: 24px 0 12px; }
.count { font-size: 13px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }

.best { display: flex; align-items: center; gap: 12px; margin: 4px 0 20px; color: var(--muted); }
.mini { display: grid; grid-template-columns: repeat(5, 30px); gap: 4px; }
.mini span {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  border: 2px solid var(--hint);
  font: 700 17px/1 var(--sans);
  text-transform: uppercase;
  color: var(--ink);
  transition: border-color 120ms, transform 120ms;
}
.mini:hover span { border-color: var(--ink); }
.mini:active span { transform: scale(0.94); }

.words {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 2px 4px;
  margin: 0 -8px;
}
.words button {
  padding: 6px 8px;
  border-radius: 4px;
  text-align: left;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.words button:hover { background: color-mix(in srgb, var(--line) 55%, transparent); }
.rare button { color: var(--muted); font-weight: 500; }
.more { margin: 16px 0 12px; color: var(--muted); }
.more:hover { color: var(--ink); }
.empty { margin: 0 8px; color: var(--muted); }

@media (prefers-reduced-motion: reduce) {
  .panel, .panel.open { transition: none; }
  .tiles.revealed span, .go { animation-duration: 1ms; animation-delay: 0s; }
  .mic.on { animation: none; }
}`
  }
})()
