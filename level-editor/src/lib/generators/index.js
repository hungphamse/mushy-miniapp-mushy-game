import { gameMeta as wordGuessMeta, generate as generateWordGuess } from './word-guess.js';

export const generators = {
  [wordGuessMeta.slug]: generateWordGuess,
};

export const generatorMeta = {
  [wordGuessMeta.slug]: wordGuessMeta,
};
