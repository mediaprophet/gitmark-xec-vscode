import type { CommitHistoryProvider } from '../tree/CommitHistoryProvider';
import type * as vscode from 'vscode';

export function registerMarkCommitCommand(context: vscode.ExtensionContext, commitHistoryProvider: CommitHistoryProvider): void;
