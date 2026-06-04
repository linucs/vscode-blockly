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

Create declarative block catalog YAML files that turn a hardware library's API into visual
programming blocks for platformio-blocks.

## Overview

Such blocks expose board/component-specific features that go beyond the standard Arduino API
(already covered by built-in L1/L2 blocks). The skill researches the target library, designs
blocks for its public API, and generates a validated YAML catalog file.

**The output is one or more `.yaml` catalogs** (multi-document YAML, one document per
subcategory). The user places them in their project's `.blocks/` directory (or whichever path is
configured in `platformio-blocks.catalogPaths`).

**Environment-aware output:** if a filesystem is available (e.g. Claude Code), ask the user where
to save the files (or use the save tool below). If not (e.g. Claude chat), present each file as a
fenced code block with a suggested filename. Never hardcode a destination path.

## Reference — read this first

**`reference.md`** (in this skill's directory) is the single source of truth for the authoring
**workflow** (Phases 0–3) and the complete **reference**: block archetypes, field types (standard,
`@blockly` plugins, and custom fields), C++ type-check groups, codegen sections and precedence,
YAML file structure, naming conventions, dependencies, authoring rules, the validation structural
checks, project prerequisites, and a worked example. Consult it before designing or generating —
do not rely on memorized field names or structures.

## Tooling (blocks-editor MCP server)

The platformio-blocks extension ships an MCP server named **`blocks-editor`**. When it is connected
(check your available tools), **prefer these tools** over manual steps — they use the extension's
own bundled schema and code, so they stay in sync with the installed version:

| Tool | Use for | Replaces the manual step of |
|------|---------|------------------------------|
| `list-builtin-blocks` | what L1/L2 blocks already exist | guessing — call FIRST in Phase 2, never recreate a listed block |
| `fetch-url` | reading `.h` / `library.properties` / docs | ad-hoc fetching (strips HTML, truncates) |
| `search-pio-registry` | the PlatformIO dependency format | guessing `name` vs `url`+`ref` |
| `check-arduino-registry` | Arduino CLI installability | guessing (registries don't fully overlap) |
| `validate-catalog` | real AJV + structural validation | fetching the schema and validating by hand |
| `save-catalog` | writing into the project `.blocks/` | generic filesystem writes (auto-reloads) |

**Fallback when the `blocks-editor` server is NOT connected** (e.g. Claude.ai chat, or a project
where integration was never enabled):
- **Schema** — fetch it live and validate against it:
  `https://raw.githubusercontent.com/linucs/vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json`
- **Output** — present files as fenced code blocks with suggested filenames.

The user can enable the server from VS Code via the command **"Blocks Editor: Enable Claude Code
integration"**, which also installs this skill into the project's `.claude/skills/`.
