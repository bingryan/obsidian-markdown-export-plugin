# Advanced Export Features

This document explains the newly added advanced export functionalities for the Obsidian Markdown Export Plugin.

## Overview

The recursive export feature allows the plugin to automatically follow internal links in markdown files and export all referenced files together. This ensures that the exported content maintains its link structure and prevents broken links in the exported files.

## Key Features

### Recursive Export Feature

#### 1. Recursive Link Following
- When enabled, the plugin scans each exported markdown file for internal links (`[[link]]` format)
- It automatically identifies and exports all linked markdown files
- The process continues recursively through all discovered links

#### 2. Circular Reference Prevention
- Uses a `Set<string>` to track processed files and avoid infinite loops
- Each file path is marked as processed before being exported
- Prevents re-processing of already exported files

#### 3. Clean Export Structure
- All recursively exported files are placed in the main export directory
- Attachments are consolidated in the attachment folder within the main export directory
- Links are adjusted to point to the correct file locations in the export

#### 4. Link Path Adjustment
- In recursive mode, wikilinks are adjusted to remove path separators
- Links point to the filename only (since all files are in the same export directory)
- Maintains compatibility with both wikilink and markdown link formats

### Export All Attachments Feature

#### 1. Comprehensive File Export
- Exports all linked files, not just images
- Includes PDFs, documents, archives, and other file types
- Works with both `[[file.pdf]]` and `![[file.pdf]]` syntax

#### 2. Smart File Type Detection
- Automatically detects and handles different file extensions
- Excludes already-processed images (handled by existing image export)
- Excludes markdown files (handled by recursive export if enabled)
- Skips HTTP/external links

#### 3. Unified Attachment Management
- All attachment types are placed in the same attachment directory
- Uses consistent file naming (MD5 hash or original name based on settings)
- Maintains file extension integrity

## Configuration

### New Settings in Advanced Export Settings

#### 1. Recursive Export
- **Type**: Toggle (boolean)
- **Default**: `false` (disabled)
- **Description**: "If enabled, all linked markdown files will be exported recursively. This will follow internal links and export referenced files to avoid broken links. Circular references are automatically detected and prevented."

#### 2. Export All Attachments  
- **Type**: Toggle (boolean)
- **Default**: `false` (disabled)
- **Description**: "If enabled, all linked files will be exported, including non-image attachments like PDFs, documents, etc. This applies to both [[file.pdf]] and ![[file.pdf]] syntax."

## Technical Implementation

### Core Algorithm
1. **Root File Context**: The first selected file determines the base export directory name
2. **Unified Output**: All recursively found files are placed in the root file's export directory
3. **Attachment Consolidation**: All attachments from all files are moved to a single attachment folder within the root directory
4. **Link Resolution**: Internal links are adjusted to work with the flattened structure

### New Functions
1. `getOutgoingLinks(markdown: string)` - Extracts all outgoing wikilinks from markdown content
2. `getAllFileLinks(markdown: string)` - Extracts all file links (both `![[]]` and `[[]]`) for any file type
3. `processFilesRecursively()` - Main recursive processing function that handles:
   - File processing queue management
   - Circular reference detection
   - Link resolution and file discovery
   - **Root file context preservation**
4. `tryCopyAllAttachments()` - Handles export of all attachment types (PDFs, documents, etc.)

### Modified Functions
1. `tryRun()` - Enhanced to support both recursive and non-recursive export modes
   - Passes root file context to recursive processing
2. `tryCopyMarkdownByRead()` - Updated to handle output directory structure for recursive exports
   - Uses root file name for directory structure instead of current file name
   - Adjusts attachment paths to point to consolidated attachment folder
   - **Added support for all attachment types when enabled**
3. `tryCopyImage()` - Modified to consolidate all attachments in root file's attachment folder
4. Link processing logic - Adjusted to handle path resolution in recursive mode

### Root File Context Flow
```
User selects file/folder → tryRun() 
    ↓
Identifies root file (first file in selection)
    ↓
processFilesRecursively(rootFile) 
    ↓
All subsequent files use rootFile for:
    - Output directory naming
    - Attachment folder location
    - Link path calculation
```

## Usage

### Basic Usage
1. Open the plugin settings in Obsidian
2. Navigate to "Advanced Export Settings"
3. Configure the desired features:
   - **Recursive Export**: Enable to follow markdown links recursively
   - **Export All Attachments**: Enable to export all file types (PDFs, docs, etc.)
4. Export any markdown file or folder as usual
5. All configured content will be automatically included in the export

### Export All Attachments Examples

**Without Export All Attachments (Default):**
- `![[image.png]]` → ✅ Exported (image)
- `[[document.pdf]]` → ❌ Not exported (non-image file)
- `![[presentation.pptx]]` → ❌ Not exported (non-image file)

**With Export All Attachments Enabled:**
- `![[image.png]]` → ✅ Exported (image)
- `[[document.pdf]]` → ✅ Exported (PDF document)
- `![[presentation.pptx]]` → ✅ Exported (PowerPoint file)
- `[[data.xlsx]]` → ✅ Exported (Excel file)
- `![[archive.zip]]` → ✅ Exported (archive file)

## Benefits

- **Complete Export**: Ensures all referenced content is included
- **No Broken Links**: Maintains link integrity in the exported files
- **Clean Organization**: All files are consolidated in a single export directory
- **Safe Processing**: Prevents infinite loops from circular references
- **Flexible**: Can be enabled/disabled based on user needs

## File Structure Example

**Before Export (Vault Structure):**
```
vault/
├── folder1/
│   ├── noteA.md (links to noteB.md, noteC.md, and contains ![[report.pdf]])
│   └── attachments/
│       ├── imageA.png
│       ├── imageA2.jpg
│       └── report.pdf
├── folder2/
│   ├── noteB.md (links to noteC.md and contains [[data.xlsx]])
│   ├── attachments/
│   │   ├── imageB.png
│   │   └── data.xlsx
│   └── noteC.md (contains ![[presentation.pptx]])
│       └── attachments/
│           ├── imageC.gif
│           └── presentation.pptx
└── folder3/
    └── noteD.md (not linked)
```

**After Export with Both Features Enabled (when exporting noteA.md):**
```
output/
├── noteA/                    # Root folder named after the first selected file
│   ├── noteA.md              # Original file
│   ├── noteB.md              # Recursively exported file
│   ├── noteC.md              # Recursively exported file
│   └── attachment/           # All attachments in one folder
│       ├── imageA.png        # Images (always exported)
│       ├── imageA2.jpg       # Images (always exported)  
│       ├── imageB.png        # Images (always exported)
│       ├── imageC.gif        # Images (always exported)
│       ├── report.pdf        # PDF (exported due to Export All Attachments)
│       ├── data.xlsx         # Excel (exported due to Export All Attachments)
│       └── presentation.pptx # PowerPoint (exported due to Export All Attachments)
```

**Key Points:**
- All markdown files go into the folder named after the **first selected file** (noteA)
- All attachments from all files are consolidated into **one attachment folder**
- Links in exported files are adjusted to point to the correct locations
- `noteD.md` is not included because it's not linked from the exported files
- The structure is clean and self-contained