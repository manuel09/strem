// ====================================================================
// SETUP E DIPENDENZE
// ====================================================================

// Reintroduciamo serveHTTP, necessario per l'hosting tradizionale (Render)
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk'); 
const { default: fetch } = require('node-fetch'); 

// ====================================================================
// !!! ⚠️ CONFIGURAZIONE NECESSARIA ⚠️ !!!
// ====================================================================

// La chiave verrà letta dalla variabile d'ambiente 'TMDB_API_KEY' su Render
const TMDB_API_KEY = process.env.TMDB_API_KEY; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// URL di base della tua API VixSrc
const VIXSRC_BASE_URL = 'https://vixsrc.to';

// LIMITE DEL CATALOGO
const CATALOG_LIMIT = 200;

// ====================================================================
// MANIFEST E INIZIALIZZAZIONE
// ====================================================================

const MANIFEST = {
    id: 'org.vixsrc.stremioaddon', 
    version: '1.0.9', // Versione aggiornata
    name: 'VixSrc API Addon',
    description: 'Addon che integra i contenuti VixSrc usando gli ID TMDB.',
    resources: ['catalog', 'stream'], 
    types: ['movie', 'series'],      
    idPrefixes: ['tmdb'],           
    catalogs: [
        {
            type: 'movie',
            id: 'vixsrc_movies_recent', 
            name: 'VixSrc Film Recenti',
            extra: [{ name: 'search' }, { name: 'genre' }]
        },
        {
            type: 'series',
            id: 'vixsrc_series_recent',
            name: 'VixSrc Serie TV Recenti',
            extra: [{ name: 'search' }, { name: 'genre' }]
        }
    ],
};

const builder = new addonBuilder(MANIFEST);

// ====================================================================
// FUNZIONI DI UTILITY
// ====================================================================

async function getTmdbDetails(tmdbId, type) {
    if (!TMDB_API_KEY) {
        console.error('[TMDB API] Chiave API mancante. Impossibile recuperare i dettagli.');
        return null; 
    }
    const tmdbType = (type === 'series') ? 'tv' : 'movie';
    const detailUrl = `${TMDB_BASE_URL}/${tmdbType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=it-IT`;
    
    try {
        const response = await fetch(detailUrl);
        if (!response.ok) return null;
        const data = await response.json();
        return {
            id: `tmdb:${tmdbId}`, 
            type: type,
            name: data.title || data.name || `ID TMDB ${tmdbId}`, 
            poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
        };
    } catch (error) {
        console.error(`[TMDB API] Errore:`, error.message);
        return null;
    }
}

// ====================================================================
// 1. CATALOG HANDLER (RIPRISTINATO E POTENZIATO PER DEBUG)
// ====================================================================

builder.defineCatalogHandler(async (args) => {
    const apiType = (args.type === 'series') ? 'tv' : 'movie'; 
    const vixsrcListUrl = `${VIXSRC_BASE_URL}/api/list/${apiType}?lang=it`;

    console.log(`[CATALOG] Inizio richiesta per ${args.type}. URL VixSrc: ${vixsrcListUrl}`);

    try {
        const listResponse = await fetch(vixsrcListUrl);
        
        if (!listResponse.ok) {
            console.error(`[CATALOG ERROR] Chiamata a VixSrc fallita! Status: ${listResponse.status} ${listResponse.statusText}`);
            // Restituisce un errore se la prima chiamata fallisce
            return { metas: [] };
        }
        
        const listData = await listResponse.json();
        
        const tmdbIds = listData
            .filter(item => item && item.tmdb_id)
            .map(item => item.tmdb_id)
            .slice(0, CATALOG_LIMIT); 

        console.log(`[CATALOG] Trovati ${tmdbIds.length} ID TMDB da VixSrc. Avvio fetch TMDB...`);

        // Questa è la parte che richiede la chiave TMDB
        const detailPromises = tmdbIds.map(id => getTmdbDetails(id, args.type));
        
        const metas = (await Promise.all(detailPromises))
            .filter(meta => meta !== null); 

        console.log(`[CATALOG] Elaborazione terminata. Restituiti ${metas.length} metadati (su ${tmdbIds.length} originali).`);
        
        return { metas: metas };
        
    } catch (error) {
        console.error('[CATALOG ERRORE GRAVE] Eccezione non gestita durante il fetch o il parsing:', error.message);
        return { metas: [] };
    }
});


// ====================================================================
// 2. STREAM HANDLER
// ====================================================================

builder.defineStreamHandler(async (args) => {
    const streams = [];
    const id = args.id; 
    const type = args.type;

    console.log(`[STREAM] Richiesta INIZIO per ID: ${id}, Tipo: ${type}`); 
    
    const parts = id.split(':'); 
    const tmdbId = parts[1];
    let streamUrl = '';

    if (!tmdbId) return { streams: [] };

    if (type === 'movie') {
        streamUrl = `${VIXSRC_BASE_URL}/movie/${tmdbId}`;
    } else if (type === 'series' && parts.length === 4) {
        const season = parts[2];
        const episode = parts[3];
        streamUrl = `${VIXSRC_BASE_URL}/tv/${tmdbId}/${season}/${episode}`;
    }

    if (streamUrl) {
        const params = 'primaryColor=B20710&secondaryColor=170000&lang=it&autoplay=true';
        streams.push({
            url: `${streamUrl}?${params}`,
            title: 'VixSrc Embed Player',
            name: 'VixSrc', 
        });
        console.log(`[STREAM] Trovato URL stream: ${streams[0].url}`);
    }

    return { streams: streams };
});

// ====================================================================
// 3. AVVIO SERVER PER RENDER.COM
// ====================================================================

// Render userà la variabile d'ambiente PORT. Usiamo 7000 come fallback locale.
const PORT = process.env.PORT || 7000; 

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`🚀 Addon VixSrc in ascolto sulla porta ${PORT}.`);
