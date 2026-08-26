// ==================================================
// KONFIGURASI — GANTI DENGAN DATA SUPABASE KAMU!
// ==================================================
const SUPABASE_URL = 'https://your-project-id.supabase.co';  // ← GANTI!
const SUPABASE_ANON_KEY = 'your-anon-key-here';             // ← GANTI!

// Inisialisasi Supabase
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================================================
// STATE GLOBAL
// ==================================================
let currentUser = { agreed: false, viewedGenres: new Set(), history: [] };
let currentNovel = null;
let currentChapter = 0;
let allNovels = [];
let currentQuiz = null;
let quizTimer = null;
let quizScore = 0;

// ==================================================
// 1. SYARAT & KETENTUAN — HALAMAN PERTAMA
// ==================================================
const check1 = document.getElementById('check1');
const check2 = document.getElementById('check2');
const agreeBtn = document.getElementById('agreeBtn');

function checkAllCheckboxes() {
    agreeBtn.disabled = !(check1.checked && check2.checked);
}
check1.addEventListener('change', checkAllCheckboxes);
check2.addEventListener('change', checkAllCheckboxes);

agreeBtn.addEventListener('click', () => {
    currentUser.agreed = true;
    localStorage.setItem('suca_agreed', 'true');
    document.getElementById('termsOverlay').style.display = 'none';
    document.getElementById('mainHeader').style.display = 'block';
    document.getElementById('mainNav').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'block';
    initApp();
});

// Cek apakah sudah setuju sebelumnya
if (localStorage.getItem('suca_agreed') === 'true') {
    currentUser.agreed = true;
    document.getElementById('termsOverlay').style.display = 'none';
    document.getElementById('mainHeader').style.display = 'block';
    document.getElementById('mainNav').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'block';
    initApp();
}

// ==================================================
// 2. NAVIGASI ANTAR HALAMAN
// ==================================================
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        navigateToPage(page);
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

function navigateToPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    loadPageData(pageId);
}

// Tombol kembali
document.getElementById('backFromReader')?.addEventListener('click', () => navigateToPage('home'));
document.getElementById('backFromSearch')?.addEventListener('click', () => navigateToPage('home'));
document.getElementById('backFromNotif')?.addEventListener('click', () => navigateToPage('home'));
document.getElementById('backFromAdmin')?.addEventListener('click', () => navigateToPage('about'));

// ==================================================
// 3. FUNGSI DATABASE — AMBIL DATA DARI SUPABASE
// ==================================================
async function fetchAllNovels() {
    const { data, error } = await supabase
        .from('novels')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error ambil novel:', error);
        return [];
    }
    allNovels = data;
    return data;
}

async function fetchChapters(novelId) {
    const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('novel_id', novelId)
        .order('chapter_number', { ascending: true });
    
    if (error) return [];
    return data;
}

async function fetchNotifications() {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
    
    if (error) return [];
    return data;
}

async function fetchEvents() {
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true);
    
    if (error) return [];
    return data;
}

