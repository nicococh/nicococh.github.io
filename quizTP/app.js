/* ==========================================================================
   Quiz Generator - JS Application Controller
   Manages generator state, dynamic editors, live preview, and exports.
   ========================================================================== */

// --- Default baseline template state ---
const defaultState = {
    title: "Bienvenue sur le <span class=\"gradient-text\">Quiz Interactif</span>",
    subtitle: "Testez vos connaissances en quelques questions rapides et amusantes.",
    colorPrimary: "#003087",
    colorAccent: "#6ecd9c",
    rules: [
        { icon: "fa-bolt", text: "Questions percutantes" },
        { icon: "fa-graduation-cap", text: "Explications instantanées" },
        { icon: "fa-trophy", text: "Décrochez le score maximal !" }
    ],
    questions: [],
    ranks: {
        excellent: { title: "Excellent ! 🚀", desc: "Impressionnant ! Vous maîtrisez parfaitement le sujet !" },
        good: { title: "Très Bon ! 💻", desc: "Très bon score ! Vous avez de très solides connaissances." },
        average: { title: "Moyen ! 🩺", desc: "Pas mal ! Vous connaissez les bases mais certains détails vous ont échappé." },
        poor: { title: "À revoir ! 🔌", desc: "Des lacunes subsistent. Relisez les explications pour progresser !" }
    },
    linkedinMessage: "🏆 J'ai obtenu le titre \"{title}\" avec {score}/{total} au Quiz TICpharma !\n\n👉 Testez vos connaissances en numérique de santé : https://www.ticpharma.com/\n\n#eSanté #NumériqueEnSanté #HealthTech #TICpharma"
};

// Global active quiz state reference (will point to active data)
const state = {};

// Saved quizzes list & active ID
let quizzesList = [];
let activeQuizId = "";

// Collapsed states of question cards
let questionCollapseState = {}; // { index: true/false }

// --- DOM Cache ---
const lobbyScreen = document.getElementById("lobby-screen");
const workspaceScreen = document.getElementById("workspace-screen");
const btnBackToLobby = document.getElementById("btn-back-to-lobby");
const lobbyCreateBtn = document.getElementById("lobby-create-btn");
const quizzesGrid = document.getElementById("quizzes-grid");
const activeQuizHeaderName = document.getElementById("active-quiz-header-name");
const btnRenameActiveQuiz = document.getElementById("btn-rename-active-quiz");

const navTabs = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const previewIframe = document.getElementById("preview-iframe");
const btnRefreshPreview = document.getElementById("btn-refresh-preview");
const deviceBtns = document.querySelectorAll(".device-btn");
const previewWrapper = document.getElementById("preview-wrapper");
const questionsListContainer = document.getElementById("questions-list");
const addQuestionBtn = document.getElementById("add-question-btn");
const questionsBadgeCount = document.getElementById("questions-badge-count");

// Color Inputs
const colorPrimaryInput = document.getElementById("color-primary");
const colorAccentInput = document.getElementById("color-accent");
const colorPrimaryHex = colorPrimaryInput.nextElementSibling;
const colorAccentHex = colorAccentInput.nextElementSibling;

// Export Buttons
const btnExportSingle = document.getElementById("btn-export-single");

// --- Initialization ---
function init() {
    // Load Quizzes from LocalStorage first to populate global state
    loadQuizzesFromStorage();

    setupTabs();
    setupConfigSync();
    setupDeviceSelector();
    setupQuestionEditor();
    
    // Add default events
    lobbyCreateBtn.addEventListener("click", () => createNewQuiz());
    btnBackToLobby.addEventListener("click", goToLobby);
    btnRenameActiveQuiz.addEventListener("click", renameActiveQuiz);
    
    addQuestionBtn.addEventListener("click", addNewQuestion);
    btnRefreshPreview.addEventListener("click", refreshPreview);
    btnExportSingle.addEventListener("click", exportSingleFile);
    
    // Start on lobby screen by default
    goToLobby();
}

// --- LocalStorage persistence & Multi-quiz management ---

function loadQuizState(quizData) {
    // Clear existing keys in state reference
    for (let key in state) {
        delete state[key];
    }
    // Deep copy properties from quizData to state
    Object.assign(state, JSON.parse(JSON.stringify(quizData)));
}

function loadQuizzesFromStorage() {
    const storedQuizzes = localStorage.getItem("quiz_generator_quizzes");
    const storedActiveId = localStorage.getItem("quiz_generator_active_id");
    
    if (storedQuizzes) {
        quizzesList = JSON.parse(storedQuizzes);
        activeQuizId = storedActiveId;
        
        let activeQuiz = quizzesList.find(q => q.id === activeQuizId);
        if (!activeQuiz) {
            activeQuiz = quizzesList[0];
        }
        activeQuizId = activeQuiz.id;
        loadQuizState(activeQuiz.data);
    } else {
        // First boot: initialize with default TICpharma quiz
        const initialId = "quiz-" + Date.now();
        const initialQuiz = {
            id: initialId,
            name: "Quiz TICpharma - e-Santé",
            lastModified: new Date().toISOString(),
            data: JSON.parse(JSON.stringify(defaultState))
        };
        quizzesList = [initialQuiz];
        activeQuizId = initialId;
        saveQuizzesToStorage();
        loadQuizState(initialQuiz.data);
    }
}

function saveQuizzesToStorage() {
    localStorage.setItem("quiz_generator_quizzes", quizzesList.length > 0 ? JSON.stringify(quizzesList) : "[]");
    localStorage.setItem("quiz_generator_active_id", activeQuizId);
}

function populateFormFields() {
    colorPrimaryInput.value = state.colorPrimary;
    colorPrimaryHex.textContent = state.colorPrimary.toUpperCase();
    colorAccentInput.value = state.colorAccent;
    colorAccentHex.textContent = state.colorAccent.toUpperCase();
    document.getElementById("linkedin-message").value = state.linkedinMessage || "";
    
    const rankKeys = ["poor", "average", "good", "excellent"];
    rankKeys.forEach((key, idx) => {
        document.getElementById(`rank-title-${idx}`).value = state.ranks[key].title;
        document.getElementById(`rank-desc-${idx}`).value = state.ranks[key].desc;
    });
    
    // reset collapsed states for loaded questions
    questionCollapseState = {};
    state.questions.forEach((_, idx) => {
        questionCollapseState[idx] = true;
    });
    
    renderQuestionsList();
    refreshPreview();
}

function triggerLiveSave() {
    const activeQuiz = quizzesList.find(q => q.id === activeQuizId);
    if (activeQuiz) {
        activeQuiz.data = JSON.parse(JSON.stringify(state));
        activeQuiz.lastModified = new Date().toISOString();
        saveQuizzesToStorage();
    }
}

