# 🌍 RoWorld Web Edition

Roblox'taki **RoWorld (RoFront)** mekaniklerinden esinlenilmiş, gerçek zamanlı taktiksel dünya savaşı ve bölge fethetme oyunu.

Hem **okulda sıfır internetle (Yerel Ağ / Hotspot)** hem de **GitHub üzerinden Render veya Vercel'e yükleyerek küresel internette** oynanabilir!

---

## 🚀 1. Render.com Kurulumu (ÖNERİLEN - Hem Oyun Hem Canlı Sunucu)

Render, arka planda sürekli çalışan gerçek zamanlı WebSocket bağlantılarını ücretsiz destekler. Tüm oyunu ve lobi sunucusunu tek tıkla barındırır.

1. Bu projeyi GitHub hesabına yükle:
   ```bash
   git add .
   git commit -m "RoWorld Web yayına hazır"
   git push origin main
   ```
2. [Render.com](https://render.com) adresine git ve giriş yap.
3. **"New +"** -> **"Web Service"** seç.
4. GitHub repoyu bağla.
5. Ayarları şu şekilde yap:
   - **Name:** `roworld-game` (veya istediğin bir isim)
   - **Language / Environment:** `Node`
   - **Build Command:** *(Boş bırak)*
   - **Start Command:** `node server.js`
   - **Plan:** `Free`
6. **"Deploy Web Service"** butonuna bas!
7. 1-2 dakika içinde sana `https://roworld-game.onrender.com` gibi ücretsiz bir HTTPS/WSS linki verecek. Arkadaşlarınla o linke girip anında online savaşabilirsiniz!

*(Not: Proje içerisine hazır `render.yaml` blueprint dosyası eklenmiştir.)*

---

## ⚡ 2. Vercel Kurulumu (Statik Arayüz)

Vercel bir **Serverless** platformudur. Sürekli açık kalan WebSocket sunucularını kapatır ancak ön yüzü dünyanın en hızlı CDN ağında yayınlar.

1. [Vercel.com](https://vercel.com) adresine git ve GitHub reponu içeri aktar (**Import Project**).
2. Framework Preset: **Other**
3. Root Directory: `./`
4. **Deploy** butonuna bas.
5. Vercel linkine (`https://senin-projen.vercel.app`) girdiğinde:
   - İstersen **"TAMAMEN ÇEVRİMDIŞI / BOT SAVAŞI"** ile tek kişilik oynayabilirsin.
   - İstersen Render'da açtığın sunucunun adresini bağlayarak arkadaşlarınla online oynayabilirsin (`?server=roworld-game.onrender.com`).

---

## 🏫 3. Okulda / Tamamen İnternetsiz Oynama

1. Bir kişi telefonundan **Hotspot (Erişim Noktası)** açar *(Mobil veriyi açmanıza gerek yoktur!)*.
2. Arkadaşlarınız bu Wi-Fi'ye bağlanır.
3. Bilgisayarda **`baslat.bat`** çalıştırılır.
4. Ekranda çıkan **Karekod (QR Kod)** telefonla okutulur veya ekranda yazan yerel IP adresine (Örn: `http://192.168.43.1:3000`) girilir.
5. Sıfır internetle sınırsız dünya savaşı!
