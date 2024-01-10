import * as path from "path";
import * as fs from "fs";
import md5 from "md5";
import { TAbstractFile, TFile, TFolder, htmlToMarkdown } from "obsidian";

import {
	ATTACHMENT_URL_REGEXP,
	MARKDOWN_ATTACHMENT_URL_REGEXP,
	EMBED_URL_REGEXP,
	GFM_IMAGE_FORMAT,
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
	outputFormat = "markdown",
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
	outputFormat = "markdown"
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
	contentPath: string
) {
	try {
		await plugin.app.vault.adapter
			.read(contentPath)
			.then(async (content) => {
				const imageLinks = await getImageLinks(content);
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

					const imageLinkMd5 = md5(imageLink);
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

					const targetPath = path
						.join(
							plugin.settings.output,
							plugin.settings.attachment,
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

export async function tryCopyMarkdownByRead(
	plugin: MarkdownExportPlugin,
	{ file, outputFormat, outputSubPath = "." }: CopyMarkdownOptions
) {
	try {
		await plugin.app.vault.adapter.read(file.path).then(async (content) => {
			const imageLinks = await getImageLinks(content);
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
				const imageLinkMd5 = md5(imageLink);
				const imageExt = path.extname(imageLink);
				// Unify the link separator in obsidian as a forward slash instead of the default back slash in windows, so that the referenced images can be displayed properly

				const clickSubRoute = getClickSubRoute(outputSubPath);

				const hashLink = path
					.join(
						clickSubRoute,
						plugin.settings.attachment,
						imageLinkMd5.concat(imageExt)
					)
					.replace(/\\/g, "/");

				// filter markdown link eg: http://xxx.png
				if (urlEncodedImageLink.startsWith("http")) {
					continue;
				}

				if (plugin.settings.GFM) {
					content = content.replace(
						rawImageLink,
						GFM_IMAGE_FORMAT.format(hashLink)
					);
				} else {
					content = content.replace(urlEncodedImageLink, hashLink);
				}
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

			await tryCopyImage(plugin, file.path);

			const outDir = path.join(plugin.settings.output, outputSubPath);
			await tryCreateFolder(plugin, outDir);

			switch (outputFormat) {
				case "HTML": {
					const targetFile = path.join(
						outDir,
						file.name.replace(".md", ".html")
					);
					const { html } = await markdownToHTML(
						plugin,
						file.path,
						content
					);
					await tryCreate(plugin, targetFile, html);
					break;
				}
				case "markdown": {
					const targetFile = path.join(outDir, file.name);
					await tryCreate(plugin, targetFile, content);
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
