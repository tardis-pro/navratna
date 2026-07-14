type FetchFunction = typeof globalThis.fetch;

type ProxyFetchOptions = RequestInit & {
  proxy: string;
};

export function createProxyFetch(nativeFetch: FetchFunction, proxyUrl: string): FetchFunction {
  return (input: Parameters<FetchFunction>[0], init?: Parameters<FetchFunction>[1]) => {
    const options: ProxyFetchOptions = { ...init, proxy: proxyUrl };
    return Reflect.apply(nativeFetch, globalThis, [input, options]);
  };
}

export function configureProviderProxyFetch(): void {
  const proxyUrl = process.env['UAIP_EGRESS_PROXY'];
  if (!proxyUrl) return;
  globalThis.fetch = createProxyFetch(globalThis.fetch, proxyUrl);
}
