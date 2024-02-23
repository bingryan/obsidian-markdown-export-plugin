import {
	App,
	Menu,
	MenuItem,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
} from "obsidian";
import * as path from "path";

import { MarkdownExportPluginSettings, DEFAULT_SETTINGS } from "./config";
import { tryCreateFolder, tryRun } from "./utils";

export default class MarkdownExportPlugin extends Plugin {
	settings: MarkdownExportPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new MarkdownExportSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				// dir/file menu
				this.registerDirMenu(menu, file);
				// file menu
				// if ((<TFile>file).extension) {
				// 	const addFileMenuItem = (item: MenuItem) => {
				// 		item.setTitle("Export to HTML");
				// 		item.onClick(async () => {
				// 			new Notice(
				// 				`Export to HTML`
				// 			);
				// 		});
				// 	}
				// 	menu.addItem(addFileMenuItem);
				// }
			})
		);

		for (const outputFormat of ["markdown", "HTML"]) {
			this.addCommand({
				id: "export-to-" + outputFormat,
				name: `Export to ${outputFormat}`,
				callback: async () => {
					const file = this.app.workspace.getActiveFile();
					if (!file) {
						new Notice(`No active file`);
						return;
					}
					this.createFolderAndRun(file, outputFormat);
				},
			});
		}
	}

	registerDirMenu(menu: Menu, file: TAbstractFile) {
		for (const outputFormat of ["markdown", "HTML"]) {
			const addMenuItem = (item: MenuItem) => {
				item.setTitle(`Export to ${outputFormat}`);
				item.onClick(async () => {
					await this.createFolderAndRun(file, outputFormat);
				});
			};
			menu.addItem(addMenuItem);
		}
	}
	private async createFolderAndRun(
		file: TAbstractFile,
		outputFormat: string
	) {
		// try create attachment directory
		await tryCreateFolder(
			this,
			path.join(this.settings.output, this.settings.attachment)
		);

		// run
		await tryRun(this, file, outputFormat);

		new Notice(
			`Exporting ${file.path} to ${path.join(
				this.settings.output,
				file.name
			)}`
		);
	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class MarkdownExportSettingTab extends PluginSettingTab {
	plugin: MarkdownExportPlugin;

	constructor(app: App, plugin: MarkdownExportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Markdown Export" });

		new Setting(containerEl)
			.setName("Custom default output path")
			.setDesc("default directory for one-click export")
			.addText((text) =>
				text
					.setPlaceholder("Enter default output path")
					.setValue(this.plugin.settings.output)
					.onChange(async (value) => {
						this.plugin.settings.output = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Custom attachment path(optional)")
			.setDesc("attachment path, relative to the output path")
			.addText((text) =>
				text
					.setPlaceholder("Enter attachment path")
					.setValue(this.plugin.settings.attachment)
					.onChange(async (value) => {
						this.plugin.settings.attachment = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Use GitHub Flavored Markdown Format")
			.setDesc(
				"The format of markdown is more inclined to choose Github Flavored Markdown"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.GFM)
					.onChange(async (value: boolean) => {
						this.plugin.settings.GFM = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Encode file name")
			.setDesc(
				"true default, if you want to keep the original file name, set this to false"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fileNameEncode)
					.onChange(async (value: boolean) => {
						this.plugin.settings.fileNameEncode = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
