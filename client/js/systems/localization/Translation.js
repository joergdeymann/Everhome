import { LanguageDetector } from "./LanguageDetector.js";

export class Translation {

    constructor(availableLanguages) {

        this.languageDetector =
            new LanguageDetector(availableLanguages);

        this.data = {};
        this.language = null;
        this.loaded = false;
    }

    async load() {

        const language =
            this.languageDetector.detect();

        console.log("Gewählte Sprache:", language);

        const response = await fetch(
            `/data/translations/${language}.json`
        );

        if (!response.ok) {
            throw new Error(
                `Übersetzung konnte nicht geladen werden: ${language}`
            );
        }

        this.data = await response.json();
        this.language = language;
        this.loaded = true;
        console.log("Übersetzungen:", this.data);
        return this;
    }

    get(category, id) {
        return this.data?.[category]?.[id] ?? id;
    }
}