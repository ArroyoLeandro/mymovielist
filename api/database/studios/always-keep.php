<?php

// Titles that are never filtered by the vote threshold nor pruned (they must still be reachable by a studio source).
// Format: 'movie:<tmdb_id>' or 'tv:<tmdb_id>'. WDAS canon needs no entry: its sections use 'keep_all' => true.
// Titles with watch entries (or in any other user table) are protected automatically; list only deliberate keeps here.
return [
    'movie:683127',  // Earwig y la bruja (Ghibli)
    'tv:3478',       // Star Wars: Ewoks
    'tv:25',         // Star Wars: Droids
    'movie:14903',   // Winnie Pooh: su gran aventura
    'movie:13691',   // La gran película de Piglet
    'movie:20771',   // Kim Possible: Todo un drama
    'movie:15403',   // Ben 10: El secreto del Omnitrix
    'movie:96826',   // Ben 10: destrucción alienígena
    'movie:354857',  // Un show más: La película
    'movie:34766',   // Zenon: La chica del siglo 21
    'movie:24020',   // Contra corriente (Johnny Tsunami)
    'movie:61717',   // Wendy Wu: La chica kung-fu
    'tv:3200',       // Even Stevens
    'tv:1528',       // Phil del futuro
    'tv:119',        // Cory en la Casa Blanca
];
