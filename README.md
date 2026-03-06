# BeData Social Media Miner ⛏️

[![npm version](https://img.shields.io/npm/v/bedata-socmed-miner.svg)](https://www.npmjs.com/package/bedata-socmed-miner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**BeData Social Media Miner** is a high-speed, robust CLI (Command Line Interface) tool designed to extract content data and nested comments from social media platforms. Built with Playwright and Crawlee, it effortlessly bypasses Virtual DOM limitations to extract thousands of comments without data loss.

---

## 🚀 Prerequisites

Make sure you have [Node.js](https://nodejs.org/) (version 16 or higher) installed on your machine. 
No manual cloning or local installation is required—just run it directly via `npx`!

## 💻 Usage

Run the miner directly from your terminal using the following command pattern:

```bash
npx bedata-socmed-miner <platform> <action> <keyword>
```

### Arguments Breakdown:

| Argument   | Description                                      | Example Input                                    |
| :--------- | :----------------------------------------------- | :----------------------------------------------- |
| `platform` | The target social media platform.                | `tiktok`, `instagram` (coming soon)              |
| `action`   | The type of data extraction to perform.          | `search`, `user`, `content`                      |
| `keyword`  | The specific target URL or username.             | `"https://www.tiktok.com/@username/video/123"`   |

### 📌 Command Examples

**1. Scraping TikTok Content & All Comments**
Extracts video/photo metrics along with all comment threads and deeply nested replies.
```bash
npx socmed-miner tiktok scrape "https://www.tiktok.com/@ado1024osenbei/video/7612645005282397461"
```
*(Note: It is highly recommended to wrap the URL in quotes to prevent terminal parsing errors with special characters).*

---

## 📂 Output Structure

The extracted data will be automatically saved in the `results/` directory within your current working folder. The tool dynamically organizes the output into specific subfolders or files based on the action performed.

```text
📁 your-current-directory/
└── 📁 results/
    ├── 📁 tiktok-content-[url]-[timestamp]/      # Generated when scraping specific content
    │   ├── 📄 1_content_details.csv # Video metrics (likes, shares, caption, etc.)
    │   └── 📄 2_comments.csv        # Main comments and nested replies
    ├── 📁 tiktok-user-[username]-[timestamp]/   # Generated when scraping user profiles
    └── 📄 tiktok-search-[query].csv # Generated when scraping search results
```

## ✨ Key Features

* 🚀 **Vacuum Cleaner Mode**: A specialized scrolling algorithm that prevents data loss caused by TikTok's Virtual DOM behavior.
* 🌳 **Deep Nested Extraction**: Capable of expanding and extracting multi-level reply threads ("View 10 replies" -> "View 2 more") down to the very last reply.
* 🧹 **Auto-Sanitize**: Automatically cleans up newline characters (\n) to prevent broken CSV formatting.
* 🕰️ **Universal Date Parser**: Converts relative timestamps (e.g., "2d ago", "3j lalu") into absolute standard date formats.

---

## 🤝 Contributing

Pull requests are highly appreciated! For major changes, please open an issue first to discuss what you would like to change.

---