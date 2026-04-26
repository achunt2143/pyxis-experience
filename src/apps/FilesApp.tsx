import React, { useMemo, useState } from 'react';
import { Box, Breadcrumbs, Link, Typography } from '@mui/material';
import { Folder, FileText, Image as ImageIcon, Music, ChevronRight } from 'lucide-react';

export interface FilesAppProps {
  windowId: string;
  onClose?: () => void;
}

type EntryKind = 'folder' | 'file' | 'image' | 'audio';

interface Entry {
  name: string;
  kind: EntryKind;
}

interface Tree {
  [path: string]: Entry[];
}

// Mock filesystem tree keyed by absolute path
const FS: Tree = {
  '/Home': [
    { name: 'Documents', kind: 'folder' },
    { name: 'Downloads', kind: 'folder' },
    { name: 'Pictures', kind: 'folder' },
    { name: 'Music', kind: 'folder' },
    { name: 'README.md', kind: 'file' },
  ],
  '/Home/Documents': [
    { name: 'notes.txt', kind: 'file' },
    { name: 'project-spec.md', kind: 'file' },
    { name: 'budget.xlsx', kind: 'file' },
  ],
  '/Home/Downloads': [
    { name: 'geckos-alpha.iso', kind: 'file' },
    { name: 'pyxis-shell.tar.gz', kind: 'file' },
  ],
  '/Home/Pictures': [
    { name: 'wallpaper.jpg', kind: 'image' },
    { name: 'screenshot-001.png', kind: 'image' },
    { name: 'gecko-mascot.svg', kind: 'image' },
  ],
  '/Home/Music': [
    { name: 'gecko-theme.flac', kind: 'audio' },
    { name: 'shell-jingle.wav', kind: 'audio' },
  ],
};

const KIND_ICON: Record<EntryKind, React.FC<{ size?: number }>> = {
  folder: Folder,
  file: FileText,
  image: ImageIcon,
  audio: Music,
};

const KIND_COLOR: Record<EntryKind, string> = {
  folder: '#FFB74D',
  file: '#90CAF9',
  image: '#A5D6A7',
  audio: '#CE93D8',
};

export const FilesApp: React.FC<FilesAppProps> = ({ windowId }) => {
  const [path, setPath] = useState<string>('/Home');

  const entries = useMemo(() => FS[path] ?? [], [path]);

  const segments = useMemo(() => path.split('/').filter(Boolean), [path]);

  const navigate = (segIdx: number) => {
    const newPath = '/' + segments.slice(0, segIdx + 1).join('/');
    setPath(newPath);
  };

  const open = (entry: Entry) => {
    if (entry.kind === 'folder') {
      const next = `${path === '/' ? '' : path}/${entry.name}`;
      if (FS[next]) setPath(next);
    }
  };

  return (
    <Box
      data-window-id={windowId}
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      {/* Breadcrumb bar */}
      <Box
        sx={{
          p: 1,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <Breadcrumbs
          separator={<ChevronRight size={14} />}
          aria-label="path breadcrumb"
        >
          <Link
            component="button"
            underline="hover"
            color="inherit"
            onClick={() => setPath('/Home')}
            sx={{ fontSize: '0.875rem' }}
          >
            Computer
          </Link>
          {segments.map((seg, idx) => (
            <Link
              key={seg + idx}
              component="button"
              underline="hover"
              color={idx === segments.length - 1 ? 'primary' : 'inherit'}
              onClick={() => navigate(idx)}
              sx={{ fontSize: '0.875rem' }}
            >
              {seg}
            </Link>
          ))}
        </Breadcrumbs>
      </Box>

      {/* Grid of entries */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: 1.5,
          alignContent: 'start',
        }}
      >
        {entries.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            This folder is empty.
          </Typography>
        )}
        {entries.map((entry) => {
          const Icon = KIND_ICON[entry.kind];
          return (
            <Box
              key={entry.name}
              onDoubleClick={() => open(entry)}
              onClick={() => entry.kind === 'folder' && open(entry)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                p: 1.25,
                borderRadius: 2,
                cursor: entry.kind === 'folder' ? 'pointer' : 'default',
                userSelect: 'none',
                transition: 'background 0.15s ease, transform 0.15s ease',
                '&:hover': {
                  background: 'rgba(255,255,255,0.08)',
                  transform: 'scale(1.02)',
                },
              }}
              title={entry.name}
            >
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `${KIND_COLOR[entry.kind]}22`,
                  border: `1px solid ${KIND_COLOR[entry.kind]}55`,
                  color: KIND_COLOR[entry.kind],
                }}
              >
                <Icon size={28} />
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.78rem',
                  textAlign: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.name}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default FilesApp;
