// The `attributes` property of pyxis.Control: a spec's way to put `data-*`, `aria-*` and a few
// other plain attributes on the element a kind draws. A spec is data (often a `.view.json`
// a user or a package supplies), so this is a whitelist, not a pass-through: anything that
// could carry behaviour (`dangerouslySetInnerHTML`, `onClick`, `style`, `className`, `ref`,
// `href`, `src`, …) is dropped here, and each of those has its own published property.

export type AttributeValue = string | number | boolean;
export type Attributes = Readonly<Record<string, AttributeValue>>;

const NONE: Attributes = Object.freeze({});

/** `data-shell-region`, `data-timezone`, … ; `data-duyo-*` is the renderer's own identity. */
const DATA = /^data-[a-z0-9][a-z0-9_.:-]*$/;
const ARIA = /^aria-[a-z]+$/;

const isScalar = (value: unknown): value is AttributeValue =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/**
 * Keeps `data-*`, `aria-*`, `role`, `tabIndex` (`tabindex` too), `id`, `title` and
 * `draggable`, with scalar values only. Names are matched case-insensitively and emitted in
 * the form React wants. Returns a shared empty object when nothing survives.
 */
export function filterAttributes(source: unknown): Attributes {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return NONE;

  let out: Record<string, AttributeValue> | undefined;
  const put = (name: string, value: AttributeValue) => {
    (out ??= {})[name] = value;
  };

  for (const [key, value] of Object.entries(source)) {
    if (!isScalar(value)) continue;
    const name = key.toLowerCase();

    if (name.startsWith('data-duyo-')) continue;
    if (DATA.test(name) || ARIA.test(name)) {
      put(name, value);
      continue;
    }
    switch (name) {
      case 'role':
        if (typeof value === 'string') put('role', value);
        break;
      case 'id':
      case 'title':
        if (typeof value !== 'boolean') put(name, String(value));
        break;
      case 'tabindex': {
        const index = Number(value);
        if (typeof value !== 'boolean' && Number.isInteger(index)) put('tabIndex', index);
        break;
      }
      case 'draggable':
        if (typeof value === 'boolean') put('draggable', value);
        else if (value === 'true' || value === 'false') put('draggable', value === 'true');
        break;
    }
  }
  return out ?? NONE;
}
