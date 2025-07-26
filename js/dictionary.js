// dictionary.js - Dream Dictionary with Bengali Auto-Translation

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyA1lwtZCEJHMBqUBz1Ql-nDHcZqp8Uof2c",
  authDomain: "dream-dictionary-d45de.firebaseapp.com",
  databaseURL: "https://dream-dictionary-d45de-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "dream-dictionary-d45de",
  storageBucket: "dream-dictionary-d45de.firebasestorage.app",
  messagingSenderId: "652225672828",
  appId: "1:652225672828:web:5048fd6ea8e1d2b4d73bf9",
  measurementId: "G-JNWZFQMCQG"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// DOM Elements
const elements = {
    wordForm: document.getElementById('wordForm'),
    wordsContainer: document.getElementById('wordsContainer'),
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    sortBtn: document.getElementById('sortBtn'),
    floatingAddBtn: document.getElementById('floatingAddBtn'),
    addWordModal: document.getElementById('addWordModal'),
    closeModal: document.querySelector('.close-modal'),
    toast: document.getElementById('toast'),
    themeToggle: document.querySelector('.theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    wordInput: document.getElementById('word'),
    meaningInput: document.getElementById('meaning'),
    noteInput: document.getElementById('note')
};

// App State
const state = {
    words: [],
    currentSort: 'newest',
    currentSearch: '',
    isNightMode: localStorage.getItem('nightMode') === 'true',
    isTranslating: false
};

// Translation Cache
const translationCache = JSON.parse(localStorage.getItem('translationCache')) || {};

// Initialize the Application
function init() {
    if (!elements.wordForm || !elements.wordsContainer) {
        console.error('Critical DOM elements missing');
        return;
    }

    setupEventListeners();
    loadWords();
    applyTheme();
    updateSortButtonUI();
}

// Event Listeners Setup
function setupEventListeners() {
    elements.wordForm?.addEventListener('submit', handleFormSubmit);
    elements.floatingAddBtn?.addEventListener('click', () => toggleModal(true));
    elements.closeModal?.addEventListener('click', () => toggleModal(false));
    window.addEventListener('click', (e) => {
        if (e.target === elements.addWordModal) toggleModal(false);
    });
    elements.searchBtn?.addEventListener('click', handleSearch);
    elements.searchInput?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    elements.sortBtn?.addEventListener('click', toggleSortOrder);
    elements.themeToggle?.addEventListener('click', toggleTheme);
    
    // Auto-translation with debounce
    let debounceTimer;
    elements.wordInput?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(handleWordAutoFill, 800);
    });
}

// Google Translate Function
async function googleTranslate(text, targetLang = 'bn') {
    if (!text) return null;
    
    try {
        const response = await fetch(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
        );
        
        if (!response.ok) throw new Error('Translation failed');
        
        const data = await response.json();
        return data[0][0][0];
    } catch (error) {
        console.error('Google Translate error:', error);
        return null;
    }
}

// Auto-fill Handler (Meaning only)
async function handleWordAutoFill() {
    const word = elements.wordInput.value.trim().toLowerCase();
    if (!word || word.length < 3) return;
    if (state.isTranslating) return;
    if (elements.meaningInput.value) return; // Don't overwrite existing meaning

    state.isTranslating = true;
    showToast('Translating to Bengali...');

    try {
        const meaning = await googleTranslate(word);
        if (meaning) {
            elements.meaningInput.value = `${word} - ${meaning}`;
        }
    } catch (error) {
        console.error('Translation failed:', error);
        showToast('Translation service unavailable');
    } finally {
        state.isTranslating = false;
    }
}

// Firebase Operations
function loadWords() {
    const wordsRef = db.ref('words');
    
    wordsRef.on('value', (snapshot) => {
        state.words = [];
        snapshot.forEach((childSnapshot) => {
            state.words.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });
        applySortAndFilter();
    }, (error) => {
        console.error('Error loading words:', error);
        showToast('Error loading words. Please refresh the page.');
    });
}

function addWord(wordData) {
    return db.ref('words/' + wordData.id).set(wordData);
}

function deleteWord(wordId) {
    return db.ref('words/' + wordId).remove();
}

// Form Handling
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (state.isTranslating) {
        showToast('Please wait for translation to complete');
        return;
    }
    
    const formData = new FormData(elements.wordForm);
    const wordData = {
        addedBy: (formData.get('addedBy') || '').trim(),
        word: (formData.get('word') || '').trim().toLowerCase(),
        meaning: (formData.get('meaning') || '').trim(),
        note: (formData.get('note') || '').trim() || null,
        wordDay: formData.get('wordDay') || null,
        createdAt: new Date().toISOString()
    };
    
    // Validation
    if (!wordData.addedBy || !wordData.word || !wordData.meaning) {
        showToast('Please fill in all required fields');
        return;
    }
    
    try {
        wordData.id = Date.now().toString();
        await addWord(wordData);
        elements.wordForm.reset();
        toggleModal(false);
        showToast('✨ Word added successfully!');
    } catch (error) {
        console.error('Error adding word:', error);
        showToast('Error adding word. Please try again.');
    }
}

