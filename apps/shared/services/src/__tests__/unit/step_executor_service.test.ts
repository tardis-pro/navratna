import { StepExecutorService } from '../../step_executor_service';
import { ExecutionStepSchema } from '@uaip/types';

describe('StepExecutorService', () => {
  let service: StepExecutorService;

  beforeEach(() => {
    service = new StepExecutorService();
  });

  describe('initialization', () => {
    it('should initialize with database service', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(StepExecutorService);
    });
  });

  /**
   * The approval gate previously simulated a decision with `Math.random() > 0.2`
   * — a coin flip authorising real-world actions. It must now FAIL CLOSED:
   * approved ONLY when an upstream approval decision (approved:true + a named
   * approver) was carried into the step input. See Sovereign Shell PRD — the
   * Membrane is never probabilistic.
   */
  describe('executeApprovalStep (fail-closed gate)', () => {
    const step = ExecutionStepSchema.parse({
      id: 'step-1',
      name: 'deploy approval',
      type: 'approval',
    });
    const signal = new AbortController().signal;

    it('rejects when no approval decision is present', async () => {
      const result = await service.executeApprovalStep(step, {}, signal);
      expect(result.approved).toBe(false);
      expect(result.approvalResult).toBe('rejected');
      expect(result.approvedBy).toBe('none');
    });

    it('rejects when approved is true but no approver is attributed', async () => {
      const result = await service.executeApprovalStep(step, { approved: true }, signal);
      expect(result.approved).toBe(false);
      expect(result.approvalResult).toBe('rejected');
    });

    it('rejects a truthy-but-not-true approved value (no type coercion)', async () => {
      const result = await service.executeApprovalStep(
        step,
        { approved: 'yes', approvedBy: 'user-1' },
        signal
      );
      expect(result.approved).toBe(false);
    });

    it('approves ONLY a real upstream decision with an attributed approver', async () => {
      const result = await service.executeApprovalStep(
        step,
        { approved: true, approvedBy: 'security-gateway:user-42' },
        signal
      );
      expect(result.approved).toBe(true);
      expect(result.approvalResult).toBe('approved');
      expect(result.approvedBy).toBe('security-gateway:user-42');
    });

    it('is deterministic — identical input always yields the identical decision', async () => {
      for (let i = 0; i < 25; i++) {
        // eslint-disable-next-line no-await-in-loop
        const result = await service.executeApprovalStep(step, {}, signal);
        expect(result.approved).toBe(false);
      }
    });
  });
});
