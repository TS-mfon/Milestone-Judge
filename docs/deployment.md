# Deployment

## Live testnet deployment

- Base Sepolia escrow:
  `0x47F846c659B4DF565d2e8b1cd32F610E68d11B9A`
- Base Sepolia USDC:
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- GenLayer StudioNet verifier:
  `0x4006FA705a70BF9137e7B5d07555b6E547Cae5c5`
- Platform owner and executor:
  `0xEd9EDd8586b20524CafA4F568413C504C9B03172`
- Production application:
  `https://ma-milestone-verifier.vercel.app`
- Base deployment transaction:
  `0x24220d7085bcd98188deb14c38ec8b8c8eec17c204541f73e12e68fad3b5c539`
- GenLayer deployment transaction:
  `0x8bda0c6180df0afe2e59aa7b5d1e374c4c88b79c6185576f96a4e30e307a15fb`
- Base index start block:
  `44728854`

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

## 6. Scored deployment live smoke

The scored production path was exercised on July 28, 2026 with Base event `1`,
milestone `0`, a 1 USDC escrow, and an on-chain minimum score of `80`:

- Base event creation:
  `0xfadc8c5b0c39f10a057592b187c043664a628a337f871a79969cf38b981d82dc`
- Base activation:
  `0x7ceb74307012b5c5ee54202b11817314322b6b2a211c8d3772b77abfe4aba683`
- GenLayer review:
  `review_81f6de8045aa4c7fd0f112b810c1f2d549e3fb7d87771faae543eb435214d1e8`
- GenLayer transaction:
  `0xbbd789ea5154afbec2de1a26a2f3969d6ce600ca344cebacfa26ca1d97c053b1`
- Comparative consensus decision and score:
  `approved`, `95`
- 1Shot task:
  `0xf09e9019dc4856c33c7790a0be84b1f358e066917828df2576afd06cbceb34bd`
- 1Shot-confirmed Base proposal:
  `0x13c3cfdee389722476b2d0db26ed2e2bb40e0b750b2542433d441ba410389f3b`
- Challenge deadline:
  `July 29, 2026 at 08:44:14 UTC`

The milestone remains locked during its challenge window. Once that exact
deadline passes, the payout action can release the 1 USDC milestone once.

## 7. Previous deployment smoke record

The previous contract version was exercised with Base event `1`, milestone `0`.
Those identifiers remain historical and are not part of the scored deployment:

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
