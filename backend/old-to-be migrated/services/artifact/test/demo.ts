// Demo/Test file for Epic 4: Artifact Generation and DevOps Integration
// This demonstrates the core functionality of the artifact generation system

import { artifactFactory } from '../ArtifactFactory';
import { ConversationContext, Participant } from '@/types/artifact';

// Demo conversation context
const demoConversationContext: ConversationContext = {
  conversationId: 'demo-conversation-001',
  messages: [
    {
      id: 'msg-1',
      content: 'We need to implement a function that calculates the total price including tax.',
      sender: 'Alice',
      timestamp: '2024-01-15T10:00:00Z',
      type: 'user'
    },
    {
      id: 'msg-2', 
      content: 'Great idea! It should take the base price and tax rate as parameters.',
      sender: 'Bob',
      timestamp: '2024-01-15T10:01:00Z',
      type: 'user'
    },
    {
      id: 'msg-3',
      content: 'Can you generate the TypeScript code for this function?',
      sender: 'Alice',
      timestamp: '2024-01-15T10:02:00Z',
      type: 'user'
    },
    {
      id: 'msg-4',
      content: 'We should also write unit tests for this function to ensure it works correctly.',
      sender: 'Bob',
      timestamp: '2024-01-15T10:03:00Z',
      type: 'user'
    },
    {
      id: 'msg-5',
      content: 'And let\'s create documentation for this function so other developers can understand how to use it.',
      sender: 'Alice',
      timestamp: '2024-01-15T10:04:00Z',
      type: 'user'
    }
  ],
  phase: 'implementation',
  participants: [
    {
      id: 'developer',
      name: 'Alice',
      role: 'developer',
      permissions: ['generate:*']
    },
    {
      id: 'developer',
      name: 'Bob',
      role: 'developer',
      permissions: ['generate:*']
    }
  ],
  metadata: {
    projectName: 'E-commerce System',
    language: 'typescript'
  }
};

const demoUser: Participant = {
  id: 'developer',
  name: 'Alice',
  role: 'developer',
  permissions: ['generate:*']
};

/**
 * Demo function to test artifact generation
 */
