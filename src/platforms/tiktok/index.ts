import { router } from './routes';

export const tiktokRouter = router;

export const tiktokSetup = (action: string, keyword: string) => {
    let url = '';
    let label = '';
    const baseUrl = 'https://www.tiktok.com';

    switch (action.toLowerCase()) {
        case 'search':
            // Endpoint: https://www.tiktok.com/search?q=
            url = `${baseUrl}/search?q=${encodeURIComponent(keyword)}`;
            label = 'SEARCH_GENERAL';
            break;

        case 'user':
            // Endpoint: https://www.tiktok.com/@username
            const cleanUsername = keyword.replace('@', '').trim();
            url = `${baseUrl}/@${cleanUsername}`;
            label = 'USER_PROFILE';
            break;

        case 'content':
            // Endpoint: https://www.tiktok.com/@{user}/video/{id}
            if (keyword.startsWith('http')) {
                url = keyword;
            } else {
                const cleanPath = keyword.startsWith('@') ? keyword : `@${keyword}`;
                url = `${baseUrl}/${cleanPath}`;
            }
            label = 'VIDEO_CONTENT'; 
            break;

        default:
            console.error(`[ERROR!] Action "${action}" is not recognized for TikTok.`);
            console.error('Available actions: search, user, content');
            process.exit(1);
    }

    console.log(`🔗 Target URL: ${url}`);

    return [
        { 
            url: url, 
            label: label, 
            userData: { keyword, type: action } 
        }
    ];
};