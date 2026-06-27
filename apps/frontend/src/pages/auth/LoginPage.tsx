import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, TextInput, PasswordInput, Button, Stack, Text, Paper, Alert } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { fetchMe, meQueryKey } from '../../hooks/useMe';
import { DocopsLogo } from '../../components/appShell/DocopsLogo';
import { AppVersionLabel } from '../../components/AppVersionLabel';
import { AppShellMaintenanceBanner } from '../../components/appShell/AppShellMaintenanceBanner';
import { useMaintenanceStatus } from '../../hooks/useMaintenanceStatus';
import {
  getLoginErrorDisplay,
  getLoginRedirectErrorDisplay,
  type LoginRedirectReason,
} from './loginErrors';
import { randomLoginTagline } from './loginTaglines';

const LOGIN_ERROR_ID = 'login-error';

type LoginLocationState = {
  from?: string;
  loginError?: LoginRedirectReason;
};

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginTagline] = useState(randomLoginTagline);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const errorAlertRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const locationState = (location.state ?? {}) as LoginLocationState;
  const from = locationState.from ?? '/';

  const login = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 401) throw new Error('Invalid credentials');
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      return fetchMe();
    },
    onSuccess: (me) => {
      queryClient.setQueryData(meQueryKey, me);
      void navigate(from, { replace: true });
    },
  });

  const redirectError = locationState.loginError
    ? getLoginRedirectErrorDisplay(locationState.loginError)
    : null;
  const loginError = login.isError ? getLoginErrorDisplay(login.error) : redirectError;
  const maintenanceQuery = useMaintenanceStatus();

  useEffect(() => {
    if (login.isError || redirectError) {
      const focusTarget = errorAlertRef.current ?? emailInputRef.current;
      focusTarget?.focus();
    }
  }, [login.isError, redirectError]);

  return (
    <Box
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
      }}
    >
      <AppShellMaintenanceBanner status={maintenanceQuery.data} />
      <Box
        component="main"
        style={{
          flex: 1,
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
            <Box
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}
            >
              <DocopsLogo width={56} height={56} />
              <Text size="xl" fw={700}>
                DocsOps
              </Text>
            </Box>
            <Text size="sm" c="dimmed" ta="center">
              {loginTagline}
            </Text>
          </Stack>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate();
            }}
            aria-describedby={loginError ? LOGIN_ERROR_ID : undefined}
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
              {loginError && (
                <Alert
                  ref={errorAlertRef}
                  id={LOGIN_ERROR_ID}
                  role="alert"
                  color="red"
                  variant="filled"
                  title={loginError.title}
                  tabIndex={-1}
                >
                  {loginError.message}
                  {loginError.hint ? (
                    <Text size="sm" c="dimmed" mt="xs">
                      {loginError.hint}
                    </Text>
                  ) : null}
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
      <Box
        component="footer"
        style={{
          position: 'absolute',
          bottom: 'var(--mantine-spacing-xs)',
          left: 'var(--mantine-spacing-md)',
        }}
      >
        <AppVersionLabel variant="brand" />
      </Box>
    </Box>
  );
}
