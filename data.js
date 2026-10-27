export const CATS = [
  { id: 'daily', title: 'Daily habit', tagline: 'Quick brain boosters', about: 'Two minutes a day builds the habit.', bg: '#CECBF6', fg: '#26215C', panel: '#E4E2FA', tagInk: '#4F4A8A' },
  { id: 'concept', title: 'Concept builders', tagline: 'Build your skills', about: 'Go deeper: order, match, sort and solve.', bg: '#B5D4F4', fg: '#042C53', panel: '#DCEAF9', tagInk: '#2B5A8A' },
  { id: 'current', title: 'Staying current', tagline: 'Stay ahead', about: 'What is changing in AdTech. Coming soon.', bg: '#FAEEDA', fg: '#633806', panel: '#FBF3E4', tagInk: '#7A4A12' },
  { id: 'fun', title: 'Fun and fast', tagline: 'Quick and fun', about: 'Fast, playful rounds. Coming soon.', bg: '#D3D1C7', fg: '#2C2C2A', panel: '#E9E8E2', tagInk: '#4A4A46' }
];

export const CURRENCY = 'AdCoins';

/* Shop. Admins can change these numbers in Game settings. */
export const SHOP_DEFAULTS = { adHintPrice: 20, adHintMax: 10, giftMax: 500 };
export const SHOP_SOON = [
  { id: 'themes', title: 'Colour themes', icon: 'palette', text: 'Make AdVenture mint, sunset or midnight.' },
  { id: 'shield', title: 'Streak shield', icon: 'shield-check', text: 'Miss one day without losing your streak.' },
  { id: 'titles', title: 'Companion titles', icon: 'id-badge-2', text: 'Show a title such as Yield Hunter on your profile.' },
  { id: 'costumes', title: 'Pet costumes', icon: 'hanger', text: 'Hats and scarves for your companion.' }
];

/* Pets. Images live in /pets as {id}-{mood}.webp (or .png). Moods without an image map to the closest real one (see ui.js). */
export const PETS = [
  { id: 'penguin', name: 'Waddles', species: 'Penguin', emoji: '\u{1F427}', line: 'I slide along the ad path from page load to impression.' },
  { id: 'panda', name: 'Bamboo', species: 'Panda', emoji: '\u{1F43C}', line: 'Calm and careful. I like finding the right pairs.' },
  { id: 'cat', name: 'Whiskers', species: 'Cat', emoji: '\u{1F431}', line: 'Curious and a little sceptical. I question everything.' },
  { id: 'elephant', name: 'Ellie', species: 'Elephant', emoji: '\u{1F418}', line: 'I never forget a word, a clue or a question you have seen.' },
  { id: 'rabbit', name: 'Hopper', species: 'Rabbit', emoji: '\u{1F430}', line: 'Quick starts and daily habits are my thing.' },
  { id: 'tiger', name: 'Stripes', species: 'Tiger', emoji: '\u{1F42F}', line: 'Sharp eyes. I spot what does not belong.' },
  { id: 'bear', name: 'Bruno', species: 'Bear', emoji: '\u{1F43B}', line: 'Tidy and organised. I stack everything in its place.' },
  { id: 'dog', name: 'Biscuit', species: 'Dog', emoji: '\u{1F436}', line: 'Loyal and eager. I fetch the meaning of every acronym.' }
];
export const MOODS = ['hello', 'explain', 'celebrate', 'happy', 'think', 'correct', 'oops', 'encourage', 'proud', 'streak', 'sleepy', 'hurt'];

