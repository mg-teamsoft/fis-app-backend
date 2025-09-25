// receiptParsers.ts
import { receiptRegexConfig, ReceiptRegexConfig } from '../configs/receiptConfig';
import { Product, KDVInfo, ReceiptData } from '../types/receiptTypes'; // Arayüzleri ocr_processor'dan import edin
import { fuzzyFind } from '../utils/fuzzySearch';
import config from '../configs/config';

// Referans kelimeler (template1 keywords)
const fuzzyKdvKeywords = [
  'toplam kdv',
  'kdv',
];

// Referans kelimeler (template1 keywords)
const fuzzyTotalKeywords = [
  'genel toplam',
  'toplam tutar',
  'toplam',
];

// TypeScript veri tipleri (arayüzler) buraya taşınabilir, ancak şimdilik ocr_processor.ts'te kalsın

/**
 * Ham OCR metninden işletme adını ayrıştırır.
 */
export function parseBusinessName(lines: string[], config: ReceiptRegexConfig): string | null {
    let businessNameCandidate: string | null = null;
    let potentialBusinessNameBlock: string[] = []; // <<<< BURAYA TAŞINDI VE İLK DEĞERİ VERİLDİ <<<<

    let vknFoundIndex: number = -1;
    let addressFoundIndex: number = -1;
    let indicatorFoundIndexes: number[] = []; // Birden fazla gösterge olabilir

    // İlk tarama: VKN, Adres ve Indicator'ların konumlarını bulma
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.match(config.vknPattern)) {
            vknFoundIndex = i;
        }
        if (config.addressIndicators.some(pattern => pattern.test(line))) {
            addressFoundIndex = i;
        }
        if (config.businessNameIndicators.some(pattern => pattern.test(line))) {
            indicatorFoundIndexes.push(i);
        }
    }

    const endSearchIndex = Math.min(lines.length, 20); // İlk 20 satırı incele

    // En iyi başlangıç satırı indeksi ve ona karşılık gelen güven puanı
    let bestStartLineIndex = -1;
    let maxConfidenceScore = -1;

    // Her bir şirket tipi göstergesinin bulunduğu satırdan geriye doğru tarayarak en uygun başlangıcı bulma
    for (const indicatorIndex of indicatorFoundIndexes) {
        // Göstergenin bulunduğu satır ve önceki birkaç satırı kontrol et
        for (let i = indicatorIndex; i >= Math.max(0, indicatorIndex - 3); i--) { // En fazla 3 satır geriye bak
            const currentLine = lines[i].trim();
            let currentConfidence = 0;

            // Satırın temizlenmiş versiyonu (sadece harfler ve boşluklar, büyük harf)
            const cleanedLineForAnalysis = currentLine.toUpperCase().replace(/[^A-ZÇĞİÖŞÜ\s]/g, ' ').trim();

            // Güven puanı hesaplama:
            // 1. Satırın tamamı büyük harfse
            if (cleanedLineForAnalysis.length > 5 && cleanedLineForAnalysis === currentLine.toUpperCase()) {
                currentConfidence += 3;
            }
            // 2. Satırda indicator varsa (aynı satırda ise daha yüksek puan)
            if (config.businessNameIndicators.some(pattern => pattern.test(currentLine))) {
                currentConfidence += 2;
            }
            // 3. Satır VKN veya adres bilgisine yakınsa (ama kendisi değilse)
            if ((vknFoundIndex !== -1 && i < vknFoundIndex && vknFoundIndex - i < 5) ||
                (addressFoundIndex !== -1 && i < addressFoundIndex && addressFoundIndex - i < 5)) {
                currentConfidence += 1;
            }
            // 4. Satır yeterince uzun ve sadece sayılardan oluşmuyorsa
            if (currentLine.length > 5 && !/^\d+$/.test(currentLine) && !/^\d{1,2}[./\\\s-]\d{1,2}[./\\\s-]\d{2,4}$/.test(currentLine)) {
                currentConfidence += 1;
            }

            // En yüksek güven puanına sahip satırı başlangıç olarak seç
            if (currentConfidence > maxConfidenceScore) {
                maxConfidenceScore = currentConfidence;
                bestStartLineIndex = i;
            }
        }
    }

    // Eğer bir başlangıç indeksi bulduysak, firma adını bu indeksten itibaren birleştirelim
    if (bestStartLineIndex !== -1) {
        // potentialBusinessNameBlock = []; // Bunu artık burada sıfırlamaya gerek yok, çünkü her zaman boş başlıyor
        for (let i = bestStartLineIndex; i < Math.min(lines.length, bestStartLineIndex + 4); i++) { // Maksimum 4 satır birleştir
            const currentLine = lines[i].trim();

            // Durdurma Koşulları:
            // 1. Adres göstergeleri varsa (adres başladı demek)
            // 2. VKN paternine uyuyorsa
            // 3. Çok kısa veya sadece sayıdan oluşan satırlar (genellikle miktarlar, tarihler, saatler)
            // 4. Belirli "gürültülü" desenler (örn. PRMETRE TAMAMLANDI)
            if (config.addressIndicators.some(pattern => pattern.test(currentLine)) ||
                currentLine.match(config.vknPattern) ||
                currentLine.length < 5 || // Çok kısa satırları atla
                /^\d+(\s*:\s*\d+)?$/.test(currentLine) || // Sadece sayı veya saat (örn. "9043", "03:07")
                /^\d{1,2}[./\\\s-]\d{1,2}[./\\\s-]\d{2,4}$/.test(currentLine) || // Sadece tarih
                /^(?:PRMETRE TAMAMLANDI|RAPOR BASLANGICI|FIŞ NO|SATIS FIŞI|BELGE NO|GMU\-\d+|SATIŞ NO|SERİ NO|YIGINNO|TOPLAM)[\s\d:.-]*$/i.test(currentLine)
            ) {
                const isIndicatorLine = config.businessNameIndicators.some(pattern => pattern.test(currentLine));
                const isLikelyNameLine = currentLine.length > 5 && currentLine.toUpperCase() === currentLine;

                if (!isIndicatorLine || !isLikelyNameLine) { // Indicator satırı değilse veya indicator olsa bile isim gibi değilse durdur
                    break;
                }
            }

            let cleanedLine = currentLine.toUpperCase().replace(/[^A-ZÇĞİÖŞÜ\s&.,]/g, ' ').trim();

            if (cleanedLine.length > 3) {
                potentialBusinessNameBlock.push(cleanedLine);
            }
        }
    }

    // Birleştirilmiş bloğu işleme
    if (potentialBusinessNameBlock.length > 0) {
        let mergedName = potentialBusinessNameBlock.join(' ').replace(/\s+/g, ' ').trim();

        // Başlangıç temizliği
        mergedName = mergedName.replace(/^(?:PRMETRE TAMAMLANDI|RAPOR BASLANGICI|FIŞ NO|SATIS FIŞI|BELGE NO|GMU\-\d+|SATIŞ NO|SERİ NO|YIGINNO|TOPLAM)[\s\d:.-]*/i, '').trim();
        // Spesifik başlık temizliği
        mergedName = mergedName.replace(/^(?:FIŞ NO|SATIŞ FİŞİ|BELGE NO|GMU-\d+|SATIŞ NO|SERİ NO|YIĞIN NO|PRMETRE TAMAMLANDI|RAPOR BAŞLANGICI)\s*[:\s\d]*/i, '').trim();

        // Adres bilgilerini sondan temizle
        for (const addrPattern of config.addressIndicators) {
            const addrMatch = mergedName.match(addrPattern);
            if (addrMatch) {
                mergedName = mergedName.substring(0, addrMatch.index || mergedName.length).trim();
            }
        }
        // VKN bilgisini sondan temizle
        const vknMatch = mergedName.match(config.vknPattern);
        if (vknMatch) {
            mergedName = mergedName.substring(0, vknMatch.index || mergedName.length).trim();
        }

        // Şirket tipi göstergelerini sondan temizle
        mergedName = mergedName.replace(/\s*(?:A\.Ş\.|AŞ|LTD\. ŞTİ\.|LTD ŞTİ|LTDSTI|LTD\.STİ|TİC\.|TİC|TİC\.\s*A\.Ş\.|TİC\.\s*LTD\.\s*ŞTİ\.|ŞTİ\.|KOLL\. ŞTİ\.|VE TİC\.|ANONİM|LİMİTED|GIDA|TARIM|SAN|TİCARET|DAĞITIM|HİZMETLERİ|YATIRIM|İTHALAT|İHRACAT)\s*$/i, '').trim();

        // Nihai kontrol
        if (mergedName.length > 5 && !/^\d+$/.test(mergedName) && !/^\d{1,2}[./\\\s-]\d{1,2}[./\\\s-]\d{2,4}$/.test(mergedName)) {
            businessNameCandidate = mergedName;
        }
    }

    // Son çare
    if (!businessNameCandidate) {
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            const line = lines[i].trim();
            if (line.length > 10 && line.toUpperCase() === line &&
                !/^\d+$/.test(line) &&
                !config.addressIndicators.some(p => p.test(line)) &&
                !line.match(config.vknPattern)) {

                if (!businessNameCandidate || line.length > businessNameCandidate.length) {
                    businessNameCandidate = line;
                }
            }
        }
    }

    // Nihai temizlik
    if (businessNameCandidate) {
        businessNameCandidate = businessNameCandidate.replace(/\s+/g, ' ').trim();
        businessNameCandidate = businessNameCandidate.replace(/^(?:PRMETRE TAMAMLANDI|RAPOR BASLANGICI|FIŞ NO|SATIS FIŞI|BELGE NO|GMU\-\d+|SATIŞ NO|SERİ NO|YIGINNO|TOPLAM)[\s\d:.-]*/i, '').trim();
    }

    return businessNameCandidate;
}

