import { customAlphabet } from "nanoid";

const ADJECTIVES = [
  "able", "bold", "brave", "bright", "brisk", "calm", "clever", "cool", "cosy", "crisp",
  "curly", "daring", "eager", "fair", "fancy", "fast", "fluffy", "fresh", "gentle", "glad",
  "golden", "grand", "happy", "hidden", "honest", "humble", "jolly", "keen", "kind", "lively",
  "lucky", "mellow", "merry", "mighty", "misty", "modest", "neat", "nimble", "noble", "polite",
  "proud", "quick", "quiet", "rapid", "rosy", "shiny", "silent", "silver", "sleepy", "smart",
  "snowy", "sunny", "swift", "tidy", "tiny", "vivid", "warm", "wild", "wise", "witty",
];

const ANIMALS = [
  "badger", "bear", "beaver", "bee", "bison", "cat", "cheetah", "crane", "crow", "deer",
  "dolphin", "dove", "duck", "eagle", "falcon", "ferret", "finch", "fox", "gecko", "goose",
  "hare", "hawk", "hedgehog", "heron", "horse", "koala", "lemur", "lion", "llama", "lynx",
  "magpie", "marten", "mole", "moose", "otter", "owl", "panda", "parrot", "penguin", "pigeon",
  "puffin", "quail", "rabbit", "raven", "robin", "seal", "shark", "sloth", "sparrow", "squid",
  "swan", "tiger", "toucan", "turtle", "walrus", "weasel", "whale", "wolf", "wombat", "yak",
];

const digits = customAlphabet("0123456789", 3);

function pick(words: string[]) {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return words[n % words.length];
}

export function randomLocalPart() {
  return `${pick(ADJECTIVES)}.${pick(ANIMALS)}${digits()}`;
}
