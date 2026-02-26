import { createPlaywrightRouter, Dataset } from "crawlee";

export const router = createPlaywrightRouter();

// handler general search
router.addHandler('SEARCH_GENERAL', async ({ page, log }) => {
    const videoLinkSelector = 'a[href*="/video/"]';
    log.info('Searching result container...');

    try {
        await page.waitForSelector(videoLinkSelector, { timeout: 30000 });
        log.info('[OK] Search container found via ID.');
        await page.waitForTimeout(3000);
    } catch (e){
        log.error(`[ERROR!] Failed to find main container. Error: ${e}`);
        await page.screenshot({ path: '../../../storage/error_search.png' });
        return;
    }

    // infinite scroll logic
    log.info('Scrolling to load more videos...');
    let previousVideoCount = 0;
    let stuckCounter = 0;
    const maxScrolls = 50;

    // get current viewport size
    const viewport = page.viewportSize() || { width: 1280, height: 720 };
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;

    // move mouse to center of the screen (video content area) and click to focus
    await page.mouse.move(centerX, centerY);
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(3000);


    for (let i = 0; i < maxScrolls; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(2000);

        await page.mouse.wheel(0, 1200); // scroll down
        await page.waitForTimeout(3000);
        await page.mouse.wheel(0, 1200); // scroll down again

        await page.waitForTimeout(3000 + Math.random() * 2000);

        const currentVideoCount = await page.locator(videoLinkSelector).count();

        if (currentVideoCount === previousVideoCount) {
            stuckCounter++;
            log.info(`[INFO] Waiting for new data... (Attempt ${stuckCounter}/3) - Collected: ${currentVideoCount} videos`);

            await page.mouse.wheel(0, -600); // scroll up a bit
            await page.waitForTimeout(2000);
            await page.mouse.wheel(0, 2000); // scroll down more
            if (stuckCounter >= 3) {
                log.info(`[STOP] Stuck at ${currentVideoCount} videos. Stopping scroll.`);
                break;
            }
        } else {
            stuckCounter = 0;
            previousVideoCount = currentVideoCount;
            log.info(`[OK] Scroll #${i + 1} successful. Continuing to load more...`);
        }
    }
    log.info('[FINISH] Finished scrolling. Extracting data...');

    // extract data
    const videos = await page.$$eval(videoLinkSelector, (elements) => {
        return elements.map((element) => {
            const href = element.getAttribute('href') || '';
            const title = element.getAttribute('title') || '';

            // parse URL: https://www.tiktok.com/@username/video/1234567890
            const urlParts = href.split('/');
            const videoId = urlParts.pop() || '';
            const username = urlParts[urlParts.length - 2]?.replace('@', '') || '';

            // fallback description (if title is empty, check alt text of image)
            let description = title;
            if (!description) {
                const img = element.querySelector('img');
                if (img) description = img.getAttribute('alt') || '';
            }

            let isVerified = false;
            let currentParent = element.parentElement;

            for (let step = 0; step < 8; step++) {
                if (!currentParent) break;

                const userElements = currentParent.querySelectorAll('p[data-e2e="search-card-user-unique-id"]');
                let foundUserCard = false;

                for (const userEl of userElements) {
                    if (userEl.textContent?.trim() === username) {
                        foundUserCard = true;
                        const nextElement = userEl.nextElementSibling;
                        if (nextElement && nextElement.tagName.toLowerCase() === 'svg') {
                            isVerified = true;
                        }
                        break;
                    }
                }

                if (foundUserCard) {
                    break; 
                }

                currentParent = currentParent.parentElement;
            }

            return {
                platform: 'tiktok',
                type: 'video_search_result',
                id: videoId,
                username: username,
                is_verified: isVerified ? 'TRUE' : 'FALSE',
                url: href.split('?')[0], // clean tracking params
                description: description,
                scrapedAt: new Date().toISOString()
            }
        });
    });

    // filter duplicates (optional, based on video ID)
    const uniqueVideos = Array.from(new Map(videos.map(video => [video.id, video])).values())
        .filter(video => video.id && video.username);

    log.info(`[OK] Extracted ${uniqueVideos.length} unique videos. Saving to dataset...`);

    // save to dataset
    await Dataset.pushData(uniqueVideos);
});

