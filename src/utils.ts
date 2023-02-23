import * as path from "path";
import md5 from "md5";
import { TAbstractFile, TFile, TFolder, htmlToMarkdown } from "obsidian";

import {
	ATTACHMENT_URL_REGEXP,
	MARKDOWN_ATTACHMENT_URL_REGEXP,
	EMBED_URL_REGEXP,
	GMT_IMAGE_FORMAT,
} from "./config";
import MarkdownExportPlugin from "./main";

type CopyMarkdownOptions = {
	file: TAbstractFile;
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
						outputSubPath,
						outputSubPath
					);
				} else {
					out.push({
						file: absFile,
						outputSubPath,
					});
				}
			}
		} else {
			out.push({
				file,
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
	file: TAbstractFile
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
		const params = allMarkdownParams(file, []);
		for (const param of params) {
			await tryCopyMarkdownByRead(plugin, param);
		}
	} catch (error) {
		if (!error.message.contains("file already exists")) {
			throw error;
		}
	}
}

export async function tryCreateFolder(
	plugin: MarkdownExportPlugin,
	path: string
) {
	try {
		await plugin.app.vault.createFolder(path);
	} catch (error) {
		if (!error.message.contains("Folder already exists")) {
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
					const imageLink =
						imageLinks[index][imageLinks[index].length - 3];

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

					plugin.app.vault.adapter
						.copy(
							filePath,
							path.join(
								plugin.settings.output,
								plugin.settings.attachment,
								imageLinkMd5.concat(imageExt)
							)
						)
						.catch((error) => {
							if (
								!error.message.contains("file already exists")
							) {
								throw error;
							}
						});
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
	{ file, outputSubPath = "." }: CopyMarkdownOptions
) {
	try {
		await plugin.app.vault.adapter.read(file.path).then(async (content) => {
			const imageLinks = await getImageLinks(content);

			for (const index in imageLinks) {
				const rawImageLink = imageLinks[index][0];
				const imageLink =
					imageLinks[index][imageLinks[index].length - 3];
				const imageLinkMd5 = md5(imageLink);
				const imageExt = path.extname(imageLink);
				// Unify the link separator in obsidian as a forward slash instead of the default back slash in windows, so that the referenced images can be displayed properly
				const hashLink = path
					.join(
						plugin.settings.attachment,
						imageLinkMd5.concat(imageExt)
					)
					.replace("\\", "/");

				if (plugin.settings.GTM) {
					content = content.replace(
						rawImageLink,
						GMT_IMAGE_FORMAT.format(hashLink)
					);
				} else {
					content = content.replace(imageLink, hashLink);
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
			await tryCreateFolder(
				plugin,
				path.join(plugin.settings.output, outputSubPath)
			);

			plugin.app.vault.adapter.write(
				path.join(plugin.settings.output, outputSubPath, file.name),
				content
			);
		});
	} catch (error) {
		if (!error.message.contains("file already exists")) {
			throw error;
		}
	}
}
