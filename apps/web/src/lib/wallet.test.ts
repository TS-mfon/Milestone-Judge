import { describe, expect, it, vi } from "vitest";
import { switchToBaseSepolia, type Eip1193Provider } from "./wallet";

const targetChain = "0x14a34";

describe("switchToBaseSepolia", () => {
  it("adds Base Sepolia when a wallet reports an unrecognized chain message", async () => {
    let chain = "0x7bb";
    const calls: string[] = [];
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        calls.push(method);
        if (method === "eth_chainId") return chain;
        if (method === "wallet_switchEthereumChain" && chain !== targetChain) {
          if (!calls.includes("wallet_addEthereumChain")) {
            throw { code: -32603, message: 'Unrecognized chain ID "0x14a34".' };
          }
          chain = targetChain;
        }
        return null;
      }),
    };

    await switchToBaseSepolia(provider);
    expect(calls).toEqual([
      "eth_chainId",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
      "eth_chainId",
    ]);
  });

  it("recognizes a nested 4902 provider error", async () => {
    let chain = "0x7bb";
    const provider: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_chainId") return chain;
        if (method === "wallet_switchEthereumChain" && chain !== targetChain) {
          const count = (provider.request as ReturnType<typeof vi.fn>).mock.calls
            .filter(([request]) => request.method === "wallet_switchEthereumChain").length;
          if (count === 1) throw { code: -32603, data: { originalError: { code: 4902 } } };
          chain = targetChain;
        }
        return null;
      }),
    };
    await expect(switchToBaseSepolia(provider)).resolves.toBeUndefined();
  });

  it("does not add a chain after user rejection", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return "0x7bb";
      throw { code: 4001, message: "User rejected the request" };
    });
    await expect(switchToBaseSepolia({ request })).rejects.toMatchObject({ code: 4001 });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
