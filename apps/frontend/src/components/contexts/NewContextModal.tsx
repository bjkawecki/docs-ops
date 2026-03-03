import { Button, Group, Modal, Radio, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';

export type NewContextScope =
  | { type: 'company'; companyId: string }
  | { type: 'department'; departmentId: string }
  | { type: 'team'; teamId: string };

export interface NewContextModalProps {
  opened: boolean;
  onClose: () => void;
  scope: NewContextScope;
  onSuccess?: () => void;
}

const NAME_MAX_LENGTH = 255;

export function NewContextModal({ opened, onClose, scope, onSuccess }: NewContextModalProps) {
  const [selectedType, setSelectedType] = useState<'process' | 'project' | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setSelectedType(null);
    setName('');
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canSubmit =
    selectedType != null && name.trim().length > 0 && name.length <= NAME_MAX_LENGTH;

  const getBody = (): {
    name: string;
    companyId?: string;
    departmentId?: string;
    teamId?: string;
  } => {
    const trimmed = name.trim();
    if (scope.type === 'company') return { name: trimmed, companyId: scope.companyId };
    if (scope.type === 'department') return { name: trimmed, departmentId: scope.departmentId };
    return { name: trimmed, teamId: scope.teamId };
  };

  const handleSubmit = async () => {
    if (!canSubmit || selectedType == null) return;
    setLoading(true);
    const endpoint = selectedType === 'process' ? '/api/v1/processes' : '/api/v1/projects';
    const body = getBody();
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        notifications.show({
          title: 'Kontext angelegt',
          message:
            selectedType === 'process' ? 'Prozess wurde erstellt.' : 'Projekt wurde erstellt.',
          color: 'green',
        });
        onSuccess?.();
        handleClose();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Fehler',
          message: data?.error ?? res.statusText,
          color: 'red',
        });
      }
    } catch (e) {
      notifications.show({
        title: 'Fehler',
        message: e instanceof Error ? e.message : 'Netzwerkfehler',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Neuer Kontext" size="sm">
      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb="xs">
            Typ (Pflicht)
          </Text>
          <Radio.Group
            value={selectedType ?? ''}
            onChange={(v) => setSelectedType(v === 'process' || v === 'project' ? v : null)}
          >
            <Stack gap="xs">
              <Radio
                value="process"
                label="Prozess"
                description="Wiederkehrende Abläufe und Prozesse"
              />
              <Radio value="project" label="Projekt" description="Zeitlich begrenzte Vorhaben" />
            </Stack>
          </Radio.Group>
        </div>

        {selectedType != null && (
          <TextInput
            label="Name"
            placeholder="Name des Kontexts"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={NAME_MAX_LENGTH}
            required
          />
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!canSubmit}
            loading={loading}
            onClick={() => {
              void handleSubmit();
            }}
          >
            Erstellen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
