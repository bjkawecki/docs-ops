import { useParams } from 'react-router-dom';
import { ContextDetailPage } from '../context/ContextDetailPage';

export function ProcessContextPage() {
  const { processId } = useParams<{ processId: string }>();
  if (!processId) return null;
  return <ContextDetailPage type="process" id={processId} />;
}
