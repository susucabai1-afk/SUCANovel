import { supabase } from './app.js';

async function searchNovels(query, filter = {}) {
  let q = supabase.from('novels').select('*');
  
  if (query.trim()) {
    q = q.or(`title.ilike.%${query}%, author.ilike.%${query}%, genre.ilike.%${query}%`);
  }
  if (filter.genre) q = q.eq('genre', filter.genre);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.sortBy === 'latest') q = q.order('created_at', { ascending: false });
  else if (filter.sortBy === 'popular') q = q.order('views', { ascending: false });
  else q = q.order('title', { ascending: true });

  const { data } = await q.limit(50);
  return data || [];
}

// Pencarian realtime saat mengetik
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  const resultContainer = document.getElementById('search-results');

  if (!searchInput || !resultContainer) return;

  let timer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const results = await searchNovels(e.target.value);
      resultContainer.innerHTML = results.length 
        ? results.map(n => `
            <div class="search-result-item" onclick="openNovel(${n.id})">
              <strong>${n.title}</strong> — ${n.author}
              <span class="genre">${n.genre}</span>
            </div>
          `).join('')
        : '<p class="no-result">Novel tidak ditemukan</p>';
    }, 300);
  });
});

export { searchNovels };
