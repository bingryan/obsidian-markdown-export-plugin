import * as path from "path";
import * as fs from "fs";
import md5 from "md5";
import { TAbstractFile, TFile, TFolder, htmlToMarkdown } from "obsidian";

import {
    ATTACHMENT_URL_REGEXP,
    MARKDOWN_ATTACHMENT_URL_REGEXP,
    EMBED_URL_REGEXP,
    EMBED_METADATA_REGEXP,
    GFM_IMAGE_FORMAT,
    OUTGOING_LINK_REGEXP,
    OUTPUT_FORMATS,
    resolvePathVariables,
} from "./config";
import MarkdownExportPlugin from "./main";
import markdownToHTML from "./renderer";

type CopyMarkdownOptions = {
    file: TAbstractFile;
    outputFormat: string;
    outputSubPath: string;
};

export async function getImageLinks(markdown: string) {
    const imageLinks = markdown.matchAll(ATTACHMENT_URL_REGEXP);
    const markdownImageLinks = markdown.matchAll(
        MARKDOWN_ATTACHMENT_URL_REGEXP
    );
    return Array.from(imageLinks).concat(Array.from(markdownImageLinks));
}

export async function getEmbeds(markdown: string) {
    const embeds = markdown.matchAll(EMBED_URL_REGEXP);
    return Array.from(embeds);
}

// get all markdown parameters
export function allMarkdownParams(
    file: TAbstractFile,
    out: Array<CopyMarkdownOptions>,
    outputFormat = OUTPUT_FORMATS.MD,
    outputSubPath = ".",
    parentPath = ""
): Array<CopyMarkdownOptions> {
    try {
        //  dir
        if (!(<TFile>file).extension) {
            for (const absFile of (<TFolder>file).children) {
                if (!(<TFile>absFile).extension) {
                    const extname = absFile.path
                        .replace(file.path, "")
                        .slice(1);
                    const outputSubPath = path.join(parentPath, extname);
                    allMarkdownParams(
                        absFile,
                        out,
                        outputFormat,
                        outputSubPath,
                        outputSubPath
                    );
                } else {
                    out.push({
                        file: absFile,
                        outputFormat,
                        outputSubPath,
                    });
                }
            }
        } else {
            out.push({
                file,
                outputFormat,
                outputSubPath,
            });
        }
    } catch (e) {
        console.warn("Path Error:" + parentPath);
    }
    return out;
}

export async function tryRun(
    plugin: MarkdownExportPlugin,
    file: TAbstractFile,
    outputFormat = OUTPUT_FORMATS.MD
) {
    // recursive functions are not suitable for this case
    // if ((<TFile>file).extension) {
    // 	return new Promise((resolve) => {
    // 		setTimeout(
    // 			() =>
    // 				resolve(tryCopyMarkdownByRead(plugin, file, outputSubPath)),
    // 			1000
    // 		);
    // 	});
    // }

    try {
        const params = allMarkdownParams(file, [], outputFormat);
        for (const param of params) {
            await tryCopyMarkdownByRead(plugin, param);
        }
    } catch (error) {
        if (!error.message.contains("file already exists")) {
            throw error;
        }
    }
}

export function getResourceOsPath(
    plugin: MarkdownExportPlugin,
    resouorce: TFile | null
): string {
    if (resouorce === null) {
        return ".";
    }
    const appPath = plugin.app.vault.getResourcePath(resouorce);

    const match = appPath.match(/app:\/\/(.*?)\//);
    if (match) {
        const hash = match[1];
        const result = appPath
            .replace(`app://${hash}/`, process.platform === "win32" ? "" : "/")
            .split("?")[0];
        return decodeURIComponent(result);
    }
    return ".";
}

/**
 *
 * @param path a/b/c.md
 * @returns click path: unix: ../../ or windows(default): ../../, but need: ../
 */
export function getClickSubRoute(p: string, sep = "/"): string {
    if (p === ".") {
        return "";
    }
    const parentLevels = p.split(sep).length;
    const parentRoute = ".." + sep;

    return parentRoute.repeat(parentLevels);
}

export function fileExists(path: string): boolean {
    try {
        return fs.statSync(path).isFile();
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        } else {
            throw error;
        }
    }
}

/**
 *  try create folder
 * @param plugin
 * @param p path to create
 */
export async function tryCreateFolder(plugin: MarkdownExportPlugin, p: string) {
    try {
        if (p.startsWith("/") || path.win32.isAbsolute(p)) {
            fs.mkdirSync(p, { recursive: true });
        } else {
            await plugin.app.vault.createFolder(p);
        }
    } catch (error) {
        if (!error.message.contains("Folder already exists")) {
            throw error;
        }
    }
}

