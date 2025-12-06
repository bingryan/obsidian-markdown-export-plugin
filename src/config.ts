export const ATTACHMENT_URL_REGEXP =
    /!\[\[((.*?)\.(\w+))(?:\s*\|\s*(?<width>\d+)\s*(?:[*|x]\s*(?<height>\d+))?)?\]\]/g;

export const MARKDOWN_ATTACHMENT_URL_REGEXP = /!\[(.*?)\]\(((.*?)\.(\w+))\)/g;

export const EMBED_URL_REGEXP = /!\[\[([\s\S]*?)\]\]/g;

export const EMBED_METADATA_REGEXP =
    /^---(?:\n|\r\n)[\s\S]*?(?:\n|\r\n)---(?:\n|\r\n)?/;

export const GFM_IMAGE_FORMAT = "![]({0})";

export const OUTGOING_LINK_REGEXP = /(?<!!)\[\[(.*?)\]\]/g;

export enum OUTPUT_FORMATS {
    MD = "Markdown",
    HTML = "HTML",
    TEXT = "Text",
}

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
 * 路径变量替换函数
 * 支持的变量:
 * {{fileName}} - 文件名 (不含扩展名)
 * {{date}} - 当前日期 (YYYY-MM-DD)
 * {{time}} - 当前时间 (HH-mm-ss)
 * {{datetime}} - 完整日期时间 (YYYY-MM-DD-HH-mm-ss)
 * {{timestamp}} - Unix 时间戳
 * {{year}} - 年份 (YYYY)
 * {{month}} - 月份 (MM)
 * {{day}} - 日期 (DD)
 * {{hour}} - 小时 (HH)
 * {{minute}} - 分钟 (mm)
 * {{second}} - 秒 (ss)
 * {{vaultName}} - vault 名称
 * 
 * 示例:
 * - "images/{{date}}" → "images/2024-12-06"
 * - "{{fileName}}/images" → "my-note/images"
 * - "attachments/{{year}}/{{month}}" → "attachments/2024/12"
 */
export function resolvePathVariables(
    pathTemplate: string,
    fileName: string = "",
    vaultName: string = ""
): string {
    const now = new Date();
    
    // 格式化函数
    const pad = (num: number, len: number = 2) => String(num).padStart(len, "0");
    
    const variables: Record<string, string> = {
        fileName: fileName.replace(/\.[^/.]+$/, ""), // 移除扩展名
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
    
    // 替换所有匹配的变量
    let result = pathTemplate;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    
    return result;
}
