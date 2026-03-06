"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const crawlee_1 = require("crawlee");
const dateParser_1 = require("../../utils/dateParser");
exports.router = (0, crawlee_1.createPlaywrightRouter)();
// handler general search
exports.router.addHandler('SEARCH_GENERAL', async ({ page, log }) => {
    const videoLinkSelector = 'a[href*="/video/"]';
    log.info('Searching result container...');
    try {
        await page.waitForSelector(videoLinkSelector, { timeout: 30000 });
        log.info('[OK] Search container found via ID.');
        await page.waitForTimeout(3000);
    }
    catch (e) {
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
        }
        else {
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
                if (img)
                    description = img.getAttribute('alt') || '';
            }
            let isVerified = false;
            let currentParent = element.parentElement;
            for (let step = 0; step < 8; step++) {
                if (!currentParent)
                    break;
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
            };
        });
    });
    // filter duplicates (optional, based on video ID)
    const uniqueVideos = Array.from(new Map(videos.map(video => [video.id, video])).values())
        .filter(video => video.id && video.username);
    log.info(`[OK] Extracted ${uniqueVideos.length} unique videos. Saving to dataset...`);
    // save to dataset
    await crawlee_1.Dataset.pushData(uniqueVideos);
});
// handler user details (profile + videos)
exports.router.addHandler('USER_PROFILE', async ({ page, log }) => {
    log.info('Handling user profile page...');
    try {
        await page.waitForSelector('[data-e2e="user-title"]', { timeout: 30000 });
        log.info('[OK] User profile container found.');
        await page.waitForTimeout(3000);
    }
    catch (e) {
        log.error(`[ERROR!] Failed to process user profile. Error: ${e}`);
        await page.screenshot({ path: '../../../storage/error_user_profile.png' });
        return;
    }
    const getText = async (selector) => {
        try {
            return await page.locator(selector).first().innerText();
        }
        catch {
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
    for (let p = 0; p < maxScrolls; p++) {
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
        }
        else {
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
    await crawlee_1.Dataset.pushData({
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
        await crawlee_1.Dataset.pushData(videoData);
    }
});
// handler content details
exports.router.addHandler('VIDEO_CONTENT', async ({ page, log, request }) => {
    log.info(`Handling video content page: ${request.url}`);
    const urlParts = request.url.split('/');
    const usernameFromUrl = urlParts.find(part => part.startsWith('@'))?.replace('@', '') || '';
    const userLinkSelector = `a[href*="/@${usernameFromUrl}" i]`;
    try {
        await page.waitForSelector(userLinkSelector, { timeout: 60000 });
        log.info('[OK] Content page loaded successfully.');
        await page.waitForTimeout(2000);
    }
    catch (e) {
        log.error(`[ERROR!] Failed to load video content. It might be deleted/private. Error: ${e}`);
        await page.screenshot({ path: '../../../storage/content_error.png' });
        return;
    }
    const getText = async (selector) => {
        try {
            return await page.locator(selector).first().innerText();
        }
        catch {
            return '';
        }
    };
    // extract basic data
    const username = usernameFromUrl;
    let isVerified = false;
    try {
        const badgeCount = await page.locator(`${userLinkSelector} p + svg`).count();
        if (badgeCount > 0) {
            isVerified = true;
        }
    }
    catch (e) {
        log.warning('[WARNING] Failed to check verified status.');
    }
    const caption = await getText('[data-e2e="video-desc"]');
    const likesCount = await getText('[data-e2e="like-count"]');
    const comentsCount = await getText('[data-e2e="comment-count"]');
    const savesCount = await getText('[data-e2e="undefined-count"]');
    // if share isnt "share"
    let sharesCount = '0';
    try {
        sharesCount = await getText('[data-e2e="share-count"]');
        if (sharesCount.toLocaleLowerCase().includes('share')) {
            sharesCount = '0';
        }
        else {
            sharesCount = await getText('[data-e2e="share-count"]');
        }
    }
    catch (e) {
        log.warning('[WARNING] Failed to extract shares count. Setting as 0.');
        sharesCount = '0';
    }
    // if any mucic info is available
    let musicInfo = '';
    try {
        const musicLocator = page.locator('a[href*="/music/"]').first();
        const innerText = await musicLocator.innerText();
        if (innerText && innerText.trim() !== '') {
            musicInfo = innerText.trim();
        }
        else {
            const ariaLabel = await musicLocator.getAttribute('aria-label');
            if (ariaLabel) {
                musicInfo = ariaLabel.replace(/Watch more videos with music |Tonton lebih banyak video dengan musik /gi, '').trim();
            }
            else {
                const href = await musicLocator.getAttribute('href');
                if (href && href.includes('/music/')) {
                    const parts = href.split('/music/')[1].split('-');
                    parts.pop();
                    musicInfo = decodeURIComponent(parts.join(' '));
                }
            }
        }
    }
    catch (e) {
        log.warning('[WARNING] Failed to extract music info. Setting as empty string.');
    }
    // get upload date using time traveler logic
    let uploadDate = '';
    try {
        const dateRawText = await page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('span'));
            const dateSpan = spans.find(span => {
                const txt = span.textContent?.toLocaleLowerCase() || '';
                return txt.includes('·') && /\d/.test(txt);
            });
            return dateSpan ? dateSpan.textContent : '';
        });
        uploadDate = (0, dateParser_1.parseUniversalDate)(dateRawText);
    }
    catch (e) {
        log.warning('[WARNING] Failed to extract upload date. Setting as empty string.');
    }
    const contentType = request.url.includes('/photo/') ? 'photo' : 'video';
    log.info(`[SUCCESS] Extracted content data: Username: ${username} | Caption: ${caption.substring(0, 30)}... | Likes: ${likesCount} | Comments: ${comentsCount} | Saves: ${savesCount} | Shares: ${sharesCount} | Music: ${musicInfo} | Upload Date: ${uploadDate}`);
    await crawlee_1.Dataset.pushData({
        dataType: 'content_details',
        content_url: request.url,
        content_type: contentType,
        username: username,
        is_verified: isVerified ? 'TRUE' : 'FALSE',
        upload_date: uploadDate,
        caption: caption.replace(/\n/g, ' '),
        music_info: musicInfo,
        likes_count: likesCount,
        comments_count: comentsCount,
        saves_count: savesCount,
        shares_count: sharesCount,
        scrapedAt: new Date().toISOString()
    });
    log.info('[DONE] Finished processing video content page.');
    // extact comments
    log.info('Starting to extract comments from content page...');
    try {
        await page.waitForTimeout(10000);
        const commentBtnSelector = '[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"], button[aria-label*="comment" i], button[aria-label*="komentar" i]';
        const actionResult = await page.evaluate((selector) => {
            if (document.querySelector('[class*="DivCommentMain"]')) {
                return 'already_open';
            }
            const buttons = Array.from(document.querySelectorAll(selector));
            for (const btn of buttons) {
                const el = btn;
                if (el.offsetParent !== null) {
                    el.click();
                    return 'clicked';
                }
            }
            return 'not_found';
        }, commentBtnSelector);
        if (actionResult === 'clicked') {
            log.info('[OK] Comment button clicked natively. Waiting for panel...');
            await page.waitForTimeout(4000); // Tunggu animasi panel geser keluar
        }
        else if (actionResult === 'already_open') {
            log.info('[OK] Comment panel is already open.');
        }
        else {
            log.info('[INFO] Comment button not found.');
        }
    }
    catch (e) {
        log.error(`[ERROR] Failed to execute comment opening logic. Error: ${e}`);
    }
    log.info('Scrolling comment container to load all comments...');
    const commentContainerSelector = '[class*="DivCommentMain"]';
    try {
        await page.waitForSelector(commentContainerSelector, { timeout: 15000 });
        const extractedComments = new Map();
        let stuckCounter = 0;
        let lastScrollHeight = await page.evaluate((sel) => document.querySelector(sel)?.scrollHeight || 0, commentContainerSelector);
        while (stuckCounter < 5) {
            await page.evaluate(async () => {
                let keepExpanding = true;
                let localAttempts = 0;
                while (keepExpanding && localAttempts < 10) {
                    localAttempts++;
                    let clicked = false;
                    const btns = Array.from(document.querySelectorAll('div.TUXButton-label, [class*="DivViewRepliesContainer"] span'));
                    for (const btn of btns) {
                        const text = (btn.textContent || '').toLocaleLowerCase();
                        if ((text.includes('view') && text.includes('replies')) || text.includes('reply') || (text.includes('view') && text.includes('more'))) {
                            const el = btn;
                            if (el.offsetParent !== null) {
                                el.click();
                                clicked = true;
                            }
                        }
                    }
                    if (clicked) {
                        await new Promise(r => setTimeout(r, 1500));
                    }
                    else {
                        keepExpanding = false;
                    }
                }
            });
            const currentBatch = await page.$$eval('[class*="DivCommentObjectWrapper"]', (threads) => {
                const results = [];
                for (const thread of threads) {
                    // Main comment
                    const mainItem = thread.querySelector('[class*="DivCommentItemWrapper"]');
                    if (!mainItem)
                        continue;
                    const userLinkMain = mainItem.querySelector('a[href^="/@"]');
                    const mainUsername = userLinkMain ? (userLinkMain.getAttribute('href') || '').replace('/@', '').trim() : '';
                    const textElMain = mainItem.querySelector('span[data-e2e="comment-level-1"]');
                    const textMain = textElMain ? (textElMain.textContent || '').trim() : '';
                    const mediaElMain = mainItem.querySelector('img[data-e2e="comment-thumbnail"]');
                    const mediaUrlMain = mediaElMain ? (mediaElMain.getAttribute('src') || '') : '';
                    let fullTextMain = textMain;
                    if (mediaUrlMain)
                        fullTextMain += fullTextMain ? ` [Media: ${mediaUrlMain}]` : `[Media: ${mediaUrlMain}]`;
                    const likeElMain = mainItem.querySelector('[aria-label*="Like video"] span');
                    const likesMain = likeElMain ? (likeElMain.textContent || '').trim() : '0';
                    const spansMain = Array.from(mainItem.querySelectorAll('span'));
                    const dateSpanMain = spansMain.find(span => {
                        const txt = (span.textContent || '').toLocaleLowerCase();
                        return (txt.includes('ago') || txt.includes('lalu') || /\d{1,2}-\d{1,2}/.test(txt)) && !txt.includes('reply');
                    });
                    const dateRawMain = dateSpanMain ? (dateSpanMain.textContent || '').trim() : '';
                    if (mainUsername) {
                        results.push({
                            type: 'Main',
                            parent_username: '',
                            username: mainUsername,
                            comment_text: fullTextMain,
                            likes_count: likesMain,
                            comment_date_raw: dateRawMain
                        });
                    }
                    // Replies
                    const replyContainer = thread.querySelector('[class*="DivReplyContainer"]');
                    if (replyContainer) {
                        const replies = replyContainer.querySelectorAll('[class*="DivCommentItemWrapper"]');
                        replies.forEach(replyItem => {
                            const userLinkRep = replyItem.querySelector('a[href^="/@"]');
                            const repUsername = userLinkRep ? (userLinkRep.getAttribute('href') || '').replace('/@', '').trim() : '';
                            const textElRep = replyItem.querySelector('span[data-e2e="comment-level-2"]');
                            const textRep = textElRep ? (textElRep.textContent || '').trim() : '';
                            const mediaElRep = replyItem.querySelector('img[data-e2e="comment-thumbnail"]');
                            const mediaUrlRep = mediaElRep ? (mediaElRep.getAttribute('src') || '') : '';
                            let fullTextRep = textRep;
                            if (mediaUrlRep)
                                fullTextRep += fullTextRep ? ` [Media: ${mediaUrlRep}]` : `[Media: ${mediaUrlRep}]`;
                            const likeElRep = replyItem.querySelector('[aria-label*="Like video"] span');
                            const likesRep = likeElRep ? (likeElRep.textContent || '').trim() : '0';
                            const spansRep = Array.from(replyItem.querySelectorAll('span'));
                            const dateSpanRep = spansRep.find(span => {
                                const txt = (span.textContent || '').toLocaleLowerCase();
                                return (txt.includes('ago') || txt.includes('lalu') || /\d{1,2}-\d{1,2}/.test(txt)) && !txt.includes('reply');
                            });
                            const dateRawRep = dateSpanRep ? (dateSpanRep.textContent || '').trim() : '';
                            if (repUsername) {
                                results.push({
                                    type: 'Reply',
                                    parent_username: mainUsername,
                                    username: repUsername,
                                    comment_text: fullTextRep,
                                    likes_count: likesRep,
                                    comment_date_raw: dateRawRep
                                });
                            }
                        });
                    }
                }
                return results;
            });
            for (const item of currentBatch) {
                const uniqueKey = `${item.username}|${item.comment_text}`;
                extractedComments.set(uniqueKey, item);
            }
            const scrollResult = await page.evaluate((sel) => {
                const container = document.querySelector(sel);
                if (!container)
                    return { newHeight: 0, scrolled: false };
                const beforeScroll = container.scrollTop;
                container.scrollBy(0, 800);
                return {
                    newHeight: container.scrollHeight,
                    scrolled: container.scrollTop > beforeScroll
                };
            }, commentContainerSelector);
            if (scrollResult.newHeight === lastScrollHeight && !scrollResult.scrolled) {
                stuckCounter++;
            }
            else {
                lastScrollHeight = scrollResult.newHeight;
                stuckCounter = 0;
            }
            await page.waitForTimeout(1000);
        }
        const rawCommentsData = Array.from(extractedComments.values());
        log.info(`[SUCCESS] Extracted ${rawCommentsData.length} unique comments (including replies). Saving to dataset...`);
        const finalCommentsData = rawCommentsData.map(comment => {
            return {
                dataType: 'content_comments',
                content_url: request.url,
                comment_type: comment.type,
                parent_username: comment.parent_username,
                username: comment.username,
                comment_text: comment.comment_text.replace(/\n/g, ' '),
                likes_count: comment.likes_count,
                comment_date: (0, dateParser_1.parseUniversalDate)(comment.comment_date_raw),
                scrapedAt: new Date().toISOString()
            };
        });
        if (finalCommentsData.length > 0) {
            await crawlee_1.Dataset.pushData(finalCommentsData);
            log.info(`[SUCCESS] ${finalCommentsData.length} comments successfully saved to dataset.`);
        }
        else {
            log.info('[INFO] No comments found to save for this content.');
        }
    }
    catch (e) {
        log.warning(`[WARNING] Failed to extract comments. Error: ${e}`);
    }
    log.info('[DONE] Finished processing video content page and its comments.');
});