const SCORE10 = '10 AdCoins for each correct answer. 20 more for a perfect round with no hints.';
export const GAMES = [
  { id: 'brain-gym', cat: 'practice', practice: true, earn: 'No AdCoins: it is practice.', title: 'Brain gym', tag: 'Practise your weak spots', icon: 'barbell', kind: 'practice', live: true, size: 5, pet: 'bear',
    blurb: 'A short round made from questions you got wrong before.',
    how: { steps: ['Up to five questions you missed before appear, easy ones first.', 'Answer each one. You see straight away if you were right, and why.', 'Every one you get right is cleared from your weak spots.'],
      example: 'A myth or fact you got wrong last week comes back for another try.', scoring: 'Brain gym does not earn AdCoins and does not change your streak, so there is no pressure.' } },
  { id: 'daily-warmup', cat: 'daily', earn: 'Up to 50 AdCoins a round, plus a 30 AdCoin bonus the first time each day.', title: 'Daily warm-up', tag: 'Start your day sharp', icon: 'sun', kind: 'mission', live: true, pet: 'rabbit',
    blurb: 'Three quick puzzles picked just for you each day.',
    how: { steps: ['Three questions appear, one at a time.', 'Answer each one. You see straight away if you were right, and why.', 'Finish all three to complete today\'s mission and earn a bonus.'],
      example: 'Question 1 might be a myth or fact about fill rate.', scoring: SCORE10 + ' Finishing the mission earns a 30 AdCoin bonus once a day.' } },
  { id: 'myth-or-fact', cat: 'daily', earn: 'Up to 80 AdCoins a round: 10 per right answer, +20 for a perfect round.', title: 'Myth or fact', tag: 'Spot the myth', icon: 'bulb', kind: 'tf', live: true, size: 6, pet: 'cat',
    blurb: 'Decide if each statement is true, then see why.',
    how: { steps: ['Read the statement.', 'Tap Myth if it is false, or Fact if it is true.', 'Read the explanation. That is where the learning happens.'],
      example: '"Ad requests and impressions are the same thing." The right answer is Myth.', scoring: SCORE10 } },
  { id: 'acronym-decoder', cat: 'daily', earn: 'Up to 80 AdCoins a round: 10 per right answer, +20 for a perfect round.', title: 'Acronym decoder', tag: 'Crack the letters', icon: 'abc', kind: 'mcq', live: true, size: 6, pet: 'dog',
    blurb: 'CPM, SSP, VAST and friends: what do they stand for?',
    how: { steps: ['An acronym appears, like CPM.', 'Pick what it stands for from four choices.', 'Stuck? Tap Hint. It removes two wrong answers (after a short ad).'],
      example: '"What does SSP stand for?" The right answer is Supply-side platform.', scoring: SCORE10 + ' A question answered with a hint earns half.' } },
  { id: 'ad-flow-builder', cat: 'concept', title: 'Ad-flow builder', tag: 'Follow the ad', icon: 'route', kind: 'flow', live: true, pet: 'penguin',
    blurb: 'Put the steps of an ad request in the right order.',
    how: { steps: ['You see the steps of one ad process in a jumbled order.', 'Drag the grip on the left to reorder, or use the up and down arrows.', 'Tap Check order when you are ready.'],
      example: 'A page load starts with "User opens the page" and ends with "The ad renders".', scoring: '10 AdCoins for each step in the right place. 20 more for a perfect order.' } },
  { id: 'jargon-match', cat: 'concept', title: 'Jargon match', tag: 'Pair the terms', icon: 'arrows-shuffle', kind: 'match', live: true, pet: 'panda',
    blurb: 'Pair each term with its meaning. You have three lives.',
    how: { steps: ['Terms are on the left and meanings are on the right.', 'Tap a term, then tap its meaning.', 'You have 3 lives. Each wrong match costs one. Lose all three and you can try again.'],
      example: 'Tap "Fill rate", then "Share of requests that return an ad".', scoring: '10 AdCoins for each correct pair, minus pairs you got wrong. 20 more for a perfect set.' } },
  { id: 'crossword', cat: 'concept', title: 'Crossword', tag: 'Solve the grid', icon: 'grid-dots', kind: 'cross', live: true, pet: 'elephant',
    blurb: 'Solve AdTech clues in a small crossword.',
    how: { steps: ['Tap a clue from the list.', 'Type the answer and tap Check.', 'Letters appear in the grid when you are right.'],
      example: 'Clue: "Minimum acceptable price (5)". The answer is FLOOR.', scoring: '10 AdCoins for each word solved. 20 more if you solve every word.' } },
  { id: 'odd-one-out', cat: 'concept', earn: 'Up to 80 AdCoins a round: 10 per right answer, +20 for a perfect round.', title: 'Odd one out', tag: 'Find the outlier', icon: 'search', kind: 'mcq', live: true, size: 6, pet: 'tiger',
    blurb: 'Spot the one that does not belong.',
    how: { steps: ['Read the question.', 'Three options have something in common. One does not.', 'Tap the odd one out.'],
      example: 'CPM, CPC, CPA, CTR: CTR is a metric, the others are pricing models.', scoring: SCORE10 + ' A question answered with a hint earns half.' } },
  { id: 'stack-sorter', cat: 'concept', title: 'Stack sorter', tag: 'Stack it right', icon: 'stack-2', kind: 'sort', live: true, pet: 'bear',
    blurb: 'Place each tool in the right layer of the stack.',
    how: { steps: ['A card appears, like "DSP".', 'Tap the layer where it belongs, such as Sell side, Exchange or Buy side.', 'You see straight away if you were right.'],
      example: '"SSP" goes in Sell side, because it helps publishers sell.', scoring: '10 AdCoins for each card in the right layer. 20 more for a perfect stack.' } },
  { id: 'industry-update', cat: 'current', title: 'Industry update', tag: 'What just changed', icon: 'news', live: false },
  { id: 'privacy-quiz', cat: 'current', title: 'Privacy quiz', tag: 'Know the rules', icon: 'shield-lock', live: false },
  { id: 'rapid-fire', cat: 'fun', title: 'Rapid fire', tag: 'Beat the clock', icon: 'bolt', live: false },
  { id: 'number-sense', cat: 'fun', title: 'Number sense', tag: 'Guess the number', icon: 'calculator', live: false },
  { id: 'who-am-i', cat: 'fun', title: 'Who am I?', tag: 'Guess from clues', icon: 'help-circle', live: false }
];

export const MODES = [
  { id: 'solo', title: 'Solo', sub: 'Play at your own pace', icon: 'user', live: true },
  { id: '1v1', title: '1 vs 1', sub: 'Challenge one colleague', icon: 'swords', live: false },
  { id: 'room', title: 'Room', sub: 'Invite people with a code', icon: 'door-enter', live: false },
  { id: 'floor', title: 'Floor challenge', sub: 'Open to everyone, all week', icon: 'building-skyscraper', live: false },
  { id: 'team', title: 'Team vs team', sub: 'Your team against another', icon: 'users-group', live: false },
  { id: 'tournament', title: 'Tournament', sub: 'Quarter-finals to the final', icon: 'trophy', live: false }
];

export const LEVELS = [
  { t: 0, n: 'Rookie' }, { t: 100, n: 'Tag Trainee' }, { t: 250, n: 'Ad Explorer' }, { t: 450, n: 'Bid Strategist' },
  { t: 700, n: 'Yield Pro' }, { t: 1000, n: 'Stack Master' }, { t: 1400, n: 'Exchange Expert' }, { t: 1900, n: 'AdTech Legend' }
];

/* Badges are worked out from the player's record, so they need no extra database writes. */
export const BADGES = [
  { id: 'first', title: 'First Steps', desc: 'Finish your first game', icon: 'star', coins: 10 },
  { id: 'flawless', title: 'Flawless', desc: 'A round with every answer right and no hints', icon: 'sparkles', coins: 10 },
  { id: 'fire', title: 'On Fire', desc: 'Play 7 days in a row', icon: 'flame', coins: 30 },
  { id: 'pals', title: 'Pet Pals', desc: 'Meet all 8 pets', icon: 'paw', coins: 20 },
  { id: 'allround', title: 'All-Rounder', desc: 'Play every one of the 8 games once', icon: 'trophy', coins: 30 },
  { id: 'yield', title: 'Yield Pro', desc: 'Reach level 5', icon: 'rocket', coins: 0 }
];

