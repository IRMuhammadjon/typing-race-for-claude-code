# zerikma

> *Zerikma* means **"don't get bored"** in Uzbek.

Mini games in your terminal while Claude Code works: **Typing Race**, **2048** and **Bug Smash**. Zerikma watches your Claude Code sessions. When one finishes it pauses the game, rings the terminal bell and tells you which session is done.

```
npx zerikma
```

Run it in a second terminal tab, a tmux split or a Windows Terminal pane, next to `claude`.

## Open it next to Claude automatically

```
npx zerikma open
```

This opens the games in the right place for you:

| Where you are | What happens |
|---|---|
| tmux | splits the window and opens the games on the right |
| Windows Terminal | opens a new split pane |
| Claude inside VS Code | opens the Zerikma panel ([VS Code extension](https://marketplace.visualstudio.com/items?itemName=MuhammadjonRahmatullayev.typing-race-for-claude-code)) |
| anything else | opens a new terminal window |

## `/zerikma` inside Claude Code

Install the plugin once, then type `/zerikma` in any Claude Code session:

```
/plugin marketplace add IRMuhammadjon/typing-race-for-claude-code
/plugin install zerikma@zerikma
```

`/zerikma 2048` or `/zerikma bug` starts a specific game.

## News tab

The first tab shows short Claude Code tips in English, Uzbek or Russian, with the exact command and a docs link. `←` `→` to browse, `o` to open the docs, `r` to jump to a tip related to what Claude is doing right now. New tips are fetched from GitHub at most every 6 hours; run `zerikma --offline` to skip that.

## Games

- **Typing Race**: a Monkeytype-style test with programming words, from `if for let` up to `x?.y??z`
- **2048**: the classic, in calm serika colors
- **Bug Smash**: breakout where the bricks are bugs (`null`, `TODO`, `NaN`…) and the power-ups are Claude tools: Grep, Bash, Read, Plan, Ultrathink… and Rate limit, which shrinks your paddle. In terminals that support it, the mouse moves the paddle too.

## Work first, then play

When Claude finishes you get 10 seconds to finish your round, then the game locks until you reply to Claude. A timer shows how long Claude has been waiting, and in tmux and Windows Terminal the cursor jumps back to Claude's pane. Reply within 30 seconds for a ⚡ quick-reply streak. `ctrl+t` gives you 2 more minutes, once an hour. Run `zerikma --gentle` to only pause instead.

## Keys

| Key | Action |
|---|---|
| `ctrl+n` | next game |
| `tab` | restart |
| `esc` / `enter` | pause / resume |
| `ctrl+l` | language: English, O'zbekcha, Русский |
| `ctrl+t` | 2 more minutes when the game is locked (once an hour) |
| `ctrl+c` | quit |

Options: `zerikma news`, `zerikma 2048`, `zerikma bug`, `zerikma --lang uz`, `zerikma --offline`.

## Privacy

Everything runs locally. Zerikma reads only the last few KB of Claude Code session files in `~/.claude/projects`, to see whether a session is working or done. The only network request downloads the public tips file from GitHub, at most every 6 hours (`--offline` skips it); nothing about you is sent.

Not affiliated with Anthropic. Made by [Muhammadjon Rahmatullayev](https://www.linkedin.com/in/muhammadjon-rahmatullayev-b9356a321/). MIT License.