function renderLobbyQuizzes() {
    quizzesGrid.innerHTML = "";
    
    // Sort quizzes by last modified date (newest first)
    const sortedQuizzes = [...quizzesList].sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    
    // 1. Create Card
    const createCard = document.createElement("div");
    createCard.className = "lobby-create-card";
    createCard.innerHTML = `
        <i class="fa-solid fa-plus"></i>
        <span>Nouveau Quiz</span>
    `;
    createCard.addEventListener("click", () => createNewQuiz());
    quizzesGrid.appendChild(createCard);
    
    // 2. Render all sorted quizzes
    sortedQuizzes.forEach(quiz => {
        const card = document.createElement("div");
        card.className = "lobby-quiz-card";
        
        const dateStr = new Date(quiz.lastModified).toLocaleString("fr-FR", {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
        });
        
        const cardMain = document.createElement("div");
        cardMain.className = "lobby-card-main";
        cardMain.innerHTML = `
            <div class="lobby-card-title">${quiz.name}</div>
            <div class="lobby-card-meta">
                <span><i class="fa-solid fa-circle-question"></i> ${quiz.data.questions.length} question(s)</span>
                <span><i class="fa-solid fa-clock"></i> Modifié le ${dateStr}</span>
            </div>
        `;
        
        const cardActions = document.createElement("div");
        cardActions.className = "lobby-card-actions";
        
        const playBtn = document.createElement("div");
        playBtn.className = "lobby-card-play-btn";
        playBtn.innerHTML = `<span>Éditer le quiz</span> <i class="fa-solid fa-arrow-right"></i>`;
        
        const actionIcons = document.createElement("div");
        actionIcons.className = "lobby-card-action-icons";
        
        // Rename action
        const renameBtn = document.createElement("button");
        renameBtn.className = "lobby-action-btn";
        renameBtn.innerHTML = `<i class="fa-solid fa-pen"></i>`;
        renameBtn.title = "Renommer";
        renameBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const newName = prompt("Entrez le nouveau nom du quiz :", quiz.name);
            if (newName && newName.trim() !== "") {
                quiz.name = newName.trim();
                quiz.lastModified = new Date().toISOString();
                saveQuizzesToStorage();
                renderLobbyQuizzes();
            }
        });
        
        // Delete action
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "lobby-action-btn delete-btn";
        deleteBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;
        deleteBtn.title = "Supprimer";
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm(`Voulez-vous supprimer le quiz "${quiz.name}" ?`)) {
                deleteQuiz(quiz.id);
            }
        });
        
        actionIcons.appendChild(renameBtn);
        actionIcons.appendChild(deleteBtn);
        
        cardActions.appendChild(playBtn);
        cardActions.appendChild(actionIcons);
        
        card.appendChild(cardMain);
        card.appendChild(cardActions);
        
        // Click card to enter workspace
        card.addEventListener("click", () => {
            switchActiveQuiz(quiz.id);
        });
        
        quizzesGrid.appendChild(card);
    });
}

function switchActiveQuiz(id) {
    activeQuizId = id;
    localStorage.setItem("quiz_generator_active_id", activeQuizId);
    
    const activeQuiz = quizzesList.find(q => q.id === id);
    if (activeQuiz) {
        loadQuizState(activeQuiz.data);
        populateFormFields();
        
        // Update sidebar active quiz name
        activeQuizHeaderName.textContent = activeQuiz.name;
        
        // Switch tab to Questions in sidebar
        const questionsTabBtn = document.querySelector('[data-tab="questions"]');
        if (questionsTabBtn) {
            navTabs.forEach(t => t.classList.remove("active"));
            tabContents.forEach(content => content.classList.remove("active"));
            
            questionsTabBtn.classList.add("active");
            document.getElementById("tab-questions").classList.add("active");
        }
        
        // Transition screens
        lobbyScreen.classList.remove("active");
        workspaceScreen.classList.add("active");
        
        // Refresh preview iframe
        refreshPreview();
    }
}

function createNewQuiz() {
    const name = prompt("Entrez le nom du nouveau quiz :", "Mon nouveau Quiz");
    if (name === null) return; // user cancelled
    
    const finalName = name.trim() !== "" ? name.trim() : "Sans titre";
    const newId = "quiz-" + Date.now();
    
    const newQuiz = {
        id: newId,
        name: finalName,
        lastModified: new Date().toISOString(),
        data: JSON.parse(JSON.stringify(defaultState))
    };
    newQuiz.data.title = `Bienvenue sur le quiz <span class="gradient-text">${finalName}</span> !`;
    
    quizzesList.push(newQuiz);
    saveQuizzesToStorage();
    
    switchActiveQuiz(newId);
}

function deleteQuiz(id) {
    const index = quizzesList.findIndex(q => q.id === id);
    if (index !== -1) {
        quizzesList.splice(index, 1);
        
        if (quizzesList.length === 0) {
            const initialId = "quiz-" + Date.now();
            const initialQuiz = {
                id: initialId,
                name: "Quiz TICpharma - e-Santé",
                lastModified: new Date().toISOString(),
                data: JSON.parse(JSON.stringify(defaultState))
            };
            quizzesList = [initialQuiz];
            activeQuizId = initialId;
        } else if (activeQuizId === id) {
            activeQuizId = quizzesList[0].id;
        }
        
        saveQuizzesToStorage();
        renderLobbyQuizzes();
    }
}

function goToLobby() {
    // If there is an active quiz, sync it with workspace state before returning
    if (activeQuizId) {
        const activeQuiz = quizzesList.find(q => q.id === activeQuizId);
        if (activeQuiz) {
            activeQuiz.data = JSON.parse(JSON.stringify(state));
            activeQuiz.lastModified = new Date().toISOString();
            saveQuizzesToStorage();
        }
    }
    
    // Refresh lobby view
    renderLobbyQuizzes();
    
    // Toggle screens
    workspaceScreen.classList.remove("active");
    lobbyScreen.classList.add("active");
}

function renameActiveQuiz() {
    if (!activeQuizId) return;
    const activeQuiz = quizzesList.find(q => q.id === activeQuizId);
    if (!activeQuiz) return;
    
    const newName = prompt("Entrez le nouveau nom du quiz :", activeQuiz.name);
    if (newName && newName.trim() !== "") {
        activeQuiz.name = newName.trim();
        activeQuiz.lastModified = new Date().toISOString();
        saveQuizzesToStorage();
        
        // Update header name
        activeQuizHeaderName.textContent = activeQuiz.name;
    }
}

// --- Tabs engine ---
function setupTabs() {
    navTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const tabId = tab.getAttribute("data-tab");
            
            navTabs.forEach(t => t.classList.remove("active"));
            tabContents.forEach(content => content.classList.remove("active"));
            
            tab.classList.add("active");
            document.getElementById(`tab-${tabId}`).classList.add("active");
        });
    });
}

