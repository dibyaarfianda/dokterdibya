(function installPageRegistry(global) {
    'use strict';

    const DESCRIPTOR_FIELDS = ['key', 'containerId', 'navId', 'title', 'fragment', 'load', 'activate', 'deactivate'];

    class PageRegistry {
        constructor(options = {}) {
            this.document = options.document || global.document;
            this.fetch = options.fetch || global.fetch?.bind(global);
            this.eventTarget = options.eventTarget || this.document;
            this.descriptors = new Map();
            this.loadPromises = new Map();
            this.loadedFeatures = new Set();
            this.activeKey = null;
        }

        register(descriptor) {
            if (!descriptor || typeof descriptor !== 'object') throw new TypeError('Page descriptor must be an object');
            if (!descriptor.key || !descriptor.containerId) throw new Error('Page descriptor requires key and containerId');
            const normalized = Object.fromEntries(DESCRIPTOR_FIELDS.map(field => [field, descriptor[field] ?? null]));
            normalized.load = typeof normalized.load === 'function' ? normalized.load : null;
            normalized.activate = typeof normalized.activate === 'function' ? normalized.activate : null;
            normalized.deactivate = typeof normalized.deactivate === 'function' ? normalized.deactivate : null;
            this.descriptors.set(normalized.key, normalized);
            return normalized;
        }

        registerAll(descriptors) {
            descriptors.forEach(descriptor => this.register(descriptor));
            return this;
        }

        get(key) {
            return this.descriptors.get(key) || null;
        }

        getContainer(key) {
            const descriptor = this.get(key);
            return descriptor ? this.document?.getElementById(descriptor.containerId) : null;
        }

        async ensureLoaded(key) {
            const descriptor = this.get(key);
            if (!descriptor) throw new Error(`Unknown page: ${key}`);
            const container = this.getContainer(key);
            if (!container) throw new Error(`Missing page container: ${descriptor.containerId}`);
            if (container.dataset.pageLoaded === 'true') return container;
            if (this.loadPromises.has(key)) return this.loadPromises.get(key);

            const promise = (async () => {
                if (descriptor.fragment) {
                    if (!this.fetch) throw new Error(`Fetch is unavailable for page fragment: ${key}`);
                    const response = await this.fetch(descriptor.fragment, { credentials: 'same-origin', cache: 'no-cache' });
                    if (!response.ok) throw new Error(`Failed to load ${key} fragment: HTTP ${response.status}`);
                    container.innerHTML = await response.text();
                }
                if (descriptor.load && !this.loadedFeatures.has(key)) {
                    await descriptor.load({ key, descriptor, container, registry: this });
                    this.loadedFeatures.add(key);
                }
                container.dataset.pageLoaded = 'true';
                return container;
            })();

            this.loadPromises.set(key, promise);
            try {
                return await promise;
            } catch (error) {
                this.loadPromises.delete(key);
                container.dataset.pageLoaded = 'false';
                throw error;
            }
        }

        async activate(key, context = {}) {
            const descriptor = this.get(key);
            if (!descriptor) throw new Error(`Unknown page: ${key}`);
            const previousPage = this.activeKey;
            if (previousPage && previousPage !== key) {
                const previous = this.get(previousPage);
                if (previous?.deactivate) {
                    await previous.deactivate({ key: previousPage, nextPage: key, descriptor: previous, container: this.getContainer(previousPage), registry: this });
                }
            }
            const container = await this.ensureLoaded(key);
            this.activeKey = key;
            if (descriptor.activate) await descriptor.activate({ key, previousPage, descriptor, container, registry: this, ...context });
            const detail = { page: key, previousPage };
            const EventCtor = global.CustomEvent;
            const event = typeof EventCtor === 'function' ? new EventCtor('page:changed', { detail }) : { type: 'page:changed', detail };
            this.eventTarget?.dispatchEvent?.(event);
            return container;
        }

        async deactivate(key = this.activeKey, context = {}) {
            const descriptor = this.get(key);
            if (!descriptor) return;
            if (descriptor.deactivate) await descriptor.deactivate({ key, descriptor, container: this.getContainer(key), registry: this, ...context });
            if (this.activeKey === key) this.activeKey = null;
        }
    }

    global.PageRegistry = PageRegistry;
    if (typeof module !== 'undefined' && module.exports) module.exports = { PageRegistry, DESCRIPTOR_FIELDS };
})(typeof window !== 'undefined' ? window : globalThis);
