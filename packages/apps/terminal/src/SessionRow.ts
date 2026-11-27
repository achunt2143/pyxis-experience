import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import spec from './SessionRow.view.json';
import { caption, isFailure, sequenceNumber, sessionName, showsRunning, stateWord, type Session } from './sessions';
import type { CodeBehind } from './SessionRow.view.gen';

/**
 * One row of the Sessions pane. `item` is the Session (set by the Repeater); `index`,
 * `current` and `now` by the app. Every state is a word first: the Spinner, the bell count
 * and the error colour only sit beside it.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.draw();
  },

  itemChanged() {
    this.draw();
  },
  indexChanged() {
    this.draw();
  },
  currentChanged() {
    this.draw();
  },
  nowChanged() {
    this.draw();
  },

  draw() {
    const s = this.item as Session | null;
    if (!s) return;
    const now = this.now as number;
    const { num, title, caption: cap, spinner, bells, state } = this.$;
    const name = sessionName(s);
    const word = stateWord(s, now);
    num.setContent(sequenceNumber(this.index as number));
    title.setContent(name);
    cap.setContent(caption(s));
    spinner.setShowing(showsRunning(s, now));
    bells.setShowing(s.bells > 0);
    bells.setContent(String(s.bells));
    state.setContent(s.bells > 0 && word === 'Idle' ? 'Bell' : word);
    this.addRemoveClass('on', !!this.current);
    this.addRemoveClass('failed', isFailure(s));
    this.setAttributes({
      role: 'button',
      tabIndex: 0,
      'aria-current': this.current ? 'true' : 'false',
      'aria-label': [name, caption(s), word, s.bells > 0 ? `${s.bells} ${s.bells === 1 ? 'bell' : 'bells'}` : ''].filter(Boolean).join(', '),
    });
  },

  rowKeyDown(_sender: Component, event: ComponentEvent) {
    if (event['key'] === 'Enter' || event['key'] === ' ') {
      event['preventDefault']?.();
      this.bubble('ontap', { type: 'tap', originator: this });
      return true;
    }
    return false;
  },
} satisfies CodeBehind);
