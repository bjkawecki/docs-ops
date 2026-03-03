import { useParams } from 'react-router-dom';
import { ContextDetailPage } from './ContextDetailPage';

export function ProjectContextPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return <ContextDetailPage type="project" id={projectId} />;
}
