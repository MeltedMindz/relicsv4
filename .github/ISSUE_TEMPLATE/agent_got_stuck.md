---
name: My agent got stuck
about: An AI coding agent could not complete a creator-kit task by following AGENTS.md
title: "[agent] "
labels: documentation, agent-experience
---

<!--
This template is for gaps in the instructions an AI agent is given — not for bugs in your own
art code. If an agent had to guess, had to read package source to find something, or confidently
did the wrong thing, that is a defect in AGENTS.md and we want to know.
-->

**What you asked the agent to do**
The brief or instruction, in your own words.

**Which agent**
e.g. Claude Code, Codex, Cursor, Copilot, Aider, other. Include the model if you know it.

**Where it got stuck**
Which step of `docs/creator-kit/create-with-an-agent.md`, or which command.

**What it did instead**
Did it guess a value? Invent a field? Try to edit `packages/project-schema/`? Hang on a command?
Claim something you could not verify? Be specific — the wrong behaviour is the useful part.

**Exact output**
Paste the full output of the failing command, not a summary.

```
[ paste here ]
```

**What was missing from AGENTS.md**
If you can name it: the thing the agent needed to know and could not find. A guess is fine.

**Environment**
- OS:
- Node version (`node --version`):
- Command run:

---

Please do NOT paste private keys, mnemonics, RPC URLs with embedded credentials, or wallet
material into this issue. This is a public repository. A placeholder address is fine.
