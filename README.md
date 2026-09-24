# Typing Race for Claude Code

**Stop staring at the spinner.** Typing Race is a calm, Monkeytype-style typing game that opens next to Claude Code while it works, and tells you the moment a session is done.

![Typing Race while two Claude sessions are working](images/screenshot.png)

## Features

- **Works right away.** It follows Claude Code's own session files, so there's nothing to install or configure.
- **Tracks every session.** Run four Claude sessions at once and each one is listed by its title. When one finishes, you'll see *"«Fix flaky payment tests» is done"*, even while the others keep working.
- **Hard to miss.** When Claude finishes, the whole background shifts to a soft green and the game pauses. When Claude needs your permission, it turns warm amber. You won't miss it even while you're focused on typing.
- **Easy on the eyes.** The low-contrast "serika dark" palette has no pure white or pure black. The caret moves smoothly, and only three lines of text are shown at a time.
- **Starts easy.** There are 6 levels: `if for let` → `class async` → `return promise` → `constructor` → `useEffect TryGetValue` → `x?.y??z`.
- **Monkeytype controls.** Typed words stay on screen. `Backspace` on an empty word jumps back to fix the previous mistake, and `Tab` restarts.
- **English, O'zbekcha, Русский.** Pick your language right in the game.

![A session finished while another is still working](images/screenshot-done.png)

## How to use

1. Install the extension.
2. Ask Claude Code something. The game opens beside the Claude panel without taking focus.
3. Click into the game and start typing.

You can also open it at any time from the **⌨ Typing Race** button in the status bar or with **Typing Race: Open Typing Race** in the command palette.

| Key | Action |
|---|---|
| `space` | next word |
| `backspace` | delete / go back to the previous wrong word |
| `ctrl+backspace` | clear the word |
| `tab` | restart |
| `esc` | pause |
| `enter` | resume |

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

Licensed under the [MIT License](LICENSE).