/**
 * Ham OCR metninden işlem tarihini ayrıştırır.
 */
export function parseTransactionDate(rawText: string, config: ReceiptRegexConfig): string | null {
    let bestDateMatch: string | null = null;
    let bestDateObject: Date | null = null;

    for (const pattern of config.datePatterns) {
        const matches = rawText.match(pattern);
        if (matches) {
            for (const match of matches) {
                const cleanedMatch = match.replace(/\s/g, '');

                let yearString: string;
                let monthString: string;
                let dayString: string;
                let tempDate: Date;

                const parts = cleanedMatch.split(/[./\\\s-]/);

                if (parts.length === 3) {
                    const part1 = parseInt(parts[0]);
                    const part2 = parseInt(parts[1]);
                    let part3 = parseInt(parts[2]);

                    if (part3 < 100) {
                        const currentYear = new Date().getFullYear();
                        // 2000'li yıllar için varsayım: Eğer 2 basamaklı yıl şu anki yıldan 1 yıl sonrasına kadar ise 2000'ler, aksi halde 1900'ler
                        if (part3 + 2000 > currentYear + 1) { // Örneğin 25 -> 1925 (eğer 2024'te isek ve 25 gelirse 2025 olur, 26 gelirse 1926 olur)
                            yearString = (1900 + part3).toString();
                        } else {
                            yearString = (2000 + part3).toString();
                        }
                    } else {
                        yearString = part3.toString();
                    }

                    // DD/MM/YYYY veya MM/DD/YYYY ayrımı
                    // Türkiye'de DD/MM/YYYY yaygın olduğu için varsayımımız bu yönde.
                    // Yılın konumuna göre de (YYYY.MM.DD) ayrı bir kontrol
                    if (String(part1).length === 4) { // Eğer ilk kısım 4 basamaklıysa YYYY.MM.DD formatıdır
                        yearString = String(part1);
                        monthString = String(part2).padStart(2, '0');
                        dayString = String(part3).padStart(2, '0');
                    } else { // DD.MM.YY(YY) veya MM.DD.YY(YY)
                        // Basit heuristic: Eğer ilk kısım 12'den büyükse (muhtemelen gün) ve ikinci kısım 12'den küçükse (muhtemelen ay)
                        if (part1 > 12 && part2 <= 12) { // DD/MM
                            dayString = String(part1).padStart(2, '0');
                            monthString = String(part2).padStart(2, '0');
                        }
                        // Eğer her ikisi de 12'den küçük/eşitse, DD/MM varsayımı
                        else {
                            dayString = String(part1).padStart(2, '0');
                            monthString = String(part2).padStart(2, '0');
                        }
                    }


                    // Date objesi oluşturma (YYYY-MM-DD formatında)
                    tempDate = new Date(`${yearString}-${monthString}-${dayString}`);

                    const isValidDate = !isNaN(tempDate.getTime()) &&
                        tempDate.getFullYear() === parseInt(yearString) &&
                        (tempDate.getMonth() + 1) === parseInt(monthString) &&
                        tempDate.getDate() === parseInt(dayString);

                    const currentYear = new Date().getFullYear();
                    const lowerBoundYear = currentYear - 2; // Son 2 yıl
                    const upperBoundYear = currentYear + 1; // Gelecek 1 yıl

                    if (isValidDate &&
                        tempDate.getFullYear() >= lowerBoundYear &&
                        tempDate.getFullYear() <= upperBoundYear) {

                        if (!bestDateObject || tempDate > bestDateObject) {
                            bestDateObject = tempDate;
                            // Burası değişti: DD.MM.YYYY formatında döndür
                            bestDateMatch = `${dayString}.${monthString}.${yearString}`;
                        }
                    }
                }
            }
        }
    }

    return bestDateMatch;
}