/* Level inside one game, from the total number of correct answers in that game. */
export const GAME_LEVELS = [0, 15, 40, 80, 150];

/* Hint limits for the puzzle games. Quiz games get one hint per question. */
export const HINTS = {
  'stack-sorter': { perRound: 3, perCard: 1 },
  'ad-flow-builder': { perRound: 2 },
  'crossword': { perRound: 3 },
  'jargon-match': { perRound: 1 }
};

export const TEXT_SIZES = [
  { id: 'compact', label: 'Compact' },
  { id: 'standard', label: 'Standard' },
  { id: 'comfortable', label: 'Comfortable' }
];

/* Shown in What's new until admins publish their own entries. */
export const WHATS_NEW = [
  { id: 'v5-adcoins', type: 'major', title: 'My AdCoins and the shop', text: 'See how to earn and spend AdCoins, and buy ad-free hints. Find it in your menu.', date: '2026-10-26' },
  { id: 'v5-menu', type: 'major', title: 'A clearer menu and My profile', text: 'Your menu is grouped now, and you can change your nickname in My profile.', date: '2026-10-26' },
  { id: 'v5-home', type: 'major', title: 'A fresher home page', text: 'Every section explains itself, and the rules are in How AdVenture works.', date: '2026-10-26' },
  { id: 'v4-hints', type: 'major', title: 'A hint in every game', text: 'Puzzle games now have hints too, with a limited number per round.', date: '2026-10-26' },
  { id: 'v4-pets', type: 'major', title: 'Pets and Settings are separate', text: 'Choose your companion on My pets. Settings is for settings.', date: '2026-10-26' },
  { id: 'v4-text', type: 'major', title: 'Text size', text: 'Pick Compact, Standard or Comfortable in Settings.', date: '2026-10-26' },
  { id: 'v4-pass', type: 'major', title: 'Ad-free hints', text: 'Spend AdCoins on a pass that skips the joke ad before hints.', date: '2026-10-26' }
];
export const WHATS_NEW_MINOR = 'Smaller fixes and polish: layout, wording and speed tweaks.';

export const TIPS = [
  'Fill rate is ads served divided by ad requests. A low number means requests are going unsold.',
  'eCPM is revenue per thousand impressions. It lets you compare CPM, CPC and CPA deals on one scale.',
  'In a first-price auction the winner pays what they bid. In a second-price auction they pay just above the runner-up.',
  'Header bidding lets many buyers bid before the ad server makes its decision.',
  'ads.txt is a public file where a publisher lists who is allowed to sell their inventory.',
  'A viewable impression had a minimum share of the ad on screen for a minimum time. Served does not mean seen.',
  'Frequency capping limits how many times one person sees the same ad.',
  'SSPs sit on the sell side and DSPs on the buy side. Exchanges connect them.',
  'A floor price is the lowest price a seller will accept. Too high and fill drops, too low and revenue leaks.',
  'A consent signal travels with the ad request so partners know what data they may use.'
];

/* Small label and one-line instruction shown above each quiz question. */
export const QUESTION_CUES = {
  'myth-or-fact': ['Myth or fact?', 'Is this statement a myth or a fact?'],
  'acronym-decoder': ['Decode the acronym', 'Pick the meaning that fits.'],
  'odd-one-out': ['Find the odd one out', 'Pick the one that does not belong.']
};

export const GAME_TIPS = {
  'daily-warmup': ['Three questions, about five minutes. Do it before your first meeting.', 'A streak counts any day you finish a puzzle.'],
  'myth-or-fact': ['If a statement says always or never, be suspicious.', 'Read the explanation even when you are right.'],
  'acronym-decoder': ['Many AdTech acronyms hide a clue in the last letter: P for platform, R for rate.', 'Say the full name out loud once. It sticks.'],
  'ad-flow-builder': ['Every ad starts with a page load. Follow the request step by step.', 'Ask what has to happen before each step can happen.'],
  'jargon-match': ['Match the easy pairs first. The leftovers get easier.', 'Wrong guesses cost a life, so think before you tap.'],
  'crossword': ['Tap a clue, then type the answer.', 'Short crossing words help you check the long ones.'],
  'odd-one-out': ['First name what the other three have in common.', 'The odd one is often a tool in a list of metrics, or the reverse.'],
  'stack-sorter': ['Ask who pays and who gets paid. It usually tells you the layer.', 'Think of the stack as a supply chain from publisher to advertiser.']
};

