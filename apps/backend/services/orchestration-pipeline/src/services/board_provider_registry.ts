import type { BoardConfig, BoardProvider } from '@uaip/types';
import { InternalBoardAdapter } from '../adapters/internal_board_adapter.js';

export class BoardProviderRegistry {
  resolveAdapter(config: BoardConfig): BoardProvider {
    if (config.type === 'internal') {
      return new InternalBoardAdapter();
    }

    throw new Error(`Board provider '${config.type}' not yet implemented`);
  }
}