/**
 * Ham OCR metninden fiş numarasını ayrıştırır.
 */
export function parseReceiptNumber(rawText: string, config: ReceiptRegexConfig): string | null {
    for (const pattern of config.receiptNoPatterns) {
        const match = rawText.match(pattern);
        if (match) {
            if (match.length > 1) {
                return match[match.length - 1].trim();
            } else {
                return match[0].trim();
            }
        }
    }
    return null;
}

/**
 * Ham OCR metninden ürün bilgilerini ayrıştırır.
 */
export function parseProducts(lines: string[], config: ReceiptRegexConfig): Product[] {
    const products: Product[] = [];

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        if (/\d/.test(trimmedLine) && /[a-zA-ZğüşıöçĞÜŞİÖÇ]/.test(trimmedLine)) {
            let match = trimmedLine.match(config.productLinePattern);
            if (match) {
                try {
                    const name = match[1].trim();
                    const quantity = parseInt(match[2]);
                    const unitPrice = parseFloat(match[3].replace(',', '.'));
                    const lineTotal = parseFloat(match[4].replace(',', '.'));
                    products.push({ name, quantity, unitPrice, lineTotal });
                    continue;
                } catch (e) { /* Hata yoksayılır, diğer deseni dene */ }
            }

            match = trimmedLine.match(config.productLinePatternAlt);
            if (match) {
                try {
                    const name = match[1].trim();
                    const quantityOrPrice = match[2];
                    const total = parseFloat(match[3].replace(',', '.'));

                    if (quantityOrPrice.length < 4 && !isNaN(parseInt(quantityOrPrice))) {
                        products.push({
                            name,
                            quantity: parseInt(quantityOrPrice),
                            lineTotal: total
                        });
                    } else {
                        products.push({
                            name: `${name} ${quantityOrPrice}`,
                            lineTotal: total
                        });
                    }
                } catch (e) { /* Hata yoksayılır */ }
            }
        }
    }
    return products;
}

