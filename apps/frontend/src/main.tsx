import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ColorSchemeScript, localStorageColorSchemeManager, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { COLOR_SCHEME_STORAGE_KEY } from './constants';
import { appTheme, appCssVariablesResolver } from './theme';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles/links.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const colorSchemeManager = localStorageColorSchemeManager({
  key: COLOR_SCHEME_STORAGE_KEY,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorSchemeScript defaultColorScheme="light" localStorageKey={COLOR_SCHEME_STORAGE_KEY} />
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={appTheme}
        cssVariablesResolver={appCssVariablesResolver}
        colorSchemeManager={colorSchemeManager}
        defaultColorScheme="light"
      >
        <Notifications position="bottom-right" />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MantineProvider>
    </QueryClientProvider>
  </StrictMode>
);
