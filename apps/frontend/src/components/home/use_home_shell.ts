import { useOutletContext } from 'react-router';
import type { HomeShellContextValue } from './home_shell_types';

export function useHomeShell(): HomeShellContextValue {
  return useOutletContext<HomeShellContextValue>();
}
