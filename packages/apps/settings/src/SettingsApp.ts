import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import spec from "./SettingsApp.view.json";
import {
  Accessibility, Bell, Clock, Cpu, Globe, HardDrive, Info, Mic, MicOff, Monitor, MousePointer, Palette, Shield, Type, Users, Volume2, Wifi,
  Eye, EyeOff, Globe2, Hash, KeyRound, Lock, MapPin, Moon, PanelBottom, PanelLeft, Play, Power, RotateCcw, Search, ShieldAlert,
  ShieldCheck, Sparkles, Sun, SunMoon, Sunrise, User, UserRound, VolumeX, Waves, WifiOff,
} from 'lucide-react';
import { powerCall, type PowerAction } from '@pyxis/app-sdk';
import { onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import { fetchSystemInfo, type SystemInfo } from './about';
import { SECTIONS, footerText, isSectionId, type SectionId } from './model';
import { forwardAriaLabel } from './parts/present';
import type { RailItem } from './parts/RailRow';
import type { CodeBehind } from './SettingsApp.view.gen';
import './parts/Groupbox';
import './parts/Choice';
import './parts/Fact';
import './parts/RailRow';
import './sections/Appearance';
import './sections/Sound';
import './sections/Accessibility';
import './sections/Network';
import './sections/DateTime';
import './sections/Users';
import './sections/System';
import './sections/About';
import './settings.css';

// Every icon the Settings views and code name (specs and the code-behinds' setIcon calls).
registerIcons({
  Accessibility, Bell, Clock, Cpu, Globe, HardDrive, Info, Mic, MicOff, Monitor, MousePointer, Palette, Shield, Type, Users, Volume2, Wifi,
  Eye, EyeOff, Globe2, Hash, KeyRound, Lock, MapPin, Moon, PanelBottom, PanelLeft, Play, Power, RotateCcw, Search, ShieldAlert,
  ShieldCheck, Sparkles, Sun, SunMoon, Sunrise, User, UserRound, VolumeX, Waves, WifiOff,
});

const POWER_COPY: Record<PowerAction, { title: string; confirm: string; body: string }> = {
  shutdown: {
    title: 'Shut Down System?',
    confirm: 'Shut Down',
    body: 'Are you sure you want to shut down Pyxis OS? Any unsaved work will be lost.',
  },
  reboot: {
    title: 'Restart System?',
    confirm: 'Restart',
    body: 'Are you sure you want to restart Pyxis OS? Applications will close.',
  },
  sleep: { title: 'Suspend System?', confirm: 'Sleep', body: 'Put Pyxis OS into low-power sleep mode?' },
};

const POWER_PROGRESS: Record<PowerAction, string> = {
  sleep: 'Entering sleep mode...',
  reboot: 'Rebooting system...',
  shutdown: 'Shutting down system...',
};

/**
 * Settings: Palm webOS Mochi / Zen of Palm system preferences. A section rail (with the
 * suites' `data-settings-section` selectors) and a stage holding one section kind at a time,
 * created when it is picked and destroyed when another is (as the old app mounted only the
 * open section: the wallpaper previews and the clock loop are not running behind a hidden one).
 *
 * This kind owns the open section, `system.getInfo`'s answer (the footer and About) and the
 * power confirmation; every setting is read inside the section that shows it, through the
 * SDK's binders, so a change made elsewhere shows live.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.setAttributes({ 'data-window-id': this.windowId });
    // undefined while asking, null when the system service didn't answer (as the old app held it).
    this._info = undefined as SystemInfo | null | undefined;
    this._infoSeq = 0;
    this._section = null as Component | null;
    this._statusTimer = null as ReturnType<typeof setTimeout> | null;
    onDestroy(this, () => {
      if (this._statusTimer) clearTimeout(this._statusTimer);
    });

    void this.refreshSystemInfo();
    this.$.footer.setContent(footerText(undefined));
    this.openSection();
    this.drawRail();
  },

  rendered() {
    this.inherited();
    forwardAriaLabel(this.$.backButton, 'button', 'Back to sections');
  },

  async refreshSystemInfo() {
    const seq = ++(this._infoSeq as number);
    const info = await fetchSystemInfo();
    if (this.destroyed || seq !== this._infoSeq) return;
    this._info = info;
    this.$.footer.setContent(footerText(info));
    if (this.section === 'about') {
      (this._section as Component | null)?.set('infoState', info === null ? 'failed' : 'ready');
      (this._section as Component | null)?.set('info', info);
    }
  },

  backToRail() {
    this.$.stack.setActiveIndex(0);
    return true;
  },

  pickSection(sender: Component) {
    const id = (sender['item'] as RailItem).section.id;
    this.setSection(id);
    this.$.stack.setActiveIndex(1);
    return true;
  },

  /** Enter or Space on a focused rail row opens its section, as a button would. */
  railKey(sender: Component, event: ComponentEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return false;
    event.preventDefault?.();
    return this.pickSection(sender);
  },

  sectionChanged(_previous: unknown, value: unknown) {
    if (!isSectionId(value)) return;
    this.openSection();
    this.drawRail();
  },

  /** The rail: one row per section, the open one selected. */
  drawRail() {
    this.$.rail.setItems(SECTIONS.map((section): RailItem => ({ section, selected: section.id === this.section })));
  },

  /** Replaces the stage's section with the open one's kind. */
  openSection() {
    const def = SECTIONS.find((s) => s.id === (this.section as SectionId)) ?? SECTIONS[0];
    const { stage, stageHeader, stageTitle, host } = this.$;
    stage.setAttributes({ 'data-settings-stage': def.id });
    stageHeader.setContent(def.label);
    stageTitle.setContent(def.label);

    (this._section as Component | null)?.destroy();
    const info = this._info as SystemInfo | null | undefined;
    const section = host.createComponent(
      {
        kind: def.kind,
        classes: 'st-section',
        ...(def.id === 'system' ? { status: this.powerStatus, onRequest: 'requestPower' } : {}),
        ...(def.id === 'about' ? { infoState: info === undefined ? 'asking' : info === null ? 'failed' : 'ready', info } : {}),
      },
      { owner: this }
    );
    this._section = section;
    if (def.id === 'about') {
      void this.refreshSystemInfo();
    }
  },

  /** System's buttons: ask before acting. */
  requestPower(_sender: Component, event: ComponentEvent) {
    const action = event['action'] as PowerAction;
    const copy = POWER_COPY[action];
    const { powerDialog, powerText } = this.$;
    this.setPendingPower(action);
    powerDialog.setTitle(copy.title);
    powerDialog.setConfirmText(copy.confirm);
    powerText.setContent(copy.body);
    powerDialog.setOpen(true);
    return true;
  },
  powerCancelled() {
    this.setPendingPower('');
    return true;
  },
  async powerConfirmed() {
    const action = this.pendingPower as PowerAction | '';
    this.setPendingPower('');
    if (!action) return true;
    try {
      this.setPowerStatus(POWER_PROGRESS[action]);
      await powerCall(action);
    } catch (err) {
      console.error('Power action failed:', err);
      if (this.destroyed) return true;
      this.setPowerStatus('Power command failed.');
      this._statusTimer = setTimeout(() => {
        if (!this.destroyed) this.setPowerStatus('');
      }, 3000);
    }
    return true;
  },
  powerStatusChanged() {
    (this._section as Component | null)?.set('status', this.powerStatus);
  },
} satisfies CodeBehind);
