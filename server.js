const express = require('express');
const app = express();
const path = require('path');

// Gelen JSON verilerini okuyabilmek için gerekli
app.use(express.json());
// public klasöründeki dosyaları (index.html vb.) dışarıya açar
app.use(express.static(path.join(__dirname, 'public')));

// Veritabanı yerine kullanacağımız geçici diziler (Array'ler)
let users = []; // Kullanıcı bilgileri: { username, password, role }
let books = []; // Kitap bilgileri: { id, title, author, addedBy }

// --- API ROTALARI ---

// 1. Kullanıcı Kayıt Olma (Register)
app.post('/api/register', (req, res) => {
    const { username, password, role } = req.body;
    
    // Kullanıcı adı daha önce alınmış mı kontrol et
    const existingUser = users.find(u => u.username === username);
    if (existingUser) {
        return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    // Yeni kullanıcıyı diziye ekle
    users.push({ username, password, role });
    res.json({ message: 'Kayıt başarılı!' });
});

// 2. Giriş Yapma (Login)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // Kullanıcı adı ve şifre eşleşiyor mu kontrol et
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        // Güvenlik için şifreyi göndermiyoruz
        res.json({ message: 'Giriş başarılı', user: { username: user.username, role: user.role } });
    } else {
        res.status(401).json({ error: 'Hatalı kullanıcı adı veya şifre.' });
    }
});

// 3. Kitapları Listeleme (GET)
app.get('/api/books', (req, res) => {
    const username = req.query.username;
    const role = req.query.role;

    if (role === 'admin') {
        // Admin tüm kitapları görür
        res.json(books);
    } else {
        // Normal kullanıcı sadece kendi eklediği kitapları görür
        const userBooks = books.filter(b => b.addedBy === username);
        res.json(userBooks);
    }
});

// 4. Kitap Ekleme (POST)
app.post('/api/books', (req, res) => {
    const { title, author, addedBy } = req.body;
    
    // Yeni bir kitap objesi oluştur (id olarak şu anki zamanı milisaniye cinsinden kullanıyoruz)
    const newBook = { 
        id: Date.now(), 
        title: title, 
        author: author, 
        addedBy: addedBy 
    };
    
    books.push(newBook);
    res.json({ message: 'Kitap başarıyla eklendi.', book: newBook });
});

// 5. Kitap Silme (DELETE)
app.delete('/api/books/:id', (req, res) => {
    const bookId = parseInt(req.params.id);
    const username = req.body.username;
    const role = req.body.role;
    
    // Önce kitabı bulalım
    const book = books.find(b => b.id === bookId);
    if (!book) {
        return res.status(404).json({ error: 'Kitap bulunamadı.' });
    }

    // Sadece admin ise veya kitabı ekleyen kişi kendi ise silebilir
    if (role === 'admin' || book.addedBy === username) {
        books = books.filter(b => b.id !== bookId);
        res.json({ message: 'Kitap silindi.' });
    } else {
        res.status(403).json({ error: 'Bu kitabı silme yetkiniz yok.' });
    }
});

// Sunucuyu başlat
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`\nSunucu başarıyla başlatıldı!`);
    console.log(`Tarayıcınızda şu adrese gidin: http://localhost:${PORT}\n`);
});