// --- Device selectors ---
function setupDeviceSelector() {
    deviceBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            deviceBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const device = btn.getAttribute("data-width");
            previewWrapper.className = "preview-device-wrapper";
            
            if (device === "mobile") {
                previewWrapper.classList.add("mobile-width");
            } else if (device === "tablet") {
                previewWrapper.classList.add("tablet-width");
            } else {
                previewWrapper.classList.add("desktop-width");
            }
        });
    });
}

// --- Sync Inputs to State ---
function setupConfigSync() {
    // Colors
    colorPrimaryInput.addEventListener("input", () => {
        state.colorPrimary = colorPrimaryInput.value;
        colorPrimaryHex.textContent = state.colorPrimary.toUpperCase();
        triggerLiveUpdate();
    });
    
    colorAccentInput.addEventListener("input", () => {
        state.colorAccent = colorAccentInput.value;
        colorAccentHex.textContent = state.colorAccent.toUpperCase();
        triggerLiveUpdate();
    });

    // Ranks
    const syncRank = (rankKey, index) => {
        const titleEl = document.getElementById(`rank-title-${index}`);
        const descEl = document.getElementById(`rank-desc-${index}`);
        
        titleEl.addEventListener("input", () => {
            state.ranks[rankKey].title = titleEl.value;
            triggerLiveUpdate();
        });
        
        descEl.addEventListener("input", () => {
            state.ranks[rankKey].desc = descEl.value;
            triggerLiveUpdate();
        });
    };

    syncRank("poor", 0);
    syncRank("average", 1);
    syncRank("good", 2);
    syncRank("excellent", 3);

    // LinkedIn message
    const linkedinMsgEl = document.getElementById("linkedin-message");
    linkedinMsgEl.addEventListener("input", () => {
        state.linkedinMessage = linkedinMsgEl.value;
        triggerLiveSave();
    });
}

// Debounce live preview rendering to avoid lag during typing
let updateTimeout;
function triggerLiveUpdate() {
    triggerLiveSave();
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => {
        refreshPreview();
    }, 250);
}

// --- Questions list building ---
function setupQuestionEditor() {
    // Populate default collapsed states
    state.questions.forEach((_, idx) => {
        if (questionCollapseState[idx] === undefined) {
            questionCollapseState[idx] = true; // start collapsed
        }
    });
}

function renderQuestionsList() {
    questionsListContainer.innerHTML = "";
    questionsBadgeCount.textContent = state.questions.length;
    
    state.questions.forEach((q, qIndex) => {
        const card = document.createElement("div");
        const isCollapsed = questionCollapseState[qIndex] !== false;
        card.className = `question-card ${isCollapsed ? "collapsed" : ""}`;
        card.dataset.index = qIndex;
        
        // Header
        const header = document.createElement("div");
        header.className = "question-card-header";
        
        const info = document.createElement("div");
        info.className = "question-header-info";
        info.innerHTML = `
            <span class="question-header-number">Q${qIndex + 1}</span>
            <span class="question-header-text">${q.question || "(Vide)"}</span>
        `;
        
        const actions = document.createElement("div");
        actions.className = "question-header-actions";
        
        // Collapse toggle btn
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "q-action-btn";
        toggleBtn.innerHTML = isCollapsed ? `<i class="fa-solid fa-chevron-down"></i>` : `<i class="fa-solid fa-chevron-up"></i>`;
        toggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            questionCollapseState[qIndex] = !isCollapsed;
            renderQuestionsList();
        });
        
        // Delete btn
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "q-action-btn delete-btn";
        deleteBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;
        deleteBtn.title = "Supprimer la question";
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm(`Voulez-vous supprimer la question ${qIndex + 1} ?`)) {
                state.questions.splice(qIndex, 1);
                // Adjust collapsed states
                delete questionCollapseState[qIndex];
                // shift down the indexes
                const newCollapseState = {};
                Object.keys(questionCollapseState).forEach(k => {
                    const ik = parseInt(k);
                    if (ik > qIndex) {
                        newCollapseState[ik - 1] = questionCollapseState[ik];
                    } else if (ik < qIndex) {
                        newCollapseState[ik] = questionCollapseState[ik];
                    }
                });
                questionCollapseState = newCollapseState;
                
                renderQuestionsList();
                triggerLiveUpdate();
            }
        });
        
        actions.appendChild(deleteBtn);
        actions.appendChild(toggleBtn);
        
        header.appendChild(info);
        header.appendChild(actions);
        header.addEventListener("click", () => {
            questionCollapseState[qIndex] = !isCollapsed;
            renderQuestionsList();
        });
        
        card.appendChild(header);
        
        // Card Body (Forms)
        const body = document.createElement("div");
        body.className = "question-card-body";
        
        // Question Textarea
        const qTextGroup = document.createElement("div");
        qTextGroup.className = "form-group";
        qTextGroup.innerHTML = `<label>Texte de la question</label>`;
        const qTextarea = document.createElement("textarea");
        qTextarea.rows = 2;
        qTextarea.value = q.question;
        qTextarea.addEventListener("input", () => {
            q.question = qTextarea.value;
            info.querySelector(".question-header-text").textContent = q.question || "(Vide)";
            triggerLiveUpdate();
        });
        qTextGroup.appendChild(qTextarea);
        body.appendChild(qTextGroup);
        
        // Choices box
        const choicesBox = document.createElement("div");
        choicesBox.className = "choices-editor-box";
        
        const choicesHeader = document.createElement("div");
        choicesHeader.className = "choices-editor-header";
        choicesHeader.innerHTML = `
            <h4>Options de réponse (Cochez la bonne réponse)</h4>
            <button class="btn btn-secondary btn-sm add-choice-btn">
                <i class="fa-solid fa-plus"></i> Option
            </button>
        `;
        choicesBox.appendChild(choicesHeader);
        
        const choiceContainer = document.createElement("div");
        choiceContainer.className = "choices-container-inputs";
        
        q.choices.forEach((choice, cIdx) => {
            const row = document.createElement("div");
            row.className = "choice-row";
            
            const radioContainer = document.createElement("label");
            radioContainer.className = "choice-radio-container";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = `correct-q${qIndex}`;
            radio.checked = (q.correctIndex === cIdx);
            radio.addEventListener("change", () => {
                q.correctIndex = cIdx;
                triggerLiveUpdate();
            });
            radioContainer.appendChild(radio);
            row.appendChild(radioContainer);
            
            const cInput = document.createElement("input");
            cInput.type = "text";
            cInput.value = choice;
            cInput.placeholder = `Option ${cIdx + 1}`;
            cInput.addEventListener("input", () => {
                q.choices[cIdx] = cInput.value;
                triggerLiveUpdate();
            });
            row.appendChild(cInput);
            
            const cDeleteBtn = document.createElement("button");
            cDeleteBtn.className = "q-action-btn delete-choice-btn";
            cDeleteBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
            cDeleteBtn.disabled = q.choices.length <= 2;
            cDeleteBtn.addEventListener("click", () => {
                q.choices.splice(cIdx, 1);
                // adjust correct index if affected
                if (q.correctIndex >= q.choices.length) {
                    q.correctIndex = q.choices.length - 1;
                }
                renderQuestionsList();
                triggerLiveUpdate();
            });
            row.appendChild(cDeleteBtn);
            
            choiceContainer.appendChild(row);
        });
        
        choicesBox.appendChild(choiceContainer);
        body.appendChild(choicesBox);
        
        // Add option handler
        choicesHeader.querySelector(".add-choice-btn").addEventListener("click", () => {
            if (q.choices.length >= 5) {
                alert("Maximum 5 options par question !");
                return;
            }
            q.choices.push("");
            renderQuestionsList();
            triggerLiveUpdate();
        });
        
        // Explanations (Correct / Incorrect)
        const explRow = document.createElement("div");
        explRow.className = "form-row";
        
        const explCorrectGroup = document.createElement("div");
        explCorrectGroup.className = "form-group col";
        explCorrectGroup.innerHTML = `<label>Explication (si Bonne Réponse) 👍</label>`;
        const explCorrectTextarea = document.createElement("textarea");
        explCorrectTextarea.rows = 4;
        explCorrectTextarea.value = q.explanationCorrect || "";
        explCorrectTextarea.addEventListener("input", () => {
            q.explanationCorrect = explCorrectTextarea.value;
            triggerLiveUpdate();
        });
        explCorrectGroup.appendChild(explCorrectTextarea);
        explRow.appendChild(explCorrectGroup);
        
        const explIncorrectGroup = document.createElement("div");
        explIncorrectGroup.className = "form-group col";
        explIncorrectGroup.innerHTML = `<label>Explication (si Mauvaise Réponse) 👎</label>`;
        const explIncorrectTextarea = document.createElement("textarea");
        explIncorrectTextarea.rows = 4;
        explIncorrectTextarea.value = q.explanationIncorrect || "";
        explIncorrectTextarea.addEventListener("input", () => {
            q.explanationIncorrect = explIncorrectTextarea.value;
            triggerLiveUpdate();
        });
        explIncorrectGroup.appendChild(explIncorrectTextarea);
        explRow.appendChild(explIncorrectGroup);
        
        body.appendChild(explRow);
        
        card.appendChild(body);
        questionsListContainer.appendChild(card);
    });
}

