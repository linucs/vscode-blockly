# Change Log

All notable changes to the "Blocks Editor" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## [0.3.1] - 2026-06-15

### Fixed

- **Project-local `.blocks/` catalogs in multi-root and nested-project workspaces** — catalogs in a project's `.blocks/` directory are now resolved at the workspace folder root containing the open file, matching `gatherLocalCatalogs()` and the catalog tree's `resolveBlocksDir()`, instead of relative to the project config file's directory. Previously, projects whose `platformio.ini` / `sketch.yaml` / `app.yaml` did not sit at the workspace folder root could fail to load their project-local catalogs.

## [0.3.0] - 2026-06-15

### Added

- **Python code generation (Arduino App Lab)** — a new `arduino:python` runtime sits alongside `arduino:cpp`. Projects with an `app.yaml` (Arduino App Lab apps, built around `python/main.py`) now open in the Blocks Editor and generate **Python** instead of C++. App Lab is detected as a third project backend next to PlatformIO and Arduino CLI, with dependencies routed to the right place: pip packages → `python/requirements.txt`, bricks → `app.yaml`, Arduino libraries → `sketch/sketch.yaml` (all add-only).
- **Contribute Catalog** — a new **"Blocks Editor: Contribute Catalog to Community…"** command (also on the right-click menu for `.blocks/*.yaml` files) validates a locally authored catalog and submits it to the community repo, either by opening a **pull request** (native GitHub auth, automatic fork — no git needed) or a **pre-filled issue** in the browser. The destination repo is configurable via `blocks-editor.contributionRepo`.
- **"Open in Blocks Editor" command** — opening a source file no longer requires the "Open With…" submenu. A dedicated command appears directly on the Explorer and editor-title context menus for `.ino`, `.pde`, `.cpp`, and `.py` files.
- **In-editor generation controls** — a **Generate code** split button in the toolbar generates on demand and carries a **"Generate automatically on change"** toggle, surfacing the `blocks-editor.generateOnChange` setting right where you work.
- **switch/case block** — a new Logic block for multi-way branching, with C++ and Python generators.

### Changed

- **AI assistant setup unified** — the GitHub Copilot `@blocks` chat participant and its `/research`, `/design`, `/generate`, `/validate` slash commands have been removed in favor of a single **block-author skill** shared by both hosts. The renamed **"Blocks Editor: Set Up AI Assistants (Copilot & Claude Code)"** command writes `.mcp.json` (Claude Code MCP server), installs the skill under `.claude/skills/block-author/`, and generates `.github/instructions/block-author.instructions.md` so Copilot follows the same workflow. Re-run it after upgrading to refresh the server path and skill files.
- **Generation and project-packaging refactor** — the code-generation engine was restructured around a runtime registry (`<framework>:<language>`) so C++ and Python share the same pipeline, plus internal project-packaging cleanups.
- The custom editor's display name is now **"Blocks Editor (Visual Programming)"**.
- The README has been refreshed to cover Python/App Lab projects, the new toolbar, the AI-assistant setup, and contributing catalogs back to the community.

### Fixed

- Disabled workspace auto-focus in the webview, which was causing the context menu to misbehave.

## [0.2.1] - 2026-06-08

### Changed

- The "Generate C++" button and the corresponding setting are now labelled **"Generate Code"** across all 15 languages, reflecting that the generation engine is selected by runtime rather than by language.

### Fixed

- **Multi-root workspaces** — downloading a community catalog and enabling the Claude Code integration now prompt for which workspace folder to target instead of assuming the first one. Folder resolution is centralized in a new `workspaceRoot` utility.

## [0.2.0] - 2026-06-07

### Added

- **Multi-language support** — the extension is now fully localized in 14 languages besides English: Czech, German, Spanish, French, Hungarian, Italian, Japanese, Korean, Polish, Brazilian Portuguese, Russian, Turkish, Simplified Chinese, and Traditional Chinese. Manifest, extension UI, webview, Blockly's built-in UI, and the custom blocks all follow VS Code's display language.
- **"Compile & upload" walkthrough step** — the welcome walkthrough now includes a step explaining that Blocks Editor focuses on visual programming and pointing to the companion **Arduino CLI IDE** extension for compiling, uploading, and monitoring.

