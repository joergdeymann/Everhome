export class GameLoop {
    constructor(updateInterval = 100) {
        this.updateInterval = updateInterval;

        this.running = false;
        this.lastUpdate = 0;
        this.animationFrame = null;
    }

    start(update) {
        if (this.running) {
            return;
        }

        this.running = true;
        this.lastUpdate = performance.now();

        this.loop(update);
    }

    stop() {
        this.running = false;

        if (this.animationFrame !== null) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    loop(update) {
        if (!this.running) {
            return;
        }

        const now = performance.now();

        if (now - this.lastUpdate >= this.updateInterval) {
            update(now);

            this.lastUpdate = now;
        }

        this.animationFrame = requestAnimationFrame(
            () => this.loop(update)
        );
    }
}