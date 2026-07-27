# Deployment

## Live testnet deployment

- Base Sepolia escrow:
  `0xc437583f16E613b524F6607d81B628c5e5274f39`
- Base Sepolia USDC:
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- GenLayer StudioNet verifier:
  `0x90A4396b5b9524501181f4ce8d1fBf42C2836d87`
- Platform owner and executor:
  `0xEd9EDd8586b20524CafA4F568413C504C9B03172`
- Production application:
  `https://ma-milestone-verifier.vercel.app`
- Base deployment transaction:
  `0x9551d10b379f032c064fa589423ddbf6393b52c8f846e66bf72763317806e0f6`
- GenLayer deployment transaction:
  `0x152279eed38cec3128448b1bfff0cef36e7e61c6670faf8c6787d3e33b65a55d`

## 1. Platform wallet

Generate one EVM private key outside the application runtime:

```bash
npm run wallet:generate
```

The command writes a gitignored `0600` file. Move the private key into the
deployment secret manager, record only its public address in contract
configuration, and delete the local file. The same account signs GenLayer
review transactions and the authorization used by the 1Shot relayer.

## 2. Base Sepolia

Set:

```bash
export BASE_SEPOLIA_USDC_ADDRESS=0x...
export DEPLOYMENT_OWNER_ADDRESS=0x...
export PLATFORM_EXECUTOR_ADDRESS=0x...
export PRIVATE_KEY=0x...
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

Deploy:

```bash
forge script contracts/base/script/Deploy.s.sol:Deploy \
  --root contracts/base \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  --verify
```

Record the deployed address in `NEXT_PUBLIC_ESCROW_ADDRESS`.

## 3. GenLayer

Configure the GenLayer CLI for StudioNet, then deploy:

```bash
genlayer network set studionet
genlayer deploy \
  --contract contracts/genlayer/milestone_verifier.py \
  --args "$PLATFORM_EXECUTOR_ADDRESS"
```

Inspect the finalized receipt and confirm execution success before recording the
address in `NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS`.

## 4. 1Shot

Set only:

```bash
ONESHOT_API_URL=https://relayer.1shotapi.dev/relayers
```

No 1Shot API key, payment-token setting, or stored authorization list is used.
At request time the adapter calls `relayer_getCapabilities`, selects the
advertised Base Sepolia USDC and fee collector, creates exact-call MetaMask
delegations, signs the EIP-7702 authorization with `PLATFORM_PRIVATE_KEY`,
estimates the fee, and submits through `relayer_send7710Transaction`.

The platform wallet must retain enough Base Sepolia USDC to pay hosted relay
fees.

## 5. Vercel

Import the GitHub repository into Vercel with the repository root as the project
root and add the variables from `.env.example`. Keep only
`PLATFORM_PRIVATE_KEY` server-only. Do not provision a database, queue, cron, or
webhook.

After deployment, verify:

```bash
curl -sS https://YOUR_DOMAIN/api/health
curl -sS https://YOUR_DOMAIN/api/events
```

## 6. Live smoke record

The production path was exercised with Base event `1`, milestone `0`:

- GenLayer review:
  `review_8006e61a889ca10aca8457cee4f1dd7938e85c2e1016428d87c0cfb877ba091b`
- GenLayer transaction:
  `0x2d3e62da38546aa468fed16a63f5907affb2ba7be2ba3f87c24eec590000c5e2`
- Decision: `approved`
- 1Shot task:
  `0x277e558375d4d0585fa09a46ab84ca3bcd2fbc98c86e2cf1caba5d71bc148476`
- Base proposal transaction:
  `0xb6db6144fb26a6172d4478e0bc91fe6a2aae933e1a80c3b6a32321d727152992`
- Challenge deadline: `2026-07-28 03:23:03 UTC`

The smoke milestone remains intentionally unpaid until its on-chain challenge
window expires.
