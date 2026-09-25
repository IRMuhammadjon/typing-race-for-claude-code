# Changelog

## 0.8.1

- Fixed a finished session showing as "working": after VS Code reloads, Claude Code writes a transcript-only system note (for example about a background task) that does not start a new turn, and it is now ignored

## 0.8.0

- New first tab: **📰 News**, short Claude Code tips in English, Uzbek and Russian with the exact command and a docs link
- The news tab suggests a tip related to what Claude is doing right now (press `r`)
- New tips arrive without an update: they are generated daily from the Claude Code changelog, reviewed, and published on GitHub
- New setting `typingRace.newsOnline` (terminal: `--offline`)

## 0.7.2

- The lock now opens when you send a new prompt in any Claude session. Before, resuming a conversation (`--continue`, `/resume`) moved it to a new session and the lock kept waiting for the old one

## 0.7.1

- The lock screen is tidier: the extra-time hint moved from the overlay to the key hints line

## 0.7.0

- **Work first, then play:** when Claude finishes, you get 10 seconds to finish your round, then the game locks until you reply to Claude
- A timer shows how long Claude has been waiting (in the panel and in the tab title), and the panel turns amber after a minute
- The cursor moves to the Claude input box when the game locks (VS Code, tmux, Windows Terminal)
- ⚡ Quick reply bonus and streak when you answer Claude within 30 seconds
- `Shift+Enter` (`ctrl+t` in the terminal): 2 more minutes, once an hour
- New settings: `typingRace.strictMode`, `typingRace.focusClaude`

## 0.6.0

- New: **terminal version** (`npx zerikma`) with all three games
- New: **`/zerikma`** Claude Code plugin opens the games next to Claude: tmux split, Windows Terminal pane, new window, or this panel when Claude runs inside VS Code
- The panel can now be opened from outside VS Code through `vscode://MuhammadjonRahmatullayev.typing-race-for-claude-code/open`
- Session tracking, translations and word lists are shared between the VS Code and terminal versions

## 0.5.1

- Renamed to **Zerikma for Claude Code** ("zerikma" means "don't get bored" in Uzbek)

## 0.5.0

- New game: **2048**, with smooth sliding tiles and mouse drag support
- New game: **Bug Smash**, a breakout where you squash bugs and catch Claude-tool bonuses (Grep, Bash, Read, Plan, Ultrathink, Rate limit)
- Switch between games with the tabs at the top; each game keeps its own best score
- The game you played last opens next time

## 0.4.1

- Added screenshots and GitHub links to the Marketplace page

## 0.4.0

First public release.

- Monkeytype-style typing game with 6 levels, from very easy words to code symbols
- Detects Claude Code activity from its session files, with no setup needed
- Tracks multiple Claude sessions by title and tells you which one finished
- Changes the background color when Claude finishes or needs permission
- Optional hooks for permission-prompt alerts
- English, Uzbek and Russian interface
