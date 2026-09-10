// Supabase Project Credentials (to be filled by the user)
const supabaseUrl = 'https://vutrblnazmxazjgselks.supabase.co'; // Replace with your real Supabase project URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dHJibG5hem14YXpqZ3NlbGtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDE3MTMsImV4cCI6MjA5Nzg3NzcxM30.BvhswkR0YCNQEl4H-gPVGUW28nkveU9mxU5Oj3YXYVQ'; // Replace with your real Supabase Anon Key (public anon key)

// Hardcoded Admin Credentials for auto-login (safe under RLS policy)
const adminEmail = 'nicococh@gmail.com'; // Replace with your admin user email
const adminPassword = 'rEZ$v8H/y#kppWt'; // Replace with your admin user password

let supabaseClient = null;
if (supabaseUrl && supabaseKey && supabaseUrl !== 'YOUR_SUPABASE_URL' && supabaseKey !== 'YOUR_ANON_KEY') {
  if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
  }
}

// State Management
let candidates = [];
let selectedCandidateId = null;
let currentCategory = "Organisation du système de santé";
let config = {
  id: "config",
  secondTourActive: false,
  secondTourDate: null
};

// Sauvegarder vers Supabase
async function saveToSupabase() {
  try {
    if (!supabaseClient) {
      alert("Supabase n'est pas configuré. Veuillez renseigner supabaseUrl et supabaseKey au début du fichier admin/app.js.");
      return;
    }
    
    console.log("Saving candidates and config to Supabase...");
    const [candidatesRes, configRes] = await Promise.all([
      supabaseClient.from('candidates').upsert({ key: 'candidates_data', value: candidates }),
      supabaseClient.from('config').upsert({ key: 'second_tour_config', value: config })
    ]);
      
    if (candidatesRes.error) throw candidatesRes.error;
    if (configRes.error) throw configRes.error;
    
    alert("Données enregistrées sur Supabase avec succès !");
  } catch (err) {
    console.error("Supabase save failed", err);
    alert("Échec de l'enregistrement sur Supabase : " + err.message);
  }
}

// Categories definition
const standardCategories = [
  "Organisation du système de santé",
  "Établissements de santé",
  "Soins de ville",
  "Médico-social",
  "Protection sociale",
  "Santé publique, médecine, recherche",
  "Produits de santé",
  "Questions de société",
  "Pour en savoir plus"
];

// DOM Elements
const candidatesListEl = document.getElementById('candidates-list');
const btnAddCandidate = document.getElementById('btn-add-candidate');
const emptyStateEl = document.getElementById('empty-state');
const editorPanelEl = document.getElementById('editor-panel');
const btnCreateFirst = document.getElementById('btn-create-first');
const btnDeleteCandidate = document.getElementById('btn-delete-candidate');

// File status elements (Removed under Supabase mode)

// Form fields
const inputName = document.getElementById('input-name');
const inputParty = document.getElementById('input-party');
const inputPhoto = document.getElementById('input-photo');
const photoPreview = document.getElementById('photo-preview');
const inputColor = document.getElementById('input-color');
const inputColorHex = document.getElementById('input-color-hex');
const editorCandidateNameTitle = document.getElementById('editor-candidate-name-title');
const editorCandidatePartyTitle = document.getElementById('editor-candidate-party-title');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Paste tab elements
const textareaPaste = document.getElementById('textarea-sheets-paste');
const btnParsePaste = document.getElementById('btn-parse-paste');
const btnClearPaste = document.getElementById('btn-clear-paste');
const pastePreviewSection = document.getElementById('paste-preview-section');
const statColumns = document.getElementById('stat-columns');
const statRows = document.getElementById('stat-rows');
const statTotalItems = document.getElementById('stat-total-items');
const tablePreview = document.getElementById('table-paste-preview');

// Program tab elements
const selectEditCategory = document.getElementById('select-edit-category');
const currentCategoryTitle = document.getElementById('current-category-title');
const proposalsContainer = document.getElementById('proposals-container');
const btnAddProposal = document.getElementById('btn-add-proposal');

// Initialize Lucide Icons helper
function initIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// ----------------------------------------------------
// TSV Parser (Google Sheets Clipboard)
// ----------------------------------------------------
function parseTSV(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuote = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        // Escaped double quote
        currentCell += '"';
        i++; // skip next quote
      } else {
        // Toggle quote state
        insideQuote = !insideQuote;
      }
    } else if (char === '\t' && !insideQuote) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\n' || char === '\r') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip LF of CRLF
      }
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  
  // Push the final cell and row if anything remains
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }
  
  return rows;
}

