import React, { useMemo } from 'react';
import { Box, TextField, Typography, List, ListItemButton, ListItemIcon } from '@mui/material';
import { Search, Terminal, Folder, FileText, Globe, Settings, Chrome, Code, Music } from 'lucide-react';
import { Glass } from './Glass';

const ALL_APPS = [
  { id: 'browser', name: 'Browser', Icon: Globe },
  { id: 'chrome', name: 'Chrome', Icon: Chrome },
  { id: 'code', name: 'Code Editor', Icon: Code },
  { id: 'editor', name: 'Editor', Icon: FileText },
  { id: 'files', name: 'File Manager', Icon: Folder },
  { id: 'music', name: 'Music Player', Icon: Music },
  { id: 'settings', name: 'Settings', Icon: Settings },
  { id: 'terminal', name: 'Terminal', Icon: Terminal },
];

interface AppDrawerProps {
  onClose?: () => void;
  onAppSelect?: (appId: string) => void;
}

export const AppDrawer: React.FC<AppDrawerProps> = ({ onClose, onAppSelect }) => {
  const [search, setSearch] = React.useState('');

  const groupedApps = useMemo(() => {
    const filtered = ALL_APPS.filter(app =>
      app.name.toLowerCase().includes(search.toLowerCase())
    );

    const grouped: { [key: string]: typeof ALL_APPS } = {};
    filtered.forEach(app => {
      const firstLetter = app.name[0].toUpperCase();
      if (!grouped[firstLetter]) {
        grouped[firstLetter] = [];
      }
      grouped[firstLetter].push(app);
    });

    return Object.keys(grouped).sort().map(letter => ({
      letter,
      apps: grouped[letter],
    }));
  }, [search]);

  return (
    <Glass
      sx={{
        width: '500px',
        maxHeight: '600px',
        borderRadius: '24px',
        padding: '24px',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Search Bar */}
      <TextField
        autoFocus
        placeholder="Search apps..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        fullWidth
        sx={{
          marginBottom: '16px',
          '& .MuiOutlinedInput-root': {
            borderRadius: '12px',
            background: 'rgba(0, 0, 0, 0.05)',
          },
        }}
        InputProps={{
          startAdornment: <Search size={16} style={{ marginRight: 8 }} />,
        }}
      />

      {/* Apps List */}
      <Box sx={{ overflowY: 'auto', flex: 1 }}>
        {groupedApps.map(({ letter, apps }) => (
          <Box key={letter}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: 'rgba(0, 0, 0, 0.5)',
                textTransform: 'uppercase',
                display: 'block',
                marginTop: '12px',
                marginBottom: '8px',
                paddingLeft: '8px',
              }}
            >
              {letter}
            </Typography>
            <List disablePadding>
              {apps.map(app => {
                const Icon = app.Icon;
                return (
                  <ListItemButton
                    key={app.id}
                    sx={{
                      borderRadius: '8px',
                      marginBottom: '4px',
                      '&:hover': {
                        background: 'rgba(33, 150, 243, 0.1)',
                      },
                    }}
                    onClick={() => {
                      onAppSelect?.(app.id);
                      onClose?.();
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: '40px' }}>
                      <Icon size={18} />
                    </ListItemIcon>
                    <Typography variant="body2">{app.name}</Typography>
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>
    </Glass>
  );
};

export default AppDrawer;