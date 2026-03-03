export function parseUniversalDate(rawDateText: string | null): string {
    if (!rawDateText) return '';

    // clean the text from middle dots, extra spaces, and make it lowercase
    const timeString = rawDateText.replace(/·/g, '').trim().toLowerCase();
    const now = new Date();

    // check for absolute date format (e.g., "10-12" or "2023-10-12")
    const dateMatch = timeString.match(/(\d{4}-)?(\d{1,2})-(\d{1,2})/);
    // ensure it's not a regular minus and doesn't contain time units
    if (dateMatch && !timeString.includes('ago') && !timeString.includes('lalu') && !timeString.includes('h')) {
        const year = dateMatch[1] ? dateMatch[1].replace('-', '') : now.getFullYear();
        const month = dateMatch[2].padStart(2, '0');
        const day = dateMatch[3].padStart(2, '0');
        return `${year}-${month}-${day}T00:00:00.000Z`;
    }

    // extract number and time unit using Regex
    const relativeRegex = /(\d+)\s*([a-z]+)/i;
    const match = timeString.match(relativeRegex);

    if (match) {
        const num = parseInt(match[1], 10);
        const unit = match[2];

        if (unit.startsWith('s') || unit === 'detik') {
            now.setSeconds(now.getSeconds() - num);
        } else if (unit.startsWith('m') && unit !== 'minggu') {
            now.setMinutes(now.getMinutes() - num);
        } else if (unit.startsWith('h') || unit.startsWith('j')) {
            if (unit === 'hari') {
                now.setDate(now.getDate() - num);
            } else {
                now.setHours(now.getHours() - num);
            }
        } else if (unit === 'd' || unit === 'hari') {
            now.setDate(now.getDate() - num);
        } else if (unit === 'w' || unit === 'minggu') {
            now.setDate(now.getDate() - (num * 7));
        } else if (unit === 'y' || unit === 'th') {
            now.setFullYear(now.getFullYear() - num);
        }
        return now.toISOString();
    }

    return timeString;
}