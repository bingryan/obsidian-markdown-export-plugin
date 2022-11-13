import { App, Editor, MarkdownView, Modal, MenuItem,Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { MarkdownExportPluginSettings,DEFAULT_SETTINGS } from './config';


export default class MarkdownExportPlugin extends Plugin {
	settings: MarkdownExportPluginSettings;

	async onload() {
		
		await this.loadSettings();


		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new MarkdownExportSettingTab(this.app, this));


		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
			  const addMenuItem = (item: MenuItem) => {
				item.setTitle('Export all to package');
				item.onClick(() => {
					// TODO: file export logic
					new Notice('This is a notice!');
				});
			  };
	  

			  menu.addItem(addMenuItem);

			}),
		  );
	
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Markdown Export'});

		new Setting(containerEl)
			.setName('Custom default output path')
			.setDesc('default directory for one-click export')
			.addText(text => text
				.setPlaceholder('Enter default output path')
				.setValue(this.plugin.settings.output)
				.onChange(async (value) => {
					console.log('output path: ' + value);
					this.plugin.settings.output = value;
					await this.plugin.saveSettings();
				}));
	}
}