/* What each pet says. Five situations, two variants each. */
export const LINES = {
  penguin: {
    right: ['Smooth sliding! That is correct.', 'Right on the ice. Nicely done.'],
    wrong: ['Slipped on that one. Shake it off.', 'Not quite. Even penguins wobble.'],
    hint: ['Hint time! Let me waddle you through it.', 'A little nudge coming up.'],
    great: ['Perfect run! You glided through that.', 'Flawless slide. I am flapping with pride.'],
    keep: ['Good waddle. Another round will help.', 'Almost there. Slide back in and try again.']
  },
  panda: {
    right: ['Lovely. Calm and correct.', 'Yes, that is the one.'],
    wrong: ['That is okay. Breathe and try the next.', 'Close. Every mistake teaches something.'],
    hint: ['Let us think it through together.', 'A gentle hint is on its way.'],
    great: ['Beautifully done. Everything matched.', 'A perfect round. So peaceful.'],
    keep: ['Slow and steady wins. One more round?', 'You are growing. Let us go again.']
  },
  cat: {
    right: ['Hmm, correct. I am almost impressed.', 'Fine, that one is right. Do not let it go to your head.'],
    wrong: ['Not quite. Sceptics learn from this.', 'Interesting guess. Wrong, but interesting.'],
    hint: ['Need a clue? Watch the ad, then we will talk.', 'A hint, but first a word from our sponsor.'],
    great: ['Flawless. I would say I am surprised, but I am not.', 'Top marks. I knew you had it in you.'],
    keep: ['Not your best, but you are learning. Go again.', 'Even cats miss. Try the next round.']
  },
  elephant: {
    right: ['Correct, and I will remember that you got it.', 'Yes. That one is stored forever.'],
    wrong: ['Not this time. I will remind you later.', 'Wrong, but you will remember it now.'],
    hint: ['Let me jog your memory.', 'Here is something to help you remember.'],
    great: ['Perfect. I will never forget this round.', 'Every answer right. Unforgettable.'],
    keep: ['Memory grows with practice. Try again.', 'You will remember it next time.']
  },
  rabbit: {
    right: ['Yes! Boing! You nailed it!', 'Hop hop hooray, that is right!'],
    wrong: ['Oops, close! Hop back and try the next one.', 'No worries, mistakes help you grow.'],
    hint: ['Hint time! Quick ad, then I will help.', 'Ooh, a clue! Let us watch this ad first.'],
    great: ['Perfect round! I am bouncing off the walls!', 'Wow! You are on fire today!'],
    keep: ['Good effort! One more round?', 'Almost there. Let us hop again!']
  },
  tiger: {
    right: ['Sharp eyes. Correct.', 'Spotted it. Well done.'],
    wrong: ['Missed that one. Look closer next time.', 'Not it. Stay sharp.'],
    hint: ['Here is where to look.', 'Focus. This should help.'],
    great: ['Perfect hunt. Nothing got past you.', 'Clean sweep. Excellent.'],
    keep: ['Keep hunting. You are getting closer.', 'Sharpen up and go again.']
  },
  bear: {
    right: ['Nice stacking! That is correct.', 'Everything in its place. Right answer.'],
    wrong: ['Not quite. Let us tidy that up next time.', 'That one goes elsewhere. On to the next.'],
    hint: ['Let us sort it out together.', 'Think in layers. Here is a nudge.'],
    great: ['A perfectly organised round!', 'Stacked high. Every answer right.'],
    keep: ['Good start. Let us restack and go again.', 'A tidier round next time. You have got this.']
  },
  dog: {
    right: ['Good answer! Fetch that point!', 'Woof! Yes, that is right!'],
    wrong: ['Oops! No worries, I will fetch the next one with you.', 'Not quite, but good try!'],
    hint: ['I will sniff out a clue for you.', 'Hint coming right up, after this ad!'],
    great: ['Perfect! Best round ever! Woof!', 'Every answer right! Who is a good learner?'],
    keep: ['Good effort! Let us play again!', 'You are doing great. Another round?']
  }
};

/* Joke ads shown before a hint. All brands are fictional. Each pet has two.
   fmt: video, cookie, prize, countdown, install. small = the real AdTech idea in plain words. */
export const ADS = [
  { pet: 'penguin', mood: 'explain', fmt: 'video', brand: "Waddles' Ad-Pipe", head: 'Your ad, from page load to impression, in a flash.*', small: '*Bids that arrive after the timeout are ignored, so speed matters.', cta: 'Try it free', joke: 'Pipe connected. Please mind the latency.' },
  { pet: 'penguin', mood: 'celebrate', fmt: 'countdown', brand: 'Bidder Bonanza', head: 'Add 47 more bidders! Offer ends in', small: 'More bidders can lift the price, but each one can slow your page.', cta: 'Add bidders', joke: 'Timeout set to forever. Good luck.' },
  { pet: 'panda', mood: 'celebrate', fmt: 'prize', brand: 'Lucky Visitor', head: 'You are visitor number 1,000,000! Claim your prize.', small: 'Fake prize banners chase clicks, not value. A high CTR is not the goal.', cta: 'Claim prize', joke: 'Prize claimed: this banner. Enjoy.' },
  { pet: 'panda', mood: 'happy', fmt: 'install', brand: "Bamboo's Pair-Up", head: 'Match any term with any meaning.', small: 'Easy to mix up: an SSP sells for publishers, a DSP buys for advertisers.', cta: 'Install', alt: 'Maybe later', joke: 'Installed. Just kidding, you are already playing.' },
  { pet: 'cat', mood: 'oops', fmt: 'cookie', brand: 'Cookie wall', head: 'We value your privacy', body: 'Our 847 partners would love to follow you around the internet. Please accept all, for science.', small: 'A consent signal tells partners what data they may use.', cta: 'Accept all', alt: 'Reject all (we will ask again tomorrow)', joke: 'Accepted. Whiskers is unimpressed.' },
  { pet: 'cat', mood: 'explain', fmt: 'video', brand: 'ViewSure', head: 'Guaranteed viewable for 1 whole second!', small: 'A display ad counts as viewable at 50% of its pixels in view for 1 continuous second. That is not the same as being seen.', cta: 'Watch me', joke: 'Viewable. Technically.' },
  { pet: 'dog', mood: 'explain', fmt: 'video', brand: 'Fetch-a-Meaning', head: 'CPM, CTR, RTB: fetched in seconds.', small: 'CPM is the price for 1,000 impressions.', cta: 'Fetch', joke: 'Fetched. Slightly chewed.' },
  { pet: 'dog', mood: 'celebrate', fmt: 'countdown', brand: 'Mega Bargain', head: 'Bid $0 for premium ad space! Offer ends in', small: 'A bid below the floor price loses the auction.', cta: 'Place bid', joke: 'Bid placed. It lost, of course.' },
  { pet: 'elephant', mood: 'proud', fmt: 'video', brand: "Ellie's Remember-It", head: 'Remember that shoe? We do. Forever.', small: 'Retargeting shows ads to past visitors. Frequency caps stop it getting creepy.', cta: 'Remember me', joke: 'Saved. Ellie never forgets.' },
  { pet: 'elephant', mood: 'oops', fmt: 'prize', brand: 'Adblock Alert', head: 'Ad blocker detected! Please turn it off to continue.', small: 'A blocked ad never renders, so there is no impression and no revenue.', cta: 'Turn it off', joke: 'Turned off. The ad is delighted.' },
  { pet: 'rabbit', mood: 'celebrate', fmt: 'countdown', brand: 'Fill-O-Matic', head: 'Fill rate 100%! Offer ends in', small: 'Fill rate is ads served divided by requests. Full but cheap can still lose money.', cta: 'Fill my page', joke: 'Fill rate: 100%. Revenue: ask us later.' },
  { pet: 'rabbit', mood: 'happy', fmt: 'install', brand: "Hopper's Auto-Refresh", head: 'Refresh your ads every 5 seconds!', small: 'Refreshing before an ad has been on screen long enough can stop it counting as viewable.', cta: 'Install', alt: 'Maybe later', joke: 'Refreshed. Your viewability would like a word.' },
  { pet: 'tiger', mood: 'explain', fmt: 'video', brand: 'Bot-Buster', head: 'Spots fake traffic before it bills you.', small: 'Invalid traffic is views or clicks that are not genuine human interest, such as bots. Advertisers should not pay for it.', cta: 'Spot it', joke: 'Spotted. It was a bot all along.' },
  { pet: 'tiger', mood: 'celebrate', fmt: 'prize', brand: 'Seller Check', head: 'Which seller is not authorised? ads.txt knows.', small: 'ads.txt is a public file where a publisher lists who may sell its ad space.', cta: 'Check sellers', joke: 'Checked. One seller was not on the list.' },
  { pet: 'bear', mood: 'celebrate', fmt: 'video', brand: "Bruno's Stack-O-Matic", head: 'Sorts your SSP, exchange and DSP in one click.', small: 'The sell side sells, the buy side buys, and the exchange connects them.', cta: 'Try it free', joke: 'Stack sorted. Results may vary.' },
  { pet: 'bear', mood: 'happy', fmt: 'install', brand: 'SPO Lite', head: 'Skip the extra hops.', small: 'Supply path optimisation means buying through the most direct, transparent route to the publisher.', cta: 'Install', alt: 'Maybe later', joke: 'Installed. Fewer hops, fewer fees.' }
];

