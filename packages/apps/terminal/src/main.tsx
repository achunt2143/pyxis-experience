import { mountStandaloneApp } from '@pyxis/app-sdk';
import TerminalApp from './TerminalApp';

// Terminal defaults to the dark theme — a light terminal is a war crime.
mountStandaloneApp(TerminalApp, { defaultTheme: 'dark' });
