# Blocks Editor — Release Notes

Build programs for Arduino by **dragging colorful blocks** — like Scratch, but it writes real C++ (or Python, for Arduino App Lab apps) for you. The blocks are the source of truth; the generated `.cpp`/`.ino`/`.py` stays in sync automatically.

> **Works on top of your existing toolchain** — you need **one** of [PlatformIO](https://platformio.org/install/ide?install=vscode) or the [Arduino CLI](https://arduino.github.io/arduino-cli/). Blocks Editor reads your project to know which board you're targeting; it never builds or flashes on its own. To compile and upload from inside VS Code, install the sister extension [**Arduino CLI IDE**](https://marketplace.visualstudio.com/items?itemName=linucs.vscode-arduino-cli-ide).

---

## v0.3.2 — 2026-06-15

- **See which block wrote which line** — generated code now carries a short comment above each statement, naming the block that produced it (from the block's tooltip), so the source reads like a guided tour of your blocks. Any comment you write on a block yourself always shows up too. On by default; turn the tooltip comments off with the new **"Annotate generated code"** setting (your own comments stay either way).

## v0.3.1 — 2026-06-15

- **Project catalogs found in more layouts** — blocks in a project's `.blocks/` folder now load reliably in multi-root and nested-project workspaces, even when your `platformio.ini` / `sketch.yaml` / `app.yaml` doesn't sit at the workspace root.

## v0.3.0 — 2026-06-15

- **Now writes Python, too (Arduino App Lab)** — open an Arduino App Lab app (`app.yaml`, built around `python/main.py`) and the same blocks generate **Python** instead of C++. App Lab joins PlatformIO and the Arduino CLI as a recognized project type, with dependencies routed to the right place automatically: pip packages, bricks, and Arduino libraries each land where they belong.
- **Contribute your catalog to the community** — a new **"Contribute Catalog to Community…"** command validates a catalog you've authored and submits it as a pull request (with native GitHub sign-in and automatic fork — no git required) or a pre-filled issue in your browser.
- **"Open in Blocks Editor" right where you need it** — a dedicated command now appears on the Explorer and editor-title menus for `.ino`, `.pde`, `.cpp`, and `.py` files, so you no longer have to hunt through "Open With…".
- **Generate controls in the toolbar** — a **Generate code** split button generates on demand and carries a **"Generate automatically on change"** toggle, right where you work.
- **switch/case block** — a new Logic block for multi-way branching, with both C++ and Python generators.
- **One AI assistant setup for Copilot and Claude Code** — the old `@blocks` chat participant is replaced by a single shared **block-author skill**; the renamed **"Set Up AI Assistants (Copilot & Claude Code)"** command wires up both hosts. Re-run it after upgrading.

## v0.2.1 — 2026-06-08

- **"Generate Code"** — the button (and its setting) that was labelled "Generate C++" is now "Generate Code" in every language, since the editor picks the right code generator from your board's runtime, not just the file type.
- **Plays nicely with multi-root workspaces** — downloading a community catalog or enabling the Claude Code integration now asks which folder to use instead of guessing, so the right project gets the files.

## v0.2.0 — 2026-06-07

- **Now speaks 14 more languages** — Blocks Editor is fully localized in Czech, German, Spanish, French, Hungarian, Italian, Japanese, Korean, Polish, Brazilian Portuguese, Russian, Turkish, Simplified Chinese, and Traditional Chinese. The whole experience — menus, blocks, toolbox, and Blockly's own UI — follows your VS Code display language.
- **Walkthrough points the way to compile & upload** — the welcome guide now explains that Blocks Editor handles the visual programming, and links to the companion **Arduino CLI IDE** extension for compiling, uploading, and monitoring from inside VS Code.
- Hardened the `sketch.yaml` library merge to read the file fresh right before writing, shrinking the window for a lost update when the Arduino CLI daemon rewrites the same file.

## v0.1.2 — 2026-06-05

- **Zero-config Arduino CLI sketches** — sketches that only declare `default_fqbn` (the common result of `arduino-cli board attach`, with no named profiles) now load the board-aware toolbox out of the box; a default environment is synthesized from the FQBN.
- **Auto profile from board** — merging dependencies into a profile-less sketch now creates a profile named after the board (from `default_fqbn`) and sets it as `default_profile`.
- The environment selector shows a localized **"Default"** label for the synthesized environment instead of a blank entry.

## v0.1.1 — 2026-06-05

- **Documentation button** — a toolbar icon opens a QuickPick of documentation links (library references, datasheets, API docs) pulled from your loaded catalogs, grouped by entry.
- **Welcome walkthrough** — a guided onboarding that opens on first install and after updates: open the editor, author custom blocks, browse community catalogs, and contribute.
- **Catalog attribution** — `author` and `version` fields added to the catalog schema; documentation links added to the built-in SPI, Wire, and String catalogs.
- Fixed the environment-selector dropdown rendering behind the Blockly toolbox.

## v0.1.0 — 2026-06-04

- **Community catalog browser** — a new activity-bar view to browse, search, refresh, and one-click download block catalogs from a community registry.
- **Configurable registry** — point the browser at any registry index via `blocks-editor.catalogRegistryUrl` (defaults to the official community catalog).
- Refinements across the built-in Arduino catalogs (Digital/Analog I/O, Serial, SPI, Wire, Math, Strings, Time, Interrupts, and more), plus a Community section in the README.

## v0.0.1 — 2026-06-02 — first public preview

- **Visual block editor for source files** — open any `.cpp`, `.ino`, `.c` (`.cc`, `.cxx`, `.pde`) with the Blocks Editor and build by dragging blocks instead of typing.
- **Live C++ generation** — blocks generate real Arduino/C++ as you build; `setup()` and `loop()` update automatically.
- **Multi-backend support** — auto-detects PlatformIO (`platformio.ini`) and Arduino CLI (`sketch.yaml`) projects, with a chooser when both are present.
- **Board-aware toolbox** — reads the active board and framework and shows only the blocks that apply.
- **Automatic dependency management** — libraries required by the blocks in use are merged add-only (`lib_deps` for PlatformIO, `libraries` for the Arduino CLI).
- **Persistent block state** — your layout is saved in a companion `.blk` file next to the source.
- **Extensible catalogs** — define blocks in YAML, loaded from local directories or remote URLs; plus built-in Arduino and classic Blockly categories.
- **`@blocks` chat participant** — assists in authoring new block catalogs for hardware libraries.

---

**Install:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=linucs.blocks-editor) · [Open VSX](https://open-vsx.org/extension/linucs/blocks-editor) · or download the `.vsix` from the release.

Found a bug or have an idea? [Open an issue](https://github.com/linucs/vscode-blockly/issues). For the structured, technical history see the [full changelog](https://github.com/linucs/vscode-blockly/blob/main/CHANGELOG.md).
