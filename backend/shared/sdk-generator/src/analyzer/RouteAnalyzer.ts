/**
 * Route Analyzer
 * 
 * Analyzes Express applications and routes to extract API information
 * for SDK generation
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';
import { 
  RouteInfo, 
  ServiceInfo, 
  RouteAnalyzerOptions, 
  RouteParameter,
  TypeInfo,
  MiddlewareInfo
} from '../types';

export class RouteAnalyzer {
  private options: RouteAnalyzerOptions;

  constructor(options: Partial<RouteAnalyzerOptions> = {}) {
    this.options = {
      includeMiddleware: true,
      extractTypes: true,
      followImports: true,
      includeInternal: false,
      ...options
    };
  }

  /**
   * Analyze a service directory to extract route information
   */
  async analyzeService(servicePath: string, serviceName: string): Promise<ServiceInfo> {
    const routeFiles = await this.findRouteFiles(servicePath);
    const routes: RouteInfo[] = [];
    const types: TypeInfo[] = [];
    const tags = new Set<string>();

    for (const routeFile of routeFiles) {
      const fileRoutes = await this.analyzeRouteFile(routeFile);
      routes.push(...fileRoutes);
      
      // Extract tags from route file names
      const fileName = path.basename(routeFile, '.ts');
      if (fileName.endsWith('Routes')) {
        tags.add(fileName.replace('Routes', ''));
      }
    }

    // Extract types if enabled
    if (this.options.extractTypes) {
      const extractedTypes = await this.extractTypesFromService(servicePath);
      types.push(...extractedTypes);
    }

    return {
      name: serviceName,
      basePath: this.getServiceBasePath(serviceName),
      version: '1.0.0',
      description: `${serviceName} service API`,
      routes,
      types,
      tags: Array.from(tags)
    };
  }

  /**
   * Find all route files in a service directory
   */
  private async findRouteFiles(servicePath: string): Promise<string[]> {
    const patterns = [
      path.join(servicePath, 'src/routes/**/*.ts'),
      path.join(servicePath, 'routes/**/*.ts'),
      path.join(servicePath, 'src/**/*Routes.ts'),
      path.join(servicePath, 'src/**/*routes.ts')
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern);
      files.push(...matches);
    }

    return [...new Set(files)]; // Remove duplicates
  }

  /**
   * Analyze a single route file to extract route information
   */
  private async analyzeRouteFile(filePath: string): Promise<RouteInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const routes: RouteInfo[] = [];

    // Extract router method calls using regex
    const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*([^)]*)\)/g;
    let match;

    while ((match = routeRegex.exec(content)) !== null) {
      const [, method, path, middlewareAndHandler] = match;
      
      const route: RouteInfo = {
        method: method.toUpperCase() as RouteInfo['method'],
        path: this.normalizePath(path),
        handler: this.extractHandlerName(middlewareAndHandler),
        middleware: this.extractMiddleware(middlewareAndHandler),
        parameters: this.extractParameters(path, content),
        tags: [this.getTagFromFilePath(filePath)],
        security: this.extractSecurity(middlewareAndHandler)
      };

      // Try to extract request/response types from comments or JSDoc
      const typeInfo = this.extractTypeInfo(content, match.index);
      if (typeInfo.requestBody) {
        route.requestBody = typeInfo.requestBody;
      }
      if (typeInfo.responseType) {
        route.responseType = typeInfo.responseType;
      }
      if (typeInfo.description) {
        route.description = typeInfo.description;
      }

      routes.push(route);
    }

    return routes;
  }

  /**
   * Extract parameters from route path and surrounding code
   */
  private extractParameters(routePath: string, fileContent: string): RouteParameter[] {
    const parameters: RouteParameter[] = [];

    // Extract path parameters
    const pathParamRegex = /:([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    while ((match = pathParamRegex.exec(routePath)) !== null) {
      parameters.push({
        name: match[1],
        in: 'path',
        type: 'string',
        required: true,
        description: `Path parameter: ${match[1]}`
      });
    }

    // Try to extract query parameters from validation middleware
    const queryParamRegex = /req\.query\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    while ((match = queryParamRegex.exec(fileContent)) !== null) {
      if (!parameters.find(p => p.name === match[1])) {
        parameters.push({
          name: match[1],
          in: 'query',
          type: 'string',
          required: false,
          description: `Query parameter: ${match[1]}`
        });
      }
    }

    return parameters;
  }

  /**
   * Extract middleware from route definition
   */
  private extractMiddleware(middlewareAndHandler: string): string[] {
    const middleware: string[] = [];
    
    // Common middleware patterns
    if (middlewareAndHandler.includes('authMiddleware')) {
      middleware.push('authMiddleware');
    }
    if (middlewareAndHandler.includes('validateRequest')) {
      middleware.push('validateRequest');
    }
    if (middlewareAndHandler.includes('validateUUID')) {
      middleware.push('validateUUID');
    }
    if (middlewareAndHandler.includes('requireAdmin')) {
      middleware.push('requireAdmin');
    }

    return middleware;
  }

  /**
   * Extract handler function name
   */
  private extractHandlerName(middlewareAndHandler: string): string {
    // Look for controller method calls
    const controllerMatch = middlewareAndHandler.match(/(\w+)\.(\w+)\.bind\(\w+\)/);
    if (controllerMatch) {
      return `${controllerMatch[1]}.${controllerMatch[2]}`;
    }

    // Look for direct function calls
    const functionMatch = middlewareAndHandler.match(/(\w+)\s*$/);
    if (functionMatch) {
      return functionMatch[1];
    }

    return 'anonymous';
  }

  /**
   * Extract security requirements from middleware
   */
  private extractSecurity(middlewareAndHandler: string): any[] {
    const security: any[] = [];

    if (middlewareAndHandler.includes('authMiddleware')) {
      security.push({
        type: 'bearer',
        name: 'Authorization',
        in: 'header'
      });
    }

    return security;
  }

  /**
   * Extract type information from comments and JSDoc
   */
  private extractTypeInfo(content: string, routeIndex: number): {
    requestBody?: TypeInfo;
    responseType?: TypeInfo;
    description?: string;
  } {
    // Look for JSDoc comments before the route
    const beforeRoute = content.substring(Math.max(0, routeIndex - 500), routeIndex);
    const jsdocMatch = beforeRoute.match(/\/\*\*([\s\S]*?)\*\//);
    
    const result: any = {};

    if (jsdocMatch) {
      const jsdoc = jsdocMatch[1];
      
      // Extract description
      const descMatch = jsdoc.match(/^\s*\*\s*(.+?)(?:\n|@)/);
      if (descMatch) {
        result.description = descMatch[1].trim();
      }

      // Extract request body type
      const requestMatch = jsdoc.match(/@body\s+(\w+)/);
      if (requestMatch) {
        result.requestBody = {
          name: requestMatch[1],
          type: 'object'
        };
      }

      // Extract response type
      const responseMatch = jsdoc.match(/@returns?\s+(\w+)/);
      if (responseMatch) {
        result.responseType = {
          name: responseMatch[1],
          type: 'object'
        };
      }
    }

    return result;
  }

  /**
   * Extract types from service files
   */
  private async extractTypesFromService(servicePath: string): Promise<TypeInfo[]> {
    const types: TypeInfo[] = [];
    
    // Look for type files
    const typeFiles = await glob(path.join(servicePath, 'src/types/**/*.ts'));
    
    for (const typeFile of typeFiles) {
      const content = await fs.readFile(typeFile, 'utf-8');
      const extractedTypes = this.extractTypesFromContent(content);
      types.push(...extractedTypes);
    }

    return types;
  }

  /**
   * Extract TypeScript interface/type definitions from content
   */
  private extractTypesFromContent(content: string): TypeInfo[] {
    const types: TypeInfo[] = [];

    // Extract interfaces
    const interfaceRegex = /export\s+interface\s+(\w+)\s*{([^}]*)}/g;
    let match;

    while ((match = interfaceRegex.exec(content)) !== null) {
      const [, name, body] = match;
      const properties = this.parseInterfaceBody(body);
      
      types.push({
        name,
        type: 'object',
        properties,
        description: `Interface: ${name}`
      });
    }

    // Extract type aliases
    const typeRegex = /export\s+type\s+(\w+)\s*=\s*([^;]+);/g;
    while ((match = typeRegex.exec(content)) !== null) {
      const [, name, definition] = match;
      
      types.push({
        name,
        type: this.parseTypeDefinition(definition),
        description: `Type: ${name}`
      });
    }

    return types;
  }

  /**
   * Parse interface body to extract properties
   */
  private parseInterfaceBody(body: string): Record<string, TypeInfo> {
    const properties: Record<string, TypeInfo> = {};
    
    // Simple property extraction (can be enhanced)
    const propertyRegex = /(\w+)(\?)?:\s*([^;,\n]+)/g;
    let match;

    while ((match = propertyRegex.exec(body)) !== null) {
      const [, name, optional, type] = match;
      
      properties[name] = {
        name,
        type: this.normalizeTypeName(type.trim()),
        description: `Property: ${name}`
      };
    }

    return properties;
  }

  /**
   * Parse type definition
   */
  private parseTypeDefinition(definition: string): string {
    return this.normalizeTypeName(definition.trim());
  }

  /**
   * Normalize TypeScript type names to OpenAPI types
   */
  private normalizeTypeName(typeName: string): string {
    const typeMap: Record<string, string> = {
      'string': 'string',
      'number': 'number',
      'boolean': 'boolean',
      'Date': 'string',
      'any': 'object',
      'unknown': 'object',
      'void': 'null'
    };

    return typeMap[typeName] || 'object';
  }

  /**
   * Normalize route path
   */
  private normalizePath(path: string): string {
    return path.startsWith('/') ? path : `/${path}`;
  }

  /**
   * Get tag from file path
   */
  private getTagFromFilePath(filePath: string): string {
    const fileName = path.basename(filePath, '.ts');
    return fileName.replace(/Routes?$/, '').toLowerCase();
  }

  /**
   * Get service base path from service name
   */
  private getServiceBasePath(serviceName: string): string {
    const basePathMap: Record<string, string> = {
      'agent-intelligence': '/api/v1/agents',
      'llm-service': '/api/v1/llm',
      'security-gateway': '/api/v1/admin',
      'capability-registry': '/api/v1/capabilities',
      'orchestration-pipeline': '/api/v1/operations',
      'discussion-orchestration': '/api/v1/discussions',
      'artifact-service': '/api/v1/artifacts'
    };

    return basePathMap[serviceName] || `/api/v1/${serviceName}`;
  }
} 