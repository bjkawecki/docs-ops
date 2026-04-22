import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Stack, Title, Text, Button } from '@mantine/core';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Stack gap="md" p="md">
          <Title order={2}>Something went wrong</Title>
          <Text size="sm" c="dimmed">
            An unexpected error occurred. Please try reloading the page.
          </Text>
          <Button variant="light" size="sm" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </Stack>
      );
    }
    return this.props.children;
  }
}
