// APM Quiz Game Logic

// Game state variables
const gameState = {
  keywords: [],      // Array of parsed keyword objects
  isPlaying: false,
  timeLeft: 600,     // 10 minutes in seconds
  score: 0,
  timerInterval: null,
  revealed: false,
  timeElapsed: 0
};

// DOM Elements
const btnStart = document.getElementById('btn-start');
const btnGiveUp = document.getElementById('btn-give-up');
const wordInput = document.getElementById('word-input');
const timerDisplay = document.getElementById('timer-display');
const scoreDisplay = document.getElementById('score-display');
const percentageDisplay = document.getElementById('percentage-display');
const gameProgress = document.getElementById('game-progress');
const alphabetNav = document.getElementById('alphabet-nav');
const gridsContainer = document.getElementById('grids-container');

// Modal Elements
const endModal = document.getElementById('end-modal');
const modalTitle = document.getElementById('modal-title');
const modalScore = document.getElementById('modal-score');
const modalPercent = document.getElementById('modal-percent');
const modalTime = document.getElementById('modal-time');
const modalMessage = document.getElementById('modal-message');
const btnRestart = document.getElementById('btn-restart');
const btnShowAnswers = document.getElementById('btn-show-answers');

// References to dynamically created elements for high-performance updates
let cardElements = {}; // Map of keyword ID -> DOM card element
let letterBadgeElements = {}; // Map of letter -> badge span element



// --- Text Normalization & Matching Logic ---

/**
 * Normalizes text: lowercase, removes accents, handles ligatures,
 * and collapses spacers (dashes, underscores, dots) to a single space.
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (accents)
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[-_.\xa0\s]+/g, ' ') // Replace hyphens, underscores, dots, and spaces with single space
    .replace(/[^\w\s&]/g, '') // Strip other special chars like * (keep words, space, and ampersand)
    .trim();
}

/**
 * Extracts the first letter of a word after normalization to group it under A-Z.
 */
function getNormalizedFirstLetter(word) {
  const norm = normalizeText(word);
  if (norm.length > 0) {
    const firstChar = norm.charAt(0).toUpperCase();
    if (firstChar >= 'A' && firstChar <= 'Z') {
      return firstChar;
    }
  }
  return '#'; // Fallback for numbers or other symbols
}

/**
 * Computes the Levenshtein distance between two strings.
 */
