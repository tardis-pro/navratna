export function delayWithAbort(ms: number, signal: AbortSignal, cancelMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    const abortHandler = () => {
      clearTimeout(timeout);
      reject(new Error(cancelMessage));
    };
    signal.addEventListener('abort', abortHandler);
    setTimeout(() => {
      signal.removeEventListener('abort', abortHandler);
    }, ms);
  });
}