function addNewQuestion() {
    const newIdx = state.questions.length;
    state.questions.push({
        question: "Nouvelle question ?",
        choices: ["Option A", "Option B", "Option C"],
        correctIndex: 0,
        explanationCorrect: "Bravo ! C'est la bonne réponse.",
        explanationIncorrect: "Perdu ! La bonne réponse était..."
    });
    questionCollapseState[newIdx] = false; // keep open
    renderQuestionsList();
    triggerLiveUpdate();
    
    // Scroll to the bottom of editor
    setTimeout(() => {
        const editor = document.querySelector(".editor-section");
        editor.scrollTop = editor.scrollHeight;
    }, 100);
}

// --- Live Preview Frame Engine ---
function refreshPreview() {
    const htmlContent = generateSingleFileHtml();
    previewIframe.srcdoc = htmlContent;
}

// Helper to convert hex to RGB
function hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 48, b: 135 }; // fallback primary blue
}

// --- Template Generateur de CSS ---
function getGeneratedCssContent() {
    const rgbPrim = hexToRgb(state.colorPrimary);
    const rgbAcc = hexToRgb(state.colorAccent);
    
    const primHover = `rgb(${Math.round(rgbPrim.r * 0.7)}, ${Math.round(rgbPrim.g * 0.7)}, ${Math.round(rgbPrim.b * 0.7)})`;
    const accDark = `rgb(${Math.round(rgbAcc.r * 0.75)}, ${Math.round(rgbAcc.g * 0.75)}, ${Math.round(rgbAcc.b * 0.75)})`;
    const primLight = `rgba(${rgbPrim.r}, ${rgbPrim.g}, ${rgbPrim.b}, 0.05)`;
    const accLight = `rgba(${rgbAcc.r}, ${rgbAcc.g}, ${rgbAcc.b}, 0.12)`;
    const cardBorder = `rgba(${rgbPrim.r}, ${rgbPrim.g}, ${rgbPrim.b}, 0.08)`;
    
    return `/* ==========================================================================
   Quiz Stylesheet - Generated custom styles
   ========================================================================== */

:root {
    --primary-blue: ${state.colorPrimary};
    --primary-blue-hover: ${primHover};
    --primary-blue-light: ${primLight};
    
    --accent-green: ${state.colorAccent};
    --accent-green-dark: ${accDark};
    --accent-green-light: ${accLight};
    
    --bg-light: #f8fafc;
    --bg-gradient-end: #edf2f7;
    --card-bg: #ffffff;
    --card-border: ${cardBorder};
    
    --text-main: #1e293b;
    --text-muted: #64748b;
    --text-dark-blue: ${state.colorPrimary};
    
    --color-correct: #2e7d32;
    --color-correct-bg: rgba(46, 125, 50, 0.08);
    --color-correct-border: #81c784;
    
    --color-incorrect: #d32f2f;
    --color-incorrect-bg: rgba(211, 47, 47, 0.06);
    --color-incorrect-border: #e57373;
    
    --border-radius-lg: 24px;
    --border-radius-md: 16px;
    --border-radius-sm: 8px;
    --font-family: 'Plus Jakarta Sans', sans-serif;
    
    --transition-smooth: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
}

body {
    font-family: var(--font-family);
    background: transparent;
    color: var(--text-main);
    height: 100vh;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    position: relative;
    overflow-x: hidden;
    padding: 0;
    margin: 0;
}

.quiz-container {
    width: 100%;
    max-width: 680px;
    display: flex;
    flex-direction: column;
    z-index: 10;
    padding: 20px 16px;
}

.quiz-card {
    background: transparent;
    border: none;
    padding: 0;
    min-height: auto;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
}

.quiz-section {
    display: none;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    flex-direction: column;
    justify-content: flex-start;
    flex-grow: 1;
}

.quiz-section.active {
    display: flex;
    opacity: 1;
    transform: translateY(0);
}



.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 32px;
    border-radius: var(--border-radius-md);
    font-family: var(--font-family);
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    border: none;
    transition: var(--transition-smooth);
    outline: none;
}

.btn-primary {
    background: var(--primary-blue);
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(${rgbPrim.r}, ${rgbPrim.g}, ${rgbPrim.b}, 0.15);
}

.btn-primary:hover {
    background: var(--primary-blue-hover);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(${rgbPrim.r}, ${rgbPrim.g}, ${rgbPrim.b}, 0.25);
}

.btn-primary:active {
    transform: translateY(0);
}

.btn-secondary {
    background: #f1f5f9;
    color: var(--primary-blue);
    border: 1px solid #e2e8f0;
}

.btn-secondary:hover {
    background: #e2e8f0;
    color: var(--primary-blue-hover);
    transform: translateX(2px);
}

.btn-outline {
    background: transparent;
    color: var(--primary-blue);
    border: 1px solid rgba(${rgbPrim.r}, ${rgbPrim.g}, ${rgbPrim.b}, 0.2);
}

.btn-outline:hover {
    background: var(--primary-blue-light);
    border-color: var(--primary-blue);
}

.btn-linkedin {
    background: #0a66c2;
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(10, 102, 194, 0.15);
}

.btn-linkedin:hover {
    background: #004182;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(10, 102, 194, 0.25);
}

.btn-linkedin:active {
    transform: translateY(0);
}

.btn-lg {
    padding: 16px 40px;
    font-size: 1.05rem;
}

.btn-icon {
    font-size: 0.9rem;
    transition: var(--transition-smooth);
}

.btn-primary:hover .btn-icon {
    transform: translateX(3px);
}

.status-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 24px;
}

.progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

#score-counter {
    background: var(--accent-green-light);
    color: var(--accent-green-dark);
    padding: 4px 12px;
    border-radius: var(--border-radius-sm);
    border: 1px solid rgba(${rgbAcc.r}, ${rgbAcc.g}, ${rgbAcc.b}, 0.3);
    display: flex;
    align-items: center;
    gap: 6px;
}

.counter-star {
    color: #d97706;
}

.progress-bar-container {
    background: #f1f5f9;
    height: 6px;
    width: 100%;
    border-radius: var(--border-radius-sm);
    overflow: hidden;
    border: 1px solid #e2e8f0;
}

.progress-bar {
    background: linear-gradient(90deg, var(--primary-blue) 0%, var(--accent-green) 100%);
    height: 100%;
    border-radius: var(--border-radius-sm);
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.question-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 20px;
}

.question-text {
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.4;
    color: var(--text-dark-blue);
}

.choices-container {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
}

.choice-btn {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    color: var(--text-main);
    padding: 16px 20px;
    border-radius: var(--border-radius-md);
    text-align: left;
    font-family: var(--font-family);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-smooth);
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    outline: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.01);
}

.choice-btn:hover:not(:disabled) {
    background: #f8fafc;
    border-color: var(--primary-blue);
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(${rgbPrim.r}, ${rgbPrim.g}, ${rgbPrim.b}, 0.05);
}

.choice-btn:disabled {
    cursor: not-allowed;
}

.choice-btn.correct {
    background: var(--color-correct-bg) !important;
    border-color: var(--color-correct-border) !important;
    color: var(--color-correct) !important;
    box-shadow: 0 2px 8px rgba(46, 125, 50, 0.05);
    font-weight: 700;
    opacity: 1 !important;
}

.choice-btn.incorrect {
    background: var(--color-incorrect-bg) !important;
    border-color: var(--color-incorrect-border) !important;
    color: var(--color-incorrect) !important;
    box-shadow: 0 2px 8px rgba(211, 47, 47, 0.05);
    opacity: 1 !important;
    animation: shake 0.4s ease-in-out;
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-4px); }
    40%, 80% { transform: translateX(4px); }
}

.choice-icon {
    font-size: 1.1rem;
    margin-left: 10px;
}

.explanation-container {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: var(--border-radius-md);
    padding: 20px;
    margin-top: 15px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: fade-slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.explanation-content-layout {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 8px 0;
}

.explanation-gif {
    max-width: 100%;
    width: 100px;
    height: auto;
    border-radius: var(--border-radius-sm);
    flex-shrink: 0;
}

.explanation-container.hidden {
    display: none;
}

@keyframes fade-slide-in {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.explanation-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.explanation-container.correct-expl {
    background: #f0fdf4;
    border-color: #dcfce7;
}
.explanation-container.correct-expl .explanation-badge {
    color: var(--color-correct);
}

.explanation-container.incorrect-expl {
    background: #fef2f2;
    border-color: #fee2e2;
}
.explanation-container.incorrect-expl .explanation-badge {
    color: var(--color-incorrect);
}

.explanation-text {
    font-size: 0.9rem;
    color: var(--text-main);
    line-height: 1.55;
}

.explanation-container .btn-secondary {
    align-self: flex-end;
    margin-top: 5px;
    padding: 10px 20px;
    font-size: 0.85rem;
}

.result-content {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
}

.trophy-container {
    width: 90px;
    height: 90px;
    background: rgba(${rgbPrim.r}, ${rgbPrim.g}, ${rgbPrim.b}, 0.03);
    border: 1px solid rgba(${rgbPrim.r}, ${rgbPrim.g}, ${rgbPrim.b}, 0.1);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(${rgbPrim.r}, ${rgbPrim.g}, ${rgbPrim.b}, 0.02);
}

.trophy-icon {
    font-size: 2.5rem;
    color: #d97706;
    filter: drop-shadow(0 2px 4px rgba(217, 119, 6, 0.2));
}

.animate-bounce {
    animation: bounce 2s infinite;
}

@keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
}

.result-title {
    font-size: 2rem;
    font-weight: 800;
    color: var(--text-dark-blue);
}

.score-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: var(--border-radius-md);
    padding: 16px 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.score-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.score-display {
    display: flex;
    align-items: baseline;
}

.score-num {
    font-size: 3rem;
    font-weight: 800;
    color: var(--primary-blue);
    line-height: 1;
}

.score-total {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--text-muted);
    margin-left: 2px;
}

.rank-card {
    max-width: 460px;
}

.rank-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: block;
    margin-bottom: 6px;
}

.rank-title-text {
    font-size: 1.45rem;
    font-weight: 800;
    color: var(--text-dark-blue);
    margin-bottom: 6px;
}

.rank-desc-text {
    font-size: 0.9rem;
    color: var(--text-muted);
    line-height: 1.5;
}

.share-promo {
    background: rgba(10, 102, 194, 0.04);
    border: 1px dashed rgba(10, 102, 194, 0.2);
    border-radius: var(--border-radius-md);
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    max-width: 520px;
    margin-top: 10px;
    margin-bottom: 12px;
}

.share-promo .promo-icon {
    font-size: 1.6rem;
    color: #0a66c2;
    flex-shrink: 0;
}

.share-promo .promo-text {
    font-size: 0.85rem;
    color: #004182;
    font-weight: 600;
    line-height: 1.45;
}

.result-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 440px;
    margin: 0 auto;
}

.btn-full {
    width: 100%;
    justify-content: center;
}

.result-actions-secondary {
    display: flex;
    gap: 12px;
    width: 100%;
}

.result-actions-secondary .btn {
    flex: 1;
}



.share-toast {
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%) translateY(0);
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #ffffff;
    padding: 12px 24px;
    border-radius: 50px;
    font-weight: 700;
    font-size: 0.85rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    z-index: 9999;
    animation: toast-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    transition: opacity 0.4s ease, transform 0.4s ease;
}

.share-toast.fade-out {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
}

@keyframes toast-in {
    from {
        opacity: 0;
        transform: translateX(-50%) translateY(15px);
    }
    to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }
}

@media (max-width: 768px) {
    .quiz-card {
        min-height: auto;
    }
    .main-title {
        font-size: 1.8rem;
    }
    .question-text {
        font-size: 1.15rem;
    }
    .choice-btn {
        padding: 14px 18px;
        font-size: 0.9rem;
    }
    .result-actions {
        flex-direction: column;
        align-items: center;
        gap: 10px;
        width: 100%;
    }
    .result-actions-secondary {
        flex-direction: column;
        gap: 10px;
        width: 100%;
    }
    .result-actions .btn {
        max-width: 100%;
        width: 100%;
    }
    .explanation-content-layout {
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }
    .explanation-gif {
        width: 80px;
    }
}

@media (max-width: 480px) {
    .quiz-card {
        padding: 20px 16px;
    }
    .logo {
        height: 36px;
    }
    .badge {
        padding: 4px 10px;
        font-size: 0.7rem;
    }
    .main-title {
        font-size: 1.6rem;
    }
    .rules-card {
        padding: 16px;
    }
    .explanation-container {
        padding: 16px;
    }
}

/* Embedded / Iframe Controls */
.embed-controls {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s ease;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
}

body:hover .embed-controls,
.embed-controls.open {
    opacity: 1;
}

@media (hover: none) {
    .embed-controls {
        opacity: 0.6;
    }
}

.embed-menu-btn {
    background: #ffffff;
    border: 1px solid rgba(0, 48, 135, 0.1);
    color: var(--primary-blue);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    transition: all 0.2s ease;
    outline: none;
}

.embed-menu-btn:hover {
    transform: scale(1.05);
    background-color: var(--primary-blue-light);
    border-color: rgba(0, 48, 135, 0.2);
}

.embed-dropdown {
    display: none;
    background: #ffffff;
    border: 1px solid rgba(0, 48, 135, 0.08);
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 10px 25px rgba(0, 48, 135, 0.1);
    flex-direction: column;
    gap: 4px;
    min-width: 150px;
    animation: dropdown-in 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.embed-controls.open .embed-dropdown {
    display: flex;
}

@keyframes dropdown-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.dropdown-item {
    background: transparent;
    border: none;
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-family);
    font-size: 0.85rem;
    font-weight: 700;
    color: #475569;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
    width: 100%;
    outline: none;
}

.dropdown-item i {
    font-size: 0.95rem;
    color: var(--primary-blue);
    width: 18px;
    text-align: center;
}

.dropdown-item:hover {
    background-color: var(--primary-blue-light);
    color: var(--primary-blue-hover);
}


`;
}

