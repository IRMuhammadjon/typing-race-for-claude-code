---
name: zerikma
description: Open Zerikma mini games (typing race, 2048, Bug Smash) next to Claude while it works.
disable-model-invocation: true
argument-hint: "[typing | 2048 | bug]"
allowed-tools: Bash(node *) PowerShell(node *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/cli/bin/zerikma.js" open $ARGUMENTS`

The line above is the result of opening the Zerikma games for the user. Reply with exactly one short, friendly sentence in the user's language that says where the games opened (or, if it failed, what to run instead: `npx zerikma`). Do not run any tools and do not add anything else.