// Check if first row contains headers
function checkIsHeaderRow(row) {
  if (!row || row.length === 0) return false;
  // If any cell matches a standard category name or part of it, it's probably headers
  return row.some(cell => {
    const clean = cell.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return standardCategories.some(cat => {
      const catClean = cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return clean.includes(catClean) || catClean.includes(clean) && clean.length > 5;
    });
  });
}

// ----------------------------------------------------
// Initialization & LocalStorage loading
// ----------------------------------------------------
async function initApp() {
  setupEventListeners();
  initIcons();
  
  if (supabaseClient) {
    console.log("Authenticating admin via auto-login...");
    
    // Check if session already exists
    let session = null;
    try {
      const sessionRes = await supabaseClient.auth.getSession();
      session = sessionRes.data.session;
    } catch (e) {
      console.warn("Could not retrieve active session, attempting login...", e);
    }
    
    // If no active session, sign in automatically using hardcoded credentials
    if (!session && adminEmail && adminPassword && adminEmail !== 'YOUR_ADMIN_EMAIL' && adminPassword !== 'YOUR_ADMIN_PASSWORD') {
      try {
        const authRes = await supabaseClient.auth.signInWithPassword({
          email: adminEmail,
          password: adminPassword
        });
        if (authRes.error) throw authRes.error;
        session = authRes.data.session;
        console.log("Auto-login successful!");
      } catch (err) {
        console.error("Auto-login failed:", err.message);
        alert("Échec de la connexion automatique : " + err.message);
        return;
      }
    }
    
    if (session || (adminEmail === 'YOUR_ADMIN_EMAIL')) {
      // Load candidates (either authenticated or if credentials are not filled yet so user sees config error alert)
      await fetchDefaultCandidates();
    } else {
      alert("Veuillez renseigner les variables adminEmail et adminPassword au début de admin/app.js pour vous connecter.");
    }
  } else {
    // Fallback if supabase client is not initialized
    alert("Supabase n'est pas configuré. Veuillez renseigner supabaseUrl et supabaseKey au début du fichier admin/app.js.");
  }
}

async function fetchDefaultCandidates() {
  try {
    if (!supabaseClient) {
      console.error("Supabase client is not configured.");
      alert("Supabase n'est pas configuré. Veuillez renseigner supabaseUrl et supabaseKey au début du fichier admin/app.js.");
      return;
    }
    
    console.log("Loading candidates and config from Supabase...");
    const [candidatesRes, configRes] = await Promise.all([
      supabaseClient.from('candidates').select('value').eq('key', 'candidates_data').single(),
      supabaseClient.from('config').select('value').eq('key', 'second_tour_config').single()
    ]);
      
    if (candidatesRes.error) throw candidatesRes.error;
    if (configRes.error) throw configRes.error;
    
    if (candidatesRes.data && Array.isArray(candidatesRes.data.value)) {
      // Filter out any legacy config object embedded in the array
      candidates = candidatesRes.data.value.filter(item => item && item.id !== "config");
    } else {
      candidates = [];
    }
    
    if (configRes.data) {
      config = configRes.data.value;
    } else {
      config = { id: "config", secondTourActive: false, secondTourDate: null };
    }
    
    renderCandidatesList();
    updateSecondTourUI();
    
    if (candidates.length > 0) {
      selectCandidate(candidates[0].id);
    } else {
      selectCandidate(null);
    }
  } catch (e) {
    console.error("Supabase load error", e);
    alert("Erreur de connexion à Supabase : " + e.message);
  }
}

function saveToLocalStorage() {
  renderCandidatesList();
  updateSecondTourUI();
}

function getProposalsCount(c) {
  if (!c.program) return 0;
  let count = 0;
  for (const cat in c.program) {
    if (Array.isArray(c.program[cat])) {
      count += c.program[cat].filter(p => p && p.trim() !== '').length;
    }
  }
  return count;
}

// ----------------------------------------------------
// Rendering Functions
// ----------------------------------------------------
function renderCandidatesList() {
  candidatesListEl.innerHTML = '';
  
  // Sort candidates by proposals count (descending)
  candidates.sort((a, b) => getProposalsCount(b) - getProposalsCount(a));
  
  candidates.forEach(c => {
    const li = document.createElement('li');
    li.className = 'nav-item';
    
    const count = getProposalsCount(c);
    const button = document.createElement('button');
    button.className = `nav-item-btn ${selectedCandidateId === c.id ? 'active' : ''}`;
    button.innerHTML = `
      <span class="candidat-color-dot" style="background-color: ${c.color || '#cccccc'}"></span>
      <span class="candidat-name">${c.name}</span>
      <span class="candidat-proposals-count">${count}</span>
    `;
    
    button.addEventListener('click', () => selectCandidate(c.id));
    li.appendChild(button);
    candidatesListEl.appendChild(li);
  });
}

