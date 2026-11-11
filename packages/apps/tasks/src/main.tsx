import { mountDuyoApp } from '@pyxis/app-sdk/duyo';
import { islandPack } from './islands';
import './TasksApp';

mountDuyoApp('Tasks.App', { packs: [islandPack()] });
