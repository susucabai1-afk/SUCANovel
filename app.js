// ==============================================
// SUCA NOVEL — KONEKSI & LOGIKA UTAMA
// ==============================================
const SUPABASE_CONFIG = {
  PROJECT_URL: "https://nxnbjykjqgbyzdvpgbmu.supabase.co",  // Ganti dengan URL milikmu
  API_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bmJqeWtqcWdieXpkdnBnYm11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyOTcxNjUsImV4cCI6MjEwMjg3MzE2NX0.NZ1rvhBfjzGvNpNN_W4ARObbyA7TZyKmT42N2Yioe2c" // Ganti dengan Anon Key
};

// Inisialisasi Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const supabase = createClient(SUPABASE_CONFIG.PROJECT_URL, SUPABASE_CONFIG.API_KEY);

// State Global
const APP_STATE = {
  currentUser: null,
  agreedFine: false,
  agreedTerms: false,
  readingHistory: [],
  notifications: []
};

// ============== Persetujuan Syarat & Denda ==============
// === SIMPEL BANGET — CEKLIS → KLIK → MASUK ===
 const cek1 = document.getElementById('cek1');
 const cek2 = document.getElementById('cek2');
 const masukBtn = document.getElementById('masukBtn');
 const overlay = document.getElementById('termsOverlay');
 // Aktifkan tombol kalau DUA-DUANYA dicentang
 function cekSemua() {
   masukBtn.disabled = !(cek1.checked && cek2.checked);
 }
 cek1.addEventListener('change', cekSemua);
 cek2.addEventListener('change', cekSemua);
 // Klik → langsung sembunyikan syarat, TANPA LOGIN!
 masukBtn.addEventListener('click', () => {
   overlay.style.display = 'none';
   // Simpan di browser supaya besok tidak muncul lagi
   localStorage.setItem('sucaSudahSetuju', 'YA');
 });
 // Kalau sudah pernah setuju → langsung hilangkan
 if (localStorage.getItem('sucaSudahSetuju') === 'YA') {
   overlay.style.display = 'none';
 }

// ============== Notifikasi (Realtime) ==============
async function loadNotifications() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  
  APP_STATE.notifications = data || [];
  updateNotificationBadge();
}

function updateNotificationBadge() {
  const unread = APP_STATE.notifications.filter(n => !n.is_read).length;
  document.querySelectorAll('.notif-badge').forEach(el => {
    el.textContent = unread > 0 ? unread : '';
    el.style.display = unread > 0 ? 'flex' : 'none';
  });
}

// ============== Riwayat Baca ==============
async function saveToHistory(novelId, chapterId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('reading_history').upsert({
    user_id: user.id,
    novel_id: novelId,
    chapter_id: chapterId,
    last_read_at: new Date().toISOString()
  }, { onConflict: 'user_id, novel_id' });

  // Update views novel
  await supabase.rpc('increment_views', { novel_id: novelId });
}

// ============== Logout ==============
async function logout() {
  await supabase.auth.signOut();
  location.reload();
}

// ============== Inisialisasi Saat Buka Halaman ==============
document.addEventListener('DOMContentLoaded', async () => {
  const hasAgreed = await checkUserAgreement();
  if (!hasAgreed && !window.location.pathname.includes('about')) {
    showAgreementModal();
  } else {
    loadMainContent();
    loadNotifications();
  }

  // Event Listener Syarat
  const agreeFine = document.getElementById('agree-fine');
  const agreeTerms = document.getElementById('agree-terms');
  const submitBtn = document.getElementById('submit-agreement');

  if (agreeFine && agreeTerms && submitBtn) {
    const toggleBtn = () => {
      submitBtn.disabled = !(agreeFine.checked && agreeTerms.checked);
      submitBtn.classList.toggle('enabled', agreeFine.checked && agreeTerms.checked);
    };
    agreeFine.addEventListener('change', toggleBtn);
    agreeTerms.addEventListener('change', toggleBtn);
    submitBtn.addEventListener('click', () => saveAgreement(agreeFine.checked, agreeTerms.checked));
  }
});

// Fungsi tampil/sembunyikan modal
function showAgreementModal() {
  document.getElementById('agreement-modal')?.classList.add('active');
}
function hideAgreementModal() {
  document.getElementById('agreement-modal')?.classList.remove('active');
}

// Fungsi isi konten halaman — diisi per halaman
function loadMainContent() {}
export { supabase, APP_STATE, saveAgreement, loadNotifications, saveToHistory, logout };