/* Tool tour: one pet per slide */
export const TOUR = [
  { pet: 'penguin', title: 'Welcome to AD\u25BCenture', text: 'This is your AdTech learning arena from R&D Labs. Play short puzzles, collect AdCoins and level up. I am Waddles, and my friends will show you around.' },
  { pet: 'panda', title: 'Start with the quest', text: 'The Daily quest on the home page is the best place to begin. Three quick puzzles, about five minutes, picked just for you.' },
  { pet: 'rabbit', title: 'Keep your streak', text: 'Play any game each day to keep your streak going. Play on five days in a week for a bonus.' },
  { pet: 'cat', title: 'Pick a game', text: 'The games are grouped by what they train. Greyed-out ones are coming soon, so keep an eye out.' },
  { pet: 'dog', title: 'Need help?', text: 'Tap Hint when you are stuck. Fair warning: it plays a joke ad first, because that is the AdTech way. You can buy a pass to skip the ad later.' },
  { pet: 'elephant', title: 'I remember everything', text: 'You will not see a question again until you have seen them all. New questions earn AdCoins. Replays only earn when you beat your best.' },
  { pet: 'tiger', title: 'Levels and badges', text: 'AdCoins take you from Rookie to AdTech Legend, and badges mark the milestones. Your scorecard is in the menu at the top right.' },
  { pet: 'rabbit', title: 'Collect AdCoins, spend them', text: 'Right answers to new questions earn AdCoins. Spend them on ad-free hints and passes. My AdCoins in the menu shows how to earn and spend them, and How AdVenture works explains every rule.' },
  { pet: 'bear', title: 'Your menu', text: 'Tap Menu at the top right for your profile, scorecard, pets, AdCoins and settings. See something wrong in a question? Report it and an admin will review it.' }
];

/* ---------- Starter content (used until R&D publishes their own packs) ---------- */
const mcq = (q, options, answer, why) => ({ q, options, answer, why });

const ACRONYMS = [
  mcq('What does CPM stand for?', ['Cost per mille (thousand impressions)', 'Clicks per month', 'Cost per media', 'Conversions per minute'], 0, 'CPM is the price for 1,000 ad impressions. "Mille" is Latin for thousand.'),
  mcq('What does SSP stand for?', ['Supply-side platform', 'Secure server protocol', 'Sales stack provider', 'Syndicated site package'], 0, 'An SSP helps publishers sell their ad inventory to many buyers at once.'),
  mcq('What does DSP stand for?', ['Demand-side platform', 'Digital sales partner', 'Data signal provider', 'Display serving protocol'], 0, 'A DSP lets advertisers buy inventory from many sources through one interface.'),
  mcq('What does DMP stand for?', ['Data management platform', 'Direct media planner', 'Display metrics portal', 'Dynamic marketing pipeline'], 0, 'A DMP collects and organises audience data so it can be used for targeting.'),
  mcq('What does CTR stand for?', ['Click-through rate', 'Cost-to-revenue', 'Conversion tracking ratio', 'Content targeting rule'], 0, 'CTR is clicks divided by impressions, shown as a percentage.'),
  mcq('What does RTB stand for?', ['Real-time bidding', 'Rapid traffic buying', 'Reserved trade block', 'Regional tag bundle'], 0, 'In RTB an auction runs for each impression in the fraction of a second a page takes to load.'),
  mcq('What does PMP stand for?', ['Private marketplace', 'Premium media package', 'Programmatic media plan', 'Publisher margin policy'], 0, 'A PMP is an invitation-only auction where a publisher offers inventory to selected buyers.'),
  mcq('What does CTV stand for?', ['Connected TV', 'Cable TV video', 'Content tracking video', 'Channel traffic value'], 0, 'CTV means internet-connected TV devices and streaming apps that can show ads.'),
  mcq('What does VAST stand for?', ['Video Ad Serving Template', 'Verified Ad Standard Tag', 'Variable Ad Slot Table', 'Video Audience Sync Tool'], 0, 'VAST is an IAB standard that tells a video player which ad to play and which events to track.'),
  mcq('What does eCPM stand for?', ['Effective cost per mille', 'Estimated clicks per month', 'Electronic cost per media', 'Earned cost per minute'], 0, 'eCPM is revenue per 1,000 impressions, used to compare monetisation across pricing models.'),
  mcq('What does CPC stand for?', ['Cost per click', 'Cost per campaign', 'Clicks per creative', 'Conversion per customer'], 0, 'With CPC pricing the advertiser pays only when someone clicks.'),
  mcq('What does IAB stand for?', ['Interactive Advertising Bureau', 'International Ad Broker', 'Integrated Audience Board', 'Internet Ad Balance'], 0, 'The IAB is an industry body that publishes standards such as VAST and ads.txt.'),
  mcq('What does SPO stand for?', ['Supply path optimization', 'Single publisher offer', 'Server-side page output', 'Sales pipeline operations'], 0, 'With SPO, buyers favour the shortest and most efficient routes to inventory, cutting extra intermediaries.'),
  mcq('What does TCF stand for?', ['Transparency and Consent Framework', 'Traffic Control Filter', 'Targeting Compliance Form', 'Tag and Cookie Format'], 0, 'The TCF is an industry framework for passing user consent choices between publishers and ad partners.'),
  mcq('What does PII stand for?', ['Personally identifiable information', 'Private ad inventory index', 'Programmatic impression indicator', 'Publisher income imbalance'], 0, 'PII is data that can identify a person. Privacy rules limit how it can be used for ads.'),
  mcq('What does DOOH stand for?', ['Digital out-of-home', 'Direct online order handling', 'Display ordering of headers', 'Dynamic offline optimisation'], 0, 'DOOH covers digital screens in public places, such as billboards, transit and malls.')
];

