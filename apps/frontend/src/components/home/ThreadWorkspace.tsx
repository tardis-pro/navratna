import { useEffect } from 'react';
import { useParams } from 'react-router';
import { HomeWorkspace } from './HomeWorkspace';
import { useHomeShell } from './use_home_shell';

export function ThreadWorkspace() {
  const { threadId } = useParams();
  const { selectThreadById } = useHomeShell();

  useEffect(() => {
    if (threadId) {
      selectThreadById(threadId);
    }
  }, [selectThreadById, threadId]);

  return <HomeWorkspace />;
}