/**
 * Ham OCR metninden KDV oranları ve tutarlarını ayrıştırır.
 */
export function parseKdvAmount(rawText: string, config: ReceiptRegexConfig): number | null {
    for (const pattern of config.kdvPatterns) {
        const match = rawText.match(pattern);
        if (match) {
            try {
                // Yakalanan tutar string'indeki tüm boşlukları kaldır
                let rawAmountString = match[2].replace(/\s/g, '');

                // Tüm virgülleri noktalara çevir (global replace)
                rawAmountString = rawAmountString.replace(/,/g, '.');

                // Eğer "1.253.43" gibi birden fazla nokta varsa, son noktayı ondalık ayraç kabul et
                // ve diğer noktaları kaldır (binlik ayraçlar için).
                // "1.253.43" -> "1253.43"
                // Bu adım çok önemli! Aksi takdirde parseFloat "1.253.43" -> 1.253 olarak görür.
                const parts = rawAmountString.split('.');
                if (parts.length > 2) { // Birden fazla nokta varsa (örn. "1.253.43")
                    const decimalPart = parts.pop(); // Son parçayı ondalık kısım olarak al
                    rawAmountString = parts.join('') + '.' + decimalPart; // Diğer noktaları birleştir
                }

                const parsedAmount = parseFloat(rawAmountString);

                if (!isNaN(parsedAmount)) {
                    // Sayıyı 2 ondalık basamağa yuvarla ve tekrar sayıya çevir
                    return parseFloat(parsedAmount.toFixed(2));
                }
            } catch (e: any) {
                console.warn(`Kdv ayrıştırma hatası: ${match[0]} - ${e.message}`);
            }
        }
    }

    return null;
}

