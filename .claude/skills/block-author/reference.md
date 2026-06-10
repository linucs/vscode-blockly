# Block Authoring Reference

Canonical reference for authoring platformio-blocks catalog YAML. This file is the **single
source of truth** shared by two hosts, each of which reads it directly from the workspace at
`.claude/skills/block-author/reference.md`:

- **Claude Code** — via the `block-author` skill (discovered under `.claude/skills/`);
- **GitHub Copilot** — via the generated `.github/instructions/block-author.instructions.md`,
  which points here.

It is **host-neutral**: it never names a host-specific tool for the generic actions ("fetch the
header", "save the file"). Each host maps those to its own capability. The one exception is the
`blocks-editor` MCP server, available to BOTH hosts, which provides the deterministic
`validate-catalog` and `list-builtin-blocks` tools.

---

## Workflow

Follow these phases. Wherever a phase says "fetch", "look up the registry", "validate", or "save", use whichever concrete tool your host provides for that action.

### Phase 0: Scoping & objectives

Before research, ask the user:
1. **What should these blocks do?** — a 1:1 wrapper of the library API, or higher-level use-case blocks that encapsulate multiple calls? A catalog can mix both.
2. **Who is the target audience?** — beginners (fewer blocks, generous defaults) or advanced users (granular access to every parameter)?
3. **Where is the reference documentation?** — docs/API/tutorial/example URLs.
4. **Are there example sketches** that represent the expected outcome?
5. **What development environment are we targeting?** - we might be creating blocks for the Arduino CLI/IDE, PlatformIO (PIO). Each has its own library registry, and registries do not fully overlap.

### Phase 1: Research the target (do NOT design from memory)

1. **Fetch the documentation** the user pointed to — reveals intended usage patterns.
2. **Fetch the library source** — ALWAYS traverse ALL the source repositories files via raw GitHub URLs, to acquire a comprehensive knowledge of the library
3. **Classes, interfaces, methods and signatures**: use main header (`.h`) and implementation (`.cpp`) files to understand what each API does. The header is the source of truth for class names, method signatures, return types, enum values, and constants. Try the `main` branch, then `master`.
4. **Dependencies and architectures**: look for files that declare dependencies (e.g. `library.properties` or `library.json`).
5. **Look up the Arduino Library Registry** — if targeting this development environment. It describes the library and each dependency → determines the dependency format (`name` + `minVersion` vs `name` + `url` + `ref`). **Record the current version** — you will use it as `minVersion` in the catalog.
5. **Look up the PlatformIO registry** - if targeting this environment. It describes the library and each dependency → determines the dependency format (`name` + `minVersion` vs `name` + `url` + `ref`). **Record the current version** — you will use it as `minVersion` in the catalog.
7. **Determine `targets`** (build targets) and compatible board IDs, from `architectures`.

Every class/method/enum/return type in the output must come from the fetched source, not memory.

### Phase 2: Consolidate the findings and refine the scope of the design phase

In view of the next phases, group APis into consistent categories, to let the user decide which areas/functionalities shall be designed as blocks.
Present the findings into a clear, structured table for review, with this columns:
- **Index** - use letters to refer to the n-th category listed in the table
- **Category name**
- **Category scope** - explain why APIs shall be grouped into this category
- **List of APis** - quick comma-separated list of classes, methods, interfaces, variables, public contants etc.

Ask the user to review and iteratively refine the design scoping.
**Do NOT proceed to the next phases until the scoping is confirmed by the user**.

### Phase 3: Design, generate and validate the blocks

Design and block generation follows an iterative process, one category at a time:

- design all the blocks in the category
- get approval from the user
- generate and validate the blocks
- get approval from the user

#### Phase 3.1: Choose a category colour

Pick a distinctive hex colour for the toolbox category. The colour is declared once in the YAML (`colour: "#RRGGBB"`) and applies to all blocks in that category. Guidelines:

- **Hardware boards/shields** — use the brand colour (e.g. Arduino teal `#00979D`, Adafruit purple
  `#7B2D8B`, SparkFun red `#E31B23`).
- **Communication protocols** — cool tones: blues/teals (Serial `#0097A7`, WiFi `#1565C0`,
  BLE `#1A237E`, I2C `#00695C`).
- **Sensors** — greens/limes (`#558B2F`, `#33691E`, `#689F38`).
- **Actuators/motors** — warm tones: oranges/reds (`#E65100`, `#BF360C`, `#F57F17`).
- **Displays** — purples (`#6A1B9A`, `#4A148C`).
- **Storage/memory** — browns/ambers (`#4E342E`, `#FF8F00`).

When multiple entries share the same top-level category, only one needs to declare the colour (last-loaded wins). Subcategories inherit the top-level category's colour.
If a suitable brand colour isn't obvious, choose one that contrasts well with existing categories visible in the toolbox.

#### Phase 3.2: Design the blocks

Group related functionality into subcategories (one YAML document each).
For each API method or use case, choose the archetype and design the visual layout + codegen (see the reference below).

Design principles:
- **One block per logical action** — don't combine unrelated operations.
- Use `field_dropdown` for fixed option sets; `input_value` or `field_*` for dynamic/computed parameters.
- Provide `inputDefaults` for inputs that commonly have a standard value.
- Use implementation-level `codegen.imports` for the shared `#include` (emitted once)
- Use block-level `codegen.declarations` for shared objects (deduplicated by exact string).
- Use block-level `codegen.setup` for init/begin functions that require no parameters to be specified by the user (deduplicated by exact string).
- **Avoid duplicate init.** If you provide a dedicated "begin" block, do NOT also emit the same
  `.begin()` from implementation-level `codegen.setup`. Pick one approach.
- Tag blocks with init/begin functions that require parameters with a `setup` tag and put the code in the block-lebel `codegen.body` section — the user will specify the parameters and place them in setup containers.
- For use-case blocks, leverage `codegen.helpers` (utility functions, callback functions) so `body` stays readable.
- **Runtime is always `arduino:cpp`.** The extension generates C++ only. Never offer Python; never
  ask which runtime — always set `runtime: "arduino:cpp"`.
- **`targets` is mandatory for board-specific libraries.** If a library is not universal, the
  implementation MUST include a `targets` array of board identifiers. Omitting it makes the blocks
  appear for ALL boards.
- **`tags` go on every relevant block**, not just the last one.
- **Validate enum/constant scoping.** `MyClass::VALUE` differs from `VALUE`. Take exact scoping
  from the header source, never from memory.

Present the user a table listing **ALL** the blocks you are going to create.
You **MUST** show a section for each block: start with an intro containing, ID, Description/usage and **ALL** the message(s) included in the block (`implementations[].blocks[].blockly.messageX`)
End the section with a table listing ALL the blocks' parameters ((`implementations[].blocks[].blockly.argsX`)), containing:
- name
- type
- checks

Before writing YAML, present and **wait for confirmation**: file plan (board-specific vs general
library); supported boards (`targets`) with the source of each determination; block inventory per
file (subcategories, counts, names); chosen category colour (with rationale); key design decisions.

#### Phase 3.3: Generate and validate

1. Generate the YAML (with the schema front matter).
2. **Validate** it (schema + structural checks below). Fix issues and re-validate.
3. Output: **save** the file(s) if a filesystem/tool is available; otherwise present as fenced
   code blocks with suggested filenames. Save into the project `.blocks/` directory only — the
   filename must end in `.yaml`/`.yml` with no path separators and no `..`. Never hardcode a
   destination path.
4. Report a summary table: file → subcategory → block count.
5. Document project prerequisites (see below).

Inform the user of the created/updated YAML file. Ask to test it and report back a feedback to refine the generated blocks.

---

## Block Anatomy Reference

### Reference — read this first

**`.claude/skills/block-author/blockly_schema.yaml`** contains the schema and the description of
blocks' anatomy. Read it first and refer back to it whenever you build the
`implementations[].blocks[].blockly` object — it is the authority for which keys and shapes are valid.

### The 5 block archetypes

Every block belongs to exactly one archetype, determined by which connection slots it declares.

| Archetype | Connections | Use for | Codegen notes |
|-----------|------------|---------|---------------|
| **Value** | `output` only | Sensor reads, calculations, getters | REQUIRES `precedence`. No `;` in body. |
| **Statement** | `previousStatement` + `nextStatement` | Commands, setters, actions | Body lines end with `;` |
| **Terminal** | `previousStatement` only | `break`, `return`, power off | Nothing stacks below |
| **Hat/Event** | `nextStatement` only | Event handlers, program entry. Usually encapsulates other code blocks | Add `"extensions": ["hat_event_style"]` |
| **Standalone** | None | Config blocks, annotations | Rare in hardware contexts |

**Critical rule**: `output` and `previousStatement` are mutually exclusive — a block is either a
value or a statement, never both.

Connection type values are `null` (any type), a string (one type name), or an array of strings.

```yaml
# Value block — returns a Number
output: Number

# Statement block — accepts/connects any statement
previousStatement: null
nextStatement: null

# Typed value block — only accepts certain inputs
output: ["String", "char*"]

# Terminal block — nothing can stack below
previousStatement: null
# (no nextStatement)
```

### Field types — Official @blockly plugins

Installed as npm packages, Blockly plugins (auto-registered at startup) add the following additional input types:

| Field | Purpose | Template resolves to |
|-------|---------|---------------------|
| `field_slider` | Numeric field with a drag slider (`value`, `min`, `max`, `precision`) | The number as string |
| `field_angle` | Angle picker (protractor wheel, 0–360°) | Angle in degrees as string |
| `field_colour` | Basic colour swatch picker (`colour: "#rrggbb"`) | Hex string |
| `field_colour_hsv_sliders` | HSV colour picker (hue/sat/value sliders) | Hex string |
| `field_dependent_dropdown` | Options change based on a parent dropdown (`parentName`, `optionMapping`) | Selected value |
| `field_grid_dropdown` | Dropdown shown as a grid (`columns`) | Selected value |
| `field_bitmap` | Pixel-art editor (`value: number[][]`, `width`, `height`) | JSON string of the 2D array |
| `field_multilineinput` | Resizable multi-line text box (`text`) | The full multi-line string |

```yaml
# Dependent dropdown — RANGE options depend on the AXIS field
- type: field_dropdown
  name: AXIS
  options: [["X", "X"], ["Y", "Y"], ["Z", "Z"]]
- type: field_dependent_dropdown
  name: RANGE
  parentName: AXIS
  optionMapping:
    X: [["±2g", "2"], ["±4g", "4"]]
    Y: [["±2g", "2"], ["±16g", "16"]]
    Z: [["±2g", "2"], ["±8g", "8"]]
  options: [["±2g", "2"]]   # fallback / initial options
```
For `field_bitmap`, post-process the JSON array into a C array literal with a codegen `helper`.

### Field types — Custom (this extension)

Implemented in `webview/custom-fields/`. Specific to platformio-blocks.

#### `field_combobox`
Dropdown of presets **plus** a free-text input for custom values. Use when the user may pick a
preset (e.g. `SPI`, `Wire`) or type a custom instance name.
```yaml
- type: field_combobox
  name: BUS
  options: [["SPI (default)", "SPI"], ["SPI1", "SPI1"]]
  text: "SPI"   # initial value (preset or custom)
```
`{{BUS}}` → the raw string value, preset or custom (e.g. `"SPI"` or `"mySPI"`).

#### `field_typed_param_input`
Combined type + name editor for function parameters. Dropdown of C++ types + a name field;
automatically creates and tracks a typed workspace variable (renames propagate to call sites).
```yaml
- type: field_typed_param_input
  name: PARAM
  options: [["int", "int"], ["float", "float"], ["String", "String"]]
  text: "param"        # initial parameter name
  defaultType: "int"   # initial type
```
**Dot-notation placeholders** (special):
- `{{PARAM.type}}` → the selected type (e.g. `"float"`)
- `{{PARAM.name}}` → the language-safe variable name (tracks renames)
- `{{PARAM}}` → raw internal value `"type|name"` — **do NOT use in codegen**

Typical use: `body: ["{{PARAM.type}} {{PARAM.name}}"]`. Multiple parameters are normally handled
by the built-in procedure blocks; you rarely need this field in catalog blocks.

#### `field_code`
Multi-line C++ code editor opened in a modal (monospace, Tab inserts spaces, Esc closes). For
"raw code injection" blocks where the user writes arbitrary C++ inline.
```yaml
- type: field_code
  name: CODE
  text: "// write your code here"
```
`{{CODE}}` → the full multi-line string as written.

### C++ type check groups

Use in `check:` on `input_value` to restrict which blocks can connect to a socket.

```yaml
# INT — pin numbers, counts, durations, indices
check: ["Number", "int", "unsigned int", "long", "unsigned long",
        "byte", "word", "uint8_t", "uint16_t", "uint32_t",
        "int8_t", "int16_t", "int32_t"]

# NUM — any numeric including float/double
check: ["Number", "int", "unsigned int", "long", "unsigned long",
        "byte", "word", "float", "double",
        "uint8_t", "uint16_t", "uint32_t", "int8_t", "int16_t", "int32_t"]

# CHAR — single character
check: ["Number", "int", "char", "byte", "uint8_t", "int8_t"]

# BOOL — boolean values
check: ["Boolean", "bool"]

# STRING — text values
check: ["String", "char*"]

# INT_OR_STR — overloaded functions accepting int or String
check: ["Number", "int", "unsigned int", "long", "unsigned long",
        "byte", "word", "uint8_t", "uint16_t", "uint32_t",
        "int8_t", "int16_t", "int32_t", "String"]
```

`Number` must always be included when accepting numeric input (Blockly's built-in `math_number`
outputs `Number`). `String` works both as a Blockly token and the Arduino C++ class name. Omit
`check` (or set `null`) to accept any block type.

### Internationalization (i18n)

The `message0`/`message1`/… and `tooltip` fields support inline translations. Instead of a plain
string, use a YAML mapping with language codes as keys:

```yaml
message0:
  en: "delay %1 ms"
  it: "ritardo %1 ms"
tooltip:
  en: "Pause execution for the given number of milliseconds."
  it: "Metti in pausa l'esecuzione per il numero di millisecondi indicato."
```

**Rules:**
- **Translatable fields**: only `message0`, `message1`, … and `tooltip`. All other fields (field
  names, dropdown options, `helpUrl`, `codegen`, `category`, `id`, `type`) stay untranslated.
- **Backward compatible**: a plain string still works — the preprocessor passes it through unchanged.
  Community catalogs are not required to add translations.
- **Preserve placeholders**: `%1`, `%2` etc. must appear in every translation, in positions that make
  grammatical sense for that language.
- **Keep API names untranslated** in messages: `Serial.begin`, `analogRead`, `Wire.write` etc. Only
  translate the surrounding natural language (labels, prepositions, descriptions).
- **Use block-style YAML** (not flow-style `{en: "...", it: "..."}`):
  ```yaml
  # ✓ correct
  tooltip:
    en: "Read a value"
    it: "Leggi un valore"

  # ✗ avoid
  tooltip: {en: "Read a value", it: "Leggi un valore"}
  ```
- **English is required**: the `en` key must always be present. Other languages are optional. The
  preprocessor resolves the active locale → `Blockly.Msg` key + `%{BKY_}` reference at load time.
- **Dropdown labels** in `args` `options` are NOT translatable in the YAML — they are typically
  code identifiers (HIGH/LOW, MSBFIRST, SPI_MODE0) or API names that should stay in English.
- When **generating a new catalog**, always include `en` strings. If the user requests translations,
  add them as additional keys. Offer to translate if the user hasn't asked — the extension supports
  Italian (`it`) as the first non-English locale.

### Multi-message blocks

For layouts with multiple visual rows, use `message0`/`args0`, `message1`/`args1`, …:

```yaml
message0:
  en: "Display: draw text %1 at x %2 y %3"
  it: "Display: scrivi testo %1 a x %2 y %3"
args0:
  - type: input_value
    name: TEXT
    check: String
  - type: input_value
    name: X
  - type: input_value
    name: Y
```

### Shadow blocks and inputDefaults

`inputDefaults` declares fallback values for unconnected `input_value` inputs. The UI renders
them as grey, pre-attached shadow blocks the user can replace:

```yaml
codegen:
  body:
    - "tone(BEEP_PIN, {{FREQ}}, {{DURATION}});"
  inputDefaults:
    FREQ: "1000"
    DURATION: "500"
```

---

## Codegen Reference

### Two levels of codegen

**Implementation-level** (`implementations[].codegen`) — emitted ONCE if any block from this
implementation is used. Use ONLY for shared `imports` and `declarations`. Do NOT put `.begin()`
or other init calls here — provide explicit init blocks instead (WYSIWYG principle).

**Block-level** (`blocks[].codegen`) — emitted per block instance.

### Codegen sections

| Section | Placement in sketch | Deduplicated? | Use for |
|---------|-------------------|---------------|---------|
| `imports` | Top of file | Yes (exact string) | `#include` directives |
| `declarations` | After includes, before `setup()` | Yes (exact string) | Global variables, object instances |
| `setup` | Inside `setup()` | Yes (exact string) | One-time initialization |
| `helpers` | Before `setup()` as functions | Yes (by key name) | Utility functions |
| `body` | Inside `loop()` or inline | No | The block's main code |
| `cleanup` | End of scope | Yes (exact string) | Teardown code |

### Template placeholders

`{{NAME}}` resolves based on what NAME refers to:
- **Field name** → the field's current value
- **Value input name** → the connected block's generated code (via `valueToCode`); else `inputDefaults`
- **Statement input name** → the connected statement chain's code (indented)
- **Variable field name** → the language-safe variable name

### Precedence (value blocks only)

Every value block MUST specify `codegen.precedence`.

When the code generator serialises nested blocks into text, it needs to know whether the inner expression requires parentheses to preserve the correct evaluation order. For example:

```
(2 + 3) * 4   ← parentheses required
2 * 3 + 4     ← parentheses not required
```

Every call to the code generator takes an argument — the minimum precedence the caller can tolerate from the inner block.
The generator compares that value against the precedence the inner block declares for its own output. If the inner block's precedence is weaker than what the outer block needs, the code is automatically wrapped in parentheses.

We use `codegen.precedence` from following operator precedence table:

| Precedence | Value | Operator |
|---|---|---|
| `ATOMIC` | 0 | literals, identifiers |
| `NEW` | 1.1 | `new` |
| `MEMBER` | 1.2 | `.` `[]` |
| `FUNCTION_CALL` | 2 | `()` |
| `INCREMENT` | 3 | `++` |
| `DECREMENT` | 3 | `--` |
| `BITWISE_NOT` | 4.1 | `~` |
| `UNARY_PLUS` | 4.2 | `+` (unary) |
| `UNARY_NEGATION` | 4.3 | `-` (unary) |
| `LOGICAL_NOT` | 4.4 | `!` |
| `TYPEOF` | 4.5 | `typeof` |
| `VOID` | 4.6 | `void` |
| `DELETE` | 4.7 | `delete` |
| `AWAIT` | 4.8 | `await` |
| `EXPONENTIATION` | 5.0 | `**` |
| `MULTIPLICATION` | 5.1 | `*` |
| `DIVISION` | 5.2 | `/` |
| `MODULUS` | 5.3 | `%` |
| `SUBTRACTION` | 6.1 | `-` |
| `ADDITION` | 6.2 | `+` |
| `BITWISE_SHIFT` | 7 | `<<` `>>` `>>>` |
| `RELATIONAL` | 8 | `<` `<=` `>` `>=` |
| `IN` | 8 | `in` |
| `INSTANCEOF` | 8 | `instanceof` |
| `EQUALITY` | 9 | `==` `!=` `===` `!==` |
| `BITWISE_AND` | 10 | `&` |
| `BITWISE_XOR` | 11 | `^` |
| `BITWISE_OR` | 12 | `\|` |
| `LOGICAL_AND` | 13 | `&&` |
| `LOGICAL_OR` | 14 | `\|\|` |
| `CONDITIONAL` | 15 | `?:` |
| `ASSIGNMENT` | 16 | `=` `+=` `-=` `**=` etc. |
| `YIELD` | 17 | `yield` |
| `COMMA` | 18 | `,` |
| `NONE` | 99 | always parenthesise |

**When in doubt, use `ATOMIC`.**

---

## YAML File Structure

### Front matter

Every generated file MUST start with the schema reference for linter validation:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json
```

For multi-document files, add the schema reference before the FIRST document only.

### Multi-document layout

Use `---` to separate subcategories. Each document is an independent catalog entry.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json

# === Section A ===
id: myboard-section-a
category: "My Board::Section A"
colour: "#00979D"
implementations:
  - runtime: "arduino:cpp"
    dependencies:
      - type: library
        name: MyLibrary
    codegen:
      imports:
        - '#include <MyLibrary.h>'
    blocks:
      - blockly:
          type: myboard_do_thing
          # ...

---
# === Section B ===
id: myboard-section-b
category: "My Board::Section B"
# colour inherited from the first document (same top-level category "My Board")
# ...
```

### Naming conventions

| Element | Convention | Example |
|---------|-----------|---------|
| `id` | kebab-case | `nesso-n1-battery` |
| block `type` | snake_case, `<component>_<action>` | `nesso_battery_voltage` |
| `category` | `::` for subcategories | `"Nesso N1::Battery"` |
| field `name` | UPPER_SNAKE | `BAUD`, `COLOR`, `AXIS` |
| `tags` | kebab-case | `sensor`, `actuator`, `beginner` |

### Dependencies

**Always include `minVersion`** when the library is in a registry. During Phase 1, look up the
current version from the PlatformIO or Arduino registry and use it as `minVersion`. This ensures
deterministic installs on both backends — Arduino CLI requires a version for reproducible builds,
and PlatformIO benefits from a semver floor. Only omit `minVersion` if the registry lookup failed
and you cannot determine a version.

```yaml
# Library in PlatformIO registry (always include minVersion):
- type: library
  name: IRremote
  minVersion: "4.4.1"

# Library NOT in registry (use GitHub URL + git ref):
- type: library
  name: Arduino_Nesso_N1
  url: "https://github.com/arduino-libraries/Arduino_Nesso_N1.git"
  ref: "1.0.0"
```

### File-splitting rule

Each independently reusable library gets its own `.yaml` file. A library is "independently
reusable" if it works on boards other than the one mentioned (e.g. WiFiNINA, ArduinoBLE,
ArduinoMqttClient). Board/carrier-specific libraries (e.g. Arduino_MKRIoTCarrier) go in a
board-specific file. When several libraries are mentioned together, classify each and split.

