#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define catalog mappings
const catalogMappings = {
  // Default catalog (shared dependencies)
  'typescript': 'catalog:',
  'zod': 'catalog:',
  'eslint': 'catalog:',
  'rimraf': 'catalog:',
  '@typescript-eslint/eslint-plugin': 'catalog:',
  '@typescript-eslint/parser': 'catalog:',
  'typescript-eslint': 'catalog:',
  '@eslint/js': 'catalog:',

  // Frontend catalog
  'react': 'catalog:frontend',
  'react-dom': 'catalog:frontend',
  '@types/react': 'catalog:frontend',
  '@types/react-dom': 'catalog:frontend',
  '@vitejs/plugin-react-swc': 'catalog:frontend',
  'eslint-plugin-react-hooks': 'catalog:frontend',
  'eslint-plugin-react-refresh': 'catalog:frontend',
  'react-hook-form': 'catalog:frontend',
  'react-router-dom': 'catalog:frontend',
  'react-day-picker': 'catalog:frontend',
  'react-resizable-panels': 'catalog:frontend',
  'socket.io-client': 'catalog:frontend',
  '@heroicons/react': 'catalog:frontend',
  '@tanstack/react-query': 'catalog:frontend',
  '@tanstack/react-virtual': 'catalog:frontend',
  'lucide-react': 'catalog:frontend',
  'embla-carousel-react': 'catalog:frontend',

  // Backend catalog
  'express': 'catalog:backend',
  '@types/express': 'catalog:backend',
  'express-rate-limit': 'catalog:backend',
  'express-validator': 'catalog:backend',
  'express-slow-down': 'catalog:backend',
  'socket.io': 'catalog:backend',
  'typeorm': 'catalog:backend',
  '@nestjs/typeorm': 'catalog:backend',
  '@types/node': 'catalog:backend',
  '@types/cors': 'catalog:backend',
  'dotenv': 'catalog:backend',
  'cors': 'catalog:backend',
  'nodemon': 'catalog:backend',
  'ts-node': 'catalog:backend',
  'winston': 'catalog:backend',

  // Dev catalog
  'esbuild': 'catalog:dev',
  'vite': 'catalog:dev',
  'vitest': 'catalog:dev',
  '@vitest/ui': 'catalog:dev',
  'prettier': 'catalog:dev',
  '@types/eslint': 'catalog:dev',
  'concurrently': 'catalog:dev',
  'cross-env': 'catalog:dev'
};

// Add all Radix UI components to frontend catalog
const radixComponents = [
  '@radix-ui/react-accordion',
  '@radix-ui/react-alert-dialog',
  '@radix-ui/react-aspect-ratio',
  '@radix-ui/react-avatar',
  '@radix-ui/react-checkbox',
  '@radix-ui/react-collapsible',
  '@radix-ui/react-context-menu',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-hover-card',
  '@radix-ui/react-label',
  '@radix-ui/react-menubar',
  '@radix-ui/react-navigation-menu',
  '@radix-ui/react-popover',
  '@radix-ui/react-progress',
  '@radix-ui/react-radio-group',
  '@radix-ui/react-scroll-area',
  '@radix-ui/react-select',
  '@radix-ui/react-separator',
  '@radix-ui/react-slider',
  '@radix-ui/react-slot',
  '@radix-ui/react-switch',
  '@radix-ui/react-tabs',
  '@radix-ui/react-toast',
  '@radix-ui/react-toggle',
  '@radix-ui/react-toggle-group',
  '@radix-ui/react-tooltip'
];

radixComponents.forEach(component => {
  catalogMappings[component] = 'catalog:frontend';
});

function findPackageJsonFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && !['node_modules', '.git', 'dist'].includes(entry.name)) {
      findPackageJsonFiles(fullPath, files);
    } else if (entry.name === 'package.json') {
      files.push(fullPath);
    }
  }
  
  return files;
}

function updatePackageJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const pkg = JSON.parse(content);
    let changed = false;

    // Update dependencies
    ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].forEach(depType => {
      if (pkg[depType]) {
        Object.keys(pkg[depType]).forEach(depName => {
          if (catalogMappings[depName]) {
            console.log(`  ${depType}.${depName}: ${pkg[depType][depName]} → ${catalogMappings[depName]}`);
            pkg[depType][depName] = catalogMappings[depName];
            changed = true;
          }
        });
      }
    });

    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`✅ Updated ${filePath}`);
      return true;
    } else {
      console.log(`⏭️  No changes needed for ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('🔄 Migrating packages to use PNPM catalogs...\n');
  
  const rootDir = process.cwd();
  const packageJsonFiles = findPackageJsonFiles(rootDir);
  
  // Filter out root package.json and already processed files
  const filesToUpdate = packageJsonFiles.filter(file => {
    const relativePath = path.relative(rootDir, file);
    return relativePath !== 'package.json' && 
           !relativePath.includes('scripts/') &&
           !relativePath.includes('node_modules/');
  });

  console.log(`Found ${filesToUpdate.length} package.json files to process:\n`);

  let updatedCount = 0;
  filesToUpdate.forEach(file => {
    const relativePath = path.relative(rootDir, file);
    console.log(`\n📦 Processing ${relativePath}:`);
    
    if (updatePackageJson(file)) {
      updatedCount++;
    }
  });

  console.log(`\n✨ Migration complete! Updated ${updatedCount} out of ${filesToUpdate.length} packages.`);
  
  if (updatedCount > 0) {
    console.log('\n📋 Next steps:');
    console.log('1. Review the changes with: git diff');
    console.log('2. Install dependencies: pnpm install');
    console.log('3. Test your build: pnpm build');
    console.log('4. Commit the changes when ready');
  }
}

if (require.main === module) {
  main();
}

module.exports = { catalogMappings, updatePackageJson }; 