function getLevenshteinDistance(a, b) {
  const tmp = [];
  for (let i = 0; i <= b.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        tmp[i][j] = tmp[i - 1][j - 1];
      } else {
        tmp[i][j] = Math.min(
          tmp[i - 1][j - 1] + 1, // substitution
          tmp[i][j - 1] + 1,     // insertion
          tmp[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return tmp[b.length][a.length];
}

/**
 * Normalise les pluriels en français vers leur forme singulière.
 * Ex: "achats" -> "achat", "hopitaux" -> "hopital", "aux" -> "au".
 */
function singularizeWord(word) {
  if (!word) return '';
  return word.split(' ').map(w => {
    // Gère la préposition au pluriel
    if (w === 'aux') return 'au';
    
    // Traite uniquement les mots de longueur >= 4 pour éviter d'altérer les acronymes courts (ex: "ARS", "ANS", "LFB")
    if (w.length >= 4) {
      if (w.endsWith('aux')) {
        return w.slice(0, -3) + 'al'; // ex: hopitaux -> hopital, medicaux -> medical
      }
      if (w.endsWith('s') && !w.endsWith('ss')) {
        return w.slice(0, -1); // ex: achats -> achat, cliniques -> clinique (exclut les doubles s comme PLFSS)
      }
      if (w.endsWith('x')) {
        return w.slice(0, -1); // ex: travaux -> travau (retrait simple du x du pluriel)
      }
    }
    return w;
  }).join(' ');
}

/**
 * Checks if user input matches a target keyword based on tolerant matching rules.
 */
function isMatch(input, target) {
  const cleanInput = normalizeText(input);
  const cleanTarget = normalizeText(target);
  
  if (!cleanInput) return false;

  // 1. Match exact après normalisation standard (casse, accents, ligatures, espaces normaux)
  if (cleanInput === cleanTarget) return true;

  // 2. Match exact en ignorant totalement les espaces/séparateurs (ex: "r&d" vs "r & d")
  const compactInput = cleanInput.replace(/[\s\-_.]/g, '');
  const compactTarget = cleanTarget.replace(/[\s\-_.]/g, '');
  if (compactInput === compactTarget) return true;

  // 3. Match après singularisation (équivalence singulier / pluriel)
  const singInput = singularizeWord(cleanInput);
  const singTarget = singularizeWord(cleanTarget);
  if (singInput === singTarget) return true;

  // 4. Match après singularisation en ignorant totalement les espaces/séparateurs
  const compactSingInput = singInput.replace(/[\s\-_.]/g, '');
  const compactSingTarget = singTarget.replace(/[\s\-_.]/g, '');
  if (compactSingInput === compactSingTarget) return true;

  return false;
}

/**
 * Generates the hidden word representation (e.g. "••••••" for "ABBOTT" and "•••••• •• ••••••" for "MERCK & CO")
 */
function getPlaceholderForKeyword(original) {
  return original
    .split('')
    .map(char => {
      // Keep spacers, punctuation and special signs as hints
      if (char === ' ' || char === '-' || char === '_' || char === '&' || char === '.') {
        return char;
      }
      return '•';
    })
    .join('');
}

// --- CSV Parser ---

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const keywords = [];
  for (let line of lines) {
    line = line.trim();
    // Strip CSV quotes
    if (line.startsWith('"') && line.endsWith('"')) {
      line = line.substring(1, line.length - 1);
    }
    line = line.trim();
    if (line && !line.startsWith('#')) {
      keywords.push(line);
    }
  }
  return keywords;
}

// --- UI Rendering ---

/**
 * Builds the structure of the game board (Letters, count badges, and empty word cards).
 */
function setupGameBoard(wordsList) {
  // Map strings to objects
  gameState.keywords = wordsList.map((word, index) => {
    return {
      id: index,
      original: word,
      normalized: normalizeText(word),
      firstLetter: getNormalizedFirstLetter(word),
      guessed: false
    };
  });

  // Group keywords by letter
  const groups = {};
  gameState.keywords.forEach(kw => {
    const letter = kw.firstLetter;
    if (!groups[letter]) {
      groups[letter] = [];
    }
    groups[letter].push(kw);
  });

  // Sort groups alphabetically
  const sortedLetters = Object.keys(groups).sort();

  // Clear container
  gridsContainer.innerHTML = '';
  cardElements = {};
  letterBadgeElements = {};

  // Build the grids
  sortedLetters.forEach(letter => {
    const section = document.createElement('section');
    section.className = 'letter-section';
    section.id = `section-${letter}`;

    const header = document.createElement('div');
    header.className = 'letter-section-header';

    const title = document.createElement('h2');
    title.textContent = letter;

    const badge = document.createElement('span');
    badge.className = 'count-badge';
    badge.textContent = `(0 / ${groups[letter].length} trouvés)`;
    
    // Save reference to count badge
    letterBadgeElements[letter] = {
      badgeElement: badge,
      total: groups[letter].length,
      guessed: 0
    };

    header.appendChild(title);
    header.appendChild(badge);
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'words-grid';

    groups[letter].forEach(kw => {
      const card = document.createElement('div');
      card.id = `card-${kw.id}`;
      card.className = 'word-card empty';
      card.textContent = getPlaceholderForKeyword(kw.original);
      
      // Save reference to card element
      cardElements[kw.id] = card;
      grid.appendChild(card);
    });

    section.appendChild(grid);
    gridsContainer.appendChild(section);
  });

  // Build A-Z Navigation
  setupAlphabetNav(sortedLetters);

  // Update score displays
  updateStatsDisplay();
}

/**
 * Renders the top A-Z navigation bar, highlighting letters that actually have keywords.
 */
function setupAlphabetNav(activeLetters) {
  alphabetNav.innerHTML = '';
  
  // A to Z
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const btn = document.createElement('button');
    btn.className = 'nav-letter-btn';
    btn.textContent = letter;
    
    if (activeLetters.includes(letter)) {
      btn.addEventListener('click', () => {
        const targetSection = document.getElementById(`section-${letter}`);
        if (targetSection) {
          targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    } else {
      btn.className += ' disabled';
      btn.setAttribute('disabled', 'true');
    }
    
    alphabetNav.appendChild(btn);
  }
}

// --- Game Logic ---

function startGame() {
  if (gameState.isPlaying) return;

  // Reset state
  gameState.isPlaying = true;
  gameState.timeLeft = 600;
  gameState.score = 0;
  gameState.revealed = false;
  gameState.timeElapsed = 0;
  
  // Reset keywords
  gameState.keywords.forEach(kw => {
    kw.guessed = false;
    const card = cardElements[kw.id];
    if (card) {
      card.className = 'word-card empty';
      card.textContent = getPlaceholderForKeyword(kw.original);
    }
  });

  // Reset letter badges
  Object.keys(letterBadgeElements).forEach(letter => {
    const info = letterBadgeElements[letter];
    info.guessed = 0;
    info.badgeElement.textContent = `(0 / ${info.total} trouvés)`;
  });

  // Enable input & buttons
  wordInput.disabled = false;
  wordInput.value = '';
  wordInput.placeholder = 'Saisissez un mot-clé APM...';
  wordInput.focus();

  btnStart.className += ' hidden';
  btnGiveUp.classList.remove('hidden');

  // Start timer
  updateTimerDisplay();
  gameState.timerInterval = setInterval(tick, 1000);

  updateStatsDisplay();
}

function tick() {
  gameState.timeLeft--;
  gameState.timeElapsed++;
  updateTimerDisplay();

  if (gameState.timeLeft <= 0) {
    endGame(false); // Time's up
  }
}

function updateTimerDisplay() {
  const minutes = Math.floor(gameState.timeLeft / 60);
  const seconds = gameState.timeLeft % 60;
  timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updateStatsDisplay() {
  const total = gameState.keywords.length;
  scoreDisplay.textContent = `${gameState.score} / ${total}`;
  
  const percentage = total > 0 ? Math.round((gameState.score / total) * 100) : 0;
  percentageDisplay.textContent = `${percentage}%`;
  gameProgress.style.width = `${percentage}%`;
}

/**
 * Handle user keystroke input (Fuzzy matching check)
 */
function handleInput(e) {
  if (!gameState.isPlaying) return;

  const currentInput = e.target.value;
  if (!currentInput.trim()) return;

  // Search if this input matches any unguessed keyword
  for (let kw of gameState.keywords) {
    if (!kw.guessed && isMatch(currentInput, kw.original)) {
      // Match found!
      kw.guessed = true;
      gameState.score++;
      
      // Update word card element (green reveal animation)
      const card = cardElements[kw.id];
      if (card) {
        card.className = 'word-card guessed';
        card.textContent = kw.original;
        
        // Fait défiler la page de manière fluide pour centrer le mot deviné à l'écran
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Update the letter badge
      const letterInfo = letterBadgeElements[kw.firstLetter];
      if (letterInfo) {
        letterInfo.guessed++;
        letterInfo.badgeElement.textContent = `(${letterInfo.guessed} / ${letterInfo.total} trouvés)`;
      }

      // Clear input & trigger input box flash animation
      wordInput.value = '';
      const inputContainer = wordInput.parentElement;
      inputContainer.classList.remove('valid-flash');
      void inputContainer.offsetWidth; // Trigger reflow for animation restart
      inputContainer.classList.add('valid-flash');
      setTimeout(() => inputContainer.classList.remove('valid-flash'), 400);

      // Update statistics
      updateStatsDisplay();

      // Win condition: found all words!
      if (gameState.score === gameState.keywords.length) {
        endGame(true);
      }
      
      break; // Exit loop since we matched
    }
  }
}

function endGame(isWin = false) {
  gameState.isPlaying = false;
  clearInterval(gameState.timerInterval);

  wordInput.disabled = true;
  wordInput.placeholder = 'Partie terminée !';
  
  btnGiveUp.className += ' hidden';
  btnStart.classList.remove('hidden');

  // Compute stats for modal
  const total = gameState.keywords.length;
  const percentage = total > 0 ? Math.round((gameState.score / total) * 100) : 0;
  
  // Format elapsed time
  const minElapsed = Math.floor(gameState.timeElapsed / 60);
  const secElapsed = gameState.timeElapsed % 60;
  const timeStr = `${minElapsed.toString().padStart(2, '0')}:${secElapsed.toString().padStart(2, '0')}`;

  // Select message based on performance
  let msg = '';
  if (percentage <= 20) {
    msg = "Oups ! Un petit échauffement s'impose. Retentez votre chance ! 🏃‍♂️";
  } else if (percentage <= 50) {
    msg = "Pas mal ! Vous connaissez une bonne partie des mots-clés APM. Continuez ainsi ! 📈";
  } else if (percentage <= 80) {
    msg = "Très bien ! Une solide culture APM. Encore un petit effort pour le sans-faute ! 💪";
  } else if (percentage <= 99) {
    msg = "Excellent ! Vous êtes un véritable expert de l'APM. Presque parfait ! 🌟";
  } else {
    msg = "Félicitations ! Un score parfait, vous maîtrisez les mots-clés APM sur le bout des doigts ! 🏆";
  }

  // Populate modal and color code the title based on the result
  const titleText = isWin ? "Victoire !" : (gameState.timeLeft <= 0 ? "Temps écoulé !" : "Jeu abandonné");
  modalTitle.textContent = titleText;
  
  if (isWin) {
    modalTitle.style.color = '#059669'; // Vert émeraude pour la victoire
  } else if (gameState.timeLeft <= 0) {
    modalTitle.style.color = '#4f46e5'; // Indigo pour le temps écoulé
  } else {
    modalTitle.style.color = '#ea580c'; // Orange chaud pour l'abandon
  }
  modalScore.textContent = `${gameState.score} / ${total}`;
  modalPercent.textContent = `${percentage}%`;
  modalTime.textContent = timeStr;
  modalMessage.textContent = msg;

  // Show modal
  endModal.classList.remove('hidden');
}

/**
 * Reveals all unguessed words in red/orange.
 */
function revealAnswers() {
  gameState.revealed = true;
  gameState.keywords.forEach(kw => {
    if (!kw.guessed) {
      const card = cardElements[kw.id];
      if (card) {
        card.className = 'word-card missed';
        card.textContent = kw.original;
      }
    }
  });
  endModal.className += ' hidden'; // Hide modal so player can review
}

// --- Event Listeners ---

btnStart.addEventListener('click', startGame);
btnGiveUp.addEventListener('click', () => endGame(false));
wordInput.addEventListener('input', handleInput);

btnRestart.addEventListener('click', () => {
  endModal.className += ' hidden';
  startGame();
});

btnShowAnswers.addEventListener('click', revealAnswers);

// Close modal if clicking outside the content area
endModal.addEventListener('click', (e) => {
  if (e.target === endModal) {
    endModal.className += ' hidden';
  }
});

// Empêcher le rafraîchissement accidentel (F5 / Fermeture d'onglet) pendant qu'une partie est en cours
window.addEventListener('beforeunload', (e) => {
  if (gameState.isPlaying) {
    e.preventDefault();
    e.returnValue = ''; // Requis par les navigateurs modernes pour afficher la pop-up native
  }
});


// --- Initial Setup ---
// Uses DEFAULT_KEYWORDS array from keywords.js
if (typeof DEFAULT_KEYWORDS !== 'undefined' && Array.isArray(DEFAULT_KEYWORDS)) {
  setupGameBoard(DEFAULT_KEYWORDS);
} else {
  gridsContainer.innerHTML = '<div class="loading-state"><p style="color:var(--danger)">Erreur : Les mots-clés par défaut n\'ont pas pu être chargés.</p></div>';
}
