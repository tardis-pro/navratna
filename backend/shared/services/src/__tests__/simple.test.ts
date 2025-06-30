describe('Test Setup Verification', () => {
  test('should run basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should have test environment configured', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  test('should be able to mock functions', () => {
    const mockFn = jest.fn();
    mockFn('test');
    expect(mockFn).toHaveBeenCalledWith('test');
  });
});