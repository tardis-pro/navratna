import { build } from 'esbuild';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildSharedServices() {
  try {
    // Get all TypeScript files in shared services
    const entryPoints = await glob('shared/services/**/*.ts', {
      cwd: __dirname,
      absolute: true
    });

    console.log(`Building ${entryPoints.length} shared service files...`);

    await build({
      entryPoints,
      bundle: false, // Don't bundle dependencies, just compile
      platform: 'node',
      target: 'es2022',
      format: 'esm',
      outdir: 'dist/shared',
      sourcemap: true,
      external: [
        // External dependencies that should not be bundled
        'amqplib',
        'ioredis', 
        'pg',
        'uuid',
        'winston',
        'zod',
        'events'
      ],
      tsconfig: 'shared/tsconfig.json',
      metafile: true,
      logLevel: 'info',
      resolveExtensions: ['.ts', '.js'],
      loader: {
        '.ts': 'ts'
      },
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    });

    console.log('✅ Shared services build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run build if this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildSharedServices();
}

export { buildSharedServices }; 