/**
 * try create file
 * @param plugin
 * @param p path to create
 * @param data
 */
export async function tryCreate(
    plugin: MarkdownExportPlugin,
    p: string,
    data: string
) {
    try {
        if (p.startsWith("/") || path.win32.isAbsolute(p)) {
            fs.writeFileSync(p, data);
        } else {
            await plugin.app.vault.create(p, data);
        }
    } catch (error) {
        if (!error.message.contains("file already exists")) {
            throw error;
        }
    }
}

export async function tryCopyImage(
    plugin: MarkdownExportPlugin,
    filename: string,
    contentPath: string
) {
    try {
        await plugin.app.vault.adapter
            .read(contentPath)
            .then(async (content) => {
                const imageLinks = await getImageLinks(content);
                // 获取 vault 名称用于变量替换
                const vaultName = plugin.app.vault.getName();
                // 获取文件名（去掉扩展名）用于变量替换
                const fileNameWithoutExt = filename.replace(/\.[^/.]+$/, "");
                
                for (const index in imageLinks) {
                    const urlEncodedImageLink =
                        imageLinks[index][7 - imageLinks[index].length];

                    // decode and replace the relative path
                    let imageLink = decodeURI(urlEncodedImageLink).replace(
                        /\.\.\//g,
                        ""
                    );
                    if (imageLink.contains("|")) {
                        imageLink = imageLink.split("|")[0];
                    }

                    const fileName = path.parse(path.basename(imageLink)).name;
                    const imageLinkMd5 = plugin.settings.fileNameEncode
                        ? md5(imageLink)
                        : fileName;
                    const imageExt = path.extname(imageLink);
                    const ifile = plugin.app.metadataCache.getFirstLinkpathDest(
                        imageLink,
                        contentPath
                    );

                    const filePath =
                        ifile !== null
                            ? ifile.path
                            : path.join(path.dirname(contentPath), imageLink);

                    // filter markdown link eg: http://xxx.png
                    if (urlEncodedImageLink.startsWith("http")) {
                        continue;
                    }

                    // 解析附件路径中的变量
                    const resolvedAttachPath = resolvePathVariables(
                        plugin.settings.attachment,
                        fileNameWithoutExt,
                        vaultName
                    );

                    const targetPath = path
                        .join(
                            plugin.settings.relAttachPath
                                ? plugin.settings.output
                                : resolvedAttachPath,
                            plugin.settings.includeFileName
                                ? fileNameWithoutExt
                                : "",
                            plugin.settings.relAttachPath
                                ? resolvedAttachPath
                                : "",
                            imageLinkMd5.concat(imageExt)
                        )
                        .replace(/\\/g, "/");

                    try {
                        if (!fileExists(targetPath)) {
                            if (
                                plugin.settings.output.startsWith("/") ||
                                path.win32.isAbsolute(plugin.settings.output)
                            ) {
                                const resourceOsPath = getResourceOsPath(
                                    plugin,
                                    ifile
                                );
                                fs.copyFileSync(resourceOsPath, targetPath);
                            } else {
                                await plugin.app.vault.adapter.copy(
                                    filePath,
                                    targetPath
                                );
                            }
                        }
                    } catch (error) {
                        console.error(
                            `Failed to copy file from ${filePath} to ${targetPath}: ${error.message}`
                        );
                    }
                }
            });
    } catch (error) {
        if (!error.message.contains("file already exists")) {
            throw error;
        }
    }
}

export async function tryCopyMarkdown(
    plugin: MarkdownExportPlugin,
    contentPath: string,
    contentName: string
) {
    try {
        await plugin.app.vault.adapter.copy(
            contentPath,
            path.join(plugin.settings.output, contentName)
        );
    } catch (error) {
        if (!error.message.contains("file already exists")) {
            throw error;
        }
    }
}

export async function getEmbedMap(
    plugin: MarkdownExportPlugin,
    content: string,
    path: string
) {
    // key：link url
    // value： embed content parse from html document
    const embedMap = new Map();
    const embedList = Array.from(
        document.documentElement.getElementsByClassName("internal-embed")
    );

    Array.from(embedList).forEach((el) => {
        // markdown-embed-content markdown-embed-page
        const embedContentHtml = el.getElementsByClassName(
            "markdown-embed-content"
        )[0];

        if (embedContentHtml) {
            let embedValue = htmlToMarkdown(embedContentHtml.innerHTML);
            if (plugin.settings.removeYamlHeader) {
                embedValue = embedValue.replace(EMBED_METADATA_REGEXP, "");
            }
            embedValue =
                "> " +
                (embedValue as string)
                    .replaceAll("# \n\n", "# ")
                    .replaceAll("\n", "\n> ");
            const embedKey = el.getAttribute("src");
            embedMap.set(embedKey, embedValue);
        }
    });

    return embedMap;
}

