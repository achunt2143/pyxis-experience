import { mountDuyoApp } from '@pyxis/app-sdk/duyo';
import { islandPack } from './islands';
import './ContactsApp';

mountDuyoApp('Contacts.App', { packs: [islandPack()] });
