/**
 * Plan destructive work for a Gカレ-linked todo.
 * App row is always deleted first; Google events are only removed after
 * that mutation is confirmed (imported todos point at original events).
 */
export function planLinkedTodoDelete(input: {
  alsoDeleteFromGoogle: boolean;
  hasGoogleEvent: boolean;
}): {
  requireGoogleAccess: boolean;
  deleteGoogleEvent: boolean;
  clearLinkOnly: boolean;
} {
  const deleteGoogleEvent = input.alsoDeleteFromGoogle && input.hasGoogleEvent;
  return {
    requireGoogleAccess: deleteGoogleEvent,
    deleteGoogleEvent,
    clearLinkOnly: !deleteGoogleEvent,
  };
}