function updateSecondTourUI() {
  const checkboxSecondTour = document.getElementById('checkbox-second-tour');
  const secondTourInfo = document.getElementById('second-tour-info');
  const secondTourDateEl = document.getElementById('second-tour-date');
  const secondTourExpiryEl = document.getElementById('second-tour-expiry');
  const secondTourListEl = document.getElementById('second-tour-candidates-list');
  
  if (!checkboxSecondTour) return;
  
  checkboxSecondTour.checked = !!config.secondTourActive;
  
  if (config.secondTourActive && config.secondTourDate) {
    secondTourInfo.style.display = 'block';
    const dateObj = new Date(config.secondTourDate);
    secondTourDateEl.textContent = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    const expiryObj = new Date(dateObj.getTime() + 14 * 24 * 60 * 60 * 1000);
    secondTourExpiryEl.textContent = expiryObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } else {
    secondTourInfo.style.display = 'none';
  }
  
  // Update qualified candidates list
  secondTourListEl.innerHTML = '';
  const qualified = candidates.filter(c => c.secondRound);
  if (qualified.length === 0) {
    secondTourListEl.innerHTML = `<li style="color: var(--text-muted); font-style: italic; padding: 0.25rem;">Aucun qualifié</li>`;
  } else {
    qualified.forEach(c => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '0.4rem';
      li.style.padding = '0.25rem 0.15rem';
      li.innerHTML = `
        <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${c.color || '#cccccc'}; flex-shrink: 0; display: inline-block;"></span>
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.name}</span>
      `;
      secondTourListEl.appendChild(li);
    });
  }
}

function selectCandidate(id) {
  selectedCandidateId = id;
  renderCandidatesList();
  
  const candidate = candidates.find(c => c.id === id);
  if (!candidate) {
    emptyStateEl.style.display = 'flex';
    editorPanelEl.style.display = 'none';
    return;
  }
  
  emptyStateEl.style.display = 'none';
  editorPanelEl.style.display = 'flex';
  
  // Update Title Info
  editorCandidateNameTitle.textContent = candidate.name || 'Nouveau Candidat';
  editorCandidatePartyTitle.textContent = candidate.party || 'Sans parti';
  
  // Fill identity form fields
  inputName.value = candidate.name || '';
  inputParty.value = candidate.party || '';
  inputPhoto.value = candidate.photo || '';
  inputColor.value = candidate.color || '#4f46e5';
  inputColorHex.value = candidate.color || '#4f46e5';
  document.getElementById('input-second-round').checked = !!candidate.secondRound;
  
  updatePhotoPreview(candidate.photo);
  
  // Clear Paste Tab
  textareaPaste.value = '';
  pastePreviewSection.style.display = 'none';
  
  // Render program items
  renderCategoryProposals();
}

function updatePhotoPreview(url) {
  if (url) {
    photoPreview.style.backgroundImage = `url('${url}')`;
    photoPreview.style.display = 'block';
  } else {
    photoPreview.style.backgroundImage = 'none';
  }
}

// ----------------------------------------------------
// Category Proposals Editing
// ----------------------------------------------------
function renderCategoryProposals() {
  const candidate = candidates.find(c => c.id === selectedCandidateId);
  if (!candidate) return;
  
  currentCategoryTitle.textContent = currentCategory;
  proposalsContainer.innerHTML = '';
  
  // Create category object if doesn't exist
  if (!candidate.program) candidate.program = {};
  if (!candidate.program[currentCategory]) {
    candidate.program[currentCategory] = [];
  }
  
  const items = candidate.program[currentCategory];
  
  if (items.length === 0) {
    proposalsContainer.innerHTML = `
      <div class="empty-category-placeholder" style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <p>Aucune proposition dans cette catégorie. Cliquez sur "Ajouter une proposition" ou collez un tableau.</p>
      </div>
    `;
    return;
  }
  
  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'proposal-item';
    
    row.innerHTML = `
      <div class="proposal-number">${index + 1}</div>
      <textarea placeholder="Saisir la proposition...">${item}</textarea>
      <button class="btn btn-danger btn-sm btn-delete-proposal" title="Supprimer">
        <i data-lucide="trash-2"></i>
      </button>
    `;
    
    const textarea = row.querySelector('textarea');
    textarea.addEventListener('input', (e) => {
      candidate.program[currentCategory][index] = e.target.value;
      saveToLocalStorage();
    });
    
    row.querySelector('.btn-delete-proposal').addEventListener('click', () => {
      candidate.program[currentCategory].splice(index, 1);
      saveToLocalStorage();
      renderCategoryProposals();
    });
    
    proposalsContainer.appendChild(row);
  });
  
  initIcons();
}