// --- Template Generateur de JS ---
function getGeneratedJsContent() {
    return `/* ==========================================================================
   Quiz Application Engine - Generated code
   ========================================================================== */

// Quiz Data Custom definition
const QUIZ_QUESTIONS = ${JSON.stringify(state.questions, null, 4)};

const RANK_RULES = ${JSON.stringify(state.ranks, null, 4)};

const LINKEDIN_MESSAGE = ${JSON.stringify(state.linkedinMessage || '')};

// App State
let currentQuestionIndex = 0;
let score = 0;
let answerSelected = false;

// DOM Elements Cache
const gameScreen = document.getElementById("game-screen");
const resultScreen = document.getElementById("result-screen");

const nextBtn = document.getElementById("next-btn");
const restartBtn = document.getElementById("restart-btn");
const shareBtn = document.getElementById("share-btn");
const linkedinBtn = document.getElementById("linkedin-btn");

const questionNumberText = document.getElementById("question-number");
const scoreCounterText = document.getElementById("score-counter");
const progressBar = document.getElementById("progress-bar");
const questionText = document.getElementById("question-text");
const choicesContainer = document.getElementById("choices-container");

const explanationContainer = document.getElementById("explanation-container");
const explanationIcon = document.getElementById("explanation-icon");
const explanationTitle = document.getElementById("explanation-title");
const explanationText = document.getElementById("explanation-text");
const explanationGif = document.getElementById("explanation-gif");

const finalScoreText = document.getElementById("final-score");
const scoreTotalText = document.getElementById("score-total");
const rankTitleText = document.getElementById("rank-title");
const rankDescText = document.getElementById("rank-description");

// Initialize Event Listeners
function init() {

    
    nextBtn.addEventListener("click", nextQuestion);
    restartBtn.addEventListener("click", startQuiz);
    shareBtn.addEventListener("click", shareResult);
    linkedinBtn.addEventListener("click", shareOnLinkedIn);
    
    // Setup the embed controls (fullscreen, share)
    setupEmbedControls();
    
    // Load the first question immediately
    score = 0;
    currentQuestionIndex = 0;
    answerSelected = false;
    loadQuestion(0);
}

// Start Quiz flow (called on restart)
function startQuiz() {
    score = 0;
    currentQuestionIndex = 0;
    answerSelected = false;
    
    changeScreen(resultScreen, gameScreen);
    loadQuestion(currentQuestionIndex);
}

// Load Question to UI
function loadQuestion(index) {
    answerSelected = false;
    const currentQuestion = QUIZ_QUESTIONS[index];
    if (!currentQuestion) {
        choicesContainer.innerHTML = "";
        return;
    }
    
    choicesContainer.innerHTML = "";
    explanationContainer.classList.add("hidden");
    explanationContainer.className = "explanation-container hidden";
    explanationGif.src = ""; // reset gif src
    nextBtn.disabled = true;
    
    questionNumberText.textContent = \`Question \${index + 1} sur \${QUIZ_QUESTIONS.length}\`;
    scoreCounterText.innerHTML = \`<i class="fa-solid fa-star counter-star"></i> Score: \${score}\`;
    
    const progressPercent = ((index + 1) / QUIZ_QUESTIONS.length) * 100;
    progressBar.style.width = \`\${progressPercent}%\`;
    
    questionText.textContent = currentQuestion.question;
    
    currentQuestion.choices.forEach((choice, choiceIndex) => {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.innerHTML = \`
            <span>\${choice}</span>
            <span class="icon-holder"></span>
        \`;
        btn.addEventListener("click", () => handleSelectAnswer(choiceIndex, btn));
        choicesContainer.appendChild(btn);
    });
    sendHeightToParent();
}

// Handle selected answer
function handleSelectAnswer(selectedIndex, clickedBtn) {
    if (answerSelected) return;
    answerSelected = true;
    
    const currentQuestion = QUIZ_QUESTIONS[currentQuestionIndex];
    const correctIndex = currentQuestion.correctIndex;
    const isCorrect = (selectedIndex === correctIndex);
    
    if (isCorrect) {
        score++;
        scoreCounterText.innerHTML = \`<i class="fa-solid fa-star counter-star"></i> Score: \${score}\`;
        
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 15,
                spread: 30,
                origin: { y: 0.8 }
            });
        }
    }
    
    const buttons = choicesContainer.querySelectorAll(".choice-btn");
    buttons.forEach((btn, idx) => {
        btn.disabled = true;
        
        if (idx === correctIndex) {
            btn.classList.add("correct");
            btn.querySelector(".icon-holder").innerHTML = \`<i class="fa-solid fa-circle-check choice-icon"></i>\`;
        } else if (idx === selectedIndex && !isCorrect) {
            btn.classList.add("incorrect");
            btn.querySelector(".icon-holder").innerHTML = \`<i class="fa-solid fa-circle-xmark choice-icon"></i>\`;
        } else {
            btn.style.opacity = "0.4";
        }
    });
    
    explanationText.textContent = isCorrect ? currentQuestion.explanationCorrect : currentQuestion.explanationIncorrect;
    explanationGif.src = isCorrect ? "https://media.tenor.com/wH5dxMpEEYUAAAAi/thumbs-up-cute.gif" : "https://media.tenor.com/iKWUyvj-LREAAAAi/coach-josh-coach.gif";
    explanationContainer.classList.remove("hidden");
    
    if (isCorrect) {
        explanationContainer.classList.add("correct-expl");
        explanationIcon.className = "fa-solid fa-face-laugh-beam";
        explanationTitle.textContent = "Bonne réponse !";
    } else {
        explanationContainer.classList.add("incorrect-expl");
        explanationIcon.className = "fa-solid fa-lightbulb";
        explanationTitle.textContent = "La bonne réponse était...";
    }
    
    nextBtn.disabled = false;
    sendHeightToParent();
}

function nextQuestion() {
    currentQuestionIndex++;
    
    if (currentQuestionIndex < QUIZ_QUESTIONS.length) {
        loadQuestion(currentQuestionIndex);
    } else {
        showResults();
    }
}

// Show Final Screen
function showResults() {
    changeScreen(gameScreen, resultScreen);
    
    finalScoreText.textContent = score;
    scoreTotalText.textContent = \`/ \${QUIZ_QUESTIONS.length}\`;
    
    const total = QUIZ_QUESTIONS.length;
    
    // Calculate percentage thresholds dynamically
    const excellentThreshold = Math.ceil(total * 0.9);
    const goodThreshold = Math.ceil(total * 0.6);
    const averageThreshold = Math.ceil(total * 0.4);
    
    let rank = "";
    let desc = "";
    
    if (score >= excellentThreshold) {
        rank = RANK_RULES.excellent.title;
        desc = RANK_RULES.excellent.desc;
        triggerVictoryConfetti();
    } else if (score >= goodThreshold) {
        rank = RANK_RULES.good.title;
        desc = RANK_RULES.good.desc;
        triggerHappyConfetti();
    } else if (score >= averageThreshold) {
        rank = RANK_RULES.average.title;
        desc = RANK_RULES.average.desc;
    } else {
        rank = RANK_RULES.poor.title;
        desc = RANK_RULES.poor.desc;
    }
    
    rankTitleText.textContent = rank;
    rankDescText.textContent = desc;
}



function shareResult() {
    const shareText = \`J'ai obtenu le score de \${score}/\${QUIZ_QUESTIONS.length} au quiz ! Mon titre : \${rankTitleText.textContent}. Venez tester vos connaissances : \${window.location.href}\`;
    const isLocalFile = window.location.protocol === "file:";
    
    if (!isLocalFile && navigator.share && window.isSecureContext) {
        navigator.share({
            title: 'Quiz interactif',
            text: shareText,
            url: window.location.href,
        }).catch(err => {
            copyToClipboard(shareText);
        });
    } else {
        copyToClipboard(shareText);
    }
}

function shareOnLinkedIn() {
    const postText = LINKEDIN_MESSAGE
        .replace(/\{score\}/g, score)
        .replace(/\{total\}/g, QUIZ_QUESTIONS.length)
        .replace(/\{title\}/g, rankTitleText.textContent);
    
    copyToClipboard(postText, "Message de partage copié ! Ouvrons LinkedIn (collez avec Ctrl+V) 📋");
    
    setTimeout(() => {
        window.open("https://www.linkedin.com/sharing/share-offsite/?url=https://www.ticpharma.com/", "_blank");
    }, 1200);
}

function copyToClipboard(text, successMessage = "Résultats copiés dans le presse-papiers ! 📋") {
    const isLocalFile = window.location.protocol === "file:";
    
    if (isLocalFile) {
        showToastNotification("Copie simulée (disponible une fois en HTTPS) 🧪");
    } else if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification(successMessage);
        }).catch(err => {
            showToastNotification("Erreur lors de la copie automatique ⚠️");
        });
    } else {
        showToastNotification("Presse-papiers indisponible (HTTPS requis) ⚠️");
    }
}

function showToastNotification(message) {
    const notification = document.createElement("div");
    notification.className = "share-toast";
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add("fade-out");
        setTimeout(() => notification.remove(), 500);
    }, 2800);
}

function changeScreen(fromScreen, toScreen) {
    fromScreen.classList.remove("active");
    
    setTimeout(() => {
        fromScreen.style.display = "none";
        toScreen.style.display = "flex";
        toScreen.offsetHeight; // force reflow
        toScreen.classList.add("active");
        sendHeightToParent();
    }, 400);
}

function triggerVictoryConfetti() {
    if (typeof confetti !== 'function') return;
    
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    (function frame() {
        confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#003087', '#6ecd9c', '#ffffff']
        });
        confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#003087', '#6ecd9c', '#ffffff']
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

function triggerHappyConfetti() {
    if (typeof confetti !== 'function') return;
    confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#003087', '#6ecd9c', '#ffffff']
    });
}

function getShareUrl() {
    try {
        if (window.self !== window.top) {
            return window.parent.location.href;
        }
    } catch (e) {
        if (document.referrer) {
            return document.referrer;
        }
    }
    return window.location.href;
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            alert("Le mode plein écran n'est pas autorisé ou n'est pas pris en charge par votre navigateur.");
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

function setupEmbedControls() {
    const embedControls = document.getElementById("embed-controls");
    const menuBtn = document.getElementById("embed-menu-btn");
    const shareBtn = document.getElementById("btn-embed-share");
    const fullscreenBtn = document.getElementById("btn-embed-fullscreen");

    if (!menuBtn) return;

    menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        embedControls.classList.toggle("open");
    });

    document.addEventListener("click", () => {
        embedControls.classList.remove("open");
    });

    shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        embedControls.classList.remove("open");
        
        const shareUrl = getShareUrl();
        const shareText = \`Venez tester vos connaissances avec ce quiz interactif TICpharma ! : \${shareUrl}\`;
        
        if (navigator.share && window.isSecureContext) {
            navigator.share({
                title: 'Quiz interactif',
                text: 'Testez vos connaissances !',
                url: shareUrl,
            }).catch(() => {
                copyToClipboard(shareText);
            });
        } else {
            copyToClipboard(shareText);
        }
    });

    fullscreenBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        embedControls.classList.remove("open");
        toggleFullscreen();
    });

    document.addEventListener("fullscreenchange", () => {
        if (document.fullscreenElement) {
            fullscreenBtn.innerHTML = \`<i class="fa-solid fa-compress"></i> <span>Quitter</span>\`;
        } else {
            fullscreenBtn.innerHTML = \`<i class="fa-solid fa-expand"></i> <span>Plein écran</span>\`;
        }
    });
}

document.addEventListener("DOMContentLoaded", init);

function sendHeightToParent() {
    setTimeout(() => {
        const height = document.documentElement.scrollHeight || document.body.scrollHeight;
        try {
            if (window.parent && window.parent !== window) {
                const iframes = window.parent.document.getElementsByTagName('iframe');
                for (let i = 0; i < iframes.length; i++) {
                    if (iframes[i].contentWindow === window) {
                        iframes[i].style.height = height + 'px';
                        return;
                    }
                }
            }
        } catch (e) {
            // Cross-origin fallback
        }
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'resize-iframe', height: height }, '*');
        }
    }, 100);
}
`;
}