### Changed

- The `sketch.yaml` library merge now reads the file fresh from disk immediately before writing, minimizing the lost-update window when the optional Arduino CLI daemon rewrites the same file.

## [0.1.2] - 2026-06-05

### Added

- **Arduino CLI default environment** — sketches that only declare `default_fqbn` (the common result of `arduino-cli board attach`, with no named profiles) now work out of the box: a default environment is synthesized from the FQBN so the board-aware toolbox loads without requiring a hand-written profile.

### Changed

- When dependencies are merged into a sketch that has no profiles, a profile is now created automatically from `default_fqbn` (named after the board) and set as `default_profile`.

### Fixed

- The environment selector now shows a localized "Default" label for the synthesized default environment instead of a blank entry.

## [0.1.1] - 2026-06-05

### Added

- **Documentation button** — a toolbar icon that opens a QuickPick with documentation links from loaded block catalogs (library references, datasheets, API docs). Links are grouped by catalog entry.
- **Welcome walkthrough** — a 4-step onboarding guide that opens automatically on first install and after updates. Covers opening the editor, authoring custom blocks, browsing community catalogs, and contributing.
- **Catalog metadata** — `author` and `version` fields added to the catalog schema for community attribution.
- **Documentation links** for built-in SPI, Wire, and String catalogs pointing to the official Arduino reference.

### Fixed

- Toolbar dropdown (Environment selector) now renders above the Blockly toolbox instead of falling behind it.

## [0.1.0] - 2026-06-04

### Added

- **Community catalog browser** — a new activity-bar view that lists block catalogs from a community registry. Browse available catalogs, search them, refresh the list, and download a catalog into your workspace with one click.
- **Configurable registry source** — point the browser at any registry index via the `blocks-editor.catalogRegistryUrl` setting (defaults to the official community catalog).

### Changed

- Refinements across the built-in Arduino catalogs (Digital/Analog I/O, Serial, SPI, Wire, Math, Strings, Time, Interrupts, and others).
- Added a **Community** section to the README pointing to GitHub Discussions.

## [0.0.1] - 2026-06-02

First public preview.

### Added

- **Visual block editor for source files** — open any `.cpp`, `.ino`, `.c` (and `.cc`, `.cxx`, `.pde`) file with the Blocks Editor and build your program by dragging blocks instead of typing code.
- **Live C++ code generation** — blocks generate real Arduino/C++ code as you build; `setup()` and `loop()` update automatically.
- **Multi-backend toolchain support** — automatic detection of PlatformIO (`platformio.ini`) and Arduino CLI (`sketch.yaml`) projects, with a chooser when both are present.
- **Board-aware toolbox** — reads the active board and framework from your project config and shows only the blocks that apply.
- **Automatic dependency management** — libraries required by the blocks in use are merged into your project config (add-only): `lib_deps` for PlatformIO, `libraries` for the Arduino CLI.
- **Persistent block state** — your layout is saved in a companion `.blk` file next to the source.
- **Extensible block catalogs** — define blocks in YAML and load them from local directories or remote URLs.
- **Built-in Arduino blocks** — Digital I/O, Analog I/O, Serial, SPI, Wire (I2C), Math, Strings, Time, Interrupts, and more, plus the standard Blockly categories (Logic, Loops, Math, Text, Variables, Arrays, Functions).
- **Workspace conveniences** — optional minimap, toolbox search, and customizable category colors.
- **Block Author chat participant** (`@blocks`) — assists in creating new block catalogs for hardware libraries.

[0.3.0]: https://github.com/linucs/vscode-blockly/releases/tag/v0.3.0
[0.2.1]: https://github.com/linucs/vscode-blockly/releases/tag/v0.2.1
[0.2.0]: https://github.com/linucs/vscode-blockly/releases/tag/v0.2.0
[0.1.2]: https://github.com/linucs/vscode-blockly/releases/tag/v0.1.2
[0.1.1]: https://github.com/linucs/vscode-blockly/releases/tag/v0.1.1
[0.1.0]: https://github.com/linucs/vscode-blockly/releases/tag/v0.1.0
[0.0.1]: https://github.com/linucs/vscode-blockly/releases/tag/v0.0.1
