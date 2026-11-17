import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import {
  CURSOR_SIZES,
  SETTING_KEYS,
  applyAnimationMode,
  isAnimationMode,
  oneOf,
  setSetting,
  type AnimationMode,
  type CursorSize,
} from '@pyxis/app-sdk';
import { bindSetting } from '@pyxis/app-sdk/duyo';
import { forwardAriaLabel, present } from '../parts/present';
import spec from './Accessibility.view.json';
import type { CodeBehind } from './Accessibility.view.gen';

const parseTextScale = (raw: unknown): number | undefined =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 75 && raw <= 150 ? raw : undefined;
const parseBool = (raw: unknown): boolean | undefined => (typeof raw === 'boolean' ? raw : undefined);
const parseCursorSize = oneOf<CursorSize>(...CURSOR_SIZES);

/** Accessibility: animations, text scaling, contrast/transparency, and pointer size. */
export default view(spec, {
  create() {
    this.inherited();
    // `full` until the saved value arrives, as useAnimationMode did.
    bindSetting<AnimationMode>(this, SETTING_KEYS.animations, 'animationMode', 'full', (raw) =>
      isAnimationMode(raw) ? raw : undefined
    );
    bindSetting<number>(this, SETTING_KEYS.textScale, 'textScale', 100, parseTextScale);
    bindSetting<boolean>(this, SETTING_KEYS.highContrast, 'highContrast', false, parseBool);
    bindSetting<boolean>(this, SETTING_KEYS.reduceTransparency, 'reduceTransparency', false, parseBool);
    bindSetting<CursorSize>(this, SETTING_KEYS.cursorSize, 'cursorSize', 'default', parseCursorSize);

    this.animationModeChanged();
    this.textScaleChanged();
    this.highContrastChanged();
    this.reduceTransparencyChanged();
    this.cursorSizeChanged();
    this.errorChanged();
  },
  rendered() {
    this.inherited();
    forwardAriaLabel(this.$.highContrastToggle, '[role="switch"]', 'High contrast');
    forwardAriaLabel(this.$.reduceTransparencyToggle, '[role="switch"]', 'Reduce transparency');
  },
  async commitSetting(key: string, write: () => Promise<void>, revert: () => void) {
    this.setError('');
    try {
      await write();
    } catch (err) {
      if (this.destroyed) return;
      this.setError(`Couldn't save ${key}: ${err instanceof Error ? err.message : String(err)}`);
      revert();
    }
  },
  async pick(sender: Component) {
    const mode = sender['option'] as AnimationMode;
    await this.commitSetting(SETTING_KEYS.animations, () => applyAnimationMode(mode), () => this.animationModeChanged());
    return true;
  },
  async pickTextScale(sender: Component) {
    const scale = Number(sender['option']);
    if (Number.isInteger(scale)) {
      await this.commitSetting(SETTING_KEYS.textScale, () => setSetting(SETTING_KEYS.textScale, scale), () => this.textScaleChanged());
    }
    return true;
  },
  async toggleHighContrast(_sender: Component, event: ComponentEvent) {
    const value = Boolean(event['value']);
    await this.commitSetting(SETTING_KEYS.highContrast, () => setSetting(SETTING_KEYS.highContrast, value), () => this.highContrastChanged());
    return true;
  },
  async toggleReduceTransparency(_sender: Component, event: ComponentEvent) {
    const value = Boolean(event['value']);
    await this.commitSetting(
      SETTING_KEYS.reduceTransparency,
      () => setSetting(SETTING_KEYS.reduceTransparency, value),
      () => this.reduceTransparencyChanged()
    );
    return true;
  },
  async pickCursorSize(sender: Component) {
    const size = sender['option'] as CursorSize;
    await this.commitSetting(SETTING_KEYS.cursorSize, () => setSetting(SETTING_KEYS.cursorSize, size), () => this.cursorSizeChanged());
    return true;
  },
  errorChanged() {
    const { errorRow } = this.$;
    errorRow.setContent(this.error);
    present(errorRow, this.error !== '', { role: 'alert', 'data-accessibility-error': true });
  },
  animationModeChanged() {
    const { full, reduced, off } = this.$;
    full.setChecked(this.animationMode === 'full');
    reduced.setChecked(this.animationMode === 'reduced');
    off.setChecked(this.animationMode === 'off');
  },
  textScaleChanged() {
    const { scale75, scale100, scale125, scale150 } = this.$;
    scale75.setChecked(this.textScale === 75);
    scale100.setChecked(this.textScale === 100);
    scale125.setChecked(this.textScale === 125);
    scale150.setChecked(this.textScale === 150);
  },
  highContrastChanged() {
    this.$.highContrastToggle.setValue(this.highContrast);
  },
  reduceTransparencyChanged() {
    this.$.reduceTransparencyToggle.setValue(this.reduceTransparency);
  },
  cursorSizeChanged() {
    const { cursorDefault, cursorLarge, cursorXLarge } = this.$;
    cursorDefault.setChecked(this.cursorSize === 'default');
    cursorLarge.setChecked(this.cursorSize === 'large');
    cursorXLarge.setChecked(this.cursorSize === 'xlarge');
  },
} satisfies CodeBehind);
