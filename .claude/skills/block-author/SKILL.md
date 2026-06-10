---
name: block-author
description: >
  Author board/component-specific block catalog YAML files for the platformio-blocks
  visual programming system. Use this skill whenever the user asks to create blocks for a
  specific Arduino board, component, sensor, or actuator — e.g. "create blocks for the
  Arduino Nesso N1", "make blocks for the Modulino Thermo", "generate block catalog for
  the BME280 sensor". Also use when the user mentions "board-specific blocks",
  "component catalog", or wants to turn a hardware library's API into visual blocks.
  Even if they just say "add blocks for X" where X is a hardware component, this skill applies.
---

# Block Author

Author block catalog YAML for a hardware board, component, sensor, or actuator.

## MANDATORY — every time, no exceptions

Before you design, generate, or edit ANY block, you MUST read BOTH of these files. Open and read
them yourself, automatically, without asking the user for permission (a one-line preamble is fine).
Do NOT rely on memory. Do NOT skip them. Do NOT decide they are unnecessary.

1. **`.claude/skills/block-author/blockly_schema.yaml`** — READ THIS FIRST. The schema and anatomy
   of a Blockly block; the ONLY authority for which keys and shapes are valid under
   `implementations[].blocks[].blockly`. Re-read it for EVERY block you author. NEVER invent a field
   or structure from memory.
2. **`.claude/skills/block-author/reference.md`** — the authoring workflow (Phases 0–3) and the full
   catalog reference (archetypes, field types, type-checks, codegen, file structure, naming,
   dependencies, structural checks, worked example). Follow its workflow EXACTLY, in order.

## MANDATORY — tooling (`blocks-editor` MCP server, in both Claude Code and Copilot)

- Call **`list-builtin-blocks`** BEFORE designing. NEVER recreate a block it already lists.
- Validate EVERY catalog with **`validate-catalog`** BEFORE saving. Do NOT eyeball validity. Fix
  every error and re-validate until it passes clean.

Output: save validated `.yaml` files into the project's `.blocks/` directory (filename ends in
`.yaml`/`.yml`, no path separators, no `..`). If no filesystem is available, present each file as a
fenced code block with a suggested filename. Never hardcode a destination path.
