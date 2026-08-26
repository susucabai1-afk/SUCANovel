import { supabase, APP_STATE } from './app.js';

// ==============================================
// SISTEM REKOMENDASI SUCA — BERBASIS PERILAKU
// ==============================================

// 1. Dapatkan genre yang paling sering dibaca user
async function getUserFavoriteGenres() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || APP_STATE.readingHistory.length === 0) return [];

  const novelIds = APP_STATE.readingHistory.map(h => h.novel_id);
  const { data: novels } = await supabase
    .from('novels')
    .select('genre')
    .in('id', novelIds);

  const genreCount = {};
  (novels || []).forEach(n => {
    genreCount[n.genre] = (genreCount[n.genre] || 0) + 1;
  });

  return Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .map(g => g[0]);
}

// 2. Rekomendasi Utama — Gabungan Terbaru + Populer + Genre Favorit
async function getRecommendations(limit = 10) {
  const favoriteGenres = await getUserFavoriteGenres();
  let recommendations = [];

  // Ambil novel berdasarkan genre favorit dulu
  if (favoriteGenres.length > 0) {
    const { data: byGenre } = await supabase
      .from('novels')
      .select('*')
      .in('genre', favoriteGenres.slice(0, 3))
      .order('views', { ascending: false })
      .limit(Math.floor(limit / 2));
    recommendations = byGenre || [];
  }

  // Isi sisa dengan novel terbaru & terpopuler
  const existingIds = recommendations.map(n => n.id);
  const { data: others } = await supabase
    .from('novels')
    .select('*')
    .not('id', 'in', `(${existingIds.join(',') || '0'})`)
    .order('created_at', { ascending: false })
    .order('views', { ascending: false })
    .limit(limit - recommendations.length);

  return [...recommendations, ...(others || [])].slice(0, limit);
}

// 3. Top Novel (Paling Ramai Dibaca)
async function getTopNovels(limit = 10) {
  const { data } = await supabase
    .from('novels')
    .select('*')
    .order('views', { ascending: false })
    .order('stars', { ascending: false })
    .limit(limit);
  return data || [];
}

// 4. Novel Terbaru
async function getLatestNovels(limit = 10) {
  const { data } = await supabase
    .from('novels')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// 5. Novel Selesai
async function getCompletedNovels(sortBy = 'views', limit = 20) {
  const validSorts = { views: 'views', stars: 'stars', updated: 'updated_at' };
  const { data } = await supabase
    .from('novels')
    .select('*')
    .eq('status', 'completed')
    .order(validSorts[sortBy] || 'views', { ascending: false })
    .limit(limit);
  return data || [];
}

// Render kartu novel ke halaman
function renderNovelCard(novel) {
  return `
    <div class="novel-card" onclick="openNovel(${novel.id})">
      <img src="${novel.cover_url || 'https://via.placeholder.com/150x200?text=SUCA'}" 
           alt="${novel.title}" loading="lazy">
      <h4>${novel.title}</h4>
      <p class="genre-tag">${novel.genre}</p>
      <div class="card-stats">
        <span>👁 ${novel.views}</span>
        <span>⭐ ${novel.stars || 0}</span>
      </div>
    </div>
  `;
}

// Muat semua bagian rekomendasi di halaman utama
async function loadAllRecommendations() {
  const recs = await getRecommendations(10);
  const top = await getTopNovels(10);
  const latest = await getLatestNovels(10);
  const completed = await getCompletedNovels('views');

  document.querySelector('#recommendation-row').innerHTML = recs.map(renderNovelCard).join('');
  document.querySelector('#top-novels').innerHTML = top.map(renderNovelCard).join('');
  document.querySelector('#latest-novels').innerHTML = latest.map(renderNovelCard).join('');
  document.querySelector('#completed-novels').innerHTML = completed.map(renderNovelCard).join('');
}

export { loadAllRecommendations, getTopNovels, getLatestNovels, getCompletedNovels, renderNovelCard };
           
