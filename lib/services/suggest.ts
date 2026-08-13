import type { Board, Transaction } from "@/lib/types";

export interface Suggestion {
  boardId: string;
  reason: string;
}

/**
 * Suggests a Board for an untagged transaction.
 *
 * Two honest signals, no guessing: what the user did with this counterparty
 * last time, and a word the Board name shares with the transaction. If neither
 * applies we suggest nothing rather than putting money in the wrong Board.
 */
export function suggestBoard(txn: Transaction, boards: Board[], history: Transaction[]): Suggestion | null {
  if (txn.boardId) return null;

  // 1. Same counterparty, previously filed.
  const priorTag = history.find(
    (t) => t.boardId && t.id !== txn.id && t.counterparty.toLowerCase() === txn.counterparty.toLowerCase(),
  );
  if (priorTag?.boardId && boards.some((b) => b.id === priorTag.boardId)) {
    return { boardId: priorTag.boardId, reason: `You filed ${txn.counterparty} here before` };
  }

  // 2. A Board name word appears in the counterparty or description.
  const haystack = `${txn.counterparty} ${txn.description}`.toLowerCase();
  for (const board of boards) {
    const words = board.name
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3);
    if (words.some((w) => haystack.includes(w))) {
      return { boardId: board.id, reason: `Matches "${board.name}"` };
    }
  }

  return null;
}
