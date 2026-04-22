import { ContextScopePageModals } from '../contextScope/ContextScopePageModals';
import type { ContextScopePageModalsProps } from '../contextScope/ContextScopePageModals';

export type TeamContextPageModalsProps = Omit<ContextScopePageModalsProps, 'scope'> & {
  teamId: string;
};

export function TeamContextPageModals({ teamId, ...rest }: TeamContextPageModalsProps) {
  return <ContextScopePageModals scope={{ type: 'team', teamId }} {...rest} />;
}
