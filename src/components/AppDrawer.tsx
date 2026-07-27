import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { Search } from 'lucide-react';
import { Input, MochiSlidingMenuItemGroup, MochiSlidingMenuItem } from 'remochi';
import { PYXIS_APPS } from '../apps/registry';

interface AppDrawerProps {
  onClose?: () => void;
  onAppSelect?: (appId: string) => void;
}

export const AppDrawer: React.FC<AppDrawerProps> = ({ onClose, onAppSelect }) => {
  const [search, setSearch] = React.useState('');

  const groupedApps = useMemo(() => {
    const filtered = PYXIS_APPS.filter((app) =>
      app.name.toLowerCase().includes(search.toLowerCase())
    );

    const grouped: { [key: string]: typeof filtered } = {};
    filtered.forEach((app) => {
      const firstLetter = app.name[0].toUpperCase();
      if (!grouped[firstLetter]) {
        grouped[firstLetter] = [];
      }
      grouped[firstLetter].push(app);
    });

    return Object.keys(grouped)
      .sort()
      .map((letter) => ({
        letter,
        apps: grouped[letter],
      }));
  }, [search]);

  return (
    <>
      {/* Search Bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5 }}>
        <Search size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
        <Input
          autoFocus
          placeholder="Search apps..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%' }}
        />
      </Box>

      {/* Apps, grouped alphabetically via remochi's sliding-menu groups */}
      {groupedApps.map(({ letter, apps }) => (
        <MochiSlidingMenuItemGroup key={letter} label={letter}>
          {apps.map((app) => {
            const Icon = app.icon;
            return (
              <MochiSlidingMenuItem
                key={app.id}
                icon={<Icon size={16} />}
                onClick={() => {
                  onAppSelect?.(app.id);
                  onClose?.();
                }}
              >
                {app.name}
              </MochiSlidingMenuItem>
            );
          })}
        </MochiSlidingMenuItemGroup>
      ))}
    </>
  );
};

export default AppDrawer;
