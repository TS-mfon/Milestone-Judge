import { chmod, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { generatePrivateKey } from "viem/accounts";

const outputName = process.env.PLATFORM_WALLET_OUTPUT || ".platform-wallet.local.json";
if (!/^\.platform-[a-z0-9-]+\.local\.json$/.test(outputName)) {
  throw new Error("PLATFORM_WALLET_OUTPUT must match .platform-<name>.local.json");
}
const output = new URL(`../${outputName}`, import.meta.url);
if (existsSync(output)) {
  throw new Error(".platform-wallet.local.json already exists; refusing to overwrite it");
}

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
await writeFile(
  output,
  `${JSON.stringify(
    {
      address: account.address,
      privateKey,
      createdAt: new Date().toISOString(),
      warning: "Move this key to encrypted deployment secrets and delete this file.",
    },
    null,
    2,
  )}\n`,
);
await chmod(output, 0o600);
console.log(`Platform wallet generated: ${account.address}`);
console.log(`Secret written to ${outputName} with mode 0600.`);
