export const ATTACHMENT_URL_REGEXP =
	/!\[\[((.*?)\.(\w+))(?:\s*\|\s*(\d+)\s*(?:\*\s*(\d+))?)?\]\]/g;

export const MARKDOWN_ATTACHMENT_URL_REGEXP = /!\[(.*?)\]\(((.*?)\.(\w+))\)/g;

export const EMBED_URL_REGEXP = /!\[\[(.*?)\]\]/g;

export const GFM_IMAGE_FORMAT = "![]({0})";

export interface MarkdownExportPluginSettings {
	output: string;
	attachment: string;
	GFM: boolean;
	fileNameEncode: boolean;
}

export const DEFAULT_SETTINGS: MarkdownExportPluginSettings = {
	output: "output",
	attachment: "attachment",
	GFM: true,
	fileNameEncode: true,
};
