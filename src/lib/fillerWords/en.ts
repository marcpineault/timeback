import { FillerWordConfig } from './types';

const config: FillerWordConfig = {
  language: 'en',
  name: 'English',

  // Tier 1: Pure hesitation sounds — always fillers
  tier1Fillers: new Set([
    'um', 'uh', 'umm', 'uhh', 'uhm', 'uhhh', 'ummm',
    'er', 'err', 'erm',
    'ah', 'ahh',
    'hmm', 'hm', 'hmmm', 'mm', 'mmm', 'mhm', 'mmhm',
    'huh',
  ]),

  // Tier 2: Usually fillers, but can be meaningful in some sentences.
  // Light context check: only flag when preceded/followed by a pause > 0.3s
  // or when the word's duration is < 0.3s (rushed filler).
  tier2Fillers: new Set([
    'like',       // filler vs "I like pizza" vs "looks like"
    'basically',
    'essentially',
    'literally',
    'actually',
    'technically',
    'obviously',
    'clearly',
    'honestly',
    'frankly',
    'totally',
    'definitely',
    'anyway', 'anyways', 'anyhow',
  ]),

  // Tier 3: Meaningful words that are SOMETIMES fillers.
  // Only flag when there's strong evidence: gap > 0.5s on both sides,
  // GPT confirmation, or audio-level confirmation.
  tier3Fillers: new Set([
    'so',
    'well',
    'now',
    'but',
    'just',
    'right',
    'okay', 'ok', 'alright',
    'yeah', 'yep', 'yup', 'ya', 'yah',
    'yes',
    'no', 'nope', 'nah',
    'really',
    'maybe', 'perhaps', 'probably',
  ]),

  // Regex patterns for hesitation-sound variations
  fillerPatterns: [
    /^u+[hm]+$/i,           // um, uh, umm, uhh, uhhm
    /^[ae]+[hm]+$/i,        // ah, ahm, eh, ehm
    /^[hm]+m*$/i,           // hmm, hmmm, mm, mmm, hm
    /^e+r+$/i,              // er, err, errr
    /^o+h+$/i,              // oh, ohh
    /^a+h+$/i,              // ah, ahh
    /^u+h*$/i,              // uh, u, uhh (standalone)
    /^m+$/i,                // m, mm, mmm
    /^h+m+$/i,              // hm, hmm
  ],

  fillerPhrases: [
    'you know',
    'i mean',
    'kind of',
    'sort of',
    'you know what',
    'like i said',
    'to be honest',
    'at the end of the day',
    'if you will',
    'so to speak',
    'if that makes sense',
    'or whatever',
  ],

  commonPhrasesToSkip: new Set([
    'i think', 'you know', 'i mean', 'and then', 'but then',
    'so then', 'and so', 'but i', 'and i', 'so i',
    'i was', 'it was', 'that was', 'this is', 'that is',
    'there is', 'here is', 'i have', 'you have', 'we have',
    'i want', 'you want', 'we want', 'i need', 'you need',
    'we need', 'to the', 'in the', 'on the', 'at the',
    'for the', 'with the', 'from the', 'of the', 'is the',
    'are the', 'was the', 'were the',
  ]),
};

export default config;
