window.addEventListener('DOMContentLoaded', () => {
    const menuElement = document.getElementById("menu");
    // if (!menuElement) {
    //    menuElement = document.querySelector("header"); 
    // }
    
    if (menuElement) {
        // Ermittelt den aktuellen Pfad (z. B. "/professions/index.html")
        const path = window.location.pathname;
        
        // Zählt, wie tief die aktuelle Datei im Ordnerbaum liegt
        // Zieht 1 ab für den Dateinamen selbst und ignoriert leere Segmente
        const depth = path.split('/').filter(p => p && !p.endsWith('.html')).length;
        
        // Erzeugt den passenden relativen Root-Pfad (z. B. "" oder "../" oder "../../")
        const root = depth > 0 ? '../'.repeat(depth) : '';

        menuElement.innerHTML = `
            <div class="headline-area">
                <div class="left">🌳</div>
                <div class="right">
                    <h1>Everhome - Dokumentationsportal</h1>
                    <p id="headline">${document.title}</p>
                </div>
            </div>

            <nav>
                <a href="${root}index/index.html">🚀 Start</a>
                <a href="${root}character/index.html">🎭 Charaktere</a>
                <a href="${root}professions/index.html">⛏️ Berufe</a>
                <a href="${root}ressources/index.html">📦 Ressourcen</a>
                <a href="${root}world/index.html">🌍 Die Welt</a>
                <a href="${root}economy/index.html">📊 Wirtschaft & Logistik</a>
                <a href="${root}production/index.html">🔐 Spielregeln & Rechte</a>
                <a href="${root}markting/index.html">📢 Marketing & Business</a>
                <a href="${root}gamedesign/index.html">🎬 Game Design & Produktion</a>
                <a href="${root}tickets/index.html">🎫 Ticketsystem & Feedback</a>
                <a href="${root}progress/index.html">📈 Fortschritt & Dokumentation</a>
                <a href="${root}progress/index.html">❓ Lexikon</a>
            </nav>
            <nav>
                <a href="${root}raw/links.html">⚙️ Links</a>
            </nav>
            
        `;
    }
});
            // <nav>
            //     <a href="${root}housing/index.html">🏠 Häuser & Gebäude</a>
            //     <a href="${root}quests/index.html">🗺️ Quests & NPC</a>
            //     <a href="${root}magic/index.html">🔮 Magie & Runen</a>
            //     <a href="${root}systems/index.html">⚙️ Systeme</a>
            //     <a href="${root}reference/index.html">📚 Referenzen</a>
            //     <a href="${root}gdd/index.html">📝 Gamedesign</a>
            // </nav>

            // <nav>
            //     <a href="${root}index.html">Start</a>
            //     <a href="${root}professions/index.html">Berufe</a>
            //     <a href="${root}world/index.html">Spielwelt</a>
            //     <span width="3em"></span>
            // </nav>
            
            // <nav>
            //     <a href="${root}systems/index.html">Systeme</a>
            //     <a href="${root}open-points.html">Offene Punkte</a>
            //     <a href="${root}progress.html">Fortschritt</a>
            //     <a href="${root}overview.html">Übersichtsbuch</a>
            // </nav>

            // <nav>
            //     <a href="${root}systems/world.html">Spielwelt</a>
            //     <a href="${root}systems/mechanics.html">Mechaniken</a>
            //     <a href="${root}systems/skills.html">Bäume & Berufe</a>
            //     <a href="${root}systems/mining.html">Bergbau</a>
            //     <a href="${root}systems/maps.html">Karten</a>
            //     <a href="${root}systems/housing.html">Gebäude</a>
            //     <a href="${root}systems/economy.html">Wirtschaft</a>
            //     <a href="${root}systems/magic.html">Runen & Juwelen</a>
            //     <a href="${root}systems/start.html">Spielstart</a>
            //     <a href="${root}systems/quests-npc.html">Quests & NPC</a>
            //     <a href="${root}systems/production.html">Rezepte & Produktion</a>
            //     <a href="${root}reference/preismodell.html">Preismodell</a>
            //     <a href="${root}reference/marketing.html">Marketing & Video</a>
            //     <a href="${root}gdd.html">Gamedesign Neu</a>
            //     <a href="${root}gdd/index.html">Gamedesign</a>
            // </nav>