const tf = (q, answer, why) => ({ q, answer, why });
const MYTH_HINTS = {
  'A higher CTR always means a campaign is more profitable.': 'A click shows interest. Does it show a purchase or revenue?',
  'In a first-price auction, the winner pays the price they bid.': 'Think about whose price gets paid: the winner\'s own bid, or someone else\'s?',
  'Ad requests and impressions are the same thing.': 'One counts when an ad is asked for, the other when one is actually served.',
  'Header bidding lets several demand sources bid on the same impression before the ad server decides.': 'It runs in the page, before the ad server picks a winner. Who gets to bid at that point?',
  'A viewable impression means the ad was clicked.': 'Viewable is about what could be seen, not what was done.',
  'ads.txt lets publishers declare who is authorised to sell their inventory.': 'Think about how a buyer could check that a seller is genuine.',
  'Every major browser treats third-party cookies the same way.': 'Think about browsers made by different companies with different business models.',
  'A lower floor price always increases publisher revenue.': 'Picture the floor dropping. What happens to the price of each sale?',
  'eCPM lets you compare revenue across different pricing models.': 'Think about putting CPC and CPA income on the same scale as CPM.',
  'Programmatic advertising only means real-time bidding auctions.': 'Programmatic means automated buying. Are all automated deals auctions?',
  'A DSP is the tool publishers use to sell their inventory.': 'Who needs a platform to buy ad space: publishers or advertisers?',
  'Slow bidders in header bidding can hurt page speed.': 'While the page waits for bids, what happens to loading?',
  'Blocked ads still earn revenue because they count as impressions.': 'What happens to an ad that never renders?',
  'Frequency capping limits how often the same person sees an ad.': 'A cap is a limit. A limit on what, per person?'
};
const MYTHS = [
  tf('A higher CTR always means a campaign is more profitable.', false, 'Clicks can be accidental or low value. Conversions and revenue tell you more than CTR alone.'),
  tf('In a first-price auction, the winner pays the price they bid.', true, 'That is the definition. In a second-price auction the winner pays just above the next highest bid.'),
  tf('Ad requests and impressions are the same thing.', false, 'A request asks for an ad. An impression is counted only when an ad is actually served. Fill rate is impressions divided by requests.'),
  tf('Header bidding lets several demand sources bid on the same impression before the ad server decides.', true, 'That is its main idea. More buyers compete at once, which can lift the winning price.'),
  tf('A viewable impression means the ad was clicked.', false, 'Viewable means enough of the ad was on screen for long enough. It says nothing about clicks.'),
  tf('ads.txt lets publishers declare who is authorised to sell their inventory.', true, 'Buyers can check the file to avoid buying from unauthorised sellers.'),
  tf('Every major browser treats third-party cookies the same way.', false, 'Browsers differ. Some have restricted third-party cookies for years while others have moved more slowly.'),
  tf('A lower floor price always increases publisher revenue.', false, 'A very low floor can let valuable impressions sell cheaply. A higher floor can raise price but lower fill. It is a balance.'),
  tf('eCPM lets you compare revenue across different pricing models.', true, 'It converts CPM, CPC and CPA income into revenue per 1,000 impressions.'),
  tf('Programmatic advertising only means real-time bidding auctions.', false, 'It also includes automated deals such as private marketplaces and programmatic guaranteed.'),
  tf('A DSP is the tool publishers use to sell their inventory.', false, 'That is an SSP. A DSP is used by advertisers and agencies to buy.'),
  tf('Slow bidders in header bidding can hurt page speed.', true, 'Pages may wait for bids, so publishers set timeouts to limit the delay.'),
  tf('Blocked ads still earn revenue because they count as impressions.', false, 'If an ad blocker stops the ad from rendering, there is no impression and no revenue.'),
  tf('Frequency capping limits how often the same person sees an ad.', true, 'It protects user experience and avoids wasting budget on over-exposure.')
];

MYTHS.forEach((m) => { if (MYTH_HINTS[m.q]) m.hint = MYTH_HINTS[m.q]; });

