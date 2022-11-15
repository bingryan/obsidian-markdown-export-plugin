export const IMAGE_URL_REGEXP = /!\[\[(.*?)\]\]/g;

export interface MarkdownExportPluginSettings {
	output: string;
	attachment: string;
}

export const DEFAULT_SETTINGS: MarkdownExportPluginSettings = {
	output: "output",
	attachment: "attachment",
};
