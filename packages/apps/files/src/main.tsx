import { mountDuyoApp } from '@pyxis/app-sdk/duyo';
import { islandPack } from './islands';
import './FilesApp';

mountDuyoApp('Files.App', { packs: [islandPack()] });
