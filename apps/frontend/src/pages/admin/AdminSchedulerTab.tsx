import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Radio,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';

type SchedulesResponse = {
  availableJobNames: string[];
  items: Array<{
    jobName: string;
    key: string;
    cron: string;
    tz: string | null;
  }>;
};

type CronMode = 'text' | 'form';
type CronPreset = 'everyMinutes' | 'hourly' | 'daily' | 'weekly' | 'monthly';
type CronFormState = {
  preset: CronPreset;
  intervalMinutes: string;
  minute: string;
  hour: string;
  weekday: string;
  dayOfMonth: string;
};

const DEFAULT_CRON_FORM: CronFormState = {
  preset: 'everyMinutes',
  intervalMinutes: '5',
  minute: '0',
  hour: '0',
  weekday: '1',
  dayOfMonth: '1',
};

const INTERVAL_OPTIONS = ['1', '2', '5', '10', '15', '30', '45', '59'];
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, idx) => String(idx));
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, idx) => String(idx));
const WEEKDAY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: 'Montag' },
  { value: '2', label: 'Dienstag' },
  { value: '3', label: 'Mittwoch' },
  { value: '4', label: 'Donnerstag' },
  { value: '5', label: 'Freitag' },
  { value: '6', label: 'Samstag' },
  { value: '0', label: 'Sonntag' },
];
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, idx) => String(idx + 1));
const PRESET_FIELD_WIDTH = 180;
const SMALL_FIELD_WIDTH = 64;
const WEEKDAY_FIELD_WIDTH = 120;

function toSelectOptions(values: string[]): Array<{ value: string; label: string }> {
  return values.map((value) => ({ value, label: value }));
}

function toIntInRange(value: string, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

function buildCronFromForm(form: CronFormState): string | null {
  const minute = toIntInRange(form.minute, 0, 59);
  const hour = toIntInRange(form.hour, 0, 23);
  const dayOfMonth = toIntInRange(form.dayOfMonth, 1, 31);
  const weekday = toIntInRange(form.weekday, 0, 6);

  switch (form.preset) {
    case 'everyMinutes': {
      const interval = toIntInRange(form.intervalMinutes, 1, 59);
      return interval ? `*/${interval} * * * *` : null;
    }
    case 'hourly':
      return minute != null ? `${minute} * * * *` : null;
    case 'daily':
      return minute != null && hour != null ? `${minute} ${hour} * * *` : null;
    case 'weekly':
      return minute != null && hour != null && weekday != null
        ? `${minute} ${hour} * * ${weekday}`
        : null;
    case 'monthly':
      return minute != null && hour != null && dayOfMonth != null
        ? `${minute} ${hour} ${dayOfMonth} * *`
        : null;
    default:
      return null;
  }
}

function parseCronToForm(cron: string): CronFormState | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, weekday] = parts;

  const everyMinutesMatch = /^\*\/(\d+)$/.exec(minute);
  if (everyMinutesMatch && hour === '*' && dayOfMonth === '*' && month === '*' && weekday === '*') {
    return {
      ...DEFAULT_CRON_FORM,
      preset: 'everyMinutes',
      intervalMinutes: everyMinutesMatch[1],
    };
  }
  if (
    /^\d+$/.test(minute) &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    weekday === '*'
  ) {
    return {
      ...DEFAULT_CRON_FORM,
      preset: 'hourly',
      minute,
    };
  }
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === '*' &&
    month === '*' &&
    weekday === '*'
  ) {
    return {
      ...DEFAULT_CRON_FORM,
      preset: 'daily',
      minute,
      hour,
    };
  }
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === '*' &&
    month === '*' &&
    /^\d+$/.test(weekday)
  ) {
    return {
      ...DEFAULT_CRON_FORM,
      preset: 'weekly',
      minute,
      hour,
      weekday,
    };
  }
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    /^\d+$/.test(dayOfMonth) &&
    month === '*' &&
    weekday === '*'
  ) {
    return {
      ...DEFAULT_CRON_FORM,
      preset: 'monthly',
      minute,
      hour,
      dayOfMonth,
    };
  }
  return null;
}

