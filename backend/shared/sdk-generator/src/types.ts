/**
 * SDK Generator Types
 * 
 * Core types for analyzing Express routes and generating TypeScript SDK
 */

export interface RouteInfo {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: string;
  middleware: string[];
  parameters: RouteParameter[];
  requestBody?: TypeInfo;
  responseType?: TypeInfo;
  description?: string;
  tags: string[];
  security?: SecurityRequirement[];
  deprecated?: boolean;
}

export interface RouteParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  type: string;
  required: boolean;
  description?: string;
  schema?: any;
}

export interface TypeInfo {
  name: string;
  type: string;
  properties?: Record<string, TypeInfo>;
  items?: TypeInfo;
  required?: string[];
  enum?: string[];
  description?: string;
}

export interface SecurityRequirement {
  type: 'bearer' | 'apiKey' | 'oauth2' | 'basic';
  name: string;
  in?: 'header' | 'query' | 'cookie';
  flows?: any;
}

export interface ServiceInfo {
  name: string;
  basePath: string;
  version: string;
  description: string;
  routes: RouteInfo[];
  types: TypeInfo[];
  tags: string[];
}

export interface SDKGeneratorConfig {
  services: {
    [serviceName: string]: {
      path: string;
      basePath: string;
      include?: string[];
      exclude?: string[];
    };
  };
  output: {
    directory: string;
    filename: string;
    format: 'typescript' | 'javascript';
  };
  templates: {
    client?: string;
    types?: string;
    service?: string;
  };
  options: {
    includeTypes: boolean;
    includeValidation: boolean;
    includeAuth: boolean;
    useAxios: boolean;
    useFetch: boolean;
    generateDocs: boolean;
    minify: boolean;
  };
}

export interface GeneratedSDK {
  client: string;
  types: string;
  services: Record<string, string>;
  docs?: string;
  metadata: {
    generatedAt: Date;
    version: string;
    services: string[];
    totalRoutes: number;
  };
}

export interface RouteAnalyzerOptions {
  includeMiddleware: boolean;
  extractTypes: boolean;
  followImports: boolean;
  includeInternal: boolean;
}

export interface CodeGeneratorOptions {
  template: 'default' | 'axios' | 'fetch' | 'custom';
  includeComments: boolean;
  includeValidation: boolean;
  includeAuth: boolean;
  outputFormat: 'esm' | 'cjs' | 'umd';
  minify: boolean;
  prettier: boolean;
}

export interface MiddlewareInfo {
  name: string;
  type: 'auth' | 'validation' | 'rate-limit' | 'cors' | 'custom';
  config?: any;
  required: boolean;
}

export interface ValidationSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, Record<string, any>>;
  components: {
    schemas: Record<string, any>;
    securitySchemes: Record<string, any>;
  };
  tags: Array<{
    name: string;
    description: string;
  }>;
  security?: Array<Record<string, any>>;
} 