// ==================================================
// 4. SISTEM REKOMENDASI — LOGIKA PINTAR!
// ==================================================
// Algoritma: 30% genre yang sering dibaca + 40% populer + 30% baru
function getRecommendations(novels, limit = 10) {
    const userGenres = currentUser.viewedGenres;
    const scored = novels.map(novel => {
        let score = 0;
        // Bobot genre yang sering dibaca
        const novelGenres = novel.genre.split(',').map(g => g.trim());
        const matchCount = novelGenres.filter(g => userGenres.has(g)).length;
        score += matchCount * 30;
        // Bobot popularitas
        score += Math.log1p(novel.total_views || 0) * 15;
        // Bobot kesegaran (baru = lebih tinggi)
        const daysOld = (Date.now() - new Date(novel.created_at).getTime()) / (1000 * 60 * 60 * 24);
        score += Math.max(0, (30 - daysOld / 7)) * 2;
        // Bobot suka
        score += Math.log1p(novel.total_likes || 0) * 10;
        
        return { ...novel, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
}

// ==================================================
// 5. RENDER KARTU NOVEL
// ==================================================
function renderNovelCard(novel) {
    const card = document.createElement('div');
    card.className = 'novel-card';
    card.innerHTML = `
        <img src="${novel.cover_url || 'https://via.placeholder.com/150x200/6366f1/ffffff?text=SUCA'}" 
             alt="${novel.title}" class="novel-cover" loading="lazy">
        <div class="novel-info">
            <h3 class="novel-title">${novel.title}</h3>
            <p class="novel-meta">${novel.author}</p>
            <p class="novel-meta">👁 ${novel.total_views || 0} | ❤ ${novel.total_likes || 0}</p>
        </div>
    `;
    card.addEventListener('click', () => openNovel(novel));
    return card;
}

// ==================================================
// 6. BUKA NOVEL & BACA BAB
// ==================================================
async function openNovel(novel) {
    currentNovel = novel;
    // Catat genre untuk rekomendasi
    novel.genre.split(',').forEach(g => currentUser.viewedGenres.add(g.trim()));
    // Simpan ke riwayat
    saveToHistory(novel);
    
    // Ambil daftar bab
    const chapters = await fetchChapters(novel.id);
    if (chapters.length === 0) {
        alert('Belum ada bab untuk novel ini.');
        return;
    }
    
    // Tambah jumlah dilihat
    await supabase
        .from('novels')
        .update({ total_views: (novel.total_views || 0) + 1 })
        .eq('id', novel.id);
    
    // Buka bab pertama / terakhir dibaca
    currentChapter = 1;
    renderReader(chapters, novel);
    navigateToPage('reader');
}

async function renderReader(chapters, novel) {
    const chap = chapters.find(c => c.chapter_number === currentChapter) || chapters[0];
    document.getElementById('readerNovelTitle').textContent = novel.title;
    document.getElementById('readerChapterTitle').textContent = chap.title;
    document.getElementById('chapterNumber').textContent = `Bab ${chap.chapter_number}`;
    document.getElementById('readerContent').innerHTML = chap.content.replace(/\n/g, '<br>');
    
    // Navigasi bab
    document.getElementById('prevChapter').disabled = currentChapter <= 1;
    document.getElementById('nextChapter').disabled = currentChapter >= chapters.length;
    
    document.getElementById('prevChapter').onclick = () => {
        if (currentChapter > 1) {
            currentChapter--;
            renderReader(chapters, novel);
        }
    };
    document.getElementById('nextChapter').onclick = () => {
        if (currentChapter < chapters.length) {
            currentChapter++;
            renderReader(chapters, novel);
        }
    };
}

// ==================================================
// 7. RIWAYAT BACAAN
// ==================================================
function saveToHistory(novel) {
    let history = JSON.parse(localStorage.getItem('suca_history') || '[]');
    history = history.filter(h => h.id !== novel.id);
    history.unshift({
        id: novel.id,
        title: novel.title,
        author: novel.author,
        cover_url: novel.cover_url,
        lastRead: new Date().toISOString()
    });
    history = history.slice(0, 50); // Simpan 50 terakhir
    localStorage.setItem('suca_history', JSON.stringify(history));
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('suca_history') || '[]');
    const container = document.getElementById('historyList');
    container.innerHTML = '';
    
    if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">Belum ada riwayat bacaan.</p>';
        return;
    }
    
    history.forEach(item => {
        const card = document.createElement('div');
        card.className = 'novel-card';
        card.style.maxWidth = '200px';
        card.innerHTML = `
            <img src="${item.cover_url || 'https://via.placeholder.com/150x200/6366f1/ffffff?text=SUCA'}" 
                 alt="${item.title}" class="novel-cover">
            <div class="novel-info">
                <h3 class="novel-title">${item.title}</h3>
                <p class="novel-meta">${item.author}</p>
            </div>
        `;
        card.addEventListener('click', async () => {
            const { data } = await supabase.from('novels').select('*').eq('id', item.id).single();
            if (data) openNovel(data);
        });
        container.appendChild(card);
    });
}

// ==================================================
// 8. PENCARIAN
// ==================================================
document.getElementById('searchBtn')?.addEventListener('click', performSearch);
document.getElementById('searchInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') performSearch();
});