/**
 * Yardımcı fonksiyon: Bir sayı string'ini temizler ve float'a çevirir.
 * "275,00" -> 275.00
 * "1.250,50" -> 1250.50
 * "50" -> 50.00
 */
function cleanAndParseNumber(numStr: string): number | null {
    if (!numStr) return null;

    let cleanedNum = numStr.replace(/\s/g, ''); // Tüm boşlukları kaldır

    // String'in başındaki veya sonundaki sayısal olmayan ve virgül/nokta olmayan karakterleri temizle.
    cleanedNum = cleanedNum.replace(/^[^0-9,.]*/, '').replace(/[^0-9,.]$/, '');

    // Eğer string sadece bir virgül ile bitiyorsa veya virgül tek ayraçsa ve sonunda sayı yoksa,
    // hatalı yakalamaları engellemek için daha fazla kontrol
    if (cleanedNum.endsWith(',') || cleanedNum.endsWith('.')) {
        // Örneğin "275," veya "275." gibi bir durumda ondalık kısmını ekleyebiliriz
        // veya direkt kesebiliriz. Burada kesmeyi tercih edelim ki parse hataları olmasın.
        cleanedNum = cleanedNum.substring(0, cleanedNum.length - 1);
    }

    // Eğer string sadece binlik ayraç içeriyorsa ama ondalık kısım yoksa (örn: "1.250")
    // ve bu bir tam sayıysa, noktaları kaldırıp parse edelim.
    // Eğer son nokta ondalık ayraçsa, o kalsın.
    const lastDotIndex = cleanedNum.lastIndexOf('.');
    const lastCommaIndex = cleanedNum.lastIndexOf(',');

    // Eğer son virgül son noktadan sonraysa veya hiç nokta yoksa, virgülü ondalık ayraç kabul et
    if (lastCommaIndex > lastDotIndex) {
        cleanedNum = cleanedNum.replace(/\./g, '').replace(/,/g, '.'); // Tüm noktaları kaldır, virgülü noktaya çevir
    } else { // Aksi takdirde noktayı ondalık ayraç kabul et (veya hiçbiri yoksa)
        cleanedNum = cleanedNum.replace(/,/g, ''); // Tüm virgülleri kaldır
    }

    const parsedNum = parseFloat(cleanedNum);

    if (!isNaN(parsedNum)) {
        return parseFloat(parsedNum.toFixed(2)); // Her zaman 2 ondalık basamak
    }
    return null;
}