router.addHandler('USER_PROFILE', async ({ page, log }) => {
    log.info('Handling user profile page...');

    try {
        await page.waitForSelector('[data-e2e="user-title"]', { timeout: 30000 });
        log.info('[OK] User profile container found.');
        await page.waitForTimeout(3000);
    } catch (e) {
        log.error(`[ERROR!] Failed to process user profile. Error: ${e}`);
        await page.screenshot({ path: '../../../storage/error_user_profile.png' });
        return;
    }

    const getText = async (selector: string) => {
        try {
            return await page.locator(selector).first().innerText();
        } catch {
            return '';
        }
    };

    // extract profile info
    const username = await getText('[data-e2e="user-title"]');
    const displayName = await getText('[data-e2e="user-subtitle"]');
    const followingCount = await getText('[data-e2e="following-count"]');
    const followersCount = await getText('[data-e2e="followers-count"]');
    const likesCount = await getText('[data-e2e="likes-count"]');
    const userBio = await getText('[data-e2e="user-bio"]');
    const userLink = await getText('[data-e2e="user-link"]');

    let isVerified = false;

    const verifiedBadge = [
        '[data-e2e="verified-badge"]',
        '[data-e2e="verified-icon"]',
        '[data-e2e="user-title"] + svg',
        '[data-e2e="user-title"] >> xpath=.. >> svg'
    ];

    for (const selector of verifiedBadge) {
        const count = await page.locator(selector).count();
        if (count > 0) {
            isVerified = true;
            break;
        }
    }

    log.info(`[PROCESSING] Extracting data for user profile: ${username} (${displayName}) | Verified: ${isVerified}`);

    log.info('Scrolling to load more videos on profile...');
    let previousVideoCount = 0;
    let stuckCounter = 0;
    const maxScrolls = 100;
    const videoItemSelector = '[data-e2e="user-post-item"]';

    const viewport = page.viewportSize() || { width: 1280, height: 720 };
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(2000);

    for (let p = 0; p < maxScrolls; p++){
        await page.keyboard.press('Escape');
        await page.waitForTimeout(2000);

        await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(2000);
        await page.mouse.wheel(0, 1500);

        await page.waitForTimeout(3000 + Math.random() * 2000);

        const currentVideoCount = await page.locator(videoItemSelector).count();

        if (currentVideoCount === previousVideoCount) {
            stuckCounter++;
            log.info(`[INFO] Waiting for videos to load... (Attempt ${stuckCounter}/3) - Collected: ${currentVideoCount} videos`);

            await page.mouse.wheel(0, -600);
            await page.waitForTimeout(2000);
            await page.mouse.wheel(0, 2000);

            if (stuckCounter >= 3) {
                log.info(`[STOP] Stuck at ${currentVideoCount} videos. Stopping scroll.`);
                break;
            }
        } else {
            stuckCounter = 0;
            previousVideoCount = currentVideoCount;
            log.info(`[OK] Scroll #${p + 1} successful. Continuing to load more...`);
        }
    }

    // extract video data from profile
    log.info('[FINISH] Finished scrolling. Extracting video data from profile...');
    const videos = await page.$$eval(videoItemSelector, (elements) => {
        return elements.map(el => {
            const linkEl = el.querySelector('a');
            const href = linkEl ? linkEl.href : '';

            const viewEl = el.querySelector('[data-e2e="video-views"]');
            const views = viewEl ? viewEl.textContent : '0';

            return {
                video_link: href,
                views_count: views
            };
        });
    });

    const totalUploadedVideos = videos.length;
    log.info(`[SUCCESS] Extracted ${totalUploadedVideos} videos from profile.`);

    // save profile data + videos to dataset
    await Dataset.pushData({
        dataType: 'profile_info',
        username,
        display_name: displayName,
        is_verified: isVerified ? 'TRUE' : 'FALSE',
        following_count: followingCount,
        followers_count: followersCount,
        total_likes_count: likesCount,
        bio: userBio.replace(/\n/g, ' '), // replace newlines in bio with spaces
        link: userLink,
        total_videos: totalUploadedVideos,
        scrapedAt: new Date().toISOString()
    });

    // push video data with reference to username
    const videoData = videos.map(video => ({
        dataType: 'profile_video',
        account_username: username,
        video_link: video.video_link,
        views_count: video.views_count,
        scrapedAt: new Date().toISOString()
    }));

    if (videoData.length > 0) {
        await Dataset.pushData(videoData);
    }
});