jest.mock('../../utils/logger', () => ({
    debug: jest.fn(),
    info: jest.fn()
}));

const logger = require('../../utils/logger');
const cache = require('../../utils/cache');

describe('cache utility', () => {
    beforeEach(() => {
        cache.clear();
        jest.clearAllMocks();
    });

    it('caches function results via getOrSet', async () => {
        const producer = jest.fn(async () => 'value-1');

        const first = await cache.getOrSet('test:key', producer);
        const second = await cache.getOrSet('test:key', producer);

        expect(first).toBe('value-1');
        expect(second).toBe('value-1');
        expect(producer).toHaveBeenCalledTimes(1);
        expect(logger.debug).toHaveBeenCalledWith('Cache hit: test:key');
    });

    it('supports manual set/get/delete per tier', () => {
        cache.set('short:key', 1, 'short');
        cache.set('medium:key', 2);
        cache.set('long:key', 3, 'long');

        expect(cache.get('short:key', 'short')).toBe(1);
        expect(cache.get('medium:key')).toBe(2);
        expect(cache.get('long:key', 'long')).toBe(3);

        cache.del('medium:key');
        expect(cache.get('medium:key')).toBeUndefined();
    });

    it('deletes entries by pattern across caches', () => {
        cache.set('user:1', 'A');
        cache.set('user:2', 'B', 'long');
        cache.set('patient:1', 'C');

        const removed = cache.delPattern('user:');
        expect(removed).toBe(2);
        expect(logger.info).toHaveBeenCalledWith('Deleted 2 cache entries matching: user:');
    });

    it('clears caches and exposes stats + keys helper', () => {
        const stats = cache.stats();
        expect(stats).toHaveProperty('short');
        expect(cache.keys.patient('123')).toBe('patient:123');

        cache.clear();
        expect(logger.info).toHaveBeenCalledWith('All caches cleared');
    });
});