// Convert Markdown to plain text with specific formatting
export function convertMarkdownToText(
    plugin: MarkdownExportPlugin,
    markdown: string
): string {
    let text = markdown;

    // Replace checkboxes
    // - [ ] becomes ☐
    // - [x] becomes ☑
    text = text.replace(
        /- \[ \]/g,
        plugin.settings.textExportCheckboxUnchecked
    );
    text = text.replace(/- \[x\]/g, plugin.settings.textExportCheckboxChecked);

    // Replace bullet points with specific characters
    // - becomes ●
    //   - becomes ￮
    //     - becomes ￭
    //       - becomes ►
    //         - becomes •
    const lines = text.split("\n");
    const processedLines = lines.map((line) => {
        // Count leading spaces or tabs to determine indentation level
        const leadingWhitespace = line.match(/^(\s*)/)?.[0] || "";

        // Replace bullet points based on indentation level
        if (line.trim().startsWith("- ")) {
            // Remove leading whitespace for processing
            const trimmedLine = line.trim();

            // First, normalize tabs to spaces (1 tab = 4 spaces)
            const normalizedIndent = leadingWhitespace.replace(/\t/g, "    ");
            const indentationLevel = Math.floor(normalizedIndent.length / 4);
            let bulletPointSymbol =
                plugin.settings.textExportBulletPointMap[indentationLevel * 4];

            // If no symbol is configured for this level, use the default mapping
            if (!bulletPointSymbol) {
                // Use the configured symbol for this indentation level, or fall back to defaults
                switch (indentationLevel) {
                    case 0:
                        bulletPointSymbol =
                            plugin.settings.textExportBulletPointMap[0] || "●";
                        break;
                    case 1:
                        bulletPointSymbol =
                            plugin.settings.textExportBulletPointMap[4] || "￮";
                        break;
                    case 2:
                        bulletPointSymbol =
                            plugin.settings.textExportBulletPointMap[8] || "￭";
                        break;
                    case 3:
                        bulletPointSymbol =
                            plugin.settings.textExportBulletPointMap[12] || "►";
                        break;
                    case 4:
                        bulletPointSymbol =
                            plugin.settings.textExportBulletPointMap[16] || "•";
                        break;
                    default: {
                        // For deeper levels, use the last configured symbol or default to "•"
                        const levels = Object.keys(
                            plugin.settings.textExportBulletPointMap
                        )
                            .map(Number)
                            .sort((a, b) => a - b);
                        if (levels.length > 0) {
                            const deepestLevel = levels[levels.length - 1];
                            bulletPointSymbol =
                                plugin.settings.textExportBulletPointMap[
                                    deepestLevel
                                ] || "•";
                        } else {
                            bulletPointSymbol = "•";
                        }
                    }
                }
            }

            return (
                leadingWhitespace +
                bulletPointSymbol +
                " " +
                trimmedLine.slice(2)
            );
        }

        return line;
    });

    return processedLines.join("\n");
}