---

## Worked Example (random.yaml)

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json
id: arduino_math_random
category: "Math::Random"
colour: "#B5CEA8"
implementations:
  - runtime: "arduino:cpp"
    blocks:
      # --- random(min, max) ---
      - blockly:
          type: cpp_random
          message0:
            en: "random from %1 to %2"
            it: "random da %1 a %2"
          args0:
            - type: input_value
              name: MIN
              check: ["Number", "int", "long", "unsigned long", "byte", "uint8_t", "uint16_t", "uint32_t"]
            - type: input_value
              name: MAX
              check: ["Number", "int", "long", "unsigned long", "byte", "uint8_t", "uint16_t", "uint32_t"]
          output: Number
          inputsInline: true
          tooltip:
            en: "Pseudo-random number in [min, max)."
            it: "Numero pseudo-casuale in [min, max)."
        codegen:
          body:
            - "random({{MIN}}, {{MAX}})"
          precedence: ATOMIC
          inputDefaults:
            MIN: "0"
            MAX: "100"

      # --- randomSeed ---
      - blockly:
          type: cpp_random_seed
          message0: "randomSeed %1"
          args0:
            - type: input_value
              name: SEED
              check: ["Number", "int", "long", "unsigned long"]
          previousStatement: null
          nextStatement: null
          inputsInline: true
          tooltip:
            en: "Seed the pseudo-random generator."
            it: "Inizializza il generatore pseudo-casuale."
        codegen:
          body:
            - "randomSeed({{SEED}});"
          inputDefaults:
            SEED: "analogRead(A0)"