export function AdminSchedulerTab() {
  const queryClient = useQueryClient();
  const [cronInputs, setCronInputs] = useState<Record<string, string>>({});
  const [cronMode, setCronMode] = useState<CronMode>('text');
  const [cronFormInputs, setCronFormInputs] = useState<Record<string, CronFormState>>({});

  const schedules = useQuery({
    queryKey: ['admin', 'jobs', 'schedules'],
    queryFn: async (): Promise<SchedulesResponse> => {
      const res = await apiFetch('/api/v1/admin/jobs/schedules');
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load schedules');
      }
      return (await res.json()) as SchedulesResponse;
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (payload: { jobName: string; enabled: boolean; cron?: string }) => {
      const res = await apiFetch(`/api/v1/admin/jobs/schedules/${payload.jobName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Schedule update failed');
      }
    },
    onSuccess: () => {
      notifications.show({
        title: 'Schedule updated',
        message: 'Scheduler configuration was saved.',
        color: 'green',
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'jobs', 'schedules'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'jobs', 'health'] });
    },
    onError: (error: Error) => {
      notifications.show({ title: 'Error', message: error.message, color: 'red' });
    },
  });

  const scheduleByJobName = useMemo(() => {
    const map = new Map<string, { cron: string; key: string; tz: string | null }>();
    for (const item of schedules.data?.items ?? []) {
      if (!map.has(item.jobName)) {
        map.set(item.jobName, { cron: item.cron, key: item.key, tz: item.tz });
      }
    }
    return map;
  }, [schedules.data?.items]);

  const getOrCreateFormInput = (jobName: string, fallbackCron: string): CronFormState => {
    const existing = cronFormInputs[jobName];
    if (existing) return existing;
    const parsed = parseCronToForm(fallbackCron);
    return parsed ?? DEFAULT_CRON_FORM;
  };

  const resolveCronForJob = (jobName: string, fallbackCron: string): string | null => {
    if (cronMode === 'text') {
      const textCron = cronInputs[jobName] ?? fallbackCron;
      return textCron.trim() || null;
    }
    return buildCronFromForm(getOrCreateFormInput(jobName, fallbackCron));
  };

  if (schedules.isPending) return <Loader size="sm" />;
  if (schedules.isError) {
    return (
      <Alert color="red" title="Failed to load scheduler">
        {schedules.error instanceof Error ? schedules.error.message : 'Unknown error'}
      </Alert>
    );
  }

  return (
    <Box>
      <Radio.Group
        value={cronMode}
        onChange={(value) => setCronMode(value as CronMode)}
        label="Cron mode"
        mb="md"
      >
        <Group gap="md">
          <Radio value="text" label="Text" />
          <Radio value="form" label="Form" />
        </Group>
      </Radio.Group>

      <Table
        withTableBorder
        withColumnBorders
        className="admin-table-hover"
        style={{ tableLayout: 'fixed' }}
      >
        <colgroup>
          <col style={{ width: '21%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '49%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Job type</Table.Th>
            <Table.Th>Enabled</Table.Th>
            <Table.Th>Cron</Table.Th>
            <Table.Th>Timezone</Table.Th>
            <Table.Th>Action</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(schedules.data?.availableJobNames ?? []).map((name) => {
            const existing = scheduleByJobName.get(name);
            const cronValue = cronInputs[name] ?? existing?.cron ?? '';
            const formValue = getOrCreateFormInput(name, cronValue);
            const resolvedCron = resolveCronForJob(name, cronValue);
            return (
              <Table.Tr key={name}>
                <Table.Td>
                  <Text size="sm">{name}</Text>
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={Boolean(existing)}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked;
                      if (!enabled) {
                        scheduleMutation.mutate({ jobName: name, enabled: false });
                        return;
                      }
                      if (!resolvedCron) {
                        notifications.show({
                          title: 'Cron required',
                          message: 'Please enter a valid cron expression first.',
                          color: 'yellow',
                        });
                        return;
                      }
                      scheduleMutation.mutate({
                        jobName: name,
                        enabled: true,
                        cron: resolvedCron,
                      });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <Stack gap={6}>
                    {cronMode === 'text' ? (
                      <TextInput
                        value={cronValue}
                        onChange={(event) =>
                          setCronInputs((prev) => ({ ...prev, [name]: event.currentTarget.value }))
                        }
                        placeholder="*/5 * * * *"
                      />
                    ) : (
                      <Box style={{ overflowX: 'auto' }}>
                        <Group gap={6} wrap="nowrap" align="flex-end">
                          <Select
                            size="xs"
                            label="Preset"
                            value={formValue.preset}
                            data={[
                              { value: 'everyMinutes', label: 'Every X minutes' },
                              { value: 'hourly', label: 'Hourly' },
                              { value: 'daily', label: 'Daily' },
                              { value: 'weekly', label: 'Weekly' },
                              { value: 'monthly', label: 'Monthly' },
                            ]}
                            onChange={(value) => {
                              if (!value) return;
                              setCronFormInputs((prev) => ({
                                ...prev,
                                [name]: { ...formValue, preset: value as CronPreset },
                              }));
                            }}
                            style={{
                              width: PRESET_FIELD_WIDTH,
                              minWidth: PRESET_FIELD_WIDTH,
                              maxWidth: PRESET_FIELD_WIDTH,
                            }}
                          />
                          <Select
                            size="xs"
                            label="Interval"
                            value={formValue.intervalMinutes}
                            data={toSelectOptions(INTERVAL_OPTIONS)}
                            onChange={(value) => {
                              if (!value) return;
                              setCronFormInputs((prev) => ({
                                ...prev,
                                [name]: { ...formValue, intervalMinutes: value },
                              }));
                            }}
                            disabled={formValue.preset !== 'everyMinutes'}
                            style={{
                              width: SMALL_FIELD_WIDTH,
                              minWidth: SMALL_FIELD_WIDTH,
                              maxWidth: SMALL_FIELD_WIDTH,
                            }}
                          />
                          <Select
                            size="xs"
                            label="Minute"
                            value={formValue.minute}
                            data={toSelectOptions(MINUTE_OPTIONS)}
                            onChange={(value) => {
                              if (!value) return;
                              setCronFormInputs((prev) => ({
                                ...prev,
                                [name]: { ...formValue, minute: value },
                              }));
                            }}
                            disabled={formValue.preset === 'everyMinutes'}
                            style={{
                              width: SMALL_FIELD_WIDTH,
                              minWidth: SMALL_FIELD_WIDTH,
                              maxWidth: SMALL_FIELD_WIDTH,
                            }}
                          />
                          <Select
                            size="xs"
                            label="Hour"
                            value={formValue.hour}
                            data={toSelectOptions(HOUR_OPTIONS)}
                            onChange={(value) => {
                              if (!value) return;
                              setCronFormInputs((prev) => ({
                                ...prev,
                                [name]: { ...formValue, hour: value },
                              }));
                            }}
                            disabled={!['daily', 'weekly', 'monthly'].includes(formValue.preset)}
                            style={{
                              width: SMALL_FIELD_WIDTH,
                              minWidth: SMALL_FIELD_WIDTH,
                              maxWidth: SMALL_FIELD_WIDTH,
                            }}
                          />
                          <Select
                            size="xs"
                            label="Weekday"
                            value={formValue.weekday}
                            data={WEEKDAY_OPTIONS}
                            onChange={(value) => {
                              if (!value) return;
                              setCronFormInputs((prev) => ({
                                ...prev,
                                [name]: { ...formValue, weekday: value },
                              }));
                            }}
                            disabled={formValue.preset !== 'weekly'}
                            style={{
                              width: WEEKDAY_FIELD_WIDTH,
                              minWidth: WEEKDAY_FIELD_WIDTH,
                              maxWidth: WEEKDAY_FIELD_WIDTH,
                            }}
                          />
                          <Select
                            size="xs"
                            label="Day"
                            value={formValue.dayOfMonth}
                            data={toSelectOptions(DAY_OF_MONTH_OPTIONS)}
                            onChange={(value) => {
                              if (!value) return;
                              setCronFormInputs((prev) => ({
                                ...prev,
                                [name]: { ...formValue, dayOfMonth: value },
                              }));
                            }}
                            disabled={formValue.preset !== 'monthly'}
                            style={{
                              width: SMALL_FIELD_WIDTH,
                              minWidth: SMALL_FIELD_WIDTH,
                              maxWidth: SMALL_FIELD_WIDTH,
                            }}
                          />
                          <Text
                            size="xs"
                            c="dimmed"
                            style={{
                              whiteSpace: 'nowrap',
                              paddingBottom: 4,
                              marginLeft: 'auto',
                              textAlign: 'right',
                            }}
                          >
                            Cron preview: {resolvedCron ?? 'invalid'}
                          </Text>
                        </Group>
                      </Box>
                    )}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  {existing?.tz ? (
                    <Badge variant="light">{existing.tz}</Badge>
                  ) : (
                    <Text size="sm" c="dimmed">
                      UTC
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => {
                      if (!resolvedCron) {
                        notifications.show({
                          title: 'Cron required',
                          message: 'Please provide a valid cron value first.',
                          color: 'yellow',
                        });
                        return;
                      }
                      scheduleMutation.mutate({
                        jobName: name,
                        enabled: true,
                        cron: resolvedCron,
                      });
                    }}
                    disabled={!resolvedCron || scheduleMutation.isPending}
                  >
                    Save
                  </Button>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Box>
  );
}
