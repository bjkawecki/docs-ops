import { Skeleton, Stack } from '@mantine/core';

export function DocumentPagePendingView() {
  return (
    <Stack gap="md">
      <Skeleton height={32} width="60%" />
      <Skeleton height={16} width="40%" />
      <Skeleton height={120} />
      <Skeleton height={16} width="90%" />
      <Skeleton height={16} width="80%" />
    </Stack>
  );
}
