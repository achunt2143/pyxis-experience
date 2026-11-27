import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { loadAppData, playSystemSound, saveAppData } from '@pyxis/app-sdk';
import { onDestroy } from '@pyxis/app-sdk/duyo';
import spec from './TerminalApp.view.json';
import {
  DEFAULT_PROFILE,
  FONT_DEFAULT,
  FONT_MAX,
  FONT_MIN,
  QUICK_KEYS,
  STORE,
  matchTerminalShortcut,
  normalizeProfile,
  type TabInfo,
  type TerminalDoc,
  type TerminalMode,
  type TerminalProfile,
} from './model';
import {
  applyClosed,
  applyStatus,
  markSeen,
  newSession,
  peekLabel,
  predictPeek,
  rememberFolder,
  ringBell,
  sessionName,
  stateWord,
  subheader,
  summary,
  type Session,
  type SessionJob,
} from './sessions';
import { TerminalHub } from './terminalHub';
import type { CodeBehind } from './TerminalApp.view.gen';
import './SessionRow';
import './FolderRow';
import './terminal.css';

/** The stack's panels, in order (Sessions is 0). */
const SCREEN = 1;
const PROFILE = 2;

/** How long the pane edge stays lit for a bell (in, hold, out are CSS). */
const BELL_GLOW_MS = 400;

