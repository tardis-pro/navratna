#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to fix jest mock functions in a file
function fixJestMocks(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove jest.fn<any, any>() patterns first
    content = content.replace(/jest\.fn<any,\s*any>\(\)/g, 'jest.fn()');

    // Add return type annotations to mock service creation functions
    content = content.replace(
      /export const createMock\w+Service = \(\) => \(\{/g,
      (match) => match.replace('() => ({', '(): any => ({')
    );

    // Add return type annotations to other mock creation functions
    content = content.replace(
      /export const createMock\w+ = \(\) => \(\{/g,
      (match) => match.replace('() => ({', '(): any => ({')
    );

    // Fix Request mock issues by adding 'as any' to createMockRequest calls
    content = content.replace(
      /createMockRequest\([^)]*\)(?!\s+as\s+any)/g,
      (match) => match + ' as any'
    );

    // Fix Response mock issues by adding 'as any' to createMockResponse calls
    content = content.replace(
      /createMockResponse\(\)(?!\s+as\s+any)/g,
      'createMockResponse() as any'
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed jest mocks in: ${filePath}`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

// Function to recursively find test files
function findTestFiles(dir) {
  const files = [];

  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
        traverse(fullPath);
      } else if (stat.isFile() && (item.endsWith('.test.ts') || item.endsWith('.test.js') || item.includes('mock'))) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

// Main execution
const backendDir = path.join(__dirname, 'backend');
if (fs.existsSync(backendDir)) {
  const testFiles = findTestFiles(backendDir);
  console.log(`Found ${testFiles.length} test files to process...`);

  testFiles.forEach(fixJestMocks);

  console.log('Jest mock fixes completed!');
} else {
  console.error('Backend directory not found');
}