function performSearch() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!query) return;
    
    document.getElementById('searchQuery').textContent = query;
    const results = allNovels.filter(n => 
        n.title.toLowerCase().includes(query) ||
        n.author.toLowerCase().includes(query) ||
        n.genre.toLowerCase().includes(query) ||
        (n.description && n.description.toLowerCase().includes(query))
    );
    
    const container = document.getElementById('searchResults');
    container.innerHTML = '';
    if (results.length === 0) {
        container.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:2rem;">Tidak ditemukan novel yang sesuai.</p>';
    } else {
        results.forEach(n => container.appendChild(renderNovelCard(n)));
    }
    navigateToPage('search');
}

// ==================================================
// 9. HALAMAN NOVEL — FILTER & SORT
// ==================================================
async function loadNovelsPage() {
    let novels = [...allNovels];
    const genre = document.getElementById('genreFilter').value;
    const sort = document.getElementById('sortFilter').value;
    
    // Filter genre
    if (genre !== 'all') {
        novels = novels.filter(n => n.genre.includes(genre));
    }
    
    // Urutkan
    switch (sort) {
        case 'newest':
            novels.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
        case 'oldest':
            novels.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
        case 'completed':
            novels = novels.filter(n => n.is_completed);
            break;
        case 'views':
            novels.sort((a, b) => (b.total_views || 0) - (a.total_views || 0));
            break;
    }
    
    const container = document.getElementById('allNovelGrid');
    container.innerHTML = '';
    novels.forEach(n => container.appendChild(renderNovelCard(n)));
}

document.getElementById('genreFilter')?.addEventListener('change', loadNovelsPage);
document.getElementById('sortFilter')?.addEventListener('change', loadNovelsPage);

// ==================================================
// 10. HALAMAN BERANDA — MUAT SEMUA BAGIAN
// ==================================================
async function loadHomePage() {
    const novels = allNovels;
    
    // Rekomendasi
    const recs = getRecommendations(novels, 10);
    const recGrid = document.getElementById('recommendationGrid');
    recGrid.innerHTML = '';
    recs.forEach(n => recGrid.appendChild(renderNovelCard(n)));
    
    // Paling Ramai
    const trending = [...novels].sort((a, b) => (b.total_views || 0) - (a.total_views || 0)).slice(0, 10);
    const trendGrid = document.getElementById('trendingGrid');
    trendGrid.innerHTML = '';
    trending.forEach(n => trendGrid.appendChild(renderNovelCard(n)));
    
    // Terbaru
    const newest = [...novels].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
    const newGrid = document.getElementById('newestGrid');
    newGrid.innerHTML = '';
    newest.forEach(n => newGrid.appendChild(renderNovelCard(n)));
    
    // Sudah Tamat
    loadCompletedNovels();
}

