import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './theme/theme';
import Desktop from './components/Desktop';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Desktop />
    </ThemeProvider>
  );
}

export default App;