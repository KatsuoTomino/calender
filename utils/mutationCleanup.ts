/**
 * Runs irreversible external cleanup only after the durable mutation succeeds.
 */
export async function mutateThenCleanup(
  mutate: () => Promise<boolean>,
  cleanup: () => Promise<void>
): Promise<boolean> {
  const mutationSucceeded = await mutate();
  if (!mutationSucceeded) return false;

  await cleanup();
  return true;
}