/**
 * Terminal: sessions as panes on Remochi's time line. The Sessions pane lists every shell
 * with what it is doing; the front pane is the active session's screen; a session whose job
 * finished while you were elsewhere waits as a peek at the right edge; Profile opens to the
 * right of the screen.
 *
 * This kind owns the state (the sessions, which is active, the profile, recent folders) and
 * none of the terminals: those live in the `Terminal.Screens` island, reached only through
 * `hub`, which reports back what each shell is doing (status, bells, exit codes). Every word
 * a row or the Subheader shows comes from `sessions.ts`.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.setAttributes({ 'data-window-id': this.windowId });
    this._hub = new TerminalHub();
    this._nextId = 1;
    this._starts = new Map<string, string | undefined>();
    this._peekId = null as string | null;
    this._peekKey = '';
    this._closing = null as string | null;
    this._glowTimer = null as ReturnType<typeof setTimeout> | null;
    this._loaded = false;
    this.setProfile({ ...DEFAULT_PROFILE });
    this.$.screens.setHub(this._hub);
    this.$.keys.setItems(QUICK_KEYS);
    (this._hub as TerminalHub).onResize = (id) => {
      if (id === this.activeId) this.syncScreenText();
    };

    const first = this.makeSession();
    this.setSessions([first]);
    this.setActiveId(first.id);

    // Running shows only after a job has been in front for 2 s: a tick moves `now` while one is.
    const tick = setInterval(() => {
      if (this.destroyed) return;
      if ((this.sessions as Session[]).some((s) => s.state === 'running')) {
        this.setNow(Date.now());
        this.syncRows();
      }
    }, 1000);

    const narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 768px), (pointer: coarse)') : null;
    const onMedia = () => this.syncKeys();
    narrow?.addEventListener?.('change', onMedia);
    this._touchy = narrow;

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.destroyed) return;
      const action = matchTerminalShortcut(e);
      if (!action) return;
      e.preventDefault();
      if (e.repeat && action !== 'zoomIn' && action !== 'zoomOut') return;
      switch (action) {
        case 'newTab':
          this.openSession();
          break;
        case 'closeTab':
          this.requestClose(this.activeId);
          break;
        case 'copy':
          void this._hub.copySelection(this.activeId);
          break;
        case 'paste':
          void this._hub.pasteClipboard(this.activeId);
          break;
        case 'clear':
          this._hub.clear(this.activeId);
          break;
        case 'zoomIn':
          this.updateProfile({ fontSize: Math.min(FONT_MAX, (this.profile as TerminalProfile).fontSize + 1) });
          break;
        case 'zoomOut':
          this.updateProfile({ fontSize: Math.max(FONT_MIN, (this.profile as TerminalProfile).fontSize - 1) });
          break;
        case 'zoomReset':
          this.updateProfile({ fontSize: FONT_DEFAULT });
          break;
        case 'nextTab':
          this.cycle(1);
          break;
        case 'prevTab':
          this.cycle(-1);
          break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onDestroy(this, () => {
      clearInterval(tick);
      narrow?.removeEventListener?.('change', onMedia);
      document.removeEventListener('keydown', onKeyDown);
      if (this._glowTimer) clearTimeout(this._glowTimer as ReturnType<typeof setTimeout>);
    });

    void loadAppData<TerminalDoc>(STORE, { profile: DEFAULT_PROFILE, recent: [] }).then((doc) => {
      if (this.destroyed) return;
      this._loaded = true;
      this.setProfile(normalizeProfile(doc?.profile));
      this.setRecent(Array.isArray(doc?.recent) ? doc.recent.filter((c) => typeof c === 'string') : []);
      this.sync();
    });

    this.sync();
  },

  /** remochi.Button takes no aria attributes: label the inner <button> once drawn. */
  rendered() {
    this.inherited();
    const host = document.querySelector(`[data-duyo-id="${this.$.sessionButton.id}"]`);
    host?.querySelector('button')?.setAttribute('aria-label', 'Session menu');
  },

  // Sessions.
  makeSession(cwd?: string): Session {
    const id = `session-${Date.now()}-${(this._nextId as number)++}`;
    (this._starts as Map<string, string | undefined>).set(id, cwd);
    return newSession(id, cwd ?? '~');
  },
  newSession() {
    this.openSession();
    return true;
  },
  /** A new session in `cwd`, or where the profile says (the last folder, else home). */
  openSession(cwd?: string) {
    const profile = this.profile as TerminalProfile;
    const start = typeof cwd === 'string' ? cwd : profile.startInLastFolder ? (this.recent as string[])[0] : undefined;
    const s = this.makeSession(start);
    this.setSessions([...(this.sessions as Session[]), s]);
    this.activate(s.id);
  },
  startIn(sender: Component) {
    const folder = sender['item'] as { cwd: string } | null;
    if (folder) this.openSession(folder.cwd);
    return true;
  },
  pickSession(sender: Component) {
    const s = sender['item'] as Session | null;
    if (s) this.activate(s.id);
    return true;
  },
  /** Makes `id` the front session: clears what it held for you and brings its screen forward. */
  activate(id: string) {
    this.setActiveId(id);
    this.updateSession(id, markSeen);
    this.$.stack.setActiveIndex(SCREEN);
    this.sync();
    // The screen is shown on the next render; give it the keyboard once it is, after the
    // tapped row has taken focus for itself.
    setTimeout(() => {
      if (!this.destroyed && this.activeId === id) this._hub.focus(id);
    }, 80);
  },
  cycle(delta: 1 | -1) {
    const sessions = this.sessions as Session[];
    if (sessions.length <= 1) return;
    const idx = Math.max(0, sessions.findIndex((s) => s.id === this.activeId));
    this.activate(sessions[(idx + delta + sessions.length) % sessions.length]!.id);
  },
  updateSession(id: string, change: (s: Session) => Session) {
    this.setSessions((this.sessions as Session[]).map((s) => (s.id === id ? change(s) : s)));
  },
  sessionById(id: string): Session | undefined {
    return (this.sessions as Session[]).find((s) => s.id === id);
  },

  // What the screens report.
  statusChanged(_sender: Component, event: ComponentEvent) {
    const { id, cwd, job } = event as { id: string; cwd: string; job: SessionJob | null };
    const now = Date.now();
    this.setNow(now);
    this.updateSession(id, (s: Session) => applyStatus(s, { terminalId: s.terminalId ?? '', cwd, job }, id === this.activeId, now));
    const recent = rememberFolder(this.recent as string[], cwd);
    if (recent.join('\n') !== (this.recent as string[]).join('\n')) {
      this.setRecent(recent);
      this.save();
    }
    this.sync();
    return true;
  },
  bellRang(_sender: Component, event: ComponentEvent) {
    const id = event['id'] as string;
    const active = id === this.activeId;
    this.updateSession(id, (s: Session) => ringBell(s, active));
    if (active) {
      const bell = (this.profile as TerminalProfile).bell;
      if (bell === 'light') this.glow();
      else if (bell === 'sound') void playSystemSound('notification');
    }
    this.sync();
    return true;
  },
  /** The front pane's edge lights in the Terminal green, then fades (motion modes are CSS). */
  glow() {
    const panel = this.$.screens;
    panel.addRemoveClass('term-bell', true);
    if (this._glowTimer) clearTimeout(this._glowTimer as ReturnType<typeof setTimeout>);
    this._glowTimer = setTimeout(() => {
      if (!this.destroyed) panel.addRemoveClass('term-bell', false);
    }, BELL_GLOW_MS);
  },
  /** A shell ended: code 0 (or unknown) closes its session; any other keeps it for Enter to restart. */
  shellEnded(_sender: Component, event: ComponentEvent) {
    const { id, exitCode } = event as { id: string; exitCode: number | null };
    const s = this.sessionById(id);
    if (!s) return true;
    const kept = applyClosed(s, exitCode ?? null);
    if (kept) {
      this.updateSession(id, () => kept);
      this.sync();
    } else {
      this.closeById(id);
    }
    return true;
  },
  modeChanged(_sender: Component, event: ComponentEvent) {
    const { id, mode } = event as { id: string; mode: TerminalMode };
    this.updateSession(id, (s: Session) => ({ ...s, mock: mode === 'mock' }));
    this.sync();
    return true;
  },
  /** The mock shell names its last command; the session's name comes from its folder instead. */
  titled() {
    return true;
  },
  selectionMenu(_sender: Component, event: ComponentEvent) {
    const menu = this.$.selectionMenu;
    menu.setAnchorRect(event['rect']);
    menu.setOpen(true);
    return true;
  },

  // Closing.
  /** Asks first when a job is running and the profile says to; otherwise closes at once. */
  requestClose(id: string) {
    const s = this.sessionById(id);
    if (!s) return;
    if (s.state === 'running' && (this.profile as TerminalProfile).askBeforeClose && s.job) {
      this._closing = id;
      const name = sessionName(s);
      const job = s.job.command.split(/\s+/).slice(0, 2).join(' ');
      this.$.closeDialog.setTitle(`Close ${name}?`);
      this.$.closeText.setContent(`${job} is still running in this session. Closing the session stops it.`);
      this.$.closeDialog.setOpen(true);
      return;
    }
    this.closeById(id);
  },
  closeConfirmed() {
    const id = this._closing as string | null;
    this._closing = null;
    if (id) this.closeById(id);
    return true;
  },
  closeCancelled() {
    this._closing = null;
    return true;
  },
  /** The last session gone closes the app; else the one before it comes to the front. */
  closeById(id: string) {
    const sessions = this.sessions as Session[];
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      this.doClose();
      return;
    }
    (this._starts as Map<string, string | undefined>).delete(id);
    this.setSessions(remaining);
    if (this.activeId === id) this.setActiveId(remaining[Math.max(0, idx - 1)]!.id);
    this.sync();
    this._hub.focus(this.activeId);
  },

  // The Session menu, and the selection's.
  /** Opened a tick later: the popup closes on any click outside it, the opening one included. */
  openSessionMenu() {
    setTimeout(() => {
      if (!this.destroyed) this.$.sessionMenu.setOpen(true);
    }, 0);
    return true;
  },
  sessionMenuAction(sender: Component, event: ComponentEvent) {
    (sender as Component & { setOpen(open: boolean): void }).setOpen(false);
    switch (event['action']) {
      case 'copy':
        void this._hub.copySelection(this.activeId);
        break;
      case 'paste':
        void this._hub.pasteClipboard(this.activeId);
        break;
      case 'clear':
        this._hub.clear(this.activeId);
        break;
      case 'profile':
        this.openProfile();
        break;
      case 'close':
        this.requestClose(this.activeId);
        break;
    }
    return true;
  },

  // The right-hand peek and the stack.
  peekOpened() {
    const id = this._peekId as string | null;
    this.$.peek.setShowing(false);
    if (id) this.activate(id);
    return true;
  },
  panelMoved() {
    return true;
  },
  openProfile() {
    this.$.profilePanel.setShowing(true);
    this.$.stack.setActiveIndex(PROFILE);
    return true;
  },

  // Profile.
  updateProfile(change: Partial<TerminalProfile>) {
    this.setProfile(normalizeProfile({ ...(this.profile as TerminalProfile), ...change }));
    this.save();
    this.sync();
  },
  sizePicked(_sender: Component, event: ComponentEvent) {
    this.updateProfile({ fontSize: Number(event['value']) });
    return true;
  },
  cursorPicked(_sender: Component, event: ComponentEvent) {
    this.updateProfile({ cursor: event['value'] as TerminalProfile['cursor'] });
    return true;
  },
  bellPicked(_sender: Component, event: ComponentEvent) {
    this.updateProfile({ bell: event['value'] as TerminalProfile['bell'] });
    return true;
  },
  keysPicked(_sender: Component, event: ComponentEvent) {
    this.updateProfile({ keys: event['value'] ? 'on' : 'auto' });
    return true;
  },
  lastFolderPicked(_sender: Component, event: ComponentEvent) {
    this.updateProfile({ startInLastFolder: !!event['value'] });
    return true;
  },
  askPicked(_sender: Component, event: ComponentEvent) {
    this.updateProfile({ askBeforeClose: !!event['value'] });
    return true;
  },
  /** Saves the profile and recent folders; never before the stored copy has been read. */
  save() {
    if (!this._loaded) return;
    void saveAppData(STORE, { profile: this.profile, recent: this.recent } satisfies TerminalDoc);
  },

  // Keys.
  sendQuick(_sender: Component, event: ComponentEvent) {
    this._hub.sendKey(this.activeId, event['value']);
    return true;
  },

  /** Per-row state that is not the item. */
  setupRow(_sender: Component, event: ComponentEvent) {
    const sessions = this.sessions as Session[];
    const item = event['item'] as Session;
    const row = event['component'];
    row.setIndex(sessions.findIndex((s) => s.id === item.id));
    row.setCurrent(item.id === this.activeId);
    row.setNow(this.now);
    return true;
  },

  // Pushing what the panes show. Setting a value a child already has changes nothing.
  sync() {
    this.syncRows();
    this.syncScreenText();
    this.syncPeek();
    this.syncKeys();
    this.syncProfile();
    const { screens } = this.$;
    const starts = this._starts as Map<string, string | undefined>;
    screens.setTabs(
      (this.sessions as Session[]).map((s): TabInfo => ({ id: s.id, title: '', cwd: starts.get(s.id) }))
    );
    screens.setActiveId(this.activeId);
    screens.setFontSize((this.profile as TerminalProfile).fontSize);
    screens.setCursor((this.profile as TerminalProfile).cursor);
  },
  syncRows() {
    const { sessionList, recentList, recentLabel, summary: line } = this.$;
    const sessions = this.sessions as Session[];
    sessionList.setItems(sessions);
    sessionList.refresh();
    line.setContent(summary(sessions, this.now as number));
    // Folders a session is already in are one tap away in the list above.
    const open = new Set(sessions.map((s) => s.cwd));
    const recent = (this.recent as string[])
      .filter((cwd) => !open.has(cwd))
      .slice(0, 3)
      .map((cwd) => ({ cwd }));
    recentList.setItems(recent);
    recentLabel.setShowing(recent.length > 0);
    recentList.setShowing(recent.length > 0);
  },
  syncScreenText() {
    const s = this.sessionById(this.activeId);
    if (!s) return;
    const size = (this._hub as TerminalHub).size(s.id) ?? { cols: 80, rows: 24 };
    this.$.screenHeader.setContent(sessionName(s));
    this.$.screenSub.setContent(subheader(s, 'Shell', size.cols, size.rows));
  },
  /** One peek, or none: the first session whose job finished while you were elsewhere. */
  syncPeek() {
    const sessions = this.sessions as Session[];
    const next = predictPeek(sessions, this.activeId);
    const { stack, peek, peekHeader } = this.$;
    const key = next ? `${next.id}:${stateWord(next, 0)}` : '';
    if (key === this._peekKey) return;
    this._peekKey = key;
    this._peekId = next?.id ?? null;
    if (!next) {
      stack.setUpcoming('');
      return;
    }
    const index = sessions.indexOf(next);
    peekHeader.setContent(sessionName(next));
    peek.setSequence({ index: index + 1, label: stateWord(next, 0) });
    peek.setPeekLabel(peekLabel(next));
    stack.setUpcoming('peek');
  },
  syncKeys() {
    const mode = (this.profile as TerminalProfile).keys;
    const touchy = !!(this._touchy as MediaQueryList | null)?.matches;
    this.$.keys.setShowing(mode === 'on' || (mode === 'auto' && touchy));
  },
  syncProfile() {
    const p = this.profile as TerminalProfile;
    const $ = this.$;
    $.sizeSlider.setValue(p.fontSize);
    $.sizeValue.setContent(`${p.fontSize} px`);
    $.cursorBlock.setChecked(p.cursor === 'block');
    $.cursorBar.setChecked(p.cursor === 'bar');
    $.cursorUnderline.setChecked(p.cursor === 'underline');
    $.bellLight.setChecked(p.bell === 'light');
    $.bellSound.setChecked(p.bell === 'sound');
    $.bellNone.setChecked(p.bell === 'none');
    $.keysToggle.setValue(p.keys === 'on');
    $.lastFolderToggle.setValue(p.startInLastFolder);
    $.askToggle.setValue(p.askBeforeClose);
  },
} satisfies CodeBehind);
