import * as path from "path";
import md5 from "md5";
import { TAbstractFile, TFile, TFolder } from "obsidian";

import { IMAGE_URL_REGEXP, GMT_IMAGE_FORMAT } from "./config";
import MarkdownExportPlugin from "./main";

type CopyMarkdownOptions = {
	file: TAbstractFile;
	outputSubPath: string;
};

export async function getImageLinks(markdown: string) {
	const imageLinks = markdown.matchAll(IMAGE_URL_REGEXP);
	return Array.from(imageLinks);
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
		let params = allMarkdownParams(file, []);
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
					const imageLink = imageLinks[index][1];

					const imageLinkMd5 = md5(imageLink);
					const imageExt = path.extname(imageLink);

					plugin.app.vault.adapter
						.copy(
							path.join(path.dirname(contentPath), imageLink),
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

export async function tryCopyMarkdownByRead(
	plugin: MarkdownExportPlugin,
	{ file, outputSubPath = "." }: CopyMarkdownOptions
) {
	try {
		await plugin.app.vault.adapter.read(file.path).then(async (content) => {
			const imageLinks = await getImageLinks(content);

			for (const index in imageLinks) {
				const rawImageLink = imageLinks[index][0];
				const imageLink = imageLinks[index][1];
				const imageLinkMd5 = md5(imageLink);
				const imageExt = path.extname(imageLink);

				const hashLink = path.join(
					plugin.settings.attachment,
					imageLinkMd5.concat(imageExt)
				);

				if (plugin.settings.GTM) {
					content = content.replace(
						rawImageLink,
						GMT_IMAGE_FORMAT.format(hashLink)
					);
				} else {
					content = content.replace(imageLink, hashLink);
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
