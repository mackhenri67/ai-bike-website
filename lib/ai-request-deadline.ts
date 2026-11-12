export class AiDeadlineError extends Error {
  constructor() {
    super("AI request deadline exceeded");
    this.name = "AiDeadlineError";
  }
}

/** Keep auth, catalogue reads, and generation within the route's time budget. */
export async function withAiDeadline<T>(
  work: (signal: AbortSignal, remainingMs: () => number) => Promise<T>,
  milliseconds = 50_000
): Promise<T> {
  const controller = new AbortController();
  const expires = Date.now() + milliseconds;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AiDeadlineError());
      controller.abort(new AiDeadlineError());
    }, milliseconds);
  });
  try {
    return await Promise.race([
      work(controller.signal, () => Math.max(0, expires - Date.now())),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
