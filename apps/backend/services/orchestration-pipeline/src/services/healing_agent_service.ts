import { randomUUID } from 'node:crypto'
import { EventBusService } from '@uaip/shared-services'
import type {
  CIFailureClassification,
  CIFailureType,
  HealingAction,
  HealingDiagnosis,
  HealingFix,
} from '@uaip/types'
import { logger, InternalServerError } from '@uaip/utils'

const HEALING_DIAGNOSIS_EVENT = 'rdlo.healing.diagnosis'
const HEALING_FIX_APPLIED_EVENT = 'rdlo.healing.fix.applied'
const HEALING_ESCALATION_EVENT = 'rdlo.healing.escalation'

const AUTO_APPLY_THRESHOLD = 70
const REVIEW_THRESHOLD = 40

const TEST_FAILURE_PATTERNS = [
  /FAIL\s+[\w/.]+\.test\./i,
  /expect\(.+\)\.(toBe|toEqual|toMatch|toContain)/i,
  /AssertionError/i,
  /✕|✗|FAILED/,
  /vitest|jest.*failed/i,
]

const LINT_PATTERNS = [
  /error\s+@?[\w/-]+/i,
  /TS\d{4}:/,
  /oxlint|eslint/i,
  /Type '.*' is not assignable to type/i,
  /Property '.*' does not exist on type/i,
]

const BUILD_PATTERNS = [
  /Build failed/i,
  /Module not found/i,
  /Cannot find module/i,
  /esbuild.*error/i,
  /tsc.*error/i,
  /compilation failed/i,
]

const RUNTIME_PATTERNS = [
  /ECONNREFUSED/i,
  /SIGTERM|SIGKILL/i,
  /heap out of memory/i,
  /unhandled.*rejection/i,
  /segmentation fault/i,
]

export class HealingAgentService {
  constructor(private readonly eventBusService: EventBusService) {}

  async diagnose(prUrl: string, ciOutput: string): Promise<HealingDiagnosis> {
    const classification = this.classifyFailure(ciOutput)
    const confidence = this.computeConfidence(classification, ciOutput)
    const action = this.routeByConfidence(confidence)
    const fixes = this.generateFixes(classification, ciOutput)
    const hypotheses = this.generateHypotheses(classification, ciOutput)

    const diagnosis: HealingDiagnosis = {
      id: randomUUID(),
      prUrl,
      classification,
      confidence,
      action,
      fixes,
      hypotheses,
      attemptedStrategies: [],
      createdAt: new Date().toISOString(),
    }

    await this.publishDiagnosisEvent(diagnosis)

    if (action === 'escalate') {
      await this.escalate(diagnosis)
    }

    logger.info('HealingAgent diagnosis complete', {
      diagnosisId: diagnosis.id,
      prUrl,
      failureType: classification.type,
      confidence,
      action,
      fixCount: fixes.length,
    })

    return diagnosis
  }

  /**
   * NOT IMPLEMENTED.
   *
   * This used to push a strategy label onto the diagnosis, publish
   * `rdlo.healing.fix.applied`, log "HealingAgent fixes applied", and return
   * `true` — without writing a single file, touching a repository, or opening
   * anything. Every consumer of that event, and every caller reading the boolean,
   * was told a fix had landed when nothing had changed on disk.
   *
   * diagnose() above is real: it classifies CI failures and proposes fixes. The
   * missing half is applying them, which needs a source-control write path
   * (checkout, patch, commit, push) that does not exist here.
   */
  async applyFixes(diagnosis: HealingDiagnosis): Promise<boolean> {
    throw new InternalServerError(
      `HealingAgentService.applyFixes is not implemented (diagnosis ${diagnosis.id}, ` +
        `${diagnosis.fixes.length} proposed fix(es)). It previously published ` +
        `${HEALING_FIX_APPLIED_EVENT} and returned true while writing no files. ` +
        `The diagnosis itself is real — read diagnosis.fixes and apply them through a ` +
        `source-control path that actually commits.`
    )
  }

  private classifyFailure(ciOutput: string): CIFailureClassification {
    const type = this.detectFailureType(ciOutput)
    const summary = this.extractSummary(ciOutput, type)
    const affectedFiles = this.extractAffectedFiles(ciOutput)

    return {
      type,
      summary,
      affectedFiles,
      rawOutput: ciOutput.slice(0, 5000),
    }
  }

  private detectFailureType(ciOutput: string): CIFailureType {
    if (TEST_FAILURE_PATTERNS.some((p) => p.test(ciOutput))) return 'test'
    if (LINT_PATTERNS.some((p) => p.test(ciOutput))) return 'lint'
    if (BUILD_PATTERNS.some((p) => p.test(ciOutput))) return 'build'
    if (RUNTIME_PATTERNS.some((p) => p.test(ciOutput))) return 'runtime'
    return 'unknown'
  }

  private extractSummary(ciOutput: string, type: CIFailureType): string {
    const lines = ciOutput.split('\n')
    const errorLines = lines.filter(
      (l) => /error|fail|✕|✗/i.test(l) && l.trim().length > 5
    )
    const summaryLines = errorLines.slice(0, 5).map((l) => l.trim())

    if (summaryLines.length === 0) {
      return `CI failure of type ${type} — no specific error lines extracted`
    }

    return summaryLines.join('; ')
  }

