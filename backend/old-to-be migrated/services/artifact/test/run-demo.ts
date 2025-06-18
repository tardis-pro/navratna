#!/usr/bin/env tsx

import { runArtifactGenerationDemo, runPRDGenerationDemo } from './demo.js';

async function main() {
  console.log('🧪 Running Artifact Generation Tests');
  console.log('====================================\n');

  try {
    // Run the main artifact generation demo
    await runArtifactGenerationDemo();
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Run the PRD generation demo
    await runPRDGenerationDemo();
    
    console.log('\n✨ All tests completed!');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npm run test:artifacts [options]

Options:
  --help, -h     Show this help message
  --prd-only     Run only PRD generation demo
  --artifact-only Run only artifact generation demo

Examples:
  npm run test:artifacts
  npm run test:artifacts -- --prd-only
  npm run test:artifacts -- --artifact-only
  `);
  process.exit(0);
}

if (args.includes('--prd-only')) {
  runPRDGenerationDemo().catch(console.error);
} else if (args.includes('--artifact-only')) {
  runArtifactGenerationDemo().catch(console.error);
} else {
  main().catch(console.error);
} 