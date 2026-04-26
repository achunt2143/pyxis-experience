import React, { useRef, useState } from 'react';
import {
  Box,
  IconButton,
  InputBase,
  Stack,
  Typography,
  Paper,
} from '@mui/material';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home as HomeIcon,
  Search,
} from 'lucide-react';

export interface BrowserAppProps {
  windowId: string;
  onClose?: () => void;
}

const HOME = 'about:home';

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return HOME;
  if (trimmed === 'about:home') return HOME;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(trimmed)) return `https://${trimmed}`;
  // treat as search query
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

export const BrowserApp: React.FC<BrowserAppProps> = ({ windowId }) => {
  const [history, setHistory] = useState<string[]>([HOME]);
  const [cursor, setCursor] = useState(0);
  const [input, setInput] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const current = history[cursor];

  const navigate = (url: string) => {
    const normalized = normalizeUrl(url);
    const newHistory = [...history.slice(0, cursor + 1), normalized];
    setHistory(newHistory);
    setCursor(newHistory.length - 1);
    setInput(normalized === HOME ? '' : normalized);
  };

  const goBack = () => {
    if (cursor > 0) {
      const next = cursor - 1;
      setCursor(next);
      setInput(history[next] === HOME ? '' : history[next]);
    }
  };

  const goForward = () => {
    if (cursor < history.length - 1) {
      const next = cursor + 1;
      setCursor(next);
      setInput(history[next] === HOME ? '' : history[next]);
    }
  };

  const refresh = () => {
    if (iframeRef.current && current !== HOME) {
      iframeRef.current.src = current;
    }
  };

  const goHome = () => navigate(HOME);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(input);
  };

  return (
    <Box
      data-window-id={windowId}
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {/* Toolbar */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        sx={{
          p: 0.5,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <IconButton size="small" onClick={goBack} disabled={cursor === 0} title="Back">
          <ArrowLeft size={18} />
        </IconButton>
        <IconButton
          size="small"
          onClick={goForward}
          disabled={cursor >= history.length - 1}
          title="Forward"
        >
          <ArrowRight size={18} />
        </IconButton>
        <IconButton size="small" onClick={refresh} title="Refresh">
          <RotateCw size={18} />
        </IconButton>
        <IconButton size="small" onClick={goHome} title="Home">
          <HomeIcon size={18} />
        </IconButton>
        <Box
          component="form"
          onSubmit={onSubmit}
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            ml: 1,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.16)',
          }}
        >
          <Search size={14} style={{ opacity: 0.6, marginRight: 8 }} />
          <InputBase
            placeholder="Search or enter address"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            sx={{ flex: 1, fontSize: '0.875rem' }}
            inputProps={{ 'aria-label': 'address bar' }}
          />
        </Box>
      </Stack>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          borderRadius: 2,
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {current === HOME ? (
          <HomePage onSearch={(q) => navigate(q)} />
        ) : (
          <iframe
            ref={iframeRef}
            src={current}
            title="browser"
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
            referrerPolicy="no-referrer"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'white',
            }}
          />
        )}
      </Box>
    </Box>
  );
};

const HomePage: React.FC<{ onSearch: (q: string) => void }> = ({ onSearch }) => {
  const [q, setQ] = useState('');
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={3}
      sx={{
        height: '100%',
        background:
          'radial-gradient(circle at 30% 30%, rgba(120,119,198,0.25), transparent 60%), radial-gradient(circle at 70% 70%, rgba(33,150,243,0.2), transparent 60%)',
      }}
    >
      <Typography
        variant="h2"
        sx={{
          fontWeight: 800,
          letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #2196F3 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        GeckoOS
      </Typography>
      <Typography variant="body2" color="text.secondary">
        The Pyxis Browser
      </Typography>
      <Paper
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) onSearch(q);
        }}
        sx={{
          width: 'min(560px, 80%)',
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 0.5,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.16)',
        }}
        elevation={0}
      >
        <Search size={16} style={{ opacity: 0.6, marginRight: 8 }} />
        <InputBase
          placeholder="Search the web…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: 1, fontSize: '1rem', py: 1 }}
        />
      </Paper>
    </Stack>
  );
};

export default BrowserApp;
