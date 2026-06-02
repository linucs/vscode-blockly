# Blocks Editor

**Build programs for Arduino by dragging colorful blocks — like Scratch, but it writes real code for you.**

No syntax to memorize. No semicolons to forget. You snap blocks together, and Blocks Editor turns them into working C++ that compiles and uploads to your board.

![Drag a block, see the code appear](images/demo.gif)

> **New to coding?** That's exactly who this is for. If you can drag and drop, you can build a program.

## Why you'll like it

- 🧩 **Drag-and-drop, not typing** — pick blocks from a menu and connect them. The hard part (the code) is handled automatically.
- 👀 **See it work instantly** — every time you change a block, the program updates live.
- 🔌 **Knows your board** — it reads your project and shows only the blocks that make sense for the hardware you're using.
- 📦 **Installs libraries for you** — use a block that needs an extra library? It gets added to your project automatically. You don't have to hunt for it.
- 💾 **Saves your work automatically** — nothing to remember, nothing to lose.

## Getting Started

### What you need first

Blocks Editor sits on top of one of two free tools that actually build and upload your code to the board. You need **one** of them:

- **[PlatformIO](https://platformio.org/install/ide?install=vscode)** — a popular extension for VS Code. (Easiest if you're already in VS Code.)
- **[Arduino CLI](https://arduino.github.io/arduino-cli/)** — or the Arduino IDE 2.x, which uses it under the hood.

You also need a **project folder** that tells the tools which board you have. If you're using PlatformIO or the Arduino IDE, creating a new project sets this up for you automatically.

> **Don't have a project yet?** In VS Code, install PlatformIO, click the 🐜 ant icon in the sidebar → **New Project**, pick your board, and you're ready.

### Build your first program

1. Install this extension (plus PlatformIO or the Arduino CLI).
2. Open your project folder in VS Code.
3. In the file explorer, **right-click** your main source file (it ends in `.cpp` or `.ino`).
4. Choose **"Open With…"** → **"Blocks Editor"**.
5. Drag blocks from the menu on the left and click them together to build your program.
6. Build and upload to your board the way you normally would — the code is already written for you.

That's it. The code file updates itself every time you move a block.

## Frequently asked questions

**Do I need to know how to program?**
No. That's the whole point. The blocks describe what you want to happen, and the extension writes the code.

**Will it break my project or delete my files?**
No. It only ever *adds* the libraries your blocks need — it never removes anything you set up. Your block layout is saved safely in its own file.

**The code file says "do not edit" — why?**
Because the blocks are in charge. The code file is generated from your blocks, so if you edited it by hand, your changes would be replaced the next time you move a block. Edit the blocks, not the code.

**What gets saved where?**
Two files sit next to each other, e.g. `main.cpp` and `main.blk`:

```
🧩 Your blocks  ─────►  main.cpp   the code (written for you — don't edit by hand)
                ─────►  main.blk   your block layout (this is your real work)
```

If you use version control (like Git), commit **both** files.

**Where does setup-once code go?**
Most blocks run over and over (that's the `loop`). For things that should happen **once at startup** (like turning on the serial monitor), there's a special **"setup"** container block — drop those blocks inside it.

## What's included

- **Arduino building blocks** — Digital pins, Analog pins, Serial monitor, SPI, I2C (Wire), Math, Text, Time, Interrupts, and more.
- **Classic blocks** — Logic (if/else), Loops, Math, Text, Variables, Lists, and Functions — always available.
- **Handy extras** — a search box to find blocks fast, an optional minimap for big programs, and customizable category colors.

## Settings

You can leave everything at its defaults. If you want to tweak things, open VS Code Settings and search for "Blocks Editor":

| Setting | Default | What it does |
|---------|---------|--------------|
| `blocks-editor.generateOnChange` | `true` | Update the code automatically as you build. Turn off if you'd rather press a **Generate C++** button yourself. |
| `blocks-editor.showMinimap` | `false` | Show a small overview map of your blocks in the corner — handy for large programs. |
| `blocks-editor.catalogPaths` | `[]` | Add extra blocks from a folder or a web link (see below). |
| `blocks-editor.categoryColors` | `{}` | Recolor the block categories to your taste, e.g. `{ "Sensors": "#26A69A" }`. |

## Requirements

- **VS Code 1.120 or newer**
- One supported toolchain:
  - **PlatformIO** — a `platformio.ini` with at least one `[env:...]` that sets a `board` and `framework = arduino`.
  - **Arduino CLI** — a `sketch.yaml` with at least one profile defining an FQBN-based board.

## Good to know

- Right now Blocks Editor supports the **Arduino** framework with C++. Other frameworks (ESP-IDF, STM32Cube, …) aren't supported yet.
- The PlatformIO project reader doesn't yet understand advanced `platformio.ini` features (`extends`, `${...}` variables, file includes).
- Don't hand-edit the generated source file — your block layout is the real source, and edits to the code will be overwritten.

---

## For developers: creating your own blocks

> This section is for people who want to **add new blocks** (for a specific sensor, board, or library). If you just want to *use* the editor, you can stop reading here.

Blocks are defined in **YAML catalog files**, validated against a JSON Schema. A minimal catalog looks like this:

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

Run the command **"Blocks Editor: Refresh Remote Catalogs"** to re-download remote catalogs after they change upstream.

### Catalog key concepts

- **`runtime`** — catalogs are filtered by the active framework and language (e.g. `arduino:cpp`). Blocks for a different runtime are hidden automatically.
- **`dependencies`** — libraries merged into the project config when any block from this implementation is used. They become `lib_deps` in `platformio.ini`, or `libraries` in `sketch.yaml`. (Build flags are intentionally not block metadata — they're a project-setup concern.)
- **`category`** — supports `::` nesting for sub-categories (e.g. `"Input / Output::Digital"`).
- **`codegen`** sections — `body` (inline expression or statement), `imports`, `declarations`, `setup`, `helpers` (standalone functions). Use `{{FIELD_NAME}}` placeholders to reference block field values.
- **`inputDefaults`** — fallback values for unconnected inputs, so blocks are valid even before the user attaches a value.

### Block Author assistant

The extension ships a `@blocks` chat participant that helps research a hardware library and generate a catalog for it. Type `@blocks` in the Chat view to get started.

## Version Control

Commit both the `.blk` files and the generated `.cpp` files. The `.blk` is the authoritative source; the `.cpp` lets collaborators (and CI) compile without the extension installed. Add the `.blocks/` folder (remote-catalog cache) to `.gitignore`.

## Contributing

Contributions are welcome. See the [repository](https://github.com/linucs/vscode-blockly) for build instructions and development setup.

## License

[MIT](LICENSE)
