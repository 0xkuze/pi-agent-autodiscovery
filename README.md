# pi-agent-autodiscovery

Pi extension that auto-detects user intent and dispatches to the right [pi-subagents](https://github.com/nicobailon/pi-subagents) agent.

## Problem

LLMs have strong trained priors to use `bash`/`grep`/`find` directly for tasks like code exploration, even when the `subagent` tool is available. System prompt instructions alone cannot override these behavioral priors — the model ignores them and falls back to direct tool use.

## Solution

Two-layer approach:

1. **System prompt patching** — Adds `subagent` to pi's "Available tools" list and replaces the default "Prefer grep/find" guideline with one that prefers subagent for non-trivial tasks.

2. **Conversation injection** — When the user's prompt matches an agent pattern (explore, build, research, review, etc.), injects a hidden `role:"user"` message with explicit dispatch instructions. Models treat conversation messages with much higher priority than system prompt guidelines.

## Install

```bash
pi install git:github.com/0xkuze/pi-agent-autodiscovery
```

Requires [pi-subagents](https://github.com/nicobailon/pi-subagents) to be installed.

## Usage

Once installed, it works automatically. When you say:

- **"explore this code base"** → dispatches to `scout`
- **"implement a login page"** → dispatches chain: `scout` → `planner` → `worker` → `reviewer`
- **"research what ORM to use"** → dispatches to `researcher`
- **"review my changes"** → dispatches to `reviewer`
- **"refactor the auth module"** → dispatches chain: `scout` → `planner` → `worker` → `reviewer`
- **"plan the API design"** → dispatches chain: `scout` → `planner`

Small single-file edits are left for the model to handle directly.

Supports both English and Spanish intent keywords.

## Commands

- `/autodiscovery` — Toggle auto-dispatch on/off

## How it works

The extension hooks into pi's `before_agent_start` event and does two things:

### 1. System prompt patch

The `subagent` tool registered by pi-subagents doesn't include a `promptSnippet`, so it's absent from pi's "Available tools" list in the system prompt. This extension injects it and replaces the competing "Prefer grep/find/ls" guideline.

### 2. Conversation message injection

Pi's `before_agent_start` event supports returning a `message` that gets injected into the conversation as a `role:"user"` message (via pi's `convertToLlm` in `messages.ts`). The message has `display: false` so the user doesn't see it, but the LLM does.

This is the key mechanism — system prompt instructions are weak suggestions that models can ignore, but conversation messages are direct instructions that models follow.

## Uninstall

```bash
pi remove git:github.com/0xkuze/pi-agent-autodiscovery
```
