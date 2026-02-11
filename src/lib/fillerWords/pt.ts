import { FillerWordConfig } from './types';

const config: FillerWordConfig = {
  language: 'pt',
  name: 'Portuguese',

  tier1Fillers: new Set([
    'éh', 'éhh',
    'ah', 'ahh',
    'hm', 'hmm', 'hmmm',
    'mm', 'mmm',
    'ahn',
    'uhm', 'um',   // note: 'um' means "one/a" but as a short sound it's a filler
  ]),

  tier2Fillers: new Set([
    'tipo',          // "like"
    'basicamente',   // "basically"
    'literalmente',  // "literally"
    'obviamente',    // "obviously"
    'realmente',     // "really"
    'sinceramente',  // "honestly"
  ]),

  tier3Fillers: new Set([
    'né',            // "right?" — very common Brazilian tag
    'então',         // "so/then"
    'bom',           // "well/good"
    'bem',           // "well"
    'enfim',         // "anyway"
    'pois',          // "well/so"
    'olha',          // "look"
    'tá', 'está',    // "okay"
    'sim',           // "yes" as filler
    'não',           // "no" as tag
    'cara',          // "dude" (Brazilian)
    'assim',         // "like this" — filler in Brazilian Portuguese
  ]),

  fillerPatterns: [
    /^é+h+$/i,        // éh, éhh
    /^a+h+$/i,        // ah, ahh
    /^[hm]+m*$/i,     // hmm, hm, mm
    /^a+hn?$/i,       // ahn
  ],

  fillerPhrases: [
    'sabe',           // "you know"
    'você sabe',      // "you know"
    'quer dizer',     // "I mean"
    'na verdade',     // "actually"
    'por assim dizer', // "so to speak"
    'digamos assim',  // "let's say"
    'como eu disse',  // "as I said"
  ],

  commonPhrasesToSkip: new Set([
    'eu acho', 'eu penso', 'a gente', 'tem que',
    'no que', 'do que', 'para o', 'com o',
    'isso é', 'eu sou', 'nós somos',
  ]),
};

export default config;
