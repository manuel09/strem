// ====================================================================
// SETUP E DIPENDENZE
// ====================================================================

// Importiamo addonBuilder e serveHTTP dall'SDK
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
// Importazione di 'node-fetch' per le chiamate API
const { default: fetch } = require('node-fetch');

// ====================================================================
// !!! ⚠️ CONFIGURAZIONE NECESSARIA ⚠️ !!!
// ====================================================================

// 1. CHIAVE API DI THE MOVIE DATABASE (TMDB) - SOSTITUISCI CON LA TUA CHIAVE!
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// URL di base della tua API VixSrc
const VIXSRC_BASE_URL = 'https://vixsrc.to';

// LIMITE DEL CATALOGO: Quanti ID TMDB processare per il catalogo
const CATALOG_LIMIT = 200;

// ====================================================================
// MANIFEST E INIZIALIZZAZIONE
// ====================================================================

const MANIFEST = {
    id: 'org.vixsrc.stremioaddon',
    version: '1.0.5', // Versione aggiornata
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

/**
 * Recupera i dettagli di base (titolo, poster) da TMDB.
 */
async function getTmdbDetails(tmdbId, type) {
    const tmdbType = (type === 'series') ? 'tv' : 'movie';
    const detailUrl = `${TMDB_BASE_URL}/${tmdbType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=it-IT`;

    try {
        const response = await fetch(detailUrl);
        if (!response.ok) {
            console.warn(`[TMDB API] Impossibile recuperare i dettagli per ID ${tmdbId}`);
            return null;
        }
        const data = await response.json();

        return {
            id: `tmdb:${tmdbId}`,
            type: type,
            name: data.title || data.name || `ID TMDB ${tmdbId}`,
            poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
        };
    } catch (error) {
        console.error(`[TMDB API] Errore durante il recupero per ${tmdbId}:`, error.message);
        return null;
    }
}

// ====================================================================
// 1. CATALOG HANDLER (Lista di Contenuti)
// ====================================================================

builder.defineCatalogHandler(async (args) => {
    const apiType = (args.type === 'series') ? 'tv' : 'movie';
    const vixsrcListUrl = `${VIXSRC_BASE_URL}/api/list/${apiType}?lang=it`;

    console.log(`[CATALOG] Richiesta lista VixSrc: ${vixsrcListUrl}`);

    try {
        const listResponse = await fetch(vixsrcListUrl);
        if (!listResponse.ok) {
            console.error(`[CATALOG] Errore API VixSrc: Status ${listResponse.status}`);
            return { metas: [] };
        }
        const listData = await listResponse.json();

        const tmdbIds = listData
        .filter(item => item && item.tmdb_id)
        .map(item => item.tmdb_id)
        .slice(0, CATALOG_LIMIT);

        console.log(`[CATALOG] Trovati ${tmdbIds.length} ID. Richiesta Metadati a TMDB...`);

        const detailPromises = tmdbIds.map(id => getTmdbDetails(id, args.type));

        const metas = (await Promise.all(detailPromises))
        .filter(meta => meta !== null);

        console.log(`[CATALOG] Restituiti ${metas.length} elementi a Stremio.`);

        return { metas: metas };

    } catch (error) {
        console.error('[CATALOG] Errore Grave:', error);
        return { metas: [] };
    }
});


// ====================================================================
// 2. STREAM HANDLER (I Link per la Riproduzione)
// ====================================================================

builder.defineStreamHandler(async (args) => {
    const streams = [];
    const id = args.id;
    const type = args.type;

    console.log(`[STREAM] Richiesta INIZIO per ID: ${id}, Tipo: ${type}`);

    const parts = id.split(':');
    const tmdbId = parts[1];

    let streamUrl = '';

    if (!tmdbId) {
        console.warn(`[STREAM] ID TMDB mancante per ${id}`);
        return { streams: [] };
    }

    if (type === 'movie') {
        // Film: https://vixsrc.to/movie/{tmdbId}
        streamUrl = `${VIXSRC_BASE_URL}/movie/${tmdbId}`;

    } else if (type === 'series' && parts.length === 4) {
        // Serie TV: https://vixsrc.to/tv/{tmdbId}/{season}/{episode}
        const season = parts[2];
        const episode = parts[3];
        streamUrl = `${VIXSRC_BASE_URL}/tv/${tmdbId}/${season}/${episode}`;
    }

    if (streamUrl) {
        // Parametri per l'iframe embed del player
        const params = 'primaryColor=B20710&secondaryColor=170000&lang=it&autoplay=true';

        streams.push({
            url: `${streamUrl}?${params}`,
            title: 'VixSrc Embed Player',
            name: 'VixSrc',
        });
    }

    console.log(`[STREAM] Trovati ${streams.length} streams per ${id}. URL generato: ${streamUrl}`);

    return { streams: streams };
});

// ====================================================================
// AVVIO DEL SERVER (METODO STABILE SDK)
// ====================================================================

const PORT = 7000;

// Utilizziamo serveHTTP per avviare il server.
serveHTTP(builder.getInterface(), { port: PORT });

console.log('----------------------------------------------------');
console.log('🚀 Addon VixSrc in esecuzione.');
console.log(`Porta Locale: ${PORT}`);
console.log(`URL MANIFEST: http://127.0.0.1:${PORT}/manifest.json`);
console.log('Installalo in Stremio incollando l\'URL qui sopra.');
console.log('----------------------------------------------------');
