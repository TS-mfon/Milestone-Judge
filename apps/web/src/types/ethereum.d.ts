interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

interface Window {
  ethereum?: EthereumProvider;
}