export async function tryCopyMarkdownByRead(
    plugin: MarkdownExportPlugin,
    { file, outputFormat, outputSubPath = "." }: CopyMarkdownOptions
) {
    try {
        await plugin.app.vault.adapter.read(file.path).then(async (content) => {
            const imageLinks = await getImageLinks(content);
            // 解析变量（用于生成目录与链接）
            const vaultName = plugin.app.vault.getName();
            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            const resolvedAttachPath = resolvePathVariables(
                plugin.settings.attachment,
                fileNameWithoutExt,
                vaultName
            );
            const resolvedCustomAttachPath = plugin.settings.customAttachPath
                ? resolvePathVariables(
                      plugin.settings.customAttachPath,
                      fileNameWithoutExt,
                      vaultName
                  )
                : plugin.settings.customAttachPath;

            if (imageLinks.length > 0) {
                await tryCreateFolder(
                    plugin,
                    path.join(
                        plugin.settings.relAttachPath
                            ? plugin.settings.output
                            : resolvedAttachPath,
                        plugin.settings.includeFileName
                            ? file.name.replace(".md", "")
                            : "",
                        plugin.settings.relAttachPath
                            ? resolvedAttachPath
                            : ""
                    )
                );
            }

            for (const index in imageLinks) {
                const rawImageLink = imageLinks[index][0];

                const urlEncodedImageLink =
                    imageLinks[index][7 - imageLinks[index].length];

                // decode and replace the relative path
                let imageLink = decodeURI(urlEncodedImageLink).replace(
                    /\.\.\//g,
                    ""
                );
                // link: https://help.obsidian.md/Linking+notes+and+files/Embedding+files#Embed+an+image+in+a+note
                // issue: #44 -> figure checkout: ![[name|figure]]
                if (imageLink.contains("|")) {
                    imageLink = imageLink.split("|")[0];
                }
                const fileName = path.parse(path.basename(imageLink)).name;
                const imageLinkMd5 = plugin.settings.fileNameEncode
                    ? md5(imageLink)
                    : encodeURI(fileName);
                const imageExt = path.extname(imageLink);
                // Unify the link separator in obsidian as a forward slash instead of the default back slash in windows, so that the referenced images can be displayed properly

                const clickSubRoute = getClickSubRoute(outputSubPath);

                const baseAttachPath = plugin.settings.relAttachPath
                    ? resolvedAttachPath
                    : path.join(
                          resolvedCustomAttachPath
                              ? resolvedCustomAttachPath
                              : resolvedAttachPath,
                          plugin.settings.includeFileName
                              ? file.name.replace(".md", "")
                              : ""
                      );

                const hashLink = path
                    .join(clickSubRoute, baseAttachPath, imageLinkMd5.concat(imageExt))
                    .replace(/\\/g, "/");

                // filter markdown link eg: http://xxx.png
                if (urlEncodedImageLink.startsWith("http")) {
                    continue;
                }

                if (plugin.settings.displayImageAsHtml) {
                    const { width = null, height = null } =
                        imageLinks[index]?.groups || {};
                    const style =
                        width && height
                            ? ` style='width: {${width}}px; height: ${height}px;'`
                            : width
                            ? ` style='width: ${width}px;'`
                            : height
                            ? ` style='height: ${height}px;'`
                            : "";

                    content = content.replace(
                        rawImageLink,
                        `<img src="${hashLink}"${style} />`
                    );
                } else if (plugin.settings.GFM) {
                    content = content.replace(
                        rawImageLink,
                        GFM_IMAGE_FORMAT.format(hashLink)
                    );
                } else {
                    content = content.replace(urlEncodedImageLink, hashLink);
                }
            }

            if (plugin.settings.removeOutgoingLinkBrackets) {
                content = content.replaceAll(OUTGOING_LINK_REGEXP, "$1");
            }

            if (plugin.settings.convertWikiLinksToMarkdown) {
                content = content.replace(
                    /\[\[(.*?)\]\]/g,
                    (match, linkText) => {
                        const encodedLink = encodeURIComponent(linkText);
                        return `[${linkText}](${encodedLink})`;
                    }
                );
            }

            const cfile = plugin.app.workspace.getActiveFile();
            if (cfile != undefined) {
                const embedMap = await getEmbedMap(plugin, content, cfile.path);
                const embeds = await getEmbeds(content);
                for (const index in embeds) {
                    const url = embeds[index][1];
                    content = content.replace(
                        embeds[index][0],
                        embedMap.get(url)
                    );
                }
            }

            await tryCopyImage(plugin, file.name, file.path);

            // If the user has a custom filename set, we enforce subdirectories to
            // prevent rendered files from overwriting each other
            const outDir = path.join(
                plugin.settings.output,
                plugin.settings.customFileName != "" ||
                    (plugin.settings.includeFileName &&
                        plugin.settings.relAttachPath)
                    ? file.name.replace(".md", "")
                    : "",
                outputSubPath
            );

            await tryCreateFolder(plugin, outDir);

            switch (outputFormat) {
                case OUTPUT_FORMATS.HTML: {
                    let filename;
                    if (plugin.settings.customFileName) {
                        filename = plugin.settings.customFileName + ".md";
                    } else {
                        filename = file.name;
                    }
                    const targetFile = path.join(
                        outDir,
                        filename.replace(".md", ".html")
                    );
                    const { html } = await markdownToHTML(
                        plugin,
                        file.path,
                        content
                    );
                    await tryCreate(plugin, targetFile, html);
                    break;
                }
                case OUTPUT_FORMATS.MD: {
                    let filename;
                    if (plugin.settings.customFileName) {
                        filename = plugin.settings.customFileName + ".md";
                    } else {
                        filename = file.name;
                    }
                    const targetFile = path.join(outDir, filename);
                    await tryCreate(plugin, targetFile, content);
                    break;
                }
                case OUTPUT_FORMATS.TEXT: {
                    let filename;
                    if (plugin.settings.customFileName) {
                        filename = plugin.settings.customFileName + ".md";
                    } else {
                        filename = file.name;
                    }
                    const targetFile = path.join(
                        outDir,
                        filename.replace(".md", ".txt")
                    );
                    const textContent = convertMarkdownToText(plugin, content);
                    await tryCreate(plugin, targetFile, textContent);
                    break;
                }
            }
        });
    } catch (error) {
        if (!error.message.contains("file already exists")) {
            throw error;
        }
    }
}
