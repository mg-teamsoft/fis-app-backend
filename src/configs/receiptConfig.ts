// receiptConfig.ts
export interface ReceiptRegexConfig {
    businessNameCleanUp: RegExp;
    datePatterns: RegExp[];
    receiptNoPatterns: RegExp[];
    productLinePattern: RegExp;
    productLinePatternAlt: RegExp;
    kdvPatterns: RegExp[];
    totalPatterns: RegExp[];
    transactionTypePatterns: RegExp[];
    // Diğer konfigürasyonlar (örneğin, güven eşikleri, min/max uzunluklar vb.) eklenebilir.
    businessNameIndicators: RegExp[];
    businessNameStartPattern: RegExp;
    // Adres bilgilerini belirten desenler
    addressIndicators: RegExp[];
    // VKN bilgisini belirten desen
    vknPattern: RegExp;
    paymentTypePatterns: RegExp[];
}

// Regex'leri ve diğer sabitleri burada tanımlayın
export const receiptRegexConfig: ReceiptRegexConfig = {
    // İşletme adı başlangıcındaki istenmeyen karakterleri temizleme regex'i
    // Başında 1-3 karakter uzunluğunda küçük harfler, özel semboller içeren ve 
    // ardından boşluk veya büyük harfle başlayan bir kısmı yakalar.
    businessNameCleanUp: /^\s*([a-z\?\!\*\/\-\+\>\<\(\)\_@#\$%\^&]{1,3}\s*)?(?=[A-ZİÜÖÇŞĞ]|\d)/,

    // İşlem tarihi desenleri
    datePatterns: [
        // DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY, DD\MM\YYYY, DD MM YYYY
        // D.M.YYYY, D-M-YYYY, D/M/YYYY, D\M\YYYY, D M YYYY
        /\b\d{1,2}[./\\\s-]\d{1,2}[./\\\s-]\d{4}\b/,

        // YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD, YYYY\MM\DD, YYYY MM DD
        /\b\d{4}[./\\\s-]\d{1,2}[./\\\s-]\d{1,2}\b/,

        // DD.MM.YY, DD-MM-YY, DD/MM/YY, DD\MM\YY, DD MM YY
        /\b\d{1,2}[./\\\s-]\d{1,2}[./\\\s-]\d{2}\b/,

        // YY.MM.DD, YY-MM-DD, YY/MM/DD, YY\MM\DD, YY MM DD (Daha az yaygın ama ihtimal dahilinde)
        /\b\d{2}[./\\\s-]\d{1,2}[./\\\s-]\d{1,2}\b/,
    ],

    // Fiş No desenleri
    receiptNoPatterns: [
        /(Fiş No|FİŞ NO|Belge No|SERİ NO|BNO|MAKBUZ NO)[:\s]*([\w\d]+)/i,
        /(^\d{6,})/m
    ],

    // Ürün satırı desenleri (miktar x birim fiyat)
    productLinePattern: /(.+?)\s+(\d+)\s+x\s+([\d.,]+)\s+([\d.,]+)\s*(TL)?/i,

    // Alternatif ürün satırı deseni (ürün adı, miktar/fiyat, toplam)
    productLinePatternAlt: /(.+?)\s+(\d+)\s+([\d.,]+)\s*(TL)?/i,

    // KDV oranları ve tutarları deseni
    // Yıldız (*) veya yüzde/iki nokta üst üste ile gelebilecek KDV oranlarını/tutarlarını yakalar.
    kdvPatterns: [
     /(TOPKDV|KDV)[:\s]*[^0-9.,]*([\d\s.,]+)\s*(TL)?/i,
    ],
    // Genel Toplam desenleri
    // Genel toplam etiketi, ardından herhangi bir 'gürültü' karakteri ve sonra sayı
    // totalPatterns: [
    //    /(TOPLAM|GENEL TOPLAM|ÖDENECEK|KDV DAHİL TOPLAM|TOTAL)\s*[^0-9.,]*([\d.,]+)\s*(TL)?/i,
    // ],
    totalPatterns: [
        // Genel toplam etiketi, ardından herhangi bir 'gürültü' karakteri ve sonra boşluklu sayıları yakala
        /(TOPLAM |GENEL TOPLAM|ÖDENECEK|KDV DAHİL TOPLAM|TOTAL|SATIS TU|SATIŞ TU)\s*.*([\d\s.,]+)\s*(TL)?/i,
    ],

    // Fiş tipi kategorize etme deseni
    // Kelimeyi yakalar, ardından gelebilecek özel karakterleri ve KDV oranını atlar
    transactionTypePatterns: [
        /(YİYECEK|YEMEK|PARK|YAKIT|BENZİN|KIRTASİYE|SAĞLIK|TEMİZLİK)\s*[^0-9\s]*(\d{1,3})?/i, 
    ],

    // Firma adı göstergeleri - firma adı ile aynı satırda veya yakın satırlarda bulunabilirler
    businessNameIndicators: [
        /\b(?:A\.Ş\.|AŞ)\b/i,
        /\b(?:LTD\. ŞTİ\.|LTD ŞTİ|LTDSTI|LTD\.STİ)\b/i,
        /\b(?:TİC\.|TİC|TİC\.\s*A\.Ş\.|TİC\.\s*LTD\.\s*ŞTİ\.)\b/i,
        /\bŞTİ\.\b/i,
        /\bKOLL\. ŞTİ\.\b/i, // Kollektif Şirketi
        /\bVE TİC\.\b/i,
        /\b(ANONİM|LİMİTED)\b/i, // ANONİM veya LİMİTED kelimelerini de gösterge olarak ekleyelim
        /\bGIDA\b/i, // Gıda, Tekstil gibi sektör kelimeleri de ipucu olabilir
        /\bTARIM\b/i,
        /\bSAN\b/i, // SANAYİ
        /\bTİCARET\b/i,
        /\bDAĞITIM\b/i,
        /\bHİZMETLERİ\b/i,
        /\bYATIRIM\b/i,
        /\bİTHALAT\b/i,
        /\bİHRACAT\b/i,
        /\bSANAYİ\b/i, // Tam kelimeyi de ekleyelim
        /\bA\s*Ş\b/i, // A Ş
        /\bLTD\s*ŞTİ\b/i, // LTD ŞTİ
    ],
    // Firma adının başlangıcı için genel bir desen: Genellikle büyük harfli, sayılar içermeyen, uzun metin.
    // Birden fazla kelimeyi yakalar.
    businessNameStartPattern: /^(?:[A-ZÇĞİİÖÖŞŞÜÜ0-9\s.,&%@#*-]+?)(?:\s+(?:A\.Ş\.|AŞ|LTD\. ŞTİ\.|LTD ŞTİ|LTDSTI|LTD\.STİ|TİC\.|TİC|ŞTİ\.|KOLL\. ŞTİ\.|VE TİC\.|ANONİM|LİMİTED|GIDA|TARIM|SAN|TİCARET|DAĞITIM|HİZMETLERİ|YATIRIM|İTHALAT|İHRACAT))?/i,

    // Adres göstergeleri (firma adından sonra geldiğini varsayıyoruz)
    addressIndicators: [
        /\b(?:MAH\.|CADDESİ|SOKAK|BULVARI|SK\.|NO:|APT\.|DAİRE|KAPI NO:|CAD\.)\b/i,
        /\b(?:İLÇE|İL|SEMTSİ|KÖYÜ)\b/i,
        /\b(?:İSTANBUL|ANKARA|İZMİR|ADANA|BURSA|ANTALYA|TR|TÜRKİYE)\b/i, // Şehirler ve ülke kodu
        /\bPOSTA KODU\b/i,
        /\b(?:VERGİ DAİRESİ|VD|V\.D\.)\b/i, // Vergi dairesi bazen adresle birlikte gelir
    ],

    // VKN desenini de ayrı bir regexp olarak tutalım, hem tanımak hem çıkarmak için
    vknPattern: /(?:VKN|VERGİ NO|VERGİ KİMLİK NO)[:\s]*(\d{10,11})\b/i,

    // Yeni: Ödeme tipi desenleri
    paymentTypePatterns: [
        // Kredi kartı ifadeleri
        /(KREDİ KARTI|KREDI KARTI|K.KARTI|KART|CREDIT CARD|VISA|MASTERCARD|MC|VPOS|POS)/i,
        // Nakit ödeme ifadeleri
        /(NAKİT|NAKIT|PEŞİN|PESIN|CASH)/i
    ]
};