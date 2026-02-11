import { FillerWordConfig } from './types';

const config: FillerWordConfig = {
  language: 'es',
  name: 'Spanish',

  tier1Fillers: new Set([
    'eh', 'ehh', 'eeh',
    'ah', 'ahh',
    'em', 'emm',
    'um', 'umm',
    'mm', 'mmm', 'hmm',
    'este',          // very common Mexican Spanish filler
    'este...',
  ]),

  tier2Fillers: new Set([
    'o sea',         // "I mean"
    'tipo',          // "like" (informal)
    'básicamente',   // "basically"
    'literalmente',  // "literally"
    'obviamente',    // "obviously"
    'digamos',       // "let's say"
    'la verdad',     // "the truth is"
  ]),

  tier3Fillers: new Set([
    'bueno',         // "well/good"
    'pues',          // "well/so"
    'entonces',      // "then/so"
    'mira',          // "look"
    'oye',           // "hey/listen"
    'vale',          // "okay" (Spain)
    'dale',          // "okay" (Argentina)
    'sí',            // "yes" — filler when not answering
    'no',            // "no" — filler tag
    'claro',         // "of course"
    'verdad',        // "right?" — tag question
  ]),

  fillerPatterns: [
    /^e+h+$/i,        // eh, ehh, eeh
    /^a+h+$/i,        // ah, ahh
    /^e+m+$/i,        // em, emm
    /^u+m+$/i,        // um, umm
    /^[hm]+m*$/i,     // hmm, mm
  ],

  fillerPhrases: [
    'o sea',
    'es que',        // "the thing is"
    'sabes',         // "you know"
    'tú sabes',
    'me entiendes',  // "you understand me"
    'por así decirlo', // "so to speak"
    'cómo se dice',  // "how do you say"
    'la cosa es que', // "the thing is that"
    'en plan',       // "like" (Spain)
  ],

  commonPhrasesToSkip: new Set([
    'yo creo', 'es que', 'hay que', 'se puede',
    'en el', 'de la', 'por el', 'con el',
    'lo que', 'es un', 'es una', 'yo soy',
  ]),
};

export default config;
