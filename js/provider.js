/**
 * Provider API Client
 * @class ProviderAPI
 * @description Client for interacting with IPTV provider servers
 */
class ProviderAPI {
    /**
     * Create an Provider API client
     * @param {string} server - Server URL
     * @param {string} username - Account username
     * @param {string} password - Account password
     */
    constructor(server, username, password) {
        this.server = server.replace(Regex.trailingSlash, '');
        this.username = username;
        this.password = password;
        this.authData = null;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        // Use CORS proxy for simulator testing (remove for real TV)
        this.useProxy = typeof tizen === 'undefined';
        this.corsProxy = 'https://api.allorigins.win/raw?url=';
        // Cache for categories and streams (session only)
        this.cache = {
            liveCategories: null,
            vodCategories: null,
            seriesCategories: null,
            liveStreams: {},
            vodStreams: {},
            series: {}
        };
    }

    /**
     * Get URL with optional CORS proxy for development
     * @param {string} url - Original URL
     * @returns {string} URL with proxy if needed
     */
    getUrl(url) {
        return this.useProxy ? this.corsProxy + encodeURIComponent(url) : url;
    }

    /**
     * Fetch with automatic retry on network errors
     * @param {string} url - URL to fetch
     * @param {number} [retries=3] - Number of retry attempts
     * @returns {Promise<Response>} Fetch response
     */
    async fetchWithRetry(url, retries = this.maxRetries) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                window.log('HTTP> ' + url);
                const response = await fetch(this.getUrl(url));
                var logMsg = 'HTTP< ' + response.status + ' ' + url;
                if (response.redirected) {
                    logMsg += ' -> ' + response.url;
                }
                window.log(logMsg);
                // Clone response to read body for logging (dev device only)
                if (!window.DEV_DUID || window.deviceId === window.DEV_DUID) {
                    const cloned = response.clone();
                    const logUrl = url;
                    cloned.text().then(function(body) {
                        window.log('HTTP body ' + logUrl + ': ' + body);
                    }).catch(function() {});
                }
                if (!response.ok && attempt < retries) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response;
            }
            catch (error) {
                window.log('HTTP! ' + error.message + ' ' + url);
                if (attempt === retries) {
                    throw error;
                }
                const delay = this.retryDelay * attempt;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Authenticate with the provider server
     * @returns {Promise<Object>} Authentication data including user info
     * @throws {Error} If authentication fails
     */
    async authenticate() {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}`;
        try {
            const response = await this.fetchWithRetry(url);
            if (!response.ok) throw new Error('Authentication failed');
            this.authData = await response.json();
            if (!this.authData.user_info) throw new Error('Invalid credentials');
            // Calculate server time offset
            if (this.authData.server_info && this.authData.server_info.timestamp_now) {
                var serverTime = this.authData.server_info.timestamp_now;
                var localTime = Math.floor(Date.now() / 1000);
                this.serverTimeOffset = serverTime - localTime;
                window.log('Server time offset: ' + this.serverTimeOffset + 's (server=' + serverTime + ' local=' + localTime + ')');
            }
            else {
                this.serverTimeOffset = 0;
            }
            return this.authData;
        }
        catch (ex) {
            window.log('ERROR Auth: ' + (ex.message || ex));
            throw ex;
        }
    }

    /**
     * Get live TV categories
     * @returns {Promise<Array>} List of live categories
     */
    async getLiveCategories() {
        if (this.cache.liveCategories) {
            window.log('CACHE hit liveCategories');
            return this.cache.liveCategories;
        }
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_live_categories`;
        const response = await this.fetchWithRetry(url);
        this.cache.liveCategories = await response.json();
        return this.cache.liveCategories;
    }

    /**
     * Get live TV streams
     * @param {string|null} [categoryId=null] - Optional category filter
     * @returns {Promise<Array>} List of live streams
     */
    async getLiveStreams(categoryId = null) {
        const cacheKey = categoryId || '_all';
        if (this.cache.liveStreams[cacheKey]) {
            window.log('CACHE hit liveStreams[' + cacheKey + ']');
            return this.cache.liveStreams[cacheKey];
        }
        let url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_live_streams`;
        if (categoryId) url += `&category_id=${categoryId}`;
        const response = await this.fetchWithRetry(url);
        this.cache.liveStreams[cacheKey] = await response.json();
        return this.cache.liveStreams[cacheKey];
    }

    /**
     * Get VOD categories
     * @returns {Promise<Array>} List of VOD categories
     */
    async getVodCategories() {
        if (this.cache.vodCategories) {
            window.log('CACHE hit vodCategories');
            return this.cache.vodCategories;
        }
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_vod_categories`;
        const response = await this.fetchWithRetry(url);
        this.cache.vodCategories = await response.json();
        return this.cache.vodCategories;
    }

    /**
     * Get VOD streams
     * @param {string|null} [categoryId=null] - Optional category filter
     * @returns {Promise<Array>} List of VOD streams
     */
    async getVodStreams(categoryId = null) {
        const cacheKey = categoryId || '_all';
        if (this.cache.vodStreams[cacheKey]) {
            window.log('CACHE hit vodStreams[' + cacheKey + ']');
            return this.cache.vodStreams[cacheKey];
        }
        let url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_vod_streams`;
        if (categoryId) url += `&category_id=${categoryId}`;
        const response = await this.fetchWithRetry(url);
        this.cache.vodStreams[cacheKey] = await response.json();
        return this.cache.vodStreams[cacheKey];
    }

    /**
     * Get series categories
     * @returns {Promise<Array>} List of series categories
     */
    async getSeriesCategories() {
        if (this.cache.seriesCategories) {
            window.log('CACHE hit seriesCategories');
            return this.cache.seriesCategories;
        }
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_series_categories`;
        const response = await this.fetchWithRetry(url);
        this.cache.seriesCategories = await response.json();
        return this.cache.seriesCategories;
    }

    /**
     * Get series list
     * @param {string|null} [categoryId=null] - Optional category filter
     * @returns {Promise<Array>} List of series
     */
    async getSeries(categoryId = null) {
        const cacheKey = categoryId || '_all';
        if (this.cache.series[cacheKey]) {
            window.log('CACHE hit series[' + cacheKey + ']');
            return this.cache.series[cacheKey];
        }
        let url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_series`;
        if (categoryId) url += `&category_id=${categoryId}`;
        const response = await this.fetchWithRetry(url);
        this.cache.series[cacheKey] = await response.json();
        return this.cache.series[cacheKey];
    }

    /**
     * Get detailed series information including episodes
     * @param {string} seriesId - Series ID
     * @returns {Promise<Object>} Series details with episodes
     */
    async getSeriesInfo(seriesId) {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_series_info&series_id=${seriesId}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Get detailed VOD information
     * @param {string} vodId - VOD ID
     * @returns {Promise<Object>} VOD details
     */
    async getVodInfo(vodId) {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_vod_info&vod_id=${vodId}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Preload all streams into cache (runs in background)
     * @param {Function} onProgress - Callback for progress updates (step, total, name)
     * @returns {Promise<void>}
     */
    async preloadCache(onProgress) {
        window.log('CACHE preload starting...');
        var steps = [
            { name: 'TV', fn: () => this.getLiveStreams() },
            { name: 'VOD', fn: () => this.getVodStreams() },
            { name: 'Series', fn: () => this.getSeries() }
        ];
        // Helper to yield to UI thread
        var yieldToUI = () => new Promise(resolve => setTimeout(resolve, 50));
        try {
            for (var i = 0; i < steps.length; i++) {
                if (onProgress) onProgress(i + 1, steps.length, steps[i].name);
                await yieldToUI(); // Let UI update before heavy operation
                await steps[i].fn();
                await yieldToUI(); // Let UI breathe after parsing
            }
            if (onProgress) onProgress(0, 0, null); // Done
            window.log('CACHE preload complete');
        } catch (e) {
            if (onProgress) onProgress(0, 0, null);
            window.log('ERROR CACHE preload: ' + (e.message || e));
        }
    }

    /**
     * Get EPG (Electronic Program Guide) for a stream
     * @param {string} streamId - Stream ID
     * @returns {Promise<Object>} EPG data
     */
    async getEPG(streamId) {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_simple_data_table&stream_id=${streamId}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Get short EPG (next N programs) for a stream
     * @param {string} streamId - Stream ID
     * @param {number} limit - Number of programs to fetch (default: 4)
     * @returns {Promise<Object>} Short EPG data
     */
    async getShortEPG(streamId, limit = 4) {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_short_epg&stream_id=${streamId}&limit=${limit}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    getLiveStreamUrl(streamId, extension = 'ts') {
        return `${this.server}/live/${this.username}/${this.password}/${streamId}.${extension}`;
    }

    /**
     * Get catchup/timeshift URL for watching past programs
     * @param {string} streamId - Stream ID
     * @param {number} start - Start timestamp (Unix seconds)
     * @param {number} duration - Duration in minutes
     * @param {string} extension - File extension (default: ts)
     * @returns {string} Catchup stream URL
     */
    getCatchupUrl(streamId, start, duration, extension = 'ts', format = 0) {
        var end = start + (duration * 60);
        // Convert Unix timestamp to YYYY-MM-DD:HH-MM format for some endpoints
        var startDate = new Date(start * 1000);
        var pad = function(n) { return n < 10 ? '0' + n : n; };
        var startFormatted = startDate.getFullYear() + '-' + pad(startDate.getMonth() + 1) + '-' + pad(startDate.getDate()) + ':' + pad(startDate.getHours()) + '-' + pad(startDate.getMinutes());
        switch (format) {
            case 0: // Format 1: streaming/timeshift.php with date format (most compatible)
                return `${this.server}/streaming/timeshift.php?username=${this.username}&password=${this.password}&stream=${streamId}&start=${startFormatted}&duration=${duration}`;
            case 1: // Format 2: timeshift path with Unix timestamp
                return `${this.server}/timeshift/${this.username}/${this.password}/${duration}/${start}/${streamId}.${extension}`;
            case 2: // Format 3: live with utc params
                return `${this.server}/live/${this.username}/${this.password}/${streamId}.${extension}?utc=${start}&lutc=${end}`;
            case 3: // Format 4: simple path with utc
                return `${this.server}/${this.username}/${this.password}/${streamId}?utc=${start}&lutc=${end}`;
            default:
                return `${this.server}/streaming/timeshift.php?username=${this.username}&password=${this.password}&stream=${streamId}&start=${startFormatted}&duration=${duration}`;
        }
    }

    getVodStreamUrl(streamId, extension = 'mkv') {
        return `${this.server}/movie/${this.username}/${this.password}/${streamId}.${extension}`;
    }

    getSeriesStreamUrl(streamId, extension = 'mkv') {
        return `${this.server}/series/${this.username}/${this.password}/${streamId}.${extension}`;
    }
}

window.ProviderAPI = ProviderAPI;
