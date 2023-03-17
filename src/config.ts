export const ATTACHMENT_URL_REGEXP = /!\[?\[((.*?)\.(\w+))\]\]?/g;
export const MARKDOWN_ATTACHMENT_URL_REGEXP = /!\[(.*?)\]\(((.*?)\.(\w+))\)/g;
export const EMBED_URL_REGEXP = /!\[\[(.*?)\]\]/g;

export const GMT_IMAGE_FORMAT = "![]({0})";

export interface MarkdownExportPluginSettings {
	output: string;
	attachment: string;
	GTM: boolean;
}

export const DEFAULT_SETTINGS: MarkdownExportPluginSettings = {
	output: "output",
	attachment: "attachment",
	GTM: true,
};