/**
 * Ham OCR metninden genel toplam tutarını ayrıştırır.
 * "TOPLAM — 7% Hy :*275,00" gibi satırlardan "275.00" değerini güvenilir şekilde çıkarır.
 */
export function parseTotalAmount(rawText: string, config: ReceiptRegexConfig): number | null {
    const lines = rawText.split('\n');
    let bestTotalAmount: number | null = null;
    let lastPotentialLineMatch: string | null = null; // En son "TOPLAM" içeren satırı tutmak için

    // Öncelikle "TOPLAM" kelimesi geçen satırları bulmaya çalışalım
    // Bu, "TOPLAM" kelimesinin her zaman tutarın hemen önünde gelmediği durumlar için.
    for (const line of lines) {
        // `totalPatterns` içindeki regex'i sadece kelimeyi ve ardından gelecek herhangi bir şeyi yakalayacak şekilde kullanıyoruz.
        // Asıl sayısal değeri çıkarma işini `cleanAndParseNumber` ve sonraki adımlara bırakıyoruz.
        const generalTotalMatch = line.match(/(TOPLAM|GENEL TOPLAM|ÖDENECEK|KDV DAHİL TOPLAM|TOTAL|SATIS TU|SATIŞ TU).*?([\d\s.,]+)/i);

        if (generalTotalMatch) {
            // Eğer bir eşleşme bulursak, bu satırı işlemeye aday olarak işaretleyelim.
            // Match[2] sadece son sayısal grubunu yakalar. Ancak biz tüm satırdan sayıları alacağız.
            lastPotentialLineMatch = line;
            break; // İlk uygun "TOPLAM" satırını bulduk, daha fazla aramaya gerek yok.
        }
    }

    // Eğer "TOPLAM" içeren bir satır bulursak, o satır üzerinde çalışalım.
    // Aksi takdirde, tüm rawText üzerinde çalışalım (daha riskli).
    const targetText = lastPotentialLineMatch || rawText;

    // Hedef metinden tüm olası sayısal değerleri çıkar.
    // Bu regex, ondalıklı sayıları (virgül veya nokta ile) ve binlik ayraçlı sayıları da yakalar.
    // `(?:...)` non-capturing group'tur.
    // `[0-9]{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?`: Binlik ayraçlı veya ondalıklı sayıları yakalar
    // `\d+`: Sadece tam sayıları yakalar (virgül veya nokta olmadan)
    const allPotentialNumbers = targetText.match(/\b(?:\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+)\b/g);

    if (allPotentialNumbers && allPotentialNumbers.length > 0) {
        let candidates: number[] = [];
        for (const numStr of allPotentialNumbers) {
            const parsedNum = cleanAndParseNumber(numStr);
            if (parsedNum !== null) {
                candidates.push(parsedNum);
            }
        }

        // Aday sayılar arasından en büyüğünü veya belirli bir eşiği aşan en uygun olanı seç
        // Genellikle toplam tutar en büyük olan sayıdır ve 0'dan büyük olmalıdır.
        if (candidates.length > 0) {
            const filteredCandidates = candidates.filter(num => num > 0); // Sadece pozitif sayıları al
            if (filteredCandidates.length > 0) {
                // En büyük sayıyı seç. Bu, 7 ve 275.00 arasında 275.00'ı seçecektir.
                bestTotalAmount = Math.max(...filteredCandidates);
            }
        }
    }

    return bestTotalAmount;
}


