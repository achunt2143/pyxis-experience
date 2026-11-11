import { mountDuyoApp } from '@pyxis/app-sdk/duyo';
import './TerminalApp';
import { terminalPack } from './pack';

// Terminal defaults to the dark theme — a light terminal is a war crime.
mountDuyoApp('Terminal.App', { defaultTheme: 'dark', packs: [terminalPack] });
