import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, TextInput, PasswordInput, Button, Stack, Text, Paper, Alert } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';
import { DocopsLogo } from '../../components/appShell/DocopsLogo';

const LOGIN_ERROR_ID = 'login-error';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const emailInputRef = useRef<HTMLInputElement>(null);
  const errorAlertRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? '/';

  const login = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 401) throw new Error('Invalid credentials');
      if (!res.ok) throw new Error('Login failed');
    },
    onSuccess: () => void navigate(from, { replace: true }),
    onError: (err) => {
      const raw = err instanceof Error ? err.message : String(err);
      const isNetwork =
        raw === 'Failed to fetch' ||
        raw.includes('NetworkError') ||
        raw.toLowerCase().includes('load failed');
      const message = isNetwork
        ? 'Cannot reach the server. With the Docker stack, open the app at http://localhost:5000 (Caddy proxies /api). Vite on the host only: start the backend separately (e.g. `make dev` on port 8080) or set `VITE_DEV_PROXY_API`.'
        : raw;
      notifications.show({ title: 'Login failed', message, color: 'red' });
    },
  });

  useEffect(() => {
    if (login.isError) {
      const focusTarget = errorAlertRef.current ?? emailInputRef.current;
      focusTarget?.focus();
    }
  }, [login.isError]);

  return (
    <Box
      component="main"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      bg="var(--mantine-color-default-hover)"
    >
      <Paper
        p="xl"
        maw={400}
        miw={320}
        radius="md"
        withBorder
        shadow="sm"
        style={{ flexShrink: 0 }}
      >
        <Stack gap="md" mb="lg">
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <DocopsLogo width={56} height={56} />
            <Text size="xl" fw={700}>
              DocsOps
            </Text>
          </Box>
          <Text size="sm" c="dimmed" ta="center">
            Internal documentation
          </Text>
        </Stack>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
          aria-describedby={login.isError ? LOGIN_ERROR_ID : undefined}
        >
          <Stack gap="md">
            <TextInput
              ref={emailInputRef}
              id="login-email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              disabled={login.isPending}
            />
            <PasswordInput
              id="login-password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={login.isPending}
            />
            {login.isError && (
              <Alert
                ref={errorAlertRef}
                id={LOGIN_ERROR_ID}
                role="alert"
                color="red"
                title="Login failed"
                tabIndex={-1}
              >
                {login.error?.message}
              </Alert>
            )}
            <Button type="submit" variant="filled" size="md" loading={login.isPending} fullWidth>
              Log in
            </Button>
          </Stack>
        </form>

        <Text size="xs" c="dimmed" ta="center" mt="lg">
          Forgot password? Contact your administrator. Need access? Contact IT.
        </Text>
      </Paper>
    </Box>
  );
}
