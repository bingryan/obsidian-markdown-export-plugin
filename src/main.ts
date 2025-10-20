import {
    App,
    Menu,
    MenuItem,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TAbstractFile,
    TFolder,
} from "obsidian";
import * as path from "path";

import {
    MarkdownExportPluginSettings,
    DEFAULT_SETTINGS,
    OUTPUT_FORMATS,
} from "./config";
import { tryRun } from "./utils";

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

        for (const outputFormat of [
            OUTPUT_FORMATS.MD,
            OUTPUT_FORMATS.HTML,
            OUTPUT_FORMATS.TEXT,
        ]) {
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
        for (const outputFormat of [
            OUTPUT_FORMATS.MD,
            OUTPUT_FORMATS.HTML,
            OUTPUT_FORMATS.TEXT,
        ]) {
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
        // run
        await tryRun(this, file, outputFormat);

        if (file instanceof TFolder) {
            new Notice(
                `Exporting folder ${file.path} to ${path.join(
                    this.settings.output
                )}`
            );
        } else {
            new Notice(
                `Exporting ${file.path} to ${path.join(
                    this.settings.output,
                    this.settings.includeFileName
                        ? file.name.replace(".md", "")
                        : "",
                    file.name
                )}`
            );
        }
    }

    onunload() {}

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

        containerEl.createEl("h1", { text: "Obsidian Markdown Export" });
        containerEl.createEl("p", { text: "Created by " }).createEl("a", {
            text: "bingryan 🤓",
            href: "https://github.com/bingryan",
        });

        containerEl.createEl("h3", { text: "Baisc Setting" });

        new Setting(containerEl)
            .setName("Output Path")
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
            .setName("Attachment Path (optional)")
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
            .setName("Custom Attachment Path")
            .setDesc(
                "Changes an images path in an exported file, rather than use the attachment path. Only applies to unrelative attachments. Useful if your using a static site generator."
            )
            .addText((text) =>
                text
                    .setPlaceholder("Enter attachment path")
                    .setValue(this.plugin.settings.customAttachPath)
                    .onChange(async (value) => {
                        this.plugin.settings.customAttachPath = value;
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
            .setName("Use Html tag <img /> to display image")
            .setDesc(
                "false default, <img /> tag will use the size specified in obsidian."
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.displayImageAsHtml)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.displayImageAsHtml = value;
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

        new Setting(containerEl)
            .setName("Remove brackets for outgoing links")
            .setDesc(
                "false default, if you want to remove the brackets in links, set this to true"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.removeOutgoingLinkBrackets)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.removeOutgoingLinkBrackets = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Create Subdirectory")
            .setDesc(
                "Determines when a subdirectory with the exported file's name gets created"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.includeFileName)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.includeFileName = value;
                        await this.plugin.saveSettings();
                    })
            );
        new Setting(containerEl)
            .setName("Custom Filename")
            .setDesc(
                "update if you want a custom filename, leave off extension"
            )
            .addText((text) =>
                text
                    .setPlaceholder("index")
                    .setValue(this.plugin.settings.customFileName)
                    .onChange(async (value) => {
                        this.plugin.settings.customFileName = value;
                        await this.plugin.saveSettings();
                    })
            );
        new Setting(containerEl)
            .setName("Set Attachment Path as Relative")
            .setDesc(
                "If enabled, the attachment path will be relative to the output."
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.relAttachPath)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.relAttachPath = value;
                        await this.plugin.saveSettings();
                    })
            );
        new Setting(containerEl)
            .setName("Convert WikiLinks to Markdown")
            .setDesc(
                "Automatically convert WikiLink style links to Markdown links"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.convertWikiLinksToMarkdown)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.convertWikiLinksToMarkdown = value;
                        await this.plugin.saveSettings();
                    })
            );
        new Setting(containerEl)
            .setName("Remove YAML Metadata Header")
            .setDesc(
                "If enabled, the YAML metadata header will be removed from embedded files when exporting."
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.removeYamlHeader)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.removeYamlHeader = value;
                        await this.plugin.saveSettings();
                    })
            );

        containerEl.createEl("h3", { text: "Advanced Export Settings" });
        
        new Setting(containerEl)
            .setName("Recursive Export")
            .setDesc(
                "If enabled, all linked markdown files will be exported recursively. This will follow internal links and export referenced files to avoid broken links. Circular references are automatically detected and prevented."
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.recursiveExport)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.recursiveExport = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Export All Attachments")
            .setDesc(
                "If enabled, all linked files will be exported, including non-image attachments like PDFs, documents, etc. This applies to both [[file.pdf]] and ![[file.pdf]] syntax."
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.exportAllAttachments)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.exportAllAttachments = value;
                        await this.plugin.saveSettings();
                    })
            );

        containerEl.createEl("h3", { text: "Export Text Setting" });

        // Bullet point mapping settings
        containerEl.createEl("h6", { text: "Bullet Point Symbols" });
        containerEl.createEl("p", {
            text: "Configure symbols for different indentation levels of bullet points.",
        });

        new Setting(containerEl)
            .setName("Level 0 Bullet Point")
            .setDesc("Symbol for top-level bullet points")
            .addText((text) =>
                text
                    .setPlaceholder("●")
                    .setValue(
                        this.plugin.settings.textExportBulletPointMap[0] || "●"
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.textExportBulletPointMap[0] =
                            value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Level 1 Bullet Point")
            .setDesc("Symbol for first-level indented bullet points (4 spaces)")
            .addText((text) =>
                text
                    .setPlaceholder("￮")
                    .setValue(
                        this.plugin.settings.textExportBulletPointMap[4] || "￮"
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.textExportBulletPointMap[4] =
                            value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Level 2 Bullet Point")
            .setDesc(
                "Symbol for second-level indented bullet points (8 spaces)"
            )
            .addText((text) =>
                text
                    .setPlaceholder("￭")
                    .setValue(
                        this.plugin.settings.textExportBulletPointMap[8] || "￭"
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.textExportBulletPointMap[8] =
                            value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Level 3 Bullet Point")
            .setDesc(
                "Symbol for third-level indented bullet points (12 spaces)"
            )
            .addText((text) =>
                text
                    .setPlaceholder("►")
                    .setValue(
                        this.plugin.settings.textExportBulletPointMap[12] || "►"
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.textExportBulletPointMap[12] =
                            value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Level 4 Bullet Point")
            .setDesc(
                "Symbol for fourth-level indented bullet points (16 spaces)"
            )
            .addText((text) =>
                text
                    .setPlaceholder("•")
                    .setValue(
                        this.plugin.settings.textExportBulletPointMap[16] || "•"
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.textExportBulletPointMap[16] =
                            value;
                        await this.plugin.saveSettings();
                    })
            );

        // Checkbox symbols settings
        containerEl.createEl("h6", { text: "Checkbox Symbols" });
        containerEl.createEl("p", {
            text: "Configure symbols for checkboxes.",
        });

        new Setting(containerEl)
            .setName("Unchecked Checkbox")
            .setDesc("Symbol for unchecked checkboxes")
            .addText((text) =>
                text
                    .setPlaceholder("☐")
                    .setValue(
                        this.plugin.settings.textExportCheckboxUnchecked || "☐"
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.textExportCheckboxUnchecked =
                            value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Checked Checkbox")
            .setDesc("Symbol for checked checkboxes")
            .addText((text) =>
                text
                    .setPlaceholder("☑")
                    .setValue(
                        this.plugin.settings.textExportCheckboxChecked || "☑"
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.textExportCheckboxChecked = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
