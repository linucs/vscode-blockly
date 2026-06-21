# Block Authoring Guide

Technical reference for authoring block catalog YAML files. Intended for developers who want to understand every key, every section, and every design decision behind the catalog format.

For a beginner-friendly overview, see the "For developers" section in [README.md](README.md).

---

## Table of Contents

- [File anatomy](#file-anatomy)
- [Entry-level keys](#entry-level-keys)
- [Implementations](#implementations)
- [Block definitions](#block-definitions)
- [Code generation](#code-generation)
- [Internationalization](#internationalization)
- [Naming conventions](#naming-conventions)
- [Validation](#validation)
- [Complete example](#complete-example)

---

## File anatomy

A catalog file is a **multi-document YAML** file. Each YAML document (separated by `---`) is one catalog **entry** — an independent group of blocks sharing a category and an implementation.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json

id: my-library-sensors
category: "My Library::Sensors"
implementations:
  - runtime: "arduino:cpp"
    # ...
---
id: my-library-actuators
category: "My Library::Actuators"
implementations:
  - runtime: "arduino:cpp"
    # ...
```

The schema reference comment on the first line enables IDE validation (e.g. the YAML Language Server extension). Add it before the first document only.

### Where catalogs live

The extension loads catalogs from three sources, merged at runtime:

1. **Built-in** — `catalogs/` directory shipped with the extension (L2 Arduino blocks).
2. **User paths** — directories or URLs listed in the `blocks-editor.catalogPaths` setting.
3. **Project-local** — the `.blocks/` directory at the project root (auto-scanned, auto-reloaded on change).

All sources are validated against the same JSON schema. Invalid entries are warned and skipped.

---

## Entry-level keys

Each YAML document has these top-level keys:

### `id` (required)

Unique identifier for the catalog entry. Used internally for deduplication.

```yaml
id: wifinina-connectivity
```

**Format**: `^[a-z0-9]+([_-][a-z0-9]+)*$` — lowercase alphanumeric with hyphens or underscores. Convention: kebab-case for external/community entries, snake_case for built-in entries.

### `category` (required)

Determines where the entry's blocks appear in the toolbox. Supports `::` nesting for subcategories.

```yaml
category: "Communication::Serial"       # subcategory under Communication
category: "Sensors"                      # flat category
category: "Input / Output::Digital"      # spaces are allowed
```

When a catalog category has the same name as a built-in L1 category (e.g. `"Math"`, `"Code"`), their blocks are **merged** into a single toolbox section. Otherwise the catalog category appears as a standalone section below the L1 categories.

Category colors are resolved in this order: YAML `colour` > built-in palette > neutral gray default.

### `colour` (optional)

Hex colour for the toolbox category. Applied to the top-level category (the part before `::`). When multiple entries define a colour for the same category, the last one loaded wins.

```yaml
colour: "#00979D"
```

**Format**: `#RRGGBB` (6-digit hex, case-insensitive). If omitted, the category uses the theme default.

### `docs` (optional)

External documentation links. An object of `key: URL` pairs. Currently informational only (displayed by AI authoring assistants, not by the editor UI).

```yaml
docs:
  library: "https://docs.arduino.cc/libraries/wifinina/"
  datasheet: "https://www.u-blox.com/sites/default/files/NINA-W10_DataSheet.pdf"
```

---

## Implementations

Each entry has one or more **implementations** — one per runtime. Today only `arduino:cpp` is supported.

```yaml
implementations:
  - runtime: "arduino:cpp"
    targets: [...]
    dependencies: [...]
    codegen: { ... }
    blocks: [...]
```

### `runtime` (required)

```yaml
runtime: "arduino:cpp"
```

The only supported value. Determines which code generation engine is used. Blocks are only shown when the active project uses a matching runtime.

### `targets` (optional)

Restricts the entry to specific boards or platforms. If absent, the blocks are **universal** — shown for any board using the matching runtime.

```yaml
targets:
  - mkrwifi1010        # PlatformIO board ID
  - nano_33_iot
  - arduino:samd       # Arduino CLI vendor:arch
  - arduino:samd:mkrwifi1010  # full FQBN
```

Accepts PlatformIO-style identifiers (platform name like `espressif32`, board ID like `mkrwifi1010`) and Arduino CLI-style identifiers (vendor:arch like `arduino:samd`, full FQBN like `arduino:samd:mkrwifi1010`). The filter matches if **any** target in the list matches the active board's platform, board ID, or FQBN.

### `dependencies` (optional)

Libraries required by the blocks. Automatically injected into the project's config file (`lib_deps` in `platformio.ini`, `libraries` in `sketch.yaml`) when any block from this implementation is used.

```yaml
dependencies:
  # Library in a registry — always include minVersion:
  - type: library
    name: WiFiNINA
    minVersion: "1.8.14"

  # Library NOT in the PlatformIO registry (use a Git URL):
  - type: library
    name: Arduino_Nesso_N1
    url: "https://github.com/arduino-libraries/Arduino_Nesso_N1.git"
    ref: "1.0.0"
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Always `"library"` for C++ libraries. (`pip` and `brick` exist in the schema for future use.) |
| `name` | Yes | Library name as it appears in the PlatformIO or Arduino registry. |
| `minVersion` | Strongly recommended | Minimum version (`^x.y.z` semver). Look it up from the registry during research. Arduino CLI requires a version for reproducible builds; PlatformIO benefits from a semver floor. Ignored if `url` is set. |
| `url` | No | Git URL for libraries not in the PIO registry. Emitted as `name=url#ref`. |
| `ref` | No | Git tag/branch/commit to pin. Used with `url`. |

**How `minVersion` is emitted per backend:**
- **PlatformIO** (`platformio.ini`): `WiFiNINA@^1.8.14` in `lib_deps`
- **Arduino CLI** (`sketch.yaml`): `WiFiNINA (1.8.14)` in `libraries:`

Dependency injection is **add-only**: the extension never removes libraries. If a block is deleted, its dependency remains in the config file.

### `codegen` (implementation-level, optional)

Code emitted **once** if any block from this implementation is used. Typically `imports` and `declarations`.

```yaml
codegen:
  imports:
    - "#include <SPI.h>"
  declarations:
    - "SPIClass mySPI(SPI);"
```

**WYSIWYG principle (recommended, not enforced)**: prefer not to put `.begin()` or other init calls in implementation-level `codegen.setup` — that code runs automatically whenever any block of the implementation is used, with no block on the canvas representing it. Instead, consider a dedicated statement block (e.g. "SPI.begin") that the user places inside a `code_setup` container, so every generated line maps to a visible block. This is authoring guidance, not a validation error: impl-level `setup` is allowed.

See [Code generation](#code-generation) for the full section reference.

### `blocks` (required)

Array of block definitions. Each element defines one visual block. See [Block definitions](#block-definitions).

---

## Block definitions

Each block has up to four keys:

```yaml
blocks:
  - blockly: { ... }     # required — the visual definition
    codegen: { ... }     # the code it generates (declarative tier)
    generator: "name"    # OR an imperative generator (first-party only)
    tags: [...]          # optional metadata
```

### `blockly` (required)

A verbatim [Blockly JSON block definition](https://developers.google.com/blockly/guides/create-custom-blocks/define/block-anatomy). Passed directly to `Blockly.common.defineBlocksWithJsonArray()`. Any valid Blockly property is accepted (`additionalProperties: true` in the schema).

#### Connection types (block archetype)

A block's archetype is determined by which connection slots it declares:

| Archetype | Connections | Use for |
|-----------|------------|---------|
| **Value** | `output` only | Sensor reads, calculations, getters |
| **Statement** | `previousStatement` + `nextStatement` | Commands, setters, actions |
| **Terminal** | `previousStatement` only | `break`, `return`, power off |
| **Hat/Event** | `nextStatement` only | Event handlers, ISR entry |

`output` and `previousStatement` are **mutually exclusive**.

Connection values: `null` (any type), a string (`"Number"`), or an array (`["Number", "int", "float"]`).

```yaml
# Value block — returns a Number
output: Number

# Statement block
previousStatement: null
nextStatement: null

# Terminal block — nothing stacks below
previousStatement: null
# (no nextStatement)
```

#### `type` (required)

Unique block type identifier. Convention: `<component>_<action>` in snake_case.

```yaml
type: cpp_serial_begin
type: nesso_battery_voltage
type: wifi_connect
```

Must be unique across **all** loaded catalogs. Collisions with built-in L1 blocks are silently skipped (built-in kept).

#### `message0`, `message1`, ... (block label)

The text shown on the block, with `%1`, `%2`, ... placeholders for inputs and fields. Each `messageN` corresponds to an `argsN` array.

```yaml
message0: "tone pin %1 frequency %2 Hz for %3 ms"
args0:
  - type: input_value
    name: PIN
  - type: input_value
    name: FREQUENCY
  - type: input_value
    name: DURATION
```

Supports [internationalization](#internationalization) via inline objects.

#### `args0`, `args1`, ... (inputs and fields)

Array of input/field definitions, one per `%N` placeholder in the corresponding `messageN`.

**Input types** (sockets where other blocks connect):

| Type | Renders as | Template `{{NAME}}` resolves to |
|------|-----------|--------------------------------|
| `input_value` | Socket (round/diamond) | Generated code of the connected block; falls back to `inputDefaults[NAME]` |
| `input_statement` | C-shaped notch | Indented code of the connected statement chain |
| `input_dummy` | No socket (fields only) | — |
| `input_end_row` | Explicit line break | — |

**Field types** (inline UI controls):

| Type | Key properties | `{{NAME}}` resolves to |
|------|---------------|----------------------|
| `field_dropdown` | `options: [["label", "VALUE"], ...]` | The selected VALUE string |
| `field_number` | `value`, `min`, `max`, `precision` | The number as string |
| `field_input` | `text` (default value) | The entered string |
| `field_checkbox` | `checked: true/false` | `"TRUE"` or `"FALSE"` |
| `field_variable` | `variable: "varname"` | Language-safe variable name |
| `field_label` | `text` | N/A (display only) |
| `field_image` | `src`, `width`, `height`, `alt` | N/A (display only) |
| `field_slider` | `value`, `min`, `max`, `precision` | The number as string |
| `field_angle` | (protractor wheel, 0-360) | Angle in degrees |
| `field_colour` | `colour: "#rrggbb"` | Hex string |
| `field_colour_hsv_sliders` | (HSV picker) | Hex string |
| `field_dependent_dropdown` | `parentName`, `optionMapping` | Selected value |
| `field_grid_dropdown` | `columns` | Selected value |
| `field_bitmap` | `value: number[][]`, `width`, `height` | JSON of the 2D array |
| `field_multilineinput` | `text` | Full multi-line string |
| `field_combobox` | `options`, `text` | Raw string (preset or custom) |
| `field_typed_param_input` | `options`, `text`, `defaultType` | `{{NAME.type}}` and `{{NAME.name}}` |
| `field_code` | `text` | Full multi-line string |

Fields from `field_slider` onward are `@blockly` plugins or custom fields specific to this extension.

#### `check` (on input_value)

Type restriction for which blocks can connect to a socket.

```yaml
# Accept any numeric type (most common for pin/value inputs)
check: ["Number", "int", "unsigned int", "long", "unsigned long",
        "byte", "word", "uint8_t", "uint16_t", "uint32_t",
        "int8_t", "int16_t", "int32_t"]
```

Always include `"Number"` when accepting numeric inputs (Blockly's built-in `math_number` outputs `Number`). Omit `check` or set `null` to accept any type.

#### Other Blockly properties

| Property | Type | Description |
|----------|------|-------------|
| `inputsInline` | boolean | Render inputs horizontally (default: Blockly decides) |
| `colour` | number or string | Block color (0-360 hue, or `#rrggbb`). Overridden by the category color if not set. |
| `tooltip` | string or i18n object | Hover tooltip. Supports [i18n](#internationalization). |
| `helpUrl` | string | URL opened on "Help" in the context menu. |
| `style` | string | Blockly theme style name (e.g. `"logic_blocks"`). |
| `extensions` | string[] | Blockly extensions to apply (e.g. `["hat_event_style"]`). |

### `tags` (optional)

Metadata tags for filtering and categorization. Kebab-case.

```yaml
tags:
  - sensor
  - beginner
  - setup
```

Currently informational (used by AI assistants); no runtime filtering yet.

### `generator` (first-party only)

Names an imperative TypeScript generator registered in `webview/codegen/firstPartyGenerators.ts`. Takes precedence over `codegen`. **Community catalogs must not use this field** — it requires code bundled with the extension.

```yaml
generator: code_setup
```

---

## Code generation

The declarative codegen system uses template strings with `{{placeholder}}` syntax. There are two levels:

### Implementation-level `codegen`

Emitted **once** if any block from this implementation is used. Sections: `imports`, `declarations`, `setup`, `helpers`, `cleanup`.

```yaml
implementations:
  - runtime: "arduino:cpp"
    codegen:
      imports:
        - "#include <Wire.h>"
    blocks: [...]
```

**Best for shared plumbing**: `imports` (the `#include`) and `declarations` (global object instances). Putting `.begin()` calls here is allowed but runs them invisibly (no block on the canvas) — prefer explicit init blocks when you want the setup to be visible/WYSIWYG.

### Block-level `codegen`

Emitted per block instance. All implementation-level sections plus `body`, `precedence`, and `inputDefaults`.

```yaml
codegen:
  body:
    - "Wire.write({{DATA}});"
  imports:
    - "#include <Wire.h>"
  inputDefaults:
    DATA: "0"
```

### Sections reference

| Section | Placement in generated sketch | Deduplicated? | Typical use |
|---------|------------------------------|---------------|-------------|
| `imports` | Top of file, before everything | Yes (exact string match) | `#include` directives |
| `declarations` | After imports, before `setup()` | Yes (exact string match) | Global variables, object instances |
| `setup` | Inside `setup()` body | Yes (exact string match) | One-time initialization |
| `helpers` | Before `setup()`, as free functions | Yes (by key name) | Utility functions referenced by `body` |
| `body` | At the block's position (inside `loop()` for top-level, or inline for value blocks) | No | The block's main code |
| `cleanup` | End of scope | Yes (exact string match) | Teardown code |

Deduplication means that if two blocks emit the same `imports` string, it appears once in the output. This is why the string must be **exactly identical** (including whitespace).

### `body`

Array of template strings, joined with newline. For statement blocks, each line typically ends with `;`. For value blocks, the body is a single expression without `;`.

```yaml
# Statement block
body:
  - "Serial.println({{VALUE}});"

# Value block — no semicolon, no newline
body:
  - "analogRead({{PIN}})"
```

### `helpers`

An object where keys are function names (dedup keys) and values are the full function definition. Referenced from `body` by calling the function.

```yaml
codegen:
  helpers:
    connectWiFi: |
      void _connectWiFi(const char* ssid, const char* pass) {
        WiFi.begin(ssid, pass);
        while (WiFi.status() != WL_CONNECTED) {
          delay(500);
        }
      }
  body:
    - '_connectWiFi("{{SSID}}", "{{PASSWORD}}");'
```

### `precedence` (value blocks only)

**Required** for every block that has `output`. Determines how the expression is parenthesized when nested inside another expression.

| Value | Use when |
|-------|----------|
| `ATOMIC` | Function calls, variable reads, constants — **most common** |
| `UNARY_PREFIX` | Unary operators (`!x`, `-x`) |
| `MULTIPLICATION` | `a * b`, `a / b` |
| `ADDITION` | `a + b`, `a - b` |
| `RELATIONAL` | `a < b`, `a > b` |
| `EQUALITY` | `a == b`, `a != b` |
| `LOGICAL_AND` | `a && b` |
| `LOGICAL_OR` | `a \|\| b` |
| `NONE` | Lowest precedence (always parenthesized) |

When in doubt, use `ATOMIC`.

### `inputDefaults`

Fallback values for unconnected `input_value` inputs. Rendered as gray shadow blocks.

```yaml
codegen:
  body:
    - "tone({{PIN}}, {{FREQ}}, {{DURATION}});"
  inputDefaults:
    PIN: "8"
    FREQ: "440"
    DURATION: "1000"
```

Keys must correspond to `input_value` names in `args0`/`args1`. Do **not** put dropdown field names here — dropdowns already default to their first option.

### Template placeholder resolution

`{{NAME}}` resolves based on what NAME refers to in the block definition:

| NAME refers to | Resolves to |
|----------------|-------------|
| A `field_*` | The field's current value |
| An `input_value` | The connected block's generated code; else `inputDefaults[NAME]` |
| An `input_statement` | The connected statement chain's generated code (indented) |
| A `field_variable` | The language-safe variable name |

**Dot notation** for `field_typed_param_input`:
- `{{PARAM.type}}` — the selected type
- `{{PARAM.name}}` — the parameter name

---

## Internationalization

The `message0`/`message1`/... and `tooltip` fields support inline translations. Instead of a plain string, use a YAML mapping:

```yaml
message0:
  en: "read sensor on pin %1"
  it: "leggi sensore su pin %1"
tooltip:
  en: "Read a value from the sensor."
  it: "Leggi un valore dal sensore."
```

### Rules

- **Translatable fields**: only `message0`, `message1`, ... and `tooltip`.
- **`en` is always required**. Other languages are optional. Plain strings (no object) pass through unchanged — backward compatible.
- **Preserve placeholders**: `%1`, `%2`, etc. must appear in every translation, in positions that make grammatical sense.
- **Keep API names untranslated** in messages: `Serial.begin`, `analogRead`, `Wire.write`, etc. Only translate surrounding natural language.
- **Use block-style YAML**, not flow-style:
  ```yaml
  # correct
  tooltip:
    en: "Read a value"
    it: "Leggi un valore"

  # avoid
  tooltip: {en: "Read a value", it: "Leggi un valore"}
  ```
- **Dropdown labels** (`options` in `field_dropdown`) are NOT translatable in the YAML — they are typically code identifiers (HIGH, LOW, MSBFIRST) that must stay in English.
- **`helpUrl`**, `type`, `name`, field names, `codegen` templates, and `category` are never translated.

### How it works at runtime

A preprocessor (`catalogI18nPreprocess.ts`) runs when the catalog is loaded in the webview. For each i18n object, it:

1. Resolves the active locale's string (falls back to `en`).
2. Registers it in `Blockly.Msg` under a generated key.
3. Replaces the object with a `%{BKY_KEY}` reference that Blockly resolves at render time.

### Supported languages

Currently: English (`en`) and Italian (`it`). To add a new locale, see the i18n section in the masterplan.

---

## Naming conventions

| Element | Convention | Example |
|---------|-----------|---------|
| `id` | kebab-case (external), snake_case (built-in) | `wifinina-connectivity`, `arduino_serial` |
| block `type` | snake_case: `<component>_<action>` | `wifi_connect`, `cpp_serial_begin` |
| `category` | Readable, `::` for nesting | `"Communication::Serial"` |
| field `name` | UPPER_SNAKE | `BAUD`, `PIN`, `SSID` |
| `tags` | kebab-case | `sensor`, `beginner`, `setup` |

---

## Validation

Catalogs are validated at two levels:

### JSON Schema

The schema (`block-catalog_v1.schema.json`) validates structural correctness: required fields, types, enum values, dependency formats.

### Structural checks

The `validate-catalog` tool (available in both the MCP server and the Copilot chat participant) performs additional logic checks that a schema cannot express:

1. **No duplicate `blockly.type`** across all documents.
2. **Precedence correctness**: every block with `output` must have `codegen.precedence`; every block without `output` must not.
3. **Placeholder consistency**: every `{{NAME}}` in codegen must match a field/input in `args0`/`args1`.
4. **inputDefaults coverage**: keys must correspond to `input_value` names.
5. **Declaration deduplication**: shared strings must be exactly identical.
6. **YAML syntax**: the file must parse as multi-document YAML.
7. **i18n consistency**: if a `message*`/`tooltip` is an object, it must have `en`; all translations must preserve the same `%1`/`%2` placeholders.

### WYSIWYG guidance

Implementation-level `codegen.setup` is **not** restricted by the validator — it's allowed. As a style recommendation, prefer explicit init blocks over impl-level `setup` for init calls, so the generated setup maps to visible blocks (see the WYSIWYG principle above).

---

## Complete example

A board-specific library (WiFiNINA) with `targets`, `dependencies`, shared `imports`, a helper function, and internationalized strings:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json

id: wifinina-connectivity
category: "WiFi"
colour: "#1565C0"
docs:
  library: "https://www.arduino.cc/reference/en/libraries/wifinina/"
implementations:
  - runtime: "arduino:cpp"
    targets:
      - mkrwifi1010
      - nano_33_iot
      - uno_wifi_rev2
    dependencies:
      - type: library
        name: WiFiNINA
    codegen:
      imports:
        - "#include <WiFiNINA.h>"
    blocks:
      # --- Connect to WiFi ---
      - blockly:
          type: wifi_connect
          message0:
            en: "connect to WiFi network %1 password %2"
            it: "connetti alla rete WiFi %1 password %2"
          args0:
            - type: field_input
              name: SSID
              text: "MyNetwork"
            - type: field_input
              name: PASSWORD
              text: "MyPassword"
          previousStatement: null
          nextStatement: null
          tooltip:
            en: "Connect to a WPA WiFi network. Blocks until connected. Place inside a setup block."
            it: "Connettiti a una rete WiFi WPA. Attende fino alla connessione. Metti dentro un blocco setup."
          helpUrl: "https://www.arduino.cc/reference/en/libraries/wifinina/wifi.begin/"
        tags:
          - setup
          - wifi
        codegen:
          helpers:
            connectWiFi: |
              void _connectWiFi(const char* ssid, const char* pass) {
                WiFi.begin(ssid, pass);
                while (WiFi.status() != WL_CONNECTED) {
                  delay(500);
                }
              }
          body:
            - '_connectWiFi("{{SSID}}", "{{PASSWORD}}");'

      # --- Check connection ---
      - blockly:
          type: wifi_is_connected
          message0:
            en: "WiFi connected?"
            it: "WiFi connesso?"
          args0: []
          output: Boolean
          tooltip:
            en: "Check if the board is currently connected to a WiFi network."
            it: "Verifica se la board e' attualmente connessa a una rete WiFi."
          helpUrl: "https://www.arduino.cc/reference/en/libraries/wifinina/wifi.status/"
        codegen:
          body:
            - "(WiFi.status() == WL_CONNECTED)"
          precedence: ATOMIC

      # --- Get IP address ---
      - blockly:
          type: wifi_local_ip
          message0:
            en: "WiFi local IP"
            it: "IP locale WiFi"
          args0: []
          output: null
          tooltip:
            en: "Get the board's local IP address as a String."
            it: "Ottieni l'indirizzo IP locale della board come String."
        codegen:
          body:
            - "String(WiFi.localIP()[0]) + \".\" + String(WiFi.localIP()[1]) + \".\" + String(WiFi.localIP()[2]) + \".\" + String(WiFi.localIP()[3])"
          precedence: ATOMIC

---
id: wifinina-rssi
category: "WiFi"
implementations:
  - runtime: "arduino:cpp"
    targets:
      - mkrwifi1010
      - nano_33_iot
      - uno_wifi_rev2
    blocks:
      # --- Signal strength ---
      - blockly:
          type: wifi_rssi
          message0:
            en: "WiFi signal strength (RSSI)"
            it: "potenza segnale WiFi (RSSI)"
          args0: []
          output: Number
          tooltip:
            en: "Get the WiFi signal strength in dBm. More negative = weaker signal."
            it: "Ottieni la potenza del segnale WiFi in dBm. Piu' negativo = segnale piu' debole."
        codegen:
          body:
            - "WiFi.RSSI()"
          precedence: ATOMIC
```

Key observations:
- Two YAML documents (`---` separator): both share the same `category` but have independent `id`s. The second document inherits no state from the first.
- `targets` restricts to specific MKR/Nano/Uno WiFi boards.
- `dependencies` and `codegen.imports` are on the first implementation only — the `#include` is shared.
- The connect block uses a `helpers` function to encapsulate the blocking loop.
- All `message0` and `tooltip` fields have `en` and `it` translations.
- The IP address block uses `output: null` (untyped) because it returns a dynamically constructed String.
- The RSSI block in the second document has no `dependencies` or implementation-level `codegen` — it relies on the `#include` from the first document being emitted when any WiFiNINA block is used.

---

## Reference links

- [Block Catalog JSON Schema](https://raw.githubusercontent.com/linucs/vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json)
- [Blockly JSON Block Definition](https://developers.google.com/blockly/guides/create-custom-blocks/define/block-anatomy)
- [PlatformIO Registry](https://registry.platformio.org/)
- [Arduino Library Index](https://downloads.arduino.cc/libraries/library_index.json)