/**
 * Ham OCR metninden işlem tipini (kategori) ayrıştırır.
 */
export function parseTransactionType(rawText: string, config: ReceiptRegexConfig): { type: string; kdvRate: number | null } | null {
    for (const pattern of config.transactionTypePatterns) {
        const match = rawText.match(pattern);
        if (match) {
            const type = match[1].toUpperCase(); // Yakalanan kelimeyi büyük harfe çevir (örn. "YİYECEK")
            let kdvRate: number | null = null;

            if (match[2]) { // KDV oranı olarak yakalanan sayı (örn. "710", "10", "8")
                const rawRateStr = match[2];
                let parsedRate: number | null = null;

                if (rawRateStr.length === 3) {
                    // Eğer 3 basamaklı ise, son iki basamağını al (örn. "710" -> "10")
                    const potentialRate = parseInt(rawRateStr.slice(-2));
                    if (!isNaN(potentialRate)) {
                        parsedRate = potentialRate;
                    }
                } else if (rawRateStr.length <= 2) {
                    // Eğer 1 veya 2 basamaklı ise, direkt o sayıyı al (örn. "10" -> "10")
                    const potentialRate = parseInt(rawRateStr);
                    if (!isNaN(potentialRate)) {
                        parsedRate = potentialRate;
                    }
                }

                // KDV oranının makul bir aralıkta olup olmadığını kontrol edebiliriz (örn. 0-100)
                if (parsedRate !== null && parsedRate >= 0 && parsedRate <= 100) {
                    kdvRate = parsedRate;
                }
            }

            // İlk bulunan fiş tipini kaydedelim, eğer birden fazla varsa ilki öncelikli olsun
            return { type: type, kdvRate: kdvRate };
        }
    }
    return null;
}


/**
 * Ham OCR metninden ödeme tipini ayrıştırır.
 */
export function parsePaymentType(rawText: string, config: ReceiptRegexConfig): number | null {
    for (const pattern of config.paymentTypePatterns) {
        const match = rawText.match(pattern);
        if (match) {
            const matchedKeyword = match[1].toUpperCase(); // Yakalanan anahtar kelime

            if (matchedKeyword.includes("KART") || matchedKeyword.includes("CREDIT") || matchedKeyword.includes("VISA") || matchedKeyword.includes("MASTER") || matchedKeyword.includes("POS")) {
                return 1;  // KREDİ KARTI
            } else if (matchedKeyword.includes("NAKİT") || matchedKeyword.includes("PEŞİN") || matchedKeyword.includes("CASH")) {
                return 2; // NAKİT
            }
        }
    }
    return null; // Hiçbir ödeme tipi bulunamadıysa
}

/**
 * match kontrolü için text ve regexpi çarpıştırır.
 */
export function isMatching(rawText: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(rawText));
}

/**
 * normalize space betwen digits of an amount
 */
export function normalizeAmounts(line: string): string {
    let result = line;

    // Adım 1: Sayılar arasında boşluk varsa kaldır (örneğin "1. 253, 43" gibi)
    result = result.replace(/(\d)\s+[\.,]?\s*(\d{3})\s*[,\.]?\s*(\d{2})/g, '$1.$2,$3');

    // Adım 2: 3 haneli olmayan sayılar için ("12 , 50" gibi)
    result = result.replace(/(\d+)\s*,\s*(\d{2})/g, '$1,$2');

    // Adım 3: 3 haneli tam sayı varsa ve arada boşluk varsa ("3 . 400")
    result = result.replace(/(\d+)\s*\.\s*(\d{3})/g, '$1.$2');

    // Fazla boşlukları temizle
    return result.replace(/\s{2,}/g, ' ').trim();
}