```

Note: `randomSeed %1` is not translated because the message is just the function name + placeholder — no natural language to localize.

---

## Validation — Structural Checks

Always validate with the host's `validate-catalog` tool (the `blocks-editor` MCP server). If no such
tool is available (e.g. Claude.ai chat with no MCP server), fall back to fetching the schema
(see Reference URLs) and validating against it by hand, then check the rules below.

Beyond JSON-schema validation, verify these logical rules (a schema cannot express them):

1. **No duplicate `blockly.type`** across ALL documents in the file.
2. **Precedence correctness**: every block with `output` MUST have `codegen.precedence`; every
   block WITHOUT `output` must NOT have `precedence`.
3. **Placeholder consistency**: every `{{NAME}}` in codegen must match a field/input defined in
   `args0`/`args1`/…
4. **inputDefaults coverage**: every `input_value` that can be left unconnected should have a
   default in `codegen.inputDefaults`; keys must correspond to `input_value` names.
5. **Declaration deduplication**: shared `declarations`/`imports` strings must be EXACTLY identical
   so the codegen engine deduplicates them.
6. **YAML syntax**: the file must parse as multi-document YAML.
7. **i18n consistency**: if `message0`/`tooltip` is an object, it MUST have an `en` key. All
   translations must preserve the same `%1`/`%2`/… placeholders in the same logical order.
   Only `message*` and `tooltip` fields may be i18n objects — never `type`, `name`, field
   options, `helpUrl`, or codegen fields.

---

## Constraints (declarative tier only)

These features are NOT available in catalog YAML — they require first-party imperative TypeScript:

- **`mutator:`** — blocks cannot change shape dynamically
- **`generator:`** — no custom TypeScript code generators

If a feature needs variable inputs, use: a `field_dropdown` selecting fixed configurations;
separate blocks per variant; or a multi-row block with optional inputs and sensible `inputDefaults`.

---

## Project Prerequisites Documentation

After generating a catalog, document any setup beyond the YAML itself. The catalog system manages
only library dependencies (`lib_deps` in `platformio.ini`, `libraries` in `sketch.yaml`) — it
cannot set `platform`, `board`, `build_flags`, `lib_ldf_mode`, `extra_scripts`, or board variants.
Build flags in particular are a project-setup concern and are deliberately NOT block metadata.

Common prerequisites to check and document:

- **Platform compatibility** — does the MCU need a non-standard PlatformIO platform? (e.g.
  ESP32-C6/H2 need pioarduino for Arduino-framework support)
- **Custom board/variant** — does the library redefine framework symbols like `LED_BUILTIN`?
- **Transitive dependency issues** — does the library depend on framework libraries (Wire, SPI)
  that the LDF doesn't propagate? May need `lib_ldf_mode = deep+`.
- **Build flags** — does the library need specific defines (e.g. `-DARDUINO_USB_CDC_ON_BOOT=1`)?

---

## Reference URLs

- PlatformIO Registry (human): https://registry.platformio.org/
- PlatformIO Registry search API: `https://api.registry.platformio.org/v3/packages?query=<name>`
- Arduino Library Registry (raw list): https://raw.githubusercontent.com/arduino/library-registry/main/repositories.txt
- Arduino Library Reference: https://www.arduino.cc/reference/en/libraries/
- Arduino Library Index (JSON): https://downloads.arduino.cc/libraries/library_index.json
- Block Catalog Schema: https://raw.githubusercontent.com/linucs/vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json
- Blockly Block Anatomy: https://developers.google.com/blockly/guides/create-custom-blocks/define/block-anatomy
