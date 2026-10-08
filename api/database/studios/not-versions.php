<?php

// Pairs that share a version key (same Spanish or original title) but are different works, so "Otras versiones"
// must not link them. Each entry is two refs, 'movie:<tmdb_id>' / 'tv:<tmdb_id>', in any order.
return [
    ['movie:14292', 'tv:92967'],   // Milagro (Miracle, 2004) / El milagro (Mucize Doktor)
    ['tv:1622', 'movie:5876'],     // Sobrenatural (Supernatural) / Sobre-Natural (The Mist)
    ['tv:49010', 'movie:103663'],  // La caza (The Fall) / La caza (Jagten)
    ['tv:127235', 'movie:563'],    // Invasión (Invasion) / Invasión (Starship Troopers)
    ['movie:14635', 'tv:79744'],   // El novato (The Rookie, 2002) / The Rookie (series)
    ['movie:382748', 'tv:80986'],  // Stargirl (2020 movie) / DC's Stargirl
];
