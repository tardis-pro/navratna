import { build } from 'esbuild';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  external: [
    'amqplib', 'ioredis', 'pg', 'uuid', 'winston', 'zod', 'events',
    'express', 'cors', 'helmet', 'compression', 'morgan', 'dotenv',
    'bcrypt', 'jsonwebtoken', 'multer', 'axios', 'node-cron', 'ws'
  ],
  // Build order matters: dependencies first, then packages that depend on them
  shared: ['types', 'utils', 'config', 'services', 'middleware'],
  services: [
    'agent-intelligence', 'orchestration-pipeline', 'capability-registry',
    'discussion-orchestration', 'security-gateway'
  ]
};

// Utilities
const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  section: (msg) => console.log(`\n📦 ${msg}`)
};

const fileExists = async (path) => {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
};

const cleanDirectory = async (dir) => {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist, ignore
  }
};

// Build functions
async function getEntryPoints(packageDir) {
  const srcDir = path.join(packageDir, 'src');
  const hasSrc = await fileExists(srcDir);
  
  const searchDir = hasSrc ? srcDir : packageDir;
  const ignore = hasSrc ? [] : [`${packageDir}/node_modules/**`, `${packageDir}/dist/**`];
  
  const entryPoints = await glob(`${searchDir}/**/*.ts`, {
    cwd: __dirname,
    absolute: true,
    ignore
  });

  return { entryPoints, outbase: searchDir };
}

async function buildSharedPackage(packageName) {
  const packageDir = `shared/${packageName}`;
  const outDir = `${packageDir}/dist`;

  logger.info(`Building shared package: ${packageName}`);

  const { entryPoints } = await getEntryPoints(packageDir);

  if (entryPoints.length === 0) {
    logger.warn(`No TypeScript files found in ${packageName}`);
    return;
  }

  await cleanDirectory(outDir);

  try {
    // Check if package has path mappings that require tsc-alias
    const needsAlias = ['services', 'middleware'].includes(packageName);
    const buildCommand = needsAlias ? 'pnpm run build' : 'pnpm exec tsc';
    
    const { stdout, stderr } = await execAsync(buildCommand, {
      cwd: path.resolve(__dirname, packageDir),
      env: { ...process.env, NODE_ENV: 'production' }
    });

    if (stderr && !stderr.includes('warning')) {
      logger.error(`Build errors for ${packageName}:`);
      console.error(stderr);
      throw new Error(`Build failed for ${packageName}: ${stderr}`);
    }

    logger.success(`${packageName} built successfully`);
  } catch (error) {
    logger.error(`Failed to build ${packageName}: ${error.message}`);
    throw new Error(`Shared package ${packageName} build failed: ${error.message}`);
  }
}

async function buildService(serviceName) {
  const serviceDir = `services/${serviceName}`;
  
  logger.info(`Building service: ${serviceName}`);

  if (!(await fileExists(serviceDir))) {
    throw new Error(`Service directory not found: ${serviceDir}`);
  }

  await cleanDirectory(`${serviceDir}/dist`);

  try {
    const { stdout, stderr } = await execAsync('pnpm run build', {
      cwd: path.resolve(__dirname, serviceDir),
      env: { ...process.env, NODE_ENV: 'production' }
    });

    if (stderr && !stderr.includes('warning')) {
      logger.error(`Build errors for ${serviceName}:`);
      console.error(stderr);
      throw new Error(`Build failed for ${serviceName}: ${stderr}`);
    }

    logger.success(`${serviceName} built successfully`);
  } catch (error) {
    logger.error(`Failed to build ${serviceName}: ${error.message}`);
    throw new Error(`Service ${serviceName} build failed: ${error.message}`);
  }
}

// Main build functions
async function buildSharedPackages() {
  logger.section('Building shared packages');
  
  for (const packageName of CONFIG.shared) {
    await buildSharedPackage(packageName);
  }
}

async function buildServices() {
  logger.section('Building services');
  
  // Build services sequentially to get better error reporting
  for (const serviceName of CONFIG.services) {
    try {
      await buildService(serviceName);
    } catch (error) {
      logger.error(`Service ${serviceName} failed to build`);
      throw error;
    }
  }
}

async function buildAll() {
  logger.section('Starting comprehensive build process');
  
  await buildSharedPackages();
  await buildServices();
  
  logger.success('All builds completed successfully!');
}

// CLI interface
const commands = {
  shared: buildSharedPackages,
  services: buildServices,
  all: buildAll
};

async function runCommand(command = 'all') {
  try {
    const buildFunction = commands[command] || commands.all;
    await buildFunction();
  } catch (error) {
    logger.error(`Build process failed: ${error.message}`);
    process.exit(1);
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCommand(process.argv[2]);
}

export { buildAll, buildSharedPackages, buildServices, buildSharedPackage, buildService }; 