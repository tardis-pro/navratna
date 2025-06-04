// PRD Generator - Generates Product Requirements Documents
// Epic 4 Implementation

import { 
  ArtifactConversationContext
} from '@uaip/types';

import { ArtifactGenerator } from 'interfaces';
import { logger } from '@uaip/utils';

export class PRDGenerator implements ArtifactGenerator {
  private readonly supportedType = 'prd';
  
  /**
   * Check if this generator can handle the given context
   */
  canHandle(context: ArtifactConversationContext): boolean {
    const messages = context.messages;
    const recentMessages = messages.slice(-5);

    // Look for PRD-related keywords
    const prdKeywords = [
      'requirements', 'specification', 'prd', 'product requirements', 'document', 'spec'
    ];

    const hasPRDContext = recentMessages.some(message => 
      prdKeywords.some(keyword => 
        message.content.toLowerCase().includes(keyword)
      )
    );

    // Check for explicit PRD requests
    const prdRequestPatterns = [
      /create.*prd/i,
      /write.*requirements/i,
      /document.*requirements/i,
      /specification/i,
      /requirements.*document/i
    ];

    const hasPRDRequest = recentMessages.some(message =>
      prdRequestPatterns.some(pattern => pattern.test(message.content))
    );

    return hasPRDContext || hasPRDRequest;
  }

