/**
 * Agent Auto-Discovery Extension
 *
 * Complements pi-subagents by automatically detecting user intent
 * and dispatching to the appropriate subagent.
 *
 * Problem: LLMs have strong trained priors to use bash/grep/find directly
 * for tasks like code exploration, even when a subagent tool is available
 * and the system prompt tells them to prefer it. System prompt instructions
 * alone cannot override these behavioral priors.
 *
 * Solution: Two-layer approach:
 * 1. System prompt patching — adds subagent to the "Available tools" list
 *    and replaces the "Prefer grep/find" guideline (weak but necessary)
 * 2. Conversation injection — injects a hidden user message with explicit
 *    dispatch instructions when the user's prompt matches an agent pattern.
 *    Custom messages become role:"user" in the LLM context, which models
 *    treat with much higher priority than system prompt guidelines.
 *
 * Usage:
 *   pi install npm:pi-agent-autodiscovery
 *
 * Commands:
 *   /autodiscovery — Toggle auto-dispatch on/off
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Intent detection patterns (English + Spanish)
// ---------------------------------------------------------------------------

interface DispatchRule {
	pattern: RegExp;
	message: string;
}

const DISPATCH_RULES: DispatchRule[] = [
	{
		pattern:
			/\b(explor[ea]|investigat?[ea]|analiz[ea]|understand|examin[ea]|map out|walk through|look at.*code|how does|c[oó]mo funciona|describe the.*(?:code|architect|struct))\b/i,
		message:
			'IMPORTANT: Use the subagent tool with agent="scout" to handle this request. Do NOT use bash, grep, find, or read directly. Call: subagent({ agent: "scout", task: "<the user request>" })',
	},
	{
		pattern:
			/\b(implement[ea]?|crea(?:te|r)|build|a[nñ]ad[eir]|add (?:a |the )?(?:feature|module|component|endpoint|page)|develop|set up|agrega)\b/i,
		message:
			'IMPORTANT: Use the subagent tool to handle this request. For simple changes use agent="worker". For complex features use a chain: subagent({ chain: [{agent:"scout", task:"Analyze codebase for: {task}"}, {agent:"planner", task:"Plan: {previous}"}, {agent:"worker", task:"Execute: {previous}"}, {agent:"reviewer", task:"Review: {previous}"}] })',
	},
	{
		pattern:
			/\b(research|compar[ea]|which is better|best practice|what (?:api|library|tool|framework)|qu[eé] librer[ií]a|busca info)\b/i,
		message:
			'IMPORTANT: Use the subagent tool with agent="researcher" to handle this request. Call: subagent({ agent: "researcher", task: "<the user request>" })',
	},
	{
		pattern:
			/\b(review|revis[ea]|audit|check (?:the |my )?(?:code|changes|impl)|validate|is this correct|look over)\b/i,
		message:
			'IMPORTANT: Use the subagent tool with agent="reviewer" to handle this request. Call: subagent({ agent: "reviewer", task: "<the user request>" })',
	},
	{
		pattern: /\b(refactor(?:iz[ea])?|restructur[ea]|clean ?up|reorganiz[ea])\b/i,
		message:
			'IMPORTANT: Use the subagent tool chain for this refactor. Call: subagent({ chain: [{agent:"scout", task:"Analyze: {task}"}, {agent:"planner", task:"Plan refactor: {previous}"}, {agent:"worker", task:"Execute: {previous}"}, {agent:"reviewer", task:"Review: {previous}"}] })',
	},
	{
		pattern: /\b(planific[ea]|plan |design|architect|dise[nñ][ea]|strategy|how should (?:i|we))\b/i,
		message:
			'IMPORTANT: Use the subagent tool for planning. Call: subagent({ chain: [{agent:"scout", task:"Analyze: {task}"}, {agent:"planner", task:"Plan: {previous}"}] })',
	},
];

// ---------------------------------------------------------------------------
// System prompt patches
// ---------------------------------------------------------------------------

const SUBAGENT_TOOL_SNIPPET =
	'- subagent: Delegate tasks to specialized subagents (scout, worker, planner, reviewer, researcher, delegate). PREFER this over doing exploration, building, fixing, reviewing, or researching yourself with bash/read/grep';

const SUBAGENT_GUIDELINE =
	'Prefer subagent tool for non-trivial tasks: use agent="scout" for codebase exploration, agent="researcher" for external research, agent="reviewer" for code review, chain (scout→planner→worker→reviewer) for building features. Use grep/find/ls only for small targeted lookups, not broad exploration';

const ORIGINAL_EXPLORE_GUIDELINE =
	'Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectDispatch(prompt: string): string | null {
	const lower = prompt.toLowerCase();
	for (const rule of DISPATCH_RULES) {
		if (rule.pattern.test(lower)) return rule.message;
	}
	return null;
}

function patchSystemPrompt(sp: string): string {
	// Add subagent to the "Available tools" list
	const marker = 'In addition to the tools above';
	const idx = sp.indexOf(marker);
	if (idx !== -1) {
		sp = sp.slice(0, idx) + SUBAGENT_TOOL_SNIPPET + '\n\n' + sp.slice(idx);
	}

	// Replace the file-exploration guideline with one that prefers subagent
	sp = sp.replace(ORIGINAL_EXPLORE_GUIDELINE, SUBAGENT_GUIDELINE);

	return sp;
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

const STATUS_KEY = 'agent-autodiscovery';

export default function agentAutodiscovery(pi: ExtensionAPI): void {
	let enabled = true;

	pi.on('session_start', (_event, ctx) => {
		ctx.ui.setStatus(STATUS_KEY, enabled ? '\x1b[32m⚡ autodiscovery\x1b[0m' : '\x1b[90m⚡ autodiscovery off\x1b[0m');
	});

	pi.registerCommand('autodiscovery', {
		description: 'Toggle agent auto-discovery (auto-dispatch to subagents)',
		handler: async (_args, ctx) => {
			enabled = !enabled;
			ctx.ui.setStatus(STATUS_KEY, enabled ? '\x1b[32m⚡ autodiscovery\x1b[0m' : '\x1b[90m⚡ autodiscovery off\x1b[0m');
			ctx.ui.notify(`Agent auto-discovery: ${enabled ? 'ON' : 'OFF'}`, 'info');
		},
	});

	pi.on('before_agent_start', (event) => {
		if (!enabled) return;

		let sp = event.systemPrompt;

		// Only patch if subagent isn't already in the tools list
		if (!sp.includes('- subagent:')) {
			sp = patchSystemPrompt(sp);
		}

		const prompt = event.prompt || '';
		const dispatch = detectDispatch(prompt);

		const result: any = { systemPrompt: sp };
		if (dispatch) {
			result.message = {
				customType: 'agent-dispatch',
				content: dispatch,
				display: false,
			};
		}
		return result;
	});
}
