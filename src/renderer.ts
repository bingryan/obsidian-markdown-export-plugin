import * as path from 'path';
import { MarkdownRenderer, MarkdownView } from 'obsidian';
import MarkdownExportPlugin from "./main";

export default async function markdownToHTML(plugin: MarkdownExportPlugin, inputFile: string, inputContent: string) {
	// @ts-ignore
	let activeView = app.workspace.getActiveViewOfType(MarkdownView);
	// @ts-ignore
	const leaf = app.workspace.getLeaf(true);
	if (!activeView) {
		activeView = new MarkdownView(leaf);
	}

	const wrapper = document.createElement('div');
	wrapper.style.display = 'hidden';
	document.body.appendChild(wrapper);

	await MarkdownRenderer.renderMarkdown(inputContent, wrapper, path.dirname(inputFile), activeView);

	const html = wrapper.innerHTML;
	document.body.removeChild(wrapper);
	leaf.detach();
	return { html };
}
