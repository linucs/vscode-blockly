import * as Blockly from 'blockly';

/**
 * Single registration point for the Blockly **fields and extensions that catalog
 * blocks may reference** in their `blockly` JSON. Imported by BOTH the runtime
 * webview (`plugins.ts`) and the Guided Catalog Editor, so a block authored in the
 * editor previews exactly what the runtime renders, and any field/extension added
 * here becomes available in both bundles at once (no drift, no per-bundle list).
 *
 * Built-in Blockly fields (`field_input`, `field_dropdown`, `field_number`,
 * `field_checkbox`, `field_label`, `field_image`, `field_variable`) auto-register
 * with core and need no entry here.
 *
 * Registration is order-independent and idempotent (the custom modules guard their
 * own `register` calls), so importing this from several entry points is safe.
 */

// Official Blockly field plugins. slider / dependent-dropdown / grid-dropdown
// auto-register on import; angle / colour / multiline / hsv need an explicit call.
import '@blockly/field-slider';            // field_slider
import { registerFieldAngle } from '@blockly/field-angle';
import { registerFieldColour } from '@blockly/field-colour';
import '@blockly/field-dependent-dropdown'; // field_dependent_dropdown
import '@blockly/field-grid-dropdown';     // field_grid_dropdown
import { FieldColourHsvSliders } from '@blockly/field-colour-hsv-sliders';
import { registerFieldMultilineInput } from '@blockly/field-multilineinput';

// First-party custom fields + block extensions (each self-registers on import).
import './custom-fields/FieldThemedBitmap';   // field_bitmap (themed subclass)
import './custom-fields/FieldCombobox';        // field_combobox
import './custom-fields/FieldTypedParamInput'; // field_typed_param_input
import './custom-fields/FieldCode';            // field_code
import './custom-fields/FieldParamInput';      // field_param_input
import './custom-blocks/hatEventStyle';        // hat_event_style extension

registerFieldAngle();
registerFieldColour();
registerFieldMultilineInput();
Blockly.fieldRegistry.register('field_colour_hsv_sliders', FieldColourHsvSliders);

/**
 * The block `extensions` catalog blocks may reference — the single source the
 * Guided Catalog Editor's `extension` block seeds its combobox from, kept here next
 * to the imports that actually register them so the two never drift. Custom names
 * are still accepted (the combobox allows free text).
 */
export const CATALOG_EXTENSIONS = ['hat_event_style'] as const;
