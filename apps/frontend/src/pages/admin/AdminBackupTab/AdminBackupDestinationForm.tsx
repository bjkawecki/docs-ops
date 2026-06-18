import { useEffect, useState, type SubmitEvent } from 'react';
import { Select, Stack, TextInput, Textarea } from '@mantine/core';
import type { Destination } from './adminBackupTypes';
import {
  destinationFormFromDestination,
  EMPTY_DESTINATION_FORM,
  type DestinationFormState,
} from './adminBackupDestinationForm';

export const BACKUP_DESTINATION_FORM_ID = 'backup-destination-form';

type Props = {
  destination: Destination | null;
  onSave: (form: DestinationFormState, destinationId: string | null) => void;
};

function addPlaceholder(isEdit: boolean, example: string): string | undefined {
  return isEdit ? undefined : example;
}

function secretPlaceholder(isEdit: boolean, example?: string): string | undefined {
  if (isEdit) return 'Leave blank to keep current';
  return example;
}

export function AdminBackupDestinationForm({ destination, onSave }: Props) {
  const [form, setForm] = useState<DestinationFormState>(EMPTY_DESTINATION_FORM);
  const isEdit = destination != null;

  useEffect(() => {
    setForm(destination ? destinationFormFromDestination(destination) : EMPTY_DESTINATION_FORM);
  }, [destination]);

  const set = <K extends keyof DestinationFormState>(key: K, value: DestinationFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(form, destination?.id ?? null);
  };

  return (
    <form id={BACKUP_DESTINATION_FORM_ID} onSubmit={handleSubmit}>
      <Stack gap="sm">
        <TextInput
          label="Name"
          required
          value={form.name}
          onChange={(e) => set('name', e.currentTarget.value)}
          placeholder={addPlaceholder(isEdit, 'e.g. Production offsite')}
        />
        <Select
          label="Type"
          value={form.type}
          disabled={isEdit}
          onChange={(v) => v && set('type', v as DestinationFormState['type'])}
          data={[
            { value: 'S3_COMPATIBLE', label: 'S3 compatible' },
            { value: 'SSH', label: 'SSH / SFTP' },
            { value: 'WEBDAV', label: 'WebDAV' },
          ]}
        />
        {form.type === 'S3_COMPATIBLE' ? (
          <>
            <TextInput
              label="Endpoint"
              value={form.s3Endpoint}
              onChange={(e) => set('s3Endpoint', e.currentTarget.value)}
              placeholder={addPlaceholder(isEdit, 'https://s3.eu-central-1.amazonaws.com')}
              description={isEdit ? undefined : 'HTTPS URL only (S3, MinIO, Wasabi, …)'}
            />
            <TextInput
              label="Bucket"
              value={form.s3Bucket}
              onChange={(e) => set('s3Bucket', e.currentTarget.value)}
              placeholder={addPlaceholder(isEdit, 'docsops-backups')}
            />
            <TextInput
              label="Region"
              value={form.s3Region}
              onChange={(e) => set('s3Region', e.currentTarget.value)}
              placeholder={addPlaceholder(isEdit, 'eu-central-1')}
              description={
                isEdit ? undefined : 'AWS signing region; inferred from endpoint if left empty'
              }
            />
            <TextInput
              label="Access key"
              value={form.s3AccessKey}
              onChange={(e) => set('s3AccessKey', e.currentTarget.value)}
              placeholder={secretPlaceholder(isEdit, 'AKIAIOSFODNN7EXAMPLE')}
            />
            <TextInput
              label="Secret key"
              type="password"
              value={form.s3SecretKey}
              onChange={(e) => set('s3SecretKey', e.currentTarget.value)}
              placeholder={secretPlaceholder(isEdit)}
            />
          </>
        ) : form.type === 'SSH' ? (
          <>
            <TextInput
              label="Host"
              value={form.sshHost}
              onChange={(e) => set('sshHost', e.currentTarget.value)}
              placeholder={addPlaceholder(isEdit, 'backup.example.com')}
            />
            <TextInput
              label="Port"
              value={form.sshPort}
              onChange={(e) => set('sshPort', e.currentTarget.value)}
              placeholder={addPlaceholder(isEdit, '22')}
              description={isEdit ? undefined : 'TCP port for SSH/SFTP (default 22)'}
            />
            <TextInput
              label="Remote path"
              value={form.sshPath}
              onChange={(e) => set('sshPath', e.currentTarget.value)}
              placeholder={addPlaceholder(isEdit, '/var/backups/docsops')}
              description={isEdit ? undefined : 'Absolute directory on the remote server'}
            />
            <TextInput
              label="Username"
              value={form.sshUser}
              onChange={(e) => set('sshUser', e.currentTarget.value)}
              placeholder={addPlaceholder(isEdit, 'backup')}
            />
            <TextInput
              label="Password"
              type="password"
              value={form.sshPassword}
              onChange={(e) => set('sshPassword', e.currentTarget.value)}
              placeholder={secretPlaceholder(isEdit)}
              description={isEdit ? undefined : 'Required if no private key is provided'}
            />
            <Textarea
              label="Private key (PEM)"
              value={form.sshPrivateKey}
              onChange={(e) => set('sshPrivateKey', e.currentTarget.value)}
              minRows={3}
              placeholder={secretPlaceholder(isEdit, '-----BEGIN OPENSSH PRIVATE KEY-----')}
              description={isEdit ? undefined : 'OpenSSH or PEM format; password or key required'}
            />
          </>
        ) : (
          <>
            <TextInput
              label="Base URL"
              value={form.webdavBaseUrl}
              onChange={(e) => set('webdavBaseUrl', e.currentTarget.value)}
              placeholder={addPlaceholder(
                isEdit,
                'https://cloud.example.com/remote.php/dav/files/user/backups/'
              )}
              description={isEdit ? undefined : 'HTTPS WebDAV folder URL (Nextcloud, ownCloud, …)'}
            />
            <TextInput
              label="Remote path"
              value={form.webdavRemotePath}
              onChange={(e) => set('webdavRemotePath', e.currentTarget.value)}
              placeholder={addPlaceholder(isEdit, 'docsops/prod')}
              description={isEdit ? undefined : 'Optional subfolder under the base URL'}
            />
            <TextInput
              label="Host header"
              value={form.webdavHostHeader}
              onChange={(e) => set('webdavHostHeader', e.currentTarget.value)}
              placeholder={addPlaceholder(isEdit, 'cloud.example.com')}
              description={
                isEdit
                  ? undefined
                  : 'Optional. Use when the request URL hostname differs from what the server expects (reverse proxy).'
              }
            />
            <TextInput
              label="Username"
              value={form.webdavUsername}
              onChange={(e) => set('webdavUsername', e.currentTarget.value)}
              placeholder={addPlaceholder(isEdit, 'backup')}
            />
            <TextInput
              label="Password"
              type="password"
              value={form.webdavPassword}
              onChange={(e) => set('webdavPassword', e.currentTarget.value)}
              placeholder={secretPlaceholder(isEdit)}
            />
          </>
        )}
      </Stack>
    </form>
  );
}
