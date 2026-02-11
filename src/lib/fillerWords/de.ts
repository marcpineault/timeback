import { FillerWordConfig } from './types';

const config: FillerWordConfig = {
  language: 'de',
  name: 'German',

  tier1Fillers: new Set([
    'äh', 'ähh', 'ääh',
    'ähm', 'ähmm',
    'öh', 'öhm',
    'hm', 'hmm', 'hmmm',
    'mm', 'mmm',
  ]),

  tier2Fillers: new Set([
    'quasi',         // "sort of"
    'sozusagen',     // "so to speak"
    'halt',          // filler particle
    'eben',          // "just/exactly"
    'irgendwie',     // "somehow" as filler
    'praktisch',     // "practically"
    'eigentlich',    // "actually"
    'grundsätzlich', // "basically"
    'tatsächlich',   // "indeed"
  ]),

  tier3Fillers: new Set([
    'also',          // "so/well"
    'ja',            // "yes" — very common filler particle
    'naja',          // "well"
    'gut',           // "good/well"
    'genau',         // "exactly"
    'ok', 'okay',
    'ne', 'nee',     // "no/right?" — tag
    'oder',          // "or/right?" — tag
    'so',            // "so"
    'nun',           // "now/well"
    'schon',         // "already" as filler
  ]),

  fillerPatterns: [
    /^ä+h+m?$/i,      // äh, ähm, ääh
    /^ö+h+m?$/i,      // öh, öhm
    /^[hm]+m*$/i,      // hmm, hm, mm
  ],

  fillerPhrases: [
    'sag mal',        // "say/tell me"
    'weißt du',       // "you know"
    'ich mein',       // "I mean"
    'ich meine',      // "I mean"
    'sage ich mal',   // "let me say"
    'wie gesagt',     // "as I said"
    'im Grunde',      // "basically"
    'im Prinzip',     // "in principle"
    'na ja',          // "well"
  ],

  commonPhrasesToSkip: new Set([
    'ich denke', 'ich glaube', 'es gibt', 'man kann',
    'in der', 'auf der', 'mit dem', 'für die',
    'das ist', 'es ist', 'ich bin', 'wir sind',
  ]),
};

export default config;
