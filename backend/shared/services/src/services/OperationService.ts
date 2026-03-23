import {
  OperationRepository,
  OperationStateRepository,
  OperationCheckpointRepository,
  StepResultRepository,
} from '../database/repositories/OperationRepository';
// Entity types used by repositories: Operation, OperationState, OperationCheckpoint, StepResult

export class OperationService {
  private static instance: OperationService;

  private _operationRepository: OperationRepository | null = null;
  private _operationStateRepository: OperationStateRepository | null = null;
  private _operationCheckpointRepository: OperationCheckpointRepository | null = null;
  private _stepResultRepository: StepResultRepository | null = null;

  private constructor() {}

  public static getInstance(): OperationService {
    if (!OperationService.instance) {
      OperationService.instance = new OperationService();
    }
    return OperationService.instance;
  }

  public getOperationRepository(): OperationRepository {
    if (!this._operationRepository) {
      this._operationRepository = new OperationRepository();
    }
    return this._operationRepository;
  }

  public getOperationStateRepository(): OperationStateRepository {
    if (!this._operationStateRepository) {
      this._operationStateRepository = new OperationStateRepository();
    }
    return this._operationStateRepository;
  }

  public getOperationCheckpointRepository(): OperationCheckpointRepository {
    if (!this._operationCheckpointRepository) {
      this._operationCheckpointRepository = new OperationCheckpointRepository();
    }
    return this._operationCheckpointRepository;
  }

  public getStepResultRepository(): StepResultRepository {
    if (!this._stepResultRepository) {
      this._stepResultRepository = new StepResultRepository();
    }
    return this._stepResultRepository;
  }
}
