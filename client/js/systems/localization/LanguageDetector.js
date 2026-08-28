export class LanguageDetector {

    constructor(
        availableLanguages,
        defaultLanguages = ["en-US", "de-DE"]
    ) {
        this.availableLanguages = availableLanguages;
        this.defaultLanguages = defaultLanguages;
    }

    detect() {

        const browserLanguages =
            navigator.languages?.length
                ? navigator.languages
                : [navigator.language];

        // Exakte Übereinstimmung
        for (const browserLanguage of browserLanguages) {

            const match = this.availableLanguages.find(
                language =>
                    language.toLowerCase() ===
                    browserLanguage.toLowerCase()
            );

            if (match) {
                return match;
            }
        }

        // Gleiche Sprache, andere Region
        for (const browserLanguage of browserLanguages) {

            const languageCode =
                browserLanguage
                    .split("-")[0]
                    .toLowerCase();

            const match = this.availableLanguages.find(
                language =>
                    language
                        .split("-")[0]
                        .toLowerCase() ===
                    languageCode
            );

            if (match) {
                return match;
            }
        }

        // Fallback
        for (const defaultLanguage of this.defaultLanguages) {

            if (this.availableLanguages.includes(defaultLanguage)) {
                return defaultLanguage;
            }
        }

        throw new Error("Keine verfügbare Sprache gefunden.");
    }
}