import { mountDuyoApp } from '@pyxis/app-sdk/duyo';
import './TerminalApp';
import { terminalPack } from './pack';

// Follows pyxis.theme like every app; the screen's Mochi ANSI colours have both themes.
mountDuyoApp('Terminal.App', { packs: [terminalPack] });
