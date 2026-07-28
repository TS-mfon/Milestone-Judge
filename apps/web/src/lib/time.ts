export function unixSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function uniqueAttemptId() {
  return Date.now();
}
