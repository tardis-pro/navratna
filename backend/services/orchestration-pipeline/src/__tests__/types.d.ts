// Type declarations for Jest mocks to resolve TypeScript compilation issues

declare module '@jest/globals' {
  namespace jest {
    interface MockedFunction<T extends (...args: any[]) => any> {
      mockResolvedValue(value: any): this;
      mockReturnValue(value: any): this;
      mockReturnThis(): this;
    }
  }
}

// Extend Jest function to accept any return type
declare global {
  namespace jest {
    interface MockedFunction<T extends (...args: any[]) => any> {
      mockResolvedValue(value: any): this;
      mockReturnValue(value: any): this;
      mockReturnThis(): this;
    }
  }
}
