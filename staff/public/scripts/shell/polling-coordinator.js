(function installPollingCoordinator(global) {
    'use strict';

    class PollingCoordinator {
        constructor(options = {}) {
            this.eventTarget = options.eventTarget || global.document;
            this.visibilityTarget = options.visibilityTarget || global.document;
            this.setTimeout = options.setTimeout || global.setTimeout?.bind(global);
            this.clearTimeout = options.clearTimeout || global.clearTimeout?.bind(global);
            this.AbortController = options.AbortController || global.AbortController;
            this.jobs = new Map();
            this.activePage = null;
            this.visible = this.visibilityTarget?.visibilityState !== 'hidden';
            this.destroyed = false;
            this.handlePageChanged = event => this.setActivePage(event?.detail?.page || null);
            this.handleVisibilityChanged = () => {
                this.visible = this.visibilityTarget?.visibilityState !== 'hidden';
                this.reconcile();
            };
            this.eventTarget?.addEventListener?.('page:changed', this.handlePageChanged);
            this.visibilityTarget?.addEventListener?.('visibilitychange', this.handleVisibilityChanged);
        }

        register(key, options = {}) {
            if (!key || typeof options.run !== 'function') {
                throw new Error('Polling job requires a key and run function');
            }
            this.unregister(key);
            const interval = Math.max(1000, Number(options.interval) || 30000);
            const job = {
                key,
                page: options.page || null,
                interval,
                backoff: Math.max(interval, Number(options.backoff) || interval * 2),
                run: options.run,
                when: typeof options.when === 'function' ? options.when : null,
                immediate: options.immediate !== false,
                timer: null,
                controller: null,
                inFlight: false,
                runToken: 0
            };
            this.jobs.set(key, job);
            this.reconcileJob(job);
            return () => this.unregister(key);
        }

        unregister(key) {
            const job = this.jobs.get(key);
            if (!job) return;
            this.stopJob(job);
            this.jobs.delete(key);
        }

        setActivePage(page) {
            this.activePage = page || null;
            this.reconcile();
        }

        isEligible(job) {
            if (this.destroyed || !this.visible) return false;
            if (job.page && job.page !== this.activePage) return false;
            return !job.when || Boolean(job.when());
        }

        reconcile() {
            this.jobs.forEach(job => this.reconcileJob(job));
        }

        reconcileJob(job) {
            if (!this.isEligible(job)) {
                this.stopJob(job);
                return;
            }
            if (!job.timer && !job.inFlight) {
                this.schedule(job, job.immediate ? 0 : job.interval);
                job.immediate = false;
            }
        }

        schedule(job, delay) {
            if (!this.isEligible(job) || job.timer || job.inFlight) return;
            job.timer = this.setTimeout(() => {
                job.timer = null;
                this.execute(job);
            }, Math.max(0, delay));
        }

        async execute(job) {
            if (!this.isEligible(job) || job.inFlight) return;
            const token = ++job.runToken;
            const controller = this.AbortController ? new this.AbortController() : null;
            job.controller = controller;
            job.inFlight = true;
            let nextDelay = job.interval;
            try {
                await job.run({
                    key: job.key,
                    page: this.activePage,
                    signal: controller?.signal,
                    coordinator: this
                });
            } catch (error) {
                if (error?.name !== 'AbortError') nextDelay = job.backoff;
            } finally {
                if (job.runToken !== token) return;
                job.controller = null;
                job.inFlight = false;
                if (this.isEligible(job)) this.schedule(job, nextDelay);
            }
        }

        trigger(key) {
            const job = this.jobs.get(key);
            if (!job || !this.isEligible(job)) return false;
            this.stopJob(job);
            this.schedule(job, 0);
            return true;
        }

        stopJob(job) {
            if (job.timer) {
                this.clearTimeout(job.timer);
                job.timer = null;
            }
            if (job.controller) job.controller.abort();
            job.controller = null;
            job.inFlight = false;
            job.runToken += 1;
        }

        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.jobs.forEach(job => this.stopJob(job));
            this.jobs.clear();
            this.eventTarget?.removeEventListener?.('page:changed', this.handlePageChanged);
            this.visibilityTarget?.removeEventListener?.('visibilitychange', this.handleVisibilityChanged);
        }
    }

    global.PollingCoordinator = PollingCoordinator;
    if (typeof module !== 'undefined' && module.exports) module.exports = { PollingCoordinator };
})(typeof window !== 'undefined' ? window : globalThis);
