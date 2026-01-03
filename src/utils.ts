import * as path from "path";
import * as fs from "fs";
import md5 from "md5";
import { TAbstractFile, TFile, TFolder, htmlToMarkdown, CachedMetadata } from "obsidian";

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

/**
 * Get all markdown files that contain a specific tag
 * @param plugin - The plugin instance
 * @param tag - The tag to search for (can be with or without # prefix)
 * @returns Array of TFile objects that contain the tag
 */
export function getFilesWithTag(
    plugin: MarkdownExportPlugin,
    tag: string
): TFile[] {
    // Normalize tag - ensure it starts with #
    const normalizedTag = tag.startsWith("#") ? tag : `#${tag}`;
    const filesWithTag: TFile[] = [];

    // Iterate through all markdown files in the vault
    const markdownFiles = plugin.app.vault.getMarkdownFiles();

    for (const file of markdownFiles) {
        const cache = plugin.app.metadataCache.getFileCache(file);

        if (cache) {
            // Check if the file has the tag in its frontmatter or inline tags
            if (hasTag(cache, normalizedTag)) {
                filesWithTag.push(file);
            }
        }
    }

    return filesWithTag;
}

/**
 * Check if a file's metadata contains a specific tag
 * Supports nested tag matching (e.g., '#blog' matches '#blog/2024')
 * @param cache - The cached metadata for a file
 * @param tag - The tag to search for (with # prefix)
 * @returns True if the file contains the tag
 */