const ODD = [
  mcq('Which one is not a supply-side platform?', ['Magnite', 'PubMatic', 'Index Exchange', 'The Trade Desk'], 3, 'The Trade Desk is a demand-side platform. The others are sell-side platforms or exchanges.'),
  mcq('Which one is not a pricing model?', ['CPM', 'CPC', 'CPA', 'CTR'], 3, 'CTR is a performance metric. CPM, CPC and CPA are ways of pricing ads.'),
  mcq('Which one is not an ad format?', ['Banner', 'Interstitial', 'Pre-roll', 'Header bidding'], 3, 'Header bidding is a technique for selling inventory, not a format.'),
  mcq('Which one is not a performance metric?', ['Fill rate', 'Viewability', 'Click-through rate', 'Floor price'], 3, 'A floor price is a pricing setting. The others measure how ads performed.'),
  mcq('Which one is not a way of identifying a user?', ['Cookie ID', 'Mobile ad ID', 'Hashed email', 'Floor price'], 3, 'A floor price is about the auction, not about identifying people.'),
  mcq('Which one is not a video ad standard?', ['VAST', 'VPAID', 'VMAP', 'ads.txt'], 3, 'ads.txt lists authorised sellers. The other three are video ad standards.'),
  mcq('Which one is not a publisher-side tool?', ['SSP', 'Publisher ad server', 'Yield optimisation tool', 'DSP'], 3, 'A DSP is used by buyers. The others help publishers sell.'),
  mcq('Which one is not about privacy?', ['GDPR', 'CCPA', 'TCF', 'CPM'], 3, 'CPM is a pricing measure. The other three relate to privacy law or consent.'),
  mcq('Which one is not a type of deal?', ['Open auction', 'Private marketplace', 'Programmatic guaranteed', 'Retargeting'], 3, 'Retargeting is a targeting tactic. The others describe how inventory is bought.'),
  mcq('Which one is not a type of inventory?', ['Display', 'Video', 'Native', 'Waterfall'], 3, 'A waterfall is a way of offering inventory to buyers in priority order, not a type of inventory.')
];

const MATCH = [
  { title: 'Buying and selling', pairs: [
    { term: 'SSP', def: 'Platform publishers use to sell inventory' },
    { term: 'DSP', def: 'Platform advertisers use to buy inventory' },
    { term: 'Ad exchange', def: 'Marketplace where buyers and sellers trade impressions' },
    { term: 'Publisher', def: 'Owner of the site or app that shows ads' },
    { term: 'Advertiser', def: 'Brand that pays to show its ads' },
    { term: 'Ad server', def: 'Decides which ad to deliver and counts impressions' }] },
  { title: 'Metrics', pairs: [
    { term: 'Impression', def: 'One instance of an ad being displayed' },
    { term: 'Fill rate', def: 'Share of ad requests that return an ad' },
    { term: 'CTR', def: 'Clicks divided by impressions' },
    { term: 'eCPM', def: 'Revenue per thousand impressions' },
    { term: 'Viewability', def: 'Whether an ad had a fair chance to be seen' },
    { term: 'Frequency', def: 'How often one user sees the same ad' }] },
  { title: 'Auctions and deals', pairs: [
    { term: 'First-price auction', def: 'The winner pays what they bid' },
    { term: 'Floor price', def: 'Minimum price a seller will accept' },
    { term: 'Header bidding', def: 'Many buyers bid before the ad server decides' },
    { term: 'PMP', def: 'Invitation-only auction' },
    { term: 'Programmatic guaranteed', def: 'Fixed price and volume, bought automatically' },
    { term: 'Waterfall', def: 'Offering inventory to buyers one after another in priority order' }] }
];

const FLOW = [
  { title: 'A page load with header bidding', steps: [
    'User opens the publisher page', 'Header bidding sends bid requests to demand partners', 'Partners return bids before the timeout',
    'The winning header bid goes to the ad server', 'The ad server compares it with its own demand and picks the winner', 'The winning ad renders on the page'],
    why: 'Header bidding runs before the ad server decision, so more buyers compete for the impression.' },
  { title: 'A programmatic auction', steps: [
    'User visits a page with an ad slot', 'The ad request reaches the SSP', 'The SSP sends bid requests to DSPs', 'DSPs evaluate the impression and bid',
    'The SSP runs the auction and picks the winner', 'The winning creative is delivered and rendered', 'The impression is counted and reported'],
    why: 'The whole sequence happens in a fraction of a second while the page loads.' },
  { title: 'A video ad with VAST', steps: [
    'The video player requests an ad', 'The ad server returns a VAST response', 'The player reads it and loads the creative', 'The ad plays',
    'The player fires tracking events as the ad progresses'],
    why: 'VAST tells the player what to play and which tracking events to fire.' },
  { title: 'Consent before ads', steps: [
    'User lands on the page', 'A consent prompt is shown', 'User makes a choice', 'The choice is stored as a consent signal',
    'The signal is passed along with the ad request', 'Partners use or limit data according to the signal'],
    why: 'The consent signal travels with the request so every partner knows what data it may use.' }
];

const SORT = [
  { title: 'Who sits where?', layers: ['Sell side', 'Exchange', 'Buy side'], cards: [
    { name: 'SSP', layer: 0 }, { name: 'Publisher ad server', layer: 0 }, { name: 'Yield manager', layer: 0 },
    { name: 'Ad exchange', layer: 1 }, { name: 'DSP', layer: 2 }, { name: 'Agency trading desk', layer: 2 }],
    why: 'Sell-side tools help publishers sell, exchanges connect the two sides, and buy-side tools help advertisers buy.' },
  { title: 'Data and measurement', layers: ['Identify the user', 'Measure the ad', 'Protect the user'], cards: [
    { name: 'Cookie ID', layer: 0 }, { name: 'Hashed email', layer: 0 }, { name: 'Viewability measurement', layer: 1 },
    { name: 'Conversion tracking', layer: 1 }, { name: 'Consent management platform', layer: 2 }, { name: 'Opt-out signal', layer: 2 }],
    why: 'Identifiers recognise users, measurement shows results, and consent tools respect user choices.' },
  { title: 'Pricing talk', layers: ['Pricing model', 'Performance metric', 'Auction setting'], cards: [
    { name: 'CPM', layer: 0 }, { name: 'CPC', layer: 0 }, { name: 'CTR', layer: 1 }, { name: 'Fill rate', layer: 1 },
    { name: 'eCPM', layer: 1 }, { name: 'Floor price', layer: 2 }, { name: 'Bid timeout', layer: 2 }],
    why: 'Pricing models set how you are paid, metrics show how it went, and auction settings control how bids are handled.' }
];

