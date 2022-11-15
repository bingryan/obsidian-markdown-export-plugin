import * as path from "path";
import md5 from "md5";

import { IMAGE_URL_REGEXP, GMT_IMAGE_FORMAT } from "./config";
import MarkdownExportPlugin from "./main";

export async function getImageLinks(markdown: string) {
	const imageLinks = markdown.matchAll(IMAGE_URL_REGEXP);
	return Array.from(imageLinks);
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

					plugin.app.vault.adapter.copy(
						path.join(path.dirname(contentPath), imageLink),
						path.join(
							plugin.settings.output,
							plugin.settings.attachment,
							imageLinkMd5.concat(imageExt)
						)
					);
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
	contentPath: string,
	contentName: string
) {
	try {
		await plugin.app.vault.adapter
			.read(contentPath)
			.then(async (content) => {
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

				plugin.app.vault.adapter.write(
					path.join(plugin.settings.output, contentName),
					content
				);
			});
	} catch (error) {
		if (!error.message.contains("file already exists")) {
			throw error;
		}
	}
}
