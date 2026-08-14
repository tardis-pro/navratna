import { StepExecutorService } from '../../step_executor_service';
import { ApprovalPendingError, ExecutionStepSchema, OperationError } from '@uaip/types';

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
   *
   * "Not approved" now splits into two outcomes: PENDING (no decision at all —
   * ApprovalPendingError, suspend and wait) and REJECTED (an explicit
   * `approved: false` — OperationError/APPROVAL_REJECTED, terminal). Neither
   * ever continues execution.
   */
  describe('executeApprovalStep (fail-closed gate)', () => {
    const step = ExecutionStepSchema.parse({
      id: 'step-1',
      name: 'deploy approval',
      type: 'approval',
    });
    const signal = new AbortController().signal;

    it('suspends (never approves) when no approval decision is present', async () => {
      await expect(service.executeApprovalStep(step, {}, signal)).rejects.toBeInstanceOf(
        ApprovalPendingError
      );
    });

    it('suspends when approved is true but no approver is attributed', async () => {
      await expect(
        service.executeApprovalStep(step, { approved: true }, signal)
      ).rejects.toBeInstanceOf(ApprovalPendingError);
    });

    it('suspends on a truthy-but-not-true approved value (no type coercion)', async () => {
      await expect(
        service.executeApprovalStep(step, { approved: 'yes', approvedBy: 'user-1' }, signal)
      ).rejects.toBeInstanceOf(ApprovalPendingError);
    });

    it('rejects terminally on an explicit denial from a named approver', async () => {
      await expect(
        service.executeApprovalStep(step, { approved: false, approvedBy: 'user-9' }, signal)
      ).rejects.toMatchObject({ code: 'APPROVAL_REJECTED' });
    });

    /**
     * The approval event contract carries `approvedBy: null` on expiry. Demanding
     * an attributed principal to DENY would fail open there, so a denial never
     * requires attribution.
     */
    it('rejects terminally on an unattributed denial (workflow expiry)', async () => {
      const error = await service
        .executeApprovalStep(step, { approved: false, approvedBy: null }, signal)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OperationError);
      expect((error as OperationError).code).toBe('APPROVAL_REJECTED');
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

    it('is deterministic — identical input always yields the identical outcome', async () => {
      for (let i = 0; i < 25; i++) {
        // oxlint-disable-next-line no-await-in-loop -- determinism is checked sequentially
        await expect(service.executeApprovalStep(step, {}, signal)).rejects.toBeInstanceOf(
          ApprovalPendingError
        );
      }
    });
  });
});
