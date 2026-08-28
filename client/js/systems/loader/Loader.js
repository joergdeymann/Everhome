import { LoaderTask } from "./LoaderTask.js";

export class Loader {

    constructor() {
        this.tasks = new Map();
    }

    add(id, load, options = {}) {

        const task = new LoaderTask(
            id,
            load,
            options
        );

        this.tasks.set(id, task);

        return task;
    }

    get(id) {
        return this.tasks.get(id);
    }

    async load(id) {

        const task = this.get(id);

        if (!task) {
            throw new Error(
                `LoaderTask "${id}" nicht gefunden.`
            );
        }

        return task.start();
    }

    async loadRequired() {

        const tasks = [...this.tasks.values()]
            .filter(task => task.required)
            .sort((a, b) => b.priority - a.priority);

        return Promise.all(
            tasks.map(task => task.start())
        );
    }

    startBackground() {

        const tasks = [...this.tasks.values()]
            .filter(task => !task.required)
            .sort((a, b) => b.priority - a.priority);

        for (const task of tasks) {

            task.start().catch(error => {
                console.error(
                    `Fehler beim Laden von "${task.id}":`,
                    error
                );
            });
        }
    }
}