// --- Generator HTML Compiler ---
function getGeneratedHtmlContent(isSingleFile = false) {
    let stylesInclude = `<link rel="stylesheet" href="style.css">`;
    let scriptsInclude = `<script src="app.js"></script>`;
    
    if (isSingleFile) {
        stylesInclude = `<style>${getGeneratedCssContent()}</style>`;
        scriptsInclude = `<script>${getGeneratedJsContent()}</script>`;
    }
    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quiz TICpharma</title>
    
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    
    <!-- FontAwesome for modern icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <!-- Embedded Styles -->
    ${stylesInclude}
</head>
<body>
    <!-- Floating embed controls (share, fullscreen) -->
    <div class="embed-controls" id="embed-controls">
        <button class="embed-menu-btn" id="embed-menu-btn" title="Options" aria-label="Options du quiz">
            <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
        <div class="embed-dropdown" id="embed-dropdown">
            <button class="dropdown-item" id="btn-embed-share">
                <i class="fa-solid fa-share-nodes"></i>
                <span>Partager</span>
            </button>
            <button class="dropdown-item" id="btn-embed-fullscreen">
                <i class="fa-solid fa-expand"></i>
                <span>Plein écran</span>
            </button>
        </div>
    </div>

    <div class="quiz-container">
        <main class="quiz-card" id="quiz-card">

            <!-- SCREEN 2: Question & Gameplay -->
            <section id="game-screen" class="quiz-section active">
                <!-- Progress & Score panel -->
                <div class="status-panel">
                    <div class="progress-info">
                        <span id="question-number">Question 1 sur 10</span>
                        <span id="score-counter"><i class="fa-solid fa-star counter-star"></i> Score: 0</span>
                    </div>
                    <div class="progress-bar-container">
                        <div id="progress-bar" class="progress-bar" style="width: 10%;"></div>
                    </div>
                </div>

                <!-- The Question Content -->
                <div class="question-container">
                    <h2 id="question-text" class="question-text">Ce quiz ne contient aucune question pour le moment.</h2>
                    
                    <!-- Choices container -->
                    <div id="choices-container" class="choices-container">
                        <!-- Dynamic choice buttons inserted here via JS -->
                    </div>
                </div>

                <!-- Explanation Panel (revealed after choice selection) -->
                <div id="explanation-container" class="explanation-container hidden">
                    <div class="explanation-badge">
                        <i id="explanation-icon" class="fa-solid"></i>
                        <span id="explanation-title">Explication</span>
                    </div>
                    <div class="explanation-content-layout">
                        <img id="explanation-gif" class="explanation-gif" src="" alt="Feedback GIF">
                        <p id="explanation-text" class="explanation-text">Aucune explication disponible.</p>
                    </div>
                    
                    <button id="next-btn" class="btn btn-secondary">
                        <span class="btn-text">Question suivante</span>
                        <i class="fa-solid fa-arrow-right btn-icon"></i>
                    </button>
                </div>
            </section>

            <!-- SCREEN 3: Results / Final Screen -->
            <section id="result-screen" class="quiz-section">
                <div class="result-content">
                    <div class="trophy-container">
                        <i class="fa-solid fa-trophy trophy-icon animate-bounce"></i>
                    </div>
                    <h1 class="result-title">Quiz Terminé !</h1>
                    
                    <div class="score-card">
                        <span class="score-label">Votre score final :</span>
                        <div class="score-display">
                            <span id="final-score" class="score-num">8</span>
                            <span class="score-total" id="score-total">/ 10</span>
                        </div>
                    </div>

                    <div class="rank-card">
                        <span class="rank-label">Titre obtenu :</span>
                        <h2 id="rank-title" class="rank-title-text">Expert Connecté 💻</h2>
                        <p id="rank-description" class="rank-desc-text">Vous maîtrisez très bien les rouages de la e-santé !</p>
                    </div>

                    <div class="share-promo">
                        <i class="fa-brands fa-linkedin promo-icon"></i>
                        <span class="promo-text">Brillez auprès de votre réseau pro ! Partagez vos résultats sur votre fil LinkedIn.</span>
                    </div>

                    <div class="result-actions">
                        <button id="linkedin-btn" class="btn btn-linkedin btn-full">
                            <i class="fa-brands fa-linkedin btn-icon"></i>
                            <span class="btn-text">Partager sur LinkedIn</span>
                        </button>
                        <div class="result-actions-secondary">
                            <button id="restart-btn" class="btn btn-secondary">
                                <i class="fa-solid fa-rotate-right btn-icon"></i>
                                <span class="btn-text">Recommencer</span>
                            </button>
                            <button id="share-btn" class="btn btn-outline" title="Copier le lien de partage">
                                <i class="fa-solid fa-link btn-icon"></i>
                                <span class="btn-text">Copier</span>
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    </div>

    <!-- Canvas Confetti Library -->
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
    
    <!-- Custom Application Logic -->
    ${scriptsInclude}
</body>
</html>`;
}

function generateSingleFileHtml() {
    return getGeneratedHtmlContent(true);
}

// --- Single HTML File Exporter ---
function exportSingleFile() {
    if (!state.questions || state.questions.length === 0) {
        alert("Vous devez avoir au moins une question pour exporter le quiz !");
        return;
    }
    
    const htmlContent = generateSingleFileHtml();
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "quiz-interactif-autonome.html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Run init on DOM load
document.addEventListener("DOMContentLoaded", init);
