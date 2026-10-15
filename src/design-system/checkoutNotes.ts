export const MAX_ORDER_NOTES_LENGTH = 500;
export const CONTACTLESS_NOTE = 'Contactless delivery requested.';
export const MAX_CONTACTLESS_INSTRUCTIONS_LENGTH =
  MAX_ORDER_NOTES_LENGTH - CONTACTLESS_NOTE.length - 1;

export function buildCheckoutNotes(instructions: string, contactless: boolean): string {
  const trimmedInstructions = instructions.trim();
  return [contactless ? CONTACTLESS_NOTE : '', trimmedInstructions]
    .filter(Boolean)
    .join(' ');
}
