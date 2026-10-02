// toolbar icon toggles the panel, or opens Wordle when it isn't the current tab
chrome.action.onClicked.addListener(tab => {
  chrome.tabs.sendMessage(tab.id, 'toggle').catch(() => {
    chrome.tabs.create({ url: 'https://www.nytimes.com/games/wordle/index.html' })
  })
})
