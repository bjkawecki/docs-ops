import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TextInput, PasswordInput, Button, Stack, Text, Paper, Title } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? '/';

  const login = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 401) throw new Error('Ungültige Anmeldedaten');
      if (!res.ok) throw new Error('Login fehlgeschlagen');
    },
    onSuccess: () => navigate(from, { replace: true }),
  });

  return (
    <Paper p="xl" maw={400} mx="auto" mt="xl" radius="md" withBorder>
      <Title order={3} mb="md">
        Anmelden
      </Title>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <Stack gap="md">
          <TextInput
            label="E-Mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <PasswordInput
            label="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {login.isError && (
            <Text c="red" size="sm">
              {login.error?.message}
            </Text>
          )}
          <Button type="submit" loading={login.isPending}>
            Anmelden
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
