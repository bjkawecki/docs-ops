import type { ReactNode } from 'react';
import { WizardStepperLayout } from '../../../components/WizardStepperLayout.js';

type Step = {
  label: string;
  description?: string;
};

type Props = {
  activeStep: number;
  steps: Step[];
  children: ReactNode;
  footer: ReactNode;
};

export function MigrationWizardLayout({ activeStep, steps, children, footer }: Props) {
  return (
    <WizardStepperLayout activeStep={activeStep} steps={steps} footer={footer}>
      {children}
    </WizardStepperLayout>
  );
}