function loadCompletedNovels() {
    const sortBy = document.getElementById('completedSort').value;
    let completed = allNovels.filter(n => n.is_completed);
    
    if (sortBy === 'views') {
        completed.sort((a, b) => (b.total_views || 0) - (a.total_views || 0));
    } else if (sortBy === 'likes') {
        completed.sort((a, b) => (b.total_likes || 0) - (a.total_likes || 0));
    } else {
        completed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    
    const container = document.getElementById('completedGrid');
    container.innerHTML = '';
    completed.slice(0, 10).forEach(n => container.appendChild(renderNovelCard(n)));
}

document.getElementById('completedSort')?.addEventListener('change', loadCompletedNovels);

// ==================================================
// 11. EVENT & KUIS
// ==================================================
async function loadEvents() {
    const events = await fetchEvents();
    const container = document.getElementById('eventsList');
    container.innerHTML = '';
    
    events.forEach(event => {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
            <h3>${event.title}</h3>
            <p>${event.content}</p>
            ${event.is_quiz ? `<button class="primary-btn" data-event-id="${event.id}">Mulai Kuis</button>` : ''}
        `;
        container.appendChild(card);
        
        if (event.is_quiz) {
            card.querySelector('[data-event-id]')?.addEventListener('click', () => startQuiz(event));
        }
    });
}

async function startQuiz(event) {
    currentQuiz = { eventId: event.id, questions: [], currentIndex: 0 };
    quizScore = 0;
    
    // Ambil soal kuis
    const { data: questions } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('event_id', event.id)
        .order('order_num', { ascending: true });
    
    if (!questions || questions.length === 0) {
        alert('Belum ada soal untuk kuis ini.');
        return;
    }
    
    currentQuiz.questions = questions;
    document.getElementById('quizContainer').style.display = 'block';
    document.getElementById('quizTitle').textContent = event.title;
    showQuestion();
}

function showQuestion() {
    const q = currentQuiz.questions[currentQuiz.currentIndex];
    document.getElementById('quizQuestion').innerHTML = `<h4>Soal ${currentQuiz.currentIndex + 1}: ${q.question_text}</h4>`;
    
    const optionsDiv = document.getElementById('quizOptions');
    optionsDiv.innerHTML = '';
    const options = q.options;
    Object.entries(options).forEach(([key, text]) => {
        const opt = document.createElement('div');
        opt.className = 'quiz-option';
        opt.textContent = `${key}. ${text}`;
        opt.addEventListener('click', () => selectAnswer(opt, key, q.correct_answer));
        optionsDiv.appendChild(opt);
    });
    
    document.getElementById('nextQuestion').style.display = 'none';
    startTimer(30); // 30 detik per soal — bisa diubah admin
}

function startTimer(seconds) {
    if (quizTimer) clearInterval(quizTimer);
    let timeLeft = seconds;
    document.getElementById('quizTimer').textContent = timeLeft;
        quizTimer = setInterval(() => {
        timeLeft--;
        document.getElementById('quizTimer').textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(quizTimer);
            alert('Waktu habis!');
            lockAnswers();
            document.getElementById('nextQuestion').style.display = 'block';
        }
    }, 1000);
}

function lockAnswers() {
    document.querySelectorAll('.quiz-option').forEach(opt => opt.style.pointerEvents = 'none');
}

function selectAnswer(element, chosen, correct) {
    clearInterval(quizTimer);
    lockAnswers();
    
    if (chosen === correct) {
        element.classList.add('correct');
        quizScore++;
    } else {
        element.classList.add('wrong');
        document.querySelectorAll('.quiz-option').forEach(opt => {
            if (opt.textContent.startsWith(correct + '.')) opt.classList.add('correct');
        });
    }
    
    document.getElementById('nextQuestion').style.display = 'block';
}

document.getElementById('nextQuestion')?.addEventListener('click', () => {
    currentQuiz.currentIndex++;
    if (currentQuiz.currentIndex >= currentQuiz.questions.length) {
        alert(`🎉 Kuis Selesai! Skor: ${quizScore}/${currentQuiz.questions.length}`);
        document.getElementById('quizContainer').style.display = 'none';
        currentQuiz = null;
    } else {
        showQuestion();
    }
});

// ==================================================
// 12. NOTIFIKASI
// ==================================================
document.getElementById('notifBtn')?.addEventListener('click', () => {
    navigateToPage('notifications');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
});

async function loadNotifications() {
    const notifs = await fetchNotifications();
    const container = document.getElementById('notificationsList');
    container.innerHTML = '';
    
    // Update badge
    const unread = notifs.filter(n => !n.is_read).length;
    document.getElementById('notifBadge').textContent = unread;
    
    if (notifs.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">Belum ada notifikasi.</p>';
        return;
    }
    
    notifs.forEach(n => {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.style.opacity = n.is_read ? '0.7' : '1';
        card.innerHTML = `
            <h4>${n.title}</h4>
            <p>${n.content}</p>
            <small>${new Date(n.created_at).toLocaleString('id-ID')}</small>
        `;
        container.appendChild(card);
    });
}

// ==================================================
// 13. UPLOAD ADMIN — Panel Tersembunyi di Halaman About
// ==================================================
document.getElementById('adminUploadLink')?.addEventListener('click', () => {
    const pass = prompt('Masukkan Kode Admin:');
    // ⚠️ GANTI KODE ADMIN DI BAWAH INI!
    if (pass === 'SUCAadmin2026') {
        navigateToPage('admin');
        loadNovelSelectForAdmin();
    } else {
        alert('Kode salah!');
    }
});

// Tab Admin
document.querySelectorAll('.admin-tab').forEach(tab => 