function hasTag(cache: CachedMetadata, tag: string): boolean {
    // Check frontmatter tags
    if (cache.frontmatter && cache.frontmatter.tags) {
        const frontmatterTags = cache.frontmatter.tags;
        if (Array.isArray(frontmatterTags)) {
            for (const t of frontmatterTags) {
                if (typeof t === "string" && tagsMatch(t, tag)) {
                    return true;
                }
            }
        } else if (typeof frontmatterTags === "string") {
            const tags = frontmatterTags.split(",").map((t: string) => t.trim());
            for (const t of tags) {
                if (tagsMatch(t, tag)) {
                    return true;
                }
            }
        }
    }

    // Check inline tags (tags in the body of the document)
    if (cache.tags) {
        for (const tagObj of cache.tags) {
            if (tagObj.tag && tagsMatch(tagObj.tag, tag)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Check if two tags match, supporting nested tag matching
 * @param fileTag - The tag from the file (with or without #)
 * @param searchTag - The tag to search for (always with #)
 * @returns True if the tags match
 */
function tagsMatch(fileTag: string, searchTag: string): boolean {
    // Normalize file tag to ensure it starts with #
    const normalizedFileTag = fileTag.startsWith("#") ? fileTag : `#${fileTag}`;

    // Exact match
    if (normalizedFileTag === searchTag) {
        return true;
    }

    // Nested tag matching: if searching for '#blog', match '#blog/2024'
    // But not the other way around: searching for '#blog/2024' should NOT match '#blog'
    if (normalizedFileTag.startsWith(searchTag + "/")) {
        return true;
    }

    return false;
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

/**
 * Export multiple files to a specific output format
 * @param plugin - The plugin instance
 * @param files - Array of files to export
 * @param outputFormat - The output format (MD, HTML, or TEXT)
 * @returns Object with success and failure counts
 */
export async function tryRunBatch(
    plugin: MarkdownExportPlugin,
    files: TFile[],
    outputFormat = OUTPUT_FORMATS.MD
): Promise<{ success: number; failed: number; errors: string[] }> {
    const result = { success: 0, failed: 0, errors: [] as string[] };

    for (const file of files) {
        try {
            const params = allMarkdownParams(file, [], outputFormat, ".");
            for (const param of params) {
                await tryCopyMarkdownByRead(plugin, param);
            }
            result.success++;
        } catch (error) {
            result.failed++;
            const errorMsg = `Failed to export ${file.path}: ${error.message}`;
            result.errors.push(errorMsg);
            console.error(errorMsg);
        }
    }

    return result;
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
                
                const vaultName = plugin.app.vault.getName();
                
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

/**
 * Extract block content from a file using block reference ID
 */
async function getBlockContent(
    plugin: MarkdownExportPlugin,
    filePath: string,
    blockId: string
): Promise<string | null> {
    try {
        // Get the file metadata
        const file = plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            return null;
        }

        // Read file content and get metadata
        const content = await plugin.app.vault.cachedRead(file);
        const metadata = plugin.app.metadataCache.getFileCache(file);

        if (!metadata || !metadata.blocks) {
            return null;
        }

        // Find the block by ID
        const block = metadata.blocks[blockId];
        if (!block) {
            return null;
        }

        // Extract the block content from the file
        const lines = content.split("\n");
        const startLine = block.position.start.line;
        const endLine = block.position.end.line;

        if (startLine >= lines.length) {
            return null;
        }

        const blockLines = lines.slice(startLine, endLine + 1);
        let blockContent = blockLines.join("\n");

        // Remove the block ID from the content if present at the end
        blockContent = blockContent.replace(/\s*\^([a-zA-Z0-9]+)\s*$/, "");

        return blockContent;
    } catch (error) {
        console.error("Error getting block content:", error);
        return null;
    }
}

/**
 * Parse embed link to extract file path and block reference
 * Examples:
 * - "My Note#^abc123" -> { filePath: "My Note.md", blockId: "abc123" }
 * - "#^abc123" -> { filePath: null, blockId: "abc123" }
 * - "My Note" -> { filePath: "My Note.md", blockId: null }
 */
function parseEmbedLink(embedLink: string, currentPath: string): {
    filePath: string | null;
    blockId: string | null;
    heading: string | null;
} {
    const blockMatch = embedLink.match(/^(.*?)#?\^([a-zA-Z0-9]+)$/);
    if (blockMatch) {
        const [, filePart, blockId] = blockMatch;
        let filePath = filePart;
        if (filePart && filePart.trim()) {
            // Resolve relative path
            const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/"));
            filePath = currentDir ? `${currentDir}/${filePart}` : filePart;
            if (!filePath.endsWith(".md")) {
                filePath += ".md";
            }
        } else {
            filePath = currentPath;
        }
        return { filePath, blockId, heading: null };
    }

    // Check for heading link
    const headingMatch = embedLink.match(/^(.*?)#([^#]+)$/);
    if (headingMatch) {
        const [, filePart, heading] = headingMatch;
        let filePath = filePart || currentPath;
        if (filePart && filePart.trim()) {
            const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/"));
            filePath = currentDir ? `${currentDir}/${filePart}` : filePart;
            if (!filePath.endsWith(".md")) {
                filePath += ".md";
            }
        }
        return { filePath, blockId: null, heading };
    }

    // Regular file link
    if (embedLink.trim()) {
        const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/"));
        let filePath = currentDir ? `${currentDir}/${embedLink}` : embedLink;
        if (!filePath.endsWith(".md")) {
            filePath += ".md";
        }
        return { filePath, blockId: null, heading: null };
    }

    return { filePath: null, blockId: null, heading: null };
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
                    // Helper to format size value - append 'px' only if not a percentage
                    const formatSize = (value: string | null) => {
                        if (!value) return "";
                        return value.includes("%") ? value : `${value}px`;
                    };
                    const style =
                        width && height
                            ? ` style='width: ${formatSize(width)}; height: ${formatSize(height)};'`
                            : width
                            ? ` style='width: ${formatSize(width)};'`
                            : height
                            ? ` style='height: ${formatSize(height)};'`
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

            // Process embeds BEFORE converting WikiLinks to Markdown
            // This ensures block embeds like ![[#^blockid]] are handled correctly
            const cfile = plugin.app.workspace.getActiveFile();
            if (cfile != undefined) {
                const embedMap = await getEmbedMap(plugin, content, cfile.path);
                const embeds = await getEmbeds(content);
                for (const index in embeds) {
                    const embedMatch = embeds[index];
                    const fullMatch = embedMatch[0];
                    const embedLink = embedMatch[1];

                    let replacement = embedMap.get(embedLink);

                    // If not in embedMap and inlineBlockEmbeds is enabled, try to extract block content
                    if (replacement === undefined && plugin.settings.inlineBlockEmbeds) {
                        const parsed = parseEmbedLink(embedLink, cfile.path);
                        if (parsed.blockId && parsed.filePath) {
                            const blockContent = await getBlockContent(
                                plugin,
                                parsed.filePath,
                                parsed.blockId
                            );
                            if (blockContent !== null) {
                                // Format block content as quote block
                                replacement = "> " + blockContent.replace(/\n/g, "\n> ");
                            }
                        }
                    }

                    // Only replace if we found a replacement
                    // This prevents replacing with "undefined"
                    if (replacement !== undefined) {
                        content = content.replace(fullMatch, replacement);
                    }
                }
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
