// Supabase Project Credentials (public)
const supabaseUrl = 'https://vutrblnazmxazjgselks.supabase.co'; // Replace with your real Supabase project URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dHJibG5hem14YXpqZ3NlbGtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDE3MTMsImV4cCI6MjA5Nzg3NzcxM30.BvhswkR0YCNQEl4H-gPVGUW28nkveU9mxU5Oj3YXYVQ'; // Replace with your real Supabase Anon Key

let supabaseClient = null;
if (supabaseUrl && supabaseKey && supabaseUrl !== 'YOUR_SUPABASE_URL' && supabaseKey !== 'YOUR_ANON_KEY') {
  if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
  }
}

// State Management
let candidates = [];
let activeMode = "single"; // "single" or "compare"
let selectedCandidateId = null;
let comparedCandidateIds = [];
let selectedCompareCategory = "Organisation du système de santé";

let config = {
  id: "config",
  secondTourActive: false,
  secondTourDate: null
};
let showArchives = false;

function getVisibleCandidates() {
  if (config.secondTourActive && !showArchives) {
    return candidates.filter(c => c.secondRound);
  }
  return candidates;
}

function checkSecondTourExpiration() {
  if (config.secondTourActive && config.secondTourDate) {
    const dateObj = new Date(config.secondTourDate);
    const now = new Date();
    if (now - dateObj >= 14 * 24 * 60 * 60 * 1000) {
      console.log("Second tour mode has expired automatically after 14 days.");
      config.secondTourActive = false;
    }
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

// Emojis/Icons mapping for categories
const categoryIcons = {
  "Organisation du système de santé": "🏥",
  "Établissements de santé": "🏢",
  "Soins de ville": "🩺",
  "Médico-social": "👵",
  "Protection sociale": "🛡️",
  "Santé publique, médecine, recherche": "🔬",
  "Produits de santé": "💊",
  "Questions de société": "⚖️",
  "Pour en savoir plus": "🔗"
};

// DOM Elements
const btnModeSingle = document.getElementById('btn-mode-single');
const btnModeCompare = document.getElementById('btn-mode-compare');
const candidatesBar = document.getElementById('candidates-bar');
const selectionHeading = document.getElementById('selection-heading');

const singleCandidateView = document.getElementById('single-candidate-view');
const candidateIdentityCard = document.getElementById('candidate-identity-card');
const singleProgramAnchors = document.getElementById('single-program-anchors');
const singleProgramList = document.getElementById('single-program-list');

const compareView = document.getElementById('compare-view');
const compareCategoryTabs = document.getElementById('compare-category-tabs');
const compareGrid = document.getElementById('compare-grid');

// Helper to get initials
function getInitials(name) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------
// Dynamic CSS variable for header height to align sticky elements perfectly
function updateHeaderHeightVar() {
  const headerEl = document.querySelector('.app-header');
  if (headerEl) {
    const isSticky = window.getComputedStyle(headerEl).position === 'sticky';
    const height = isSticky ? headerEl.offsetHeight : 0;
    document.documentElement.style.setProperty('--header-height', height + 'px');
  }
}
window.addEventListener('resize', updateHeaderHeightVar);

async function initApp() {
  await fetchDefaultCandidates();
  setupEventListeners();
  updateHeaderHeightVar();
}

async function fetchDefaultCandidates() {
  try {
    if (!supabaseClient) {
      console.error("Supabase client is not configured. Please set supabaseUrl and supabaseKey in app.js.");
      // Fallback display warning if not configured
      const area = document.getElementById('candidates-bar');
      if (area) {
        area.innerHTML = '<p style="color:red; font-weight:bold; padding: 1rem;">Erreur : Supabase n\'est pas configuré. Veuillez renseigner supabaseUrl et supabaseKey au début du fichier app.js.</p>';
      }
      return;
    }
    
    console.log("Fetching candidates and config from Supabase...");
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
    
    checkSecondTourExpiration();
    setupDashboard();
  } catch (e) {
    console.error("Error fetching candidates from Supabase", e);
    const area = document.getElementById('candidates-bar');
    if (area) {
      area.innerHTML = `<p style="color:red; font-weight:bold; padding: 1rem;">Erreur de connexion à Supabase : ${e.message}. Vérifiez vos tables 'candidates' et 'config' et vos clés API.</p>`;
    }
  }
}

function setupDashboard() {
  // Show / hide Second Tour banner and Archives button
  const bannerEl = document.getElementById('second-tour-banner');
  const archivesBtn = document.getElementById('btn-toggle-archives');
  
  if (config.secondTourActive) {
    if (bannerEl) bannerEl.style.display = 'block';
    if (archivesBtn) {
      archivesBtn.style.display = 'inline-flex';
      updateArchivesButtonUI();
    }
  } else {
    if (bannerEl) bannerEl.style.display = 'none';
    if (archivesBtn) archivesBtn.style.display = 'none';
  }

  // Default selections using visible candidates list
  const visible = getVisibleCandidates();
  if (visible.length > 0) {
    selectedCandidateId = visible[0].id;
    comparedCandidateIds = visible.map(c => c.id);
  } else if (candidates.length > 0) {
    selectedCandidateId = candidates[0].id;
    comparedCandidateIds = candidates.map(c => c.id);
  }
  
  renderCandidatesBar();
  renderContent();
  initIcons();
}

function updateArchivesButtonUI() {
  const archivesBtn = document.getElementById('btn-toggle-archives');
  if (!archivesBtn) return;
  
  const span = archivesBtn.querySelector('span');
  if (showArchives) {
    archivesBtn.classList.add('active');
    if (span) span.textContent = "Masquer les archives (1er tour)";
  } else {
    archivesBtn.classList.remove('active');
    if (span) span.textContent = "Voir les archives (1er tour)";
  }
}

function toggleArchives() {
  showArchives = !showArchives;
  updateArchivesButtonUI();
  
  const visible = getVisibleCandidates();
  if (visible.length > 0) {
    if (!visible.some(c => c.id === selectedCandidateId)) {
      selectedCandidateId = visible[0].id;
    }
    comparedCandidateIds = comparedCandidateIds.filter(id => visible.some(c => c.id === id));
    if (comparedCandidateIds.length === 0) {
      comparedCandidateIds = visible.map(c => c.id);
    }
  }
  
  renderCandidatesBar();
  renderContent();
  updateSelectionHeading();
}

function initIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
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
// Candidate Selector Grid Rendering (No Scroll, Large Circles)
// ----------------------------------------------------
function renderCandidatesBar() {
  candidatesBar.innerHTML = '';
  
  const visible = getVisibleCandidates();
  
  // Sort candidates by proposals count (descending)
  visible.sort((a, b) => getProposalsCount(b) - getProposalsCount(a));
  
  visible.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'candidate-selector-btn';
    btn.style.setProperty('--candidate-color', c.color || '#4f46e5');
    
    // Determine active status based on current mode
    let isActive = false;
    if (activeMode === "single") {
      isActive = (selectedCandidateId === c.id);
    } else {
      isActive = comparedCandidateIds.includes(c.id);
    }
    
    if (isActive) {
      btn.classList.add('active');
    }
    
    // Avatar image or initials fallback
    let avatarHTML = '';
    if (c.photo && c.photo.trim() !== '') {
      avatarHTML = `<img src="${c.photo}" alt="" class="candidate-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`;
      avatarHTML += `<div class="avatar-fallback" style="background-color: ${c.color || '#4f46e5'}; display:none;">${getInitials(c.name)}</div>`;
    } else {
      avatarHTML = `<div class="avatar-fallback" style="background-color: ${c.color || '#4f46e5'};">${getInitials(c.name)}</div>`;
    }
    
    const count = getProposalsCount(c);
    
    // Badge overlay checkbox for compare mode
    const checkBadge = (isActive && activeMode === "compare") 
      ? `<div class="check-badge" style="background-color: ${c.color || '#4f46e5'}"><i data-lucide="check"></i></div>` 
      : '';
      
    btn.innerHTML = `
      <div class="candidate-avatar-container">
        ${avatarHTML}
        ${checkBadge}
      </div>
      <span class="candidate-selector-name">${c.name}</span>
      <span class="candidate-selector-count">${count} prop.</span>
    `;
    
    btn.addEventListener('click', () => {
      handleCandidateClick(c.id);
    });
    
    candidatesBar.appendChild(btn);
  });
  
  initIcons();
}