  /**
   * Generate PRD artifact from conversation context
   */
  async generate(context: ArtifactConversationContext): Promise<string> {
    logger.info('Generating PRD artifact', {
      conversationId: context.conversationId,
      messageCount: context.messages.length
    });

    try {
      // Extract requirements and decisions from conversation
      const requirements = this.extractRequirements(context.messages);
      const decisions = this.extractDecisions(context.messages);
      const objectives = this.extractObjectives(context.messages);
      const projectName = this.extractProjectName(context.messages) || 'New Project';
      
      // Generate PRD document
      return this.generatePRDDocument(projectName, objectives, requirements, decisions);

    } catch (error) {
      logger.error('PRD generation failed:', error);
      throw new Error(`PRD generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get supported artifact type
   */
  getSupportedType(): string {
    return this.supportedType;
  }

  /**
   * Get supported artifact types
   */
  getSupportedTypes(): string[] {
    return ['prd'];
  }

  // Private helper methods

  private extractRequirements(messages: any[]): string[] {
    const requirements: string[] = [];
    
    for (const message of messages) {
      const content = message.content.toLowerCase();
      
      // Look for requirement patterns
      if (content.includes('must') || content.includes('should') || content.includes('need')) {
        const sentences = message.content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (/must|should|need|require|shall/i.test(sentence)) {
            requirements.push(sentence.trim());
          }
        }
      }
    }
    
    return requirements.slice(0, 10);
  }

  private extractDecisions(messages: any[]): string[] {
    const decisions: string[] = [];
    
    for (const message of messages) {
      const content = message.content.toLowerCase();
      
      // Look for decision patterns
      if (content.includes('decided') || content.includes('agreed') || content.includes('chosen')) {
        const sentences = message.content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (/decided|agreed|chosen|selected|determined/i.test(sentence)) {
            decisions.push(sentence.trim());
          }
        }
      }
    }
    
    return decisions.slice(0, 5);
  }

  private extractObjectives(messages: any[]): string[] {
    const objectives: string[] = [];
    
    for (const message of messages) {
      const content = message.content.toLowerCase();
      
      // Look for objective patterns
      if (content.includes('goal') || content.includes('objective') || content.includes('purpose')) {
        const sentences = message.content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (/goal|objective|purpose|aim|target/i.test(sentence)) {
            objectives.push(sentence.trim());
          }
        }
      }
    }
    
    return objectives.slice(0, 5);
  }

  private extractProjectName(messages: any[]): string | null {
    for (const message of messages) {
      // Look for project name patterns
      const projectMatch = message.content.match(/project\s+(\w+)|(\w+)\s*project|building\s+(\w+)|creating\s+(\w+)/i);
      if (projectMatch) {
        return projectMatch[1] || projectMatch[2] || projectMatch[3] || projectMatch[4];
      }
    }
    return null;
  }

  private generatePRDDocument(projectName: string, objectives: string[], requirements: string[], decisions: string[]): string {
    const timestamp = new Date().toISOString().split('T')[0];
    
    return `# Product Requirements Document (PRD)

## Project: ${projectName}

**Document Version:** 1.0  
**Date:** ${timestamp}  
**Status:** Draft

---

## 1. Executive Summary

This document outlines the product requirements for ${projectName}. The requirements have been gathered from stakeholder discussions and technical analysis.

## 2. Objectives

${objectives.length > 0 ? objectives.map((obj, index) => `${index + 1}. ${obj}`).join('\n') : '- Define project objectives based on stakeholder input'}

## 3. Functional Requirements

### 3.1 Core Requirements

${requirements.length > 0 ? requirements.map((req, index) => `**FR-${String(index + 1).padStart(3, '0')}:** ${req}`).join('\n\n') : '**FR-001:** Define core functional requirements'}

### 3.2 User Stories

- As a user, I want to [define user stories based on requirements]
- As a system, I need to [define system requirements]

## 4. Non-Functional Requirements

### 4.1 Performance Requirements
- Response time: < 2 seconds for standard operations
- Throughput: Support concurrent users as defined by business needs
- Availability: 99.9% uptime during business hours

### 4.2 Security Requirements
- Authentication and authorization required
- Data encryption in transit and at rest
- Audit logging for all critical operations

### 4.3 Scalability Requirements
- System should scale horizontally
- Database should support expected data growth
- Infrastructure should be cloud-ready

## 5. Technical Decisions

${decisions.length > 0 ? decisions.map((decision, index) => `**TD-${String(index + 1).padStart(3, '0')}:** ${decision}`).join('\n\n') : '**TD-001:** Document technical decisions as they are made'}

## 6. Acceptance Criteria

### 6.1 Definition of Done
- [ ] All functional requirements implemented
- [ ] All non-functional requirements met
- [ ] Code reviewed and tested
- [ ] Documentation updated
- [ ] Security review completed

### 6.2 Success Metrics
- User satisfaction score > 4.0/5.0
- System performance meets defined SLAs
- Zero critical security vulnerabilities

## 7. Dependencies and Assumptions

### 7.1 Dependencies
- External API availability
- Third-party service integrations
- Infrastructure provisioning

### 7.2 Assumptions
- Users have basic technical knowledge
- Network connectivity is reliable
- Required resources will be available

## 8. Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|-------------------|
| Technical complexity | High | Medium | Prototype early, break into phases |
| Resource availability | Medium | Low | Cross-train team members |
| Scope creep | Medium | Medium | Regular stakeholder reviews |

## 9. Timeline and Milestones

### Phase 1: Foundation (Weeks 1-4)
- [ ] Architecture design
- [ ] Core infrastructure setup
- [ ] Basic functionality implementation

### Phase 2: Core Features (Weeks 5-8)
- [ ] Primary feature development
- [ ] Integration testing
- [ ] Performance optimization

### Phase 3: Polish and Launch (Weeks 9-12)
- [ ] User acceptance testing
- [ ] Security review
- [ ] Production deployment

## 10. Appendices

### 10.1 Glossary
- **API:** Application Programming Interface
- **SLA:** Service Level Agreement
- **UAT:** User Acceptance Testing

### 10.2 References
- Stakeholder meeting notes
- Technical architecture documents
- Industry best practices

---

**Document Control:**
- Author: System Generated
- Reviewers: [To be assigned]
- Approvers: [To be assigned]
- Next Review Date: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}

*This document is a living document and will be updated as requirements evolve.*`;
  }
} 