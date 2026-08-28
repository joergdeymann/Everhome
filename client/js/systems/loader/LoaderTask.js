export class LoaderTask {

    constructor(id, load, options = {}) {

        this.id = id;
        this.loadFunction = load;

        this.required = options.required ?? false;
        this.priority = options.priority ?? 0;

        this.status = "pending";
        this.result = null;
        this.error = null;
    }

    async start() {

        if (this.status === "loaded") {
            return this.result;
        }

        if (this.status === "loading") {
            return this.promise;
        }

        this.status = "loading";

        this.promise = Promise.resolve(
            this.loadFunction()
        )
            .then(result => {

                this.result = result;
                this.status = "loaded";

                return result;
            })
            .catch(error => {

                this.error = error;
                this.status = "error";

                throw error;
            });

        return this.promise;
    }
}