const CW = [
  { title: 'Ad basics', words: [
    { answer: 'IMPRESSION', clue: 'One display of an ad to a user' }, { answer: 'PUBLISHER', clue: 'Owner of the site that shows ads' },
    { answer: 'ADVERTISER', clue: 'Brand that pays to show ads' }, { answer: 'EXCHANGE', clue: 'Marketplace where impressions are traded' },
    { answer: 'AUCTION', clue: 'How the price of an impression is decided' }, { answer: 'BANNER', clue: 'Common display ad format' },
    { answer: 'COOKIE', clue: 'Small file that helps recognise a browser' }, { answer: 'FLOOR', clue: 'Minimum acceptable price' },
    { answer: 'CLICK', clue: 'What CTR counts' }, { answer: 'VIDEO', clue: 'Format played by a VAST-compatible player' }] },
  { title: 'Programmatic', words: [
    { answer: 'PROGRAMMATIC', clue: 'Automated buying and selling of ads' }, { answer: 'BIDDER', clue: 'Party that submits a price in an auction' },
    { answer: 'REQUEST', clue: 'Call asking the server for an ad' }, { answer: 'CREATIVE', clue: 'The ad asset itself: image, video or HTML' },
    { answer: 'INVENTORY', clue: 'Ad space a publisher has to sell' }, { answer: 'TARGETING', clue: 'Choosing who should see an ad' },
    { answer: 'WATERFALL', clue: 'Older method that offers inventory to buyers in sequence' }, { answer: 'HEADER', clue: '___ bidding lets many buyers compete at once' },
    { answer: 'TIMEOUT', clue: 'Limit on how long bidders may take to respond' }, { answer: 'AUDIENCE', clue: 'Group of people an advertiser wants to reach' }] },
  { title: 'Measurement and privacy', words: [
    { answer: 'VIEWABILITY', clue: 'Whether an ad had a fair chance to be seen' }, { answer: 'CONSENT', clue: 'User permission for data use' },
    { answer: 'PRIVACY', clue: 'What regulations like GDPR aim to protect' }, { answer: 'FREQUENCY', clue: 'How often one user sees an ad' },
    { answer: 'CAMPAIGN', clue: 'A set of ads run for one goal' }, { answer: 'ATTRIBUTION', clue: 'Crediting a conversion to ad touchpoints' },
    { answer: 'CONVERSION', clue: 'Desired action taken after seeing an ad' }, { answer: 'REVENUE', clue: 'Money earned by the publisher' },
    { answer: 'FRAUD', clue: 'Invalid traffic created on purpose' }, { answer: 'REPORTING', clue: 'Sharing results after a campaign' }] }
];

const ACRONYM_HINTS = {
  'What does CPM stand for?': 'It is a way of pricing display ads, based on a big batch of views.',
  'What does SSP stand for?': 'It is the tool a publisher uses to sell ad space.',
  'What does DSP stand for?': 'It is the tool an advertiser uses to buy ad space.',
  'What does DMP stand for?': 'It stores and organises audience data for targeting.',
  'What does CTR stand for?': 'It compares clicks with how many times the ad was shown.',
  'What does RTB stand for?': 'An auction that runs while the page is loading.',
  'What does PMP stand for?': 'An invite-only auction run by a publisher.',
  'What does CTV stand for?': 'Ads on the living-room screen, delivered over the internet.',
  'What does VAST stand for?': 'An IAB standard that tells a video player what to play.',
  'What does eCPM stand for?': 'It puts revenue from different pricing models on one scale.',
  'What does CPC stand for?': 'A pricing model where you pay only when someone clicks.',
  'What does IAB stand for?': 'An industry body that publishes standards such as ads.txt.',
  'What does SPO stand for?': 'Buyers use it to find the shortest, cleanest route to a publisher.',
  'What does TCF stand for?': 'It is how people\'s privacy choices travel along with an ad request.',
  'What does PII stand for?': 'Information that could identify one particular person.',
  'What does DOOH stand for?': 'Ads on screens in public places, such as transit and malls.'
};
const ODD_HINTS = {
  'Which one is not a supply-side platform?': 'Think about who is selling and who is buying.',
  'Which one is not a pricing model?': 'Three of these set a price. One measures what happened.',
  'Which one is not an ad format?': 'Three are things people see. One is a way of selling.',
  'Which one is not a performance metric?': 'Three are measured after the fact. One is a setting you choose in advance.',
  'Which one is not a way of identifying a user?': 'Three point to a person or a device. One is about money.',
  'Which one is not a video ad standard?': 'Three describe how a video ad plays. One is about who may sell.',
  'Which one is not a publisher-side tool?': 'Think about which one an advertiser would use.',
  'Which one is not about privacy?': 'Three are about people\'s data rights. One is about price.',
  'Which one is not a type of deal?': 'Three describe how inventory is bought. One describes who sees the ad.',
  'Which one is not a type of inventory?': 'Three are kinds of ad space. One is a way of ordering buyers.'
};
ACRONYMS.forEach((m) => { if (ACRONYM_HINTS[m.q]) m.hint = ACRONYM_HINTS[m.q]; });
ODD.forEach((m) => { if (ODD_HINTS[m.q]) m.hint = ODD_HINTS[m.q]; });

export const STARTER = {
  'acronym-decoder': ACRONYMS, 'myth-or-fact': MYTHS, 'odd-one-out': ODD,
  'jargon-match': MATCH, 'ad-flow-builder': FLOW, 'stack-sorter': SORT, 'crossword': CW
};