export async function runArtifactGenerationDemo() {
  console.log('🚀 Starting Epic 4: Artifact Generation Demo');
  console.log('=============================================');

  try {
    // Step 1: Analyze the conversation
    console.log('\n📊 Step 1: Analyzing conversation...');
    const analysis = await artifactFactory.analyzeConversation(demoConversationContext);
    
    console.log('Conversation Phase:', analysis.phase.current);
    console.log('Phase Confidence:', Math.round(analysis.phase.confidence * 100) + '%');
    console.log('Generation Triggers Found:', analysis.triggers.length);
    console.log('Suggestions:', analysis.suggestions);

    // Step 2: Generate a code artifact
    console.log('\n💻 Step 2: Generating code artifact...');
    const codeResult = await artifactFactory.generateArtifact(
      'code-diff',
      demoConversationContext,
      demoUser
    );

    if (codeResult.success && codeResult.artifact) {
      console.log('✅ Code generation successful!');
      console.log('Title:', codeResult.artifact.metadata.title);
      console.log('Language:', codeResult.artifact.metadata.language);
      console.log('Confidence:', Math.round(codeResult.artifact.traceability.confidence * 100) + '%');
      console.log('Content Preview:', codeResult.artifact.content.substring(0, 200) + '...');
      
      // Validate the generated artifact
      const validation = artifactFactory.validateArtifact(codeResult.artifact);
      console.log('Validation Status:', validation.isValid ? '✅ Valid' : '❌ Invalid');
      console.log('Validation Score:', Math.round(validation.score * 100) + '%');
      
      if (validation.warnings.length > 0) {
        console.log('Warnings:', validation.warnings.length);
      }
    } else {
      console.log('❌ Code generation failed:', codeResult.errors);
    }

    // Step 3: Generate a test artifact
    console.log('\n🧪 Step 3: Generating test artifact...');
    const testResult = await artifactFactory.generateArtifact(
      'test',
      demoConversationContext,
      demoUser
    );

    if (testResult.success && testResult.artifact) {
      console.log('✅ Test generation successful!');
      console.log('Title:', testResult.artifact.metadata.title);
      console.log('Confidence:', Math.round(testResult.artifact.traceability.confidence * 100) + '%');
    } else {
      console.log('❌ Test generation failed:', testResult.errors);
    }

    // Step 4: Generate documentation
    console.log('\n📚 Step 4: Generating documentation...');
    const docResult = await artifactFactory.generateArtifact(
      'documentation',
      demoConversationContext,
      demoUser
    );

    if (docResult.success && docResult.artifact) {
      console.log('✅ Documentation generation successful!');
      console.log('Title:', docResult.artifact.metadata.title);
      console.log('Confidence:', Math.round(docResult.artifact.traceability.confidence * 100) + '%');
    } else {
      console.log('❌ Documentation generation failed:', docResult.errors);
    }

    // Step 5: Show system status
    console.log('\n⚙️  Step 5: System Status');
    const status = artifactFactory.getSystemStatus();
    console.log('Available Generators:', Object.keys(status.generators));
    console.log('Services Status:', status.services);

    console.log('\n🎉 Demo completed successfully!');
    console.log('\nEpic 4 Implementation Features:');
    console.log('✅ Conversation analysis and pattern detection');
    console.log('✅ Multiple artifact generators (code, tests, docs, PRD)');
    console.log('✅ Comprehensive validation framework');
    console.log('✅ Security scanning and audit logging');
    console.log('✅ Traceability and confidence scoring');
    console.log('✅ Modular architecture with plugin support');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

/**
 * Demo conversation for PRD generation
 */
const prdConversationContext: ConversationContext = {
  conversationId: 'prd-demo-002',
  messages: [
    {
      id: 'prd-msg-1',
      content: 'We need to document the requirements for the new user authentication feature.',
      sender: 'Product Manager',
      timestamp: '2024-01-15T14:00:00Z',
      type: 'user'
    },
    {
      id: 'prd-msg-2',
      content: 'The feature should support email/password login and social OAuth.',
      sender: 'Tech Lead',
      timestamp: '2024-01-15T14:01:00Z', 
      type: 'user'
    },
    {
      id: 'prd-msg-3',
      content: 'Let\'s create a PRD section for this feature with acceptance criteria.',
      sender: 'Product Manager',
      timestamp: '2024-01-15T14:02:00Z',
      type: 'user'
    }
  ],
  phase: 'decision',
  participants: [
    {
      id: 'product_manager',
      name: 'Product Manager',
      role: 'product_manager',
      permissions: ['generate:prd', 'generate:documentation']
    }
  ],
  metadata: {
    feature: 'user-authentication',
    priority: 'high'
  }
};

/**
 * Demo PRD generation
 */
export async function runPRDGenerationDemo() {
  console.log('\n📋 PRD Generation Demo');
  console.log('=====================');

  const pmUser: Participant = {
    id: 'product_manager',
    name: 'Product Manager', 
    role: 'product_manager',
    permissions: ['generate:prd', 'generate:documentation']
  };

  try {
    const prdResult = await artifactFactory.generateArtifact(
      'prd',
      prdConversationContext,
      pmUser
    );

    if (prdResult.success && prdResult.artifact) {
      console.log('✅ PRD generation successful!');
      console.log('Title:', prdResult.artifact.metadata.title);
      console.log('Content:\n', prdResult.artifact.content);
    } else {
      console.log('❌ PRD generation failed:', prdResult.errors);
    }
  } catch (error) {
    console.error('❌ PRD demo failed:', error);
  }
}

// Export demo functions for use in development
export { demoConversationContext, demoUser };

// Add console command helper
if (typeof window !== 'undefined') {
  (window as any).runArtifactDemo = runArtifactGenerationDemo;
  (window as any).runPRDDemo = runPRDGenerationDemo;
  console.log('🎯 Demo functions available:');
  console.log('  - runArtifactDemo() - Full artifact generation demo');
  console.log('  - runPRDDemo() - PRD generation demo');
} 