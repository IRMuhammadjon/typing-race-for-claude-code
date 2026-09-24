# Typing Race for Claude Code

**Stop staring at the spinner.** Three calm mini-games open next to Claude Code while it works, and they tell you the moment a session is done.

![Typing Race while two Claude sessions are working](images/screenshot.png)

## Three games

### ⌨ Typing Race
A Monkeytype-style typing test that starts easy and climbs through 6 levels: `if for let` → `class async` → `return promise` → `constructor` → `useEffect TryGetValue` → `x?.y??z`. Typed words stay on screen, and `Backspace` on an empty word jumps back to fix the previous mistake.

### ▦ 2048
The classic, in soft serika colors. Tiles slide smoothly and pop when they merge. Play with the arrow keys, WASD, or by dragging with the mouse.

![2048](images/screenshot-2048.png)

### ✳ Bug Smash
Breakout, but the bricks are bugs: `null`, `TODO`, `flaky`, `NaN`, `undefined`… Your paddle is **claude** and the ball is a spinning spark. Dashed "legacy" bricks take two hits, and 🐛 bricks always drop a bonus. The bonuses are Claude Code tools:

| Bonus | Effect |
|---|---|
| 🔍 **Grep** | wider paddle |
| ⚡ **Bash** | splits into three balls |
| 📄 **Read** | slower ball |
| 🛡️ **Plan** | one-time safety net |
| ✨ **Ultrathink** | the ball smashes straight through bricks |
| ❤️ **+1** | extra life |
| ⏳ **Rate limit** | *careful:* smaller paddle |

Move with `←` `→` or the mouse, and launch with `space` or a click.

![Bug Smash](images/screenshot-breakout.png)

## Claude-aware

- **Works right away.** It follows Claude Code's own session files, so there's nothing to install or configure.
- **Tracks every session.** Run four Claude sessions at once and each one is listed by its title. When one finishes, you'll see *"«Fix flaky payment tests» is done"*, even while the others keep working.
- **Hard to miss.** When Claude finishes, the whole background shifts to a soft green and the game pauses. When Claude needs your permission, it turns warm amber.
- **Easy on the eyes.** The low-contrast "serika dark" palette has no pure white or pure black.
- **English, O'zbekcha, Русский.** Pick your language right in the game.

![A session finished while another is still working](images/screenshot-done.png)

## How to use

1. Install the extension.
2. Ask Claude Code something. The games open beside the Claude panel without taking focus.
3. Pick a game from the tabs at the top and start playing.

You can also open them at any time from the **⌨ Typing Race** button in the status bar or with **Typing Race: Open Typing Race** in the command palette.

In every game, `tab` restarts, `esc` pauses and `enter` resumes. Bug Smash pauses automatically when you click away.

## Optional: permission alerts

Claude Code doesn't record in its session files when it's waiting for your permission. To get an amber **"Claude needs your permission"** alert as well, run **Typing Race: Install Claude Code hooks** once. This adds a small hook to `~/.claude/settings.json` and keeps a backup as `settings.json.bak-typing-race`. You can remove it any time with **Typing Race: Remove Claude Code hooks**.

## Settings

| Setting | Default | Description |
|---|---|---|
| `typingRace.autoOpen` | `true` | Open the game automatically when Claude starts working |

## Privacy

Everything stays on your machine. The extension:

- reads only the **last few KB** of Claude Code session files in `~/.claude/projects`, to see whether a session is working or done and what its title is;
- never sends anything over the network: no telemetry, no analytics, no accounts;
- stores only your best WPM and chosen language in VS Code's local storage.

## Disclaimer

This is an independent community project. It is **not affiliated with, endorsed by, or sponsored by Anthropic**. "Claude" and "Claude Code" are trademarks of Anthropic, PBC.

## Author

Made by **Muhammadjon Rahmatullayev** · [LinkedIn](https://www.linkedin.com/in/muhammadjon-rahmatullayev-b9356a321/)

Found a bug or have an idea? [Open an issue](https://github.com/IRMuhammadjon/typing-race-for-claude-code/issues).

Licensed under the [MIT License](LICENSE).
