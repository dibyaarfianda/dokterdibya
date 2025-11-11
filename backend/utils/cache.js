/**
 * Cache utility using node-cache
 * For in-memory caching of frequently accessed data
 */

const NodeCache = require('node-cache');
const logger = require('./logger');

// Create cache instances with different TTLs
const caches = {
    // Short-lived cache (5 minutes) - for frequently changing data
    short: new NodeCache({ 
        stdTTL: 300,
        checkperiod: 60,
        useClones: false
    }),
    
    // Medium cache (30 minutes) - for semi-static data
    medium: new NodeCache({ 
        stdTTL: 1800,
        checkperiod: 300,
        useClones: false
    }),
    
    // Long cache (2 hours) - for rarely changing data
    long: new NodeCache({ 
        stdTTL: 7200,
        checkperiod: 600,
        useClones: false
    })
};

/**
 * Get from cache or execute function and cache result
 */
const getOrSet = async (key, fn, ttl = 'medium') => {
    const cache = caches[ttl] || caches.medium;
    
    // Try to get from cache
    const cached = cache.get(key);
    if (cached !== undefined) {
        logger.debug(`Cache hit: ${key}`);
        return cached;
    }
    
    // Execute function and cache result
    logger.debug(`Cache miss: ${key}`);
    const result = await fn();
    cache.set(key, result);
    
    return result;
};

/**
 * Get value from cache
 */
const get = (key, ttl = 'medium') => {
    const cache = caches[ttl] || caches.medium;
    return cache.get(key);
};

/**
 * Set value in cache
 */
const set = (key, value, ttl = 'medium') => {
    const cache = caches[ttl] || caches.medium;
    return cache.set(key, value);
};

/**
 * Delete from cache
 */
const del = (key, ttl = 'medium') => {
    const cache = caches[ttl] || caches.medium;
    return cache.del(key);
};

/**
 * Delete multiple keys matching pattern
 */
const delPattern = (pattern) => {
    let deletedCount = 0;
    
    Object.values(caches).forEach(cache => {
        const keys = cache.keys();
        const matchingKeys = keys.filter(key => key.includes(pattern));
        matchingKeys.forEach(key => {
            cache.del(key);
            deletedCount++;
        });
    });
    
    logger.info(`Deleted ${deletedCount} cache entries matching: ${pattern}`);
    return deletedCount;
};

/**
 * Clear all caches
 */
const clear = () => {
    Object.values(caches).forEach(cache => cache.flushAll());
    logger.info('All caches cleared');
};

/**
 * Get cache statistics
 */
const stats = () => {
    return {
        short: caches.short.getStats(),
        medium: caches.medium.getStats(),
        long: caches.long.getStats()
    };
};

/**
 * Cache key generators
 */
const keys = {
    patient: (id) => `patient:${id}`,
    patients: () => 'patients:all',
    obat: (id) => `obat:${id}`,
    obatList: () => 'obat:list',
    tindakan: (id) => `tindakan:${id}`,
    tindakanList: () => 'tindakan:list',
    user: (id) => `user:${id}`
};

module.exports = {
    getOrSet,
    get,
    set,
    del,
    delPattern,
    clear,
    stats,
    keys
};
