import type { ReactNode } from 'react';
import { Group, Stack, Stepper } from '@mantine/core';

export type WizardStep = {
  label: string;
  description?: string;
  loading?: boolean;
};

type Props = {
  activeStep: number;
  steps: WizardStep[];
  children: ReactNode;
  footer?: ReactNode;
  completed?: ReactNode;
};

/** Vertical Mantine 8 stepper with content column (migration, system update, …). */
export function WizardStepperLayout({ activeStep, steps, children, footer, completed }: Props) {
  const allComplete = activeStep >= steps.length;

  return (
    <Stack gap="md">
      <Group align="flex-start" wrap="nowrap" gap="xl">
        <Stepper
          active={allComplete ? steps.length : activeStep}
          orientation="vertical"
          size="sm"
          allowNextStepsSelect={false}
          style={{ minWidth: 200 }}
        >
          {steps.map((step) => (
            <Stepper.Step
              key={step.label}
              label={step.label}
              description={step.description}
              loading={step.loading}
            />
          ))}
          {completed != null ? <Stepper.Completed>{completed}</Stepper.Completed> : null}
        </Stepper>
        <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
          {children}
        </Stack>
      </Group>
      {footer}
    </Stack>
  );
}
