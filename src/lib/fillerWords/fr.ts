import { FillerWordConfig } from './types';

const config: FillerWordConfig = {
  language: 'fr',
  name: 'French',

  tier1Fillers: new Set([
    'euh', 'euuh', 'euhh', 'heu', 'heuu',
    'hum', 'humm', 'hmm', 'hm',
    'ah', 'ahh', 'oh', 'ohh',
    'ben', 'beh',
  ]),

  tier2Fillers: new Set([
    'genre',        // "like" equivalent
    'en fait',      // "actually"
    'du coup',      // "so then"
    'bah',          // hesitation
    'quoi',         // sentence-ending filler
    'franchement',  // "honestly"
    'clairement',   // "clearly"
    'justement',    // "exactly/precisely" as filler
    'carrément',    // "totally"
  ]),

  tier3Fillers: new Set([
    'voilà',        // "there you go" — often a filler
    'bon',          // "well/good"
    'donc',         // "so"
    'alors',        // "so/then"
    'enfin',        // "well/finally"
    'disons',       // "let's say"
    'ouais',        // "yeah"
    'oui',          // "yes"
    'non',          // "no"
    'effectivement', // "indeed"
  ]),

  fillerPatterns: [
    /^eu+h+$/i,       // euh, euuh, euhh
    /^he+u+$/i,       // heu, heuu
    /^hu+m+$/i,       // hum, humm
    /^[hm]+m*$/i,     // hmm, hm
    /^be+[hn]$/i,     // ben, beh
  ],

  fillerPhrases: [
    'tu vois',        // "you see"
    'tu sais',        // "you know"
    'je veux dire',   // "I mean"
    'en gros',        // "basically"
    'comment dire',   // "how to say"
    'c\'est-à-dire',  // "that is to say"
    'si tu veux',     // "if you want"
  ],

  commonPhrasesToSkip: new Set([
    'je pense', 'je crois', 'il y a', 'c\'est',
    'je suis', 'on est', 'il faut', 'on peut',
    'dans le', 'sur le', 'pour le', 'avec le',
  ]),
};

export default config;
