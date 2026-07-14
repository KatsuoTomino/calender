export interface DateColorMutationResponse {
  error: unknown | null;
}

export type DateColorMutationRequest = () => PromiseLike<DateColorMutationResponse>;

export interface DateColorMutationResult {
  success: boolean;
  failedStep?: "update" | "cleanup";
  error?: unknown;
}

export async function clearDateColorField(
  updateField: DateColorMutationRequest,
  deleteEmptyRecord: DateColorMutationRequest
): Promise<DateColorMutationResult> {
  const updateResult = await updateField();
  if (updateResult.error) {
    return {
      success: false,
      failedStep: "update",
      error: updateResult.error,
    };
  }

  const cleanupResult = await deleteEmptyRecord();
  if (cleanupResult.error) {
    return {
      success: false,
      failedStep: "cleanup",
      error: cleanupResult.error,
    };
  }

  return { success: true };
}
