# Deployment

## Live testnet deployment

- Base Sepolia escrow:
  `0x47F846c659B4DF565d2e8b1cd32F610E68d11B9A`
- Base Sepolia USDC:
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- GenLayer StudioNet verifier:
  `0x4006FA705a70BF9137e7B5d07555b6E547Cae5c5`
- Base owner and settlement executor:
  `0xEd9EDd8586b20524CafA4F568413C504C9B03172`
- GenLayer review signer:
  `0xAb48af420171CAd87b3A8EBa233C8F7ef4805BDb`
- Production application:
  `https://ma-milestone-verifier.vercel.app`
- Base deployment transaction:
  `0x24220d7085bcd98188deb14c38ec8b8c8eec17c204541f73e12e68fad3b5c539`
- GenLayer deployment transaction:
  `0x8bda0c6180df0afe2e59aa7b5d1e374c4c88b79c6185576f96a4e30e307a15fb`
- GenLayer signer rotation transaction:
  `0x7a6ea4d882c9b724ca96c6cf35009761abb19bda7c55d128be58e1ba605800c9`
- Base index start block:
  `44728854`

## 1. Separate service signers

Generate a GenLayer-only signer outside the application runtime:

```bash
PLATFORM_WALLET_OUTPUT=.platform-genlayer-review.local.json \
  npm run wallet:generate
```

The command writes a gitignored `0600` file. Move the private key into the
deployment secret manager, record only its public address in contract
configuration, and delete the local file after rotation.

Keep a different key as the Base `platformExecutor`. That key is used only for
hosted 1Shot settlement authorization and must not be configured as the
GenLayer review signer.

The live verifier signer was rotated on July 28, 2026. The rotation transaction
finalized with successful execution and unanimous comparative consensus.

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
  --args "$GENLAYER_PLATFORM_SIGNER_ADDRESS"
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
delegations, signs the EIP-7702 authorization with `BASE_EXECUTOR_PRIVATE_KEY`,
estimates the fee, and submits through `relayer_send7710Transaction`.

The Base settlement executor must retain enough Base Sepolia USDC to pay hosted relay
fees.

## 5. Vercel

Import the GitHub repository into Vercel with the repository root as the project
root and add the variables from `.env.example`. Keep only
`GENLAYER_PLATFORM_PRIVATE_KEY` and `BASE_EXECUTOR_PRIVATE_KEY` server-only. Do
not provision a database, queue, cron, or webhook.

After deployment, verify:

```bash
curl -sS https://YOUR_DOMAIN/api/health
curl -sS https://YOUR_DOMAIN/api/events
```

## 6. Automatic 10 USDC production payout

The Work Proof milestone for assigned wallet
`0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4` was automatically settled on
July 28, 2026:

- Base event and milestone: `2`, `0`
- GenLayer review:
  `review_0060f4447db06ddb0f328df78f2c139337a423f02566ca5186466ba7cde4f2eb`
- Decision and score: `approved`, `95`
- Funded minimum score: `80`
- Hosted 1Shot payout task:
  `0x8bc7fd3ac61563777920933c4f7718e83b42ba50ea479894dbfb2fa741ce9092`
- Confirmed Base payment transaction:
  `0xac2677505810f749ef6e2a68841b21dbf8530a6aa478032f8ffcc0e2e54d6f55`
- Amount transferred: `10 USDC`
- Paid at: `July 28, 2026 at 10:39:56 UTC`

The receipt contains both the USDC transfer to the funded assignee and the
escrow's `MilestoneReleased` event. Event `2` is now completed, and the payment
appears in the connected wallet's History tab.

## 7. Separated-signer production smoke

The fully separated production path was exercised on July 28, 2026 with Base
event `3`, milestone `0`, a 0.1 USDC escrow, and an on-chain minimum score of
`80`:

- Base event creation:
  `0xe1a8ba91db81d13bf93a0eed181af8c9b3802f833ebe6fdf27e874a84d86f2fb`
- Base milestone addition:
  `0x1ee7ed7a405c50e5857692b322fd647cc11757797157606f767a38b52f260162`
- USDC approval:
  `0x7c623bea4a914e7fb36e789f3aa097bb5b86215e909af8bf25ac561c9ee23f74`
- Base activation:
  `0x1633433380f8ef952415753d3ccc4685357e6cbbcaeb624ac435d6240bf4c20b`
- GenLayer review:
  `review_1ecf30738fac7bdcf5791cf458e5a258f7164401769b6a27462b5471cef0b30a`
- GenLayer transaction:
  `0x6a09dc240bccf9951fa5ed43f94ae559f195b265b13a3aba0f7bd4b6188b5686`
- Comparative consensus decision and score:
  `approved`, `100`
- Hosted 1Shot task:
  `0x1af69dbec078a112c243a4504bfef2550b60a2cc13cadba9a1206bb239a23847`
- 1Shot-confirmed Base proposal:
  `0xbcbe3d95457996771763e5ddcd8888a93f73e68c8e0ee3b52fc847822c7946e8`
- Challenge deadline:
  `July 29, 2026 at 10:03:50 UTC`

The evidence authorization was signed off-chain by the event assignee. Vercel
submitted the review using only the GenLayer signer
`0xAb48af420171CAd87b3A8EBa233C8F7ef4805BDb`; hosted 1Shot submitted the Base
proposal using the separate executor. A repeated initial review returned HTTP
`409` because the milestone was already in its challenge window.

## 8. Scored deployment live smoke

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

## 9. Previous deployment smoke record

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