function handleDelete(wordId) {
    if (confirm('Are you sure you want to delete this word?')) {
        deleteWord(wordId)
            .then(() => showToast('Word deleted'))
            .catch((error) => {
                console.error('Error deleting word:', error);
                showToast('Error deleting word');
            });
    }
}

// Search & Sort Functionality
function handleSearch() {
    state.currentSearch = (elements.searchInput?.value || '').trim().toLowerCase();
    applySortAndFilter();
}

function toggleSortOrder() {
    state.currentSort = state.currentSort === 'newest' ? 'oldest' : 'newest';
    updateSortButtonUI();
    applySortAndFilter();
}

function updateSortButtonUI() {
    if (!elements.sortBtn) return;
    elements.sortBtn.innerHTML = state.currentSort === 'newest' 
        ? '<i class="fas fa-sort-amount-down"></i><span>Newest</span>'
        : '<i class="fas fa-sort-amount-up"></i><span>Oldest</span>';
}

function applySortAndFilter() {
    let filteredWords = [...state.words];
    
    // Apply search filter
    if (state.currentSearch) {
        filteredWords = state.words.filter(word => 
            word.word.includes(state.currentSearch) ||
            (word.meaning && word.meaning.toLowerCase().includes(state.currentSearch)) ||
            (word.addedBy && word.addedBy.toLowerCase().includes(state.currentSearch)) ||
            (word.note && word.note.toLowerCase().includes(state.currentSearch))
        );
    }
    
    // Apply sort
    filteredWords.sort((a, b) => {
        return state.currentSort === 'newest' 
            ? new Date(b.createdAt) - new Date(a.createdAt)
            : new Date(a.createdAt) - new Date(b.createdAt);
    });
    
    renderWords(filteredWords);
}

// Rendering Functions
function renderWords(words) {
    if (!elements.wordsContainer) return;
    
    if (words.length === 0) {
        elements.wordsContainer.innerHTML = `
            <div class="dream-card placeholder-card">
                <i class="fas fa-book-open"></i>
                <h3>${state.currentSearch ? 'No matching words' : 'Your dictionary is empty'}</h3>
                <p>${state.currentSearch ? 'Try a different search' : 'Add your first word'}</p>
            </div>
        `;
        return;
    }
    
    elements.wordsContainer.innerHTML = '';
    
    words.forEach((word, index) => {
        const wordCard = createWordCard(word, index);
        if (wordCard) {
            elements.wordsContainer.appendChild(wordCard);
        }
    });
}

function createWordCard(word, index) {
    if (!word?.id) return null;
    
    const card = document.createElement('div');
    card.className = 'dream-card';
    card.dataset.delay = `${index * 0.05}s`;
    card.style.setProperty('--delay', `${index * 0.05}s`);
    
    const creationDate = word.createdAt ? new Date(word.createdAt) : new Date();
    const wordDayInfo = generateWordDayInfo(word.wordDay);
    
    card.innerHTML = `
        <button class="delete-btn" data-id="${word.id}">
            <i class="fas fa-times"></i>
        </button>
        <h3>${capitalizeFirstLetter(word.word || 'Untitled')}</h3>
        <p class="dream-author">By ${word.addedBy || 'Anonymous'}</p>
        <p class="dream-description">${word.meaning || 'No description available'}</p>
        ${word.note ? `<div class="word-note">${word.note}</div>` : ''}
        <div class="dream-meta">
            <p class="dream-date"><i class="far fa-calendar-alt"></i> Added ${creationDate.toLocaleDateString()}</p>
            ${wordDayInfo}
        </div>
    `;
    
    // Add delete event listener
    const deleteBtn = card.querySelector('.delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDelete(word.id));
    }
    
    return card;
}

function generateWordDayInfo(wordDay) {
    if (!wordDay) return '';
    
    try {
        const today = new Date();
        const wordDayDate = new Date(wordDay);
        const timeDiff = wordDayDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
        
        if (daysRemaining > 0) {
            return `<p class="dream-date"><i class="far fa-calendar-star"></i> Word Day in ${daysRemaining} days</p>`;
        } else if (daysRemaining === 0) {
            return `<p class="dream-date highlight"><i class="fas fa-calendar-star"></i> Today is Word Day!</p>`;
        } else {
            return `<p class="dream-date"><i class="far fa-calendar-star"></i> Word Day passed ${Math.abs(daysRemaining)} days ago</p>`;
        }
    } catch (e) {
        console.error('Error generating word day info:', e);
        return '';
    }
}

// UI Helpers
function toggleModal(show) {
    if (!elements.addWordModal) return;
    elements.addWordModal.style.display = show ? 'flex' : 'none';
    if (show && elements.wordForm?.addedBy) elements.wordForm.addedBy.focus();
}

function showToast(message) {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

function toggleTheme() {
    state.isNightMode = !state.isNightMode;
    applyTheme();
    localStorage.setItem('nightMode', state.isNightMode);
}

function applyTheme() {
    document.body.classList.toggle('night-mode', state.isNightMode);
    if (elements.themeIcon) {
        elements.themeIcon.className = state.isNightMode ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// Utility Functions
function capitalizeFirstLetter(string) {
    return string ? string.charAt(0).toUpperCase() + string.slice(1) : '';
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