// ----------------------------------------------------
// Event Listeners Setup
// ----------------------------------------------------
function setupEventListeners() {
  // Tabs toggle
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });
  
  // Create Candidate
  const createNewCandidate = () => {
    const name = prompt("Nom du candidat :");
    if (!name || name.trim() === "") return;
    
    const id = name.trim().toLowerCase()
                   .replace(/[^a-z0-9]+/g, '-')
                   .replace(/(^-|-$)/g, '');
                   
    if (candidates.some(c => c.id === id)) {
      alert("Ce candidat existe déjà.");
      return;
    }
    
    const newCand = {
      id: id,
      name: name,
      party: "",
      photo: "",
      color: "#4f46e5",
      program: {}
    };
    
    // Initialize standard categories
    standardCategories.forEach(cat => {
      newCand.program[cat] = [];
    });
    
    candidates.push(newCand);
    saveToLocalStorage();
    renderCandidatesList();
    selectCandidate(id);
  };
  
  btnAddCandidate.addEventListener('click', createNewCandidate);
  btnCreateFirst.addEventListener('click', createNewCandidate);
  
  // Delete Candidate
  btnDeleteCandidate.addEventListener('click', () => {
    if (!selectedCandidateId) return;
    const cand = candidates.find(c => c.id === selectedCandidateId);
    if (confirm(`Êtes-vous sûr de vouloir supprimer ${cand.name} ?`)) {
      candidates = candidates.filter(c => c.id !== selectedCandidateId);
      saveToLocalStorage();
      renderCandidatesList();
      selectedCandidateId = null;
      selectCandidate(null);
    }
  });
  
  // Identity Inputs event listeners
  inputName.addEventListener('input', (e) => {
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (candidate) {
      candidate.name = e.target.value;
      editorCandidateNameTitle.textContent = e.target.value || 'Sans nom';
      saveToLocalStorage();
      renderCandidatesList();
    }
  });
  
  inputParty.addEventListener('input', (e) => {
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (candidate) {
      candidate.party = e.target.value;
      editorCandidatePartyTitle.textContent = e.target.value || 'Sans parti';
      saveToLocalStorage();
    }
  });
  
  inputPhoto.addEventListener('input', (e) => {
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (candidate) {
      candidate.photo = e.target.value;
      updatePhotoPreview(e.target.value);
      saveToLocalStorage();
    }
  });
  
  inputColor.addEventListener('input', (e) => {
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (candidate) {
      candidate.color = e.target.value;
      inputColorHex.value = e.target.value;
      saveToLocalStorage();
      renderCandidatesList();
    }
  });
  
  inputColorHex.addEventListener('input', (e) => {
    const val = e.target.value;
    if (/^#[0-9A-F]{6}$/i.test(val)) {
      const candidate = candidates.find(c => c.id === selectedCandidateId);
      if (candidate) {
        candidate.color = val;
        inputColor.value = val;
        saveToLocalStorage();
        renderCandidatesList();
      }
    }
  });

  // Candidate Second Round Checkbox
  const inputSecondRound = document.getElementById('input-second-round');
  inputSecondRound.addEventListener('change', (e) => {
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (candidate) {
      candidate.secondRound = e.target.checked;
      saveToLocalStorage();
    }
  });
  
  // Category dropdown changer
  selectEditCategory.addEventListener('change', (e) => {
    currentCategory = e.target.value;
    renderCategoryProposals();
  });
  
  // Add Proposal manually
  btnAddProposal.addEventListener('click', () => {
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (candidate) {
      if (!candidate.program[currentCategory]) {
        candidate.program[currentCategory] = [];
      }
      candidate.program[currentCategory].push("");
      saveToLocalStorage();
      renderCategoryProposals();
      
      // Scroll to bottom of proposals
      setTimeout(() => {
        const textareas = proposalsContainer.querySelectorAll('textarea');
        if (textareas.length > 0) {
          textareas[textareas.length - 1].focus();
        }
      }, 50);
    }
  });
  
  // ----------------------------------------------------
  // Paste Area Interaction
  // ----------------------------------------------------
  btnParsePaste.addEventListener('click', () => {
    const text = textareaPaste.value.trim();
    if (!text) {
      alert("Veuillez coller un tableau de données Google Sheets d'abord.");
      return;
    }
    
    const parsedGrid = parseTSV(text);
    if (parsedGrid.length === 0) {
      alert("Impossible d'interpréter les données colées.");
      return;
    }
    
    // Check for headers in the first row
    let startIdx = 0;
    const isHeader = checkIsHeaderRow(parsedGrid[0]);
    if (isHeader) {
      startIdx = 1; // Skip header row
    }
    
    // Determine mapping index. If we have columns, let's map columns to standard categories.
    // Standard size is 9 categories. Let's see how many columns we parsed in the grid
    const numCols = Math.max(...parsedGrid.map(r => r.length));
    
    // Create preview
    renderPastePreview(parsedGrid, isHeader, numCols);
    
    // Merge into current candidate
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (!candidate) return;
    
    // Reset current candidate program categories to merge fresh
    if (!candidate.program) candidate.program = {};
    
    standardCategories.forEach(cat => {
      candidate.program[cat] = [];
    });
    
    let totalItems = 0;
    
    // Process column by column
    for (let col = 0; col < Math.min(numCols, standardCategories.length); col++) {
      const categoryName = standardCategories[col];
      
      // Extract rows for this column
      for (let r = startIdx; r < parsedGrid.length; r++) {
        const row = parsedGrid[r];
        if (row && row[col] && row[col].trim() !== '') {
          candidate.program[categoryName].push(row[col].trim());
          totalItems++;
        }
      }
    }
    
    saveToLocalStorage();
    renderCategoryProposals();
    
    // Show stats
    statColumns.textContent = `${numCols} colonnes identifiées`;
    statRows.textContent = `${parsedGrid.length - startIdx} lignes de données`;
    statTotalItems.textContent = `${totalItems} propositions fusionnées`;
    pastePreviewSection.style.display = 'block';
    
    alert(`Importation réussie : ${totalItems} propositions réparties dans les 9 catégories de santé !`);
  });
  
  btnClearPaste.addEventListener('click', () => {
    textareaPaste.value = '';
    pastePreviewSection.style.display = 'none';
  });
  
  // Supabase Save Action
  const btnSaveSupabase = document.getElementById('btn-save-supabase');
  if (btnSaveSupabase) {
    btnSaveSupabase.addEventListener('click', saveToSupabase);
  }

  // Global Second Tour Mode Checkbox
  const checkboxSecondTour = document.getElementById('checkbox-second-tour');
  checkboxSecondTour.addEventListener('change', (e) => {
    config.secondTourActive = e.target.checked;
    if (config.secondTourActive) {
      config.secondTourDate = new Date().toISOString();
      
      // Validation warning if not exactly 2 candidates are checked
      const qualified = candidates.filter(c => c.secondRound);
      if (qualified.length !== 2) {
        alert("Attention : Le mode Second Tour nécessite d'avoir exactement 2 candidats qualifiés. N'oubliez pas de cocher 2 candidats qualifiés dans l'onglet Identité.");
      }
    } else {
      config.secondTourDate = null;
    }
    saveToLocalStorage();
  });

}

