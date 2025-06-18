#!/usr/bin/env ts-node

/**
 * Generate Frontend SDK Script
 * 
 * Generates TypeScript SDK for frontend from backend services
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import { SDKGenerator } from '../shared/sdk-generator/src/SDKGenerator';
import { SDKGeneratorConfig } from '../shared/sdk-generator/src/types';

async function main() {
  try {
    console.log(chalk.blue.bold('🚀 Generating UAIP Frontend SDK'));
    console.log(chalk.gray('Analyzing backend services and generating TypeScript client...\n'));

    // Load configuration
    const configPath = path.join(__dirname, '..', 'sdk-generator.config.json');
    const config: SDKGeneratorConfig = await fs.readJson(configPath);

    // Resolve paths relative to backend directory
    const backendDir = path.join(__dirname, '..');
    for (const serviceName in config.services) {
      config.services[serviceName].path = path.resolve(backendDir, config.services[serviceName].path);
    }
    config.output.directory = path.resolve(backendDir, config.output.directory);

    // Validate configuration
    SDKGenerator.validateConfig(config);

    // Generate SDK
    const generator = new SDKGenerator(config);
    const sdk = await generator.generateSDK();

    console.log(chalk.green('\n✅ SDK Generation Complete!'));
    console.log(chalk.gray(`Generated ${sdk.metadata.totalRoutes} endpoints from ${sdk.metadata.services.length} services`));
    console.log(chalk.gray(`Output directory: ${config.output.directory}`));
    
    // Show next steps
    console.log(chalk.blue('\n📋 Next Steps:'));
    console.log(chalk.gray('1. Update your frontend imports to use the generated SDK'));
    console.log(chalk.gray('2. Replace manual API calls with generated client methods'));
    console.log(chalk.gray('3. Run this script again when backend routes change'));
    console.log(chalk.yellow('\n💡 Tip: Use --watch flag to auto-regenerate on changes'));

  } catch (error) {
    console.error(chalk.red('❌ SDK Generation Failed:'), error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
} 