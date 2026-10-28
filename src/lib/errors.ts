/** The message of anything thrown: an `Error`'s message, or the value itself as text. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