function handleCandidateClick(id) {
  if (activeMode === "single") {
    selectedCandidateId = id;
    renderCandidatesBar();
    renderContent();
  } else {
    // Toggle candidate in comparison list
    if (comparedCandidateIds.includes(id)) {
      if (comparedCandidateIds.length > 1) {
        comparedCandidateIds = comparedCandidateIds.filter(cid => cid !== id);
      } else {
        alert("Sélectionnez au moins un candidat à comparer.");
        return;
      }
    } else {
      comparedCandidateIds.push(id);
    }
    renderCandidatesBar();
    renderContent();
  }
}

// ----------------------------------------------------
// Main Content Render router
// ----------------------------------------------------
function renderContent() {
  if (activeMode === "single") {
    singleCandidateView.style.display = "block";
    compareView.style.display = "none";
    renderSingleCandidateView();
  } else {
    singleCandidateView.style.display = "none";
    compareView.style.display = "block";
    renderCompareCategoryTabs();
    renderCompareView();
  }
}

// Render Single Candidate full program list
function renderSingleCandidateView() {
  const candidate = candidates.find(c => c.id === selectedCandidateId);
  if (!candidate) {
    candidateIdentityCard.innerHTML = "";
    singleProgramAnchors.innerHTML = "";
    singleProgramList.innerHTML = `<div class="empty-state-card"><i data-lucide="user-x"></i><h4>Aucun candidat sélectionné</h4></div>`;
    initIcons();
    return;
  }
  
  // Identity Card Avatar
  let avatarHTML = '';
  if (candidate.photo && candidate.photo.trim() !== '') {
    avatarHTML = `<img src="${candidate.photo}" alt="${candidate.name}" class="identity-avatar" onerror="this.parentNode.innerHTML='<div class=&quot;avatar-fallback&quot; style=&quot;background-color:${candidate.color};height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;&quot;>${getInitials(candidate.name)}</div>'">`;
  } else {
    avatarHTML = `<div class="avatar-fallback" style="background-color: ${candidate.color || '#4f46e5'}; height: 100%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;">${getInitials(candidate.name)}</div>`;
  }

  // Count categories and build list
  let validCategories = [];
  standardCategories.forEach(cat => {
    const proposals = candidate.program ? candidate.program[cat] : [];
    const validProposals = proposals ? proposals.filter(p => p && p.trim() !== '') : [];
    if (validProposals.length > 0) {
      validCategories.push({ cat, count: validProposals.length });
    }
  });

  // Flat & professional identity layout
  candidateIdentityCard.innerHTML = `
    <div class="identity-header-flat">
      <div class="identity-avatar-container" style="--candidate-color: ${candidate.color || '#4f46e5'}">
        ${avatarHTML}
      </div>
      <div class="identity-details">
        <h2>${candidate.name}</h2>
        <div class="identity-sub-details">
          <span class="party-badge-flat" style="border-left: 3px solid ${candidate.color || '#4f46e5'}">${candidate.party || 'Sans étiquette'}</span>
          <span class="proposals-count-flat"><i data-lucide="award"></i> <strong>${getProposalsCount(candidate)}</strong> propositions santé au total</span>
        </div>
      </div>
    </div>
  `;
  
  // Category plain text quick anchors
  singleProgramAnchors.innerHTML = '';
  validCategories.forEach(({ cat, count }) => {
    const icon = categoryIcons[cat] || "📋";
    const pill = document.createElement('button');
    pill.className = 'anchor-pill';
    pill.style.setProperty('--theme-color', candidate.color || '#4f46e5');
    pill.innerHTML = `
      <span class="pill-icon">${icon}</span>
      <span class="pill-label">${cat}</span>
      <span class="pill-badge">${count}</span>
    `;
    
    pill.addEventListener('click', () => {
      const blockId = `cat-block-${cat.replace(/\s+/g, '-').toLowerCase()}`;
      const blockEl = document.getElementById(blockId);
      if (blockEl) {
        const headerEl = document.querySelector('.app-header');
        const anchorsEl = document.querySelector('.single-program-anchors');
        const isHeaderSticky = window.getComputedStyle(headerEl).position === 'sticky';
        const headerHeight = isHeaderSticky ? headerEl.offsetHeight : 0;
        const anchorsHeight = anchorsEl ? anchorsEl.offsetHeight : 0;
        const headerOffset = headerHeight + anchorsHeight + 15;

        const elementPosition = blockEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
    
    singleProgramAnchors.appendChild(pill);
  });
  
  // Program lists
  singleProgramList.innerHTML = '';
  let hasProposals = false;
  
  standardCategories.forEach(cat => {
    const proposals = candidate.program ? candidate.program[cat] : [];
    const validProposals = proposals ? proposals.filter(p => p && p.trim() !== '') : [];
    
    if (validProposals.length > 0) {
      hasProposals = true;
      const block = document.createElement('div');
      block.className = 'program-category-block';
      const blockId = `cat-block-${cat.replace(/\s+/g, '-').toLowerCase()}`;
      block.id = blockId;
      block.style.setProperty('--theme-color', candidate.color || '#4f46e5');
      
      const bullets = validProposals.map(p => `<li>${p}</li>`).join('');
      const icon = categoryIcons[cat] || "📋";
      
      block.innerHTML = `
        <h4 class="category-block-title">
          <span class="category-block-icon">${icon}</span>
          ${cat}
        </h4>
        <ul class="proposal-bullets" style="--theme-color: ${candidate.color || '#4f46e5'}">
          ${bullets}
        </ul>
      `;
      singleProgramList.appendChild(block);
    }
  });
  
  if (!hasProposals) {
    singleProgramList.innerHTML = `
      <div class="empty-state-card">
        <i data-lucide="heart-pulse"></i>
        <h4>Aucun programme santé enregistré</h4>
        <p>Allez dans l'administration pour ajouter ou copier/coller des propositions pour ce candidat.</p>
      </div>
    `;
  }
  
  initIcons();
}

// Render horizontal category tabs for comparison (Plain underlines)
function renderCompareCategoryTabs() {
  if (!compareCategoryTabs) return;
  compareCategoryTabs.innerHTML = '';
  
  standardCategories.forEach(cat => {
    // Count total proposals for this category across all compared candidates
    let totalCount = 0;
    comparedCandidateIds.forEach(id => {
      const c = candidates.find(cand => cand.id === id);
      if (c && c.program && Array.isArray(c.program[cat])) {
        totalCount += c.program[cat].filter(p => p && p.trim() !== '').length;
      }
    });
    
    const tab = document.createElement('button');
    tab.className = 'compare-category-tab';
    if (cat === selectedCompareCategory) {
      tab.classList.add('active');
    }
    
    const icon = categoryIcons[cat] || "📋";
    tab.innerHTML = `
      <span class="tab-icon">${icon}</span>
      <span class="tab-label">${cat}</span>
      <span class="tab-badge">${totalCount}</span>
    `;
    
    tab.addEventListener('click', () => {
      selectedCompareCategory = cat;
      renderCompareCategoryTabs();
      renderCompareView();
    });
    
    compareCategoryTabs.appendChild(tab);
  });
}

// Render Comparative columns side-by-side
function renderCompareView() {
  compareGrid.innerHTML = '';
  
  if (comparedCandidateIds.length === 0) {
    compareGrid.innerHTML = `
      <div class="empty-state-card" style="grid-column: span 12;">
        <i data-lucide="users"></i>
        <h4>Sélectionnez des candidats</h4>
        <p>Cochez les candidats dans la barre ci-dessus pour comparer leurs propositions.</p>
      </div>
    `;
    initIcons();
    return;
  }
  
  // Adjust grid CSS template based on columns count
  compareGrid.style.gridTemplateColumns = `repeat(${comparedCandidateIds.length}, minmax(290px, 1fr))`;
  
  comparedCandidateIds.forEach(id => {
    const c = candidates.find(cand => cand.id === id);
    if (!c) return;
    
    const col = document.createElement('div');
    col.className = 'compare-column';
    col.style.setProperty('--theme-color', c.color || '#4f46e5');
    
    let avatarHTML = '';
    if (c.photo && c.photo.trim() !== '') {
      avatarHTML = `<img src="${c.photo}" alt="" class="compare-column-avatar" onerror="this.parentNode.innerHTML='<div class=&quot;avatar-fallback&quot; style=&quot;background-color:${c.color};width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:0.85rem;&quot;>${getInitials(c.name)}</div>'">`;
    } else {
      avatarHTML = `<div class="avatar-fallback" style="background-color: ${c.color || '#4f46e5'}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 0.85rem;">${getInitials(c.name)}</div>`;
    }

    const proposals = c.program ? c.program[selectedCompareCategory] : [];
    const validProposals = proposals ? proposals.filter(p => p && p.trim() !== '') : [];
    
    col.innerHTML = `
      <div class="compare-column-header">
        <div class="column-theme-stripe" style="background-color: ${c.color || '#4f46e5'}"></div>
        ${avatarHTML}
        <div class="compare-column-info">
          <h5>${c.name}</h5>
          <p>${c.party || 'Sans étiquette'}</p>
        </div>
        ${comparedCandidateIds.length > 1 ? `
          <button class="remove-compare-btn" title="Retirer de la comparaison">
            <i data-lucide="x"></i>
          </button>
        ` : ''}
      </div>
      <div class="compare-column-body" style="--theme-color: ${c.color || '#4f46e5'}">
        <!-- Filled below -->
      </div>
    `;
    
    // Event listener to remove from comparison directly from header
    const removeBtn = col.querySelector('.remove-compare-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        comparedCandidateIds = comparedCandidateIds.filter(cid => cid !== id);
        renderCandidatesBar();
        renderContent();
      });
    }
    
    const body = col.querySelector('.compare-column-body');
    if (validProposals.length === 0) {
      body.innerHTML = `<div class="compare-empty-column">Aucune proposition sur ce thème.</div>`;
    } else {
      validProposals.forEach(p => {
        const item = document.createElement('div');
        item.className = 'compare-proposal-item';
        item.style.setProperty('--theme-color', c.color || '#4f46e5');
        item.textContent = p;
        body.appendChild(item);
      });
    }
    
    compareGrid.appendChild(col);
  });
  
  initIcons();
}

// ----------------------------------------------------
// Event listeners
// ----------------------------------------------------
function setupEventListeners() {
  // Mode Single Candidate Click
  btnModeSingle.addEventListener('click', () => {
    activeMode = "single";
    btnModeSingle.classList.add('active');
    btnModeCompare.classList.remove('active');
    
    // Ensure one candidate is selected
    if (!selectedCandidateId) {
      const visible = getVisibleCandidates();
      if (visible.length > 0) {
        selectedCandidateId = visible[0].id;
      } else if (candidates.length > 0) {
        selectedCandidateId = candidates[0].id;
      }
    }
    
    renderCandidatesBar();
    renderContent();
    updateSelectionHeading();
    setTimeout(updateHeaderHeightVar, 50); // slight delay to allow layout recalculation
  });
  
  // Mode Compare Candidates Click
  btnModeCompare.addEventListener('click', () => {
    activeMode = "compare";
    btnModeCompare.classList.add('active');
    btnModeSingle.classList.remove('active');
    
    // Ensure compared list is populated
    if (comparedCandidateIds.length === 0) {
      const visible = getVisibleCandidates();
      comparedCandidateIds = visible.map(c => c.id);
    }
    
    renderCandidatesBar();
    renderContent();
    updateSelectionHeading();
    setTimeout(updateHeaderHeightVar, 50); // slight delay to allow layout recalculation
  });
  
  // Initial setup of selection heading
  updateSelectionHeading();
  
  // ScrollSpy for single candidate anchors highlight
  window.addEventListener('scroll', () => {
    if (activeMode !== "single" || !candidates.length) return;
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (!candidate) return;
    
    const headerEl = document.querySelector('.app-header');
    const anchorsEl = document.querySelector('.single-program-anchors');
    if (!headerEl || !anchorsEl) return;

    const isHeaderSticky = window.getComputedStyle(headerEl).position === 'sticky';
    const headerHeight = isHeaderSticky ? headerEl.offsetHeight : 0;
    const anchorsHeight = anchorsEl.offsetHeight;
    const scrollPosition = window.scrollY + headerHeight + anchorsHeight + 30;

    const blocks = document.querySelectorAll('.program-category-block');
    let activeBlockId = null;
    
    blocks.forEach(block => {
      const rect = block.getBoundingClientRect();
      const top = rect.top + window.pageYOffset;
      const height = rect.height;
      if (scrollPosition >= top && scrollPosition < top + height) {
        activeBlockId = block.id;
      }
    });
    
    const pills = document.querySelectorAll('.anchor-pill');
    pills.forEach(pill => {
      const catLabel = pill.querySelector('.pill-label');
      if (catLabel) {
        const catName = catLabel.textContent;
        const blockId = `cat-block-${catName.replace(/\s+/g, '-').toLowerCase()}`;
        if (blockId === activeBlockId) {
          if (!pill.classList.contains('active')) {
            pill.classList.add('active');
            // Auto-scroll the pill into view horizontally inside the anchors container
            pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
        } else {
          pill.classList.remove('active');
        }
      }
    });
  });

  // Archive toggle listener
  const archivesBtn = document.getElementById('btn-toggle-archives');
  if (archivesBtn) {
    archivesBtn.addEventListener('click', () => {
      toggleArchives();
    });
  }
}

function updateSelectionHeading() {
  if (activeMode === "single") {
    selectionHeading.innerHTML = "Sélectionnez un candidat :";
  } else {
    selectionHeading.innerHTML = `
      <div class="compare-heading-row">
        <span>Candidats à comparer :</span>
        <div class="compare-quick-actions">
          <button id="btn-select-all" class="quick-action-btn"><i data-lucide="check-square"></i> Comparer tous</button>
          <button id="btn-deselect-all" class="quick-action-btn"><i data-lucide="square"></i> Effacer la liste</button>
        </div>
      </div>
    `;
    
    const selectAllBtn = document.getElementById('btn-select-all');
    const deselectAllBtn = document.getElementById('btn-deselect-all');
    
    if (selectAllBtn && deselectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        const visible = getVisibleCandidates();
        comparedCandidateIds = visible.map(c => c.id);
        renderCandidatesBar();
        renderContent();
      });
      deselectAllBtn.addEventListener('click', () => {
        const visible = getVisibleCandidates();
        if (visible.length > 0) {
          comparedCandidateIds = [visible[0].id];
        }
        renderCandidatesBar();
        renderContent();
      });
      initIcons();
    }
  }
}

// Load App
window.addEventListener('DOMContentLoaded', initApp);