function renderPastePreview(grid, hasHeader, numCols) {
  const thead = tablePreview.querySelector('thead');
  const tbody = tablePreview.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';
  
  // Headers row
  const headerTr = document.createElement('tr');
  for (let col = 0; col < numCols; col++) {
    const th = document.createElement('th');
    // If we have actual headers in index 0, display them, otherwise show standard category mapping
    if (hasHeader && grid[0][col]) {
      th.textContent = grid[0][col];
    } else {
      th.textContent = standardCategories[col] || `Colonne ${col + 1}`;
    }
    headerTr.appendChild(th);
  }
  thead.appendChild(headerTr);
  
  // Data rows (preview first 5 rows)
  const startIdx = hasHeader ? 1 : 0;
  const previewRows = grid.slice(startIdx, startIdx + 5);
  
  previewRows.forEach(row => {
    const tr = document.createElement('tr');
    for (let col = 0; col < numCols; col++) {
      const td = document.createElement('td');
      td.textContent = row[col] || '';
      td.title = row[col] || '';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  
  if (grid.length - startIdx > 5) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.setAttribute('colspan', numCols);
    td.style.textAlign = 'center';
    td.style.color = 'var(--text-muted)';
    td.textContent = `... et ${grid.length - startIdx - 5} autres lignes ...`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

// Load App
window.addEventListener('DOMContentLoaded', initApp);
