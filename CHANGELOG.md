# Change Log

All notable changes to the "Blocks Editor" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

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

[0.1.2]: https://github.com/linucs/vscode-blockly/releases/tag/v0.1.2
[0.1.1]: https://github.com/linucs/vscode-blockly/releases/tag/v0.1.1
[0.1.0]: https://github.com/linucs/vscode-blockly/releases/tag/v0.1.0
[0.0.1]: https://github.com/linucs/vscode-blockly/releases/tag/v0.0.1
