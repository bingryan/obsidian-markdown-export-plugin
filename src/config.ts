export const ATTACHMENT_URL_REGEXP =
	/!\[\[((.*?)\.(\w+))(?:\s*\|\s*(?<width>\d+)\s*(?:[*|x]\s*(?<height>\d+))?)?\]\]/g;

export const MARKDOWN_ATTACHMENT_URL_REGEXP = /!\[(.*?)\]\(((.*?)\.(\w+))\)/g;

export const EMBED_URL_REGEXP = /!\[\[(.*?)\]\]/g;

export const GFM_IMAGE_FORMAT = "![]({0})";

export const OUTGOING_LINK_REGEXP = /(?<!!)\[\[(.*?)\]\]/g;

export interface MarkdownExportPluginSettings {
	output: string;
	attachment: string;
	displayImageAsHtml: boolean;
	GFM: boolean;
	fileNameEncode: boolean;
	removeOutgoingLinkBrackets: boolean;
	includeFileName: boolean;
	customFileName: string;
}

export const DEFAULT_SETTINGS: MarkdownExportPluginSettings = {
	output: "output",
	attachment: "attachment",
	displayImageAsHtml: true,
	GFM: true,
	fileNameEncode: true,
	removeOutgoingLinkBrackets: true,
	includeFileName: false,
	customFileName: "",
};