export function extractAmountsFromLines(lines: string[]) {
    let kdvRate: number | null = null;
    const amountStrings: string[] = [];

    const amountRegex = /^[*]?[0-9]{1,3}(\.[0-9]{3})*,[0-9]{2}$/;

    for (const line of lines) {
        // Extract KDV rate
        const rateMatch = line.match(/%[\s]?(\d{1,2})/);
        if (rateMatch && !kdvRate) {
            kdvRate = parseInt(rateMatch[1], 10);
        }

        // Clean and check if line matches amount pattern
        const cleaned = line.replace(/[^\d,\.]/g, '').trim();

        if (amountRegex.test(cleaned)) {
            amountStrings.push(cleaned);
        }
    }

    // Deduplicate and sort amounts as numbers (descending)
    const sorted = [...new Set(amountStrings)].sort((a, b) => {
        const numA = parseFloat(a.replace(/\./g, '').replace(',', '.'));
        const numB = parseFloat(b.replace(/\./g, '').replace(',', '.'));
        return numB - numA;
    });

    const totalAmount = sorted[0] ?? null;
    const kdvAmount = sorted.length > 1 ? sorted[sorted.length - 1] : null;
    
    console.log('kdvRate:', kdvRate, ' totalAmount: ', totalAmount, ' kdvAmount:', kdvAmount)
    return {
        kdvRate,
        totalAmount, // string, e.g. "2.129,00"
        kdvAmount    // string, e.g. "193,55"
    };
}

export function parseReceiptLines(rawText: string): ReceiptData {
  var extractedData: ReceiptData = {
    businessName: null,
    transactionDate: null,
    receiptNumber: null,
    products: [],
    kdvAmount: null,
    totalAmount: null,
    transactionType: null,
    paymentType: null
  };

  const lines = rawText.split('\n').map((l: string) => l.trim()).filter(Boolean);

  for (const line of lines) {
    console.log('line: ', line);
    const lowerLine = line.toLocaleLowerCase();

    // Firma Adı
    if (extractedData.businessName == null && isMatching(lowerLine, receiptRegexConfig.businessNameIndicators)) {
      extractedData.businessName = parseBusinessName(lines, receiptRegexConfig);
    }

    // Tarih
    if (extractedData.transactionDate == null && isMatching(line, receiptRegexConfig.datePatterns)) {
      extractedData.transactionDate = parseTransactionDate(line, receiptRegexConfig);
    }

    // Fiş No
    if (extractedData.receiptNumber == null && isMatching(line, receiptRegexConfig.receiptNoPatterns)) {
      extractedData.receiptNumber = parseReceiptNumber(line, receiptRegexConfig);
    }

    // Kdv Tutarı
    // if (extractedData.kdvAmount == null && isMatching(line, receiptRegexConfig.kdvPatterns)) {
    if (!extractedData.kdvAmount && fuzzyFind(lowerLine, fuzzyKdvKeywords, config.fuzzyThreshold)) {
      const normalized = normalizeAmounts(line);
      extractedData.kdvAmount = parseKdvAmount(normalized, receiptRegexConfig);
    }

    // Toplam Tutar
    // if (extractedData.totalAmount == null && isMatching(line, receiptRegexConfig.totalPatterns)) {
    if (!extractedData.totalAmount && fuzzyFind(lowerLine, fuzzyTotalKeywords, config.fuzzyThreshold)) {
      const normalized = normalizeAmounts(line);
      console.log('normalized: ', normalized);
      extractedData.totalAmount = parseTotalAmount(normalized, receiptRegexConfig);
    }

    // İşlem Türü
    if (extractedData.transactionType == null && isMatching(line, receiptRegexConfig.transactionTypePatterns)) {
      extractedData.transactionType = parseTransactionType(line, receiptRegexConfig);
    }

    // Ödeme Şekli
    if (extractedData.paymentType == null && isMatching(line, receiptRegexConfig.paymentTypePatterns)) {
      extractedData.paymentType = parsePaymentType(line, receiptRegexConfig);
    }
  }

  console.log(extractedData);
  return extractedData;
}