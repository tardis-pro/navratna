#!/usr/bin/env node

/**
 * SDK Generator CLI
 * 
 * Command-line interface for generating TypeScript SDK from backend services
 */

import * as yargs from 'yargs';
import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import { SDKGenerator } from './SDKGenerator';
import { SDKGeneratorConfig } from './types';

const argv = yargs
  .usage('Usage: $0 [options]')
  .option('config', {
    alias: 'c',
    type: 'string',
    description: 'Path to configuration file',
    default: 'sdk-generator.config.json'
  })
  .option('services', {
    alias: 's',
    type: 'string',
    description: 'Path to services directory',
    default: './services'
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Output directory for generated SDK',
    default: './generated-sdk'
  })
  .option('watch', {
    alias: 'w',
    type: 'boolean',
    description: 'Watch for changes and regenerate',
    default: false
  })
  .option('init', {
    type: 'boolean',
    description: 'Initialize configuration file',
    default: false
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Verbose output',
    default: false
  })
  .help()
  .alias('help', 'h')
  .version()
  .alias('version', 'V')
  .parseSync();

async function main() {
  try {
    console.log(chalk.blue.bold('🔧 UAIP SDK Generator'));
    console.log(chalk.gray('Auto-generating TypeScript SDK from backend services\n'));

    // Initialize configuration if requested
    if (argv.init) {
      await initializeConfig();
      return;
    }

    // Load or create configuration
    const config = await loadConfiguration();
    
    // Validate configuration
    SDKGenerator.validateConfig(config);

    // Create generator instance
    const generator = new SDKGenerator(config);

    // Watch mode or single generation
    if (argv.watch) {
      await generator.watch();
    } else {
      await generator.generateSDK();
    }

  } catch (error) {
    console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function initializeConfig(): Promise<void> {
  const configPath = argv.config as string;
  
  if (await fs.pathExists(configPath)) {
    const overwrite = await prompt(`Configuration file ${configPath} already exists. Overwrite? (y/N): `);
    if (!overwrite.toLowerCase().startsWith('y')) {
      console.log(chalk.yellow('Configuration initialization cancelled.'));
      return;
    }
  }

  const servicesDir = path.resolve(argv.services as string);
  const outputDir = path.resolve(argv.output as string);
  
  const config = SDKGenerator.createDefaultConfig(servicesDir, outputDir);
  
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  
  console.log(chalk.green(`✅ Configuration file created: ${configPath}`));
  console.log(chalk.gray('Edit the configuration file to customize your SDK generation.'));
  console.log(chalk.gray(`Then run: ${chalk.white('npx @uaip/sdk-generator -c ' + configPath)}`));
}

async function loadConfiguration(): Promise<SDKGeneratorConfig> {
  const configPath = argv.config as string;
  
  if (await fs.pathExists(configPath)) {
    console.log(chalk.blue(`📄 Loading configuration from: ${configPath}`));
    const configContent = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(configContent);
  }

  console.log(chalk.yellow('⚠️  No configuration file found, using defaults'));
  
  const servicesDir = path.resolve(argv.services as string);
  const outputDir = path.resolve(argv.output as string);
  
  return SDKGenerator.createDefaultConfig(servicesDir, outputDir);
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question(question, (answer: string) => {
      readline.close();
      resolve(answer);
    });
  });
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  process.exit(1);
});

// Run the CLI
if (require.main === module) {
  main();
} 