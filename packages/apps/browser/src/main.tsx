import { mountDuyoApp } from '@pyxis/app-sdk/duyo';
import './BrowserApp';
import { browserPack } from './pack';

mountDuyoApp('Browser.App', { packs: [browserPack] });
