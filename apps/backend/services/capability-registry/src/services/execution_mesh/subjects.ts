// Execution Mesh — bus subject constants.
// Control plane <-> data plane messaging topics over the existing EventBus.
// Single source of truth now lives in @uaip/types so node-agents share it
// verbatim (spec §4). This file re-exports for existing local imports.

export {
  EXEC_NODE_REGISTER,
  EXEC_NODE_HEARTBEAT,
  execRequestSubject,
  execResultSubject,
  execStreamSubject,
} from '@uaip/types';
