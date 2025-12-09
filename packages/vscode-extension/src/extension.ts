import * as vscode from 'vscode';
import { DailySummaryWebview } from './DailySummaryWebview';

export function activate(context: vscode.ExtensionContext) {
	
	const disposable = vscode.commands.registerCommand('logmycode.showDailySummary', () => {
		DailySummaryWebview.createOrShow(context);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
