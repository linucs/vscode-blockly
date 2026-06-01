# Blocks Editor

Visual block programming for embedded projects in VS Code.

Drag-and-drop blocks generate real C++ code that compiles and uploads through your toolchain. No syntax to memorize, no boilerplate to write — the blocks are the source of truth, and the generated code stays in sync automatically.

Blocks Editor works with multiple backends. Today it supports **PlatformIO** (`platformio.ini`) and the **Arduino CLI** (`sketch.yaml`), and its architecture is designed so additional toolchains and frameworks can be added over time.

## Features

- **Custom editor for source files** — right-click any `.cpp`, `.ino`, or `.c` file and choose "Open With... > Blocks Editor" to switch to the visual editor.
- **Real-time code generation** — blocks produce valid Arduino/C++ code as you build. The generated `setup()` and `loop()` functions update live.
- **Multi-backend toolchain support** — detects whether your project is driven by PlatformIO (`platformio.ini`) or the Arduino CLI (`sketch.yaml`). When both are present, you choose which to use.
- **Board-aware toolbox** — reads your project config to detect the active board and framework, then shows only the blocks that apply.
- **Automatic dependency management** — when you use a block that requires a library, its dependencies are merged into your project config automatically (add-only, never removes your entries). For PlatformIO this manages `lib_deps`; for the Arduino CLI it manages `libraries` in `sketch.yaml`.
- **Extensible block catalogs** — blocks are defined in YAML files. Load additional catalogs from local directories or remote URLs to add support for new sensors, actuators, and libraries.
- **Persistent block state** — your block layout is saved in a companion `.blk` file next to the source (e.g. `main.cpp` + `main.blk`). The `.cpp` is a generated artifact; the `.blk` is the real project file.
- **Built-in Arduino blocks** — Digital I/O, Analog I/O, Serial, SPI, Wire (I2C), Math, Strings, Time, Interrupts, and more.
- **Standard Blockly blocks** — Logic, Loops, Math, Text, Variables, Arrays, and Functions are always available.
- **Workspace minimap** — optional bird's-eye overview of large block programs.
- **Toolbox search** — type to filter blocks across all categories.
- **Customizable category colors** — override toolbox colors to match your preferences.

## Requirements

- **VS Code 1.120+**
- A supported project backend:
  - **PlatformIO** — a valid `platformio.ini` with at least one `[env:...]` section that specifies a `board` and `framework = arduino`. The [PlatformIO IDE extension](https://platformio.org/install/ide?install=vscode) is recommended for building and uploading.
  - **Arduino CLI** — a valid `sketch.yaml` with at least one profile defining an FQBN-based board. The [Arduino CLI](https://arduino.github.io/arduino-cli/) (or the Arduino IDE 2.x, which uses it) is recommended for building and uploading.

## Getting Started

1. Install this extension, plus the toolchain you intend to use (PlatformIO IDE and/or Arduino CLI).
2. Open (or create) a project with a `platformio.ini` or a `sketch.yaml`.
3. Right-click a `.cpp` or `.ino` source file in the Explorer.
4. Select **"Open With..."** and pick **"Blocks Editor"**.
5. Drag blocks from the toolbox on the left and connect them to build your program.
6. The generated C++ code is written to the source file automatically — compile and upload with your toolchain as usual.

### How it works

```
Blocks (visual editor)
   |
   ├──> main.cpp   (generated C++ — read-only, do not edit by hand)
   ├──> main.blk   (block state — commit this to version control)
   └──> platformio.ini / sketch.yaml  (dependencies added automatically for blocks in use)
```

Every top-level block sequence becomes the body of `void loop()`. Blocks placed inside a **code_setup** container run once in `void setup()`. There are no separate setup/loop scaffold blocks — placement determines where the code goes.

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `blocks-editor.generateOnChange` | `true` | Generate code automatically whenever blocks change. When `false`, code is only generated when the **Generate C++** button is pressed. |
| `blocks-editor.showMinimap` | `false` | Show a minimap overview of the workspace in the bottom-right corner. |
| `blocks-editor.catalogPaths` | `[]` | Additional local directories or remote URLs containing block catalog YAML files. Local paths are scanned recursively. Remote URLs are cached in the project's `.blocks/` folder. |
| `blocks-editor.categoryColors` | `{}` | Map category labels to hex colors to customize the toolbox appearance. Example: `{ "Sensors": "#26A69A" }` |

## Custom Block Catalogs

Blocks are defined in YAML files validated against a JSON Schema. A minimal catalog looks like this:

```yaml
id: my-sensor
category: "Sensors"
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: my_sensor_read
          message0: "read sensor on pin %1"
          args0:
            - type: input_value
              name: PIN
              check: Number
          output: Number
          tooltip: "Read a value from the sensor."
        codegen:
          body:
            - "mySensor.read({{PIN}})"
          imports:
            - "#include <MySensor.h>"
          setup:
            - "mySensor.begin();"
        dependencies:
          - type: library
            name: "MySensorLib"
            minVersion: "1.0.0"
```

### Loading custom catalogs

Add directories or URLs to the `blocks-editor.catalogPaths` setting:

```json
{
  "blocks-editor.catalogPaths": [
    "./my-catalogs",
    "https://example.com/catalogs/my-sensor.yaml"
  ]
}
```

Use the command **"Blocks Editor: Refresh Remote Catalogs"** to re-download remote catalogs after they are updated upstream.

### Catalog key concepts

- **`runtime`** — catalogs are filtered by the active framework and language (e.g. `arduino:cpp`). Blocks for a different runtime are hidden automatically.
- **`dependencies`** — declares libraries merged into the project config when any block from this implementation is used. They become `lib_deps` in `platformio.ini` for PlatformIO projects, or `libraries` in `sketch.yaml` for Arduino CLI projects. (Build flags are intentionally not block metadata — they are a project setup concern.)
- **`category`** — supports `::` nesting for sub-categories (e.g. `"Input / Output::Digital"`).
- **`codegen`** sections — `body` (inline expression or statement), `imports`, `declarations`, `setup`, `helpers` (standalone functions). Use `{{FIELD_NAME}}` placeholders to reference block field values.
- **`inputDefaults`** — fallback values for unconnected inputs, so blocks are valid even before the user attaches a value.

## Version Control

Commit both the `.blk` files and the generated `.cpp` files. The `.blk` is the authoritative source; the `.cpp` lets collaborators (and CI) compile without the extension installed.

Do **not** commit the `.blocks/` folder (remote catalog cache) — add it to `.gitignore`.

## Known Limitations

- Only the `arduino` framework with C++ is supported. Other frameworks (ESP-IDF, STM32Cube, etc.) are not yet implemented.
- The PlatformIO INI parser does not support `extends`, `${...}` variable interpolation, or file includes.
- The generated source file should not be edited by hand — changes will be overwritten on the next block update.

## Contributing

Contributions are welcome. See the [repository](https://github.com/linucs/blocks-editor) for build instructions and development setup.

## License

[MIT](LICENSE)
