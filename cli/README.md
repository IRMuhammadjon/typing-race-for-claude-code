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

## Games

- **Typing Race**: a Monkeytype-style test with programming words, from `if for let` up to `x?.y??z`
- **2048**: the classic, in calm serika colors
- **Bug Smash**: breakout where the bricks are bugs (`null`, `TODO`, `NaN`…) and the power-ups are Claude tools: Grep, Bash, Read, Plan, Ultrathink… and Rate limit, which shrinks your paddle. In terminals that support it, the mouse moves the paddle too.

## Keys

| Key | Action |
|---|---|
| `ctrl+n` | next game |
| `tab` | restart |
| `esc` / `enter` | pause / resume |
| `ctrl+l` | language: English, O'zbekcha, Русский |
| `ctrl+c` | quit |

Options: `zerikma 2048`, `zerikma bug`, `zerikma --lang uz`.

## Privacy

Everything runs locally. Zerikma reads only the last few KB of Claude Code session files in `~/.claude/projects`, to see whether a session is working or done. Nothing is sent anywhere.

Not affiliated with Anthropic. Made by [Muhammadjon Rahmatullayev](https://www.linkedin.com/in/muhammadjon-rahmatullayev-b9356a321/). MIT License.
