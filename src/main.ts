import { Dataset, PlaywrightCrawler } from "crawlee";
import { tiktokRouter, tiktokSetup } from "./platforms/tiktok";
// import { instagramRouter, instagramSetup } from "./platforms/instagram";
import * as fs from 'fs';
import * as path from 'path';

// interface CLI
const args = process.argv.slice(2);
const platform = args[0];
const action = args[1];
const query = args[2];

if (!platform || !action || !query) {
    console.error('❌ Usage: npm start <platform> <action> "<query>"');
    console.error('Example: npm start tiktok search "kucing lucu"');
    process.exit(1);
};

// config crawler default
const crawlerConfig = {
    headless: false,
    browserPoolOptions: { useFingerprints: true },
};

(async () => {
    console.log(`Executing ${platform} scraper...`);
    console.log(`   Action: ${action}`);
    console.log(`   Query: ${query}`);

    const exportFolder = 'results';
    const folderPath = path.join(process.cwd(), exportFolder);
    if (!fs.existsSync(folderPath)) {
        console.log(`[WARNING!] Folder '${exportFolder}' does not exist. Creating folder...`);
        fs.mkdirSync(folderPath);
    }

    let router;
    let startUrls: { url: string; label: string; userData?: any }[] = [];

    // dispatcher logic
    switch (platform.toLowerCase()) {
        case 'tiktok':
            router = tiktokRouter;
            startUrls = tiktokSetup(action, query);
            break;
        
        case 'instagram':
            // router = instagramRouter;
            // startUrls = instagramSetup(action, query);
            break;
        default:
            console.error(`Platform "${platform}" is not available yet.`);
            process.exit(1);
    }

    // run crawler
    const crawler = new PlaywrightCrawler({
        ...crawlerConfig,
        requestHandler: router,
        requestHandlerTimeoutSecs: 1200, // 20 minutes each request
    });

    await crawler.run(startUrls);

    // export data to CSV
    console.log(['[DONE] Crawling finished. Exporting data...']);

    const { items } = await Dataset.getData();

    if (items.length === 0) {
        console.log('[FAILED!] No data found to save.');
        return;
    }

    const timestamp = new Date().toLocaleString('sv-SE', { 
        timeZone: 'Asia/Jakarta', // <--- INI KUNCI STANDARNYA
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).replace(' ', '_').replace(/:/g, '-');

    const safeQuery = query.replace(/[^a-zA-Z0-9]/g, '_');
    const writeCsv = (dataArray: any[], filePath: string) => {
        if (dataArray.length === 0) return;

        const cleanData = dataArray.map(({ dataType, ...rest }) => rest);

        const headers = Object.keys(cleanData[0]);
        const csvRows = cleanData.map(row => {
            return headers.map(fieldName => {
                const cell = String(row[fieldName] || '').replace(/"/g, '""');
                return `"${cell}"`;
            }).join(',');
        });
        const csvContent = [headers.join(','), ...csvRows].join('\n');
        fs.writeFileSync(filePath, csvContent, 'utf-8');
    };

    // conditional logic for user profile (if action is 'user', create subfolder and separate CSVs)
    if (action.toLowerCase() === 'user') {
        const userFolderName = `${platform}-${action}-${safeQuery}-${timestamp}`;
        const userFolderPath = path.join(folderPath, userFolderName);

        if (!fs.existsSync(userFolderPath)) fs.mkdirSync(userFolderPath);

        const profileData = items.filter(i => i.dataType === 'profile_info');
        const videosData = items.filter(i => i.dataType === 'profile_video');

        try {
            writeCsv(profileData, path.join(userFolderPath, '1_profile_info.csv'));
            writeCsv(videosData, path.join(userFolderPath, '2_video_list.csv'));
            console.log(`[SUCCESS] Profile & video data saved in folder: ${userFolderPath}`);
        } catch (e) {
            console.error(`[ERROR] Failed to save profile files: ${e}`);
        }
    } else {
        const fileName = `${platform}-${action}-${safeQuery}-${timestamp}.csv`;
        const fullFilePath = path.join(folderPath, fileName);

        try {
            writeCsv(items, fullFilePath);
            console.log(`[SUCCESS] File saved as: ${fileName}`);
        } catch (e) {
            console.error(`[ERROR] Failed to save file: ${e}`);
        }
    }
})();