type ErrorLike = {
  code?: number;
  message?: string;
  shortMessage?: string;
  details?: string;
  cause?: unknown;
};

function findCode(error: unknown): number | undefined {
  let current = error as ErrorLike | undefined;
  while (current) {
    if (typeof current.code === "number") return current.code;
    current = current.cause as ErrorLike | undefined;
  }
}

export function userError(error: unknown, fallback = "The action could not be completed.") {
  const code = findCode(error);
  if (code === 4001) return "The wallet request was rejected.";
  if (code === 4902) return "Base Sepolia is not available in this wallet.";

  const value = error as ErrorLike | undefined;
  const message = value?.shortMessage || value?.details || value?.message || "";
  const normalized = message.toLowerCase();

  if (normalized.includes("current chain") || normalized.includes("chain mismatch")) {
    return "Your wallet is on the wrong network. Switch to Base Sepolia and try again.";
  }
  if (normalized.includes("insufficient funds")) {
    return "The wallet does not have enough Base Sepolia ETH for network fees.";
  }
  if (normalized.includes("transfer amount exceeds balance") || normalized.includes("balance")) {
    return "The wallet does not have enough USDC for this action.";
  }
  if (normalized.includes("scorebelowminimum")) {
    return "The GenLayer score is below this milestone's required payout score.";
  }
  if (normalized.includes("unauthorized")) return "This wallet is not authorized for that action.";
  if (normalized.includes("deadlinepassed")) return "The event deadline has passed.";
  if (normalized.includes("invalidstate")) {
    return "This action is not available in the milestone's current state.";
  }
  if (normalized.includes("user rejected")) return "The wallet request was rejected.";
  if (normalized.includes("1shot")) {
    return "The hosted 1Shot relayer could not accept the settlement. Try again shortly.";
  }
  if (normalized.includes("genlayer")) {
    return message.length < 220 ? message : "GenLayer could not complete the review request.";
  }
  return message && message.length < 220 ? message : fallback;
}

export async function apiError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}
