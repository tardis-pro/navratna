/**
 * SDK Generator
 * 
 * Main class that orchestrates the analysis of backend services
 * and generation of TypeScript SDK code
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { RouteAnalyzer } from './analyzer/RouteAnalyzer';
import { CodeGenerator } from './generator/CodeGenerator';
import { 
  SDKGeneratorConfig, 
  ServiceInfo, 
  GeneratedSDK,
  RouteAnalyzerOptions,
  CodeGeneratorOptions
} from './types';

export class SDKGenerator {
  private config: SDKGeneratorConfig;
  private routeAnalyzer: RouteAnalyzer;
  private codeGenerator: CodeGenerator;

  constructor(config: SDKGeneratorConfig) {
    this.config = config;
    
    const analyzerOptions: RouteAnalyzerOptions = {
      includeMiddleware: true,
      extractTypes: this.config.options.includeTypes,
      followImports: true,
      includeInternal: false
    };

    const generatorOptions: CodeGeneratorOptions = {
      template: 'default',
      includeComments: true,
      includeValidation: this.config.options.includeValidation,
      includeAuth: this.config.options.includeAuth,
      outputFormat: 'esm',
      minify: this.config.options.minify,
      prettier: true
    };

    this.routeAnalyzer = new RouteAnalyzer(analyzerOptions);
    this.codeGenerator = new CodeGenerator(generatorOptions);
  }

  /**
   * Generate SDK from all configured services
   */
  async generateSDK(): Promise<GeneratedSDK> {
    console.log(chalk.blue('🚀 Starting SDK generation...'));
    
    const services = await this.analyzeServices();
    const sdk = await this.codeGenerator.generateSDK(services);
    
    await this.writeSDKFiles(sdk);
    
    console.log(chalk.green('✅ SDK generation completed successfully!'));
    console.log(chalk.gray(`Generated ${sdk.metadata.totalRoutes} endpoints across ${sdk.metadata.services.length} services`));
    
    return sdk;
  }

  /**
   * Analyze all configured services
   */
  private async analyzeServices(): Promise<ServiceInfo[]> {
    const services: ServiceInfo[] = [];

    for (const [serviceName, serviceConfig] of Object.entries(this.config.services)) {
      console.log(chalk.yellow(`📊 Analyzing service: ${serviceName}`));
      
      try {
        const serviceInfo = await this.routeAnalyzer.analyzeService(
          serviceConfig.path,
          serviceName
        );

        // Apply include/exclude filters
        if (serviceConfig.include || serviceConfig.exclude) {
          serviceInfo.routes = this.filterRoutes(serviceInfo.routes, serviceConfig);
        }

        services.push(serviceInfo);
        console.log(chalk.green(`✅ ${serviceName}: ${serviceInfo.routes.length} routes found`));
      } catch (error) {
        console.error(chalk.red(`❌ Failed to analyze ${serviceName}:`), error);
        throw error;
      }
    }

    return services;
  }

  /**
   * Filter routes based on include/exclude patterns
   */
  private filterRoutes(routes: any[], serviceConfig: any): any[] {
    let filteredRoutes = routes;

    if (serviceConfig.include) {
      filteredRoutes = filteredRoutes.filter(route => 
        serviceConfig.include.some((pattern: string) => 
          route.path.includes(pattern) || route.tags.some((tag: string) => tag.includes(pattern))
        )
      );
    }

    if (serviceConfig.exclude) {
      filteredRoutes = filteredRoutes.filter(route => 
        !serviceConfig.exclude.some((pattern: string) => 
          route.path.includes(pattern) || route.tags.some((tag: string) => tag.includes(pattern))
        )
      );
    }

    return filteredRoutes;
  }

  /**
   * Write generated SDK files to disk
   */
  private async writeSDKFiles(sdk: GeneratedSDK): Promise<void> {
    const outputDir = this.config.output.directory;
    await fs.ensureDir(outputDir);

    console.log(chalk.blue('📝 Writing SDK files...'));

    // Write main client file
    const clientPath = path.join(outputDir, `${this.config.output.filename}.ts`);
    await fs.writeFile(clientPath, sdk.client);
    console.log(chalk.gray(`   ✓ Client: ${clientPath}`));

    // Write types file
    if (this.config.options.includeTypes) {
      const typesPath = path.join(outputDir, `${this.config.output.filename}.types.ts`);
      await fs.writeFile(typesPath, sdk.types);
      console.log(chalk.gray(`   ✓ Types: ${typesPath}`));
    }

    // Write individual service files
    for (const [serviceName, serviceCode] of Object.entries(sdk.services)) {
      const servicePath = path.join(outputDir, 'services', `${serviceName}.ts`);
      await fs.ensureDir(path.dirname(servicePath));
      await fs.writeFile(servicePath, serviceCode);
      console.log(chalk.gray(`   ✓ Service: ${servicePath}`));
    }

    // Write documentation
    if (sdk.docs && this.config.options.generateDocs) {
      const docsPath = path.join(outputDir, 'README.md');
      await fs.writeFile(docsPath, sdk.docs);
      console.log(chalk.gray(`   ✓ Docs: ${docsPath}`));
    }

    // Write metadata
    const metadataPath = path.join(outputDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(sdk.metadata, null, 2));
    console.log(chalk.gray(`   ✓ Metadata: ${metadataPath}`));

    // Write package.json for the generated SDK
    await this.writePackageJson(outputDir, sdk);
  }

  /**
   * Write package.json for the generated SDK
   */
  private async writePackageJson(outputDir: string, sdk: GeneratedSDK): Promise<void> {
    const packageJson = {
      name: '@uaip/generated-sdk',
      version: sdk.metadata.version,
      description: 'Auto-generated TypeScript SDK for UAIP Backend Services',
      main: `${this.config.output.filename}.js`,
      types: `${this.config.output.filename}.d.ts`,
      files: [
        '*.ts',
        '*.js',
        '*.d.ts',
        'services/',
        'README.md'
      ],
      scripts: {
        build: 'tsc',
        prepublishOnly: 'npm run build'
      },
      dependencies: {
        // Add any runtime dependencies here
      },
      devDependencies: {
        typescript: '^5.3.3',
        '@types/node': '^20.10.6'
      },
      keywords: [
        'uaip',
        'sdk',
        'typescript',
        'api-client',
        'auto-generated'
      ],
      author: 'UAIP SDK Generator',
      license: 'MIT',
      generated: {
        at: sdk.metadata.generatedAt.toISOString(),
        services: sdk.metadata.services,
        totalRoutes: sdk.metadata.totalRoutes,
        generator: {
          name: '@uaip/sdk-generator',
          version: '1.0.0'
        }
      }
    };

    const packagePath = path.join(outputDir, 'package.json');
    await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
    console.log(chalk.gray(`   ✓ Package: ${packagePath}`));
  }

  /**
   * Watch for changes and regenerate SDK
   */
  async watch(): Promise<void> {
    console.log(chalk.blue('👀 Watching for changes...'));
    
    const chokidar = await import('chokidar');
    
    const watchPaths = Object.values(this.config.services).map(service => 
      path.join(service.path, 'src/**/*.ts')
    );

    const watcher = chokidar.watch(watchPaths, {
      ignored: /node_modules/,
      persistent: true
    });

    watcher.on('change', async (filePath) => {
      console.log(chalk.yellow(`🔄 File changed: ${filePath}`));
      try {
        await this.generateSDK();
        console.log(chalk.green('✅ SDK regenerated successfully!'));
      } catch (error) {
        console.error(chalk.red('❌ Failed to regenerate SDK:'), error);
      }
    });

    // Keep the process running
    process.on('SIGINT', () => {
      console.log(chalk.blue('\n👋 Stopping watcher...'));
      watcher.close();
      process.exit(0);
    });
  }

  /**
   * Validate configuration
   */
  static validateConfig(config: SDKGeneratorConfig): void {
    if (!config.services || Object.keys(config.services).length === 0) {
      throw new Error('No services configured');
    }

    for (const [serviceName, serviceConfig] of Object.entries(config.services)) {
      if (!serviceConfig.path) {
        throw new Error(`Service ${serviceName} missing path`);
      }

      if (!fs.existsSync(serviceConfig.path)) {
        throw new Error(`Service ${serviceName} path does not exist: ${serviceConfig.path}`);
      }
    }

    if (!config.output.directory) {
      throw new Error('Output directory not specified');
    }

    if (!config.output.filename) {
      throw new Error('Output filename not specified');
    }
  }

  /**
   * Create default configuration
   */
  static createDefaultConfig(servicesDir: string, outputDir: string): SDKGeneratorConfig {
    return {
      services: {
        'agent-intelligence': {
          path: path.join(servicesDir, 'agent-intelligence'),
          basePath: '/api/v1/agents'
        },
        'llm-service': {
          path: path.join(servicesDir, 'llm-service'),
          basePath: '/api/v1/llm'
        },
        'security-gateway': {
          path: path.join(servicesDir, 'security-gateway'),
          basePath: '/api/v1/admin'
        },
        'capability-registry': {
          path: path.join(servicesDir, 'capability-registry'),
          basePath: '/api/v1/capabilities'
        },
        'orchestration-pipeline': {
          path: path.join(servicesDir, 'orchestration-pipeline'),
          basePath: '/api/v1/operations'
        },
        'discussion-orchestration': {
          path: path.join(servicesDir, 'discussion-orchestration'),
          basePath: '/api/v1/discussions'
        },
        'artifact-service': {
          path: path.join(servicesDir, 'artifact-service'),
          basePath: '/api/v1/artifacts'
        }
      },
      output: {
        directory: outputDir,
        filename: 'uaip-sdk',
        format: 'typescript'
      },
      templates: {},
      options: {
        includeTypes: true,
        includeValidation: true,
        includeAuth: true,
        useAxios: false,
        useFetch: true,
        generateDocs: true,
        minify: false
      }
    };
  }
} 