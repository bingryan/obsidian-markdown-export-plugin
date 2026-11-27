export const ATTACHMENT_URL_REGEXP =
    /!\[\[((.*?)\.(\w+))(?:\s*(?<metadata>(?:\|(?<width>\d+%?)(?:[*|x](?<height>\d+%?))?|\\\|(?<escapedWidth>\d+%?)(?:[*|x](?<escapedHeight>\d+%?))?|\|[^\]]*|\\\|[^\]]*|#[^\]]*)))?\]\]/g;

export const MARKDOWN_ATTACHMENT_URL_REGEXP = /!\[(.*?)\]\(((.*?)\.(\w+))\)/g;

export const EMBED_URL_REGEXP = /!\[\[([\s\S]*?)\]\]/g;

export const EMBED_METADATA_REGEXP =
    /^---(?:\n|\r\n)[\s\S]*?(?:\n|\r\n)---(?:\n|\r\n)?/;

// `[[target]]` and `[[target|alias]]`: keep the alias when present, otherwise
// the target. The target is nonempty and cannot contain `|`, so `[[]]` (e.g.
// `const rows = [[]];`) stays intact and only the first pipe can start an
// alias. Backslashes are allowed inside the target (MathJax in headings), and
// the escaped `\|` separator used in tables is consumed as a separator, so
// `[[note\|]]` still exports `note`. Embeds (`![[...]]`) are excluded.
export const OUTGOING_LINK_REGEXP =
    /(?<!!)\[\[(?<target>[^\]|]+?)(?:\\?\|(?<alias>[^\]]*))?\]\]/g;

export enum OUTPUT_FORMATS {
    MD = "Markdown",
    HTML = "HTML",
    TEXT = "Text",
}

export type LineBreakMode = "off" | "br" | "backslash";

export interface MarkdownExportPluginSettings {
    output: string;
    attachment: string;
    displayImageAsHtml: boolean;
    GFM: boolean;
    fileNameEncode: boolean;
    removeOutgoingLinkBrackets: boolean;
    includeFileName: boolean;
    customFileName: string;
    customAttachPath: string;
    relAttachPath: boolean;
    convertWikiLinksToMarkdown: boolean;
    removeYamlHeader: boolean;
    // Single line breaks are rendered by Obsidian but not by plain Markdown
    lineBreakMode: LineBreakMode;
    // Move instead of copy: remove the source note after a successful export
    deleteAfterExport: boolean;
    // Block embed settings
    inlineBlockEmbeds: boolean;
    // Text export settings
    textExportBulletPointMap: Record<number, string>;
    textExportCheckboxUnchecked: string;
    textExportCheckboxChecked: string;
}

export const DEFAULT_SETTINGS: MarkdownExportPluginSettings = {
    output: "output",
    attachment: "attachment",
    displayImageAsHtml: false,
    GFM: true,
    fileNameEncode: true,
    removeOutgoingLinkBrackets: false,
    includeFileName: false,
    customFileName: "",
    customAttachPath: "",
    relAttachPath: true,
    convertWikiLinksToMarkdown: false,
    removeYamlHeader: false,
    lineBreakMode: "off",
    deleteAfterExport: false,
    // Block embed settings
    inlineBlockEmbeds: false,
    // Text export settings
    textExportBulletPointMap: {
        0: "●",
        4: "￮",
        8: "￭",
        12: "►",
        16: "•"
    },
    textExportCheckboxUnchecked: "☐",
    textExportCheckboxChecked: "☑"
};

/**
 * Replaces every occurrence of `search` with `replacement`, both taken
 * literally. `String.replace` would expand $-patterns in the replacement
 * ($$, $&, $`, $'), which corrupts content such as `$$` display math.
 */
export function replaceAllLiteral(
    text: string,
    search: string,
    replacement: string
): string {
    if (!search) {
        return text;
    }
    return text.split(search).join(replacement);
}

/**
 * Resolves path template variables
 * Supported variables:
 * {{fileName}} - file name (without extension)
 * {{date}} - current date (YYYY-MM-DD)
 * {{time}} - current time (HH-mm-ss)
 * {{datetime}} - full date-time (YYYY-MM-DD-HH-mm-ss)
 * {{timestamp}} - Unix timestamp
 * {{year}} - year (YYYY)
 * {{month}} - month (MM)
 * {{day}} - day (DD)
 * {{hour}} - hour (HH)
 * {{minute}} - minute (mm)
 * {{second}} - second (ss)
 * {{vaultName}} - vault name
 * 
 * Examples:
 * - "images/{{date}}" → "images/2024-12-06"
 * - "{{fileName}}/images" → "my-note/images"
 * - "attachments/{{year}}/{{month}}" → "attachments/2024/12"
 */
export function resolvePathVariables(
    pathTemplate: string,
    fileName = "",
    vaultName = ""
): string {
    const now = new Date();
    const pad = (num: number, len = 2) => String(num).padStart(len, "0");
    const variables: Record<string, string> = {
        fileName: fileName.replace(/\.[^/.]+$/, "").replace(/[/\\]/g, ""),
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        time: `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`,
        datetime: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`,
        timestamp: String(now.getTime()),
        year: String(now.getFullYear()),
        month: pad(now.getMonth() + 1),
        day: pad(now.getDate()),
        hour: pad(now.getHours()),
        minute: pad(now.getMinutes()),
        second: pad(now.getSeconds()),
        vaultName: vaultName,
    };
    let result = pathTemplate;
    for (const [key, value] of Object.entries(variables)) {
        result = replaceAllLiteral(result, `{{${key}}}`, value);
    }
    return result;
}
