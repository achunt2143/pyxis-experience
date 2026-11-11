import { mountDuyoApp } from '@pyxis/app-sdk/duyo';
import { islandPack } from './registerIsland';
import './SettingsApp';

mountDuyoApp('Settings.App', { packs: [islandPack()] });
