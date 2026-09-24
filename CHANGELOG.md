# Changelog

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
