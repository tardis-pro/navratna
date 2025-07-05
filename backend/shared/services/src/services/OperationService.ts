import { TypeOrmService } from '../typeormService.js';
import { OperationRepository, OperationStateRepository, OperationCheckpointRepository, StepResultRepository } from '../database/repositories/OperationRepository.js';
import { Operation } from '../entities/operation.entity.js';
import { OperationState } from '../entities/operationState.entity.js';
import { OperationCheckpoint } from '../entities/operationCheckpoint.entity.js';
import { StepResult } from '../entities/stepResult.entity.js';

export class OperationService {
  private static instance: OperationService;
  private typeormService: TypeOrmService;

  private _operationRepository: OperationRepository | null = null;
  private _operationStateRepository: OperationStateRepository | null = null;
  private _operationCheckpointRepository: OperationCheckpointRepository | null = null;
  private _stepResultRepository: StepResultRepository | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  public static getInstance(): OperationService {
    if (!OperationService.instance) {
      OperationService.instance = new OperationService();
    }
    return OperationService.instance;
  }

  public getOperationRepository(): OperationRepository {
    if (!this._operationRepository) {
      this._operationRepository = new OperationRepository(this.typeormService.dataSource, Operation);
    }
    return this._operationRepository;
  }

  public getOperationStateRepository(): OperationStateRepository {
    if (!this._operationStateRepository) {
      this._operationStateRepository = new OperationStateRepository(this.typeormService.dataSource, OperationState);
    }
    return this._operationStateRepository;
  }

  public getOperationCheckpointRepository(): OperationCheckpointRepository {
    if (!this._operationCheckpointRepository) {
      this._operationCheckpointRepository = new OperationCheckpointRepository(this.typeormService.dataSource, OperationCheckpoint);
    }
    return this._operationCheckpointRepository;
  }

  public getStepResultRepository(): StepResultRepository {
    if (!this._stepResultRepository) {
      this._stepResultRepository = new StepResultRepository(this.typeormService.dataSource, StepResult);
    }
    return this._stepResultRepository;
  }
}
