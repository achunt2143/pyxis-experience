import { view, type Component } from '@duyojs/duyo';
import { SETTING_KEYS, applyAnimationMode, isAnimationMode, type AnimationMode } from '@pyxis/app-sdk';
import { bindSetting } from '@pyxis/app-sdk/duyo';
import spec from './Accessibility.view.json';
import type { CodeBehind } from './Accessibility.view.gen';

/** Accessibility: the animation mode, shared by Bloom's motion and Evo's window animations. */
export default view(spec, {
  create() {
    this.inherited();
    // `full` until the saved value arrives, as useAnimationMode did.
    bindSetting<AnimationMode>(this, SETTING_KEYS.animations, 'animationMode', 'full', (raw) =>
      isAnimationMode(raw) ? raw : undefined
    );
    this.animationModeChanged();
  },
  pick(sender: Component) {
    void applyAnimationMode(sender['option'] as AnimationMode);
    return true;
  },
  animationModeChanged() {
    const { full, reduced, off } = this.$;
    full.setChecked(this.animationMode === 'full');
    reduced.setChecked(this.animationMode === 'reduced');
    off.setChecked(this.animationMode === 'off');
  },
} satisfies CodeBehind);
