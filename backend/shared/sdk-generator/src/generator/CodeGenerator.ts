/**
 * Code Generator
 * 
 * Generates TypeScript SDK code from analyzed service information
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import * as prettier from 'prettier';
import { 
  ServiceInfo, 
  GeneratedSDK, 
  CodeGeneratorOptions,
  RouteInfo,
  TypeInfo
} from '../types';

export class CodeGenerator {
  private options: CodeGeneratorOptions;
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(options: Partial<CodeGeneratorOptions> = {}) {
    this.options = {
      template: 'default',
      includeComments: true,
      includeValidation: true,
      includeAuth: true,
      outputFormat: 'esm',
      minify: false,
      prettier: true,
      ...options
    };

    this.initializeTemplates();
  }

  /**
   * Generate complete SDK from service information
   */
  async generateSDK(services: ServiceInfo[]): Promise<GeneratedSDK> {
    const client = await this.generateClient(services);
    const types = await this.generateTypes(services);
    const serviceClients = await this.generateServiceClients(services);
    const docs = this.options.includeComments ? await this.generateDocs(services) : undefined;

    return {
      client,
      types,
      services: serviceClients,
      docs,
      metadata: {
        generatedAt: new Date(),
        version: '1.0.0',
        services: services.map(s => s.name),
        totalRoutes: services.reduce((total, s) => total + s.routes.length, 0)
      }
    };
  }

  /**
   * Generate main client class
   */
  private async generateClient(services: ServiceInfo[]): Promise<string> {
    const template = this.templates.get('client');
    if (!template) {
      throw new Error('Client template not found');
    }

    const code = template({
      services,
      includeAuth: this.options.includeAuth,
      includeValidation: this.options.includeValidation,
      outputFormat: this.options.outputFormat,
      timestamp: new Date().toISOString()
    });

    return this.formatCode(code);
  }

  /**
   * Generate TypeScript types
   */
  private async generateTypes(services: ServiceInfo[]): Promise<string> {
    const template = this.templates.get('types');
    if (!template) {
      throw new Error('Types template not found');
    }

    // Collect all types from all services
    const allTypes = services.flatMap(s => s.types);
    const uniqueTypes = this.deduplicateTypes(allTypes);

    const code = template({
      types: uniqueTypes,
      services,
      timestamp: new Date().toISOString()
    });

    return this.formatCode(code);
  }

  /**
   * Generate individual service clients
   */
  private async generateServiceClients(services: ServiceInfo[]): Promise<Record<string, string>> {
    const serviceClients: Record<string, string> = {};

    for (const service of services) {
      const template = this.templates.get('service');
      if (!template) {
        throw new Error('Service template not found');
      }

      const code = template({
        service,
        routes: service.routes,
        includeAuth: this.options.includeAuth,
        includeValidation: this.options.includeValidation,
        timestamp: new Date().toISOString()
      });

      serviceClients[service.name] = await this.formatCode(code);
    }

    return serviceClients;
  }

  /**
   * Generate API documentation
   */
  private async generateDocs(services: ServiceInfo[]): Promise<string> {
    const template = this.templates.get('docs');
    if (!template) {
      return this.generateMarkdownDocs(services);
    }

    const code = template({
      services,
      timestamp: new Date().toISOString()
    });

    return code;
  }

  /**
   * Generate markdown documentation as fallback
   */
  private generateMarkdownDocs(services: ServiceInfo[]): string {
    let docs = '# UAIP Backend SDK Documentation\n\n';
    docs += `Generated on: ${new Date().toISOString()}\n\n`;

    for (const service of services) {
      docs += `## ${service.name}\n\n`;
      docs += `${service.description}\n\n`;
      docs += `Base Path: \`${service.basePath}\`\n\n`;

      if (service.routes.length > 0) {
        docs += '### Endpoints\n\n';
        
        for (const route of service.routes) {
          docs += `#### ${route.method} ${route.path}\n\n`;
          
          if (route.description) {
            docs += `${route.description}\n\n`;
          }

          if (route.parameters.length > 0) {
            docs += '**Parameters:**\n\n';
            for (const param of route.parameters) {
              docs += `- \`${param.name}\` (${param.in}): ${param.type}${param.required ? ' *required*' : ''}\n`;
            }
            docs += '\n';
          }

          if (route.security && route.security.length > 0) {
            docs += '**Security:** Authentication required\n\n';
          }

          docs += '---\n\n';
        }
      }
    }

    return docs;
  }

  /**
   * Initialize Handlebars templates
   */
  private initializeTemplates(): void {
    // Register Handlebars helpers
    this.registerHelpers();

    // Client template
    const clientTemplate = `/**
 * UAIP Backend SDK Client
 * 
 * Auto-generated on: {{timestamp}}
 * Services: {{#each services}}{{name}}{{#unless @last}}, {{/unless}}{{/each}}
 */

{{#if includeAuth}}
export interface AuthConfig {
  token?: string;
  apiKey?: string;
  baseURL?: string;
}
{{/if}}

export interface RequestConfig {
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: Date;
    requestId?: string;
  };
}

export class UAIPClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string> = {};
  {{#if includeAuth}}
  private authToken?: string;
  {{/if}}

  constructor(config: RequestConfig & {{#if includeAuth}}AuthConfig{{else}}{}{{/if}} = {}) {
    this.baseURL = config.baseURL || 'http://localhost:8081';
    {{#if includeAuth}}
    this.authToken = config.token;
    {{/if}}
    
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers
    };

    {{#if includeAuth}}
    if (this.authToken) {
      this.defaultHeaders['Authorization'] = \`Bearer \${this.authToken}\`;
    }
    {{/if}}
  }

  {{#if includeAuth}}
  setAuthToken(token: string): void {
    this.authToken = token;
    this.defaultHeaders['Authorization'] = \`Bearer \${token}\`;
  }

  clearAuth(): void {
    this.authToken = undefined;
    delete this.defaultHeaders['Authorization'];
  }
  {{/if}}

  private async request<T>(
    method: string,
    path: string,
    data?: any,
    config?: RequestConfig
  ): Promise<APIResponse<T>> {
    const url = \`\${this.baseURL}\${path}\`;
    const headers = { ...this.defaultHeaders, ...config?.headers };

    const requestInit: RequestInit = {
      method,
      headers,
      ...(data && { body: JSON.stringify(data) })
    };

    try {
      const response = await fetch(url, requestInit);
      const result = await response.json();

      return {
        success: response.ok,
        data: response.ok ? result.data : undefined,
        error: !response.ok ? result.error : undefined,
        meta: {
          timestamp: new Date(),
          requestId: response.headers.get('x-request-id') || undefined
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        meta: {
          timestamp: new Date()
        }
      };
    }
  }

  // Service clients
  {{#each services}}
  {{camelCase name}} = {
    {{#each routes}}
    /**
     * {{#if description}}{{description}}{{else}}{{method}} {{path}}{{/if}}
     {{#if parameters.length}}
     * @param params - Request parameters
     {{/if}}
     {{#if requestBody}}
     * @param data - Request body
     {{/if}}
     */
    {{camelCase (concat method (pascalCase (replace path "/" " ")))}}{{#if requestBody}}: async ({{#if parameters.length}}params: { {{#each parameters}}{{name}}{{#unless required}}?{{/unless}}: {{jsType type}}{{#unless @last}}; {{/unless}}{{/each}} }, {{/if}}data: any) => {{else}}: async ({{#if parameters.length}}params: { {{#each parameters}}{{name}}{{#unless required}}?{{/unless}}: {{jsType type}}{{#unless @last}}; {{/unless}}{{/each}} }{{/if}}) => {{/if}}{
      {{#if parameters.length}}
      const pathParams = { {{#each parameters}}{{#if (eq in "path")}}{{name}}: params.{{name}}{{#unless @last}}, {{/unless}}{{/if}}{{/each}} };
      const queryParams = { {{#each parameters}}{{#if (eq in "query")}}{{name}}: params.{{name}}{{#unless @last}}, {{/unless}}{{/if}}{{/each}} };
      
      let path = '{{../basePath}}{{path}}';
      {{#each parameters}}
      {{#if (eq in "path")}}
      path = path.replace(':{{name}}', String(pathParams.{{name}}));
      {{/if}}
      {{/each}}

      {{#if (hasQueryParams parameters)}}
      const searchParams = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      if (searchParams.toString()) {
        path += '?' + searchParams.toString();
      }
      {{/if}}
      {{else}}
      const path = '{{../basePath}}{{path}}';
      {{/if}}

      return this.request{{#if requestBody}}<any>{{/if}}('{{method}}', path{{#if requestBody}}, data{{/if}});
    }{{#unless @last}},{{/unless}}
    {{/each}}
  };
  {{/each}}
}

export default UAIPClient;
`;

    this.templates.set('client', Handlebars.compile(clientTemplate));

    // Types template
    const typesTemplate = `/**
 * UAIP Backend SDK Types
 * 
 * Auto-generated on: {{timestamp}}
 */

{{#each types}}
export interface {{name}} {
  {{#each properties}}
  {{@key}}{{#unless required}}?{{/unless}}: {{jsType type}};
  {{/each}}
}

{{/each}}

// Common response types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: Date;
    requestId?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}
`;

    this.templates.set('types', Handlebars.compile(typesTemplate));
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    Handlebars.registerHelper('camelCase', (str: string) => {
      return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    });

    Handlebars.registerHelper('pascalCase', (str: string) => {
      return str.replace(/(^|-)([a-z])/g, (g) => g.slice(-1).toUpperCase());
    });

    Handlebars.registerHelper('replace', (str: string, search: string, replace: string) => {
      return str.replace(new RegExp(search, 'g'), replace);
    });

    Handlebars.registerHelper('concat', (...args: any[]) => {
      return args.slice(0, -1).join('');
    });

    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);

    Handlebars.registerHelper('jsType', (type: string) => {
      const typeMap: Record<string, string> = {
        'string': 'string',
        'number': 'number',
        'boolean': 'boolean',
        'object': 'any',
        'array': 'any[]',
        'null': 'null'
      };
      return typeMap[type] || 'any';
    });

    Handlebars.registerHelper('hasQueryParams', (parameters: any[]) => {
      return parameters.some(p => p.in === 'query');
    });
  }

  /**
   * Format generated code with Prettier
   */
  private async formatCode(code: string): Promise<string> {
    if (!this.options.prettier) {
      return code;
    }

    try {
      return await prettier.format(code, {
        parser: 'typescript',
        singleQuote: true,
        trailingComma: 'es5',
        tabWidth: 2,
        semi: true
      });
    } catch (error) {
      console.warn('Failed to format code with Prettier:', error);
      return code;
    }
  }

  /**
   * Deduplicate types by name
   */
  private deduplicateTypes(types: TypeInfo[]): TypeInfo[] {
    const seen = new Set<string>();
    return types.filter(type => {
      if (seen.has(type.name)) {
        return false;
      }
      seen.add(type.name);
      return true;
    });
  }
} 