  private extractAffectedFiles(ciOutput: string): string[] {
    const filePattern = /(?:[\w./-]+\/)+[\w.-]+\.\w{1,4}/g
    const matches = ciOutput.match(filePattern) ?? []
    const sourceFiles = matches.filter(
      (f) =>
        !f.includes('node_modules') &&
        !f.startsWith('http') &&
        /\.(ts|tsx|js|jsx|json|css|scss)$/.test(f)
    )
    return [...new Set(sourceFiles)].slice(0, 20)
  }

  private computeConfidence(
    classification: CIFailureClassification,
    ciOutput: string
  ): number {
    let confidence = 50

    switch (classification.type) {
      case 'test':
        confidence = 65
        if (ciOutput.includes('expect(') && classification.affectedFiles.length <= 3) {
          confidence = 80
        }
        break
      case 'lint':
        confidence = 75
        if (/TS\d{4}:/.test(ciOutput)) {
          confidence = 85
        }
        break
      case 'build':
        confidence = 55
        if (ciOutput.includes('Module not found')) {
          confidence = 70
        }
        break
      case 'runtime':
        confidence = 30
        break
      case 'unknown':
        confidence = 15
        break
    }

    if (classification.affectedFiles.length > 10) {
      confidence = Math.max(10, confidence - 20)
    }

    return Math.min(100, Math.max(0, confidence))
  }

  private routeByConfidence(confidence: number): HealingAction {
    if (confidence >= AUTO_APPLY_THRESHOLD) return 'auto-apply'
    if (confidence >= REVIEW_THRESHOLD) return 'review'
    return 'escalate'
  }

  private generateFixes(
    classification: CIFailureClassification,
    ciOutput: string
  ): HealingFix[] {
    const fixes: HealingFix[] = []

    for (const file of classification.affectedFiles.slice(0, 5)) {
      const description = this.suggestFix(classification.type, ciOutput, file)
      if (description) {
        fixes.push({
          file,
          diff: '',
          description,
        })
      }
    }

    return fixes
  }

  private suggestFix(type: CIFailureType, ciOutput: string, file: string): string | null {
    switch (type) {
      case 'test': {
        const expectMatch = ciOutput.match(/expect\((.+?)\)\.(toBe|toEqual)\((.+?)\)/s)
        if (expectMatch) {
          return `Update test assertion in ${file}: expected value may have changed`
        }
        return `Review test expectations in ${file}`
      }
      case 'lint': {
        const tsMatch = ciOutput.match(/(TS\d{4}):(.+)/m)
        if (tsMatch) {
          return `Fix TypeScript error ${tsMatch[1]} in ${file}: ${tsMatch[2].trim()}`
        }
        return `Fix lint/type error in ${file}`
      }
      case 'build':
        if (ciOutput.includes('Module not found')) {
          return `Fix missing module import in ${file}`
        }
        return `Fix build error in ${file}`
      case 'runtime':
        return null
      default:
        return null
    }
  }

  private generateHypotheses(
    classification: CIFailureClassification,
    _ciOutput: string
  ): string[] {
    const hypotheses: string[] = []

    switch (classification.type) {
      case 'test':
        hypotheses.push('Test assertions may be outdated after code changes')
        hypotheses.push('Mock data may not match updated interfaces')
        break
      case 'lint':
        hypotheses.push('Type signature mismatch after interface update')
        hypotheses.push('Missing import or unused variable introduced')
        break
      case 'build':
        hypotheses.push('Missing dependency or incorrect import path')
        hypotheses.push('Circular dependency introduced')
        break
      case 'runtime':
        hypotheses.push('Service dependency unavailable in CI environment')
        hypotheses.push('Environment variable missing or misconfigured')
        hypotheses.push('Memory limit exceeded during test suite')
        break
      default:
        hypotheses.push('Unrecognized failure pattern — manual investigation needed')
        break
    }

    return hypotheses
  }

  private async publishDiagnosisEvent(diagnosis: HealingDiagnosis): Promise<void> {
    await this.eventBusService.publish(HEALING_DIAGNOSIS_EVENT, {
      diagnosisId: diagnosis.id,
      prUrl: diagnosis.prUrl,
      failureType: diagnosis.classification.type,
      confidence: diagnosis.confidence,
      action: diagnosis.action,
      fixCount: diagnosis.fixes.length,
    })
  }

  private async escalate(diagnosis: HealingDiagnosis): Promise<void> {
    await this.eventBusService.publish(HEALING_ESCALATION_EVENT, {
      diagnosisId: diagnosis.id,
      prUrl: diagnosis.prUrl,
      classification: diagnosis.classification.type,
      summary: diagnosis.classification.summary,
      confidence: diagnosis.confidence,
      hypotheses: diagnosis.hypotheses,
      affectedFiles: diagnosis.classification.affectedFiles,
    })

    logger.warn('HealingAgent escalated — confidence below threshold', {
      diagnosisId: diagnosis.id,
      confidence: diagnosis.confidence,
    })
  }
}
