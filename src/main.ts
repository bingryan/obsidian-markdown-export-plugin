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

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'export-to-markdown',
			name: 'Export to Markdown',
			callback: async () => {
				// try create attachment directory
				await tryCreateFolder(
					this,
					path.join(
						this.settings.output,
						this.settings.attachment
					)
				);

				// run
				// Get the currently opened Obsidian file
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("No active file");
					return;
				}
				await tryRun(this, file, 'markdown');

				new Notice(
					`Exporting ${file.path} to ${path.join(
						this.settings.output,
						file.name
					)}`
				);
			}
		});
	}

	registerDirMenu(menu: Menu, file: TAbstractFile) {
		for (const outputFormat of ['markdown', 'HTML']) {
			const addMenuItem = (item: MenuItem) => {
				item.setTitle(`Export to ${outputFormat}`);
				item.onClick(async () => {
					// try create attachment directory
					await tryCreateFolder(
						this,
						path.join(
							this.settings.output,
							this.settings.attachment
						)
					);

					// run
					await tryRun(this, file, outputFormat);

					new Notice(
						`Exporting ${file.path} to ${path.join(
							this.settings.output,
							file.name
						)}`
					);
				});
			};
			menu.addItem(addMenuItem);
		}
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
			.setDesc("attachment path")
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
					.setValue(this.plugin.settings.GTM)
					.onChange(async (value: boolean) => {
						this.plugin.settings.GTM = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
